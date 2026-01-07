#!/usr/bin/env tsx
/**
 * MAVLink Heartbeat Test CLI
 *
 * Command-line tool to test MAVLink HEARTBEAT communication with DC Charger board.
 *
 * Usage:
 *   npm run test:heartbeat [port]
 *
 * Examples:
 *   npm run test:heartbeat /dev/ttyUSB0
 *   npm run test:heartbeat COM3
 *   npm run test:heartbeat  (auto-detect)
 */

import { SerialPortManager } from '../electron/serial/SerialPortManager';
import { HeartbeatManager } from '../electron/serial/HeartbeatManager';
import { MAV_STATE } from '../electron/protocol/constants';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStateString(state: number): string {
  const states: Record<number, string> = {
    [MAV_STATE.UNINIT]: 'UNINIT',
    [MAV_STATE.BOOT]: 'BOOT',
    [MAV_STATE.CALIBRATING]: 'CALIBRATING',
    [MAV_STATE.STANDBY]: 'STANDBY',
    [MAV_STATE.ACTIVE]: 'ACTIVE',
    [MAV_STATE.CRITICAL]: 'CRITICAL',
    [MAV_STATE.EMERGENCY]: 'EMERGENCY',
    [MAV_STATE.POWEROFF]: 'POWEROFF',
    [MAV_STATE.FLIGHT_TERMINATION]: 'TERMINATED',
  };
  return states[state] ?? `UNKNOWN(${state})`;
}

async function main() {
  log('\n=============================================================', colors.cyan);
  log('         MAVLink V2 Lite Heartbeat Test Tool               ', colors.cyan);
  log('=============================================================\n', colors.cyan);

  // Get port from command line or auto-detect
  let portPath = process.argv[2];

  const serialManager = new SerialPortManager();

  try {
    // List available ports
    log('[SCAN] Scanning for serial ports...', colors.blue);
    const ports = await SerialPortManager.listPorts();

    if (ports.length === 0) {
      log('[ERROR] No serial ports found!', colors.red);
      process.exit(1);
    }

    log(`\n[INFO] Found ${ports.length} port(s):`, colors.green);
    ports.forEach((port, index) => {
      const info = [
        port.path,
        port.manufacturer ? `(${port.manufacturer})` : '',
        port.serialNumber ? `S/N: ${port.serialNumber}` : '',
      ].filter(Boolean).join(' ');

      console.log(`   ${index + 1}. ${info}`);
    });

    // Auto-select if not specified
    if (!portPath) {
      portPath = ports[0].path;
      log(`\n[AUTO] Auto-selected: ${portPath}`, colors.yellow);
    } else {
      log(`\n[PORT] Using specified port: ${portPath}`, colors.yellow);
    }

    // Connect to port
    log('\n[CONNECT] Connecting...', colors.blue);
    await serialManager.connect(portPath);
    log(`[OK] Connected to ${portPath} (115200 baud, 8N1)`, colors.green);

    // Create heartbeat manager
    const heartbeatManager = new HeartbeatManager(serialManager);

    // Setup event handlers
    heartbeatManager.on('heartbeat-sent', (seq) => {
      const status = heartbeatManager.getStatus();
      log(`[TX] Heartbeat #${seq} (total sent: ${status.heartbeatsSent})`, colors.dim);
    });

    heartbeatManager.on('heartbeat-received', (payload, message) => {
      const status = heartbeatManager.getStatus();
      const state = getStateString(payload.systemStatus);
      const color = payload.systemStatus === MAV_STATE.ACTIVE ? colors.green : colors.yellow;

      log(
        `[RX] Heartbeat from SYS:${message.sysid} COMP:${message.compid} ` +
        `SEQ:${message.seq} STATE:${state} TYPE:${payload.type} ` +
        `(total received: ${status.heartbeatsReceived})`,
        color
      );
    });

    heartbeatManager.on('connection-established', () => {
      log('\n[CONNECTED] Connection established!\n', colors.bright + colors.green);
    });

    heartbeatManager.on('connection-lost', () => {
      log('\n[TIMEOUT] Connection lost (no heartbeat for 3s)\n', colors.yellow);
    });

    heartbeatManager.on('heartbeat-timeout', () => {
      log('[TIMEOUT] Heartbeat timeout', colors.red);
    });

    serialManager.on('error', (error) => {
      log(`[ERROR] Serial error: ${error.message}`, colors.red);
    });

    serialManager.on('close', () => {
      log('\n[CLOSE] Serial port closed', colors.yellow);
    });

    // Start heartbeat
    log('\n[START] Starting heartbeat (1Hz TX, monitoring RX)...\n', colors.bright + colors.blue);
    heartbeatManager.start();

    // Status display interval
    const statusInterval = setInterval(() => {
      const hbStatus = heartbeatManager.getStatus();
      const serialStatus = serialManager.getStatus();
      const parserStats = heartbeatManager.getParserStats();

      console.log(colors.dim + '-'.repeat(70) + colors.reset);
      log('STATUS REPORT', colors.bright);

      const connStatus = hbStatus.isConnected ? 'CONNECTED' : 'DISCONNECTED';
      const connColor = hbStatus.isConnected ? colors.green : colors.red;
      console.log(`   Connection:     ${connColor}${connStatus}${colors.reset}`);
      console.log(`   Heartbeats:     TX: ${hbStatus.heartbeatsSent}  RX: ${hbStatus.heartbeatsReceived}`);
      console.log(`   Last RX:        ${hbStatus.lastHeartbeatTime ? formatTime(hbStatus.lastHeartbeatTime) : 'Never'} (${hbStatus.timeSinceLastHeartbeat ? formatDuration(hbStatus.timeSinceLastHeartbeat) + ' ago' : 'N/A'})`);
      console.log(`   Parser:         Total: ${parserStats.totalRxCount}  CRC Errors: ${parserStats.crcErrorCount}  Parse Errors: ${parserStats.parseErrorCount}`);
      console.log(`   Serial:         TX: ${serialStatus.bytesTransmitted} bytes  RX: ${serialStatus.bytesReceived} bytes`);

      if (hbStatus.lastHeartbeat) {
        console.log(`   Remote Status:  ${getStateString(hbStatus.lastHeartbeat.systemStatus)} (Type: ${hbStatus.lastHeartbeat.type})`);
      }

      if (!hbStatus.isConnected && hbStatus.heartbeatsSent > 0) {
        log('   NOTE: TX is working but no RX from board. Check:', colors.yellow);
        log('         1. Board is sending heartbeats', colors.yellow);
        log('         2. UART wiring (TX<->RX crossover)', colors.yellow);
        log('         3. Board baud rate (115200 8N1)', colors.yellow);
      }

      console.log(colors.dim + '-'.repeat(70) + colors.reset);
    }, 5000); // Status every 5 seconds

    // Graceful shutdown
    const shutdown = async () => {
      log('\n\n[SHUTDOWN] Shutting down...', colors.yellow);
      clearInterval(statusInterval);
      heartbeatManager.stop();

      if (serialManager.isOpen()) {
        await serialManager.disconnect();
      }

      log('[EXIT] Goodbye!\n', colors.cyan);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive
    log('[INFO] Press Ctrl+C to exit\n', colors.dim);

  } catch (error) {
    if (error instanceof Error) {
      log(`\n[ERROR] ${error.message}`, colors.red);
    } else {
      log(`\n[ERROR] Unknown error: ${error}`, colors.red);
    }
    process.exit(1);
  }
}

main();
