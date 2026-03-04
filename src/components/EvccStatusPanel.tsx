/**
 * EVCC Status Panel
 *
 * Displays the latest EVCC_STATUS (MSG_ID: 20001) data.
 */

import { useAppContext } from '../context/AppContext';
import { EvccStep } from '../../electron/protocol/types';

const STEP_LABELS: Record<number, string> = {
  [EvccStep.READY]: 'READY',
  [EvccStep.INIT]: 'INIT',
  [EvccStep.FIRST_PLUGIN]: 'FIRST_PLUGIN',
  [EvccStep.SLAC_START]: 'SLAC_START',
  [EvccStep.SLAC_MATCHING]: 'SLAC_MATCHING',
  [EvccStep.SLAC_MATCHED]: 'SLAC_MATCHED',
  [EvccStep.SDP_CLIENT]: 'SDP_CLIENT',
  [EvccStep.V2G_CLIENT]: 'V2G_CLIENT',
  [EvccStep.SESSION_SETUP]: 'SESSION_SETUP',
  [EvccStep.CHARGING]: 'CHARGING',
  [EvccStep.SESSION_STOP]: 'SESSION_STOP',
  [EvccStep.FAILED]: 'FAILED',
};

const STATE_LABELS: Record<number, string> = {
  0: 'IDLE', 1: 'REQ', 2: 'RES', 3: 'TOUT',
};

const CP_STATE_LABELS: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E/F',
};

const PROTOCOL_LABELS: Record<number, string> = {
  0: 'Unknown', 1: 'ISO 15118', 2: 'DIN 70121',
};

export function EvccStatusPanel() {
  const { state } = useAppContext();
  const es = state.lastEvccStatus;

  const fmt = (v: number | undefined | null) => v != null ? String(v) : '-';

  return (
    <div className="panel">
      <h2>EVCC Status</h2>
      <table className="info-table">
        <tbody>
          <tr><td>Step</td><td>{es ? (STEP_LABELS[es.evccStep] ?? `UNKNOWN(${es.evccStep})`) : '-'}</td></tr>
          <tr><td>State</td><td>{es ? (STATE_LABELS[es.evccState] ?? fmt(es.evccState)) : '-'}</td></tr>
          <tr><td>Charge Mode</td><td>{es ? (es.chargeMode === 0 ? 'AC' : 'DC') : '-'}</td></tr>
          <tr><td>CP State</td><td>{es ? (CP_STATE_LABELS[es.cpState] ?? fmt(es.cpState)) : '-'}</td></tr>
          <tr><td>CP Duty</td><td>{es != null ? `${es.cpDuty}%` : '-'}</td></tr>
          <tr><td>CP Voltage</td><td>{es != null ? `${es.cpVoltageMv} mV` : '-'}</td></tr>
          <tr><td>SLAC State</td><td>{fmt(es?.slacState)}</td></tr>
          <tr><td>SDP State</td><td>{fmt(es?.sdpState)}</td></tr>
          <tr><td>V2G State</td><td>{fmt(es?.v2gState)}</td></tr>
          <tr><td>V2G Protocol</td><td>{es ? (PROTOCOL_LABELS[es.v2gProtocol] ?? fmt(es.v2gProtocol)) : '-'}</td></tr>
          <tr><td>Resumable</td><td>{es ? (es.sessionResumable ? 'Yes' : 'No') : '-'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
