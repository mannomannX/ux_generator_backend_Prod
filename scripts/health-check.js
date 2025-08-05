#!/usr/bin/env node

/**
 * Enhanced Health Check Script
 * Checks all services and their dependencies
 */

import http from 'http';
import { URL } from 'url';
import { MongoClient } from 'mongodb';
import { createClient } from 'redis';

const SERVICES = [
  { name: 'API Gateway', url: process.env.API_GATEWAY_URL || 'http://localhost:3000' },
  { name: 'Cognitive Core', url: process.env.COGNITIVE_CORE_URL || 'http://localhost:3001' },
  { name: 'Knowledge Service', url: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3002' },
  { name: 'Flow Service', url: process.env.FLOW_SERVICE_URL || 'http://localhost:3003' },
];

const INFRASTRUCTURE = [
  { name: 'MongoDB', url: process.env.MONGODB_URI || 'mongodb://localhost:27017' },
  { name: 'Redis', url: process.env.REDIS_URL || 'redis://localhost:6379' },
  { name: 'ChromaDB', url: process.env.CHROMADB_URL || 'http://localhost:8000' },
];

async function checkService(service) {
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
            uptime: response.uptime ? `${Math.round(response.uptime / 1000)}s` : 'N/A',
            dependencies: response.dependencies || {},
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

async function checkMongoDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
    await client.connect();
    await client.db().admin().ping();
    await client.close();
    return { status: '✅ HEALTHY', details: 'Connection successful' };
  } catch (error) {
    return { status: '❌ ERROR', error: error.message };
  }
}

async function checkRedis() {
  try {
    const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    await client.connect();
    await client.ping();
    await client.quit();
    return { status: '✅ HEALTHY', details: 'Connection successful' };
  } catch (error) {
    return { status: '❌ ERROR', error: error.message };
  }
}

async function checkChromaDB() {
  return new Promise((resolve) => {
    const url = new URL('/api/v1/heartbeat', process.env.CHROMADB_URL || 'http://localhost:8000');
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve({ status: '✅ HEALTHY', details: 'Heartbeat successful' });
      } else {
        resolve({ status: '❌ ERROR', error: `HTTP ${res.statusCode}` });
      }
    });

    req.on('error', (error) => {
      resolve({ status: '❌ UNREACHABLE', error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: '❌ TIMEOUT', error: 'Request timed out' });
    });

    req.end();
  });
}

async function main() {
  console.clear();
  console.log('🔍 UX-Flow-Engine System Health Check\n');
  console.log('═'.repeat(60));

  // Check infrastructure first
  console.log('\n📊 INFRASTRUCTURE SERVICES');
  console.log('-'.repeat(30));

  const mongoHealth = await checkMongoDB();
  console.log(`MongoDB               ${mongoHealth.status}`);
  if (mongoHealth.error) console.log(`   └─ Error: ${mongoHealth.error}`);

  const redisHealth = await checkRedis();
  console.log(`Redis                 ${redisHealth.status}`);
  if (redisHealth.error) console.log(`   └─ Error: ${redisHealth.error}`);

  const chromaHealth = await checkChromaDB();
  console.log(`ChromaDB              ${chromaHealth.status}`);
  if (chromaHealth.error) console.log(`   └─ Error: ${chromaHealth.error}`);

  // Check application services
  console.log('\n🚀 APPLICATION SERVICES');
  console.log('-'.repeat(30));

  const serviceResults = await Promise.all(SERVICES.map(checkService));

  serviceResults.forEach((result) => {
    console.log(`${result.service.padEnd(20)} ${result.status}`);
    if (result.uptime) {
      console.log(`   └─ Uptime: ${result.uptime}`);
    }
    if (result.error) {
      console.log(`   └─ Error: ${result.error}`);
    }
    if (result.dependencies && Object.keys(result.dependencies).length > 0) {
      Object.entries(result.dependencies).forEach(([dep, status]) => {
        const icon = status === 'ok' ? '✅' : '❌';
        console.log(`   └─ ${dep}: ${icon}`);
      });
    }
  });

  console.log('\n═'.repeat(60));

  // Summary
  const infraHealthy = [mongoHealth, redisHealth, chromaHealth].filter(r => 
    r.status.includes('✅')
  ).length;

  const servicesHealthy = serviceResults.filter(r => 
    r.status.includes('✅')
  ).length;

  const totalInfra = 3;
  const totalServices = serviceResults.length;

  console.log(`\n📈 SUMMARY`);
  console.log(`Infrastructure: ${infraHealthy}/${totalInfra} healthy`);
  console.log(`Services: ${servicesHealthy}/${totalServices} healthy`);

  if (infraHealthy === totalInfra && servicesHealthy === totalServices) {
    console.log('\n🎉 All systems are healthy and ready!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some systems need attention. Check the details above.');
    
    if (infraHealthy < totalInfra) {
      console.log('\n💡 Quick fixes:');
      if (mongoHealth.status.includes('❌')) {
        console.log('   • Start MongoDB: brew services start mongodb-community');
      }
      if (redisHealth.status.includes('❌')) {
        console.log('   • Start Redis: brew services start redis');
      }
      if (chromaHealth.status.includes('❌')) {
        console.log('   • Start ChromaDB: docker run -p 8000:8000 chromadb/chroma');
      }
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});

