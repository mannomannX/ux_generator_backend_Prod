// ==========================================
// COGNITIVE CORE SERVICE - Advanced Cache Manager
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * Multi-Level Cache Manager
 * Provides L1 (memory), L2 (Redis), and intelligent cache strategies
 */
class CacheManager {
  constructor(options = {}) {
    this.redisClient = options.redisClient;
    this.logger = options.logger || console;
    this.eventEmitter = options.eventEmitter;
    
    // L1 Cache (Memory)
    this.memoryCache = new Map();
    this.memoryCacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0
    };
    
    // L2 Cache (Redis) stats
    this.redisCacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    // Configuration
    this.config = {
      memoryMaxSize: options.memoryMaxSize || 1000, // Max items in memory
      memoryTTL: options.memoryTTL || 300000, // 5 minutes
      redisTTL: options.redisTTL || 3600, // 1 hour
      compressionThreshold: options.compressionThreshold || 1024, // 1KB
      enableCompression: options.enableCompression !== false,
      enableL1: options.enableL1 !== false,
      enableL2: options.enableL2 !== false,
      keyPrefix: options.keyPrefix || 'cognitive:',
      ...options
    };
    
    // Cleanup interval for memory cache
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemoryCache();
    }, 60000); // Every minute
    
    this.logger.info('Cache Manager initialized', {
      memoryMaxSize: this.config.memoryMaxSize,
      memoryTTL: this.config.memoryTTL,
      redisTTL: this.config.redisTTL,
      enableL1: this.config.enableL1,
      enableL2: this.config.enableL2
    });
  }

  /**
   * Get value from cache (L1 -> L2)
   */
  async get(key, options = {}) {
    const fullKey = this.buildKey(key);
    const startTime = Date.now();

    try {
      // Try L1 (Memory) first
      if (this.config.enableL1) {
        const memoryResult = this.getFromMemory(fullKey);
        if (memoryResult !== null) {
          this.memoryCacheStats.hits++;
          this.logCacheHit('L1', key, Date.now() - startTime);
          return memoryResult;
        }
        this.memoryCacheStats.misses++;
      }

      // Try L2 (Redis)
      if (this.config.enableL2 && this.redisClient) {
        const redisResult = await this.getFromRedis(fullKey);
        if (redisResult !== null) {
          this.redisCacheStats.hits++;
          
          // Promote to L1 if enabled
          if (this.config.enableL1) {
            this.setInMemory(fullKey, redisResult, options.memoryTTL || this.config.memoryTTL);
          }
          
          this.logCacheHit('L2', key, Date.now() - startTime);
          return redisResult;
        }
        this.redisCacheStats.misses++;
      }

      this.logCacheMiss(key, Date.now() - startTime);
      return null;

    } catch (error) {
      this.logger.error('Cache get error', error, { key, fullKey });
      this.redisCacheStats.errors++;
      return null;
    }
  }

  /**
   * Set value in cache (L1 + L2)
   */
  async set(key, value, options = {}) {
    const fullKey = this.buildKey(key);
    const ttl = options.ttl || this.config.redisTTL;
    const memoryTTL = options.memoryTTL || this.config.memoryTTL;

    try {
      // Set in L1 (Memory)
      if (this.config.enableL1) {
        this.setInMemory(fullKey, value, memoryTTL);
        this.memoryCacheStats.sets++;
      }

      // Set in L2 (Redis)
      if (this.config.enableL2 && this.redisClient) {
        await this.setInRedis(fullKey, value, ttl);
        this.redisCacheStats.sets++;
      }

      this.logger.debug('Cache set', { 
        key, 
        size: this.getValueSize(value),
        ttl,
        memoryTTL 
      });

      return true;

    } catch (error) {
      this.logger.error('Cache set error', error, { key, fullKey });
      this.redisCacheStats.errors++;
      return false;
    }
  }

  /**
   * Delete from cache (L1 + L2)
   */
  async delete(key) {
    const fullKey = this.buildKey(key);

    try {
      let deleted = false;

      // Delete from L1
      if (this.config.enableL1) {
        if (this.memoryCache.has(fullKey)) {
          this.memoryCache.delete(fullKey);
          this.memoryCacheStats.deletes++;
          this.memoryCacheStats.size--;
          deleted = true;
        }
      }

      // Delete from L2
      if (this.config.enableL2 && this.redisClient) {
        const redisDeleted = await this.redisClient.del(fullKey);
        if (redisDeleted > 0) {
          this.redisCacheStats.deletes++;
          deleted = true;
        }
      }

      this.logger.debug('Cache delete', { key, deleted });
      return deleted;

    } catch (error) {
      this.logger.error('Cache delete error', error, { key, fullKey });
      this.redisCacheStats.errors++;
      return false;
    }
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet(key, factory, options = {}) {
    let value = await this.get(key, options);
    
    if (value === null) {
      this.logger.debug('Cache miss, executing factory function', { key });
      
      try {
        value = await factory();
        if (value !== null && value !== undefined) {
          await this.set(key, value, options);
        }
      } catch (error) {
        this.logger.error('Cache factory function error', error, { key });
        throw error;
      }
    }
    
    return value;
  }

  /**
   * Bulk get operation
   */
  async mget(keys) {
    const results = {};
    const missingKeys = [];

    // Check L1 first
    if (this.config.enableL1) {
      for (const key of keys) {
        const fullKey = this.buildKey(key);
        const memoryResult = this.getFromMemory(fullKey);
        
        if (memoryResult !== null) {
          results[key] = memoryResult;
          this.memoryCacheStats.hits++;
        } else {
          missingKeys.push(key);
          this.memoryCacheStats.misses++;
        }
      }
    } else {
      missingKeys.push(...keys);
    }

    // Check L2 for missing keys
    if (missingKeys.length > 0 && this.config.enableL2 && this.redisClient) {
      try {
        const redisKeys = missingKeys.map(key => this.buildKey(key));
        const redisResults = await this.redisClient.mget(redisKeys);
        
        for (let i = 0; i < missingKeys.length; i++) {
          const key = missingKeys[i];
          const redisResult = redisResults[i];
          
          if (redisResult !== null) {
            const parsed = this.parseRedisValue(redisResult);
            results[key] = parsed;
            this.redisCacheStats.hits++;
            
            // Promote to L1
            if (this.config.enableL1) {
              const fullKey = this.buildKey(key);
              this.setInMemory(fullKey, parsed, this.config.memoryTTL);
            }
          } else {
            this.redisCacheStats.misses++;
          }
        }
      } catch (error) {
        this.logger.error('Bulk get Redis error', error);
        this.redisCacheStats.errors++;
      }
    }

    return results;
  }

  /**
   * Bulk set operation
   */
  async mset(entries, options = {}) {
    const promises = [];

    for (const [key, value] of Object.entries(entries)) {
      promises.push(this.set(key, value, options));
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    
    this.logger.debug('Bulk set completed', { 
      total: promises.length, 
      successful,
      failed: promises.length - successful 
    });
    
    return successful === promises.length;
  }

  /**
   * Pattern-based deletion
   */
  async deletePattern(pattern) {
    const fullPattern = this.buildKey(pattern);
    let deletedCount = 0;

    try {
      // Delete from L1 (Memory)
      if (this.config.enableL1) {
        const regex = new RegExp(fullPattern.replace(/\*/g, '.*'));
        for (const [key] of this.memoryCache.entries()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key);
            this.memoryCacheStats.deletes++;
            this.memoryCacheStats.size--;
            deletedCount++;
          }
        }
      }

      // Delete from L2 (Redis)
      if (this.config.enableL2 && this.redisClient) {
        const keys = await this.redisClient.keys(fullPattern);
        if (keys.length > 0) {
          const redisDeleted = await this.redisClient.del(...keys);
          deletedCount += redisDeleted;
          this.redisCacheStats.deletes += redisDeleted;
        }
      }

      this.logger.info('Pattern deletion completed', { pattern, deletedCount });
      return deletedCount;

    } catch (error) {
      this.logger.error('Pattern deletion error', error, { pattern });
      this.redisCacheStats.errors++;
      return 0;
    }
  }

  /**
   * Cache warming - preload frequently accessed data
   */
  async warmCache(warmupData) {
    this.logger.info('Starting cache warmup', { items: Object.keys(warmupData).length });
    
    const results = await this.mset(warmupData, { 
      ttl: this.config.redisTTL * 2 // Longer TTL for warmup data
    });
    
    this.logger.info('Cache warmup completed', { successful: results });
    
    this.emitEvent('CACHE_WARMED', {
      itemCount: Object.keys(warmupData).length,
      successful: results
    });
    
    return results;
  }

  /**
   * L1 Memory cache operations
   */
  getFromMemory(key) {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      this.memoryCacheStats.size--;
      return null;
    }
    
    return entry.value;
  }

  setInMemory(key, value, ttl) {
    // Eviction if cache is full
    if (this.memoryCache.size >= this.config.memoryMaxSize) {
      this.evictLRU();
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      accessedAt: Date.now()
    });
    
    this.memoryCacheStats.size++;
  }

  /**
   * L2 Redis cache operations
   */
  async getFromRedis(key) {
    try {
      const result = await this.redisClient.get(key);
      return this.parseRedisValue(result);
    } catch (error) {
      this.logger.error('Redis get error', error, { key });
      throw error;
    }
  }

  async setInRedis(key, value, ttl) {
    try {
      const serialized = this.serializeValue(value);
      await this.redisClient.set(key, serialized, ttl);
    } catch (error) {
      this.logger.error('Redis set error', error, { key });
      throw error;
    }
  }

  /**
   * Value serialization/deserialization
   */
  serializeValue(value) {
    const serialized = JSON.stringify(value);
    
    // Optional compression for large values
    if (this.config.enableCompression && serialized.length > this.config.compressionThreshold) {
      // Compression would be implemented here
      // For now, just return serialized value
    }
    
    return serialized;
  }

  parseRedisValue(value) {
    if (value === null) return null;
    
    try {
      return JSON.parse(value);
    } catch (error) {
      this.logger.warn('Failed to parse cache value', { value: value?.substring(0, 100) });
      return null;
    }
  }

  /**
   * Cache cleanup and maintenance
   */
  cleanupMemoryCache() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        this.memoryCache.delete(key);
        expiredCount++;
      }
    }

    this.memoryCacheStats.size = this.memoryCache.size;

    if (expiredCount > 0) {
      this.logger.debug('Memory cache cleanup', { 
        expiredCount, 
        remainingSize: this.memoryCache.size 
      });
    }
  }

  /**
   * LRU eviction for memory cache
   */
  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.memoryCacheStats.size--;
      this.logger.debug('LRU eviction', { evictedKey: oldestKey });
    }
  }

  /**
   * Utility methods
   */
  buildKey(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  getValueSize(value) {
    return JSON.stringify(value).length;
  }

  logCacheHit(level, key, duration) {
    this.logger.debug('Cache hit', { level, key, duration: `${duration}ms` });
  }

  logCacheMiss(key, duration) {
    this.logger.debug('Cache miss', { key, duration: `${duration}ms` });
  }

  emitEvent(eventType, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(EventTypes.CACHE_EVENT, {
        eventType,
        service: 'cognitive-core',
        timestamp: new Date(),
        ...data
      });
    }
  }

  /**
   * Statistics and monitoring
   */
  getStats() {
    const memoryHitRate = this.memoryCacheStats.hits + this.memoryCacheStats.misses > 0 ?
      (this.memoryCacheStats.hits / (this.memoryCacheStats.hits + this.memoryCacheStats.misses)) * 100 : 0;

    const redisHitRate = this.redisCacheStats.hits + this.redisCacheStats.misses > 0 ?
      (this.redisCacheStats.hits / (this.redisCacheStats.hits + this.redisCacheStats.misses)) * 100 : 0;

    const totalHits = this.memoryCacheStats.hits + this.redisCacheStats.hits;
    const totalMisses = this.memoryCacheStats.misses + this.redisCacheStats.misses;
    const overallHitRate = totalHits + totalMisses > 0 ?
      (totalHits / (totalHits + totalMisses)) * 100 : 0;

    return {
      overall: {
        hitRate: Math.round(overallHitRate * 100) / 100,
        totalHits,
        totalMisses,
        totalRequests: totalHits + totalMisses
      },
      l1Memory: {
        ...this.memoryCacheStats,
        hitRate: Math.round(memoryHitRate * 100) / 100,
        maxSize: this.config.memoryMaxSize,
        currentSize: this.memoryCache.size
      },
      l2Redis: {
        ...this.redisCacheStats,
        hitRate: Math.round(redisHitRate * 100) / 100
      },
      config: {
        enableL1: this.config.enableL1,
        enableL2: this.config.enableL2,
        memoryTTL: this.config.memoryTTL,
        redisTTL: this.config.redisTTL
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      status: 'ok',
      l1Memory: true,
      l2Redis: true,
      details: {}
    };

    // Check memory cache
    try {
      health.details.memorySize = this.memoryCache.size;
      health.details.memoryMaxSize = this.config.memoryMaxSize;
    } catch (error) {
      health.l1Memory = false;
      health.details.memoryError = error.message;
    }

    // Check Redis cache
    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        health.details.redisConnected = true;
      } catch (error) {
        health.l2Redis = false;
        health.details.redisError = error.message;
      }
    }

    health.status = (health.l1Memory && health.l2Redis) ? 'ok' : 'degraded';
    return health;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    this.logger.info('Cache manager shutting down...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear memory cache
    this.memoryCache.clear();
    
    this.logger.info('Cache manager shutdown completed', {
      finalStats: this.getStats()
    });
  }
}

export { CacheManager };