/**
 * EVCC Config Panel
 *
 * Sends EVCC CONFIG_REQUEST (MSG_ID: 20200) to PLC Modem.
 * Displays EVCC CONFIG_RESPONSE (MSG_ID: 20201) firmware info.
 */

import { useAppContext } from '../context/AppContext';

function formatMac(bytes: Uint8Array | number[]): string {
  return Array.from(bytes).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
}

function formatIpv6(bytes: Uint8Array | number[]): string {
  const arr = Array.from(bytes);
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    parts.push(((arr[i] << 8) | arr[i + 1]).toString(16));
  }
  return parts.join(':');
}

export function EvccConfigPanel() {
  const { state } = useAppContext();

  const isSynchronized = state.connectionState === 'synchronized';

  const handleRequest = async () => {
    await window.electron.evccConfig.sendRequest();
  };

  const cfg = state.lastEvccConfigResponse;

  return (
    <div className="panel config-panel">
      <h2>EVCC Config</h2>
      <button
        className="btn btn-primary"
        onClick={handleRequest}
        disabled={!isSynchronized}
      >
        Request Config
      </button>
      <table className="info-table config-table">
        <tbody>
          <tr>
            <td>FW Version</td>
            <td>{cfg ? `${cfg.fwVersionMajor}.${cfg.fwVersionMinor}.${cfg.fwVersionPatch}` : '-'}</td>
          </tr>
          <tr>
            <td>Mode</td>
            <td>{cfg ? (cfg.chargeMode === 0 ? 'AC' : 'DC') : '-'}</td>
          </tr>
          <tr>
            <td>Build Date</td>
            <td>{cfg ? `${cfg.fwBuildYear}.${String(cfg.fwBuildMonth).padStart(2, '0')}.${String(cfg.fwBuildDay).padStart(2, '0')}` : '-'}</td>
          </tr>
          <tr>
            <td>MAC</td>
            <td>{cfg ? formatMac(cfg.macAddress) : '-'}</td>
          </tr>
          <tr>
            <td>EVSE MAC</td>
            <td>{cfg ? formatMac(cfg.evseMac) : '-'}</td>
          </tr>
          <tr>
            <td>SECC IP</td>
            <td>{cfg ? formatIpv6(cfg.seccIp) : '-'}</td>
          </tr>
          <tr>
            <td>SECC Port</td>
            <td>{cfg ? cfg.seccPort : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
