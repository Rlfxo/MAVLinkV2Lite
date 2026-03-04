/**
 * Main Application Component
 *
 * Combines all panels into the main layout with tab-based navigation
 * for DC Charger and EVCC modes.
 */

import { ConnectionPanel } from './components/ConnectionPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { StatisticsPanel } from './components/StatisticsPanel';
import { MessageLog } from './components/MessageLog';
import { ChargerStatusPanel } from './components/ChargerStatusPanel';
import { SensorDataPanel } from './components/SensorDataPanel';
import { ChargerCommandPanel } from './components/ChargerCommandPanel';
import { ConfigPanel } from './components/ConfigPanel';
import { EvccStatusPanel } from './components/EvccStatusPanel';
import { EvccChargingPanel } from './components/EvccChargingPanel';
import { EvccCommandPanel } from './components/EvccCommandPanel';
import { EvccConfigPanel } from './components/EvccConfigPanel';
import { useHeartbeat } from './hooks/useHeartbeat';
import { useChargerData } from './hooks/useChargerData';
import { useChargerCommand } from './hooks/useChargerCommand';
import { useConfig } from './hooks/useConfig';
import { useEvccData } from './hooks/useEvccData';
import { useEvccCommand } from './hooks/useEvccCommand';
import { useAppContext } from './context/AppContext';
import './App.css';

const DEVICE_BADGE_LABELS: Record<string, string> = {
  none: '',
  charger: 'Charger',
  evcc: 'EVCC',
  both: 'Charger + EVCC',
};

export default function App() {
  useHeartbeat();
  useChargerData();
  useChargerCommand();
  useConfig();
  useEvccData();
  useEvccCommand();

  const { state, dispatch } = useAppContext();
  const { activeTab, detectedDevice } = state;

  return (
    <div className="app">
      <header className="app-header">
        <h1>MAVLink V2 Lite Monitor</h1>
        {detectedDevice !== 'none' && (
          <span className="device-badge">{DEVICE_BADGE_LABELS[detectedDevice]}</span>
        )}
      </header>

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'charger' ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charger' })}
        >
          DC Charger
        </button>
        <button
          className={`tab-btn ${activeTab === 'evcc' ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'evcc' })}
        >
          EVCC
        </button>
      </div>

      <main className="app-main">
        <div className="top-row">
          <ConnectionPanel />
          <StatusDisplay />
          <StatisticsPanel />
        </div>
        {activeTab === 'charger' ? (
          <div className="data-row">
            <ChargerStatusPanel />
            <SensorDataPanel />
            <ChargerCommandPanel />
            <ConfigPanel />
          </div>
        ) : (
          <div className="data-row">
            <EvccStatusPanel />
            <EvccChargingPanel />
            <EvccCommandPanel />
            <EvccConfigPanel />
          </div>
        )}
        <MessageLog />
      </main>
    </div>
  );
}
