// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/health.js
// ==========================================

import express from 'express';

const router = express.Router();

/**
 * Health Check Endpoint
 * GET /health
 * 
 * Returns the health status of the User Management Service
 * and its dependencies (MongoDB, Redis, Email service)
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Get health check instance from request (injected by server.js)
    const healthCheck = req.app.locals.healthCheck;

    if (!healthCheck) {
      return res.status(503).json({
        status: 'error',
        service: 'user-management',
        version: process.env.npm_package_version || '1.0.0',
        message: 'Health check service not available',
        timestamp: new Date().toISOString(),
      });
    }

    // Perform comprehensive health check
    const health = await healthCheck.checkHealth();

    // Determine overall status
    let overallStatus = 'ok';
    const dependencies = health.dependencies || {};

    // Check critical dependencies
    if (dependencies.mongodb === 'error') {
      overallStatus = 'error'; // Critical failure
    } else if (dependencies.redis === 'error' || dependencies.email === 'error') {
      overallStatus = 'degraded'; // Non-critical failure
    }

    // Get additional service metrics
    const serviceMetrics = await getServiceMetrics(req);

    const responseTime = Date.now() - startTime;

    const healthResponse = {
      status: overallStatus,
      service: 'user-management',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      dependencies: {
        mongodb: dependencies.mongodb || 'unknown',
        redis: dependencies.redis || 'unknown',
        email: dependencies.email || 'not_configured',
      },
      features: {
        registration: process.env.ALLOW_SIGNUP !== 'false' ? 'enabled' : 'disabled',
        emailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true' ? 'enabled' : 'disabled',
        socialLogin: process.env.ENABLE_SOCIAL_LOGIN === 'true' ? 'enabled' : 'disabled',
        twoFactorAuth: process.env.ENABLE_2FA === 'true' ? 'enabled' : 'disabled',
      },
      metrics: serviceMetrics,
      timestamp: new Date().toISOString(),
    };

    // Set appropriate HTTP status code
    const statusCode = overallStatus === 'ok' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthResponse);

  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Log the error
    if (req.logger) {
      req.logger.error('Health check failed', error, {
        responseTime,
        correlationId: req.correlationId,
      });
    }

    res.status(503).json({
      status: 'error',
      service: 'user-management',
      version: process.env.npm_package_version || '1.0.0',
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Detailed Health Check Endpoint
 * GET /health/detailed
 * 
 * Returns detailed health information including database stats
 */
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();

  try {
    const healthCheck = req.app.locals.healthCheck;
    
    if (!healthCheck) {
      return res.status(503).json({
        status: 'error',
        message: 'Health check service not available',
      });
    }

    // Get basic health
    const health = await healthCheck.checkHealth();
    
    // Get detailed service statistics
    const detailedMetrics = await getDetailedMetrics(req);

    const responseTime = Date.now() - startTime;

    res.json({
      ...health,
      responseTime: `${responseTime}ms`,
      detailed: detailedMetrics,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        cpu: process.cpuUsage(),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;

    res.status(503).json({
      status: 'error',
      message: 'Detailed health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Readiness Check Endpoint
 * GET /health/ready
 * 
 * Returns 200 if service is ready to accept requests
 * Used by Kubernetes readiness probes
 */
router.get('/ready', async (req, res) => {
  try {
    const userManager = req.app.locals.userManager;
    const workspaceManager = req.app.locals.workspaceManager;

    // Check if essential services are initialized
    if (!userManager || !workspaceManager) {
      return res.status(503).json({
        ready: false,
        message: 'Service managers not initialized',
      });
    }

    // Quick database connectivity check
    const mongoHealth = await userManager.healthCheck();
    const workspaceHealth = await workspaceManager.healthCheck();

    if (mongoHealth.status !== 'ok' || workspaceHealth.status !== 'ok') {
      return res.status(503).json({
        ready: false,
        message: 'Database connectivity issues',
      });
    }

    res.json({
      ready: true,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Liveness Check Endpoint
 * GET /health/live
 * 
 * Returns 200 if service is alive (basic process check)
 * Used by Kubernetes liveness probes
 */
router.get('/live', (req, res) => {
  res.json({
    alive: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Get basic service metrics
 */
async function getServiceMetrics(req) {
  try {
    const userManager = req.app.locals.userManager;
    
    if (!userManager) {
      return { error: 'User manager not available' };
    }

    // Get user statistics
    const userStats = await userManager.getUserStats();

    return {
      users: {
        total: userStats.totalUsers || 0,
        active: userStats.activeUsers || 0,
        verified: userStats.verifiedUsers || 0,
      },
      requests: {
        total: req.app.locals.requestCount || 0,
        errors: req.app.locals.errorCount || 0,
      },
    };

  } catch (error) {
    return { error: 'Failed to get service metrics' };
  }
}

/**
 * Get detailed service metrics
 */
async function getDetailedMetrics(req) {
  try {
    const userManager = req.app.locals.userManager;
    const workspaceManager = req.app.locals.workspaceManager;

    const [userStats, workspaceStats] = await Promise.all([
      userManager ? userManager.getUserStats() : null,
      workspaceManager ? getWorkspaceStats(workspaceManager) : null,
    ]);

    return {
      users: userStats || { error: 'User stats unavailable' },
      workspaces: workspaceStats || { error: 'Workspace stats unavailable' },
      database: {
        connections: {
          mongodb: 'active', // Would check actual connection pool
          redis: 'active',
        },
      },
    };

  } catch (error) {
    return { error: 'Failed to get detailed metrics' };
  }
}

/**
 * Get workspace statistics
 */
async function getWorkspaceStats(workspaceManager) {
  try {
    // This would need to be implemented in WorkspaceManager
    return {
      total: 0,
      active: 0,
      withProjects: 0,
    };
  } catch (error) {
    return { error: 'Workspace stats unavailable' };
  }
}

export default router;