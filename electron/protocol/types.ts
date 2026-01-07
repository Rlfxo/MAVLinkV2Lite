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
 * MAVLink V2 Message
 *
 * Represents a complete parsed MAVLink message with all header fields
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

  /** Incompatibility flags (reserved for future use) */
  incFlags: number;

  /** Compatibility flags (reserved for future use) */
  cmpFlags: number;

  /** Message payload data */
  payload: Uint8Array;

  /** CRC-16 checksum */
  checksum: number;

  /** Timestamp when message was received (milliseconds since epoch) */
  timestamp?: number;
}

/**
 * MAVLink Message Header (without payload)
 *
 * Contains only the header information, useful for debugging and logging.
 */
export interface MAVLinkHeader {
  /** Start-of-frame marker (should be 0xFD for MAVLink V2) */
  stx: number;

  /** Payload length (0-255) */
  len: number;

  /** Incompatibility flags */
  incFlags: number;

  /** Compatibility flags */
  cmpFlags: number;

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
 * Standard MAVLink HEARTBEAT message, sent at 1Hz by both PC and DC Charger.
 * Used for connection monitoring and system status indication.
 *
 * Payload size: 9 bytes
 * Struct format: <I5B (little-endian: uint32_t + 5x uint8_t)
 */
export interface HeartbeatPayload {
  /** Custom mode (system-specific, not used for DC Charger) */
  customMode: number; // uint32_t

  /** Type of the system (MAV_TYPE enum) */
  type: number; // uint8_t

  /** Autopilot type (MAV_AUTOPILOT enum) */
  autopilot: number; // uint8_t

  /** System mode bitmap (not used for DC Charger) */
  baseMode: number; // uint8_t

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
 * Real-time charging status, sent by DC Charger at 10Hz.
 * Contains voltage, current, power, and charging state information.
 *
 * Payload size: TBD (to be implemented in Phase 3)
 */
export interface ChargerStatusPayload {
  /** Output voltage (mV) */
  voltageOutput: number; // uint32_t

  /** Output current (mA) */
  currentOutput: number; // uint32_t

  /** Output power (mW) */
  powerOutput: number; // uint32_t

  /** Charging state (enum: idle, charging, complete, error, etc.) */
  chargingState: number; // uint8_t

  /** Error flags (bitfield) */
  errorFlags: number; // uint16_t

  // Additional fields to be defined in Phase 3
}

// ============================================================================
// SENSOR_DATA Message (Message ID: 10002)
// ============================================================================

/**
 * SENSOR_DATA message payload
 *
 * Sensor readings, sent by DC Charger at 2Hz.
 * Contains temperature and other sensor data.
 *
 * Payload size: TBD (to be implemented in Phase 3)
 */
export interface SensorDataPayload {
  /** Charger temperature (0.01°C units) */
  temperature: number; // int16_t

  // Additional sensor fields to be defined in Phase 3
}

// ============================================================================
// CHARGER_COMMAND Message (Message ID: 10100)
// ============================================================================

/**
 * CHARGER_COMMAND message payload
 *
 * Charging control commands, sent by PC to DC Charger.
 * Commands include start, stop, and set limits.
 *
 * Payload size: TBD (to be implemented in Phase 4)
 */
export interface ChargerCommandPayload {
  /** Command type (enum: start, stop, set_limits, etc.) */
  command: number; // uint8_t

  /** Target voltage (mV) */
  targetVoltage: number; // uint32_t

  /** Current limit (mA) */
  currentLimit: number; // uint32_t

  // Additional command fields to be defined in Phase 4
}

// ============================================================================
// RELAY_CONTROL Message (Message ID: 10101)
// ============================================================================

/**
 * RELAY_CONTROL message payload
 *
 * Relay control commands, sent by PC to DC Charger.
 * Controls 17 individual relays.
 *
 * Payload size: TBD (to be implemented in Phase 4)
 */
export interface RelayControlPayload {
  /** Relay mask (bitfield, 17 bits used) */
  relayMask: number; // uint32_t

  /** Relay state (bitfield, 17 bits used) */
  relayState: number; // uint32_t
}

// ============================================================================
// Parser and Statistics Types
// ============================================================================

/**
 * MAVLink Parser State
 *
 * Internal state machine states for the MAVLink parser.
 */
export enum ParseState {
  /** Waiting for start-of-frame marker */
  IDLE = 0,

  /** Received STX, waiting for length */
  GOT_STX = 1,

  /** Received length, waiting for incompatibility flags */
  GOT_LEN = 2,

  /** Received incompatibility flags, waiting for compatibility flags */
  GOT_INCOMPAT = 3,

  /** Received compatibility flags, waiting for sequence */
  GOT_COMPAT = 4,

  /** Received sequence, waiting for system ID */
  GOT_SEQ = 5,

  /** Received system ID, waiting for component ID */
  GOT_SYSID = 6,

  /** Received component ID, waiting for message ID byte 1 */
  GOT_COMPID = 7,

  /** Received message ID byte 1, waiting for byte 2 */
  GOT_MSGID1 = 8,

  /** Received message ID byte 2, waiting for byte 3 */
  GOT_MSGID2 = 9,

  /** Received message ID byte 3, waiting for payload */
  GOT_MSGID3 = 10,

  /** Receiving payload bytes */
  GOT_PAYLOAD = 11,

  /** Received all payload, waiting for CRC byte 1 */
  GOT_CRC1 = 12,
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
