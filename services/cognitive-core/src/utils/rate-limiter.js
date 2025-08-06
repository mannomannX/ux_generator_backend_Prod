// ==========================================
// COGNITIVE CORE SERVICE - Advanced Rate Limiter
// ==========================================

/**
 * Advanced Rate Limiting with multiple algorithms
 * Supports Token Bucket, Sliding Window, and Adaptive rate limiting
 */
class RateLimiter {
  constructor(options = {}) {
    this.type = options.type || 'sliding_window'; // 'token_bucket', 'sliding_window', 'adaptive'
    this.limit = options.limit || 100; // requests per window
    this.window = options.window || 60000; // window size in ms (1 minute)
    this.burst = options.burst || this.limit; // burst capacity for token bucket
    
    // Storage for different algorithms
    this.tokenBuckets = new Map();
    this.slidingWindows = new Map();
    this.adaptiveData = new Map();
    
    // Configuration
    this.options = {
      skipSuccessful: options.skipSuccessful || false,
      skipFailed: options.skipFailed || false,
      keyGenerator: options.keyGenerator || ((req) => req.ip),
      message: options.message || 'Too many requests',
      headers: options.headers !== false,
      standardHeaders: options.standardHeaders !== false,
      legacyHeaders: options.legacyHeaders !== false,
      ...options
    };

    this.logger = options.logger || console;
  }

  /**
   * Check if request should be allowed
   */
  async isAllowed(key, weight = 1) {
    switch (this.type) {
      case 'token_bucket':
        return this.tokenBucketCheck(key, weight);
      case 'sliding_window':
        return this.slidingWindowCheck(key, weight);
      case 'adaptive':
        return this.adaptiveCheck(key, weight);
      default:
        return this.slidingWindowCheck(key, weight);
    }
  }

  /**
   * Token Bucket Algorithm
   */
  tokenBucketCheck(key, weight) {
    const now = Date.now();
    let bucket = this.tokenBuckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.burst,
        lastRefill: now,
        totalRequests: 0,
        allowedRequests: 0
      };
      this.tokenBuckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timeSinceRefill = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timeSinceRefill * (this.limit / this.window));
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.burst, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    bucket.totalRequests++;

    // Check if we have enough tokens
    if (bucket.tokens >= weight) {
      bucket.tokens -= weight;
      bucket.allowedRequests++;
      
      return {
        allowed: true,
        remainingTokens: bucket.tokens,
        resetTime: null,
        totalRequests: bucket.totalRequests,
        allowedRequests: bucket.allowedRequests
      };
    }

    return {
      allowed: false,
      remainingTokens: bucket.tokens,
      resetTime: bucket.lastRefill + Math.ceil(weight * (this.window / this.limit)),
      totalRequests: bucket.totalRequests,
      allowedRequests: bucket.allowedRequests
    };
  }

  /**
   * Sliding Window Algorithm
   */
  slidingWindowCheck(key, weight) {
    const now = Date.now();
    const windowStart = now - this.window;
    
    let window = this.slidingWindows.get(key);
    
    if (!window) {
      window = {
        requests: [],
        totalRequests: 0,
        allowedRequests: 0
      };
      this.slidingWindows.set(key, window);
    }

    // Remove old requests outside the window
    window.requests = window.requests.filter(req => req.timestamp > windowStart);
    
    // Calculate current usage
    const currentUsage = window.requests.reduce((sum, req) => sum + req.weight, 0);
    
    window.totalRequests++;

    if (currentUsage + weight <= this.limit) {
      // Add new request to window
      window.requests.push({ timestamp: now, weight });
      window.allowedRequests++;
      
      return {
        allowed: true,
        remaining: this.limit - currentUsage - weight,
        resetTime: window.requests.length > 0 ? window.requests[0].timestamp + this.window : null,
        totalRequests: window.totalRequests,
        allowedRequests: window.allowedRequests,
        currentUsage: currentUsage + weight
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetTime: window.requests.length > 0 ? window.requests[0].timestamp + this.window : now + this.window,
      totalRequests: window.totalRequests,
      allowedRequests: window.allowedRequests,
      currentUsage: currentUsage
    };
  }

  /**
   * Adaptive Rate Limiting
   * Adjusts limits based on system load and success rates
   */
  adaptiveCheck(key, weight) {
    const now = Date.now();
    let data = this.adaptiveData.get(key);
    
    if (!data) {
      data = {
        currentLimit: this.limit,
        successRate: 1.0,
        lastAdjustment: now,
        requests: [],
        recentErrors: [],
        totalRequests: 0,
        allowedRequests: 0,
        systemLoad: 0
      };
      this.adaptiveData.set(key, data);
    }

    // Clean old data
    const cleanupTime = now - this.window;
    data.requests = data.requests.filter(req => req.timestamp > cleanupTime);
    data.recentErrors = data.recentErrors.filter(err => err.timestamp > cleanupTime);

    // Calculate success rate
    const totalRecentRequests = data.requests.length;
    const recentErrors = data.recentErrors.length;
    data.successRate = totalRecentRequests > 0 ? (totalRecentRequests - recentErrors) / totalRecentRequests : 1.0;

    // Adjust limits based on performance
    this.adjustAdaptiveLimit(data, now);

    // Check current usage
    const currentUsage = data.requests.reduce((sum, req) => sum + req.weight, 0);
    
    data.totalRequests++;

    if (currentUsage + weight <= data.currentLimit) {
      data.requests.push({ timestamp: now, weight });
      data.allowedRequests++;
      
      return {
        allowed: true,
        remaining: data.currentLimit - currentUsage - weight,
        currentLimit: data.currentLimit,
        baseLimit: this.limit,
        successRate: data.successRate,
        resetTime: data.requests.length > 0 ? data.requests[0].timestamp + this.window : null,
        totalRequests: data.totalRequests,
        allowedRequests: data.allowedRequests
      };
    }

    return {
      allowed: false,
      remaining: 0,
      currentLimit: data.currentLimit,
      baseLimit: this.limit,
      successRate: data.successRate,
      resetTime: data.requests.length > 0 ? data.requests[0].timestamp + this.window : now + this.window,
      totalRequests: data.totalRequests,
      allowedRequests: data.allowedRequests
    };
  }

  /**
   * Adjust adaptive limit based on system performance
   */
  adjustAdaptiveLimit(data, now) {
    const adjustmentInterval = 30000; // 30 seconds
    
    if (now - data.lastAdjustment < adjustmentInterval) {
      return; // Too soon to adjust
    }

    const successRate = data.successRate;
    const baseLimit = this.limit;
    let newLimit = data.currentLimit;

    // Increase limit if success rate is high
    if (successRate > 0.95 && data.systemLoad < 0.8) {
      newLimit = Math.min(baseLimit * 2, data.currentLimit * 1.1);
      this.logger.debug('Adaptive rate limiter: Increasing limit', {
        successRate,
        oldLimit: data.currentLimit,
        newLimit: Math.round(newLimit)
      });
    }
    // Decrease limit if success rate is low
    else if (successRate < 0.8 || data.systemLoad > 0.9) {
      newLimit = Math.max(baseLimit * 0.5, data.currentLimit * 0.8);
      this.logger.warn('Adaptive rate limiter: Decreasing limit', {
        successRate,
        systemLoad: data.systemLoad,
        oldLimit: data.currentLimit,
        newLimit: Math.round(newLimit)
      });
    }
    // Gradually return to baseline
    else if (data.currentLimit !== baseLimit) {
      const diff = baseLimit - data.currentLimit;
      newLimit = data.currentLimit + (diff * 0.1); // 10% adjustment toward baseline
    }

    data.currentLimit = Math.round(newLimit);
    data.lastAdjustment = now;
  }

  /**
   * Record error for adaptive algorithm
   */
  recordError(key, error) {
    if (this.type !== 'adaptive') return;
    
    const data = this.adaptiveData.get(key);
    if (data) {
      data.recentErrors.push({
        timestamp: Date.now(),
        error: error.message || 'Unknown error'
      });
    }
  }

  /**
   * Update system load for adaptive algorithm
   */
  updateSystemLoad(load) {
    if (this.type !== 'adaptive') return;
    
    for (const data of this.adaptiveData.values()) {
      data.systemLoad = load;
    }
  }

  /**
   * Express middleware factory
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const key = this.options.keyGenerator(req);
        const result = await this.isAllowed(key);

        // Add rate limit headers
        if (this.options.headers) {
          this.addHeaders(res, result);
        }

        if (!result.allowed) {
          this.logger.warn('Rate limit exceeded', {
            key,
            type: this.type,
            limit: result.currentLimit || this.limit,
            resetTime: result.resetTime
          });

          res.status(429).json({
            error: 'Too Many Requests',
            message: this.options.message,
            limit: result.currentLimit || this.limit,
            remaining: result.remaining || 0,
            resetTime: result.resetTime,
            retryAfter: result.resetTime ? Math.ceil((result.resetTime - Date.now()) / 1000) : 60
          });
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Rate limiter error', error);
        next(error);
      }
    };
  }

  /**
   * Add rate limit headers to response
   */
  addHeaders(res, result) {
    if (this.options.standardHeaders) {
      res.set({
        'RateLimit-Limit': result.currentLimit || this.limit,
        'RateLimit-Remaining': Math.max(0, result.remaining || 0),
        'RateLimit-Reset': result.resetTime ? new Date(result.resetTime).toISOString() : undefined
      });
    }

    if (this.options.legacyHeaders) {
      res.set({
        'X-RateLimit-Limit': result.currentLimit || this.limit,
        'X-RateLimit-Remaining': Math.max(0, result.remaining || 0),
        'X-RateLimit-Reset': result.resetTime ? Math.ceil(result.resetTime / 1000) : undefined
      });
    }

    // Additional headers for adaptive rate limiting
    if (this.type === 'adaptive' && result.successRate !== undefined) {
      res.set({
        'X-RateLimit-Success-Rate': (result.successRate * 100).toFixed(1) + '%',
        'X-RateLimit-Base-Limit': this.limit
      });
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const stats = {
      type: this.type,
      baseLimit: this.limit,
      window: this.window,
      activeKeys: 0,
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0
    };

    let dataSource;
    switch (this.type) {
      case 'token_bucket':
        dataSource = this.tokenBuckets;
        break;
      case 'sliding_window':
        dataSource = this.slidingWindows;
        break;
      case 'adaptive':
        dataSource = this.adaptiveData;
        stats.averageSuccessRate = 0;
        break;
      default:
        dataSource = this.slidingWindows;
    }

    stats.activeKeys = dataSource.size;

    for (const data of dataSource.values()) {
      stats.totalRequests += data.totalRequests || 0;
      stats.allowedRequests += data.allowedRequests || 0;
    }

    stats.blockedRequests = stats.totalRequests - stats.allowedRequests;
    stats.blockRate = stats.totalRequests > 0 ? (stats.blockedRequests / stats.totalRequests) * 100 : 0;

    // Adaptive-specific stats
    if (this.type === 'adaptive') {
      let totalSuccessRate = 0;
      let activeAdaptiveKeys = 0;
      
      for (const data of this.adaptiveData.values()) {
        if (data.successRate !== undefined) {
          totalSuccessRate += data.successRate;
          activeAdaptiveKeys++;
        }
      }
      
      stats.averageSuccessRate = activeAdaptiveKeys > 0 ? 
        (totalSuccessRate / activeAdaptiveKeys) * 100 : 100;
    }

    return stats;
  }

  /**
   * Reset rate limiter data for a specific key
   */
  reset(key) {
    this.tokenBuckets.delete(key);
    this.slidingWindows.delete(key);
    this.adaptiveData.delete(key);
    
    this.logger.info('Rate limiter reset for key', { key, type: this.type });
  }

  /**
   * Reset all rate limiter data
   */
  resetAll() {
    this.tokenBuckets.clear();
    this.slidingWindows.clear();
    this.adaptiveData.clear();
    
    this.logger.info('All rate limiter data reset', { type: this.type });
  }

  /**
   * Get detailed information for a specific key
   */
  getKeyInfo(key) {
    switch (this.type) {
      case 'token_bucket':
        return this.tokenBuckets.get(key) || null;
      case 'sliding_window':
        return this.slidingWindows.get(key) || null;
      case 'adaptive':
        return this.adaptiveData.get(key) || null;
      default:
        return null;
    }
  }
}

/**
 * Rate Limiter Factory for different use cases
 */
class RateLimiterFactory {
  static createAgentRateLimiter(logger, options = {}) {
    return new RateLimiter({
      type: 'adaptive',
      limit: options.limit || 50,
      window: options.window || 60000,
      keyGenerator: (req) => req.user?.userId || req.ip,
      message: 'Too many AI agent requests',
      logger,
      ...options
    });
  }

  static createAPIRateLimiter(logger, options = {}) {
    return new RateLimiter({
      type: 'sliding_window',
      limit: options.limit || 100,
      window: options.window || 60000,
      keyGenerator: (req) => req.ip,
      message: 'Too many API requests',
      logger,
      ...options
    });
  }

  static createPremiumRateLimiter(logger, options = {}) {
    return new RateLimiter({
      type: 'token_bucket',
      limit: options.limit || 200,
      burst: options.burst || 300,
      window: options.window || 60000,
      keyGenerator: (req) => req.user?.userId || req.ip,
      message: 'Premium rate limit exceeded',
      logger,
      ...options
    });
  }
}

export { RateLimiter, RateLimiterFactory };