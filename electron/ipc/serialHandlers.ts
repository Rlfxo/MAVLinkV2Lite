/**
 * Serial IPC Handlers
 *
 * Registers IPC handlers for serial port operations.
 * Bridges Renderer process requests to SerialPortManager.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { SerialPortManager } from '../serial/SerialPortManager';
import { HeartbeatManager } from '../serial/HeartbeatManager';

/**
 * Register serial-related IPC handlers
 *
 * @param serialManager - SerialPortManager instance
 * @param heartbeatManager - HeartbeatManager instance
 * @param getWindow - Function to get the main BrowserWindow
 */
export function registerSerialHandlers(
  serialManager: SerialPortManager,
  heartbeatManager: HeartbeatManager,
  getWindow: () => BrowserWindow | null,
): void {
  // List available serial ports
  ipcMain.handle('serial:list-ports', async () => {
    const ports = await SerialPortManager.listPorts();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      vendorId: p.vendorId,
      productId: p.productId,
      locationId: p.locationId,
    }));
  });

  // Connect to serial port
  ipcMain.handle('serial:connect', async (_event, path: string) => {
    await serialManager.connect(path);
    heartbeatManager.start();
  });

  // Disconnect from serial port
  ipcMain.handle('serial:disconnect', async () => {
    heartbeatManager.stop();
    if (serialManager.isOpen()) {
      await serialManager.disconnect();
    }
  });

  // Get serial status
  ipcMain.handle('serial:get-status', () => {
    return serialManager.getStatus();
  });

  // Forward serial errors to renderer
  serialManager.on('error', (error: Error) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('serial:error', error.message);
    }
  });

  serialManager.on('close', () => {
    heartbeatManager.stop();
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('serial:closed');
    }
  });
}
