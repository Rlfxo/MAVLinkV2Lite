/**
 * EVCC Charging Panel
 *
 * Displays EVCC_CHARGING_AC (20002) or EVCC_CHARGING_DC (20003) data
 * based on the current charge mode from EVCC_STATUS.
 */

import { useAppContext } from '../context/AppContext';

const ISOLATION_LABELS: Record<number, string> = {
  0: 'Invalid', 1: 'Valid', 2: 'Warning', 3: 'Fault',
};

export function EvccChargingPanel() {
  const { state } = useAppContext();
  const chargeMode = state.lastEvccStatus?.chargeMode ?? -1;
  const ac = state.lastEvccChargingAc;
  const dc = state.lastEvccChargingDc;

  const fmt = (v: number | undefined | null) => v != null ? String(v) : '-';

  return (
    <div className="panel">
      <h2>EVCC Charging {chargeMode === 0 ? '(AC)' : chargeMode === 1 ? '(DC)' : ''}</h2>
      {chargeMode === 0 && ac ? (
        <table className="info-table">
          <tbody>
            <tr><td>EVSE Max I</td><td>{ac.evseMaxCurrentA} A</td></tr>
            <tr><td>EVSE Nom V</td><td>{ac.evseNominalVoltageV} V</td></tr>
            <tr><td>EVSE Max P</td><td>{ac.evseMaxPowerW} W</td></tr>
            <tr><td>EV Max I</td><td>{ac.evMaxCurrentA} A</td></tr>
            <tr><td>EV Max V</td><td>{ac.evMaxVoltageV} V</td></tr>
            <tr><td>Complete</td><td>{ac.chargingComplete ? 'Yes' : 'No'}</td></tr>
          </tbody>
        </table>
      ) : chargeMode === 1 && dc ? (
        <table className="info-table">
          <tbody>
            <tr><td>EV SoC</td><td>{dc.evSoc}%</td></tr>
            <tr><td>EV Ready</td><td>{dc.evReady ? 'Yes' : 'No'}</td></tr>
            <tr><td>Target V</td><td>{dc.evTargetVoltageV} V</td></tr>
            <tr><td>Target I</td><td>{dc.evTargetCurrentA} A</td></tr>
            <tr><td>Present V</td><td>{dc.evsePresentVoltageV} V</td></tr>
            <tr><td>Present I</td><td>{dc.evsePresentCurrentA} A</td></tr>
            <tr><td>EVSE Max V</td><td>{dc.evseMaxVoltageV} V</td></tr>
            <tr><td>EVSE Max I</td><td>{dc.evseMaxCurrentA} A</td></tr>
            <tr><td>EVSE Max P</td><td>{dc.evseMaxPowerW} W</td></tr>
            <tr><td>EV Energy</td><td>{dc.evEnergyCapacityWh} Wh</td></tr>
            <tr><td>Complete</td><td>{dc.chargingComplete ? 'Yes' : 'No'}</td></tr>
            <tr><td>Isolation</td><td>{ISOLATION_LABELS[dc.evseIsolationStatus] ?? fmt(dc.evseIsolationStatus)}</td></tr>
            <tr><td>Status Code</td><td>{fmt(dc.evseStatusCode)}</td></tr>
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No charging data</p>
      )}
    </div>
  );
}
