/**
 * Meter Data Panel
 *
 * Displays the latest METER_DATA (MSG_ID: 10003) data — SPM90 meter1/meter2
 * V/I/P/E plus firmware-summed total_power / total_energy.
 *
 * meter2 is DURA-only; for MOOEV the values come in as (value=0, exp=0)
 * and we render them as "—".
 */

import { useAppContext } from '../context/AppContext';
import { fixedToFloat } from '../../electron/protocol/encoder';
import type { FixedT, MeterDataPayload } from '../../electron/protocol/types';

function isZero(ft: FixedT): boolean {
  return ft.value === 0 && ft.exp === 0;
}

function fmt(ft: FixedT | undefined, unit: string, digits: number): string {
  if (!ft) return '-';
  if (isZero(ft)) return '—';
  return `${fixedToFloat(ft).toFixed(digits)} ${unit}`;
}

interface MeterColumnProps {
  label: string;
  voltage?: FixedT;
  current?: FixedT;
  power?: FixedT;
  energy?: FixedT;
}

function MeterColumn({ label, voltage, current, power, energy }: MeterColumnProps) {
  return (
    <div>
      <h3>{label}</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Voltage</td><td>{fmt(voltage, 'V', 1)}</td></tr>
          <tr><td>Current</td><td>{fmt(current, 'A', 2)}</td></tr>
          <tr><td>Power</td><td>{fmt(power,   'W', 0)}</td></tr>
          <tr><td>Energy</td><td>{fmt(energy,  'Wh', 0)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function MeterDataPanel() {
  const { state } = useAppContext();
  const md: MeterDataPayload | null = state.lastMeterData;

  return (
    <div className="panel">
      <h2>Meter Data</h2>

      <h3>Total (firmware-summed)</h3>
      <table className="info-table">
        <tbody>
          <tr><td>Power</td><td>{fmt(md?.totalPower,  'W',  0)}</td></tr>
          <tr><td>Energy</td><td>{fmt(md?.totalEnergy, 'Wh', 0)}</td></tr>
        </tbody>
      </table>

      <MeterColumn
        label="Meter 1"
        voltage={md?.meter1Voltage}
        current={md?.meter1Current}
        power={md?.meter1Power}
        energy={md?.meter1Energy}
      />

      <MeterColumn
        label="Meter 2 (DURA only)"
        voltage={md?.meter2Voltage}
        current={md?.meter2Current}
        power={md?.meter2Power}
        energy={md?.meter2Energy}
      />
    </div>
  );
}
