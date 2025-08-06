// ==========================================
// PACKAGES/COMMON/src/monitoring/metrics.js
// ==========================================

import promClient from 'prom-client';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const metrics = {
  // HTTP metrics
  httpRequestDuration: new promClient.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'service'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  }),

  httpRequestsTotal: new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'service'],
  }),

  // WebSocket metrics
  websocketConnectionsActive: new promClient.Gauge({
    name: 'websocket_connections_active',
    help: 'Number of active WebSocket connections',
    labelNames: ['service'],
  }),

  websocketMessagesTotal: new promClient.Counter({
    name: 'websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['direction', 'type', 'service'],
  }),

  // AI Agent metrics
  aiOperationsTotal: new promClient.Counter({
    name: 'ai_operations_total',
    help: 'Total number of AI operations',
    labelNames: ['agent', 'operation', 'status', 'service'],
  }),

  aiOperationDuration: new promClient.Histogram({
    name: 'ai_operation_duration_seconds',
    help: 'Duration of AI operations in seconds',
    labelNames: ['agent', 'operation', 'service'],
    buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  }),

  // Credit metrics
  creditsConsumedTotal: new promClient.Counter({
    name: 'credits_consumed_total',
    help: 'Total number of credits consumed',
    labelNames: ['workspace_id', 'operation', 'plan'],
  }),

  creditBalance: new promClient.Gauge({
    name: 'credit_balance',
    help: 'Current credit balance',
    labelNames: ['workspace_id', 'plan'],
  }),

  // Subscription metrics
  subscriptionsActive: new promClient.Gauge({
    name: 'subscriptions_active',
    help: 'Number of active subscriptions',
    labelNames: ['plan', 'status'],
  }),

  subscriptionChangesTotal: new promClient.Counter({
    name: 'subscription_changes_total',
    help: 'Total number of subscription changes',
    labelNames: ['from_plan', 'to_plan', 'type'],
  }),

  // Payment metrics
  paymentsTotal: new promClient.Counter({
    name: 'payments_total',
    help: 'Total number of payments',
    labelNames: ['status', 'type', 'currency'],
  }),

  revenueTotal: new promClient.Counter({
    name: 'revenue_total',
    help: 'Total revenue in cents',
    labelNames: ['currency', 'type'],
  }),

  // Database metrics
  databaseOperationsTotal: new promClient.Counter({
    name: 'database_operations_total',
    help: 'Total number of database operations',
    labelNames: ['operation', 'collection', 'status', 'service'],
  }),

  databaseOperationDuration: new promClient.Histogram({
    name: 'database_operation_duration_seconds',
    help: 'Duration of database operations in seconds',
    labelNames: ['operation', 'collection', 'service'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  }),

  // Cache metrics
  cacheHitsTotal: new promClient.Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type', 'service'],
  }),

  cacheMissesTotal: new promClient.Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type', 'service'],
  }),

  // Error metrics
  errorsTotal: new promClient.Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'service', 'severity'],
  }),

  // Business metrics
  usersTotal: new promClient.Gauge({
    name: 'users_total',
    help: 'Total number of users',
    labelNames: ['status', 'plan'],
  }),

  workspacesTotal: new promClient.Gauge({
    name: 'workspaces_total',
    help: 'Total number of workspaces',
    labelNames: ['plan', 'status'],
  }),

  flowsTotal: new promClient.Gauge({
    name: 'flows_total',
    help: 'Total number of flows',
    labelNames: ['status'],
  }),
};

// Register all metrics
Object.values(metrics).forEach(metric => register.registerMetric(metric));

/**
 * Express middleware for collecting HTTP metrics
 */
export const metricsMiddleware = (serviceName) => {
  return (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode,
        service: serviceName,
      };
      
      metrics.httpRequestDuration.observe(labels, duration);
      metrics.httpRequestsTotal.inc(labels);
    });
    
    next();
  };
};

/**
 * Track AI operation
 */
export const trackAIOperation = (agent, operation, duration, status = 'success', serviceName = 'cognitive-core') => {
  metrics.aiOperationsTotal.inc({
    agent,
    operation,
    status,
    service: serviceName,
  });
  
  if (duration) {
    metrics.aiOperationDuration.observe({
      agent,
      operation,
      service: serviceName,
    }, duration);
  }
};

/**
 * Track credit consumption
 */
export const trackCreditConsumption = (workspaceId, operation, amount, plan) => {
  metrics.creditsConsumedTotal.inc({
    workspace_id: workspaceId,
    operation,
    plan,
  }, amount);
};

/**
 * Update credit balance metric
 */
export const updateCreditBalance = (workspaceId, balance, plan) => {
  metrics.creditBalance.set({
    workspace_id: workspaceId,
    plan,
  }, balance);
};

/**
 * Track subscription change
 */
export const trackSubscriptionChange = (fromPlan, toPlan, type = 'upgrade') => {
  metrics.subscriptionChangesTotal.inc({
    from_plan: fromPlan,
    to_plan: toPlan,
    type,
  });
};

/**
 * Track payment
 */
export const trackPayment = (amount, currency, status, type = 'subscription') => {
  metrics.paymentsTotal.inc({
    status,
    type,
    currency,
  });
  
  if (status === 'success') {
    metrics.revenueTotal.inc({
      currency,
      type,
    }, amount);
  }
};

/**
 * Track database operation
 */
export const trackDatabaseOperation = (operation, collection, duration, status = 'success', serviceName) => {
  metrics.databaseOperationsTotal.inc({
    operation,
    collection,
    status,
    service: serviceName,
  });
  
  if (duration) {
    metrics.databaseOperationDuration.observe({
      operation,
      collection,
      service: serviceName,
    }, duration);
  }
};

/**
 * Track cache hit/miss
 */
export const trackCacheHit = (cacheType, serviceName) => {
  metrics.cacheHitsTotal.inc({
    cache_type: cacheType,
    service: serviceName,
  });
};

export const trackCacheMiss = (cacheType, serviceName) => {
  metrics.cacheMissesTotal.inc({
    cache_type: cacheType,
    service: serviceName,
  });
};

/**
 * Track error
 */
export const trackError = (type, serviceName, severity = 'error') => {
  metrics.errorsTotal.inc({
    type,
    service: serviceName,
    severity,
  });
};

/**
 * Update business metrics
 */
export const updateBusinessMetrics = async (mongoClient) => {
  try {
    const db = mongoClient.getDb();
    
    // Update user metrics
    const userStats = await db.collection('users').aggregate([
      {
        $group: {
          _id: { status: '$status', plan: '$billing.plan' },
          count: { $sum: 1 },
        },
      },
    ]).toArray();
    
    userStats.forEach(stat => {
      metrics.usersTotal.set({
        status: stat._id.status || 'unknown',
        plan: stat._id.plan || 'free',
      }, stat.count);
    });
    
    // Update workspace metrics
    const workspaceStats = await db.collection('workspaces').aggregate([
      {
        $group: {
          _id: { plan: '$billing.plan', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]).toArray();
    
    workspaceStats.forEach(stat => {
      metrics.workspacesTotal.set({
        plan: stat._id.plan || 'free',
        status: stat._id.status || 'active',
      }, stat.count);
    });
    
    // Update flow metrics
    const flowCount = await db.collection('flows').countDocuments({ status: { $ne: 'deleted' } });
    metrics.flowsTotal.set({ status: 'active' }, flowCount);
    
  } catch (error) {
    console.error('Failed to update business metrics:', error);
  }
};

/**
 * Get metrics for Prometheus scraping
 */
export const getMetrics = () => {
  return register.metrics();
};

/**
 * Get content type for metrics
 */
export const getMetricsContentType = () => {
  return register.contentType;
};

/**
 * Express route handler for metrics endpoint
 */
export const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', getMetricsContentType());
    const metrics = await getMetrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end();
  }
};

export default {
  metrics,
  register,
  metricsMiddleware,
  trackAIOperation,
  trackCreditConsumption,
  updateCreditBalance,
  trackSubscriptionChange,
  trackPayment,
  trackDatabaseOperation,
  trackCacheHit,
  trackCacheMiss,
  trackError,
  updateBusinessMetrics,
  getMetrics,
  getMetricsContentType,
  metricsHandler,
};