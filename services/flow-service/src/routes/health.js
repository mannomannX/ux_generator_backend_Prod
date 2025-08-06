// ==========================================
// SERVICES/FLOW-SERVICE/src/routes/health.js
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
    service: 'flow-service',
    version: process.env.npm_package_version || '1.0.0',
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

  // Get flow service specific statistics
  let flowStats = null;
  if (req.flowManager) {
    try {
      const db = req.flowManager.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      const versionsCollection = db.collection('flow_versions');

      const [totalFlows, activeFlows, totalVersions] = await Promise.all([
        flowsCollection.countDocuments(),
        flowsCollection.countDocuments({ 'metadata.status': { $ne: 'deleted' } }),
        versionsCollection.countDocuments(),
      ]);

      flowStats = {
        totalFlows,
        activeFlows,
        deletedFlows: totalFlows - activeFlows,
        totalVersions,
        avgVersionsPerFlow: totalFlows > 0 ? (totalVersions / totalFlows).toFixed(2) : 0,
      };
    } catch (error) {
      flowStats = { error: 'Failed to get flow stats' };
    }
  }

  const statusCode = health.status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    ...health,
    service: 'flow-service',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    system: systemInfo,
    flowStatistics: flowStats,
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
  
  let metrics = [];

  // Service uptime
  const uptime = process.uptime();
  metrics.push(`# HELP flow_service_uptime_seconds Service uptime in seconds`);
  metrics.push(`# TYPE flow_service_uptime_seconds counter`);
  metrics.push(`flow_service_uptime_seconds ${uptime}`);

  // Memory usage
  const memory = process.memoryUsage();
  metrics.push(`# HELP flow_service_memory_usage_bytes Memory usage in bytes`);
  metrics.push(`# TYPE flow_service_memory_usage_bytes gauge`);
  metrics.push(`flow_service_memory_usage_bytes{type="rss"} ${memory.rss}`);
  metrics.push(`flow_service_memory_usage_bytes{type="heapUsed"} ${memory.heapUsed}`);
  metrics.push(`flow_service_memory_usage_bytes{type="heapTotal"} ${memory.heapTotal}`);

  // Flow-specific metrics
  if (req.flowManager) {
    try {
      const db = req.flowManager.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      const versionsCollection = db.collection('flow_versions');

      const [totalFlows, activeFlows, totalVersions] = await Promise.all([
        flowsCollection.countDocuments(),
        flowsCollection.countDocuments({ 'metadata.status': { $ne: 'deleted' } }),
        versionsCollection.countDocuments(),
      ]);

      metrics.push(`# HELP flow_service_flows_total Total number of flows`);
      metrics.push(`# TYPE flow_service_flows_total counter`);
      metrics.push(`flow_service_flows_total{status="total"} ${totalFlows}`);
      metrics.push(`flow_service_flows_total{status="active"} ${activeFlows}`);
      metrics.push(`flow_service_flows_total{status="deleted"} ${totalFlows - activeFlows}`);

      metrics.push(`# HELP flow_service_versions_total Total number of flow versions`);
      metrics.push(`# TYPE flow_service_versions_total counter`);
      metrics.push(`flow_service_versions_total ${totalVersions}`);

    } catch (error) {
      metrics.push(`# Error collecting flow metrics: ${error.message}`);
    }
  }

  // Health status (1 = healthy, 0 = unhealthy)
  if (healthCheck) {
    try {
      const health = await healthCheck.checkHealth();
      const healthValue = health.status === 'ok' ? 1 : 0;
      metrics.push(`# HELP flow_service_health Service health status`);
      metrics.push(`# TYPE flow_service_health gauge`);
      metrics.push(`flow_service_health ${healthValue}`);
    } catch (error) {
      metrics.push(`flow_service_health 0`);
    }
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.join('\n') + '\n');
}));

// Flow service specific health endpoints
router.get('/flows/stats', asyncHandler(async (req, res) => {
  if (!req.flowManager) {
    return res.status(503).json({
      error: 'Flow manager not available',
      correlationId: req.correlationId,
    });
  }

  try {
    const db = req.flowManager.mongoClient.getDb();
    const flowsCollection = db.collection('flows');
    const versionsCollection = db.collection('flow_versions');

    // Get comprehensive flow statistics
    const [
      totalFlows,
      activeFlows,
      flowsByWorkspace,
      recentFlows,
      versionStats,
      nodeTypeStats,
    ] = await Promise.all([
      // Total flows
      flowsCollection.countDocuments(),
      
      // Active flows
      flowsCollection.countDocuments({ 'metadata.status': { $ne: 'deleted' } }),
      
      // Flows by workspace
      flowsCollection.aggregate([
        { $match: { 'metadata.status': { $ne: 'deleted' } } },
        { $group: { _id: '$metadata.workspaceId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray(),
      
      // Recent flows (last 24 hours)
      flowsCollection.countDocuments({
        'metadata.createdAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      
      // Version statistics
      versionsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalVersions: { $sum: 1 },
            avgSize: { $avg: '$size' },
            totalSize: { $sum: '$size' },
          }
        }
      ]).toArray(),
      
      // Node type statistics
      flowsCollection.aggregate([
        { $match: { 'metadata.status': { $ne: 'deleted' } } },
        { $unwind: '$nodes' },
        { $group: { _id: '$nodes.type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
    ]);

    const stats = {
      flows: {
        total: totalFlows,
        active: activeFlows,
        deleted: totalFlows - activeFlows,
        recentlyCreated: recentFlows,
      },
      versions: versionStats[0] || {
        totalVersions: 0,
        avgSize: 0,
        totalSize: 0,
      },
      workspaces: {
        topWorkspaces: flowsByWorkspace,
        totalWorkspacesWithFlows: flowsByWorkspace.length,
      },
      nodeTypes: nodeTypeStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      timestamp: new Date().toISOString(),
    };

    res.json(stats);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get flow statistics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
}));

// Validation service health
router.get('/validation/health', asyncHandler(async (req, res) => {
  if (!req.validationService) {
    return res.status(503).json({
      error: 'Validation service not available',
      correlationId: req.correlationId,
    });
  }

  try {
    const health = req.validationService.healthCheck();
    
    res.json({
      validation: health,
      service: 'flow-validation',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation health check failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
}));

// Versioning service health
router.get('/versioning/health', asyncHandler(async (req, res) => {
  if (!req.versioningService) {
    return res.status(503).json({
      error: 'Versioning service not available',
      correlationId: req.correlationId,
    });
  }

  try {
    // Get some versioning statistics
    const db = req.versioningService.mongoClient.getDb();
    const versionsCollection = db.collection('flow_versions');
    
    const [totalVersions, recentVersions] = await Promise.all([
      versionsCollection.countDocuments(),
      versionsCollection.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
    ]);

    res.json({
      versioning: {
        status: 'ok',
        totalVersions,
        recentVersions,
      },
      service: 'flow-versioning',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(500).json({
      error: 'Versioning health check failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
}));

export default router;