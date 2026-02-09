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
 * HEARTBEAT is sent at 1Hz to indicate system presence and status.
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
 * @param compid - Component ID (default: 1 for main)
 * @param systemStatus - System status (default: RUN)
 * @returns Complete HEARTBEAT frame
 */
export function createChargerHeartbeat(
  seq: number,
  sysid: number = 1,
  compid: number = 1,
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
