// ==========================================
// SERVICES/USER-MANAGEMENT/src/middleware/rate-limit.js
// ==========================================

import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

/**
 * General API Rate Limiting
 */
export const apiRateLimit = rateLimit({
  windowMs: config.rateLimit.api.windowMs, // 15 minutes
  max: config.rateLimit.api.max, // 100 requests per windowMs
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again later.',
      retryAfter: Math.ceil(config.rateLimit.api.windowMs / 1000), // seconds
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next, options) => {
    // Add comprehensive rate limit headers
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
    res.setHeader('Retry-After', Math.ceil(config.rateLimit.api.windowMs / 1000));
    res.setHeader('X-RateLimit-RetryAfter', new Date(req.rateLimit.resetTime).toISOString());
    
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again later.',
        retryAfter: Math.ceil(config.rateLimit.api.windowMs / 1000),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  },
});

/**
 * Authentication Rate Limiting (Stricter)
 * Applied to login, registration, password reset endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: config.rateLimit.auth.windowMs, // 15 minutes
  max: config.rateLimit.auth.max, // 5 attempts per windowMs
  message: {
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please wait before trying again.',
      retryAfter: Math.ceil(config.rateLimit.auth.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res, next, options) => {
    // Add comprehensive rate limit headers
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
    res.setHeader('Retry-After', Math.ceil(config.rateLimit.auth.windowMs / 1000));
    res.setHeader('X-RateLimit-RetryAfter', new Date(req.rateLimit.resetTime).toISOString());
    
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
        retryAfter: Math.ceil(config.rateLimit.auth.windowMs / 1000),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  },
});

/**
 * Workspace Operations Rate Limiting
 * Applied to workspace creation, member addition, etc.
 */
export const workspaceRateLimit = rateLimit({
  windowMs: config.rateLimit.workspace.windowMs, // 1 hour
  max: config.rateLimit.workspace.max, // 10 operations per hour
  message: {
    error: {
      code: 'WORKSPACE_RATE_LIMIT_EXCEEDED',
      message: 'Too many workspace operations. Please wait before trying again.',
      retryAfter: Math.ceil(config.rateLimit.workspace.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    // Add comprehensive rate limit headers
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
    res.setHeader('Retry-After', Math.ceil(config.rateLimit.workspace.windowMs / 1000));
    res.setHeader('X-RateLimit-RetryAfter', new Date(req.rateLimit.resetTime).toISOString());
    
    res.status(429).json({
      error: {
        code: 'WORKSPACE_RATE_LIMIT_EXCEEDED',
        message: 'Too many workspace operations. Please wait before trying again.',
        retryAfter: Math.ceil(config.rateLimit.workspace.windowMs / 1000),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  },
});

/**
 * Custom Rate Limiter Factory
 * Creates rate limiter with custom configuration
 */
export const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests default
    message = 'Rate limit exceeded',
    skipSuccessfulRequests = false,
    keyGenerator = null, // Custom key generator function
  } = options;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator: keyGenerator || ((req) => {
      // Default: use IP address and user ID if available
      return req.user ? `${req.ip}_${req.user.userId}` : req.ip;
    }),
    handler: (req, res, next, options) => {
      // Add comprehensive rate limit headers
      res.setHeader('RateLimit-Limit', options.max);
      res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
      res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      res.setHeader('X-RateLimit-RetryAfter', new Date(req.rateLimit.resetTime).toISOString());
      
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil(windowMs / 1000),
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    },
  });
};

/**
 * User-specific Rate Limiting
 * Applies rate limiting per user (requires authentication)
 */
export const userSpecificRateLimit = (options = {}) => {
  return createRateLimit({
    keyGenerator: (req) => {
      if (!req.user) {
        return req.ip; // Fall back to IP if no user
      }
      return `user_${req.user.userId}`;
    },
    ...options,
  });
};

/**
 * Email-based Rate Limiting
 * Applied to registration, forgot password by email
 */
export const emailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 email operations per 15 minutes
  keyGenerator: (req) => {
    const email = req.body.email || req.query.email;
    return email ? `email_${email.toLowerCase()}` : req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    // Add comprehensive rate limit headers
    res.setHeader('RateLimit-Limit', options.max);
    res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
    res.setHeader('Retry-After', 900);
    res.setHeader('X-RateLimit-RetryAfter', new Date(req.rateLimit.resetTime).toISOString());
    
    res.status(429).json({
      error: {
        code: 'EMAIL_RATE_LIMIT_EXCEEDED',
        message: 'Too many email operations for this address. Please wait 15 minutes.',
        retryAfter: 900, // 15 minutes in seconds
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  },
});

/**
 * Progressive Rate Limiting for Failed Attempts
 * Increases delay based on number of failed attempts
 */
export class ProgressiveRateLimit {
  constructor(redisClient, logger) {
    this.redis = redisClient;
    this.logger = logger;
  }

  createMiddleware(options = {}) {
    const {
      keyPrefix = 'progressive_limit',
      maxAttempts = 5,
      baseDelay = 60, // 1 minute base delay
      multiplier = 2,
      maxDelay = 3600, // 1 hour max delay
    } = options;

    return async (req, res, next) => {
      try {
        const identifier = req.body.email || req.ip;
        const key = `${keyPrefix}:${identifier}`;
        
        const attempts = await this.redis.get(key);
        const attemptCount = attempts ? parseInt(attempts) : 0;

        if (attemptCount >= maxAttempts) {
          const delay = Math.min(
            baseDelay * Math.pow(multiplier, attemptCount - maxAttempts),
            maxDelay
          );

          return res.status(429).json({
            error: {
              code: 'PROGRESSIVE_RATE_LIMIT_EXCEEDED',
              message: `Account temporarily locked due to multiple failed attempts. Try again in ${Math.ceil(delay / 60)} minutes.`,
              retryAfter: delay,
              attempts: attemptCount,
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Store attempt count for potential failure
        req.progressiveRateLimit = {
          key,
          attemptCount,
          recordFailure: async () => {
            const newCount = attemptCount + 1;
            const expiry = Math.min(
              baseDelay * Math.pow(multiplier, Math.max(0, newCount - maxAttempts)),
              maxDelay
            );
            await this.redis.set(key, newCount, expiry);
          },
          recordSuccess: async () => {
            await this.redis.del(key);
          },
        };

        next();
      } catch (error) {
        this.logger.error('Progressive rate limit error', error);
        next(); // Continue on rate limit error
      }
    };
  }
}

/**
 * Sliding Window Rate Limiter
 * More accurate than fixed window, uses sliding time window
 */
export const createSlidingWindowRateLimit = (redisClient) => {
  return (options = {}) => {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100,
      keyPrefix = 'sliding_window',
    } = options;

    return async (req, res, next) => {
      try {
        const identifier = req.user ? `user_${req.user.userId}` : req.ip;
        const key = `${keyPrefix}:${identifier}`;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Remove old entries and count current requests
        await redisClient.zremrangebyscore(key, 0, windowStart);
        const currentRequests = await redisClient.zcard(key);

        if (currentRequests >= max) {
          return res.status(429).json({
            error: {
              code: 'SLIDING_WINDOW_RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded in sliding window',
              retryAfter: Math.ceil(windowMs / 1000),
              correlationId: req.correlationId,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Add current request
        await redisClient.zadd(key, now, `${now}-${Math.random()}`);
        await redisClient.expire(key, Math.ceil(windowMs / 1000));

        next();
      } catch (error) {
        // If Redis fails, allow request through
        next();
      }
    };
  };
};