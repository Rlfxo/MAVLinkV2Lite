/**
 * MAVLink V2 Message Encoder
 *
 * Encodes MAVLink messages into wire format (binary frames).
 * Supports encoding generic messages and specific message types like HEARTBEAT.
 */

import { crc16Calculate, crc16Accumulate } from './crc16';
import {
  MAVLINK_STX_V2,
  MAVLINK_MSG_ID_HEARTBEAT,
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAVLINK_MSG_ID_SENSOR_DATA,
  MAVLINK_MSG_ID_CHARGER_COMMAND,
  MAVLINK_MSG_ID_COMMAND_ACK,
  MAVLINK_MSG_ID_CONFIG_REQUEST,
  MAVLINK_MSG_ID_CONFIG_RESPONSE,
  MAVLINK_MSG_ID_EVCC_STATUS,
  MAVLINK_MSG_ID_EVCC_CHARGING_AC,
  MAVLINK_MSG_ID_EVCC_CHARGING_DC,
  MAVLINK_MSG_ID_EVCC_COMMAND,
  MAVLINK_MSG_ID_EVCC_EV_PARAMS,
  MAVLINK_MSG_ID_EVCC_COMMAND_ACK,
  MAVLINK_MSG_ID_EVCC_CONFIG_REQUEST,
  MAVLINK_MSG_ID_EVCC_CONFIG_RESPONSE,
  getCrcExtra,
  MAV_STATE,
  MAVLINK_VERSION
} from './constants';
import {
  HeartbeatPayload, ChargerStatusPayload, SensorDataPayload,
  ChargerCommandPayload, CommandAckPayload, ConfigResponsePayload,
  EvccStatusPayload, EvccChargingAcPayload, EvccChargingDcPayload,
  EvccCommandPayload, EvccEvParamsPayload, EvccCommandAckPayload,
  EvccConfigResponsePayload
} from './types';

/**
 * Encode a generic MAVLink V2 message
 *
 * Creates a complete MAVLink V2 frame with proper header, payload, and CRC.
 *
 * @param sysid - System ID (sender)
 * @param compid - Component ID (sender)
 * @param seq - Sequence number (0-255, wraps around)
 * @param msgid - Message ID (0-16777215, 24-bit)
 * @param payload - Message payload (0-255 bytes)
 * @returns Complete MAVLink frame as Uint8Array
 *
 * @example
 * ```typescript
 * const payload = new Uint8Array([0x01, 0x02, 0x03]);
 * const frame = encodeMavlink(1, 0, 0, 12345, payload);
 * serialPort.write(frame);
 * ```
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

  // Calculate frame size: STX(1) + Header(9) + Payload(n) + CRC(2)
  const frameLen = 1 + 9 + payloadLen + 2;
  const frame = new Uint8Array(frameLen);

  let offset = 0;

  // STX (start-of-frame marker)
  frame[offset++] = MAVLINK_STX_V2;

  // Header (9 bytes)
  frame[offset++] = payloadLen;           // LEN
  frame[offset++] = 0;                    // INC_FLAGS (incompatibility flags)
  frame[offset++] = 0;                    // CMP_FLAGS (compatibility flags)
  frame[offset++] = seq & 0xFF;           // SEQ
  frame[offset++] = sysid & 0xFF;         // SYS_ID
  frame[offset++] = compid & 0xFF;        // COMP_ID
  frame[offset++] = msgid & 0xFF;         // MSG_ID low byte
  frame[offset++] = (msgid >> 8) & 0xFF;  // MSG_ID mid byte
  frame[offset++] = (msgid >> 16) & 0xFF; // MSG_ID high byte

  // Payload
  frame.set(payload, offset);
  offset += payloadLen;

  // Calculate CRC (from LEN to end of payload)
  // CRC calculation starts at byte 1 (LEN), excludes STX
  const crcData = frame.subarray(1, offset);
  let crc = crc16Calculate(crcData);

  // Accumulate CRC extra byte
  const crcExtra = getCrcExtra(msgid);
  crc = crc16Accumulate(crc, crcExtra);

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
 * Helper: Create PC HEARTBEAT message
 *
 * @param seq - Sequence number
 * @param sysid - System ID (default: 255 for PC)
 * @param compid - Component ID (default: 0 for main)
 * @returns Complete HEARTBEAT frame
 */
export function createPcHeartbeat(seq: number, sysid: number = 255, compid: number = 0): Uint8Array {
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
 * @param compid - Component ID (default: 0)
 * @param systemStatus - System status (default: RUN)
 * @returns Complete HEARTBEAT frame
 */
export function createChargerHeartbeat(
  seq: number,
  sysid: number = 1,
  compid: number = 0,
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

// ============================================================================
// EVCC (PLC Modem) Messages
// ============================================================================

// ---- EVCC_STATUS (20001, 16 bytes) ----

export function decodeEvccStatusPayload(payload: Uint8Array): EvccStatusPayload {
  if (payload.length < 16) {
    throw new Error(`Invalid EVCC_STATUS payload length: ${payload.length} (expected 16)`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    evccStep: payload[0],
    evccState: payload[1],
    chargeMode: payload[2],
    cpState: payload[3],
    cpDuty: payload[4],
    cpPwmValid: payload[5],
    cpVoltageMv: dv.getUint16(6, true),
    slacState: payload[8],
    slacResult: payload[9],
    slacRetryCnt: payload[10],
    sdpState: payload[11],
    v2gState: payload[12],
    v2gProtocol: payload[13],
    sessionResumable: payload[14],
    reserved: payload[15],
  };
}

// ---- EVCC_CHARGING_AC (20002, 14 bytes) ----

export function decodeEvccChargingAcPayload(payload: Uint8Array): EvccChargingAcPayload {
  if (payload.length < 14) {
    throw new Error(`Invalid EVCC_CHARGING_AC payload length: ${payload.length} (expected 14)`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    evseMaxCurrentA: dv.getInt16(0, true),
    evseNominalVoltageV: dv.getInt16(2, true),
    evseMaxPowerW: dv.getInt32(4, true),
    evMaxCurrentA: dv.getInt16(8, true),
    evMaxVoltageV: dv.getInt16(10, true),
    chargingComplete: payload[12],
    reserved: payload[13],
  };
}

// ---- EVCC_CHARGING_DC (20003, 28 bytes) ----

export function decodeEvccChargingDcPayload(payload: Uint8Array): EvccChargingDcPayload {
  if (payload.length < 28) {
    throw new Error(`Invalid EVCC_CHARGING_DC payload length: ${payload.length} (expected 28)`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    evSoc: payload[0],
    evReady: payload[1],
    evTargetVoltageV: dv.getInt16(2, true),
    evTargetCurrentA: dv.getInt16(4, true),
    evsePresentVoltageV: dv.getInt16(6, true),
    evsePresentCurrentA: dv.getInt16(8, true),
    evseMaxVoltageV: dv.getInt16(10, true),
    evseMaxCurrentA: dv.getInt16(12, true),
    evseMaxPowerW: dv.getInt32(14, true),
    evEnergyCapacityWh: dv.getInt32(18, true),
    chargingComplete: payload[22],
    evseIsolationStatus: payload[23],
    evseStatusCode: payload[24],
    reserved: payload[25],
  };
}

// ---- EVCC_COMMAND (20100, 2 bytes) ----

function encodeEvccCommandPayload(params: EvccCommandPayload): Uint8Array {
  const payload = new Uint8Array(2);
  payload[0] = params.command & 0xFF;
  payload[1] = params.param & 0xFF;
  return payload;
}

export function encodeEvccCommand(params: {
  sysid: number;
  compid: number;
  seq: number;
} & EvccCommandPayload): Uint8Array {
  const payload = encodeEvccCommandPayload({
    command: params.command,
    param: params.param,
  });
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_EVCC_COMMAND, payload);
}

export function decodeEvccCommandPayload(payload: Uint8Array): EvccCommandPayload {
  if (payload.length < 2) {
    throw new Error(`Invalid EVCC_COMMAND payload length: ${payload.length} (expected 2)`);
  }
  return { command: payload[0], param: payload[1] };
}

// ---- EVCC_EV_PARAMS (20101, 16 bytes) ----

function encodeEvccEvParamsPayload(params: EvccEvParamsPayload): Uint8Array {
  const payload = new Uint8Array(16);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  payload[0] = params.evReady & 0xFF;
  payload[1] = params.evSoc & 0xFF;
  dv.setInt16(2, params.evMaxVoltageV, true);
  dv.setInt16(4, params.evMaxCurrentA, true);
  dv.setInt32(6, params.evMaxPowerW, true);
  dv.setInt16(10, params.evTargetVoltageV, true);
  dv.setInt16(12, params.evTargetCurrentA, true);
  return payload;
}

export function encodeEvccEvParams(params: {
  sysid: number;
  compid: number;
  seq: number;
} & EvccEvParamsPayload): Uint8Array {
  const payload = encodeEvccEvParamsPayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_EVCC_EV_PARAMS, payload);
}

// ---- EVCC COMMAND_ACK (20102, 3 bytes) ----

export function decodeEvccCommandAckPayload(payload: Uint8Array): EvccCommandAckPayload {
  if (payload.length < 3) {
    throw new Error(`Invalid EVCC_COMMAND_ACK payload length: ${payload.length} (expected 3)`);
  }
  return { command: payload[0], result: payload[1], reserved: payload[2] };
}

// ---- EVCC CONFIG_REQUEST (20200, 0 bytes) ----

export function encodeEvccConfigRequest(params: {
  sysid: number;
  compid: number;
  seq: number;
}): Uint8Array {
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_EVCC_CONFIG_REQUEST, new Uint8Array(0));
}

// ---- EVCC CONFIG_RESPONSE (20201, 36 bytes) ----

export function decodeEvccConfigResponsePayload(payload: Uint8Array): EvccConfigResponsePayload {
  if (payload.length < 38) {
    throw new Error(`Invalid EVCC_CONFIG_RESPONSE payload length: ${payload.length} (expected 38)`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    fwVersionMajor: payload[0],
    fwVersionMinor: payload[1],
    fwVersionPatch: payload[2],
    chargeMode: payload[3],
    fwBuildYear: dv.getUint16(4, true),
    fwBuildMonth: payload[6],
    fwBuildDay: payload[7],
    macAddress: payload.slice(8, 14),
    evseMac: payload.slice(14, 20),
    seccIp: payload.slice(20, 36),
    seccPort: dv.getUint16(36, true),
  };
}
