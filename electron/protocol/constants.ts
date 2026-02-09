/**
 * MAVLink V2 Protocol Constants
 *
 * This file defines all constants used in the MAVLink V2 Lite protocol
 * for DC Charger communication.
 */

// ============================================================================
// MAVLink V2 Frame Structure Constants
// ============================================================================

/**
 * MAVLink V2 Start-of-frame marker (STX)
 * Every MAVLink V2 frame starts with this byte
 */
export const MAVLINK_STX_V2 = 0xFD;

/**
 * MAVLink V2 header length (without STX and CRC)
 * Header: LEN(1) + INC_FLAGS(1) + CMP_FLAGS(1) + SEQ(1) + SYSID(1) + COMPID(1) + MSGID(3) = 9 bytes
 */
export const MAVLINK_HEADER_LEN = 9;

/**
 * MAVLink V2 checksum length (CRC-16)
 * 2 bytes in little-endian format
 */
export const MAVLINK_CHECKSUM_LEN = 2;

/**
 * Maximum payload length in MAVLink V2
 * Payload can be 0-255 bytes
 */
export const MAVLINK_MAX_PAYLOAD_LEN = 255;

/**
 * Maximum complete frame length
 * STX(1) + HEADER(9) + PAYLOAD(255) + CRC(2) = 267 bytes
 */
export const MAVLINK_MAX_FRAME_LEN = 1 + MAVLINK_HEADER_LEN + MAVLINK_MAX_PAYLOAD_LEN + MAVLINK_CHECKSUM_LEN;

/**
 * Minimum frame length (frame with empty payload)
 * STX(1) + HEADER(9) + PAYLOAD(0) + CRC(2) = 12 bytes
 */
export const MAVLINK_MIN_FRAME_LEN = 1 + MAVLINK_HEADER_LEN + MAVLINK_CHECKSUM_LEN;

// ============================================================================
// MAVLink Message IDs
// ============================================================================

/**
 * HEARTBEAT message (standard MAVLink)
 * Sent at 1Hz by both PC and DC Charger
 * Used for connection monitoring and system status
 */
export const MAVLINK_MSG_ID_HEARTBEAT = 0;

/**
 * CHARGER_STATUS message (custom, 10001)
 * Sent by DC Charger at 10Hz
 * Contains real-time charging status
 */
export const MAVLINK_MSG_ID_CHARGER_STATUS = 10001;

/**
 * SENSOR_DATA message (custom, 10002)
 * Sent by DC Charger at 2Hz
 * Contains sensor readings (temperature, etc.)
 */
export const MAVLINK_MSG_ID_SENSOR_DATA = 10002;

/**
 * CHARGER_COMMAND message (custom, 10100)
 * Sent by PC to control charging
 * Commands: start, stop, set voltage/current limits
 */
export const MAVLINK_MSG_ID_CHARGER_COMMAND = 10100;

/**
 * MANUAL_CONTROL message (custom, 10101)
 * Sent by PC for JIG/test manual control
 * Controls relays and force discharge/recharge
 */
export const MAVLINK_MSG_ID_MANUAL_CONTROL = 10101;

/**
 * CONFIG_REQUEST message (custom, 10200)
 * Sent by PC to request configuration
 */
export const MAVLINK_MSG_ID_CONFIG_REQUEST = 10200;

/**
 * CONFIG_RESPONSE message (custom, 10201)
 * Sent by DC Charger in response to CONFIG_REQUEST
 */
export const MAVLINK_MSG_ID_CONFIG_RESPONSE = 10201;

// ============================================================================
// CRC Extra Values (Message Signatures)
// ============================================================================

/**
 * CRC Extra lookup map
 *
 * Each MAVLink message has a unique CRC extra value that is calculated
 * from the message structure definition. This prevents incompatible
 * implementations from communicating.
 *
 * The CRC extra is appended to the message data before calculating
 * the final CRC checksum.
 *
 * Note: These values must match exactly with the firmware implementation.
 */
const CRC_EXTRA_MAP: Readonly<Record<number, number>> = {
  [MAVLINK_MSG_ID_HEARTBEAT]: 142,
  [MAVLINK_MSG_ID_CHARGER_STATUS]: 66,
  [MAVLINK_MSG_ID_SENSOR_DATA]: 120,
  [MAVLINK_MSG_ID_CHARGER_COMMAND]: 193,
  [MAVLINK_MSG_ID_MANUAL_CONTROL]: 239,
  [MAVLINK_MSG_ID_CONFIG_REQUEST]: 142,
  [MAVLINK_MSG_ID_CONFIG_RESPONSE]: 128,
};

/**
 * Get CRC extra value for a message ID
 *
 * @param msgid - MAVLink message ID
 * @returns CRC extra value, or 0 if message ID is unknown
 *
 * @example
 * ```typescript
 * const crcExtra = getCrcExtra(MAVLINK_MSG_ID_HEARTBEAT);  // Returns 142
 * ```
 */
export function getCrcExtra(msgid: number): number {
  return CRC_EXTRA_MAP[msgid] ?? 0;
}

// ============================================================================
// System IDs and Component IDs
// ============================================================================

/**
 * System ID for DC Charger
 */
export const SYSID_CHARGER = 1;

/**
 * System ID for PC (Ground Control Station)
 */
export const SYSID_PC = 255;

/**
 * Component ID for main component
 */
export const COMPID_MAIN = 0;

/**
 * Component ID for relay controller
 */
export const COMPID_RELAY = 1;

// ============================================================================
// MAVLink Heartbeat Constants
// ============================================================================

/**
 * MAV_STATE values (simplified for DC Charger)
 */
export enum MAV_STATE {
  UNINIT = 0,
  BOOT = 1,
  STANDBY = 2,
  RUN = 3,
  ERROR = 4,
  SHUTDOWN = 5,
}

/**
 * MAVLink version for this implementation
 */
export const MAVLINK_VERSION = 3;

// ============================================================================
// Timeouts and Intervals
// ============================================================================

/**
 * Heartbeat transmission interval (milliseconds)
 * Standard MAVLink heartbeat rate: 1Hz
 */
export const HEARTBEAT_TX_INTERVAL_MS = 1000;

/**
 * Heartbeat timeout threshold (milliseconds)
 * If no heartbeat received within this time, connection is considered lost
 */
export const HEARTBEAT_TIMEOUT_MS = 3000;

/**
 * Heartbeat timeout check interval (milliseconds)
 * How often to check if heartbeat has timed out
 */
export const HEARTBEAT_CHECK_INTERVAL_MS = 100;

// ============================================================================
// Serial Port Configuration
// ============================================================================

/**
 * Serial port baud rate for UART communication
 */
export const SERIAL_BAUD_RATE = 115200;

/**
 * Serial port data bits
 */
export const SERIAL_DATA_BITS = 8;

/**
 * Serial port parity
 */
export const SERIAL_PARITY = 'none' as const;

/**
 * Serial port stop bits
 */
export const SERIAL_STOP_BITS = 1;
