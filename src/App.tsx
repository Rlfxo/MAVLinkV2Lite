/**
 * Main Application Component
 *
 * Combines all panels into the main layout.
 */

import { ConnectionPanel } from './components/ConnectionPanel';
import { StatusDisplay } from './components/StatusDisplay';
import { StatisticsPanel } from './components/StatisticsPanel';
import { MessageLog } from './components/MessageLog';
import { useHeartbeat } from './hooks/useHeartbeat';
import './App.css';

export default function App() {
  useHeartbeat();

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
        <MessageLog />
      </main>
    </div>
  );
}
