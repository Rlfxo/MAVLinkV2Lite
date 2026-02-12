/**
 * useConfig Hook
 *
 * Subscribes to CONFIG_REQUEST sent and CONFIG_RESPONSE received events.
 * Logs TX request to MessageLog and updates config state in appReducer.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ConfigRequestSentData, ConfigResponseReceivedData } from '../types/electron';
import type { MessageLogEntry } from '../context/appReducer';

let logIdCounter = 3000; // Offset to avoid collision with other log IDs

export function useConfig() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubSent = window.electron.config.onRequestSent((data: ConfigRequestSentData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'TX',
        seq: data.seq,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubResponse = window.electron.config.onResponseReceived((data: ConfigResponseReceivedData) => {
      dispatchRef.current({ type: 'SET_CONFIG_RESPONSE', payload: data.payload });

      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'RX',
        seq: data.seq,
        sysid: data.sysid,
        compid: data.compid,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    return () => {
      unsubSent();
      unsubResponse();
    };
  }, []);
}
