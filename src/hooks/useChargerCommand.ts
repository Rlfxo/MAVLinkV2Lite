/**
 * useChargerCommand Hook
 *
 * Subscribes to CHARGER_COMMAND sent and COMMAND_ACK received events.
 * Logs TX commands to MessageLog and updates ACK state in appReducer.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ChargerCommandSentData, CommandAckReceivedData } from '../types/electron';
import type { MessageLogEntry } from '../context/appReducer';

let logIdCounter = 1000; // Offset to avoid collision with heartbeat log IDs

export function useChargerCommand() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubSent = window.electron.chargerCommand.onSent((data: ChargerCommandSentData) => {
      const entry: MessageLogEntry = {
        id: ++logIdCounter,
        timestamp: data.timestamp,
        direction: 'TX',
        seq: data.seq,
      };
      dispatchRef.current({ type: 'ADD_MESSAGE_LOG', payload: entry });
    });

    const unsubAck = window.electron.commandAck.onReceived((data: CommandAckReceivedData) => {
      dispatchRef.current({ type: 'SET_COMMAND_ACK', payload: data.payload });

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
    };
  }, []);
}
