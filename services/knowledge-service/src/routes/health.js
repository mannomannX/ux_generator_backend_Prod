/**
 * Health Check Routes
 * Provides health status endpoints for the knowledge service
 */

import { Router } from 'express';
import { Logger } from '@ux-flow/common';

const router = Router();
const logger = new Logger('KnowledgeHealthRoutes');

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const healthCheck = {
      status: 'healthy',
      service: 'knowledge-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024
      }
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'knowledge-service',
      error: error.message
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe - checks if service is ready to accept requests
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Check if dependencies are initialized
    const app = req.app;
    const checks = {
      mongodb: false,
      redis: false,
      chromadb: false
    };

    // Check MongoDB connection
    if (app.locals.mongoClient && app.locals.mongoClient.isConnected()) {
      checks.mongodb = true;
    }

    // Check Redis connection
    if (app.locals.redisClient && app.locals.redisClient.isReady) {
      checks.redis = true;
    }

    // Check ChromaDB connection
    if (app.locals.knowledgeManager) {
      checks.chromadb = true;
    }

    const allHealthy = Object.values(checks).every(check => check === true);

    if (allHealthy) {
      res.status(200).json({
        status: 'ready',
        service: 'knowledge-service',
        checks
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        service: 'knowledge-service',
        checks
      });
    }
  } catch (error) {
    logger.error('Readiness check failed', error);
    res.status(503).json({
      status: 'error',
      service: 'knowledge-service',
      error: error.message
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - checks if service is alive
 */
router.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    service: 'knowledge-service',
    timestamp: new Date().toISOString()
  });
});

export default router;