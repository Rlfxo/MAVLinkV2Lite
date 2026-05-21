/**
 * Heartbeat IPC Handlers
 *
 * Registers IPC handlers for heartbeat operations.
 * Forwards heartbeat events from Main to Renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { HeartbeatManager, ChargerCommandRequest } from '../serial/HeartbeatManager';
import type {
  HeartbeatPayload, ChargerStatusPayload, SensorDataPayload, MeterDataPayload,
  ChargerCommandPayload, CommandAckPayload, ConfigResponsePayload, MAVLinkMessage,
} from '../protocol/types';

/**
 * Register heartbeat-related IPC handlers
 *
 * @param heartbeatManager - HeartbeatManager instance
 * @param getWindow - Function to get the main BrowserWindow
 */
export function registerHeartbeatHandlers(
  heartbeatManager: HeartbeatManager,
  getWindow: () => BrowserWindow | null,
): void {
  // Get heartbeat status
  ipcMain.handle('heartbeat:get-status', () => {
    return heartbeatManager.getStatus();
  });

  // Get parser statistics
  ipcMain.handle('heartbeat:get-parser-stats', () => {
    return heartbeatManager.getParserStats();
  });

  // Forward heartbeat events to renderer
  heartbeatManager.on('heartbeat-received', (payload: HeartbeatPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('heartbeat:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  heartbeatManager.on('heartbeat-sent', (seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('heartbeat:sent', { seq, timestamp: Date.now() });
    }
  });

  heartbeatManager.on('heartbeat-timeout', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('heartbeat:timeout');
    }
  });

  heartbeatManager.on('connection-established', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('heartbeat:connection-established');
    }
  });

  heartbeatManager.on('connection-lost', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('heartbeat:connection-lost');
    }
  });

  // Forward CHARGER_STATUS events to renderer
  heartbeatManager.on('charger-status-received', (payload: ChargerStatusPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('charger-status:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  // Forward SENSOR_DATA events to renderer
  heartbeatManager.on('sensor-data-received', (payload: SensorDataPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('sensor-data:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  // Forward METER_DATA events to renderer
  heartbeatManager.on('meter-data-received', (payload: MeterDataPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('meter-data:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  // Handle CHARGER_COMMAND send request from renderer.
  // uuid is allocated in main process and returned as the invoke result.
  ipcMain.handle('command:send-charger-command', (_event, req: ChargerCommandRequest): number => {
    return heartbeatManager.sendChargerCommand(req);
  });

  // Forward CHARGER_COMMAND sent event to renderer
  heartbeatManager.on('charger-command-sent', (payload: ChargerCommandPayload, seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('charger-command:sent', {
        payload,
        seq,
        timestamp: Date.now(),
      });
    }
  });

  // Forward COMMAND_ACK received event to renderer
  heartbeatManager.on('command-ack-received', (payload: CommandAckPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('command-ack:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  // Handle CONFIG_REQUEST send request from renderer.
  // uuid is allocated in main process and returned as the invoke result.
  ipcMain.handle('config:send-request', (): number => {
    return heartbeatManager.sendConfigRequest();
  });

  // Forward CONFIG_REQUEST sent event to renderer (includes the allocated uuid)
  heartbeatManager.on('config-request-sent', (uuid: number, seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-request:sent', { uuid, seq, timestamp: Date.now() });
    }
  });

  // Forward CONFIG_RESPONSE received event to renderer
  heartbeatManager.on('config-response-received', (payload: ConfigResponsePayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-response:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });
}
