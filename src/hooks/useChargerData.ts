/**
 * useChargerData Hook
 *
 * Subscribes to CHARGER_STATUS and SENSOR_DATA events from Electron main process.
 * Updates app state with latest values (no message log — too high frequency).
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { ChargerStatusReceivedData, SensorDataReceivedData } from '../types/electron';

export function useChargerData() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubChargerStatus = window.electron.chargerStatus.onReceived((data: ChargerStatusReceivedData) => {
      dispatchRef.current({ type: 'SET_CHARGER_STATUS', payload: data.payload });
    });

    const unsubSensorData = window.electron.sensorData.onReceived((data: SensorDataReceivedData) => {
      dispatchRef.current({ type: 'SET_SENSOR_DATA', payload: data.payload });
    });

    return () => {
      unsubChargerStatus();
      unsubSensorData();
    };
  }, []);
}
