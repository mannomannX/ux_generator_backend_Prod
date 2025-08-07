// ==========================================
// BILLING SERVICE - Metrics Middleware
// ==========================================

// Track billing metrics
export const trackBillingMetrics = (metricName) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    // Track response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const metrics = {
        metric: metricName,
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        duration,
        userId: req.user?.id,
        workspaceId: req.workspaceId || req.user?.workspaceId,
        correlationId: req.correlationId
      };
      
      // Log metrics
      req.logger?.info('Billing metric', metrics);
      
      // Send to monitoring service if configured
      if (req.app.locals.monitoring) {
        req.app.locals.monitoring.recordMetric(metricName, metrics);
      }
    });
    
    next();
  };
};

// Record payment attempts
export const recordPaymentAttempt = async (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    if (req.route?.path?.includes('checkout') || req.route?.path?.includes('payment')) {
      const paymentMetric = {
        type: 'payment_attempt',
        success: res.statusCode < 400,
        amount: req.body?.amount,
        currency: req.body?.currency || 'usd',
        planId: req.body?.planId,
        workspaceId: req.workspaceId || req.user?.workspaceId,
        timestamp: new Date().toISOString()
      };
      
      req.logger?.info('Payment attempt', paymentMetric);
      
      // Store in database for analytics
      if (req.billingManager) {
        req.billingManager.recordPaymentMetric(paymentMetric).catch(err => {
          req.logger?.error('Failed to record payment metric', err);
        });
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Record subscription changes
export const recordSubscriptionChange = async (req, res, next) => {
  if (!req.route?.path?.includes('subscription')) {
    return next();
  }
  
  const originalJson = res.json;
  
  res.json = function(data) {
    if (res.statusCode < 400 && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const subscriptionMetric = {
        type: 'subscription_change',
        action: req.method === 'POST' ? 'create' : 'update',
        planId: req.body?.planId || data?.planId,
        previousPlan: req.subscription?.planId,
        workspaceId: req.workspaceId || req.user?.workspaceId,
        timestamp: new Date().toISOString()
      };
      
      req.logger?.info('Subscription change', subscriptionMetric);
      
      // Track revenue impact
      if (req.billingManager) {
        req.billingManager.calculateRevenueImpact(subscriptionMetric).catch(err => {
          req.logger?.error('Failed to calculate revenue impact', err);
        });
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Record credit usage
export const recordCreditUsage = async (req, res, next) => {
  if (!req.route?.path?.includes('credit')) {
    return next();
  }
  
  const startCredits = req.creditBalance?.total;
  const originalJson = res.json;
  
  res.json = function(data) {
    if (res.statusCode < 400 && startCredits !== undefined) {
      const creditMetric = {
        type: 'credit_usage',
        startBalance: startCredits,
        endBalance: data?.balance?.total,
        consumed: startCredits - (data?.balance?.total || startCredits),
        action: req.path,
        workspaceId: req.workspaceId || req.user?.workspaceId,
        timestamp: new Date().toISOString()
      };
      
      if (creditMetric.consumed > 0) {
        req.logger?.info('Credit usage', creditMetric);
        
        // Alert if balance is low
        if (data?.balance?.total < 100) {
          req.logger?.warn('Low credit balance', {
            workspaceId: req.workspaceId,
            balance: data.balance.total
          });
        }
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// General metrics middleware
export const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Track request
  const requestMetrics = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    correlationId: req.correlationId
  };
  
  // Track response
  res.on('finish', () => {
    const responseMetrics = {
      ...requestMetrics,
      statusCode: res.statusCode,
      duration: Date.now() - startTime,
      contentLength: res.get('content-length')
    };
    
    // Log based on status code
    if (res.statusCode >= 500) {
      req.logger?.error('Request failed', responseMetrics);
    } else if (res.statusCode >= 400) {
      req.logger?.warn('Request error', responseMetrics);
    } else if (responseMetrics.duration > 1000) {
      req.logger?.warn('Slow request', responseMetrics);
    } else {
      req.logger?.debug('Request completed', responseMetrics);
    }
    
    // Send to monitoring service
    if (req.app.locals.monitoring) {
      req.app.locals.monitoring.recordRequest(responseMetrics);
    }
  });
  
  next();
};

export default {
  trackBillingMetrics,
  recordPaymentAttempt,
  recordSubscriptionChange,
  recordCreditUsage,
  metricsMiddleware
};