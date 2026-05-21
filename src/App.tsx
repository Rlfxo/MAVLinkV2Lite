/**
 * Main Application Component
 *
 * MAVLink V2 Lite monitor for the EVAR DC Charger.
 * The charger model (DURA / MOOEV / Parky) is auto-detected from heartbeat COMPID.
 * Model tab bar: DURA is the only implemented model; MOOEV and Parky are placeholders.
 */

import { ConnectionPanel } from './components/ConnectionPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { StatisticsPanel } from './components/StatisticsPanel';
import { MessageLog } from './components/MessageLog';
import { ChargerStatusPanel } from './components/ChargerStatusPanel';
import { SensorDataPanel } from './components/SensorDataPanel';
import { ChargerCommandPanel } from './components/ChargerCommandPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { useHeartbeat } from './hooks/useHeartbeat';
import { useChargerData } from './hooks/useChargerData';
import { useChargerCommand } from './hooks/useChargerCommand';
import { useConfig } from './hooks/useConfig';
import { useAppContext } from './context/AppContext';
import type { ActiveModel, ChargerModel } from './context/appReducer';
import './App.css';

const MODEL_BADGE_LABELS: Record<ChargerModel, string> = {
  none: '',
  dura: 'DURA',
  mooev: 'MOOEV',
  parky: 'Parky',
  unknown: 'Unknown model',
};

interface ModelTab {
  id: ActiveModel;
  label: string;
  enabled: boolean;
}

const MODEL_TABS: ModelTab[] = [
  { id: 'dura',  label: 'DURA',  enabled: true  },
  { id: 'mooev', label: 'MOOEV', enabled: false },
  { id: 'parky', label: 'Parky', enabled: false },
];

export default function App() {
  useHeartbeat();
  useChargerData();
  useChargerCommand();
  useConfig();

  const { state, dispatch } = useAppContext();
  const { detectedModel, activeModel } = state;

  return (
    <div className="app">
      <header className="app-header">
        <h1>MAVLink V2 Lite Monitor</h1>
        {detectedModel !== 'none' && (
          <span className="device-badge">{MODEL_BADGE_LABELS[detectedModel]}</span>
        )}
      </header>

      <div className="model-tab-bar" role="tablist" aria-label="Charger model">
        {MODEL_TABS.map((tab) => {
          const isActive = activeModel === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={!tab.enabled}
              disabled={!tab.enabled}
              className={`model-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => tab.enabled && dispatch({ type: 'SET_ACTIVE_MODEL', payload: tab.id })}
              title={tab.enabled ? undefined : 'Not yet implemented'}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <main className="app-main">
        <div className="top-row">
          <ConnectionPanel />
          <StatusDisplay />
          <StatisticsPanel />
        </div>

        {activeModel === 'dura' && (
          <div className="data-row">
            <ChargerStatusPanel />
            <SensorDataPanel />
            <ChargerCommandPanel />
            <ConfigPanel />
          </div>
        )}
        {activeModel !== 'dura' && (
          <div className="empty-tab">
            <p>{MODEL_TABS.find((t) => t.id === activeModel)?.label ?? activeModel} is not implemented yet.</p>
          </div>
        )}

        <MessageLog />
      </main>
    </div>
  );
}
