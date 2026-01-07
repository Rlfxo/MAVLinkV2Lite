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
  getCrcExtra,
  MAV_TYPE,
  MAV_AUTOPILOT,
  MAV_STATE,
  MAVLINK_VERSION
} from './constants';
import { HeartbeatPayload } from './types';

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
 * Payload structure: <I5B (little-endian: uint32_t + 5x uint8_t)
 *
 * @param params - HEARTBEAT payload parameters
 * @returns Serialized payload (9 bytes)
 */
function encodeHeartbeatPayload(params: HeartbeatPayload): Uint8Array {
  const payload = new Uint8Array(9);
  const view = new DataView(payload.buffer);

  let offset = 0;

  // custom_mode (uint32_t, little-endian)
  view.setUint32(offset, params.customMode, true);
  offset += 4;

  // type (uint8_t)
  view.setUint8(offset++, params.type);

  // autopilot (uint8_t)
  view.setUint8(offset++, params.autopilot);

  // base_mode (uint8_t)
  view.setUint8(offset++, params.baseMode);

  // system_status (uint8_t)
  view.setUint8(offset++, params.systemStatus);

  // mavlink_version (uint8_t)
  view.setUint8(offset++, params.mavlinkVersion);

  return payload;
}

/**
 * Encode HEARTBEAT message
 *
 * Creates a complete HEARTBEAT message frame.
 * HEARTBEAT is sent at 1Hz to indicate system presence and status.
 *
 * @param params - HEARTBEAT message parameters
 * @returns Complete MAVLink HEARTBEAT frame
 *
 * @example
 * ```typescript
 * // PC sending heartbeat to charger
 * const frame = encodeHeartbeat({
 *   sysid: 255,              // PC system ID
 *   compid: 0,               // Main component
 *   seq: txSeq++,            // Increment sequence
 *   type: MAV_TYPE.GCS,
 *   systemStatus: MAV_STATE.ACTIVE,
 *   mavlinkVersion: MAVLINK_VERSION
 * });
 * serialPort.write(frame);
 * ```
 */
export function encodeHeartbeat(params: {
  sysid: number;
  compid: number;
  seq: number;
  customMode?: number;
  type: number;
  autopilot?: number;
  baseMode?: number;
  systemStatus: number;
  mavlinkVersion: number;
}): Uint8Array {
  // Build payload
  const payload = encodeHeartbeatPayload({
    customMode: params.customMode ?? 0,
    type: params.type,
    autopilot: params.autopilot ?? MAV_AUTOPILOT.GENERIC,
    baseMode: params.baseMode ?? 0,
    systemStatus: params.systemStatus,
    mavlinkVersion: params.mavlinkVersion,
  });

  // Encode complete message
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
 * @param payload - Raw payload bytes (must be 9 bytes)
 * @returns Parsed HEARTBEAT payload
 * @throws Error if payload length is incorrect
 *
 * @example
 * ```typescript
 * const message = parser.parseByte(byte);
 * if (message && message.msgid === MAVLINK_MSG_ID_HEARTBEAT) {
 *   const heartbeat = decodeHeartbeatPayload(message.payload);
 *   console.log('System status:', heartbeat.systemStatus);
 * }
 * ```
 */
export function decodeHeartbeatPayload(payload: Uint8Array): HeartbeatPayload {
  if (payload.length !== 9) {
    throw new Error(`Invalid HEARTBEAT payload length: ${payload.length} (expected 9)`);
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;

  return {
    customMode: view.getUint32(offset, true), // little-endian
    type: view.getUint8(offset += 4),
    autopilot: view.getUint8(offset += 1),
    baseMode: view.getUint8(offset += 1),
    systemStatus: view.getUint8(offset += 1),
    mavlinkVersion: view.getUint8(offset += 1),
  };
}

/**
 * Helper: Create PC HEARTBEAT message
 *
 * Convenience function to create a HEARTBEAT from PC (Ground Control Station).
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
    type: MAV_TYPE.GCS,
    systemStatus: MAV_STATE.ACTIVE,
    mavlinkVersion: MAVLINK_VERSION,
  });
}

/**
 * Helper: Create Charger HEARTBEAT message
 *
 * Convenience function to create a HEARTBEAT from DC Charger.
 *
 * @param seq - Sequence number
 * @param sysid - System ID (default: 1 for charger)
 * @param compid - Component ID (default: 0 for main)
 * @param systemStatus - System status (default: ACTIVE)
 * @returns Complete HEARTBEAT frame
 */
export function createChargerHeartbeat(
  seq: number,
  sysid: number = 1,
  compid: number = 0,
  systemStatus: number = MAV_STATE.ACTIVE
): Uint8Array {
  return encodeHeartbeat({
    sysid,
    compid,
    seq,
    type: MAV_TYPE.CHARGING_STATION,
    systemStatus,
    mavlinkVersion: MAVLINK_VERSION,
  });
}
