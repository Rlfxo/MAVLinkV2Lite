/**
 * Heartbeat Manager
 *
 * Manages MAVLink HEARTBEAT message transmission and reception.
 * Monitors connection status with timeout detection.
 */

import { EventEmitter } from 'events';
import { SerialPortManager } from './SerialPortManager';
import { MAVLinkParser } from '../protocol/parser';
import { createPcHeartbeat, decodeHeartbeatPayload, decodeChargerStatusPayload, decodeSensorDataPayload, encodeChargerCommand, decodeCommandAckPayload } from '../protocol/encoder';
import {
  MAVLINK_MSG_ID_HEARTBEAT,
  MAVLINK_MSG_ID_CHARGER_STATUS,
  MAVLINK_MSG_ID_SENSOR_DATA,
  MAVLINK_MSG_ID_COMMAND_ACK,
  HEARTBEAT_TX_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_CHECK_INTERVAL_MS,
} from '../protocol/constants';
import type { HeartbeatPayload, ChargerStatusPayload, SensorDataPayload, ChargerCommandPayload, CommandAckPayload, MAVLinkMessage } from '../protocol/types';

/**
 * Heartbeat Manager Events
 *
 * - 'heartbeat-sent': Emitted when HEARTBEAT is transmitted (seq: number)
 * - 'heartbeat-received': Emitted when HEARTBEAT is received (payload: HeartbeatPayload)
 * - 'heartbeat-timeout': Emitted when no HEARTBEAT received within timeout period
 * - 'connection-established': Emitted when first HEARTBEAT is received after connection
 * - 'connection-lost': Emitted when connection times out
 */
export interface HeartbeatManagerEvents {
  'heartbeat-sent': (seq: number) => void;
  'heartbeat-received': (payload: HeartbeatPayload, message: MAVLinkMessage) => void;
  'heartbeat-timeout': () => void;
  'connection-established': () => void;
  'connection-lost': () => void;
  'charger-status-received': (payload: ChargerStatusPayload, message: MAVLinkMessage) => void;
  'sensor-data-received': (payload: SensorDataPayload, message: MAVLinkMessage) => void;
  'charger-command-sent': (payload: ChargerCommandPayload, seq: number) => void;
  'command-ack-received': (payload: CommandAckPayload, message: MAVLinkMessage) => void;
}

/**
 * Heartbeat Status
 */
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
 * HeartbeatManager
 *
 * Manages bidirectional HEARTBEAT communication:
 * - Sends HEARTBEAT every 1000ms (configurable)
 * - Receives and parses HEARTBEAT from remote system
 * - Monitors connection status with timeout detection
 *
 * @example
 * ```typescript
 * const serialManager = new SerialPortManager();
 * await serialManager.connect('/dev/ttyUSB0');
 *
 * const heartbeatManager = new HeartbeatManager(serialManager);
 *
 * heartbeatManager.on('heartbeat-received', (payload) => {
 *   console.log('Remote heartbeat:', payload);
 * });
 *
 * heartbeatManager.on('heartbeat-timeout', () => {
 *   console.log('Connection lost!');
 * });
 *
 * heartbeatManager.start();
 * ```
 */
export class HeartbeatManager extends EventEmitter {
  private serialManager: SerialPortManager;
  private parser: MAVLinkParser;

  // TX (Transmission)
  private txInterval: NodeJS.Timeout | null = null;
  private txSeq: number = 0;
  private heartbeatsSent: number = 0;

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
  private sysid: number = 255; // PC system ID
  private compid: number = 0;  // Main component

  /**
   * Create HeartbeatManager
   *
   * @param serialManager - SerialPortManager instance
   * @param sysid - System ID for outgoing messages (default: 255 for PC)
   * @param compid - Component ID for outgoing messages (default: 0)
   */
  constructor(serialManager: SerialPortManager, sysid: number = 255, compid: number = 0) {
    super();
    this.serialManager = serialManager;
    this.parser = new MAVLinkParser();
    this.sysid = sysid;
    this.compid = compid;

    // Setup serial data handler
    this.setupDataHandler();
  }

  /**
   * Start heartbeat transmission and monitoring
   */
  public start(): void {
    if (this.txInterval) {
      throw new Error('HeartbeatManager already started');
    }

    // Start TX scheduler (1000ms)
    this.txInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.txIntervalMs);

    // Start timeout checker
    this.timeoutCheckInterval = setInterval(() => {
      this.checkTimeout();
    }, this.checkIntervalMs);

    // Send first heartbeat immediately
    this.sendHeartbeat();
  }

  /**
   * Stop heartbeat transmission and monitoring
   */
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

  /**
   * Check if heartbeat manager is running
   *
   * @returns true if started
   */
  public isStarted(): boolean {
    return this.txInterval !== null;
  }

  /**
   * Check if remote system is connected (heartbeat received recently)
   *
   * @returns true if connected (heartbeat received within timeout period)
   */
  public isConnected(): boolean {
    if (!this.lastHeartbeatTime) {
      return false;
    }

    const timeSince = Date.now() - this.lastHeartbeatTime;
    return timeSince < this.timeoutMs;
  }

  /**
   * Get last received heartbeat payload
   *
   * @returns Last heartbeat payload or undefined if none received
   */
  public getLastHeartbeat(): HeartbeatPayload | undefined {
    return this.lastHeartbeat;
  }

  /**
   * Get time since last heartbeat (milliseconds)
   *
   * @returns Time since last heartbeat or undefined if none received
   */
  public getTimeSinceLastHeartbeat(): number | undefined {
    if (!this.lastHeartbeatTime) {
      return undefined;
    }

    return Date.now() - this.lastHeartbeatTime;
  }

  /**
   * Get heartbeat status
   *
   * @returns Current heartbeat status
   */
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

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.heartbeatsSent = 0;
    this.heartbeatsReceived = 0;
    this.lastHeartbeat = undefined;
    this.lastHeartbeatTime = undefined;
    this.parser.resetStats();
  }

  /**
   * Get parser statistics
   *
   * @returns Parser statistics
   */
  public getParserStats() {
    return this.parser.getStats();
  }

  /**
   * Configure TX interval
   *
   * @param intervalMs - TX interval in milliseconds (default: 1000)
   */
  public setTxInterval(intervalMs: number): void {
    this.txIntervalMs = intervalMs;

    // Restart interval if already running
    if (this.txInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Configure timeout threshold
   *
   * @param timeoutMs - Timeout in milliseconds (default: 3000)
   */
  public setTimeout(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Send HEARTBEAT message
   *
   * @private
   */
  private sendHeartbeat(): void {
    try {
      const frame = createPcHeartbeat(this.txSeq, this.sysid, this.compid);
      this.serialManager.write(frame);

      this.heartbeatsSent++;
      this.txSeq = (this.txSeq + 1) & 0xFF; // Wrap at 255

      this.emit('heartbeat-sent', this.txSeq - 1);
    } catch (error) {
      // Ignore write errors (e.g., port closed)
      // This allows graceful handling if port is closed while heartbeat is running
    }
  }

  /**
   * Check for heartbeat timeout
   *
   * @private
   */
  private checkTimeout(): void {
    const connected = this.isConnected();

    // Connection established (first heartbeat received)
    if (connected && !this.wasConnected) {
      this.wasConnected = true;
      this.emit('connection-established');
    }

    // Connection lost (timeout)
    if (!connected && this.wasConnected) {
      this.wasConnected = false;
      this.emit('connection-lost');
      this.emit('heartbeat-timeout');
    }
  }

  /**
   * Setup serial data handler
   *
   * @private
   */
  private setupDataHandler(): void {
    this.serialManager.on('data', (data: Buffer) => {
      // Parse incoming data
      const messages = this.parser.parseBuffer(new Uint8Array(data));

      // Process each parsed message
      for (const message of messages) {
        if (message.msgid === MAVLINK_MSG_ID_HEARTBEAT) {
          this.handleHeartbeat(message);
        } else if (message.msgid === MAVLINK_MSG_ID_CHARGER_STATUS) {
          this.handleChargerStatus(message);
        } else if (message.msgid === MAVLINK_MSG_ID_SENSOR_DATA) {
          this.handleSensorData(message);
        } else if (message.msgid === MAVLINK_MSG_ID_COMMAND_ACK) {
          this.handleCommandAck(message);
        }
      }
    });
  }

  /**
   * Handle received HEARTBEAT message
   *
   * @param message - Parsed MAVLink message
   * @private
   */
  private handleHeartbeat(message: MAVLinkMessage): void {
    try {
      const payload = decodeHeartbeatPayload(message.payload);

      this.lastHeartbeat = payload;
      this.lastHeartbeatTime = Date.now();
      this.heartbeatsReceived++;

      this.emit('heartbeat-received', payload, message);
    } catch (error) {
      // Ignore decode errors (invalid payload length, etc.)
    }
  }

  /**
   * Handle received CHARGER_STATUS message
   */
  private handleChargerStatus(message: MAVLinkMessage): void {
    try {
      const payload = decodeChargerStatusPayload(message.payload);
      this.emit('charger-status-received', payload, message);
    } catch (error) {
      // Ignore decode errors
    }
  }

  /**
   * Handle received SENSOR_DATA message
   */
  private handleSensorData(message: MAVLinkMessage): void {
    try {
      const payload = decodeSensorDataPayload(message.payload);
      this.emit('sensor-data-received', payload, message);
    } catch (error) {
      // Ignore decode errors
    }
  }

  /**
   * Send CHARGER_COMMAND message (on-demand, not periodic)
   */
  public sendChargerCommand(commandPayload: ChargerCommandPayload): void {
    const frame = encodeChargerCommand({
      sysid: this.sysid,
      compid: this.compid,
      seq: this.txSeq,
      ...commandPayload,
    });
    this.serialManager.write(frame);
    const sentSeq = this.txSeq;
    this.txSeq = (this.txSeq + 1) & 0xFF;
    this.emit('charger-command-sent', commandPayload, sentSeq);
  }

  /**
   * Handle received COMMAND_ACK message
   */
  private handleCommandAck(message: MAVLinkMessage): void {
    try {
      const payload = decodeCommandAckPayload(message.payload);
      this.emit('command-ack-received', payload, message);
    } catch (error) {
      // Ignore decode errors
    }
  }
}
