/**
 * Agent Rate Limiter
 * 
 * Implements per-agent rate limiting to prevent abuse and ensure fair resource allocation.
 * Tracks usage by agent, user, and IP address with sliding window algorithm.
 */

import Redis from 'redis';

export class AgentRateLimiter {
  constructor(redisClient, logger, config = {}) {
    this.redis = redisClient;
    this.logger = logger;
    
    // Rate limiting configuration per agent
    this.config = {
      // Default limits (can be overridden per agent)
      defaultLimits: {
        requestsPerMinute: 30,
        requestsPerHour: 300,
        requestsPerDay: 2000,
        burstLimit: 10 // Allow burst of requests
      },
      
      // Agent-specific limits
      agentLimits: {
        planner: {
          requestsPerMinute: 20,
          requestsPerHour: 200,
          requestsPerDay: 1500
        },
        architect: {
          requestsPerMinute: 25,
          requestsPerHour: 250,
          requestsPerDay: 1800
        },
        validator: {
          requestsPerMinute: 35,
          requestsPerHour: 350,
          requestsPerDay: 2500
        },
        analyst: {
          requestsPerMinute: 10, // Lower limit for heavy analysis
          requestsPerHour: 100,
          requestsPerDay: 500
        }
      },
      
      // User tier multipliers
      tierMultipliers: {
        free: 1.0,
        premium: 2.0,
        enterprise: 5.0
      },
      
      // IP-based limits (additional layer)
      ipLimits: {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      
      // Redis key TTL settings
      keyTTL: {
        minute: 60,
        hour: 3600,
        day: 86400
      },
      
      ...config
    };
    
    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      limitedRequests: 0,
      agentMetrics: new Map(),
      userMetrics: new Map()
    };
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(agentName, userId, ipAddress, userTier = 'free') {
    const startTime = Date.now();
    
    try {
      // Get limits for this agent and user tier
      const limits = this.getAgentLimits(agentName, userTier);
      
      // Check multiple rate limit layers
      const checks = await Promise.all([
        this.checkAgentUserLimit(agentName, userId, limits),
        this.checkIPLimit(ipAddress),
        this.checkBurstLimit(agentName, userId)
      ]);
      
      const agentUserCheck = checks[0];
      const ipCheck = checks[1]; 
      const burstCheck = checks[2];
      
      // Combine all check results
      const result = {
        allowed: agentUserCheck.allowed && ipCheck.allowed && burstCheck.allowed,
        reason: null,
        limits: {
          agent: agentUserCheck,
          ip: ipCheck,
          burst: burstCheck
        },
        retryAfter: Math.max(
          agentUserCheck.retryAfter || 0,
          ipCheck.retryAfter || 0,
          burstCheck.retryAfter || 0
        ),
        metadata: {
          agentName,
          userId,
          userTier,
          ipAddress,
          checkDuration: Date.now() - startTime
        }
      };
      
      // Determine primary reason for rate limiting
      if (!result.allowed) {
        if (!agentUserCheck.allowed) {
          result.reason = `Agent rate limit exceeded: ${agentUserCheck.reason}`;
        } else if (!ipCheck.allowed) {
          result.reason = `IP rate limit exceeded: ${ipCheck.reason}`;
        } else if (!burstCheck.allowed) {
          result.reason = `Burst limit exceeded: ${burstCheck.reason}`;
        }
        
        this.metrics.limitedRequests++;
        await this.logRateLimitEvent(result);
      } else {
        // Record successful request
        await this.recordRequest(agentName, userId, ipAddress);
      }
      
      this.metrics.totalRequests++;
      return result;
      
    } catch (error) {
      this.logger.error('Rate limit check failed', error);
      // Fail open - allow request if check fails
      return {
        allowed: true,
        reason: 'Rate limit check failed',
        error: error.message,
        metadata: { agentName, userId, userTier, ipAddress }
      };
    }
  }

  /**
   * Check agent-user specific rate limits
   */
  async checkAgentUserLimit(agentName, userId, limits) {
    const keyPrefix = `rate_limit:agent:${agentName}:user:${userId}`;
    
    // Check minute, hour, and day limits
    const checks = await Promise.all([
      this.checkTimeWindow(keyPrefix, 'minute', limits.requestsPerMinute, 60),
      this.checkTimeWindow(keyPrefix, 'hour', limits.requestsPerHour, 3600),
      this.checkTimeWindow(keyPrefix, 'day', limits.requestsPerDay, 86400)
    ]);
    
    const minuteCheck = checks[0];
    const hourCheck = checks[1];
    const dayCheck = checks[2];
    
    // Find the most restrictive limit
    if (!minuteCheck.allowed) {
      return {
        allowed: false,
        reason: `${limits.requestsPerMinute} requests per minute exceeded`,
        retryAfter: minuteCheck.retryAfter,
        current: minuteCheck.current,
        limit: minuteCheck.limit
      };
    }
    
    if (!hourCheck.allowed) {
      return {
        allowed: false,
        reason: `${limits.requestsPerHour} requests per hour exceeded`,
        retryAfter: hourCheck.retryAfter,
        current: hourCheck.current,
        limit: hourCheck.limit
      };
    }
    
    if (!dayCheck.allowed) {
      return {
        allowed: false,
        reason: `${limits.requestsPerDay} requests per day exceeded`,
        retryAfter: dayCheck.retryAfter,
        current: dayCheck.current,
        limit: dayCheck.limit
      };
    }
    
    return {
      allowed: true,
      usage: {
        minute: minuteCheck.current,
        hour: hourCheck.current,
        day: dayCheck.current
      },
      limits: {
        minute: limits.requestsPerMinute,
        hour: limits.requestsPerHour,
        day: limits.requestsPerDay
      }
    };
  }

  /**
   * Check IP-based rate limits
   */
  async checkIPLimit(ipAddress) {
    const keyPrefix = `rate_limit:ip:${ipAddress}`;
    const limits = this.config.ipLimits;
    
    const checks = await Promise.all([
      this.checkTimeWindow(keyPrefix, 'minute', limits.requestsPerMinute, 60),
      this.checkTimeWindow(keyPrefix, 'hour', limits.requestsPerHour, 3600),
      this.checkTimeWindow(keyPrefix, 'day', limits.requestsPerDay, 86400)
    ]);
    
    const minuteCheck = checks[0];
    const hourCheck = checks[1];
    const dayCheck = checks[2];
    
    if (!minuteCheck.allowed) {
      return {
        allowed: false,
        reason: `IP rate limit: ${limits.requestsPerMinute} per minute exceeded`,
        retryAfter: minuteCheck.retryAfter
      };
    }
    
    if (!hourCheck.allowed) {
      return {
        allowed: false,
        reason: `IP rate limit: ${limits.requestsPerHour} per hour exceeded`,
        retryAfter: hourCheck.retryAfter
      };
    }
    
    if (!dayCheck.allowed) {
      return {
        allowed: false,
        reason: `IP rate limit: ${limits.requestsPerDay} per day exceeded`,
        retryAfter: dayCheck.retryAfter
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check burst limits (short-term rapid requests)
   */
  async checkBurstLimit(agentName, userId) {
    const key = `rate_limit:burst:${agentName}:${userId}`;
    const burstLimit = this.config.defaultLimits.burstLimit;
    
    // Check requests in last 10 seconds
    return this.checkTimeWindow(key, 'burst', burstLimit, 10);
  }

  /**
   * Check time window using sliding window algorithm
   */
  async checkTimeWindow(keyPrefix, window, limit, seconds) {
    const key = `${keyPrefix}:${window}`;
    const now = Date.now();
    const windowStart = now - (seconds * 1000);
    
    // Use Redis sorted sets for sliding window
    const pipeline = this.redis.pipeline();
    
    // Remove old entries
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current entries
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry
    pipeline.expire(key, seconds + 1);
    
    const results = await pipeline.exec();
    const currentCount = results[1][1]; // Count result
    
    const allowed = currentCount < limit;
    const retryAfter = allowed ? 0 : Math.ceil(seconds - (now - windowStart) / 1000);
    
    return {
      allowed,
      current: currentCount,
      limit,
      retryAfter,
      window: `${seconds}s`
    };
  }

  /**
   * Record a successful request
   */
  async recordRequest(agentName, userId, ipAddress) {
    const timestamp = Date.now();
    
    // Update agent metrics
    if (!this.metrics.agentMetrics.has(agentName)) {
      this.metrics.agentMetrics.set(agentName, {
        totalRequests: 0,
        lastRequest: null,
        averageInterval: 0
      });
    }
    
    const agentMetric = this.metrics.agentMetrics.get(agentName);
    agentMetric.totalRequests++;
    agentMetric.lastRequest = timestamp;
    
    // Update user metrics
    if (!this.metrics.userMetrics.has(userId)) {
      this.metrics.userMetrics.set(userId, {
        totalRequests: 0,
        agentsUsed: new Set(),
        lastRequest: null
      });
    }
    
    const userMetric = this.metrics.userMetrics.get(userId);
    userMetric.totalRequests++;
    userMetric.agentsUsed.add(agentName);
    userMetric.lastRequest = timestamp;
  }

  /**
   * Get rate limits for specific agent and user tier
   */
  getAgentLimits(agentName, userTier) {
    const baseLimits = this.config.agentLimits[agentName] || this.config.defaultLimits;
    const multiplier = this.config.tierMultipliers[userTier] || 1.0;
    
    return {
      requestsPerMinute: Math.floor(baseLimits.requestsPerMinute * multiplier),
      requestsPerHour: Math.floor(baseLimits.requestsPerHour * multiplier),
      requestsPerDay: Math.floor(baseLimits.requestsPerDay * multiplier)
    };
  }

  /**
   * Log rate limit events for monitoring
   */
  async logRateLimitEvent(limitResult) {
    const logData = {
      timestamp: new Date().toISOString(),
      event: 'rate_limit_exceeded',
      agentName: limitResult.metadata.agentName,
      userId: limitResult.metadata.userId,
      ipAddress: limitResult.metadata.ipAddress,
      reason: limitResult.reason,
      retryAfter: limitResult.retryAfter
    };
    
    this.logger.warn('Rate limit exceeded', logData);
    
    // Store in Redis for analysis
    const logKey = `rate_limit_logs:${Date.now()}`;
    await this.redis.setex(logKey, 86400, JSON.stringify(logData)); // Keep for 24 hours
  }

  /**
   * Get current usage statistics
   */
  async getCurrentUsage(agentName, userId) {
    const limits = this.getAgentLimits(agentName, 'free'); // Default to free tier
    const keyPrefix = `rate_limit:agent:${agentName}:user:${userId}`;
    
    const [minuteUsage, hourUsage, dayUsage] = await Promise.all([
      this.getCurrentCount(`${keyPrefix}:minute`),
      this.getCurrentCount(`${keyPrefix}:hour`),
      this.getCurrentCount(`${keyPrefix}:day`)
    ]);
    
    return {
      agent: agentName,
      userId,
      usage: {
        minute: {
          current: minuteUsage,
          limit: limits.requestsPerMinute,
          remaining: Math.max(0, limits.requestsPerMinute - minuteUsage)
        },
        hour: {
          current: hourUsage,
          limit: limits.requestsPerHour,
          remaining: Math.max(0, limits.requestsPerHour - hourUsage)
        },
        day: {
          current: dayUsage,
          limit: limits.requestsPerDay,
          remaining: Math.max(0, limits.requestsPerDay - dayUsage)
        }
      }
    };
  }

  /**
   * Get current count for a Redis key
   */
  async getCurrentCount(key) {
    try {
      return await this.redis.zcard(key) || 0;
    } catch (error) {
      this.logger.error('Failed to get current count', error);
      return 0;
    }
  }

  /**
   * Reset rate limits for a user (admin function)
   */
  async resetUserLimits(userId, agentName = '*') {
    const pattern = agentName === '*' 
      ? `rate_limit:agent:*:user:${userId}:*`
      : `rate_limit:agent:${agentName}:user:${userId}:*`;
      
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.info('Rate limits reset', { userId, agentName, keysRemoved: keys.length });
    }
    
    return { success: true, keysRemoved: keys.length };
  }

  /**
   * Get rate limiter statistics
   */
  getStatistics() {
    return {
      totalRequests: this.metrics.totalRequests,
      limitedRequests: this.metrics.limitedRequests,
      limitRate: this.metrics.totalRequests > 0 
        ? (this.metrics.limitedRequests / this.metrics.totalRequests) * 100 
        : 0,
      agentStats: Object.fromEntries(this.metrics.agentMetrics),
      userStats: {
        totalUsers: this.metrics.userMetrics.size,
        activeAgents: new Set(
          Array.from(this.metrics.userMetrics.values())
            .flatMap(user => Array.from(user.agentsUsed))
        ).size
      },
      configuration: {
        defaultLimits: this.config.defaultLimits,
        agentCount: Object.keys(this.config.agentLimits).length,
        tierCount: Object.keys(this.config.tierMultipliers).length
      }
    };
  }

  /**
   * Health check for rate limiter
   */
  async healthCheck() {
    try {
      // Test Redis connectivity
      await this.redis.ping();
      
      return {
        status: 'healthy',
        redis: 'connected',
        metrics: this.getStatistics(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}