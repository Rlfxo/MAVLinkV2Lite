/**
 * Serial Port Manager
 *
 * Manages serial port connection and data transmission for MAVLink communication.
 * Built on top of the serialport library with EventEmitter for async events.
 */

import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
// @ts-ignore - bindings-interface types exist but export resolution fails
import type { PortInfo as SerialPortInfo } from '@serialport/bindings-interface';
import {
  SERIAL_BAUD_RATE,
  SERIAL_DATA_BITS,
  SERIAL_PARITY,
  SERIAL_STOP_BITS,
} from '../protocol/constants';

/**
 * Serial Port Manager Events
 *
 * - 'data': Emitted when data is received (Buffer)
 * - 'open': Emitted when port is successfully opened
 * - 'close': Emitted when port is closed
 * - 'error': Emitted on error (Error)
 */
export interface SerialPortManagerEvents {
  data: (data: Buffer) => void;
  open: () => void;
  close: () => void;
  error: (error: Error) => void;
}

/**
 * Serial Port Configuration
 */
export interface SerialConfig {
  baudRate?: number;
  dataBits?: 8 | 7 | 6 | 5;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  stopBits?: 1 | 2;
}

/**
 * Serial Port Status
 */
export interface SerialStatus {
  isOpen: boolean;
  path?: string;
  bytesReceived: number;
  bytesTransmitted: number;
  lastActivityTime?: number;
}

/**
 * SerialPortManager
 *
 * Manages serial port lifecycle and provides a clean interface for
 * MAVLink communication over UART.
 *
 * @example
 * ```typescript
 * const manager = new SerialPortManager();
 *
 * // List available ports
 * const ports = await manager.listPorts();
 * console.log('Available ports:', ports);
 *
 * // Connect
 * await manager.connect('/dev/ttyUSB0');
 *
 * // Listen for data
 * manager.on('data', (data: Buffer) => {
 *   console.log('Received:', data);
 * });
 *
 * // Send data
 * manager.write(new Uint8Array([0xFC, 0x07, ...]));
 *
 * // Disconnect
 * await manager.disconnect();
 * ```
 */
export class SerialPortManager extends EventEmitter {
  private port: SerialPort | null = null;
  private currentPath: string | null = null;

  // Statistics
  private bytesReceived: number = 0;
  private bytesTransmitted: number = 0;
  private lastActivityTime?: number;

  /**
   * List available serial ports
   *
   * @returns Array of available serial port information
   */
  public static async listPorts(): Promise<SerialPortInfo[]> {
    return await SerialPort.list();
  }

  /**
   * Connect to a serial port
   *
   * @param path - Serial port path (e.g., /dev/ttyUSB0, COM3)
   * @param config - Optional serial port configuration
   * @throws Error if already connected or connection fails
   */
  public async connect(path: string, config?: SerialConfig): Promise<void> {
    if (this.port?.isOpen) {
      throw new Error(`Already connected to ${this.currentPath}`);
    }

    // Create serial port with configuration
    this.port = new SerialPort({
      path,
      baudRate: config?.baudRate ?? SERIAL_BAUD_RATE,
      dataBits: config?.dataBits ?? SERIAL_DATA_BITS,
      parity: config?.parity ?? SERIAL_PARITY,
      stopBits: config?.stopBits ?? SERIAL_STOP_BITS,
      autoOpen: false,
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Open port
    return new Promise((resolve, reject) => {
      this.port!.open((error) => {
        if (error) {
          this.port = null;
          this.currentPath = null;
          reject(new Error(`Failed to open port ${path}: ${error.message}`));
        } else {
          this.currentPath = path;
          this.emit('open');
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from the serial port
   *
   * @throws Error if not connected or disconnect fails
   */
  public async disconnect(): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.port!.close((error) => {
        if (error) {
          reject(new Error(`Failed to close port: ${error.message}`));
        } else {
          this.port = null;
          this.currentPath = null;
          this.emit('close');
          resolve();
        }
      });
    });
  }

  /**
   * Write data to the serial port
   *
   * @param data - Data to write (Uint8Array or Buffer)
   * @returns Number of bytes written
   * @throws Error if not connected or write fails
   */
  public write(data: Uint8Array | Buffer): number {
    if (!this.port?.isOpen) {
      throw new Error('Not connected');
    }

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const bytesWritten = this.port.write(buffer);

    if (bytesWritten) {
      this.bytesTransmitted += buffer.length;
      this.lastActivityTime = Date.now();
    }

    return bytesWritten ? buffer.length : 0;
  }

  /**
   * Check if port is open
   *
   * @returns true if port is open and ready
   */
  public isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  /**
   * Get current serial port status
   *
   * @returns Current status information
   */
  public getStatus(): SerialStatus {
    return {
      isOpen: this.isOpen(),
      path: this.currentPath ?? undefined,
      bytesReceived: this.bytesReceived,
      bytesTransmitted: this.bytesTransmitted,
      lastActivityTime: this.lastActivityTime,
    };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.bytesReceived = 0;
    this.bytesTransmitted = 0;
    this.lastActivityTime = undefined;
  }

  /**
   * Get current port path
   *
   * @returns Current port path or null if not connected
   */
  public getPath(): string | null {
    return this.currentPath;
  }

  /**
   * Setup event handlers for the serial port
   *
   * @private
   */
  private setupEventHandlers(): void {
    if (!this.port) return;

    // Data received
    this.port.on('data', (data: Buffer) => {
      this.bytesReceived += data.length;
      this.lastActivityTime = Date.now();
      this.emit('data', data);
    });

    // Port closed
    this.port.on('close', () => {
      this.emit('close');
    });

    // Error
    this.port.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Drain the output buffer
   *
   * Waits for all data to be transmitted before resolving.
   *
   * @returns Promise that resolves when drain is complete
   */
  public async drain(): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.port!.drain((error) => {
        if (error) {
          reject(new Error(`Failed to drain: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Flush input/output buffers
   *
   * @returns Promise that resolves when flush is complete
   */
  public async flush(): Promise<void> {
    if (!this.port?.isOpen) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.port!.flush((error) => {
        if (error) {
          reject(new Error(`Failed to flush: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}
