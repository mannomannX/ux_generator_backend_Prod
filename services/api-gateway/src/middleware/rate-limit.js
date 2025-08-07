// ==========================================
// SERVICES/API-GATEWAY/src/middleware/rate-limit.js
// ==========================================
import rateLimit from 'express-rate-limit';

// Store for rate limiting (could be Redis in production)
const rateLimitStore = new Map();

// Custom store implementation for Redis support
class RedisRateLimitStore {
  constructor(redisClient, prefix = 'rl:') {
    this.redisClient = redisClient;
    this.prefix = prefix;
  }

  async incr(key) {
    const redisKey = this.prefix + key;
    try {
      const current = await this.redisClient.client.incr(redisKey);
      if (current === 1) {
        // Set TTL only on first increment
        await this.redisClient.client.expire(redisKey, 900); // 15 minutes
      }
      return { current, remaining: Math.max(0, 100 - current) };
    } catch (error) {
      // Fallback to memory store
      const current = (rateLimitStore.get(key) || 0) + 1;
      rateLimitStore.set(key, current);
      return { current, remaining: Math.max(0, 100 - current) };
    }
  }

  async decrement(key) {
    const redisKey = this.prefix + key;
    try {
      await this.redisClient.client.decr(redisKey);
    } catch (error) {
      // Fallback to memory store
      const current = rateLimitStore.get(key) || 0;
      rateLimitStore.set(key, Math.max(0, current - 1));
    }
  }

  async resetKey(key) {
    const redisKey = this.prefix + key;
    try {
      await this.redisClient.client.del(redisKey);
    } catch (error) {
      rateLimitStore.delete(key);
    }
  }
}

// Base rate limiting configuration
export const rateLimitConfig = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes',
  },

  // Key generator - different limits for authenticated vs anonymous users
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return `user:${req.user.userId}`;
    }
    return `ip:${req.ip}`;
  },

  // Custom headers
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,

  // Skip successful requests to certain endpoints
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === '/health';
  },

  // Handler for when limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests from this client',
      retryAfter: req.rateLimit?.resetTime || '15 minutes',
      correlationId: req.correlationId,
    });
  },
});

// Stricter rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  
  keyGenerator: (req) => `auth:${req.ip}`,
  
  message: {
    error: 'Too many authentication attempts',
    message: 'Please wait before trying to authenticate again',
    retryAfter: '15 minutes',
  },

  handler: (req, res) => {
    res.status(429).json({
      error: 'Authentication rate limit exceeded',
      message: 'Too many login attempts. Please try again later.',
      retryAfter: '15 minutes',
      correlationId: req.correlationId,
    });
  },
});

// Relaxed rate limiting for authenticated API calls
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window for authenticated users
  
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return `api:user:${req.user.userId}`;
    }
    return `api:ip:${req.ip}`;
  },

  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role === 'admin';
  },

  message: {
    error: 'API rate limit exceeded',
    message: 'Too many API requests. Please slow down.',
    retryAfter: '15 minutes',
  },
});

// Very strict rate limiting for resource-intensive operations
export const heavyOperationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 operations per hour
  
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return `heavy:user:${req.user.userId}`;
    }
    return `heavy:ip:${req.ip}`;
  },

  message: {
    error: 'Heavy operation rate limit exceeded',
    message: 'Too many resource-intensive operations. Please wait before trying again.',
    retryAfter: '1 hour',
  },
});

// WebSocket connection rate limiting
export const websocketRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 connections per 5 minutes
  
  keyGenerator: (req) => `ws:${req.ip}`,
  
  message: {
    error: 'WebSocket connection rate limit exceeded',
    message: 'Too many WebSocket connection attempts',
  },
});

// Strict rate limiting for sensitive operations like password changes
export const sensitiveOperationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Only 3 attempts per 15 minutes
  
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return `sensitive:user:${req.user.userId}`;
    }
    return `sensitive:ip:${req.ip}`;
  },
  
  message: {
    error: 'Sensitive operation rate limit exceeded',
    message: 'Too many sensitive operations. Please wait before trying again.',
    retryAfter: '15 minutes',
  },
  
  handler: (req, res) => {
    // Log security event for suspicious activity
    req.app.locals.logger?.warn('Sensitive operation rate limit exceeded', {
      userId: req.user?.userId,
      ip: req.ip,
      endpoint: req.path,
      userAgent: req.headers['user-agent'],
      correlationId: req.correlationId
    });
    
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many sensitive operations attempted',
      retryAfter: '15 minutes',
      correlationId: req.correlationId,
    });
  },
});