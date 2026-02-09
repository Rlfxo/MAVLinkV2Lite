/**
 * Charger Status Panel
 *
 * Displays the latest CHARGER_STATUS (MSG_ID: 10001) data.
 */

import { useAppContext } from '../context/AppContext';

export function ChargerStatusPanel() {
  const { state } = useAppContext();
  const cs = state.lastChargerStatus;

  const fmt = (v: number | undefined | null) => v != null ? String(v) : '-';
  const fmtHex = (v: number | undefined | null) =>
    v != null ? `0x${v.toString(16).toUpperCase().padStart(8, '0')}` : '-';

  return (
    <div className="panel">
      <h2>Charger Status</h2>
      <table className="info-table">
        <tbody>
          <tr><td>Discharging</td><td>{fmt(cs?.discharging)}</td></tr>
          <tr><td>Recharging</td><td>{fmt(cs?.recharging)}</td></tr>
          <tr><td>BMS Vendor</td><td>{fmt(cs?.bmsVendor)}</td></tr>
          <tr><td>BMS Cap</td><td>{cs != null ? `${cs.bmsCap} kWh` : '-'}</td></tr>
          <tr><td>Out Cap</td><td>{cs != null ? `${cs.outCap} kW` : '-'}</td></tr>
          <tr><td>BMS SoC</td><td>{cs != null ? `${cs.bmsSoc}%` : '-'}</td></tr>
          <tr><td>Diagnosis</td><td>{fmtHex(cs?.diagnosis)}</td></tr>
          <tr><td>Relay</td><td>{fmtHex(cs?.relayBitmap)}</td></tr>
          <tr><td>Uptime</td><td>{cs != null ? `${cs.uptimeSec}s` : '-'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
