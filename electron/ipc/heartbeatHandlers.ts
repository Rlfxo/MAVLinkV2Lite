/**
 * Heartbeat IPC Handlers
 *
 * Registers IPC handlers for heartbeat operations.
 * Forwards heartbeat events from Main to Renderer process.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { HeartbeatManager } from '../serial/HeartbeatManager';
import type { HeartbeatPayload, MAVLinkMessage } from '../protocol/types';

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
}
