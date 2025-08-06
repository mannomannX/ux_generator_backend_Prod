#!/usr/bin/env node
// ==========================================
// SCRIPTS/health-check.mjs
// ==========================================

import axios from 'axios';

const services = [
  { name: 'API Gateway', url: 'http://localhost:3000/health', critical: true },
  { name: 'Cognitive Core', url: 'http://localhost:3001/health', critical: true },
  { name: 'Knowledge Service', url: 'http://localhost:3002/health', critical: true },
  { name: 'Flow Service', url: 'http://localhost:3003/health', critical: true },
  { name: 'User Management', url: 'http://localhost:3004/health', critical: true },
];

async function checkService(service) {
  try {
    const response = await axios.get(service.url, { 
      timeout: 5000,
      validateStatus: null 
    });
    
    if (response.status === 200) {
      const data = response.data;
      if (data.status === 'healthy' || data.status === 'ok') {
        return { 
          ...service, 
          status: 'healthy', 
          message: 'Service is running', 
          details: data 
        };
      } else if (data.status === 'degraded') {
        return { 
          ...service, 
          status: 'degraded', 
          message: 'Service is degraded', 
          details: data 
        };
      }
    }
    
    return { 
      ...service, 
      status: 'unhealthy', 
      message: `HTTP ${response.status}`, 
      details: response.data 
    };
  } catch (error) {
    return { 
      ...service, 
      status: 'offline', 
      message: error.code === 'ECONNREFUSED' ? 'Connection refused' : error.message 
    };
  }
}

async function runHealthCheck() {
  console.log('\n🏥 UX-Flow-Engine Health Check\n');
  console.log('=' .repeat(50));
  
  // Check services
  console.log('\n📡 Microservices:\n');
  const serviceResults = await Promise.all(services.map(checkService));
  
  let allHealthy = true;
  let criticalFailure = false;
  
  for (const result of serviceResults) {
    const icon = {
      healthy: '✅',
      degraded: '⚠️ ',
      unhealthy: '❌',
      offline: '🔴',
    }[result.status] || '❓';
    
    console.log(`${icon} ${result.name.padEnd(20)} ${result.message}`);
    
    if (result.status !== 'healthy') {
      allHealthy = false;
      if (result.critical && result.status === 'offline') {
        criticalFailure = true;
      }
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  
  const healthyServices = serviceResults.filter(s => s.status === 'healthy').length;
  const totalServices = serviceResults.length;
  const percentage = Math.round((healthyServices / totalServices) * 100);
  
  console.log('\n📊 Summary:\n');
  console.log(`  Services: ${healthyServices}/${totalServices} healthy (${percentage}%)`);
  
  if (criticalFailure) {
    console.log('\n❌ CRITICAL: One or more critical services are offline');
    process.exit(1);
  } else if (!allHealthy) {
    console.log('\n⚠️  WARNING: Some services are not healthy');
    process.exit(0);
  } else {
    console.log('\n✅ All systems operational');
    process.exit(0);
  }
}

// Run if called directly
runHealthCheck().catch((error) => {
  console.error('Health check failed:', error);
  process.exit(1);
});