/**
 * Config Panel
 *
 * Sends CONFIG_REQUEST (MSG_ID: 10200) to DC Charger.
 * Displays CONFIG_RESPONSE (MSG_ID: 10201) firmware/hardware info.
 */

import { useAppContext } from '../context/AppContext';

/**
 * Parse packed version u32 (0x00XXYYZZ) to "XX.YY.ZZ" string
 */
function formatVersion(v: number): string {
  const major = (v >> 16) & 0xFF;
  const minor = (v >> 8) & 0xFF;
  const patch = v & 0xFF;
  return `${major}.${minor}.${patch}`;
}

export function ConfigPanel() {
  const { state } = useAppContext();

  const isSynchronized = state.connectionState === 'synchronized';

  const handleRequest = async () => {
    await window.electron.config.sendRequest();
  };

  const cfg = state.lastConfigResponse;

  return (
    <div className="panel config-panel">
      <h2>Config Info</h2>
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
            <td>{cfg ? formatVersion(cfg.fwVersion) : '-'}</td>
          </tr>
          <tr>
            <td>HW Version</td>
            <td>{cfg ? formatVersion(cfg.hwVersion) : '-'}</td>
          </tr>
          <tr>
            <td>Model</td>
            <td>{cfg ? cfg.modelName : '-'}</td>
          </tr>
          <tr>
            <td>Build Date</td>
            <td>{cfg ? cfg.buildDate : '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
