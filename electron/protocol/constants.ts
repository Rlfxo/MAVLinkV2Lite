/**
 * MAVLink V2 Protocol Constants
 *
 * This file defines all constants used in the MAVLink V2 Lite protocol
 * for DC Charger communication.
 */

// ============================================================================
// MAVLink V2 Lite Frame Structure Constants
// ============================================================================

/**
 * MAVLink V2 Lite Start-of-frame marker (STX)
 * Distinct from upstream MAVLink V2 (0xFD) by 1 bit to identify this dialect.
 */
export const MAVLINK_STX_V2_Lite = 0xFC;

/**
 * MAVLink V2 Lite header length (without STX and CRC)
 * Header: LEN(1) + SEQ(1) + SYSID(1) + COMPID(1) + MSGID(3) = 7 bytes
 * (INCOMPAT_FLAGS / COMPAT_FLAGS bytes from upstream V2 are removed.)
 */
export const MAVLINK_HEADER_LEN = 7;

/**
 * Checksum length (CRC-16, little-endian)
 */
export const MAVLINK_CHECKSUM_LEN = 2;

/**
 * Maximum payload length (0-255 bytes)
 */
export const MAVLINK_MAX_PAYLOAD_LEN = 255;

/**
 * Maximum complete frame length
 * STX(1) + HEADER(7) + PAYLOAD(255) + CRC(2) = 265 bytes
 */
export const MAVLINK_MAX_FRAME_LEN = 1 + MAVLINK_HEADER_LEN + MAVLINK_MAX_PAYLOAD_LEN + MAVLINK_CHECKSUM_LEN;

/**
 * Minimum frame length (frame with empty payload)
 * STX(1) + HEADER(7) + PAYLOAD(0) + CRC(2) = 10 bytes
 */
export const MAVLINK_MIN_FRAME_LEN = 1 + MAVLINK_HEADER_LEN + MAVLINK_CHECKSUM_LEN;

// ============================================================================
// MAVLink Message IDs
// ============================================================================

/**
 * HEARTBEAT message (standard MAVLink)
 * Sent at 1000ms by both PC and DC Charger
 * Used for connection monitoring and system status
 */
export const MAVLINK_MSG_ID_HEARTBEAT = 0;

/**
 * CHARGER_STATUS message (custom, 10001)
 * Sent by DC Charger every 500ms
 * Contains real-time charging status
 */
export const MAVLINK_MSG_ID_CHARGER_STATUS = 10001;

/**
 * SENSOR_DATA message (custom, 10002)
 * Sent by DC Charger every 1000ms
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
 * COMMAND_ACK message (custom, 10102)
 * Sent by DC Charger as acknowledgment to commands
 * Contains target message ID and result code
 */
export const MAVLINK_MSG_ID_COMMAND_ACK = 10102;

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
// CRC
// ============================================================================
//
// V2 Lite uses CRC-16/MODBUS computed over the payload bytes only
// (no header, no per-message extra seed). See `crc16.ts`. There are no
// per-message CRC seeds in this dialect, so no extra table is needed here.

// ============================================================================
// System IDs and Component IDs
// ============================================================================

/**
 * System ID for DC Charger (single charger ↔ multi-host topology)
 */
export const SYSID_CHARGER = 1;

/**
 * System ID — PC Android operator app
 */
export const SYSID_PC_ANDROID = 100;

/**
 * System ID — PC Windows operator app
 */
export const SYSID_PC_WINDOWS = 101;

/**
 * System ID — JIG tester (production / QA fixture)
 */
export const SYSID_JIG = 200;

/**
 * System ID — App tester (this Electron monitoring app)
 */
export const SYSID_APP_TESTER = 201;

/**
 * System ID — Broadcast (target all listeners)
 */
export const SYSID_BROADCAST = 255;

/**
 * Component ID — ALL (used by hosts that are not a charger model,
 * or to address every component)
 */
export const COMPID_ALL = 0;

/**
 * Component ID — charger model: DURA
 */
export const COMPID_DURA = 1;

/**
 * Component ID — charger model: MOOEV
 */
export const COMPID_MOOEV = 2;

/**
 * Component ID — charger model: Parky
 */
export const COMPID_PARKY = 3;


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
 * Standard MAVLink heartbeat rate: 1000ms
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
