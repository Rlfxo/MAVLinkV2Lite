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

    case 'CLEAR_LOG':
      return { ...state, messageLog: [] };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}
