/**
 * Fixed Rate Limiter with Proper Redis Connection Management
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import config from '../config/index.js';

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis client with proper error handling
 */
export async function initializeRateLimiter(logger) {
  try {
    // Create Redis client
    redisClient = createClient({
      url: config.redis?.url || process.env.REDIS_URL || 'redis://localhost:6379',
      password: config.redis?.password || process.env.REDIS_PASSWORD,
      database: config.redis?.db || 0,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection limit reached');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    // Set up event handlers
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected for rate limiting');
      isConnected = true;
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready for rate limiting');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
      isConnected = false;
    });

    // Connect to Redis
    await redisClient.connect();
    
    // Test connection
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis for rate limiting', error);
    // Return null to allow fallback to memory store
    return null;
  }
}

/**
 * Create rate limiter with fallback to memory store
 */
function createRateLimiter(options) {
  const { name, windowMs, max, keyGenerator, handler, skipSuccessfulRequests = false } = options;
  
  // Try to use Redis store if available
  let store = undefined;
  if (redisClient && isConnected) {
    try {
      store = new RedisStore({
        client: redisClient,
        prefix: `rl:${name}:`,
        sendCommand: (...args) => redisClient.sendCommand(args),
      });
    } catch (error) {
      console.error(`Failed to create Redis store for ${name}, using memory store`, error);
    }
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator,
    handler,
    store,
    skip: (req) => {
      // Skip rate limiting if Redis is down and this is a critical operation
      if (!store && req.headers['x-critical-operation'] === 'true') {
        req.logger?.warn('Rate limiting skipped due to Redis unavailability');
        return true;
      }
      return false;
    }
  });
}

/**
 * Rate limiters configuration
 */
export const rateLimiters = {
  // Global rate limiter
  global: () => createRateLimiter({
    name: 'global',
    windowMs: config.rateLimit?.global?.windowMs || 60000,
    max: config.rateLimit?.global?.max || 100,
    keyGenerator: (req) => req.user?.userId || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Please slow down your requests',
        retryAfter: 60
      });
    }
  }),

  // Auth endpoints
  auth: {
    login: () => createRateLimiter({
      name: 'auth_login',
      windowMs: 900000, // 15 minutes
      max: 5, // 5 attempts per 15 minutes
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        const email = req.body?.email || 'unknown';
        return `${email}:${req.ip}`;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too Many Login Attempts',
          message: 'Account temporarily locked due to multiple failed login attempts',
          retryAfter: 900
        });
      }
    }),

    register: () => createRateLimiter({
      name: 'auth_register',
      windowMs: 3600000, // 1 hour
      max: 3, // 3 registrations per hour per IP
      keyGenerator: (req) => req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Registration Rate Limit',
          message: 'Too many registration attempts from this IP',
          retryAfter: 3600
        });
      }
    }),

    resetPassword: () => createRateLimiter({
      name: 'auth_reset',
      windowMs: 3600000, // 1 hour
      max: 3, // 3 reset attempts per hour
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

  // API endpoints
  api: {
    chat: () => createRateLimiter({
      name: 'api_chat',
      windowMs: 60000, // 1 minute
      max: 30, // 30 messages per minute
      keyGenerator: (req) => req.user?.userId || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Chat Rate Limit',
          message: 'Too many chat messages. Please slow down.',
          retryAfter: 60
        });
      }
    }),

    generate: () => createRateLimiter({
      name: 'api_generate',
      windowMs: 60000, // 1 minute
      max: 10, // 10 generations per minute
      keyGenerator: (req) => req.user?.userId || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Generation Rate Limit',
          message: 'Too many generation requests',
          retryAfter: 60,
          upgradeMessage: 'Upgrade to Pro for higher limits'
        });
      }
    })
  }
};

/**
 * WebSocket Rate Limiter with Redis support
 */
export class WebSocketRateLimiter {
  constructor(logger) {
    this.logger = logger;
    this.localConnections = new Map();
    this.localMessageCounts = new Map();
    this.cleanupInterval = null;
  }

  async initialize() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async checkConnection(socketId, userId) {
    const key = userId || socketId;
    const now = Date.now();
    
    try {
      // Try Redis first
      if (redisClient && isConnected) {
        const connectionKey = `ws:conn:${key}`;
        const connections = await redisClient.get(connectionKey);
        const connectionCount = connections ? parseInt(connections) : 0;
        
        if (connectionCount >= 5) {
          return { allowed: false, reason: 'Too many concurrent connections' };
        }
        
        // Increment connection count
        await redisClient.incr(connectionKey);
        await redisClient.expire(connectionKey, 300); // 5 minute expiry
        
        // Store connection info
        const connInfoKey = `ws:info:${socketId}`;
        await redisClient.hSet(connInfoKey, {
          userId: userId || '',
          connectedAt: now.toString(),
          lastActivity: now.toString()
        });
        await redisClient.expire(connInfoKey, 300);
        
        return { allowed: true };
      }
    } catch (error) {
      this.logger.error('Redis error in WebSocket rate limiting', error);
    }
    
    // Fallback to local storage
    const userConnections = Array.from(this.localConnections.values())
      .filter(conn => conn.userId === userId).length;
    
    if (userConnections >= 5) {
      return { allowed: false, reason: 'Too many concurrent connections' };
    }
    
    this.localConnections.set(socketId, {
      userId,
      connectedAt: now,
      lastActivity: now
    });
    
    return { allowed: true };
  }

  async checkMessage(socketId, userId) {
    const key = userId || socketId;
    const now = Date.now();
    const windowMs = 60000;
    const maxMessages = 50;
    
    try {
      // Try Redis first
      if (redisClient && isConnected) {
        const messageKey = `ws:msg:${key}`;
        const messageCount = await redisClient.incr(messageKey);
        
        if (messageCount === 1) {
          await redisClient.expire(messageKey, 60);
        }
        
        if (messageCount > maxMessages) {
          const ttl = await redisClient.ttl(messageKey);
          return {
            allowed: false,
            reason: 'Message rate limit exceeded',
            retryAfter: ttl > 0 ? ttl : 60
          };
        }
        
        // Update last activity
        const connInfoKey = `ws:info:${socketId}`;
        await redisClient.hSet(connInfoKey, 'lastActivity', now.toString());
        
        return { allowed: true };
      }
    } catch (error) {
      this.logger.error('Redis error in WebSocket message check', error);
    }
    
    // Fallback to local storage
    if (!this.localMessageCounts.has(key)) {
      this.localMessageCounts.set(key, []);
    }
    
    const messages = this.localMessageCounts.get(key);
    const recentMessages = messages.filter(ts => now - ts < windowMs);
    
    if (recentMessages.length >= maxMessages) {
      return {
        allowed: false,
        reason: 'Message rate limit exceeded',
        retryAfter: Math.ceil((recentMessages[0] + windowMs - now) / 1000)
      };
    }
    
    recentMessages.push(now);
    this.localMessageCounts.set(key, recentMessages);
    
    const connection = this.localConnections.get(socketId);
    if (connection) {
      connection.lastActivity = now;
    }
    
    return { allowed: true };
  }

  async removeConnection(socketId) {
    try {
      if (redisClient && isConnected) {
        const connInfoKey = `ws:info:${socketId}`;
        const connInfo = await redisClient.hGetAll(connInfoKey);
        
        if (connInfo.userId) {
          const connectionKey = `ws:conn:${connInfo.userId}`;
          await redisClient.decr(connectionKey);
        }
        
        await redisClient.del(connInfoKey);
      }
    } catch (error) {
      this.logger.error('Redis error removing WebSocket connection', error);
    }
    
    // Also remove from local storage
    this.localConnections.delete(socketId);
  }

  cleanup() {
    const now = Date.now();
    const timeout = 300000; // 5 minutes
    
    // Cleanup local connections
    for (const [socketId, connection] of this.localConnections.entries()) {
      if (now - connection.lastActivity > timeout) {
        this.removeConnection(socketId);
      }
    }
    
    // Cleanup local message counts
    for (const [key, messages] of this.localMessageCounts.entries()) {
      const recentMessages = messages.filter(ts => now - ts < 60000);
      if (recentMessages.length === 0) {
        this.localMessageCounts.delete(key);
      } else {
        this.localMessageCounts.set(key, recentMessages);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.localConnections.clear();
    this.localMessageCounts.clear();
  }
}

/**
 * Cleanup function using SCAN instead of KEYS
 */
export async function cleanupRateLimiters(logger) {
  if (!redisClient || !isConnected) {
    return;
  }
  
  try {
    const stream = redisClient.scanStream({
      match: 'rl:*',
      count: 100
    });
    
    let cleaned = 0;
    
    for await (const keys of stream) {
      for (const key of keys) {
        try {
          const ttl = await redisClient.ttl(key);
          if (ttl === -1) {
            await redisClient.expire(key, 3600);
            cleaned++;
          }
        } catch (error) {
          logger.error(`Error setting TTL for key ${key}`, error);
        }
      }
    }
    
    if (cleaned > 0) {
      logger.info(`Set TTL for ${cleaned} rate limit keys`);
    }
  } catch (error) {
    logger.error('Error in rate limiter cleanup', error);
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownRateLimiter(logger) {
  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis client for rate limiting closed');
    }
  } catch (error) {
    logger.error('Error shutting down rate limiter', error);
  }
}

export default {
  initializeRateLimiter,
  rateLimiters,
  WebSocketRateLimiter,
  cleanupRateLimiters,
  shutdownRateLimiter
};