/**
 * useHeartbeat Hook
 *
 * Subscribes to heartbeat events from Electron main process.
 * Updates app state on heartbeat received/sent/timeout/connection changes.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ConnectionState } from '../../electron/protocol/types';
import type { HeartbeatReceivedData, HeartbeatSentData } from '../types/electron';
import type { MessageLogEntry } from '../context/appReducer';

let logIdCounter = 0;

export function useHeartbeat() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubReceived = window.electron.heartbeat.onReceived((data: HeartbeatReceivedData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'RX',
        seq: data.seq,
        sysid: data.sysid,
        compid: data.compid,
        type: data.payload.type,
        systemStatus: data.payload.systemStatus,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubSent = window.electron.heartbeat.onSent((data: HeartbeatSentData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'TX',
        seq: data.seq,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubTimeout = window.electron.heartbeat.onTimeout(() => {
      dispatchRef.current({ type: 'SET_CONNECTION_STATE', payload: 'timeout' as ConnectionState });
    });

    const unsubEstablished = window.electron.heartbeat.onConnectionEstablished(() => {
      dispatchRef.current({ type: 'SET_CONNECTION_STATE', payload: 'synchronized' as ConnectionState });
    });

    const unsubLost = window.electron.heartbeat.onConnectionLost(() => {
      dispatchRef.current({ type: 'SET_CONNECTION_STATE', payload: 'timeout' as ConnectionState });
    });

    return () => {
      unsubReceived();
      unsubSent();
      unsubTimeout();
      unsubEstablished();
      unsubLost();
    };
  }, []);
}
