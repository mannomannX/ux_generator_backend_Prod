// ==========================================
// API GATEWAY - Tier-based Rate Limiting
// Based on OPEN_QUESTIONS_ANSWERS.md specifications
// ==========================================

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

/**
 * Tier-based rate limiting configuration
 */
export class TierRateLimiter {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    
    // Rate limit configurations per tier
    this.tierLimits = {
      free: {
        ai: {
          windowMs: 60 * 60 * 1000, // 1 hour
          max: 10, // 10 AI requests per hour
          message: 'Free tier limit: 10 AI requests per hour'
        },
        data: {
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          max: 1000, // 1000 data operations per day
          message: 'Free tier limit: 1000 data operations per day'
        },
        websocket: {
          messagesPerMinute: 20,
          maxConnections: 1
        }
      },
      pro: {
        ai: {
          windowMs: 60 * 60 * 1000, // 1 hour
          max: 100, // 100 AI requests per hour
          message: 'Pro tier limit: 100 AI requests per hour'
        },
        data: {
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          max: 10000, // 10000 data operations per day
          message: 'Pro tier limit: 10000 data operations per day'
        },
        websocket: {
          messagesPerMinute: 100,
          maxConnections: 5
        }
      },
      enterprise: {
        ai: {
          windowMs: 60 * 60 * 1000, // 1 hour
          max: parseInt(process.env.ENTERPRISE_AI_LIMIT) || 10000, // Configurable
          message: 'Enterprise tier limit exceeded'
        },
        data: {
          windowMs: 24 * 60 * 60 * 1000, // 24 hours
          max: parseInt(process.env.ENTERPRISE_DATA_LIMIT) || 1000000, // Configurable
          message: 'Enterprise tier limit exceeded'
        },
        websocket: {
          messagesPerMinute: parseInt(process.env.ENTERPRISE_WS_MSG_LIMIT) || 1000,
          maxConnections: parseInt(process.env.ENTERPRISE_WS_CONN_LIMIT) || 100
        }
      }
    };
    
    // WebSocket connection tracking
    this.wsConnections = new Map();
    this.wsMessageCounts = new Map();
  }

  /**
   * Get user tier from request
   */
  getUserTier(req) {
    // Get tier from user object (set by auth middleware)
    if (req.user?.tier) {
      return req.user.tier;
    }
    
    // Check for API key tier
    if (req.headers['x-api-key']) {
      // This would normally check the API key against database
      return this.getApiKeyTier(req.headers['x-api-key']);
    }
    
    // Default to free tier
    return 'free';
  }

  /**
   * Create AI request rate limiter
   */
  createAIRateLimiter() {
    return (req, res, next) => {
      const tier = this.getUserTier(req);
      const limits = this.tierLimits[tier].ai;
      
      const limiter = rateLimit({
        windowMs: limits.windowMs,
        max: limits.max,
        message: {
          error: 'Rate limit exceeded',
          message: limits.message,
          tier: tier,
          retryAfter: limits.windowMs / 1000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          // Use user ID or API key as identifier
          return req.user?.id || req.headers['x-api-key'] || req.ip;
        },
        store: new RedisStore({
          client: this.redisClient,
          prefix: `rl:ai:${tier}:`
        }),
        skip: (req) => {
          // SECURITY FIX: Removed insecure header-based authentication bypass
          // Service-to-service auth should be handled by proper middleware, not simple header comparison
          // Only skip if request is properly authenticated as service-to-service via ServiceAuth middleware
          return req.serviceAuth && req.serviceAuth.fromService;
        }
      });
      
      limiter(req, res, next);
    };
  }

  /**
   * Create data operations rate limiter
   */
  createDataRateLimiter() {
    return (req, res, next) => {
      const tier = this.getUserTier(req);
      const limits = this.tierLimits[tier].data;
      
      const limiter = rateLimit({
        windowMs: limits.windowMs,
        max: limits.max,
        message: {
          error: 'Rate limit exceeded',
          message: limits.message,
          tier: tier,
          retryAfter: limits.windowMs / 1000
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
          return req.user?.id || req.headers['x-api-key'] || req.ip;
        },
        store: new RedisStore({
          client: this.redisClient,
          prefix: `rl:data:${tier}:`
        }),
        skip: (req) => {
          // SECURITY FIX: Removed insecure authentication bypass and overly permissive GET exemption
          // Only skip if request is properly authenticated as service-to-service via ServiceAuth middleware
          // GET operations can still consume resources and should be rate limited for security
          return req.serviceAuth && req.serviceAuth.fromService;
        }
      });
      
      limiter(req, res, next);
    };
  }

  /**
   * WebSocket rate limiting
   */
  async checkWebSocketLimit(userId, tier = 'free') {
    const limits = this.tierLimits[tier].websocket;
    
    // Check connection limit
    const userConnections = this.wsConnections.get(userId) || 0;
    if (userConnections >= limits.maxConnections) {
      return {
        allowed: false,
        reason: `Maximum ${limits.maxConnections} WebSocket connections for ${tier} tier`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Track WebSocket connection
   */
  trackWebSocketConnection(userId, socketId, add = true) {
    const current = this.wsConnections.get(userId) || 0;
    
    if (add) {
      this.wsConnections.set(userId, current + 1);
      
      // Initialize message tracking
      this.wsMessageCounts.set(socketId, {
        userId,
        count: 0,
        windowStart: Date.now()
      });
    } else {
      this.wsConnections.set(userId, Math.max(0, current - 1));
      this.wsMessageCounts.delete(socketId);
    }
  }

  /**
   * Check WebSocket message rate limit
   */
  checkWebSocketMessageLimit(socketId, tier = 'free') {
    const limits = this.tierLimits[tier].websocket;
    const messageData = this.wsMessageCounts.get(socketId);
    
    if (!messageData) {
      return { allowed: false, reason: 'Socket not tracked' };
    }
    
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    
    // Reset window if expired
    if (now - messageData.windowStart > windowMs) {
      messageData.count = 0;
      messageData.windowStart = now;
    }
    
    // Check limit
    if (messageData.count >= limits.messagesPerMinute) {
      return {
        allowed: false,
        reason: `Maximum ${limits.messagesPerMinute} messages per minute for ${tier} tier`
      };
    }
    
    // Increment count
    messageData.count++;
    
    return { allowed: true };
  }

  /**
   * Dynamic rate limit adjustment (for special events)
   */
  async adjustLimits(tier, multiplier, duration) {
    const originalLimits = { ...this.tierLimits[tier] };
    
    // Temporarily adjust limits
    this.tierLimits[tier].ai.max *= multiplier;
    this.tierLimits[tier].data.max *= multiplier;
    this.tierLimits[tier].websocket.messagesPerMinute *= multiplier;
    
    this.logger.info('Rate limits adjusted', {
      tier,
      multiplier,
      duration
    });
    
    // Reset after duration
    setTimeout(() => {
      this.tierLimits[tier] = originalLimits;
      this.logger.info('Rate limits reset', { tier });
    }, duration);
  }

  /**
   * Get current usage for user
   */
  async getUserUsage(userId, tier) {
    const usage = {
      tier,
      ai: {
        used: 0,
        limit: this.tierLimits[tier].ai.max,
        resetAt: null
      },
      data: {
        used: 0,
        limit: this.tierLimits[tier].data.max,
        resetAt: null
      },
      websocket: {
        connections: this.wsConnections.get(userId) || 0,
        maxConnections: this.tierLimits[tier].websocket.maxConnections
      }
    };
    
    try {
      // Get AI usage from Redis
      const aiKey = `rl:ai:${tier}:${userId}`;
      const aiData = await this.redisClient.get(aiKey);
      if (aiData) {
        usage.ai.used = parseInt(aiData) || 0;
        const ttl = await this.redisClient.ttl(aiKey);
        usage.ai.resetAt = new Date(Date.now() + ttl * 1000);
      }
      
      // Get data usage from Redis
      const dataKey = `rl:data:${tier}:${userId}`;
      const dataData = await this.redisClient.get(dataKey);
      if (dataData) {
        usage.data.used = parseInt(dataData) || 0;
        const ttl = await this.redisClient.ttl(dataKey);
        usage.data.resetAt = new Date(Date.now() + ttl * 1000);
      }
      
    } catch (error) {
      this.logger.error('Failed to get user usage', error);
    }
    
    return usage;
  }

  /**
   * Get API key tier (placeholder for implementation)
   */
  async getApiKeyTier(apiKey) {
    // This would normally query the database
    // For now, return based on key prefix
    if (apiKey.startsWith('ent_')) return 'enterprise';
    if (apiKey.startsWith('pro_')) return 'pro';
    return 'free';
  }

  /**
   * Create middleware for specific operation types
   */
  createOperationLimiter(operationType) {
    const limiters = {
      'flow-generation': this.createAIRateLimiter(),
      'flow-crud': this.createDataRateLimiter(),
      'user-management': this.createDataRateLimiter(),
      'knowledge-query': this.createAIRateLimiter(),
      'billing': rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 billing operations per minute
        message: 'Too many billing operations'
      })
    };
    
    return limiters[operationType] || this.createDataRateLimiter();
  }

  /**
   * Export metrics for monitoring
   */
  getMetrics() {
    const metrics = {
      connections: {
        total: 0,
        byTier: {}
      },
      limits: this.tierLimits
    };
    
    // Aggregate connection counts
    for (const [userId, count] of this.wsConnections) {
      metrics.connections.total += count;
    }
    
    return metrics;
  }
}

export default TierRateLimiter;