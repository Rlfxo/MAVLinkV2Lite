/**
 * Electron API Type Definitions
 *
 * Type definitions for the API exposed via preload.ts contextBridge.
 */

import type {
  PortInfo,
  HeartbeatPayload,
  HeartbeatStatus,
  ParserStats,
} from '../../electron/protocol/types';
import type { SerialStatus } from '../../electron/serial/SerialPortManager';

export interface HeartbeatReceivedData {
  payload: HeartbeatPayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

export interface HeartbeatSentData {
  seq: number;
  timestamp: number;
}

export interface ElectronAPI {
  serial: {
    listPorts(): Promise<PortInfo[]>;
    connect(path: string): Promise<void>;
    disconnect(): Promise<void>;
    getStatus(): Promise<SerialStatus>;
    onError(callback: (message: string) => void): () => void;
    onClosed(callback: () => void): () => void;
  };
  heartbeat: {
    getStatus(): Promise<HeartbeatStatus>;
    getParserStats(): Promise<ParserStats>;
    onReceived(callback: (data: HeartbeatReceivedData) => void): () => void;
    onSent(callback: (data: HeartbeatSentData) => void): () => void;
    onTimeout(callback: () => void): () => void;
    onConnectionEstablished(callback: () => void): () => void;
    onConnectionLost(callback: () => void): () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
