/**
 * useChargerData Hook
 *
 * Subscribes to CHARGER_STATUS (10 Hz), SENSOR_DATA (2 Hz), and METER_DATA
 * (2 Hz) events from the Electron main process and stores the latest payload
 * in app state. Not logged to MessageLog (high-frequency).
 */

import { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type {
  ChargerStatusReceivedData,
  SensorDataReceivedData,
  MeterDataReceivedData,
} from '../types/electron';

export function useChargerData() {
  const { dispatch } = useAppContext();
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  useEffect(() => {
    const unsubChargerStatus = window.electron.chargerStatus.onReceived(
      (data: ChargerStatusReceivedData) => {
        dispatchRef.current({ type: 'SET_CHARGER_STATUS', payload: data.payload });
      },
    );

    const unsubSensorData = window.electron.sensorData.onReceived(
      (data: SensorDataReceivedData) => {
        dispatchRef.current({ type: 'SET_SENSOR_DATA', payload: data.payload });
      },
    );

    const unsubMeterData = window.electron.meterData.onReceived(
      (data: MeterDataReceivedData) => {
        dispatchRef.current({ type: 'SET_METER_DATA', payload: data.payload });
      },
    );

    return () => {
      unsubChargerStatus();
      unsubSensorData();
      unsubMeterData();
    };
  }, []);
}
