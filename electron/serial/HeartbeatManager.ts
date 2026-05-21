/**
 * Heartbeat Manager
 *
 * Manages MAVLink V2 Lite TX scheduling (HEARTBEAT periodic, request
 * messages on-demand) and RX dispatching for all known message types.
 * Also handles connection liveness via HEARTBEAT timeout detection and
 * generates uuids for command/config requests.
 */

import { EventEmitter } from 'events';
import { SerialPortManager } from './SerialPortManager';
import { MAVLinkParser } from '../protocol/parser';
import {
  createPcHeartbeat,
  decodeHeartbeatPayload,
  decodeChargerStatusPayload,
  decodeSensorDataPayload,
  decodeMeterDataPayload,
  encodeChargerCommand,
  decodeCommandAckPayload,
  encodeConfigRequest,
  decodeConfigResponsePayload,
} from '../protocol/encoder';
import {
  MAVLINK_MSG_ID_HEARTBEAT,
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAVLINK_MSG_ID_SENSOR_DATA,
  MAVLINK_MSG_ID_METER_DATA,
  MAVLINK_MSG_ID_COMMAND_ACK,
  MAVLINK_MSG_ID_CONFIG_RESPONSE,
  SYSID_APP_TESTER,
  COMPID_ALL,
  HEARTBEAT_TX_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_CHECK_INTERVAL_MS,
} from '../protocol/constants';
import type {
  HeartbeatPayload,
  ChargerStatusPayload,
  SensorDataPayload,
  MeterDataPayload,
  ChargerCommandPayload,
  CommandAckPayload,
  ConfigResponsePayload,
  MAVLinkMessage,
} from '../protocol/types';

/**
 * Heartbeat Manager Events
 */
export interface HeartbeatManagerEvents {
  'heartbeat-sent': (seq: number) => void;
  'heartbeat-received': (payload: HeartbeatPayload, message: MAVLinkMessage) => void;
  'heartbeat-timeout': () => void;
  'connection-established': () => void;
  'connection-lost': () => void;
  'charger-status-received': (payload: ChargerStatusPayload, message: MAVLinkMessage) => void;
  'sensor-data-received': (payload: SensorDataPayload, message: MAVLinkMessage) => void;
  'meter-data-received': (payload: MeterDataPayload, message: MAVLinkMessage) => void;
  'charger-command-sent': (payload: ChargerCommandPayload, seq: number) => void;
  'command-ack-received': (payload: CommandAckPayload, message: MAVLinkMessage) => void;
  'config-request-sent': (uuid: number, seq: number) => void;
  'config-response-received': (payload: ConfigResponsePayload, message: MAVLinkMessage) => void;
}

export interface HeartbeatStatus {
  isSending: boolean;
  isConnected: boolean;
  lastHeartbeat?: HeartbeatPayload;
  lastHeartbeatTime?: number;
  timeSinceLastHeartbeat?: number;
  heartbeatsSent: number;
  heartbeatsReceived: number;
  txSeq: number;
}

/**
 * Domain inputs (excluding uuid) accepted by sendChargerCommand.
 * The manager allocates uuid automatically.
 */
export interface ChargerCommandRequest {
  maxPowerKw: number;
  command: number;
}

export class HeartbeatManager extends EventEmitter {
  private serialManager: SerialPortManager;
  private parser: MAVLinkParser;

  // TX (Transmission)
  private txInterval: NodeJS.Timeout | null = null;
  private txSeq: number = 0;
  private heartbeatsSent: number = 0;

  // uuid generator for request messages (CHARGER_COMMAND, CONFIG_REQUEST).
  // Monotonic per session, starting at 1. Firmware caches recent uuids
  // and de-dupes retransmissions, so session restart is fine.
  private nextUuid: number = 1;

  // RX (Reception)
  private lastHeartbeat?: HeartbeatPayload;
  private lastHeartbeatTime?: number;
  private heartbeatsReceived: number = 0;

  // Connection monitoring
  private timeoutCheckInterval: NodeJS.Timeout | null = null;
  private wasConnected: boolean = false;

  // Configuration
  private txIntervalMs: number = HEARTBEAT_TX_INTERVAL_MS;
  private timeoutMs: number = HEARTBEAT_TIMEOUT_MS;
  private checkIntervalMs: number = HEARTBEAT_CHECK_INTERVAL_MS;

  // System IDs
  private sysid: number = SYSID_APP_TESTER;
  private compid: number = COMPID_ALL;

  constructor(
    serialManager: SerialPortManager,
    sysid: number = SYSID_APP_TESTER,
    compid: number = COMPID_ALL,
  ) {
    super();
    this.serialManager = serialManager;
    this.parser = new MAVLinkParser();
    this.sysid = sysid;
    this.compid = compid;
    this.setupDataHandler();
  }

  public start(): void {
    if (this.txInterval) {
      throw new Error('HeartbeatManager already started');
    }
    this.txInterval = setInterval(() => this.sendHeartbeat(), this.txIntervalMs);
    this.timeoutCheckInterval = setInterval(() => this.checkTimeout(), this.checkIntervalMs);
    this.sendHeartbeat();
  }

  public stop(): void {
    if (this.txInterval) {
      clearInterval(this.txInterval);
      this.txInterval = null;
    }
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = null;
    }
    this.wasConnected = false;
  }

  public isStarted(): boolean {
    return this.txInterval !== null;
  }

  public isConnected(): boolean {
    if (!this.lastHeartbeatTime) return false;
    return (Date.now() - this.lastHeartbeatTime) < this.timeoutMs;
  }

  public getLastHeartbeat(): HeartbeatPayload | undefined {
    return this.lastHeartbeat;
  }

  public getTimeSinceLastHeartbeat(): number | undefined {
    if (!this.lastHeartbeatTime) return undefined;
    return Date.now() - this.lastHeartbeatTime;
  }

  public getStatus(): HeartbeatStatus {
    return {
      isSending: this.isStarted(),
      isConnected: this.isConnected(),
      lastHeartbeat: this.lastHeartbeat,
      lastHeartbeatTime: this.lastHeartbeatTime,
      timeSinceLastHeartbeat: this.getTimeSinceLastHeartbeat(),
      heartbeatsSent: this.heartbeatsSent,
      heartbeatsReceived: this.heartbeatsReceived,
      txSeq: this.txSeq,
    };
  }

  public resetStats(): void {
    this.heartbeatsSent = 0;
    this.heartbeatsReceived = 0;
    this.lastHeartbeat = undefined;
    this.lastHeartbeatTime = undefined;
    this.parser.resetStats();
  }

  public getParserStats() {
    return this.parser.getStats();
  }

  public setTxInterval(intervalMs: number): void {
    this.txIntervalMs = intervalMs;
    if (this.txInterval) {
      this.stop();
      this.start();
    }
  }

  public setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Allocate the next uuid for an outgoing request message.
   *
   * Wraps at 2^32 (so the value always fits in a uint32 wire field).
   * Firmware only requires per-recent-window uniqueness for the de-dupe
   * cache, so wrap-around is acceptable in long-running sessions.
   */
  private allocateUuid(): number {
    const uuid = this.nextUuid >>> 0;
    // increment, wrap at 2^32 (back to 1 to avoid 0 which can read as
    // "no uuid yet" in some UI contexts)
    this.nextUuid = ((this.nextUuid + 1) >>> 0) || 1;
    return uuid;
  }

  private sendHeartbeat(): void {
    try {
      const frame = createPcHeartbeat(this.txSeq, this.sysid, this.compid);
      this.serialManager.write(frame);
      this.heartbeatsSent++;
      this.txSeq = (this.txSeq + 1) & 0xFF;
      this.emit('heartbeat-sent', this.txSeq - 1);
    } catch {
      // Ignore write errors (e.g., port closed mid-tick)
    }
  }

  private checkTimeout(): void {
    const connected = this.isConnected();
    if (connected && !this.wasConnected) {
      this.wasConnected = true;
      this.emit('connection-established');
    }
    if (!connected && this.wasConnected) {
      this.wasConnected = false;
      this.emit('connection-lost');
      this.emit('heartbeat-timeout');
    }
  }

  private setupDataHandler(): void {
    this.serialManager.on('data', (data: Buffer) => {
      const messages = this.parser.parseBuffer(new Uint8Array(data));
      for (const message of messages) {
        switch (message.msgid) {
          case MAVLINK_MSG_ID_HEARTBEAT:       this.handleHeartbeat(message); break;
          case MAVLINK_MSG_ID_CHARGER_STATUS:  this.handleChargerStatus(message); break;
          case MAVLINK_MSG_ID_SENSOR_DATA:     this.handleSensorData(message); break;
          case MAVLINK_MSG_ID_METER_DATA:      this.handleMeterData(message); break;
          case MAVLINK_MSG_ID_COMMAND_ACK:     this.handleCommandAck(message); break;
          case MAVLINK_MSG_ID_CONFIG_RESPONSE: this.handleConfigResponse(message); break;
        }
      }
    });
  }

  private handleHeartbeat(message: MAVLinkMessage): void {
    try {
      const payload = decodeHeartbeatPayload(message.payload);
      this.lastHeartbeat = payload;
      this.lastHeartbeatTime = Date.now();
      this.heartbeatsReceived++;
      this.emit('heartbeat-received', payload, message);
    } catch {
      /* ignore decode errors */
    }
  }

  private handleChargerStatus(message: MAVLinkMessage): void {
    try {
      const payload = decodeChargerStatusPayload(message.payload);
      this.emit('charger-status-received', payload, message);
    } catch { /* ignore */ }
  }

  private handleSensorData(message: MAVLinkMessage): void {
    try {
      const payload = decodeSensorDataPayload(message.payload);
      this.emit('sensor-data-received', payload, message);
    } catch { /* ignore */ }
  }

  private handleMeterData(message: MAVLinkMessage): void {
    try {
      const payload = decodeMeterDataPayload(message.payload);
      this.emit('meter-data-received', payload, message);
    } catch { /* ignore */ }
  }

  /**
   * Send CHARGER_COMMAND. uuid is auto-allocated and returned so the
   * caller can correlate the COMMAND_ACK.
   */
  public sendChargerCommand(req: ChargerCommandRequest): number {
    const uuid = this.allocateUuid();
    const payload: ChargerCommandPayload = {
      uuid,
      maxPowerKw: req.maxPowerKw,
      command: req.command,
    };
    const frame = encodeChargerCommand({
      sysid: this.sysid,
      compid: this.compid,
      seq: this.txSeq,
      ...payload,
    });
    this.serialManager.write(frame);
    const sentSeq = this.txSeq;
    this.txSeq = (this.txSeq + 1) & 0xFF;
    this.emit('charger-command-sent', payload, sentSeq);
    return uuid;
  }

  private handleCommandAck(message: MAVLinkMessage): void {
    try {
      const payload = decodeCommandAckPayload(message.payload);
      this.emit('command-ack-received', payload, message);
    } catch { /* ignore */ }
  }

  /**
   * Send CONFIG_REQUEST. uuid is auto-allocated and returned so the
   * caller can correlate the CONFIG_RESPONSE.
   */
  public sendConfigRequest(): number {
    const uuid = this.allocateUuid();
    const frame = encodeConfigRequest({
      sysid: this.sysid,
      compid: this.compid,
      seq: this.txSeq,
      uuid,
    });
    this.serialManager.write(frame);
    const sentSeq = this.txSeq;
    this.txSeq = (this.txSeq + 1) & 0xFF;
    this.emit('config-request-sent', uuid, sentSeq);
    return uuid;
  }

  private handleConfigResponse(message: MAVLinkMessage): void {
    try {
      const payload = decodeConfigResponsePayload(message.payload);
      this.emit('config-response-received', payload, message);
    } catch { /* ignore */ }
  }
}
