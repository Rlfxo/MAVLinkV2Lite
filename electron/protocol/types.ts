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
// fixed_t — wire representation for physical quantities
// ============================================================================

/**
 * fixed_t — 5-byte fixed-point wire format used by SENSOR_DATA / METER_DATA.
 *
 *   actual_value = value × 10^exp,  in SI base unit (V, A, W, Wh, °C, %, m/s², °/s)
 *
 * The encoder/firmware sends peripheral-raw integers + a constant exp per
 * field (e.g. SHT3X temperature: exp=-2 ⇒ centi-degC LSB). For convenience,
 * use `fixedToFloat(ft)` to obtain a JS number.
 */
export interface FixedT {
  value: number;  // int32 LE
  exp: number;    // int8
}

// ============================================================================
// CHARGER_STATUS Message (Message ID: 10001) — 10 B, 10 Hz
// ============================================================================

/**
 * CHARGER_STATUS payload (10 B, periodic 100 ms / 10 Hz).
 *
 * Slim "control-critical" snapshot: high-level state + relay topology +
 * uptime + storage SOC. All peripheral measurements live in METER_DATA
 * (V/I/P/E) or SENSOR_DATA (environment/IMU/DCGF/IMD).
 */
export interface ChargerStatusPayload {
  state: number;         // uint8 - MAV_STATE
  relayBitmap: number;   // uint32 LE - bit 0..15 = RY1..RY16, bit 16 = MC
  uptimeSec: number;     // uint32 LE - charger uptime (s)
  storageSoc: number;    // uint8 - 0..100 % (battery models). DURA: 0 = N/A
}

// ============================================================================
// METER_DATA Message (Message ID: 10003) — 50 B, 2 Hz
// ============================================================================

/**
 * METER_DATA payload (50 B, periodic 500 ms / 2 Hz).
 *
 * SPM90 meter measurements. `total_*` are firmware-summed (intra-frame
 * consistency between meter1 + meter2). DURA exposes both meters; MOOEV
 * has no meter2 and reports it as (value=0, exp=0).
 *
 * SPM90 native exponents (encoder uses these as-is):
 *   voltage: exp = -1 (100 mV LSB)
 *   current: exp = -2 (10 mA LSB)
 *   power:   exp =  0 (1 W LSB)
 *   energy:  exp = +1 (10 Wh LSB)
 *
 * Sign convention: positive current/power = charger → external (charging),
 * negative = V2G / external → charger (reverse).
 */
export interface MeterDataPayload {
  totalPower: FixedT;     // W, summed across meters
  totalEnergy: FixedT;    // Wh, summed across meters
  meter1Voltage: FixedT;
  meter1Current: FixedT;
  meter1Power: FixedT;
  meter1Energy: FixedT;
  meter2Voltage: FixedT;  // DURA only; MOOEV: (0,0)
  meter2Current: FixedT;
  meter2Power: FixedT;
  meter2Energy: FixedT;
}

// ============================================================================
// SENSOR_DATA Message (Message ID: 10002) — 53 B, 2 Hz
// ============================================================================

/**
 * SENSOR_DATA payload (53 B, periodic 500 ms / 2 Hz).
 *
 * Environment + IMU + DCGF + IMD. All physical quantities are fixed_t in
 * SI base units (°C, %, m/s², °/s, V). Peripheral defaults:
 *   SHT3X temperature/humidity: exp = -2
 *   LSM6DSO32 accel/gyro:       exp = -3
 *   DCGF voltage:               exp = -1
 *
 * Meter measurements moved to METER_DATA — not in this message.
 */
export interface SensorDataPayload {
  temperature: FixedT;   // °C
  humidity: FixedT;      // %
  accelX: FixedT;        // m/s²
  accelY: FixedT;
  accelZ: FixedT;
  gyroX: FixedT;         // °/s
  gyroY: FixedT;
  gyroZ: FixedT;
  dcgfFault: number;     // uint16 LE - DCGF fault bitmask (raw)
  dcgfVolt1: FixedT;     // V
  dcgfVolt2: FixedT;     // V
  imdStopMode: number;   // uint8 - IMD stop mode (MOOEV only; DURA: 0)
}

// ============================================================================
// CHARGER_COMMAND Message (Message ID: 10100) — 7 B
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
 * CHARGER_COMMAND payload (7 B). PC → Charger, on-demand.
 *
 * `uuid` is a PC-assigned 32-bit id per command instance (monotonic counter
 * is fine). Firmware echoes uuid in COMMAND_ACK and de-dupes retransmissions
 * by uuid cache, so retrying a lost ACK is safe.
 */
export interface ChargerCommandPayload {
  uuid: number;         // uint32 LE - PC-assigned command instance id
  maxPowerKw: number;   // uint16 LE - max power (kW)
  command: number;      // uint8 - ChargerCommandType
}

// ============================================================================
// COMMAND_ACK Message (Message ID: 10102) — 5 B
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
 * COMMAND_ACK payload (5 B). Charger → PC, in reply to CHARGER_COMMAND.
 *
 * The legacy `targetMsgId` field is gone — `uuid` (echoed from the request)
 * is the sole correlation key.
 */
export interface CommandAckPayload {
  uuid: number;   // uint32 LE - echoed from CHARGER_COMMAND.uuid
  result: number; // uint8 - CommandResult
}

// ============================================================================
// CONFIG_REQUEST Message (Message ID: 10200) — 4 B
// ============================================================================

/**
 * CONFIG_REQUEST payload (4 B). PC → Charger, on-demand.
 *
 * Firmware replies with CONFIG_RESPONSE carrying the same uuid.
 */
export interface ConfigRequestPayload {
  uuid: number;   // uint32 LE - PC-assigned request instance id
}

// ============================================================================
// CONFIG_RESPONSE Message (Message ID: 10201) — 40 B
// ============================================================================

/**
 * CONFIG_RESPONSE payload (40 B). Charger → PC, in reply to CONFIG_REQUEST.
 */
export interface ConfigResponsePayload {
  uuid: number;         // uint32 LE - echoed from CONFIG_REQUEST.uuid
  fwVersion: number;    // uint32 LE - 0x00 MAJOR MINOR PATCH
  hwVersion: number;    // uint32 LE - HW revision word
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
