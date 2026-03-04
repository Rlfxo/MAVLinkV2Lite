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
  discharging: number;   // uint8_t - SECC state (0=off, 1~255)
  recharging: number;    // uint8_t - EVCC state (0=off, 1~255)
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
// EVCC (PLC Modem) Message Types (20xxx range)
// ============================================================================

/**
 * EVCC Step (state machine)
 */
export enum EvccStep {
  READY = 0,
  INIT = 1,
  FIRST_PLUGIN = 2,
  SLAC_START = 3,
  SLAC_MATCHING = 4,
  SLAC_MATCHED = 5,
  SDP_CLIENT = 6,
  V2G_CLIENT = 7,
  SESSION_SETUP = 8,
  CHARGING = 9,
  SESSION_STOP = 10,
  FAILED = 11,
}

/**
 * EVCC Command Types
 */
export enum EvccCommandType {
  START_SLAC = 1,
  STOP_SLAC = 2,
  START_V2G = 5,
  STOP_V2G = 6,
  PAUSE_V2G = 7,
  SET_CP_A = 10,
  SET_CP_B = 11,
  SET_CP_C = 12,
  SET_MODE_AC = 20,
  SET_MODE_DC = 21,
  RESUME_V2G = 22,
  CLEAR_V2G_CTX = 23,
}

/**
 * EVCC_STATUS (20001) - 16 bytes
 */
export interface EvccStatusPayload {
  evccStep: number;          // uint8 - EvccStep enum
  evccState: number;         // uint8 - 0=IDLE, 1=REQ, 2=RES, 3=TOUT
  chargeMode: number;        // uint8 - 0=AC, 1=DC
  cpState: number;           // uint8 - CP_A/B/C/D/EF
  cpDuty: number;            // uint8 - EVSE PWM duty (0-100%)
  cpPwmValid: number;        // uint8 - PWM capture valid
  cpVoltageMv: number;       // uint16 - CP voltage (mV)
  slacState: number;         // uint8 - pev_slac_state_e (0-7)
  slacResult: number;        // uint8
  slacRetryCnt: number;      // uint8
  sdpState: number;          // uint8 - sdp_client_state_e (0-5)
  v2gState: number;          // uint8 - v2g_client_state_e (0-20)
  v2gProtocol: number;       // uint8 - 0=unknown, 1=ISO, 2=DIN
  sessionResumable: number;  // uint8 - has saved V2G context
  reserved: number;          // uint8
}

/**
 * EVCC_CHARGING_AC (20002) - 14 bytes
 */
export interface EvccChargingAcPayload {
  evseMaxCurrentA: number;       // int16
  evseNominalVoltageV: number;   // int16
  evseMaxPowerW: number;         // int32
  evMaxCurrentA: number;         // int16
  evMaxVoltageV: number;         // int16
  chargingComplete: number;      // uint8
  reserved: number;              // uint8
}

/**
 * EVCC_CHARGING_DC (20003) - 28 bytes
 */
export interface EvccChargingDcPayload {
  evSoc: number;                  // uint8 - Battery SoC (0-100%)
  evReady: number;                // uint8
  evTargetVoltageV: number;       // int16
  evTargetCurrentA: number;       // int16
  evsePresentVoltageV: number;    // int16
  evsePresentCurrentA: number;    // int16
  evseMaxVoltageV: number;        // int16
  evseMaxCurrentA: number;        // int16
  evseMaxPowerW: number;          // int32
  evEnergyCapacityWh: number;     // int32
  chargingComplete: number;       // uint8
  evseIsolationStatus: number;    // uint8
  evseStatusCode: number;         // uint8
  reserved: number;               // uint8
}

/**
 * EVCC_COMMAND (20100) - 2 bytes
 */
export interface EvccCommandPayload {
  command: number;   // uint8 - EvccCommandType
  param: number;     // uint8
}

/**
 * EVCC_EV_PARAMS (20101) - 16 bytes
 */
export interface EvccEvParamsPayload {
  evReady: number;            // uint8
  evSoc: number;              // uint8
  evMaxVoltageV: number;      // int16
  evMaxCurrentA: number;      // int16
  evMaxPowerW: number;        // int32
  evTargetVoltageV: number;   // int16
  evTargetCurrentA: number;   // int16
}

/**
 * EVCC COMMAND_ACK (20102) - 3 bytes
 */
export interface EvccCommandAckPayload {
  command: number;   // uint8
  result: number;    // uint8 - 0=OK, 1=FAIL, 2=UNSUPPORTED
  reserved: number;  // uint8
}

/**
 * EVCC CONFIG_RESPONSE (20201) - 36 bytes
 */
export interface EvccConfigResponsePayload {
  fwVersionMajor: number;    // uint8
  fwVersionMinor: number;    // uint8
  fwVersionPatch: number;    // uint8
  chargeMode: number;        // uint8 - 0=AC, 1=DC
  fwBuildYear: number;       // uint16
  fwBuildMonth: number;      // uint8
  fwBuildDay: number;        // uint8
  macAddress: Uint8Array;    // 6 bytes
  evseMac: Uint8Array;       // 6 bytes
  seccIp: Uint8Array;        // 16 bytes
  seccPort: number;          // uint16
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
