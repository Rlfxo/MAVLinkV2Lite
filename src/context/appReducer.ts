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
  CommandAckPayload,
  ConfigResponsePayload,
  EvccStatusPayload,
  EvccChargingAcPayload,
  EvccChargingDcPayload,
  EvccCommandAckPayload,
  EvccConfigResponsePayload,
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
  lastCommandAck: CommandAckPayload | null;
  lastCommandAckTime: number | null;
  isSendingCommand: boolean;
  lastConfigResponse: ConfigResponsePayload | null;
  lastConfigResponseTime: number | null;
  // Tab & device detection
  activeTab: 'charger' | 'evcc';
  detectedDevice: 'none' | 'charger' | 'evcc' | 'both';
  // EVCC state
  lastEvccStatus: EvccStatusPayload | null;
  lastEvccStatusTime: number | null;
  lastEvccChargingAc: EvccChargingAcPayload | null;
  lastEvccChargingAcTime: number | null;
  lastEvccChargingDc: EvccChargingDcPayload | null;
  lastEvccChargingDcTime: number | null;
  lastEvccCommandAck: EvccCommandAckPayload | null;
  lastEvccCommandAckTime: number | null;
  lastEvccConfigResponse: EvccConfigResponsePayload | null;
  lastEvccConfigResponseTime: number | null;
  isSendingEvccCommand: boolean;
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
  | { type: 'SET_COMMAND_ACK'; payload: CommandAckPayload }
  | { type: 'SET_SENDING_COMMAND'; payload: boolean }
  | { type: 'SET_CONFIG_RESPONSE'; payload: ConfigResponsePayload }
  | { type: 'SET_ACTIVE_TAB'; payload: 'charger' | 'evcc' }
  | { type: 'SET_DETECTED_DEVICE'; payload: 'none' | 'charger' | 'evcc' | 'both' }
  | { type: 'SET_EVCC_STATUS'; payload: EvccStatusPayload }
  | { type: 'SET_EVCC_CHARGING_AC'; payload: EvccChargingAcPayload }
  | { type: 'SET_EVCC_CHARGING_DC'; payload: EvccChargingDcPayload }
  | { type: 'SET_EVCC_COMMAND_ACK'; payload: EvccCommandAckPayload }
  | { type: 'SET_EVCC_CONFIG_RESPONSE'; payload: EvccConfigResponsePayload }
  | { type: 'SET_SENDING_EVCC_COMMAND'; payload: boolean }
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
  lastCommandAck: null,
  lastCommandAckTime: null,
  isSendingCommand: false,
  lastConfigResponse: null,
  lastConfigResponseTime: null,
  activeTab: 'charger',
  detectedDevice: 'none',
  lastEvccStatus: null,
  lastEvccStatusTime: null,
  lastEvccChargingAc: null,
  lastEvccChargingAcTime: null,
  lastEvccChargingDc: null,
  lastEvccChargingDcTime: null,
  lastEvccCommandAck: null,
  lastEvccCommandAckTime: null,
  lastEvccConfigResponse: null,
  lastEvccConfigResponseTime: null,
  isSendingEvccCommand: false,
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

    case 'SET_COMMAND_ACK':
      return { ...state, lastCommandAck: action.payload, lastCommandAckTime: Date.now(), isSendingCommand: false };

    case 'SET_SENDING_COMMAND':
      return { ...state, isSendingCommand: action.payload };

    case 'SET_CONFIG_RESPONSE':
      return { ...state, lastConfigResponse: action.payload, lastConfigResponseTime: Date.now() };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };

    case 'SET_DETECTED_DEVICE':
      return { ...state, detectedDevice: action.payload };

    case 'SET_EVCC_STATUS':
      return { ...state, lastEvccStatus: action.payload, lastEvccStatusTime: Date.now() };

    case 'SET_EVCC_CHARGING_AC':
      return { ...state, lastEvccChargingAc: action.payload, lastEvccChargingAcTime: Date.now() };

    case 'SET_EVCC_CHARGING_DC':
      return { ...state, lastEvccChargingDc: action.payload, lastEvccChargingDcTime: Date.now() };

    case 'SET_EVCC_COMMAND_ACK':
      return { ...state, lastEvccCommandAck: action.payload, lastEvccCommandAckTime: Date.now(), isSendingEvccCommand: false };

    case 'SET_EVCC_CONFIG_RESPONSE':
      return { ...state, lastEvccConfigResponse: action.payload, lastEvccConfigResponseTime: Date.now() };

    case 'SET_SENDING_EVCC_COMMAND':
      return { ...state, isSendingEvccCommand: action.payload };

    case 'CLEAR_LOG':
      return { ...state, messageLog: [] };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}
