/**
 * Connection Panel Component
 *
 * Serial port selection, connect/disconnect controls, and connection state display.
 */

import { useAppContext } from '../context/AppContext';
import { useSerialConnection } from '../hooks/useSerialConnection';

const STATE_LABELS: Record<string, { text: string; color: string }> = {
  disconnected: { text: 'DISCONNECTED', color: '#888' },
  connecting: { text: 'CONNECTING...', color: '#f0ad4e' },
  connected: { text: 'CONNECTED', color: '#5cb85c' },
  synchronized: { text: 'SYNCHRONIZED', color: '#0275d8' },
  timeout: { text: 'TIMEOUT', color: '#d9534f' },
  error: { text: 'ERROR', color: '#d9534f' },
};

export function ConnectionPanel() {
  const { state, dispatch } = useAppContext();
  const { scanPorts, connect, disconnect } = useSerialConnection();

  const isConnected = state.connectionState !== 'disconnected' && state.connectionState !== 'error';
  const stateInfo = STATE_LABELS[state.connectionState] ?? STATE_LABELS.disconnected;

  return (
    <div className="panel">
      <h2>Connection</h2>

      <div className="connection-controls">
        <div className="port-row">
          <select
            value={state.selectedPort}
            onChange={(e) => dispatch({ type: 'SET_SELECTED_PORT', payload: e.target.value })}
            disabled={isConnected || state.isConnecting}
          >
            <option value="">-- Select Port --</option>
            {state.availablePorts.map((p) => (
              <option key={p.path} value={p.path}>
                {p.path} {p.manufacturer ? `(${p.manufacturer})` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={scanPorts}
            disabled={isConnected || state.isConnecting}
            className="btn btn-secondary"
          >
            Scan
          </button>
        </div>

        <div className="btn-row">
          {!isConnected ? (
            <button
              onClick={connect}
              disabled={!state.selectedPort || state.isConnecting}
              className="btn btn-primary"
            >
              {state.isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button onClick={disconnect} className="btn btn-danger">
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="status-badge" style={{ borderColor: stateInfo.color }}>
        <span className="status-dot" style={{ backgroundColor: stateInfo.color }} />
        <span style={{ color: stateInfo.color, fontWeight: 600 }}>{stateInfo.text}</span>
        {state.serialStatus?.path && (
          <span className="status-path">{state.serialStatus.path}</span>
        )}
      </div>

      {state.lastError && (
        <div className="error-msg">{state.lastError}</div>
      )}
    </div>
  );
}
