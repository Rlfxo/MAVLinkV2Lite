/**
 * EVCC Command Panel
 *
 * Sends EVCC_COMMAND (MSG_ID: 20100) to PLC Modem.
 * Displays last EVCC COMMAND_ACK result.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { EvccCommandType } from '../../electron/protocol/types';

const COMMAND_OPTIONS: { value: number; label: string }[] = [
  { value: EvccCommandType.START_SLAC, label: 'START_SLAC' },
  { value: EvccCommandType.STOP_SLAC, label: 'STOP_SLAC' },
  { value: EvccCommandType.START_V2G, label: 'START_V2G' },
  { value: EvccCommandType.STOP_V2G, label: 'STOP_V2G' },
  { value: EvccCommandType.PAUSE_V2G, label: 'PAUSE_V2G' },
  { value: EvccCommandType.RESUME_V2G, label: 'RESUME_V2G' },
  { value: EvccCommandType.SET_CP_A, label: 'SET_CP_A' },
  { value: EvccCommandType.SET_CP_B, label: 'SET_CP_B' },
  { value: EvccCommandType.SET_CP_C, label: 'SET_CP_C' },
  { value: EvccCommandType.SET_MODE_AC, label: 'SET_MODE_AC' },
  { value: EvccCommandType.SET_MODE_DC, label: 'SET_MODE_DC' },
  { value: EvccCommandType.CLEAR_V2G_CTX, label: 'CLEAR_V2G_CTX' },
];

const ACK_RESULT_LABELS: Record<number, string> = {
  0: 'OK', 1: 'FAIL', 2: 'UNSUPPORTED',
};

const ACK_RESULT_CLASSES: Record<number, string> = {
  0: 'ack-accepted',
  1: 'ack-denied',
  2: 'ack-warning',
};

export function EvccCommandPanel() {
  const { state, dispatch } = useAppContext();
  const [command, setCommand] = useState(EvccCommandType.START_SLAC);
  const [param, setParam] = useState(0);

  const isSynchronized = state.connectionState === 'synchronized';
  const disabled = !isSynchronized || state.isSendingEvccCommand;

  const handleSend = async () => {
    dispatch({ type: 'SET_SENDING_EVCC_COMMAND', payload: true });
    try {
      await window.electron.evccCommand.send({ command, param });
    } catch {
      dispatch({ type: 'SET_SENDING_EVCC_COMMAND', payload: false });
    }
  };

  const ack = state.lastEvccCommandAck;
  const resultLabel = ack != null ? (ACK_RESULT_LABELS[ack.result] ?? `UNKNOWN(${ack.result})`) : null;
  const resultClass = ack != null ? (ACK_RESULT_CLASSES[ack.result] ?? '') : '';

  return (
    <div className="panel">
      <h2>EVCC Command</h2>
      <div className="command-controls">
        <div className="command-row">
          <label className="command-label">Command</label>
          <select
            className="command-select"
            value={command}
            onChange={(e) => setCommand(Number(e.target.value))}
            disabled={disabled}
          >
            {COMMAND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="command-row">
          <label className="command-label">Param</label>
          <input
            type="number"
            className="command-input"
            min={0}
            max={255}
            value={param}
            onChange={(e) => setParam(Math.max(0, Math.min(255, Number(e.target.value) || 0)))}
            disabled={disabled}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={disabled}
        >
          {state.isSendingEvccCommand ? 'Sending...' : 'Send Command'}
        </button>
      </div>
      {ack != null && (
        <div className={`ack-result ${resultClass}`}>
          <span className="ack-label">ACK:</span>
          <span className="ack-value">{resultLabel}</span>
          <span className="ack-target">(cmd={ack.command})</span>
        </div>
      )}
    </div>
  );
}
