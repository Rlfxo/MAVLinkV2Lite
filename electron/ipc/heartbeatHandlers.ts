/**
 * Heartbeat IPC Handlers
 *
 * Registers IPC handlers for heartbeat operations.
 * Forwards heartbeat events from Main to Renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { HeartbeatManager } from '../serial/HeartbeatManager';
import type {
  HeartbeatPayload, ChargerStatusPayload, SensorDataPayload, ChargerCommandPayload,
  CommandAckPayload, ConfigResponsePayload, MAVLinkMessage,
  EvccStatusPayload, EvccChargingAcPayload, EvccChargingDcPayload,
  EvccCommandPayload, EvccEvParamsPayload, EvccCommandAckPayload, EvccConfigResponsePayload,
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

  // Handle CHARGER_COMMAND send request from renderer
  ipcMain.handle('command:send-charger-command', (_event, payload: ChargerCommandPayload) => {
    heartbeatManager.sendChargerCommand(payload);
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

  // Handle CONFIG_REQUEST send request from renderer
  ipcMain.handle('config:send-request', () => {
    heartbeatManager.sendConfigRequest();
  });

  // Forward CONFIG_REQUEST sent event to renderer
  heartbeatManager.on('config-request-sent', (seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-request:sent', { seq, timestamp: Date.now() });
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

  // ==== EVCC Events ====

  heartbeatManager.on('evcc-status-received', (payload: EvccStatusPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-status:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  heartbeatManager.on('evcc-charging-ac-received', (payload: EvccChargingAcPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-charging-ac:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  heartbeatManager.on('evcc-charging-dc-received', (payload: EvccChargingDcPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-charging-dc:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  heartbeatManager.on('evcc-command-sent', (payload: EvccCommandPayload, seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-command:sent', { payload, seq, timestamp: Date.now() });
    }
  });

  heartbeatManager.on('evcc-ev-params-sent', (payload: EvccEvParamsPayload, seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-ev-params:sent', { payload, seq, timestamp: Date.now() });
    }
  });

  heartbeatManager.on('evcc-command-ack-received', (payload: EvccCommandAckPayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-command-ack:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  heartbeatManager.on('evcc-config-request-sent', (seq: number) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-config-request:sent', { seq, timestamp: Date.now() });
    }
  });

  heartbeatManager.on('evcc-config-response-received', (payload: EvccConfigResponsePayload, message: MAVLinkMessage) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('evcc-config-response:received', {
        payload,
        seq: message.seq,
        sysid: message.sysid,
        compid: message.compid,
        timestamp: Date.now(),
      });
    }
  });

  // ==== EVCC Command IPC Handlers ====

  ipcMain.handle('evcc:send-command', (_event, payload: EvccCommandPayload) => {
    heartbeatManager.sendEvccCommand(payload);
  });

  ipcMain.handle('evcc:send-ev-params', (_event, payload: EvccEvParamsPayload) => {
    heartbeatManager.sendEvccEvParams(payload);
  });

  ipcMain.handle('evcc:send-config-request', () => {
    heartbeatManager.sendEvccConfigRequest();
  });
}
