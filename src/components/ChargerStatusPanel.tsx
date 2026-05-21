/**
 * Charger Status Panel
 *
 * Displays the latest CHARGER_STATUS (MSG_ID: 10001) data — 10 B slim.
 * High-level state + relay topology + uptime + storage SOC.
 * Measurements live in MeterDataPanel / SensorDataPanel.
 */

import { useAppContext } from '../context/AppContext';
import { MAV_STATE } from '../../electron/protocol/constants';

const STATE_LABELS: Record<number, string> = {
  [MAV_STATE.UNINIT]:   'UNINIT',
  [MAV_STATE.BOOT]:     'BOOT',
  [MAV_STATE.STANDBY]:  'STANDBY',
  [MAV_STATE.RUN]:      'RUN',
  [MAV_STATE.ERROR]:    'ERROR',
  [MAV_STATE.SHUTDOWN]: 'SHUTDOWN',
  [MAV_STATE.FW_OTA]:   'FW_OTA',
  [MAV_STATE.PLC_OTA]:  'PLC_OTA',
};

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatRelayBitmap(bitmap: number): string {
  const hex = `0x${bitmap.toString(16).toUpperCase().padStart(8, '0')}`;
  const set: string[] = [];
  for (let i = 0; i < 16; i++) {
    if (bitmap & (1 << i)) set.push(`RY${i + 1}`);
  }
  if (bitmap & (1 << 16)) set.push('MC');
  return set.length > 0 ? `${hex} (${set.join(', ')})` : hex;
}

export function ChargerStatusPanel() {
  const { state } = useAppContext();
  const cs = state.lastChargerStatus;

  return (
    <div className="panel">
      <h2>Charger Status</h2>
      <table className="info-table">
        <tbody>
          <tr>
            <td>State</td>
            <td>{cs != null ? (STATE_LABELS[cs.state] ?? `Unknown(${cs.state})`) : '-'}</td>
          </tr>
          <tr>
            <td>Relay</td>
            <td>{cs != null ? formatRelayBitmap(cs.relayBitmap) : '-'}</td>
          </tr>
          <tr>
            <td>Uptime</td>
            <td>{cs != null ? formatUptime(cs.uptimeSec) : '-'}</td>
          </tr>
          <tr>
            <td>Storage SoC</td>
            <td>{cs != null ? (cs.storageSoc === 0 ? '— (N/A)' : `${cs.storageSoc}%`) : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
