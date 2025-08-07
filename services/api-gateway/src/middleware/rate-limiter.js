// ==========================================
// SERVICES/API-GATEWAY/src/middleware/rate-limiter.js
// ==========================================

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import config from '../config/index.js';

// Create Redis client for rate limiting
const redisClient = createClient({
  url: config.redis.url,
  password: config.redis.password,
  database: config.redis.db
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// Connect to Redis
await redisClient.connect().catch(console.error);

// Create different rate limiters for different endpoints
export const rateLimiters = {
  // Global rate limiter
  global: rateLimit({
    ...config.rateLimit.global,
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:global:'
    }),
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: config.rateLimit.global.message.message,
        retryAfter: config.rateLimit.global.message.retryAfter,
        limit: config.rateLimit.global.max,
        remaining: 0,
        resetTime: new Date(Date.now() + config.rateLimit.global.windowMs).toISOString()
      });
    }
  }),

  // Auth endpoints rate limiter
  auth: {
    login: rateLimit({
      ...config.rateLimit.endpoints.auth.login,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:auth:login:'
      }),
      keyGenerator: (req) => {
        // Rate limit by email + IP combination
        const email = req.body?.email || 'unknown';
        return `${email}:${req.ip}`;
      },
      skipSuccessfulRequests: true, // Only count failed attempts
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too Many Login Attempts',
          message: 'Account temporarily locked due to multiple failed login attempts',
          retryAfter: 900, // 15 minutes
          lockoutExpires: new Date(Date.now() + 900000).toISOString()
        });
      }
    }),

    register: rateLimit({
      ...config.rateLimit.endpoints.auth.register,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:auth:register:'
      }),
      keyGenerator: (req) => req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Registration Rate Limit',
          message: 'Too many registration attempts from this IP',
          retryAfter: 3600
        });
      }
    }),

    resetPassword: rateLimit({
      ...config.rateLimit.endpoints.auth.resetPassword,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:auth:reset:'
      }),
      keyGenerator: (req) => {
        const email = req.body?.email || req.ip;
        return email;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Password Reset Rate Limit',
          message: 'Too many password reset attempts',
          retryAfter: 3600
        });
      }
    })
  },

  // API endpoints rate limiter
  api: {
    chat: rateLimit({
      ...config.rateLimit.endpoints.api.chat,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:api:chat:'
      }),
      keyGenerator: (req) => req.user?.id || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Chat Rate Limit',
          message: 'Too many chat messages. Please slow down.',
          retryAfter: 60,
          limit: config.rateLimit.endpoints.api.chat.max
        });
      }
    }),

    generate: rateLimit({
      ...config.rateLimit.endpoints.api.generate,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:api:generate:'
      }),
      keyGenerator: (req) => req.user?.id || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Generation Rate Limit',
          message: 'Too many generation requests. Please wait before trying again.',
          retryAfter: 60,
          limit: config.rateLimit.endpoints.api.generate.max,
          upgradeMessage: 'Upgrade to Pro for higher limits'
        });
      }
    }),

    export: rateLimit({
      ...config.rateLimit.endpoints.api.export,
      store: new RedisStore({
        client: redisClient,
        prefix: 'rl:api:export:'
      }),
      keyGenerator: (req) => req.user?.id || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Export Rate Limit',
          message: 'Too many export requests. Please wait before trying again.',
          retryAfter: 300,
          limit: config.rateLimit.endpoints.api.export.max
        });
      }
    })
  },

  // Webhook rate limiter (more permissive)
  webhook: rateLimit({
    ...config.rateLimit.endpoints.webhook.stripe,
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:webhook:'
    }),
    keyGenerator: (req) => {
      // Rate limit by webhook source
      return req.headers['stripe-signature'] ? 'stripe' : req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Webhook Rate Limit',
        message: 'Too many webhook requests',
        retryAfter: 1
      });
    }
  })
};

// Dynamic rate limiting based on user tier
export const dynamicRateLimiter = (req, res, next) => {
  if (!req.user) {
    return rateLimiters.global(req, res, next);
  }

  // Adjust rate limits based on user tier
  const tierMultipliers = {
    free: 1,
    basic: 2,
    pro: 5,
    enterprise: 10
  };

  const multiplier = tierMultipliers[req.user.tier] || 1;
  
  // Create a custom rate limiter with adjusted limits
  const customLimiter = rateLimit({
    windowMs: config.rateLimit.global.windowMs,
    max: config.rateLimit.global.max * multiplier,
    store: new RedisStore({
      client: redisClient,
      prefix: `rl:tier:${req.user.tier}:`
    }),
    keyGenerator: (req) => req.user.id,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `Rate limit for ${req.user.tier} tier exceeded`,
        tier: req.user.tier,
        limit: config.rateLimit.global.max * multiplier,
        retryAfter: Math.ceil(config.rateLimit.global.windowMs / 1000),
        upgradeMessage: req.user.tier !== 'enterprise' ? 'Upgrade your plan for higher limits' : null
      });
    }
  });

  customLimiter(req, res, next);
};

// WebSocket rate limiting
export class WebSocketRateLimiter {
  constructor() {
    this.connections = new Map();
    this.messageCounts = new Map();
  }

  async checkConnection(socketId, userId) {
    const key = userId || socketId;
    const now = Date.now();
    
    // Check connection limit
    const userConnections = Array.from(this.connections.values())
      .filter(conn => conn.userId === userId).length;
    
    if (userConnections >= 5) { // Max 5 concurrent connections per user
      return { allowed: false, reason: 'Too many concurrent connections' };
    }

    // Store connection
    this.connections.set(socketId, {
      userId,
      connectedAt: now,
      lastActivity: now
    });

    return { allowed: true };
  }

  async checkMessage(socketId, userId) {
    const key = userId || socketId;
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxMessages = config.websocket.messageRateLimit;

    // Get or create message count entry
    if (!this.messageCounts.has(key)) {
      this.messageCounts.set(key, []);
    }

    const messages = this.messageCounts.get(key);
    
    // Remove old messages outside the window
    const recentMessages = messages.filter(timestamp => 
      now - timestamp < windowMs
    );

    // Check if limit exceeded
    if (recentMessages.length >= maxMessages) {
      return { 
        allowed: false, 
        reason: 'Message rate limit exceeded',
        retryAfter: Math.ceil((recentMessages[0] + windowMs - now) / 1000)
      };
    }

    // Add new message timestamp
    recentMessages.push(now);
    this.messageCounts.set(key, recentMessages);

    // Update last activity
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastActivity = now;
    }

    return { allowed: true };
  }

  removeConnection(socketId) {
    this.connections.delete(socketId);
    // Clean up message counts if no more connections
    const connection = this.connections.get(socketId);
    if (connection) {
      const userId = connection.userId;
      const hasOtherConnections = Array.from(this.connections.values())
        .some(conn => conn.userId === userId);
      
      if (!hasOtherConnections) {
        this.messageCounts.delete(userId || socketId);
      }
    }
  }

  // Cleanup inactive connections
  cleanup() {
    const now = Date.now();
    const timeout = 300000; // 5 minutes

    for (const [socketId, connection] of this.connections.entries()) {
      if (now - connection.lastActivity > timeout) {
        this.removeConnection(socketId);
      }
    }
  }
}

// IP-based rate limiting for non-authenticated requests
export const ipRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 20, // Lower limit for non-authenticated requests
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:ip:'
  }),
  keyGenerator: (req) => req.ip,
  skip: (req) => !!req.user, // Skip if user is authenticated
  handler: (req, res) => {
    res.status(429).json({
      error: 'IP Rate Limit',
      message: 'Too many requests from this IP. Please authenticate for higher limits.',
      retryAfter: 60,
      hint: 'Sign in to get higher rate limits'
    });
  }
});

// Distributed rate limiting for microservices
export const serviceRateLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 100, // 100 requests per second between services
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:service:'
  }),
  keyGenerator: (req) => {
    // Rate limit by service name from header
    return req.headers['x-service-name'] || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for internal health checks
    return req.path === '/health' || req.path === '/metrics';
  }
});

// Cleanup function for rate limiter stores
export const cleanupRateLimiters = async () => {
  try {
    // Clear expired rate limit entries
    const patterns = ['rl:*'];
    for (const pattern of patterns) {
      const keys = await redisClient.keys(pattern);
      for (const key of keys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1) { // No expiry set
          await redisClient.expire(key, 3600); // Set 1 hour expiry
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up rate limiters:', error);
  }
};

// Run cleanup periodically
setInterval(cleanupRateLimiters, 3600000); // Every hour

export default rateLimiters;