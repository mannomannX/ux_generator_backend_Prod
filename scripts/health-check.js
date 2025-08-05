// ==========================================
// SCRIPTS: scripts/health-check.js
// ==========================================
#!/usr/bin/env node

/**
 * Health Check Script for All Services
 * Checks if all services are running and healthy
 */

import http from 'http';
import { URL } from 'url';

const SERVICES = [
  { name: 'API Gateway', url: process.env.API_GATEWAY_URL || 'http://localhost:3000' },
  { name: 'Cognitive Core', url: process.env.COGNITIVE_CORE_URL || 'http://localhost:3001' },
  { name: 'Knowledge Service', url: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3002' },
  { name: 'Flow Service', url: process.env.FLOW_SERVICE_URL || 'http://localhost:3003' },
];

async function checkHealth(service) {
  return new Promise((resolve) => {
    const url = new URL('/health', service.url);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({
            service: service.name,
            status: response.status === 'ok' ? '✅ HEALTHY' : '⚠️  DEGRADED',
            details: response,
          });
        } catch (error) {
          resolve({
            service: service.name,
            status: '❌ ERROR',
            error: 'Invalid JSON response',
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        service: service.name,
        status: '❌ UNREACHABLE',
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        service: service.name,
        status: '❌ TIMEOUT',
        error: 'Request timed out after 5 seconds',
      });
    });

    req.end();
  });
}

async function main() {
  console.log('🔍 UX-Flow-Engine Health Check\n');
  console.log('═'.repeat(50));

  const results = await Promise.all(SERVICES.map(checkHealth));

  results.forEach((result) => {
    console.log(`${result.service.padEnd(20)} ${result.status}`);
    if (result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
    if (result.details && result.details.dependencies) {
      Object.entries(result.details.dependencies).forEach(([dep, status]) => {
        const icon = status === 'ok' ? '✅' : '❌';
        console.log(`   └─ ${dep}: ${icon}`);
      });
    }
  });

  console.log('═'.repeat(50));

  const healthyServices = results.filter((r) => r.status.includes('✅')).length;
  const totalServices = results.length;

  if (healthyServices === totalServices) {
    console.log('🎉 All services are healthy!');
    process.exit(0);
  } else {
    console.log(`⚠️  ${healthyServices}/${totalServices} services are healthy`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});