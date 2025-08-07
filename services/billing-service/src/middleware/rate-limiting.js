// ==========================================
// BILLING SERVICE - Rate Limiting Middleware
// ==========================================

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Rate limit by subscription plan
export const rateLimitByPlan = (req, res, next) => {
  // Get plan-specific limits
  const planLimits = {
    free: { windowMs: 15 * 60 * 1000, max: 10 },
    starter: { windowMs: 15 * 60 * 1000, max: 50 },
    professional: { windowMs: 15 * 60 * 1000, max: 200 },
    enterprise: { windowMs: 15 * 60 * 1000, max: 1000 }
  };
  
  const plan = req.subscription?.planId || 'free';
  const limits = planLimits[plan] || planLimits.free;
  
  const limiter = rateLimit({
    store: req.app.locals.redisClient ? new RedisStore({
      client: req.app.locals.redisClient,
      prefix: `billing:ratelimit:${plan}:`
    }) : undefined,
    windowMs: limits.windowMs,
    max: limits.max,
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded for ${plan} plan`,
        limit: limits.max,
        window: `${limits.windowMs / 1000} seconds`,
        retryAfter: req.rateLimit.resetTime,
        upgradeUrl: '/api/v1/billing/plans',
        correlationId: req.correlationId
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  
  limiter(req, res, next);
};

// Webhook-specific rate limiting
export const rateLimitWebhooks = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook events per minute
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Rate limit by event type and source
    const eventType = req.body?.type || 'unknown';
    const source = req.headers['stripe-signature'] ? 'stripe' : 'unknown';
    return `webhook:${source}:${eventType}`;
  },
  handler: (req, res) => {
    // Webhooks should return 200 to prevent retries
    res.status(200).json({
      received: true,
      processed: false,
      reason: 'rate_limit_exceeded'
    });
  }
});

// API endpoint rate limiting
export const rateLimitAPI = {
  // Strict limit for payment endpoints
  payment: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 payment attempts per 15 minutes
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      return `payment:${req.user?.id || req.ip}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'PAYMENT_RATE_LIMIT',
        message: 'Too many payment attempts. Please try again later.',
        retryAfter: req.rateLimit.resetTime,
        correlationId: req.correlationId
      });
    }
  }),
  
  // Moderate limit for subscription changes
  subscription: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 subscription changes per hour
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      return `subscription:${req.user?.workspaceId || req.user?.id}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'SUBSCRIPTION_RATE_LIMIT',
        message: 'Too many subscription changes. Please try again later.',
        retryAfter: req.rateLimit.resetTime,
        correlationId: req.correlationId
      });
    }
  }),
  
  // Lenient limit for credit checks
  credits: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 credit checks per minute
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      return `credits:${req.user?.workspaceId || req.user?.id}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'CREDIT_RATE_LIMIT',
        message: 'Too many credit operations. Please slow down.',
        retryAfter: req.rateLimit.resetTime,
        correlationId: req.correlationId
      });
    }
  }),
  
  // General API rate limit
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      return `api:${req.user?.id || req.ip}`;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'API_RATE_LIMIT',
        message: 'Too many requests. Please try again later.',
        retryAfter: req.rateLimit.resetTime,
        correlationId: req.correlationId
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  })
};

// Dynamic rate limiting based on user behavior
export const dynamicRateLimit = (req, res, next) => {
  // Check if user has been flagged for suspicious activity
  if (req.user?.flags?.includes('suspicious_activity')) {
    const strictLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // Only 10 requests per hour for flagged users
      keyGenerator: (req) => `flagged:${req.user.id}`,
      handler: (req, res) => {
        res.status(429).json({
          error: 'ACCOUNT_RESTRICTED',
          message: 'Your account has been temporarily restricted due to suspicious activity.',
          supportUrl: '/support',
          correlationId: req.correlationId
        });
      }
    });
    
    return strictLimiter(req, res, next);
  }
  
  // Check for burst patterns
  const burstKey = `burst:${req.user?.id || req.ip}`;
  const burstCount = req.app.locals.burstTracker?.get(burstKey) || 0;
  
  if (burstCount > 10) {
    // Apply temporary strict limit for burst behavior
    const burstLimiter = rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 20,
      keyGenerator: () => burstKey,
      handler: (req, res) => {
        res.status(429).json({
          error: 'BURST_LIMIT',
          message: 'Burst limit exceeded. Please space out your requests.',
          retryAfter: req.rateLimit.resetTime,
          correlationId: req.correlationId
        });
      }
    });
    
    return burstLimiter(req, res, next);
  }
  
  // Track burst behavior
  if (req.app.locals.burstTracker) {
    req.app.locals.burstTracker.set(burstKey, burstCount + 1);
    setTimeout(() => {
      const current = req.app.locals.burstTracker.get(burstKey) || 0;
      if (current > 0) {
        req.app.locals.burstTracker.set(burstKey, current - 1);
      }
    }, 10000); // Decay after 10 seconds
  }
  
  next();
};

export default {
  rateLimitByPlan,
  rateLimitWebhooks,
  rateLimitAPI,
  dynamicRateLimit
};