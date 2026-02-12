/**
 * Status Display Component
 *
 * Shows heartbeat connection status, last heartbeat info, and timing.
 */

import { useAppContext } from '../context/AppContext';

export function StatusDisplay() {
  const { state } = useAppContext();
  const hb = state.heartbeatStatus;

  const lastRxTime = hb?.lastHeartbeatTime
    ? new Date(hb.lastHeartbeatTime).toLocaleTimeString()
    : 'Never';

  const timeSince = hb?.timeSinceLastHeartbeat;
  const timeSinceStr = timeSince != null
    ? timeSince < 1000
      ? `${timeSince}ms ago`
      : `${(timeSince / 1000).toFixed(1)}s ago`
    : 'N/A';

  const remoteStatus = hb?.lastHeartbeat?.systemStatus;

  return (
    <div className="panel">
      <h2>Heartbeat Status</h2>

      <table className="info-table">
        <tbody>
          <tr>
            <td>Sending</td>
            <td>{hb?.isSending ? 'YES (1000ms)' : 'NO'}</td>
          </tr>
          <tr>
            <td>Connected</td>
            <td>
              <span style={{ color: hb?.isConnected ? '#5cb85c' : '#d9534f', fontWeight: 600 }}>
                {hb?.isConnected ? 'YES' : 'NO'}
              </span>
            </td>
          </tr>
          <tr>
            <td>TX Count</td>
            <td>{hb?.heartbeatsSent ?? 0}</td>
          </tr>
          <tr>
            <td>RX Count</td>
            <td>{hb?.heartbeatsReceived ?? 0}</td>
          </tr>
          <tr>
            <td>TX Seq</td>
            <td>{hb?.txSeq ?? 0}</td>
          </tr>
          <tr>
            <td>Last RX</td>
            <td>{lastRxTime} ({timeSinceStr})</td>
          </tr>
          <tr>
            <td>Remote Status</td>
            <td>{remoteStatus != null ? remoteStatus : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
