/**
 * MAVLink V2 Lite Message Encoder
 *
 * Encodes EVAR V2 Lite messages into wire format (binary frames) and
 * decodes received payloads. All multi-byte fields are little-endian.
 * CRC is CRC-16/MODBUS over the payload bytes only (see crc16.ts).
 */

import { crc16Calculate } from './crc16';
import {
  MAVLINK_STX_V2_Lite,
  MAVLINK_MSG_ID_HEARTBEAT,
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAVLINK_MSG_ID_SENSOR_DATA,
  MAVLINK_MSG_ID_METER_DATA,
  MAVLINK_MSG_ID_CHARGER_COMMAND,
  MAVLINK_MSG_ID_COMMAND_ACK,
  MAVLINK_MSG_ID_CONFIG_REQUEST,
  MAVLINK_MSG_ID_CONFIG_RESPONSE,
  SYSID_CHARGER,
  SYSID_APP_TESTER,
  COMPID_ALL,
  MAV_STATE,
  MAVLINK_VERSION,
} from './constants';
import {
  HeartbeatPayload,
  ChargerStatusPayload,
  SensorDataPayload,
  MeterDataPayload,
  ChargerCommandPayload,
  CommandAckPayload,
  ConfigRequestPayload,
  ConfigResponsePayload,
  FixedT,
} from './types';

// ============================================================================
// Generic frame encoder
// ============================================================================

/**
 * Encode a generic MAVLink V2 Lite message.
 *
 * Frame: STX(1) + LEN(1) + SEQ(1) + SYSID(1) + COMPID(1) + MSGID(3) + payload + CRC(2)
 * CRC is CRC-16/MODBUS over the payload bytes only.
 */
export function encodeMavlink(
  sysid: number,
  compid: number,
  seq: number,
  msgid: number,
  payload: Uint8Array,
): Uint8Array {
  const payloadLen = payload.length;
  if (payloadLen > 255) {
    throw new Error(`Payload too large: ${payloadLen} bytes (max 255)`);
  }

  const frameLen = 1 + 7 + payloadLen + 2;
  const frame = new Uint8Array(frameLen);

  let offset = 0;
  frame[offset++] = MAVLINK_STX_V2_Lite;
  frame[offset++] = payloadLen;
  frame[offset++] = seq & 0xFF;
  frame[offset++] = sysid & 0xFF;
  frame[offset++] = compid & 0xFF;
  frame[offset++] = msgid & 0xFF;
  frame[offset++] = (msgid >> 8) & 0xFF;
  frame[offset++] = (msgid >> 16) & 0xFF;

  frame.set(payload, offset);
  offset += payloadLen;

  const crc = crc16Calculate(payload);
  frame[offset++] = crc & 0xFF;
  frame[offset++] = (crc >> 8) & 0xFF;

  return frame;
}

// ============================================================================
// fixed_t helpers (5 B wire: int32 LE value + int8 exp)
// ============================================================================

/** Write a fixed_t at the given byte offset in `dv`. */
function writeFixedT(dv: DataView, offset: number, ft: FixedT): void {
  dv.setInt32(offset, ft.value | 0, true);
  dv.setInt8(offset + 4, ft.exp | 0);
}

/** Read a fixed_t from the given byte offset in `dv`. */
function readFixedT(dv: DataView, offset: number): FixedT {
  return {
    value: dv.getInt32(offset, true),
    exp: dv.getInt8(offset + 4),
  };
}

/**
 * Convert a fixed_t to a JS number: `value × 10^exp` (SI base unit).
 *
 * `(value=0, exp=0)` means "not measured / N/A" and returns 0.
 */
export function fixedToFloat(ft: FixedT): number {
  return ft.value * Math.pow(10, ft.exp);
}

// ============================================================================
// HEARTBEAT (MSG_ID: 0, 2 B)
// ============================================================================

function encodeHeartbeatPayload(params: HeartbeatPayload): Uint8Array {
  const payload = new Uint8Array(2);
  payload[0] = params.systemStatus & 0xFF;
  payload[1] = params.mavlinkVersion & 0xFF;
  return payload;
}

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
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_HEARTBEAT, payload);
}

export function decodeHeartbeatPayload(payload: Uint8Array): HeartbeatPayload {
  if (payload.length !== 2) {
    throw new Error(`Invalid HEARTBEAT payload length: ${payload.length} (expected 2)`);
  }
  return {
    systemStatus: payload[0],
    mavlinkVersion: payload[1],
  };
}

/** Helper: PC-side HEARTBEAT (default sender = App Tester / COMPID_ALL). */
export function createPcHeartbeat(
  seq: number,
  sysid: number = SYSID_APP_TESTER,
  compid: number = COMPID_ALL,
): Uint8Array {
  return encodeHeartbeat({
    sysid,
    compid,
    seq,
    systemStatus: MAV_STATE.RUN,
    mavlinkVersion: MAVLINK_VERSION,
  });
}

/** Helper: Charger-side HEARTBEAT (default sender = Charger / COMPID_ALL). */
export function createChargerHeartbeat(
  seq: number,
  sysid: number = SYSID_CHARGER,
  compid: number = COMPID_ALL,
  systemStatus: number = MAV_STATE.RUN,
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
// CHARGER_STATUS (MSG_ID: 10001, 10 B)
// ============================================================================
//
// Layout:
//   [0]    state         u8  (MAV_STATE)
//   [1-4]  relay_bitmap  u32 LE
//   [5-8]  uptime_sec    u32 LE
//   [9]    storage_soc   u8

const CHARGER_STATUS_LEN = 10;

function encodeChargerStatusPayload(p: ChargerStatusPayload): Uint8Array {
  const payload = new Uint8Array(CHARGER_STATUS_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  payload[0] = p.state & 0xFF;
  dv.setUint32(1, p.relayBitmap >>> 0, true);
  dv.setUint32(5, p.uptimeSec >>> 0, true);
  payload[9] = p.storageSoc & 0xFF;
  return payload;
}

export function decodeChargerStatusPayload(payload: Uint8Array): ChargerStatusPayload {
  if (payload.length !== CHARGER_STATUS_LEN) {
    throw new Error(`Invalid CHARGER_STATUS payload length: ${payload.length} (expected ${CHARGER_STATUS_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    state: payload[0],
    relayBitmap: dv.getUint32(1, true),
    uptimeSec: dv.getUint32(5, true),
    storageSoc: payload[9],
  };
}

export function encodeChargerStatus(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ChargerStatusPayload): Uint8Array {
  const payload = encodeChargerStatusPayload({
    state: params.state,
    relayBitmap: params.relayBitmap,
    uptimeSec: params.uptimeSec,
    storageSoc: params.storageSoc,
  });
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_CHARGER_STATUS, payload);
}

// ============================================================================
// SENSOR_DATA (MSG_ID: 10002, 53 B)
// ============================================================================
//
// Layout (offsets in bytes):
//   [0]    temperature.value  i32 LE       (exp at +4, i8)   — SHT3X exp=-2
//   [5]    humidity.value     i32 LE       (exp at +4, i8)   — SHT3X exp=-2
//   [10]   accel_x.value      i32 LE       (exp at +4, i8)   — LSM6DSO32 exp=-3
//   [15]   accel_y                                          ...
//   [20]   accel_z
//   [25]   gyro_x
//   [30]   gyro_y
//   [35]   gyro_z
//   [40-41] dcgf_fault        u16 LE
//   [42]   dcgf_volt1.value   i32 LE       (exp at +4, i8)   — DCGF exp=-1
//   [47]   dcgf_volt2.value   i32 LE       (exp at +4, i8)
//   [52]   imd_stop_mode      u8

const SENSOR_DATA_LEN = 53;

function encodeSensorDataPayload(p: SensorDataPayload): Uint8Array {
  const payload = new Uint8Array(SENSOR_DATA_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  writeFixedT(dv,  0, p.temperature);
  writeFixedT(dv,  5, p.humidity);
  writeFixedT(dv, 10, p.accelX);
  writeFixedT(dv, 15, p.accelY);
  writeFixedT(dv, 20, p.accelZ);
  writeFixedT(dv, 25, p.gyroX);
  writeFixedT(dv, 30, p.gyroY);
  writeFixedT(dv, 35, p.gyroZ);
  dv.setUint16(40, p.dcgfFault & 0xFFFF, true);
  writeFixedT(dv, 42, p.dcgfVolt1);
  writeFixedT(dv, 47, p.dcgfVolt2);
  payload[52] = p.imdStopMode & 0xFF;
  return payload;
}

export function decodeSensorDataPayload(payload: Uint8Array): SensorDataPayload {
  if (payload.length !== SENSOR_DATA_LEN) {
    throw new Error(`Invalid SENSOR_DATA payload length: ${payload.length} (expected ${SENSOR_DATA_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    temperature: readFixedT(dv,  0),
    humidity:    readFixedT(dv,  5),
    accelX:      readFixedT(dv, 10),
    accelY:      readFixedT(dv, 15),
    accelZ:      readFixedT(dv, 20),
    gyroX:       readFixedT(dv, 25),
    gyroY:       readFixedT(dv, 30),
    gyroZ:       readFixedT(dv, 35),
    dcgfFault:   dv.getUint16(40, true),
    dcgfVolt1:   readFixedT(dv, 42),
    dcgfVolt2:   readFixedT(dv, 47),
    imdStopMode: payload[52],
  };
}

export function encodeSensorData(params: {
  sysid: number;
  compid: number;
  seq: number;
} & SensorDataPayload): Uint8Array {
  const payload = encodeSensorDataPayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_SENSOR_DATA, payload);
}

// ============================================================================
// METER_DATA (MSG_ID: 10003, 50 B)
// ============================================================================
//
// Layout — 10 × fixed_t (5 B each):
//   [0]   total_power      fixed_t  (exp=0)
//   [5]   total_energy     fixed_t  (exp=+1)
//   [10]  meter1_voltage   fixed_t  (exp=-1)
//   [15]  meter1_current   fixed_t  (exp=-2)
//   [20]  meter1_power     fixed_t  (exp=0)
//   [25]  meter1_energy    fixed_t  (exp=+1)
//   [30]  meter2_voltage   ...  (DURA only; MOOEV: value=0, exp=0)
//   [35]  meter2_current
//   [40]  meter2_power
//   [45]  meter2_energy

const METER_DATA_LEN = 50;

function encodeMeterDataPayload(p: MeterDataPayload): Uint8Array {
  const payload = new Uint8Array(METER_DATA_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  writeFixedT(dv,  0, p.totalPower);
  writeFixedT(dv,  5, p.totalEnergy);
  writeFixedT(dv, 10, p.meter1Voltage);
  writeFixedT(dv, 15, p.meter1Current);
  writeFixedT(dv, 20, p.meter1Power);
  writeFixedT(dv, 25, p.meter1Energy);
  writeFixedT(dv, 30, p.meter2Voltage);
  writeFixedT(dv, 35, p.meter2Current);
  writeFixedT(dv, 40, p.meter2Power);
  writeFixedT(dv, 45, p.meter2Energy);
  return payload;
}

export function decodeMeterDataPayload(payload: Uint8Array): MeterDataPayload {
  if (payload.length !== METER_DATA_LEN) {
    throw new Error(`Invalid METER_DATA payload length: ${payload.length} (expected ${METER_DATA_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    totalPower:    readFixedT(dv,  0),
    totalEnergy:   readFixedT(dv,  5),
    meter1Voltage: readFixedT(dv, 10),
    meter1Current: readFixedT(dv, 15),
    meter1Power:   readFixedT(dv, 20),
    meter1Energy:  readFixedT(dv, 25),
    meter2Voltage: readFixedT(dv, 30),
    meter2Current: readFixedT(dv, 35),
    meter2Power:   readFixedT(dv, 40),
    meter2Energy:  readFixedT(dv, 45),
  };
}

export function encodeMeterData(params: {
  sysid: number;
  compid: number;
  seq: number;
} & MeterDataPayload): Uint8Array {
  const payload = encodeMeterDataPayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_METER_DATA, payload);
}

// ============================================================================
// CHARGER_COMMAND (MSG_ID: 10100, 7 B)
// ============================================================================
//
// Layout:
//   [0-3]  uuid          u32 LE
//   [4-5]  max_power_kW  u16 LE
//   [6]    command       u8

const CHARGER_COMMAND_LEN = 7;

function encodeChargerCommandPayload(p: ChargerCommandPayload): Uint8Array {
  const payload = new Uint8Array(CHARGER_COMMAND_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  dv.setUint32(0, p.uuid >>> 0, true);
  dv.setUint16(4, p.maxPowerKw & 0xFFFF, true);
  payload[6] = p.command & 0xFF;
  return payload;
}

export function decodeChargerCommandPayload(payload: Uint8Array): ChargerCommandPayload {
  if (payload.length !== CHARGER_COMMAND_LEN) {
    throw new Error(`Invalid CHARGER_COMMAND payload length: ${payload.length} (expected ${CHARGER_COMMAND_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    uuid: dv.getUint32(0, true),
    maxPowerKw: dv.getUint16(4, true),
    command: payload[6],
  };
}

export function encodeChargerCommand(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ChargerCommandPayload): Uint8Array {
  const payload = encodeChargerCommandPayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_CHARGER_COMMAND, payload);
}

// ============================================================================
// COMMAND_ACK (MSG_ID: 10102, 5 B)
// ============================================================================
//
// Layout:
//   [0-3]  uuid    u32 LE
//   [4]    result  u8

const COMMAND_ACK_LEN = 5;

function encodeCommandAckPayload(p: CommandAckPayload): Uint8Array {
  const payload = new Uint8Array(COMMAND_ACK_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  dv.setUint32(0, p.uuid >>> 0, true);
  payload[4] = p.result & 0xFF;
  return payload;
}

export function decodeCommandAckPayload(payload: Uint8Array): CommandAckPayload {
  if (payload.length !== COMMAND_ACK_LEN) {
    throw new Error(`Invalid COMMAND_ACK payload length: ${payload.length} (expected ${COMMAND_ACK_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    uuid: dv.getUint32(0, true),
    result: payload[4],
  };
}

export function encodeCommandAck(params: {
  sysid: number;
  compid: number;
  seq: number;
} & CommandAckPayload): Uint8Array {
  const payload = encodeCommandAckPayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_COMMAND_ACK, payload);
}

// ============================================================================
// CONFIG_REQUEST (MSG_ID: 10200, 4 B)
// ============================================================================
//
// Layout:
//   [0-3]  uuid  u32 LE

const CONFIG_REQUEST_LEN = 4;

function encodeConfigRequestPayload(p: ConfigRequestPayload): Uint8Array {
  const payload = new Uint8Array(CONFIG_REQUEST_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  dv.setUint32(0, p.uuid >>> 0, true);
  return payload;
}

export function decodeConfigRequestPayload(payload: Uint8Array): ConfigRequestPayload {
  if (payload.length !== CONFIG_REQUEST_LEN) {
    throw new Error(`Invalid CONFIG_REQUEST payload length: ${payload.length} (expected ${CONFIG_REQUEST_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { uuid: dv.getUint32(0, true) };
}

export function encodeConfigRequest(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ConfigRequestPayload): Uint8Array {
  const payload = encodeConfigRequestPayload({ uuid: params.uuid });
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_CONFIG_REQUEST, payload);
}

// ============================================================================
// CONFIG_RESPONSE (MSG_ID: 10201, 40 B)
// ============================================================================
//
// Layout:
//   [0-3]   uuid          u32 LE
//   [4-7]   fw_version    u32 LE  (0x00 MAJOR MINOR PATCH)
//   [8-11]  hw_version    u32 LE
//   [12-27] model_name    char[16] null-terminated
//   [28-39] build_date    char[12] (YYYYMMDDHHMM)

const CONFIG_RESPONSE_LEN = 40;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

function encodeConfigResponsePayload(p: ConfigResponsePayload): Uint8Array {
  const payload = new Uint8Array(CONFIG_RESPONSE_LEN);
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  dv.setUint32(0, p.uuid >>> 0, true);
  dv.setUint32(4, p.fwVersion >>> 0, true);
  dv.setUint32(8, p.hwVersion >>> 0, true);

  // model_name: char[16] null-terminated (leave room for terminator)
  const nameBytes = TEXT_ENCODER.encode(p.modelName);
  const nameLen = Math.min(nameBytes.length, 15);
  payload.set(nameBytes.subarray(0, nameLen), 12);

  // build_date: char[12] (no terminator required)
  const dateBytes = TEXT_ENCODER.encode(p.buildDate);
  const dateLen = Math.min(dateBytes.length, 12);
  payload.set(dateBytes.subarray(0, dateLen), 28);

  return payload;
}

export function decodeConfigResponsePayload(payload: Uint8Array): ConfigResponsePayload {
  if (payload.length !== CONFIG_RESPONSE_LEN) {
    throw new Error(`Invalid CONFIG_RESPONSE payload length: ${payload.length} (expected ${CONFIG_RESPONSE_LEN})`);
  }
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  const nameSlice = payload.subarray(12, 28);
  let nameEnd = nameSlice.indexOf(0);
  if (nameEnd === -1) nameEnd = 16;
  const modelName = TEXT_DECODER.decode(nameSlice.subarray(0, nameEnd));

  const dateSlice = payload.subarray(28, 40);
  let dateEnd = dateSlice.indexOf(0);
  if (dateEnd === -1) dateEnd = 12;
  const buildDate = TEXT_DECODER.decode(dateSlice.subarray(0, dateEnd));

  return {
    uuid: dv.getUint32(0, true),
    fwVersion: dv.getUint32(4, true),
    hwVersion: dv.getUint32(8, true),
    modelName,
    buildDate,
  };
}

export function encodeConfigResponse(params: {
  sysid: number;
  compid: number;
  seq: number;
} & ConfigResponsePayload): Uint8Array {
  const payload = encodeConfigResponsePayload(params);
  return encodeMavlink(params.sysid, params.compid, params.seq, MAVLINK_MSG_ID_CONFIG_RESPONSE, payload);
}
