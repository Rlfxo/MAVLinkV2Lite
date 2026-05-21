/**
 * useHeartbeat Hook
 *
 * Subscribes to heartbeat events from Electron main process.
 * Updates app state on heartbeat received/sent/timeout/connection changes.
 * Detects charger model from heartbeat COMPID.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ConnectionState } from '../../electron/protocol/types';
import {
  SYSID_CHARGER,
  COMPID_DURA,
  COMPID_MOOEV,
  COMPID_PARKY,
} from '../../electron/protocol/constants';
import type { HeartbeatReceivedData, HeartbeatSentData } from '../types/electron';
import type { MessageLogEntry, ChargerModel } from '../context/appReducer';

let logIdCounter = 0;

function compidToModel(compid: number): ChargerModel {
  switch (compid) {
    case COMPID_DURA:  return 'dura';
    case COMPID_MOOEV: return 'mooev';
    case COMPID_PARKY: return 'parky';
    default:           return 'unknown';
  }
}

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
        systemStatus: data.payload.systemStatus,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });

      // Charger model detection from COMPID on charger heartbeats
      if (data.sysid === SYSID_CHARGER) {
        dispatchRef.current({ type: 'SET_DETECTED_MODEL', payload: compidToModel(data.compid) });
      }
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
