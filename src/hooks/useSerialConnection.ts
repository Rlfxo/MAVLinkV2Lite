/**
 * useSerialConnection Hook
 *
 * Manages serial port listing, connection, disconnection,
 * and periodic status polling.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ConnectionState } from '../../electron/protocol/types';

const POLL_INTERVAL_MS = 1000;

export function useSerialConnection() {
  const { state, dispatch } = useAppContext();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scan available ports
  const scanPorts = useCallback(async () => {
    try {
      const ports = await window.electron.serial.listPorts();
      dispatch({ type: 'SET_AVAILABLE_PORTS', payload: ports });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: `Port scan failed: ${err}` });
    }
  }, [dispatch]);

  // Connect to selected port
  const connect = useCallback(async () => {
    if (!state.selectedPort) return;
    dispatch({ type: 'SET_CONNECTING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await window.electron.serial.connect(state.selectedPort);
      dispatch({ type: 'SET_CONNECTION_STATE', payload: 'connected' as ConnectionState });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: `Connection failed: ${err}` });
      dispatch({ type: 'SET_CONNECTION_STATE', payload: 'error' as ConnectionState });
    } finally {
      dispatch({ type: 'SET_CONNECTING', payload: false });
    }
  }, [state.selectedPort, dispatch]);

  // Disconnect
  const disconnect = useCallback(async () => {
    try {
      await window.electron.serial.disconnect();
      dispatch({ type: 'SET_CONNECTION_STATE', payload: 'disconnected' as ConnectionState });
      dispatch({ type: 'SET_SERIAL_STATUS', payload: { isOpen: false, bytesReceived: 0, bytesTransmitted: 0 } });
      dispatch({ type: 'SET_HEARTBEAT_STATUS', payload: null! });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: `Disconnect failed: ${err}` });
    }
  }, [dispatch]);

  // Status polling
  useEffect(() => {
    const poll = async () => {
      try {
        const serialStatus = await window.electron.serial.getStatus();
        dispatch({ type: 'SET_SERIAL_STATUS', payload: serialStatus });

        if (serialStatus.isOpen) {
          const hbStatus = await window.electron.heartbeat.getStatus();
          dispatch({ type: 'SET_HEARTBEAT_STATUS', payload: hbStatus });

          const parserStats = await window.electron.heartbeat.getParserStats();
          dispatch({ type: 'SET_PARSER_STATS', payload: parserStats });
        }
      } catch {
        // Ignore poll errors
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [dispatch]);

  // Listen for serial error/close events
  useEffect(() => {
    const unsubError = window.electron.serial.onError((msg) => {
      dispatch({ type: 'SET_ERROR', payload: msg });
    });
    const unsubClosed = window.electron.serial.onClosed(() => {
      dispatch({ type: 'SET_CONNECTION_STATE', payload: 'disconnected' as ConnectionState });
    });
    return () => {
      unsubError();
      unsubClosed();
    };
  }, [dispatch]);

  // Scan ports on mount
  useEffect(() => {
    scanPorts();
  }, [scanPorts]);

  return { scanPorts, connect, disconnect };
}
