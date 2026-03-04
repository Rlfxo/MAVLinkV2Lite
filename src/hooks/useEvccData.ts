/**
 * useEvccData Hook
 *
 * Subscribes to EVCC_STATUS, EVCC_CHARGING_AC, and EVCC_CHARGING_DC events.
 * Updates app state with latest EVCC values.
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type {
  EvccStatusReceivedData,
  EvccChargingAcReceivedData,
  EvccChargingDcReceivedData,
} from '../types/electron';

export function useEvccData() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubStatus = window.electron.evccStatus.onReceived((data: EvccStatusReceivedData) => {
      dispatchRef.current({ type: 'SET_EVCC_STATUS', payload: data.payload });
    });

    const unsubAc = window.electron.evccChargingAc.onReceived((data: EvccChargingAcReceivedData) => {
      dispatchRef.current({ type: 'SET_EVCC_CHARGING_AC', payload: data.payload });
    });

    const unsubDc = window.electron.evccChargingDc.onReceived((data: EvccChargingDcReceivedData) => {
      dispatchRef.current({ type: 'SET_EVCC_CHARGING_DC', payload: data.payload });
    });

    return () => {
      unsubStatus();
      unsubAc();
      unsubDc();
    };
  }, []);
}
