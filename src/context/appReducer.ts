/**
 * Application State Reducer
 *
 * Manages application state transitions for serial connection,
 * heartbeat monitoring, and parser statistics.
 */

import type {
  PortInfo,
  HeartbeatStatus,
  ParserStats,
  ConnectionState,
  ChargerStatusPayload,
  SensorDataPayload,
  MeterDataPayload,
  CommandAckPayload,
  ConfigResponsePayload,
} from '../../electron/protocol/types';
import type { SerialStatus } from '../../electron/serial/SerialPortManager';

export interface MessageLogEntry {
  id: number;
  timestamp: number;
  direction: 'TX' | 'RX';
  seq: number;
  sysid?: number;
  compid?: number;
  systemStatus?: number;
}

/**
 * Detected charger model (derived from heartbeat COMPID).
 * - 'none'    : no charger heartbeat received yet
 * - 'dura'    : COMPID = 1
 * - 'mooev'   : COMPID = 2
 * - 'parky'   : COMPID = 3
 * - 'unknown' : charger heartbeat received but COMPID does not match a known model
 */
export type ChargerModel = 'none' | 'dura' | 'mooev' | 'parky' | 'unknown';

/**
 * Active model tab (which model's UI the user is viewing).
 * Currently only 'dura' is implemented; MOOEV / Parky tabs exist but are disabled.
 */
export type ActiveModel = 'dura' | 'mooev' | 'parky';

export interface AppState {
  connectionState: ConnectionState;
  availablePorts: PortInfo[];
  selectedPort: string;
  serialStatus: SerialStatus | null;
  heartbeatStatus: HeartbeatStatus | null;
  parserStats: ParserStats | null;
  messageLog: MessageLogEntry[];
  lastError: string | null;
  isConnecting: boolean;
  lastChargerStatus: ChargerStatusPayload | null;
  lastChargerStatusTime: number | null;
  lastSensorData: SensorDataPayload | null;
  lastSensorDataTime: number | null;
  lastMeterData: MeterDataPayload | null;
  lastMeterDataTime: number | null;
  lastCommandAck: CommandAckPayload | null;
  lastCommandAckTime: number | null;
  isSendingCommand: boolean;
  pendingCommandUuid: number | null;
  lastConfigResponse: ConfigResponsePayload | null;
  lastConfigResponseTime: number | null;
  pendingConfigUuid: number | null;
  detectedModel: ChargerModel;
  activeModel: ActiveModel;
}

export type AppAction =
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  | { type: 'SET_AVAILABLE_PORTS'; payload: PortInfo[] }
  | { type: 'SET_SELECTED_PORT'; payload: string }
  | { type: 'SET_SERIAL_STATUS'; payload: SerialStatus }
  | { type: 'SET_HEARTBEAT_STATUS'; payload: HeartbeatStatus }
  | { type: 'SET_PARSER_STATS'; payload: ParserStats }
  | { type: 'ADD_MESSAGE_LOG'; payload: MessageLogEntry }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTING'; payload: boolean }
  | { type: 'SET_CHARGER_STATUS'; payload: ChargerStatusPayload }
  | { type: 'SET_SENSOR_DATA'; payload: SensorDataPayload }
  | { type: 'SET_METER_DATA'; payload: MeterDataPayload }
  | { type: 'SET_COMMAND_ACK'; payload: CommandAckPayload }
  | { type: 'SET_SENDING_COMMAND'; payload: { sending: boolean; uuid?: number } }
  | { type: 'SET_CONFIG_RESPONSE'; payload: ConfigResponsePayload }
  | { type: 'SET_PENDING_CONFIG_UUID'; payload: number | null }
  | { type: 'SET_DETECTED_MODEL'; payload: ChargerModel }
  | { type: 'SET_ACTIVE_MODEL'; payload: ActiveModel }
  | { type: 'CLEAR_LOG' }
  | { type: 'RESET' };

const MAX_LOG_ENTRIES = 200;

export const initialState: AppState = {
  connectionState: 'disconnected' as ConnectionState,
  availablePorts: [],
  selectedPort: '',
  serialStatus: null,
  heartbeatStatus: null,
  parserStats: null,
  messageLog: [],
  lastError: null,
  isConnecting: false,
  lastChargerStatus: null,
  lastChargerStatusTime: null,
  lastSensorData: null,
  lastSensorDataTime: null,
  lastMeterData: null,
  lastMeterDataTime: null,
  lastCommandAck: null,
  lastCommandAckTime: null,
  isSendingCommand: false,
  pendingCommandUuid: null,
  lastConfigResponse: null,
  lastConfigResponseTime: null,
  pendingConfigUuid: null,
  detectedModel: 'none',
  activeModel: 'dura',
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_CONNECTION_STATE':
      return { ...state, connectionState: action.payload };

    case 'SET_AVAILABLE_PORTS':
      return { ...state, availablePorts: action.payload };

    case 'SET_SELECTED_PORT':
      return { ...state, selectedPort: action.payload };

    case 'SET_SERIAL_STATUS':
      return { ...state, serialStatus: action.payload };

    case 'SET_HEARTBEAT_STATUS':
      return { ...state, heartbeatStatus: action.payload };

    case 'SET_PARSER_STATS':
      return { ...state, parserStats: action.payload };

    case 'ADD_MESSAGE_LOG': {
      const log = [action.payload, ...state.messageLog];
      if (log.length > MAX_LOG_ENTRIES) {
        log.length = MAX_LOG_ENTRIES;
      }
      return { ...state, messageLog: log };
    }

    case 'SET_ERROR':
      return { ...state, lastError: action.payload };

    case 'SET_CONNECTING':
      return { ...state, isConnecting: action.payload };

    case 'SET_CHARGER_STATUS':
      return { ...state, lastChargerStatus: action.payload, lastChargerStatusTime: Date.now() };

    case 'SET_SENSOR_DATA':
      return { ...state, lastSensorData: action.payload, lastSensorDataTime: Date.now() };

    case 'SET_METER_DATA':
      return { ...state, lastMeterData: action.payload, lastMeterDataTime: Date.now() };

    case 'SET_COMMAND_ACK':
      // Clear pending only when the ACK uuid matches what we sent (handles
      // stray/duplicate ACKs cleanly). If we have no pending, accept anyway.
      return {
        ...state,
        lastCommandAck: action.payload,
        lastCommandAckTime: Date.now(),
        isSendingCommand:
          state.pendingCommandUuid !== null && action.payload.uuid !== state.pendingCommandUuid
            ? state.isSendingCommand
            : false,
        pendingCommandUuid:
          state.pendingCommandUuid !== null && action.payload.uuid !== state.pendingCommandUuid
            ? state.pendingCommandUuid
            : null,
      };

    case 'SET_SENDING_COMMAND':
      return {
        ...state,
        isSendingCommand: action.payload.sending,
        pendingCommandUuid: action.payload.sending ? (action.payload.uuid ?? null) : null,
      };

    case 'SET_CONFIG_RESPONSE':
      return {
        ...state,
        lastConfigResponse: action.payload,
        lastConfigResponseTime: Date.now(),
        pendingConfigUuid:
          state.pendingConfigUuid !== null && action.payload.uuid !== state.pendingConfigUuid
            ? state.pendingConfigUuid
            : null,
      };

    case 'SET_PENDING_CONFIG_UUID':
      return { ...state, pendingConfigUuid: action.payload };

    case 'SET_DETECTED_MODEL':
      return { ...state, detectedModel: action.payload };

    case 'SET_ACTIVE_MODEL':
      return { ...state, activeModel: action.payload };

    case 'CLEAR_LOG':
      return { ...state, messageLog: [] };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}
