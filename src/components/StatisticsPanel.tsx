/**
 * Statistics Panel Component
 *
 * Displays serial TX/RX bytes and parser statistics (CRC errors, parse errors).
 */

import { useAppContext } from '../context/AppContext';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StatisticsPanel() {
  const { state } = useAppContext();
  const serial = state.serialStatus;
  const parser = state.parserStats;

  return (
    <div className="panel">
      <h2>Statistics</h2>

      <h3>Serial</h3>
      <table className="info-table">
        <tbody>
          <tr>
            <td>TX</td>
            <td>{formatBytes(serial?.bytesTransmitted ?? 0)}</td>
          </tr>
          <tr>
            <td>RX</td>
            <td>{formatBytes(serial?.bytesReceived ?? 0)}</td>
          </tr>
        </tbody>
      </table>

      <h3>Parser</h3>
      <table className="info-table">
        <tbody>
          <tr>
            <td>Total Parsed</td>
            <td>{parser?.totalRxCount ?? 0}</td>
          </tr>
          <tr>
            <td>CRC Errors</td>
            <td style={{ color: (parser?.crcErrorCount ?? 0) > 0 ? '#d9534f' : undefined }}>
              {parser?.crcErrorCount ?? 0}
            </td>
          </tr>
          <tr>
            <td>Parse Errors</td>
            <td style={{ color: (parser?.parseErrorCount ?? 0) > 0 ? '#d9534f' : undefined }}>
              {parser?.parseErrorCount ?? 0}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
