// ==========================================
// SERVICES/API-GATEWAY/src/routes/health.js
// ==========================================
import express from 'express';
import { asyncHandler } from '../middleware/error-handler.js';

const router = express.Router();

// Basic health check
router.get('/', asyncHandler(async (req, res) => {
  // This will be populated by the health check middleware in the main server
  const healthCheck = req.app.locals.healthCheck;
  
  if (!healthCheck) {
    return res.status(503).json({
      status: 'error',
      message: 'Health check service not available',
      timestamp: new Date().toISOString(),
    });
  }

  const health = await healthCheck.checkHealth();
  const statusCode = health.status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    ...health,
    service: 'api-gateway',
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req, res) => {
  const healthCheck = req.app.locals.healthCheck;
  
  if (!healthCheck) {
    return res.status(503).json({
      status: 'error',
      message: 'Health check service not available',
    });
  }

  const health = await healthCheck.checkHealth();
  const wsManager = req.app.locals.wsManager;
  
  // Get additional system information
  const systemInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
  };

  // Get WebSocket statistics if available
  let wsStats = null;
  if (wsManager) {
    try {
      wsStats = wsManager.getStats();
    } catch (error) {
      wsStats = { error: 'Failed to get WebSocket stats' };
    }
  }

  const statusCode = health.status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    ...health,
    service: 'api-gateway',
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    system: systemInfo,
    websocket: wsStats,
    timestamp: new Date().toISOString(),
  });
}));

// Live check (minimal response for load balancers)
router.get('/live', (req, res) => {
  res.status(200).send('OK');
});

// Ready check (checks if service is ready to accept traffic)
router.get('/ready', asyncHandler(async (req, res) => {
  const healthCheck = req.app.locals.healthCheck;
  
  if (!healthCheck) {
    return res.status(503).send('Not Ready');
  }

  const health = await healthCheck.checkHealth();
  
  // Consider service ready if status is 'ok' or 'degraded'
  if (health.status === 'ok' || health.status === 'degraded') {
    res.status(200).send('Ready');
  } else {
    res.status(503).send('Not Ready');
  }
}));

// Metrics endpoint (Prometheus-compatible)
router.get('/metrics', asyncHandler(async (req, res) => {
  const healthCheck = req.app.locals.healthCheck;
  const wsManager = req.app.locals.wsManager;
  
  let metrics = [];

  // Service uptime
  const uptime = process.uptime();
  metrics.push(`# HELP api_gateway_uptime_seconds Service uptime in seconds`);
  metrics.push(`# TYPE api_gateway_uptime_seconds counter`);
  metrics.push(`api_gateway_uptime_seconds ${uptime}`);

  // Memory usage
  const memory = process.memoryUsage();
  metrics.push(`# HELP api_gateway_memory_usage_bytes Memory usage in bytes`);
  metrics.push(`# TYPE api_gateway_memory_usage_bytes gauge`);
  metrics.push(`api_gateway_memory_usage_bytes{type="rss"} ${memory.rss}`);
  metrics.push(`api_gateway_memory_usage_bytes{type="heapUsed"} ${memory.heapUsed}`);
  metrics.push(`api_gateway_memory_usage_bytes{type="heapTotal"} ${memory.heapTotal}`);

  // WebSocket connections
  if (wsManager) {
    try {
      const wsStats = wsManager.getStats();
      metrics.push(`# HELP api_gateway_websocket_connections WebSocket connection count`);
      metrics.push(`# TYPE api_gateway_websocket_connections gauge`);
      metrics.push(`api_gateway_websocket_connections{type="total"} ${wsStats.totalConnections}`);
      metrics.push(`api_gateway_websocket_connections{type="active"} ${wsStats.activeConnections}`);
    } catch (error) {
      // Ignore WebSocket stats errors in metrics
    }
  }

  // Health status (1 = healthy, 0 = unhealthy)
  if (healthCheck) {
    try {
      const health = await healthCheck.checkHealth();
      const healthValue = health.status === 'ok' ? 1 : 0;
      metrics.push(`# HELP api_gateway_health Service health status`);
      metrics.push(`# TYPE api_gateway_health gauge`);
      metrics.push(`api_gateway_health ${healthValue}`);
    } catch (error) {
      metrics.push(`api_gateway_health 0`);
    }
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.join('\n') + '\n');
}));

export default router;