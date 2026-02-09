/**
 * Electron Main Process
 *
 * Creates the BrowserWindow and initializes serial communication managers.
 * Registers IPC handlers for renderer-main communication.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { SerialPortManager } from './serial/SerialPortManager';
import { HeartbeatManager } from './serial/HeartbeatManager';
import { registerSerialHandlers } from './ipc/serialHandlers';
import { registerHeartbeatHandlers } from './ipc/heartbeatHandlers';

let mainWindow: BrowserWindow | null = null;
const serialManager = new SerialPortManager();
const heartbeatManager = new HeartbeatManager(serialManager);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'MAVLink V2 Lite Monitor',
  });

  const getWindow = () => mainWindow;

  // Register IPC handlers
  registerSerialHandlers(serialManager, heartbeatManager, getWindow);
  registerHeartbeatHandlers(heartbeatManager, getWindow);

  // Load renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Cleanup
  heartbeatManager.stop();
  if (serialManager.isOpen()) {
    serialManager.disconnect().catch(() => {});
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
