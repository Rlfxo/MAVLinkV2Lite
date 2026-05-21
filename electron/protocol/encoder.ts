/**
 * MAVLink V2 Lite Message Encoder
 *
 * Encodes MAVLink V2 Lite messages into wire format (binary frames).
 */

import { crc16Calculate } from './crc16';
import {
  MAVLINK_STX_V2_Lite,
  MAVLINK_MSG_ID_HEARTBEAT,
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAVLINK_MSG_ID_SENSOR_DATA,
  MAVLINK_MSG_ID_CHARGER_COMMAND,
  MAVLINK_MSG_ID_COMMAND_ACK,
  MAVLINK_MSG_ID_CONFIG_REQUEST,
  MAVLINK_MSG_ID_CONFIG_RESPONSE,
  SYSID_CHARGER,
  SYSID_APP_TESTER,
  COMPID_ALL,
  MAV_STATE,
  MAVLINK_VERSION
} from './constants';
import {
  HeartbeatPayload, ChargerStatusPayload, SensorDataPayload,
  ChargerCommandPayload, CommandAckPayload, ConfigResponsePayload,
} from './types';

/**
 * Encode a generic MAVLink V2 Lite message
 *
 * Creates a complete MAVLink V2 Lite frame with proper header, payload, and CRC.
 *
 * @param sysid - System ID (sender)
 * @param compid - Component ID (sender)
 * @param seq - Sequence number (0-255, wraps around)
 * @param msgid - Message ID (0-16777215, 24-bit)
 * @param payload - Message payload (0-255 bytes)
 * @returns Complete MAVLink V2 Lite frame as Uint8Array
 */
export function encodeMavlink(
  sysid: number,
  compid: number,
  seq: number,
  msgid: number,
  payload: Uint8Array
): Uint8Array {
  const payloadLen = payload.length;

  if (payloadLen > 255) {
    throw new Error(`Payload too large: ${payloadLen} bytes (max 255)`);
  }

  // Calculate frame size: STX(1) + Header(7) + Payload(n) + CRC(2)
  const frameLen = 1 + 7 + payloadLen + 2;
  const frame = new Uint8Array(frameLen);

  let offset = 0;

  // STX (start-of-frame marker, V2 Lite = 0xFC)
  frame[offset++] = MAVLINK_STX_V2_Lite;

  // Header (7 bytes)
  frame[offset++] = payloadLen;           // LEN
  frame[offset++] = seq & 0xFF;           // SEQ
  frame[offset++] = sysid & 0xFF;         // SYS_ID
  frame[offset++] = compid & 0xFF;        // COMP_ID
  frame[offset++] = msgid & 0xFF;         // MSG_ID low byte
  frame[offset++] = (msgid >> 8) & 0xFF;  // MSG_ID mid byte
  frame[offset++] = (msgid >> 16) & 0xFF; // MSG_ID high byte

  // Payload
  frame.set(payload, offset);
  offset += payloadLen;

  // Calculate CRC-16/MODBUS over the payload only (no header, no extra seed).
  const crc = crc16Calculate(payload);

  // Append CRC (little-endian, 2 bytes)
  frame[offset++] = crc & 0xFF;        // CRC low byte
  frame[offset++] = (crc >> 8) & 0xFF; // CRC high byte

  return frame;
}

/**
 * Encode HEARTBEAT message payload
 *
 * Serializes HEARTBEAT payload into binary format.
 * Payload: system_status(1) + mavlink_version(1) = 2 bytes
 *
 * @param params - HEARTBEAT payload parameters
 * @returns Serialized payload (2 bytes)
 */
function encodeHeartbeatPayload(params: HeartbeatPayload): Uint8Array {
  const payload = new Uint8Array(2);
  payload[0] = params.systemStatus;
  payload[1] = params.mavlinkVersion;
  return payload;
}

/**
 * Encode HEARTBEAT message
 *
 * Creates a complete HEARTBEAT message frame.
 * HEARTBEAT is sent every 1000ms to indicate system presence and status.
 *
 * @param params - HEARTBEAT message parameters
 * @returns Complete MAVLink HEARTBEAT frame
 */
export function encodeHeartbeat(params: {
  sysid: number;
  compid: number;
  seq: number;
  systemStatus: number;
  mavlinkVersion: number;
}): Uint8Array {
  const payload = encodeHeartbeatPayload({
    systemStatus: params.systemStatus,
    mavlinkVersion: params.mavlinkVersion,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_HEARTBEAT,
    payload
  );
}

/**
 * Decode HEARTBEAT message payload
 *
 * Parses binary HEARTBEAT payload into structured data.
 *
 * @param payload - Raw payload bytes (must be 2 bytes)
 * @returns Parsed HEARTBEAT payload
 * @throws Error if payload length is incorrect
 */
export function decodeHeartbeatPayload(payload: Uint8Array): HeartbeatPayload {
  if (payload.length !== 2) {
    throw new Error(`Invalid HEARTBEAT payload length: ${payload.length} (expected 2)`);
  }

  return {
    systemStatus: payload[0],
    mavlinkVersion: payload[1],
  };
}

/**
 * Helper: Create PC-side HEARTBEAT message
 *
 * Default sender identity is the test app (SYSID_APP_TESTER=201, COMPID_ALL=0).
 *
 * @param seq - Sequence number
 * @param sysid - System ID (default: 201 for App Tester)
 * @param compid - Component ID (default: 0, ALL)
 * @returns Complete HEARTBEAT frame
 */
export function createPcHeartbeat(
  seq: number,
  sysid: number = SYSID_APP_TESTER,
  compid: number = COMPID_ALL
): Uint8Array {
  return encodeHeartbeat({
    sysid,
    compid,
    seq,
    systemStatus: MAV_STATE.RUN,
    mavlinkVersion: MAVLINK_VERSION,
  });
}

/**
 * Helper: Create Charger HEARTBEAT message
 *
 * @param seq - Sequence number
 * @param sysid - System ID (default: 1 for charger)
 * @param compid - Component ID — charger model (DURA/MOOEV/Parky), or ALL=0
 * @param systemStatus - System status (default: RUN)
 * @returns Complete HEARTBEAT frame
 */
export function createChargerHeartbeat(
  seq: number,
  sysid: number = SYSID_CHARGER,
  compid: number = COMPID_ALL,
  systemStatus: number = MAV_STATE.RUN
): Uint8Array {
  return encodeHeartbeat({
    sysid,
    compid,
    seq,
    systemStatus,
    mavlinkVersion: MAVLINK_VERSION,
  });
}

// ============================================================================
// CHARGER_STATUS (MSG_ID: 10001, 16 bytes)
// ============================================================================

/**
 * Encode CHARGER_STATUS payload (16 bytes)
 *
 * Layout:
 *   [0]    discharging   uint8
 *   [1]    recharging    uint8
 *   [2]    bmsVendor     uint8
 *   [3-4]  bmsCap        uint16 LE
 *   [5]    outCap        uint8
 *   [6]    bmsSoc        uint8
 *   [7]    diagnosis     uint8
 *   [8-11] relayBitmap   uint32 LE
 *   [12-15] uptimeSec    uint32 LE
 */
function encodeChargerStatusPayload(params: ChargerStatusPayload): Uint8Array {
  const payload = new Uint8Array(16);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  payload[0] = params.discharging & 0xFF;
  payload[1] = params.recharging & 0xFF;
  payload[2] = params.bmsVendor & 0xFF;
  dv.setUint16(3, params.bmsCap, true);
  payload[5] = params.outCap & 0xFF;
  payload[6] = params.bmsSoc & 0xFF;
  payload[7] = params.diagnosis & 0xFF;
  dv.setUint32(8, params.relayBitmap, true);
  dv.setUint32(12, params.uptimeSec, true);

  return payload;
}

/**
 * Decode CHARGER_STATUS payload (16 bytes)
 */
export function decodeChargerStatusPayload(payload: Uint8Array): ChargerStatusPayload {
  if (payload.length !== 16) {
    throw new Error(`Invalid CHARGER_STATUS payload length: ${payload.length} (expected 16)`);
  }

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    discharging: payload[0],
    recharging: payload[1],
    bmsVendor: payload[2],
    bmsCap: dv.getUint16(3, true),
    outCap: payload[5],
    bmsSoc: payload[6],
    diagnosis: payload[7],
    relayBitmap: dv.getUint32(8, true),
    uptimeSec: dv.getUint32(12, true),
  };
}

/**
 * Encode CHARGER_STATUS message (complete MAVLink frame)
 */
export function encodeChargerStatus(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ChargerStatusPayload): Uint8Array {
  const payload = encodeChargerStatusPayload({
    discharging: params.discharging,
    recharging: params.recharging,
    bmsVendor: params.bmsVendor,
    bmsCap: params.bmsCap,
    outCap: params.outCap,
    bmsSoc: params.bmsSoc,
    diagnosis: params.diagnosis,
    relayBitmap: params.relayBitmap,
    uptimeSec: params.uptimeSec,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_CHARGER_STATUS,
    payload
  );
}

// ============================================================================
// SENSOR_DATA (MSG_ID: 10002, 52 bytes)
// ============================================================================

/**
 * Encode SENSOR_DATA payload (52 bytes)
 *
 * Layout:
 *   [0-3]   temperatureC   float32 LE
 *   [4-7]   humidityPct    float32 LE
 *   [8-11]  accelXMps2     float32 LE
 *   [12-15] accelYMps2     float32 LE
 *   [16-19] accelZMps2     float32 LE
 *   [20-23] gyroXDps       float32 LE
 *   [24-27] gyroYDps       float32 LE
 *   [28-31] gyroZDps       float32 LE
 *   [32-33] dcgfFault      uint16 LE
 *   [34-35] dcgfVolt1      uint16 LE
 *   [36-37] dcgfVolt2      uint16 LE
 *   [38-41] meterVoltage   uint32 LE
 *   [42-45] meterCurrent   uint32 LE
 *   [46-49] meterEnergy    uint32 LE
 *   [50]    imdStopMode    uint8
 *   [51]    reserved       uint8
 */
function encodeSensorDataPayload(params: SensorDataPayload): Uint8Array {
  const payload = new Uint8Array(52);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  dv.setFloat32(0, params.temperatureC, true);
  dv.setFloat32(4, params.humidityPct, true);
  dv.setFloat32(8, params.accelXMps2, true);
  dv.setFloat32(12, params.accelYMps2, true);
  dv.setFloat32(16, params.accelZMps2, true);
  dv.setFloat32(20, params.gyroXDps, true);
  dv.setFloat32(24, params.gyroYDps, true);
  dv.setFloat32(28, params.gyroZDps, true);
  dv.setUint16(32, params.dcgfFault, true);
  dv.setUint16(34, params.dcgfVolt1, true);
  dv.setUint16(36, params.dcgfVolt2, true);
  dv.setUint32(38, params.meterVoltage, true);
  dv.setUint32(42, params.meterCurrent, true);
  dv.setUint32(46, params.meterEnergy, true);
  payload[50] = params.imdStopMode & 0xFF;
  payload[51] = params.reserved & 0xFF;

  return payload;
}

/**
 * Decode SENSOR_DATA payload (52 bytes)
 */
export function decodeSensorDataPayload(payload: Uint8Array): SensorDataPayload {
  if (payload.length !== 52) {
    throw new Error(`Invalid SENSOR_DATA payload length: ${payload.length} (expected 52)`);
  }

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    temperatureC: dv.getFloat32(0, true),
    humidityPct: dv.getFloat32(4, true),
    accelXMps2: dv.getFloat32(8, true),
    accelYMps2: dv.getFloat32(12, true),
    accelZMps2: dv.getFloat32(16, true),
    gyroXDps: dv.getFloat32(20, true),
    gyroYDps: dv.getFloat32(24, true),
    gyroZDps: dv.getFloat32(28, true),
    dcgfFault: dv.getUint16(32, true),
    dcgfVolt1: dv.getUint16(34, true),
    dcgfVolt2: dv.getUint16(36, true),
    meterVoltage: dv.getUint32(38, true),
    meterCurrent: dv.getUint32(42, true),
    meterEnergy: dv.getUint32(46, true),
    imdStopMode: payload[50],
    reserved: payload[51],
  };
}

/**
 * Encode SENSOR_DATA message (complete MAVLink frame)
 */
export function encodeSensorData(params: {
  sysid: number;
  compid: number;
  seq: number;
} & SensorDataPayload): Uint8Array {
  const payload = encodeSensorDataPayload({
    temperatureC: params.temperatureC,
    humidityPct: params.humidityPct,
    accelXMps2: params.accelXMps2,
    accelYMps2: params.accelYMps2,
    accelZMps2: params.accelZMps2,
    gyroXDps: params.gyroXDps,
    gyroYDps: params.gyroYDps,
    gyroZDps: params.gyroZDps,
    dcgfFault: params.dcgfFault,
    dcgfVolt1: params.dcgfVolt1,
    dcgfVolt2: params.dcgfVolt2,
    meterVoltage: params.meterVoltage,
    meterCurrent: params.meterCurrent,
    meterEnergy: params.meterEnergy,
    imdStopMode: params.imdStopMode,
    reserved: params.reserved,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_SENSOR_DATA,
    payload
  );
}

// ============================================================================
// CHARGER_COMMAND (MSG_ID: 10100, 3 bytes)
// ============================================================================

/**
 * Encode CHARGER_COMMAND payload (3 bytes)
 *
 * Layout:
 *   [0-1]  maxPowerKw  uint16 LE
 *   [2]    command      uint8
 */
function encodeChargerCommandPayload(params: ChargerCommandPayload): Uint8Array {
  const payload = new Uint8Array(3);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  dv.setUint16(0, params.maxPowerKw, true);
  payload[2] = params.command & 0xFF;

  return payload;
}

/**
 * Decode CHARGER_COMMAND payload (3 bytes)
 */
export function decodeChargerCommandPayload(payload: Uint8Array): ChargerCommandPayload {
  if (payload.length !== 3) {
    throw new Error(`Invalid CHARGER_COMMAND payload length: ${payload.length} (expected 3)`);
  }

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    maxPowerKw: dv.getUint16(0, true),
    command: payload[2],
  };
}

/**
 * Encode CHARGER_COMMAND message (complete MAVLink frame)
 */
export function encodeChargerCommand(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ChargerCommandPayload): Uint8Array {
  const payload = encodeChargerCommandPayload({
    maxPowerKw: params.maxPowerKw,
    command: params.command,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_CHARGER_COMMAND,
    payload
  );
}

// ============================================================================
// COMMAND_ACK (MSG_ID: 10102, 3 bytes)
// ============================================================================

/**
 * Encode COMMAND_ACK payload (3 bytes)
 *
 * Layout:
 *   [0-1]  targetMsgId  uint16 LE
 *   [2]    result       uint8
 */
function encodeCommandAckPayload(params: CommandAckPayload): Uint8Array {
  const payload = new Uint8Array(3);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  dv.setUint16(0, params.targetMsgId, true);
  payload[2] = params.result & 0xFF;

  return payload;
}

/**
 * Decode COMMAND_ACK payload (3 bytes)
 */
export function decodeCommandAckPayload(payload: Uint8Array): CommandAckPayload {
  if (payload.length !== 3) {
    throw new Error(`Invalid COMMAND_ACK payload length: ${payload.length} (expected 3)`);
  }

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetMsgId: dv.getUint16(0, true),
    result: payload[2],
  };
}

/**
 * Encode COMMAND_ACK message (complete MAVLink frame)
 */
export function encodeCommandAck(params: {
  sysid: number;
  compid: number;
  seq: number;
} & CommandAckPayload): Uint8Array {
  const payload = encodeCommandAckPayload({
    targetMsgId: params.targetMsgId,
    result: params.result,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_COMMAND_ACK,
    payload
  );
}

// ============================================================================
// CONFIG_REQUEST (MSG_ID: 10200, 0 bytes payload)
// ============================================================================

/**
 * Encode CONFIG_REQUEST message (complete MAVLink frame, 0B payload)
 */
export function encodeConfigRequest(params: {
  sysid: number;
  compid: number;
  seq: number;
}): Uint8Array {
  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_CONFIG_REQUEST,
    new Uint8Array(0)
  );
}

// ============================================================================
// CONFIG_RESPONSE (MSG_ID: 10201, 36 bytes)
// ============================================================================

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

/**
 * Encode CONFIG_RESPONSE payload (36 bytes)
 *
 * Layout:
 *   [0-3]   fw_version   uint32 LE
 *   [4-7]   hw_version   uint32 LE
 *   [8-23]  model_name   char[16] null-terminated
 *   [24-35] build_date   char[12]
 */
function encodeConfigResponsePayload(params: ConfigResponsePayload): Uint8Array {
  const payload = new Uint8Array(36);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  dv.setUint32(0, params.fwVersion, true);
  dv.setUint32(4, params.hwVersion, true);

  // model_name: char[16] null-terminated
  const nameBytes = TEXT_ENCODER.encode(params.modelName);
  const nameLen = Math.min(nameBytes.length, 15); // leave room for null
  payload.set(nameBytes.subarray(0, nameLen), 8);
  // remaining bytes are already 0 (null-terminated)

  // build_date: char[12]
  const dateBytes = TEXT_ENCODER.encode(params.buildDate);
  const dateLen = Math.min(dateBytes.length, 12);
  payload.set(dateBytes.subarray(0, dateLen), 24);

  return payload;
}

/**
 * Decode CONFIG_RESPONSE payload (36 bytes)
 */
export function decodeConfigResponsePayload(payload: Uint8Array): ConfigResponsePayload {
  if (payload.length !== 36) {
    throw new Error(`Invalid CONFIG_RESPONSE payload length: ${payload.length} (expected 36)`);
  }

  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  // model_name: trim at first null byte
  const nameSlice = payload.subarray(8, 24);
  let nameEnd = nameSlice.indexOf(0);
  if (nameEnd === -1) nameEnd = 16;
  const modelName = TEXT_DECODER.decode(nameSlice.subarray(0, nameEnd));

  // build_date: trim at first null byte
  const dateSlice = payload.subarray(24, 36);
  let dateEnd = dateSlice.indexOf(0);
  if (dateEnd === -1) dateEnd = 12;
  const buildDate = TEXT_DECODER.decode(dateSlice.subarray(0, dateEnd));

  return {
    fwVersion: dv.getUint32(0, true),
    hwVersion: dv.getUint32(4, true),
    modelName,
    buildDate,
  };
}

/**
 * Encode CONFIG_RESPONSE message (complete MAVLink frame)
 */
export function encodeConfigResponse(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ConfigResponsePayload): Uint8Array {
  const payload = encodeConfigResponsePayload({
    fwVersion: params.fwVersion,
    hwVersion: params.hwVersion,
    modelName: params.modelName,
    buildDate: params.buildDate,
  });

  return encodeMavlink(
    params.sysid,
    params.compid,
    params.seq,
    MAVLINK_MSG_ID_CONFIG_RESPONSE,
    payload
  );
}

