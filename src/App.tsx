/**
 * Main Application Component
 *
 * Combines all panels into the main layout.
 */

import { ConnectionPanel } from './components/ConnectionPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { StatisticsPanel } from './components/StatisticsPanel';
import { MessageLog } from './components/MessageLog';
import { ChargerStatusPanel } from './components/ChargerStatusPanel';
import { SensorDataPanel } from './components/SensorDataPanel';
import { useHeartbeat } from './hooks/useHeartbeat';
import { useChargerData } from './hooks/useChargerData';
import './App.css';

export default function App() {
  useHeartbeat();
  useChargerData();

  return (
    <div className="app">
      <header className="app-header">
        <h1>MAVLink V2 Lite Monitor</h1>
        <span className="app-subtitle">DC Charger UART Communication</span>
      </header>

      <main className="app-main">
        <div className="top-row">
          <ConnectionPanel />
          <StatusDisplay />
          <StatisticsPanel />
        </div>
        <div className="data-row">
          <ChargerStatusPanel />
          <SensorDataPanel />
        </div>
        <MessageLog />
      </main>
    </div>
  );
}
