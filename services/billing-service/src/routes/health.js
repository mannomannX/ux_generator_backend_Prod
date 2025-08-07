// ==========================================
// BILLING SERVICE - Health Route
// ==========================================

import express from 'express';
import { HealthCheck } from '@ux-flow/common';

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      service: 'billing-service',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        mongodb: 'checking',
        redis: 'checking',
        stripe: 'checking'
      }
    };

    // Check MongoDB connection
    try {
      if (req.app.locals.mongoClient) {
        const isHealthy = await req.app.locals.mongoClient.healthCheck();
        healthStatus.dependencies.mongodb = isHealthy ? 'healthy' : 'unhealthy';
      } else {
        healthStatus.dependencies.mongodb = 'not_configured';
      }
    } catch (error) {
      healthStatus.dependencies.mongodb = 'unhealthy';
    }

    // Check Redis connection
    try {
      if (req.app.locals.redisClient) {
        const isHealthy = await req.app.locals.redisClient.healthCheck();
        healthStatus.dependencies.redis = isHealthy ? 'healthy' : 'unhealthy';
      } else {
        healthStatus.dependencies.redis = 'not_configured';
      }
    } catch (error) {
      healthStatus.dependencies.redis = 'unhealthy';
    }

    // Check Stripe connection
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        // Simple Stripe API test - get account info
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.accounts.retrieve();
        healthStatus.dependencies.stripe = 'healthy';
      } else {
        healthStatus.dependencies.stripe = 'not_configured';
      }
    } catch (error) {
      healthStatus.dependencies.stripe = 'unhealthy';
      if (error.type === 'StripeAuthenticationError') {
        healthStatus.dependencies.stripe = 'auth_error';
      }
    }

    // Determine overall status
    const allHealthy = Object.values(healthStatus.dependencies)
      .every(status => status === 'healthy' || status === 'not_configured');
    
    if (!allHealthy) {
      healthStatus.status = 'degraded';
      res.status(503);
    }

    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      service: 'billing-service',
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Detailed health check for monitoring systems
router.get('/detailed', async (req, res) => {
  try {
    const detailed = {
      service: 'billing-service',
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      configuration: {
        stripe_configured: !!process.env.STRIPE_SECRET_KEY,
        mongodb_configured: !!process.env.MONGODB_URI,
        redis_configured: !!process.env.REDIS_URL,
        webhooks_configured: !!process.env.STRIPE_WEBHOOK_SECRET
      },
      dependencies: {},
      metrics: {
        active_subscriptions: 0,
        pending_charges: 0,
        failed_payments: 0
      }
    };

    // Add dependency checks with detailed info
    if (req.app.locals.mongoClient) {
      try {
        const mongoHealth = await req.app.locals.mongoClient.healthCheck();
        detailed.dependencies.mongodb = {
          status: mongoHealth ? 'healthy' : 'unhealthy',
          connection_string: process.env.MONGODB_URI ? 'configured' : 'not_configured',
          last_check: new Date().toISOString()
        };
      } catch (error) {
        detailed.dependencies.mongodb = {
          status: 'unhealthy',
          error: error.message,
          last_check: new Date().toISOString()
        };
      }
    }

    // Get basic metrics if possible
    try {
      if (req.app.locals.mongoClient) {
        const db = req.app.locals.mongoClient.getDb();
        
        detailed.metrics.active_subscriptions = await db.collection('subscriptions')
          .countDocuments({ status: 'active' });
        
        detailed.metrics.pending_charges = await db.collection('billing_records')
          .countDocuments({ status: 'pending' });
          
        detailed.metrics.failed_payments = await db.collection('billing_records')
          .countDocuments({ 
            status: 'failed',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          });
      }
    } catch (error) {
      // Metrics failure shouldn't fail health check
      detailed.metrics.error = 'Failed to retrieve metrics';
    }

    res.json(detailed);
  } catch (error) {
    res.status(500).json({
      service: 'billing-service',
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;