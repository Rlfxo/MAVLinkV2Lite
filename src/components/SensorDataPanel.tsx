/**
 * Sensor Data Panel
 *
 * Displays the latest SENSOR_DATA (MSG_ID: 10002) data — 53 B, all fixed_t
 * (except dcgf_fault u16 and imd_stop_mode u8). Power-meter readings live
 * in MeterDataPanel.
 */

import { useAppContext } from '../context/AppContext';
import { fixedToFloat } from '../../electron/protocol/encoder';
import type { FixedT } from '../../electron/protocol/types';

function fmtFixed(ft: FixedT | undefined, unit: string, digits = 2): string {
  if (!ft) return '-';
  return `${fixedToFloat(ft).toFixed(digits)} ${unit}`;
}

function fmtFixedV(ft: FixedT | undefined): string {
  if (!ft) return '-';
  // DCGF voltages: 1 decimal place is enough at 0.1 V LSB
  return `${fixedToFloat(ft).toFixed(1)} V`;
}

function fmtInt(v: number | undefined, unit: string): string {
  if (v == null) return '-';
  return unit ? `${v} ${unit}` : String(v);
}

export function SensorDataPanel() {
  const { state } = useAppContext();
  const sd = state.lastSensorData;

  return (
    <div className="panel">
      <h2>Sensor Data</h2>

      <h3>Environment</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Temp</td><td>{fmtFixed(sd?.temperature, '°C')}</td></tr>
          <tr><td>Humidity</td><td>{fmtFixed(sd?.humidity, '%')}</td></tr>
        </tbody>
      </table>

      <h3>IMU</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Accel X</td><td>{fmtFixed(sd?.accelX, 'm/s²', 3)}</td></tr>
          <tr><td>Accel Y</td><td>{fmtFixed(sd?.accelY, 'm/s²', 3)}</td></tr>
          <tr><td>Accel Z</td><td>{fmtFixed(sd?.accelZ, 'm/s²', 3)}</td></tr>
          <tr><td>Gyro X</td><td>{fmtFixed(sd?.gyroX, '°/s', 3)}</td></tr>
          <tr><td>Gyro Y</td><td>{fmtFixed(sd?.gyroY, '°/s', 3)}</td></tr>
          <tr><td>Gyro Z</td><td>{fmtFixed(sd?.gyroZ, '°/s', 3)}</td></tr>
        </tbody>
      </table>

      <h3>DCGF</h3>
      <table className="info-table">
        <tbody>
          <tr>
            <td>Fault</td>
            <td>{sd != null ? `0x${sd.dcgfFault.toString(16).toUpperCase().padStart(4, '0')}` : '-'}</td>
          </tr>
          <tr><td>Volt 1</td><td>{fmtFixedV(sd?.dcgfVolt1)}</td></tr>
          <tr><td>Volt 2</td><td>{fmtFixedV(sd?.dcgfVolt2)}</td></tr>
        </tbody>
      </table>

      <h3>IMD</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Stop Mode</td><td>{fmtInt(sd?.imdStopMode, '')}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
