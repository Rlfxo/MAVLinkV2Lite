/**
 * MAVLink V2 Protocol Type Definitions
 *
 * This file defines all TypeScript types and interfaces used in the
 * MAVLink V2 Lite protocol implementation.
 */

// ============================================================================
// Core MAVLink Message Types
// ============================================================================

/**
 * MAVLink V2 Lite Message
 *
 * Represents a complete parsed MAVLink V2 Lite message with all header fields
 * and payload data.
 */
export interface MAVLinkMessage {
  /** Packet sequence number (0-255, wraps around) */
  seq: number;

  /** System ID (sender) */
  sysid: number;

  /** Component ID (sender) */
  compid: number;

  /** Message ID (0-16777215, 24-bit) */
  msgid: number;

  /** Message payload data */
  payload: Uint8Array;

  /** CRC-16 checksum */
  checksum: number;

  /** Timestamp when message was received (milliseconds since epoch) */
  timestamp?: number;
}

/**
 * MAVLink V2 Lite Message Header (without payload)
 *
 * Contains only the header information, useful for debugging and logging.
 */
export interface MAVLinkHeader {
  /** Start-of-frame marker (0xFC for MAVLink V2 Lite) */
  stx: number;

  /** Payload length (0-255) */
  len: number;

  /** Packet sequence number */
  seq: number;

  /** System ID */
  sysid: number;

  /** Component ID */
  compid: number;

  /** Message ID (24-bit) */
  msgid: number;
}

// ============================================================================
// HEARTBEAT Message (Message ID: 0)
// ============================================================================

/**
 * HEARTBEAT message payload
 *
 * Simplified HEARTBEAT for DC Charger protocol.
 * Sent at 1000ms by both PC and DC Charger for keep-alive.
 *
 * Payload size: 2 bytes
 */
export interface HeartbeatPayload {
  /** System status (MAV_STATE enum) */
  systemStatus: number; // uint8_t

  /** MAVLink version (should be 3 for V2) */
  mavlinkVersion: number; // uint8_t
}

// ============================================================================
// CHARGER_STATUS Message (Message ID: 10001)
// ============================================================================

/**
 * CHARGER_STATUS message payload
 *
 * Charger operational status, sent by DC Charger every 500ms.
 * Contains discharging/recharging state, BMS info, relay, and diagnostics.
 *
 * Payload size: 16 bytes (Phase 3)
 */
export interface ChargerStatusPayload {
  discharging: number;   // uint8_t - discharge state (0=off, 1~255)
  recharging: number;    // uint8_t - recharge state (0=off, 1~255)
  bmsVendor: number;     // uint8_t - BMS vendor enum
  bmsCap: number;        // uint16_t - BMS capacity (kWh)
  outCap: number;        // uint8_t - Output converter max capacity (kW)
  bmsSoc: number;        // uint8_t - SOC (%)
  diagnosis: number;     // uint8_t - Diagnosis flags (bitmask)
  relayBitmap: number;   // uint32_t - Relay bitmap
  uptimeSec: number;     // uint32_t - System uptime (sec)
}

// ============================================================================
// SENSOR_DATA Message (Message ID: 10002)
// ============================================================================

/**
 * SENSOR_DATA message payload
 *
 * Sensor readings, sent by DC Charger every 1000ms.
 * Contains environment, IMU, DCGF, power meter, and IMD data.
 *
 * Payload size: 52 bytes (Phase 3)
 */
export interface SensorDataPayload {
  temperatureC: number;   // float - Temperature (degC)
  humidityPct: number;    // float - Humidity (%)
  accelXMps2: number;     // float - Accel X (m/s^2)
  accelYMps2: number;     // float - Accel Y (m/s^2)
  accelZMps2: number;     // float - Accel Z (m/s^2)
  gyroXDps: number;       // float - Gyro X (deg/s)
  gyroYDps: number;       // float - Gyro Y (deg/s)
  gyroZDps: number;       // float - Gyro Z (deg/s)
  dcgfFault: number;      // uint16_t - DCGF fault code
  dcgfVolt1: number;      // uint16_t - DCGF voltage 1 (mV)
  dcgfVolt2: number;      // uint16_t - DCGF voltage 2 (mV)
  meterVoltage: number;   // uint32_t - Power meter voltage (mV)
  meterCurrent: number;   // uint32_t - Power meter current (mA)
  meterEnergy: number;    // uint32_t - Power meter energy (Wh)
  imdStopMode: number;    // uint8_t - IMD stop mode
  reserved: number;       // uint8_t - Reserved (alignment)
}

// ============================================================================
// CHARGER_COMMAND Message (Message ID: 10100)
// ============================================================================

/**
 * Charger command types
 */
export enum ChargerCommandType {
  STOP = 0,
  DISCHARGE = 1,
  RECHARGE = 2,
}

/**
 * CHARGER_COMMAND message payload
 *
 * Charging control commands, sent by PC to DC Charger.
 *
 * Payload size: 3 bytes (Phase 4)
 */
export interface ChargerCommandPayload {
  maxPowerKw: number;   // uint16_t - Max power (kW)
  command: number;      // uint8_t - Command type (ChargerCommandType)
}

// ============================================================================
// COMMAND_ACK Message (Message ID: 10102)
// ============================================================================

/**
 * Command result codes
 */
export enum CommandResult {
  ACCEPTED = 0,
  DENIED = 1,
  ERROR = 2,
  UNSUPPORTED = 3,
}

/**
 * COMMAND_ACK message payload
 *
 * Acknowledgment from DC Charger in response to commands.
 *
 * Payload size: 3 bytes
 */
export interface CommandAckPayload {
  targetMsgId: number;  // uint16_t - ACK target MSG_ID
  result: number;       // uint8_t - CommandResult
}

// ============================================================================
// CONFIG_RESPONSE Message (Message ID: 10201)
// ============================================================================

/**
 * CONFIG_RESPONSE message payload
 *
 * Charger firmware/hardware information, sent by DC Charger in response to CONFIG_REQUEST.
 * CONFIG_REQUEST (10200) has 0-byte payload — no dedicated type needed.
 *
 * Payload size: 36 bytes
 */
export interface ConfigResponsePayload {
  fwVersion: number;    // uint32_t LE — 0x00XXYYZZ → XX.YY.ZZ
  hwVersion: number;    // uint32_t LE
  modelName: string;    // char[16] null-terminated UTF-8
  buildDate: string;    // char[12] YYYYMMDDHHMM
}

// ============================================================================
// MANUAL_CONTROL Message (Message ID: 10101)
// ============================================================================

/**
 * MANUAL_CONTROL message payload
 *
 * JIG/test manual control commands, sent by PC to DC Charger.
 * Overrides board autonomous control for relay and charge/discharge.
 *
 * Payload size: 6 bytes (Phase 4)
 */
export interface ManualControlPayload {
  manualMode: number;    // uint8_t - Manual mode (0=OFF, 1=ON)
  relayBitmap: number;   // uint32_t - Relay control bitmap
  forceCommand: number;  // uint8_t - Force command (0=NONE, 1=FORCE_DISCHARGE, 2=FORCE_RECHARGE)
}

// ============================================================================
// Parser and Statistics Types
// ============================================================================

/**
 * MAVLink V2 Lite Parser State
 *
 * Internal state machine states for the parser.
 */
export enum ParseState {
  /** Waiting for start-of-frame marker */
  IDLE = 0,

  /** Received STX, waiting for length */
  GOT_STX = 1,

  /** Received length, waiting for sequence */
  GOT_LEN = 2,

  /** Received sequence, waiting for system ID */
  GOT_SEQ = 3,

  /** Received system ID, waiting for component ID */
  GOT_SYSID = 4,

  /** Received component ID, waiting for message ID byte 1 */
  GOT_COMPID = 5,

  /** Received message ID byte 1, waiting for byte 2 */
  GOT_MSGID1 = 6,

  /** Received message ID byte 2, waiting for byte 3 */
  GOT_MSGID2 = 7,

  /** Received message ID byte 3, waiting for payload */
  GOT_MSGID3 = 8,

  /** Receiving payload bytes */
  GOT_PAYLOAD = 9,

  /** Received all payload, waiting for CRC byte 1 */
  GOT_CRC1 = 10,
}

/**
 * MAVLink Parser Statistics
 *
 * Tracks parsing success/failure statistics for debugging and monitoring.
 */
export interface ParserStats {
  /** Total number of successfully parsed messages */
  totalRxCount: number;

  /** Number of messages rejected due to CRC errors */
  crcErrorCount: number;

  /** Number of messages rejected due to parsing errors */
  parseErrorCount: number;

  /** Timestamp of last successful parse (milliseconds since epoch) */
  lastRxTimestamp?: number;
}

// ============================================================================
// Serial Port Types
// ============================================================================

/**
 * Serial Port Information
 *
 * Information about an available serial port.
 * Based on serialport library's PortInfo interface.
 */
export interface PortInfo {
  /** Path to the serial port (e.g., /dev/ttyUSB0, COM3) */
  path: string;

  /** Manufacturer name (if available) */
  manufacturer?: string;

  /** Serial number (if available) */
  serialNumber?: string;

  /** Plug and Play ID (if available) */
  pnpId?: string;

  /** Vendor ID (if available) */
  vendorId?: string;

  /** Product ID (if available) */
  productId?: string;

  /** Location ID (if available) */
  locationId?: string;
}

/**
 * Serial Port Configuration
 *
 * Configuration options for opening a serial port.
 */
export interface SerialPortConfig {
  /** Baud rate (default: 115200) */
  baudRate: number;

  /** Data bits (default: 8) */
  dataBits: 8 | 7 | 6 | 5;

  /** Parity (default: 'none') */
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space';

  /** Stop bits (default: 1) */
  stopBits: 1 | 1.5 | 2;

  /** Auto-open on creation (default: false) */
  autoOpen: boolean;
}

/**
 * Serial Port Status
 *
 * Current status of the serial port connection.
 */
export interface SerialPortStatus {
  /** Whether the port is currently open */
  isOpen: boolean;

  /** Path to the connected port (if open) */
  path?: string;

  /** Number of bytes received */
  bytesReceived: number;

  /** Number of bytes transmitted */
  bytesTransmitted: number;

  /** Timestamp of last activity (milliseconds since epoch) */
  lastActivityTimestamp?: number;
}

// ============================================================================
// Heartbeat Manager Types
// ============================================================================

/**
 * Heartbeat Status
 *
 * Status of the heartbeat connection monitoring.
 */
export interface HeartbeatStatus {
  /** Whether heartbeat messages are being sent */
  isSending: boolean;

  /** Whether remote heartbeat has been received recently */
  isConnected: boolean;

  /** Last received HEARTBEAT message */
  lastHeartbeat?: HeartbeatPayload;

  /** Timestamp of last received heartbeat (milliseconds since epoch) */
  lastHeartbeatTime?: number;

  /** Time since last heartbeat in milliseconds */
  timeSinceLastHeartbeat?: number;

  /** Number of heartbeats sent */
  heartbeatsSent: number;

  /** Number of heartbeats received */
  heartbeatsReceived: number;

  /** Current sequence number for outgoing heartbeats */
  txSeq: number;
}

// ============================================================================
// Application State Types
// ============================================================================

/**
 * Connection State
 *
 * Overall connection state for the application.
 */
export enum ConnectionState {
  /** Not connected */
  DISCONNECTED = 'disconnected',

  /** Attempting to connect */
  CONNECTING = 'connecting',

  /** Connected, waiting for first heartbeat */
  CONNECTED = 'connected',

  /** Fully synchronized (heartbeat received) */
  SYNCHRONIZED = 'synchronized',

  /** Connection lost (timeout) */
  TIMEOUT = 'timeout',

  /** Error state */
  ERROR = 'error',
}

/**
 * Application State
 *
 * Top-level application state for React context.
 */
export interface AppState {
  /** Current connection state */
  connectionState: ConnectionState;

  /** Available serial ports */
  availablePorts: PortInfo[];

  /** Currently selected port path */
  selectedPort?: string;

  /** Serial port status */
  serialStatus?: SerialPortStatus;

  /** Heartbeat status */
  heartbeatStatus?: HeartbeatStatus;

  /** Parser statistics */
  parserStats: ParserStats;

  /** Last error message */
  lastError?: string;
}
