/**
 * Charger Command Panel
 *
 * Sends CHARGER_COMMAND (MSG_ID: 10100) to DC Charger and displays the
 * latest COMMAND_ACK. The uuid is allocated by the main process and
 * returned from the IPC call — used to match the ACK and to display
 * both values in the UI.
 */

import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { CommandResult } from '../../electron/protocol/types';

const COMMAND_LABELS: Record<number, string> = {
  0: 'STOP',
  1: 'DISCHARGE',
  2: 'RECHARGE',
};

const RESULT_LABELS: Record<number, string> = {
  [CommandResult.ACCEPTED]:    'ACCEPTED',
  [CommandResult.DENIED]:      'DENIED',
  [CommandResult.ERROR]:       'ERROR',
  [CommandResult.UNSUPPORTED]: 'UNSUPPORTED',
};

const RESULT_CLASSES: Record<number, string> = {
  [CommandResult.ACCEPTED]:    'ack-accepted',
  [CommandResult.DENIED]:      'ack-denied',
  [CommandResult.ERROR]:       'ack-error',
  [CommandResult.UNSUPPORTED]: 'ack-warning',
};

export function ChargerCommandPanel() {
  const { state, dispatch } = useAppContext();
  const [maxPowerKw, setMaxPowerKw] = useState(50);
  const [command, setCommand] = useState(0);

  const isSynchronized = state.connectionState === 'synchronized';
  const disabled = !isSynchronized || state.isSendingCommand;

  const handleSend = async () => {
    // Tentatively mark as sending; the IPC resolves with the allocated uuid.
    dispatch({ type: 'SET_SENDING_COMMAND', payload: { sending: true } });
    try {
      const uuid = await window.electron.chargerCommand.send({ maxPowerKw, command });
      // Record the uuid so SET_COMMAND_ACK can correlate.
      dispatch({ type: 'SET_SENDING_COMMAND', payload: { sending: true, uuid } });
    } catch {
      dispatch({ type: 'SET_SENDING_COMMAND', payload: { sending: false } });
    }
  };

  const ack = state.lastCommandAck;
  const resultLabel = ack != null ? (RESULT_LABELS[ack.result] ?? `UNKNOWN(${ack.result})`) : null;
  const resultClass = ack != null ? (RESULT_CLASSES[ack.result] ?? '') : '';

  return (
    <div className="panel">
      <h2>Charger Command</h2>
      <div className="command-controls">
        <div className="command-row">
          <label className="command-label">Max Power (kW)</label>
          <input
            type="number"
            className="command-input"
            min={0}
            max={65535}
            value={maxPowerKw}
            onChange={(e) => setMaxPowerKw(Math.max(0, Math.min(65535, Number(e.target.value) || 0)))}
            disabled={disabled}
          />
        </div>
        <div className="command-row">
          <label className="command-label">Command</label>
          <select
            className="command-select"
            value={command}
            onChange={(e) => setCommand(Number(e.target.value))}
            disabled={disabled}
          >
            {Object.entries(COMMAND_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={disabled}
        >
          {state.isSendingCommand
            ? `Sending${state.pendingCommandUuid != null ? ` (uuid=${state.pendingCommandUuid})` : ''}…`
            : 'Send Command'}
        </button>
      </div>
      {ack != null && (
        <div className={`ack-result ${resultClass}`}>
          <span className="ack-label">ACK:</span>
          <span className="ack-value">{resultLabel}</span>
          <span className="ack-target">(uuid={ack.uuid})</span>
        </div>
      )}
    </div>
  );
}
