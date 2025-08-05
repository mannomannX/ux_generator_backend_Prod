#!/usr/bin/env node

/**
 * Real-time Log Aggregator
 * Tails logs from all services and displays them in a unified view
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SERVICES = [
  { name: 'api-gateway', color: '\x1b[36m' },    // Cyan
  { name: 'cognitive-core', color: '\x1b[33m' }, // Yellow
  { name: 'knowledge', color: '\x1b[35m' },      // Magenta
  { name: 'flow', color: '\x1b[32m' },           // Green
];

const RESET_COLOR = '\x1b[0m';
const BOLD = '\x1b[1m';

class LogAggregator {
  constructor() {
    this.processes = [];
    this.setupSignalHandlers();
  }

  setupSignalHandlers() {
    process.on('SIGINT', () => {
      console.log('\n\n📝 Stopping log aggregator...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  cleanup() {
    this.processes.forEach(proc => {
      if (proc && !proc.killed) {
        proc.kill();
      }
    });
  }

  formatMessage(serviceName, message, color) {
    const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.sss
    const service = serviceName.padEnd(12);
    return `${color}${BOLD}[${timestamp}]${RESET_COLOR} ${color}${service}${RESET_COLOR} ${message}`;
  }

  tailServiceLogs(service) {
    const logFile = path.join('logs', `${service.name}.log`);
    
    // Create log file if it doesn't exist
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '');
    }

    const tail = spawn('tail', ['-f', logFile]);

    tail.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(this.formatMessage(service.name, line, service.color));
        }
      });
    });

    tail.stderr.on('data', (data) => {
      console.error(this.formatMessage(service.name, `ERROR: ${data}`, '\x1b[31m')); // Red
    });

    tail.on('close', (code) => {
      if (code !== 0) {
        console.log(this.formatMessage(service.name, `Log tail process exited with code ${code}`, '\x1b[31m'));
      }
    });

    this.processes.push(tail);
    return tail;
  }

  start() {
    console.clear();
    console.log(`${BOLD}🔍 UX-Flow-Engine - Live Log Aggregator${RESET_COLOR}`);
    console.log('═'.repeat(80));
    console.log('Press Ctrl+C to stop\n');

    // Ensure logs directory exists
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }

    // Start tailing logs for each service
    SERVICES.forEach(service => {
      console.log(this.formatMessage(service.name, 'Starting log monitoring...', service.color));
      this.tailServiceLogs(service);
    });

    // Keep the process alive
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
}

const aggregator = new LogAggregator();
aggregator.start()