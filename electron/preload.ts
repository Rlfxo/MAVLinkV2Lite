/**
 * Electron Preload Script
 *
 * Exposes a type-safe API to the renderer process via contextBridge.
 * All IPC communication goes through this bridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Electron API exposed to renderer via window.electron
 */
const electronAPI = {
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:list-ports'),
    connect: (path: string) => ipcRenderer.invoke('serial:connect', path),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    getStatus: () => ipcRenderer.invoke('serial:get-status'),
    onError: (callback: (message: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('serial:error', handler);
      return () => ipcRenderer.removeListener('serial:error', handler);
    },
    onClosed: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('serial:closed', handler);
      return () => ipcRenderer.removeListener('serial:closed', handler);
    },
  },
  heartbeat: {
    getStatus: () => ipcRenderer.invoke('heartbeat:get-status'),
    getParserStats: () => ipcRenderer.invoke('heartbeat:get-parser-stats'),
    onReceived: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('heartbeat:received', handler);
      return () => ipcRenderer.removeListener('heartbeat:received', handler);
    },
    onSent: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('heartbeat:sent', handler);
      return () => ipcRenderer.removeListener('heartbeat:sent', handler);
    },
    onTimeout: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('heartbeat:timeout', handler);
      return () => ipcRenderer.removeListener('heartbeat:timeout', handler);
    },
    onConnectionEstablished: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('heartbeat:connection-established', handler);
      return () => ipcRenderer.removeListener('heartbeat:connection-established', handler);
    },
    onConnectionLost: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('heartbeat:connection-lost', handler);
      return () => ipcRenderer.removeListener('heartbeat:connection-lost', handler);
    },
  },
  chargerStatus: {
    onReceived: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('charger-status:received', handler);
      return () => ipcRenderer.removeListener('charger-status:received', handler);
    },
  },
  sensorData: {
    onReceived: (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on('sensor-data:received', handler);
      return () => ipcRenderer.removeListener('sensor-data:received', handler);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);
