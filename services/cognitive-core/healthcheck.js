// ==========================================
// COGNITIVE CORE SERVICE - Docker Health Check
// ==========================================

import http from 'http';
import config from './src/config/index.js';

const options = {
  hostname: 'localhost',
  port: config.port,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const healthCheck = http.request(options, (res) => {
  if (res.statusCode === 200) {
    // Health check passed
    process.exit(0);
  } else {
    // Health check failed with status: ${res.statusCode}
    process.exit(1);
  }
});

healthCheck.on('error', (err) => {
  // Health check failed: ${err.message}
  process.exit(1);
});

healthCheck.on('timeout', () => {
  // Health check timeout
  healthCheck.destroy();
  process.exit(1);
});

healthCheck.end();