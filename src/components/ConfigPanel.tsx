/**
 * Config Panel
 *
 * Sends CONFIG_REQUEST (MSG_ID: 10200, with uuid) to DC Charger and
 * displays the latest CONFIG_RESPONSE (MSG_ID: 10201). Shows the
 * pending uuid while waiting for the reply.
 */

import { useAppContext } from '../context/AppContext';

/** Parse packed version u32 (0x00XXYYZZ) → "XX.YY.ZZ" */
function formatVersion(v: number): string {
  const major = (v >> 16) & 0xFF;
  const minor = (v >> 8) & 0xFF;
  const patch = v & 0xFF;
  return `${major}.${minor}.${patch}`;
}

export function ConfigPanel() {
  const { state, dispatch } = useAppContext();

  const isSynchronized = state.connectionState === 'synchronized';
  const isPending = state.pendingConfigUuid != null;

  const handleRequest = async () => {
    try {
      const uuid = await window.electron.config.sendRequest();
      dispatch({ type: 'SET_PENDING_CONFIG_UUID', payload: uuid });
    } catch {
      dispatch({ type: 'SET_PENDING_CONFIG_UUID', payload: null });
    }
  };

  const cfg = state.lastConfigResponse;

  return (
    <div className="panel config-panel">
      <h2>Config Info</h2>
      <button
        className="btn btn-primary"
        onClick={handleRequest}
        disabled={!isSynchronized || isPending}
      >
        {isPending ? `Requesting (uuid=${state.pendingConfigUuid})…` : 'Request Config'}
      </button>
      <table className="info-table config-table">
        <tbody>
          <tr>
            <td>uuid</td>
            <td>{cfg ? cfg.uuid : '-'}</td>
          </tr>
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
