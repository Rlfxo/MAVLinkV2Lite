/**
 * useEvccCommand Hook
 *
 * Subscribes to EVCC command sent and EVCC COMMAND_ACK received events.
 * Logs TX commands to MessageLog and updates ACK state in appReducer.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { EvccCommandSentData, EvccCommandAckReceivedData, EvccConfigRequestSentData, EvccConfigResponseReceivedData } from '../types/electron';
import type { MessageLogEntry } from '../context/appReducer';

let logIdCounter = 5000; // Offset to avoid collision with other log IDs

export function useEvccCommand() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubSent = window.electron.evccCommand.onSent((data: EvccCommandSentData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'TX',
        seq: data.seq,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubAck = window.electron.evccCommandAck.onReceived((data: EvccCommandAckReceivedData) => {
      dispatchRef.current({ type: 'SET_EVCC_COMMAND_ACK', payload: data.payload });

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

    const unsubCfgSent = window.electron.evccConfig.onRequestSent((data: EvccConfigRequestSentData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'TX',
        seq: data.seq,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubCfgResponse = window.electron.evccConfig.onResponseReceived((data: EvccConfigResponseReceivedData) => {
      dispatchRef.current({ type: 'SET_EVCC_CONFIG_RESPONSE', payload: data.payload });

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
      unsubAck();
      unsubCfgSent();
      unsubCfgResponse();
    };
  }, []);
}
