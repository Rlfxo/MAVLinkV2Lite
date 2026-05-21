/**
 * Electron API Type Definitions
 *
 * Type definitions for the API exposed via preload.ts contextBridge.
 */

import type {
  PortInfo,
  HeartbeatPayload,
  ChargerStatusPayload,
  SensorDataPayload,
  MeterDataPayload,
  ChargerCommandPayload,
  CommandAckPayload,
  ConfigResponsePayload,
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

export interface ChargerStatusReceivedData {
  payload: ChargerStatusPayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

export interface SensorDataReceivedData {
  payload: SensorDataPayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

export interface MeterDataReceivedData {
  payload: MeterDataPayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

export interface ChargerCommandSentData {
  /** Full payload including PC-allocated uuid. */
  payload: ChargerCommandPayload;
  seq: number;
  timestamp: number;
}

export interface CommandAckReceivedData {
  /** Payload contains the echoed uuid + result code. */
  payload: CommandAckPayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

export interface ConfigRequestSentData {
  /** PC-allocated uuid for the request (use to match CONFIG_RESPONSE). */
  uuid: number;
  seq: number;
  timestamp: number;
}

export interface ConfigResponseReceivedData {
  /** Payload contains the echoed uuid + fw/hw/model/build_date. */
  payload: ConfigResponsePayload;
  seq: number;
  sysid: number;
  compid: number;
  timestamp: number;
}

/** Domain-only inputs for `chargerCommand.send` (main process attaches uuid). */
export interface ChargerCommandRequest {
  maxPowerKw: number;
  command: number;
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
  chargerStatus: {
    onReceived(callback: (data: ChargerStatusReceivedData) => void): () => void;
  };
  sensorData: {
    onReceived(callback: (data: SensorDataReceivedData) => void): () => void;
  };
  meterData: {
    onReceived(callback: (data: MeterDataReceivedData) => void): () => void;
  };
  chargerCommand: {
    /** Returns the PC-allocated uuid for the sent command. */
    send(req: ChargerCommandRequest): Promise<number>;
    onSent(callback: (data: ChargerCommandSentData) => void): () => void;
  };
  commandAck: {
    onReceived(callback: (data: CommandAckReceivedData) => void): () => void;
  };
  config: {
    /** Returns the PC-allocated uuid for the sent request. */
    sendRequest(): Promise<number>;
    onRequestSent(callback: (data: ConfigRequestSentData) => void): () => void;
    onResponseReceived(callback: (data: ConfigResponseReceivedData) => void): () => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
