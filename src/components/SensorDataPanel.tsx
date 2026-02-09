/**
 * Sensor Data Panel
 *
 * Displays the latest SENSOR_DATA (MSG_ID: 10002) data,
 * grouped by section: Environment, IMU, DCGF, Power Meter, IMD.
 */

import { useAppContext } from '../context/AppContext';

export function SensorDataPanel() {
  const { state } = useAppContext();
  const sd = state.lastSensorData;

  const fmtF = (v: number | undefined | null, unit: string, digits = 2) =>
    v != null ? `${v.toFixed(digits)} ${unit}` : '-';
  const fmtI = (v: number | undefined | null, unit: string) =>
    v != null ? `${v} ${unit}` : '-';

  return (
    <div className="panel">
      <h2>Sensor Data</h2>

      <h3>Environment</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Temp</td><td>{fmtF(sd?.temperatureC, '\u00B0C')}</td></tr>
          <tr><td>Humidity</td><td>{fmtF(sd?.humidityPct, '%')}</td></tr>
        </tbody>
      </table>

      <h3>IMU</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Accel X</td><td>{fmtF(sd?.accelXMps2, 'm/s\u00B2')}</td></tr>
          <tr><td>Accel Y</td><td>{fmtF(sd?.accelYMps2, 'm/s\u00B2')}</td></tr>
          <tr><td>Accel Z</td><td>{fmtF(sd?.accelZMps2, 'm/s\u00B2')}</td></tr>
          <tr><td>Gyro X</td><td>{fmtF(sd?.gyroXDps, '\u00B0/s')}</td></tr>
          <tr><td>Gyro Y</td><td>{fmtF(sd?.gyroYDps, '\u00B0/s')}</td></tr>
          <tr><td>Gyro Z</td><td>{fmtF(sd?.gyroZDps, '\u00B0/s')}</td></tr>
        </tbody>
      </table>

      <h3>DCGF</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Fault</td><td>{fmtI(sd?.dcgfFault, '')}</td></tr>
          <tr><td>Volt 1</td><td>{fmtI(sd?.dcgfVolt1, 'mV')}</td></tr>
          <tr><td>Volt 2</td><td>{fmtI(sd?.dcgfVolt2, 'mV')}</td></tr>
        </tbody>
      </table>

      <h3>Power Meter</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Voltage</td><td>{fmtI(sd?.meterVoltage, 'mV')}</td></tr>
          <tr><td>Current</td><td>{fmtI(sd?.meterCurrent, 'mA')}</td></tr>
          <tr><td>Energy</td><td>{fmtI(sd?.meterEnergy, 'Wh')}</td></tr>
        </tbody>
      </table>

      <h3>IMD</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Stop Mode</td><td>{fmtI(sd?.imdStopMode, '')}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
