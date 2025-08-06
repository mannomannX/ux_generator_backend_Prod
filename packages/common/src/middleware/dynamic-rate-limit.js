// ==========================================
// PACKAGES/COMMON/src/middleware/dynamic-rate-limit.js
// ==========================================

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Rate limit configurations per plan
const RATE_LIMITS = {
  free: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    maxWebSocketMessages: 20,
    maxAIOperations: 5,
    dailyLimit: 100,
  },
  starter: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    maxWebSocketMessages: 60,
    maxAIOperations: 20,
    dailyLimit: 1000,
  },
  professional: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    maxWebSocketMessages: 100,
    maxAIOperations: 50,
    dailyLimit: 5000,
  },
  enterprise: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    maxWebSocketMessages: 500,
    maxAIOperations: 200,
    dailyLimit: 50000,
  },
  unlimited: {
    windowMs: 60 * 1000,
    maxRequests: 10000,
    maxWebSocketMessages: 10000,
    maxAIOperations: 10000,
    dailyLimit: 1000000,
  },
};

/**
 * Get user's plan from request
 */
const getUserPlan = async (req, redisClient, mongoClient) => {
  try {
    // Try to get from request if already set
    if (req.userPlan) {
      return req.userPlan;
    }

    // Get workspace ID from request
    const workspaceId = req.workspace?.id || 
                        req.user?.workspaceId || 
                        req.headers['x-workspace-id'];
    
    if (!workspaceId) {
      return 'free';
    }

    // Check cache first
    const cacheKey = `plan:${workspaceId}`;
    const cachedPlan = await redisClient.get(cacheKey);
    
    if (cachedPlan) {
      req.userPlan = cachedPlan;
      return cachedPlan;
    }

    // Get from database
    const db = mongoClient.getDb();
    const workspace = await db.collection('workspaces').findOne(
      { _id: workspaceId },
      { projection: { 'billing.plan': 1 } }
    );

    const plan = workspace?.billing?.plan || 'free';
    
    // Cache for 5 minutes
    await redisClient.set(cacheKey, plan, 300);
    
    req.userPlan = plan;
    return plan;
  } catch (error) {
    console.error('Error getting user plan:', error);
    return 'free';
  }
};

/**
 * Create dynamic rate limiter for API requests
 */
export const createDynamicRateLimiter = (redisClient, mongoClient, options = {}) => {
  const { 
    type = 'api',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req, res, next) => {
    try {
      // Get user's plan
      const plan = await getUserPlan(req, redisClient, mongoClient);
      const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

      // Create rate limiter for this plan
      const limiter = rateLimit({
        windowMs: limits.windowMs,
        max: limits.maxRequests,
        message: {
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Your ${plan} plan allows ${limits.maxRequests} requests per minute.`,
          limit: limits.maxRequests,
          windowMs: limits.windowMs,
          retryAfter: new Date(Date.now() + limits.windowMs).toISOString(),
          upgradeUrl: plan === 'free' || plan === 'starter' 
            ? `${process.env.FRONTEND_URL}/billing/upgrade` 
            : null,
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        skipFailedRequests,
        keyGenerator: (req) => {
          // Use workspace ID or user ID as key
          return req.workspace?.id || 
                 req.user?.id || 
                 req.ip;
        },
        store: new RedisStore({
          client: redisClient,
          prefix: `rate_limit:${type}:`,
        }),
        handler: (req, res) => {
          // Custom response for rate limit
          res.status(429).json({
            error: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for ${plan} plan`,
            limit: limits.maxRequests,
            windowMs: limits.windowMs,
            plan,
            suggestion: plan === 'free' 
              ? 'Upgrade to a paid plan for higher limits' 
              : 'Contact support if you need higher limits',
            upgradeUrl: plan !== 'enterprise' 
              ? `${process.env.FRONTEND_URL}/billing/upgrade` 
              : null,
          });
        },
      });

      // Apply rate limiter
      limiter(req, res, next);
    } catch (error) {
      console.error('Dynamic rate limiter error:', error);
      // Continue without rate limiting on error
      next();
    }
  };
};

/**
 * Create rate limiter for AI operations
 */
export const createAIRateLimiter = (redisClient, mongoClient) => {
  return async (req, res, next) => {
    try {
      const plan = await getUserPlan(req, redisClient, mongoClient);
      const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

      const limiter = rateLimit({
        windowMs: limits.windowMs,
        max: limits.maxAIOperations,
        message: {
          error: 'AI_RATE_LIMIT_EXCEEDED',
          message: `AI operation limit exceeded. Your ${plan} plan allows ${limits.maxAIOperations} AI operations per minute.`,
          limit: limits.maxAIOperations,
          plan,
        },
        keyGenerator: (req) => {
          return `ai:${req.workspace?.id || req.user?.id || req.ip}`;
        },
        store: new RedisStore({
          client: redisClient,
          prefix: 'rate_limit:ai:',
        }),
      });

      limiter(req, res, next);
    } catch (error) {
      console.error('AI rate limiter error:', error);
      next();
    }
  };
};

/**
 * WebSocket rate limiter
 */
export class WebSocketRateLimiter {
  constructor(redisClient, mongoClient) {
    this.redisClient = redisClient;
    this.mongoClient = mongoClient;
    this.connections = new Map();
  }

  async checkLimit(socketId, workspaceId) {
    try {
      // Get plan
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne(
        { _id: workspaceId },
        { projection: { 'billing.plan': 1 } }
      );
      
      const plan = workspace?.billing?.plan || 'free';
      const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

      // Track messages
      const key = `ws_rate:${workspaceId}`;
      const count = await this.redisClient.incr(key);
      
      if (count === 1) {
        // Set expiry on first message
        await this.redisClient.expire(key, Math.ceil(limits.windowMs / 1000));
      }

      if (count > limits.maxWebSocketMessages) {
        return {
          allowed: false,
          limit: limits.maxWebSocketMessages,
          plan,
          message: `WebSocket message limit exceeded for ${plan} plan`,
        };
      }

      return { allowed: true, remaining: limits.maxWebSocketMessages - count };
    } catch (error) {
      console.error('WebSocket rate limit error:', error);
      return { allowed: true };
    }
  }

  async resetLimit(workspaceId) {
    try {
      const key = `ws_rate:${workspaceId}`;
      await this.redisClient.del(key);
    } catch (error) {
      console.error('Error resetting WebSocket limit:', error);
    }
  }
}

/**
 * Daily limit checker
 */
export const checkDailyLimit = async (redisClient, mongoClient, workspaceId) => {
  try {
    // Get plan
    const db = mongoClient.getDb();
    const workspace = await db.collection('workspaces').findOne(
      { _id: workspaceId },
      { projection: { 'billing.plan': 1 } }
    );
    
    const plan = workspace?.billing?.plan || 'free';
    const limits = RATE_LIMITS[plan] || RATE_LIMITS.free;

    // Check daily usage
    const today = new Date().toISOString().split('T')[0];
    const key = `daily_limit:${workspaceId}:${today}`;
    const count = await redisClient.incr(key);
    
    if (count === 1) {
      // Set expiry to end of day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const ttl = Math.ceil((tomorrow - Date.now()) / 1000);
      await redisClient.expire(key, ttl);
    }

    if (count > limits.dailyLimit) {
      return {
        allowed: false,
        limit: limits.dailyLimit,
        used: count,
        plan,
        resetAt: tomorrow,
      };
    }

    return {
      allowed: true,
      remaining: limits.dailyLimit - count,
      limit: limits.dailyLimit,
    };
  } catch (error) {
    console.error('Daily limit check error:', error);
    return { allowed: true };
  }
};

/**
 * Middleware to check daily limits
 */
export const dailyLimitMiddleware = (redisClient, mongoClient) => {
  return async (req, res, next) => {
    const workspaceId = req.workspace?.id || req.user?.workspaceId;
    
    if (!workspaceId) {
      return next();
    }

    const result = await checkDailyLimit(redisClient, mongoClient, workspaceId);
    
    if (!result.allowed) {
      return res.status(429).json({
        error: 'DAILY_LIMIT_EXCEEDED',
        message: `Daily request limit exceeded for ${result.plan} plan`,
        limit: result.limit,
        used: result.used,
        resetAt: result.resetAt,
        upgradeUrl: `${process.env.FRONTEND_URL}/billing/upgrade`,
      });
    }

    // Add remaining to headers
    res.setHeader('X-Daily-Limit', result.limit);
    res.setHeader('X-Daily-Remaining', result.remaining);
    
    next();
  };
};

/**
 * Get current rate limit status
 */
export const getRateLimitStatus = async (redisClient, mongoClient, workspaceId) => {
  try {
    // Get plan
    const db = mongoClient.getDb();
    const workspace = await db.collection('workspaces').findOne(
      { _id: workspaceId },
      { projection: { 'billing.plan': 1 } }
    );
    
    const plan = workspace?.billing?.plan || 'free';
    const limits = RATE_LIMITS[plan];

    // Get current usage
    const apiKey = `rate_limit:api:${workspaceId}`;
    const aiKey = `rate_limit:ai:${workspaceId}`;
    const wsKey = `ws_rate:${workspaceId}`;
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `daily_limit:${workspaceId}:${today}`;

    const [apiCount, aiCount, wsCount, dailyCount] = await Promise.all([
      redisClient.get(apiKey),
      redisClient.get(aiKey),
      redisClient.get(wsKey),
      redisClient.get(dailyKey),
    ]);

    return {
      plan,
      limits,
      usage: {
        api: parseInt(apiCount) || 0,
        ai: parseInt(aiCount) || 0,
        websocket: parseInt(wsCount) || 0,
        daily: parseInt(dailyCount) || 0,
      },
      remaining: {
        api: limits.maxRequests - (parseInt(apiCount) || 0),
        ai: limits.maxAIOperations - (parseInt(aiCount) || 0),
        websocket: limits.maxWebSocketMessages - (parseInt(wsCount) || 0),
        daily: limits.dailyLimit - (parseInt(dailyCount) || 0),
      },
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return null;
  }
};

export default {
  RATE_LIMITS,
  createDynamicRateLimiter,
  createAIRateLimiter,
  WebSocketRateLimiter,
  checkDailyLimit,
  dailyLimitMiddleware,
  getRateLimitStatus,
};