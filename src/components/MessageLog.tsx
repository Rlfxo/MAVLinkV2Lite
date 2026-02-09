/**
 * Message Log Component
 *
 * Displays recent heartbeat TX/RX messages in a scrollable log.
 */

import { useAppContext } from '../context/AppContext';
import type { MessageLogEntry } from '../context/appReducer';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function LogRow({ entry }: { entry: MessageLogEntry }) {
  const isTx = entry.direction === 'TX';

  return (
    <tr className={isTx ? 'log-tx' : 'log-rx'}>
      <td className="log-time">{formatTime(entry.timestamp)}</td>
      <td className="log-dir">{entry.direction}</td>
      <td>SEQ:{entry.seq}</td>
      <td>
        {!isTx && entry.sysid != null && (
          <>SYS:{entry.sysid} COMP:{entry.compid} STATE:{entry.systemStatus}</>
        )}
      </td>
    </tr>
  );
}

export function MessageLog() {
  const { state, dispatch } = useAppContext();

  return (
    <div className="panel panel-log">
      <div className="log-header">
        <h2>Message Log</h2>
        <span className="log-count">{state.messageLog.length} entries</span>
        <button
          onClick={() => dispatch({ type: 'CLEAR_LOG' })}
          className="btn btn-small btn-secondary"
        >
          Clear
        </button>
      </div>

      <div className="log-scroll">
        <table className="log-table">
          <tbody>
            {state.messageLog.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
            {state.messageLog.length === 0 && (
              <tr><td colSpan={4} className="log-empty">No messages yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
