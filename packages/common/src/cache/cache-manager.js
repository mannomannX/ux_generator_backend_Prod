// ==========================================
// PACKAGES/COMMON/src/cache/cache-manager.js
// ==========================================

import { EventEmitter } from 'events';

/**
 * Enhanced Cache Manager with intelligent caching strategies, cache invalidation,
 * and performance optimization for production workloads
 */
export class CacheManager extends EventEmitter {
  constructor(redisClient, logger, config = {}) {
    super();
    this.redisClient = redisClient;
    this.logger = logger;
    
    this.config = {
      defaultTtl: config.defaultTtl || 300, // 5 minutes
      maxKeyLength: config.maxKeyLength || 250,
      keyPrefix: config.keyPrefix || 'uxflow',
      enableMetrics: config.enableMetrics !== false,
      enableCompression: config.enableCompression || false,
      compressionThreshold: config.compressionThreshold || 1024, // 1KB
      serializationFormat: config.serializationFormat || 'json', // json, msgpack
      invalidationPatterns: config.invalidationPatterns || {},
      cacheTiers: config.cacheTiers || {
        hot: { ttl: 60, maxSize: 1000 },      // 1 minute, for frequently accessed data
        warm: { ttl: 300, maxSize: 5000 },    // 5 minutes, for commonly accessed data
        cold: { ttl: 3600, maxSize: 10000 },  // 1 hour, for rarely accessed data
      },
    };

    // Metrics tracking
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      errors: 0,
      totalKeys: 0,
      totalSize: 0,
      hitRate: 0,
      averageResponseTime: 0,
      responseTimeSum: 0,
      operations: 0,
    };

    // Cache categories for intelligent management
    this.categories = {
      USER_SESSIONS: { prefix: 'session', ttl: 1800, tier: 'hot' },
      USER_DATA: { prefix: 'user', ttl: 900, tier: 'warm' },
      FLOWS: { prefix: 'flow', ttl: 600, tier: 'warm' },
      KNOWLEDGE: { prefix: 'knowledge', ttl: 1800, tier: 'cold' },
      AI_RESPONSES: { prefix: 'ai', ttl: 3600, tier: 'cold' },
      API_RESPONSES: { prefix: 'api', ttl: 300, tier: 'warm' },
      WORKSPACE_DATA: { prefix: 'workspace', ttl: 600, tier: 'warm' },
      BILLING_DATA: { prefix: 'billing', ttl: 300, tier: 'warm' },
      CONFIGURATION: { prefix: 'config', ttl: 3600, tier: 'cold' },
      METRICS: { prefix: 'metrics', ttl: 60, tier: 'hot' },
    };

    // Invalidation dependencies
    this.dependencies = {
      USER_DATA: ['USER_SESSIONS', 'WORKSPACE_DATA'],
      FLOWS: ['API_RESPONSES', 'USER_DATA'],
      WORKSPACE_DATA: ['FLOWS', 'BILLING_DATA', 'USER_DATA'],
      BILLING_DATA: ['USER_DATA', 'WORKSPACE_DATA'],
    };

    this.startMetricsCollection();
    
    this.logger.info('Cache Manager initialized', {
      defaultTtl: this.config.defaultTtl,
      enableCompression: this.config.enableCompression,
      serializationFormat: this.config.serializationFormat,
      categories: Object.keys(this.categories).length,
    });
  }

  /**
   * Get value from cache with performance tracking
   */
  async get(key, category = null) {
    const startTime = Date.now();
    
    try {
      const fullKey = this.buildKey(key, category);
      const result = await this.redisClient.get(fullKey);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics('get', responseTime, result !== null);
      
      if (result !== null) {
        const deserializedResult = this.deserialize(result);
        this.logger.debug('Cache hit', { key: fullKey, responseTime });
        return deserializedResult;
      } else {
        this.logger.debug('Cache miss', { key: fullKey, responseTime });
        return null;
      }
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache get failed', error, { key });
      return null;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget(keys, category = null) {
    const startTime = Date.now();
    
    try {
      const fullKeys = keys.map(key => this.buildKey(key, category));
      const results = await this.redisClient.mget(fullKeys);
      
      const responseTime = Date.now() - startTime;
      const hits = results.filter(r => r !== null).length;
      
      this.metrics.hits += hits;
      this.metrics.misses += (results.length - hits);
      this.updateResponseTime(responseTime);
      
      const deserializedResults = results.map(result => 
        result !== null ? this.deserialize(result) : null
      );
      
      this.logger.debug('Cache mget', {
        keys: fullKeys.length,
        hits,
        misses: results.length - hits,
        responseTime,
      });
      
      return deserializedResults;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache mget failed', error, { keys });
      return keys.map(() => null);
    }
  }

  /**
   * Set value in cache with intelligent TTL and compression
   */
  async set(key, value, ttl = null, category = null) {
    const startTime = Date.now();
    
    try {
      const fullKey = this.buildKey(key, category);
      const categoryConfig = category ? this.categories[category] : null;
      const finalTtl = ttl || categoryConfig?.ttl || this.config.defaultTtl;
      
      const serializedValue = this.serialize(value);
      
      await this.redisClient.set(fullKey, serializedValue, finalTtl);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics('set', responseTime, true);
      
      this.logger.debug('Cache set', {
        key: fullKey,
        ttl: finalTtl,
        size: serializedValue.length,
        responseTime,
      });
      
      // Track cache size
      this.metrics.totalKeys++;
      this.metrics.totalSize += serializedValue.length;
      
      return true;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache set failed', error, { key });
      return false;
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs, ttl = null, category = null) {
    const startTime = Date.now();
    
    try {
      const pipeline = this.redisClient.pipeline ? this.redisClient.pipeline() : null;
      const categoryConfig = category ? this.categories[category] : null;
      const finalTtl = ttl || categoryConfig?.ttl || this.config.defaultTtl;
      
      if (pipeline) {
        // Use pipeline for better performance
        for (const [key, value] of keyValuePairs) {
          const fullKey = this.buildKey(key, category);
          const serializedValue = this.serialize(value);
          pipeline.set(fullKey, serializedValue, 'EX', finalTtl);
        }
        
        await pipeline.exec();
      } else {
        // Fallback to individual sets
        const promises = keyValuePairs.map(([key, value]) => 
          this.set(key, value, finalTtl, category)
        );
        await Promise.all(promises);
      }
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics('mset', responseTime, true);
      
      this.logger.debug('Cache mset', {
        count: keyValuePairs.length,
        ttl: finalTtl,
        responseTime,
      });
      
      return true;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache mset failed', error);
      return false;
    }
  }

  /**
   * Delete single key
   */
  async del(key, category = null) {
    const startTime = Date.now();
    
    try {
      const fullKey = this.buildKey(key, category);
      const result = await this.redisClient.del(fullKey);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics('delete', responseTime, true);
      
      this.logger.debug('Cache delete', { key: fullKey, responseTime });
      
      if (result > 0) {
        this.metrics.totalKeys -= result;
      }
      
      return result > 0;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache delete failed', error, { key });
      return false;
    }
  }

  /**
   * Delete multiple keys
   */
  async mdel(keys, category = null) {
    const startTime = Date.now();
    
    try {
      const fullKeys = keys.map(key => this.buildKey(key, category));
      const result = await this.redisClient.del(...fullKeys);
      
      const responseTime = Date.now() - startTime;
      this.updateMetrics('mdelete', responseTime, true);
      
      this.logger.debug('Cache mdelete', {
        count: keys.length,
        deleted: result,
        responseTime,
      });
      
      this.metrics.totalKeys -= result;
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache mdelete failed', error, { keys });
      return 0;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern, category = null) {
    const startTime = Date.now();
    
    try {
      const fullPattern = this.buildKey(pattern, category);
      const keys = await this.redisClient.keys(fullPattern);
      
      if (keys.length > 0) {
        const deleted = await this.redisClient.del(...keys);
        
        const responseTime = Date.now() - startTime;
        this.metrics.invalidations++;
        this.updateMetrics('invalidate', responseTime, true);
        
        this.logger.info('Cache invalidated by pattern', {
          pattern: fullPattern,
          keysFound: keys.length,
          deleted,
          responseTime,
        });
        
        this.emit('invalidation', {
          pattern: fullPattern,
          keysDeleted: deleted,
          category,
        });
        
        return deleted;
      }
      
      return 0;
      
    } catch (error) {
      this.metrics.errors++;
      this.logger.warn('Cache pattern invalidation failed', error, { pattern });
      return 0;
    }
  }

  /**
   * Invalidate dependent caches
   */
  async invalidateDependent(category) {
    try {
      const dependents = this.dependencies[category] || [];
      const invalidations = [];
      
      for (const dependentCategory of dependents) {
        const categoryConfig = this.categories[dependentCategory];
        if (categoryConfig) {
          const pattern = `${categoryConfig.prefix}:*`;
          const deleted = await this.invalidateByPattern(pattern);
          invalidations.push({ category: dependentCategory, deleted });
        }
      }
      
      this.logger.info('Dependent caches invalidated', {
        sourceCategory: category,
        invalidations,
      });
      
      return invalidations;
      
    } catch (error) {
      this.logger.error('Failed to invalidate dependent caches', error, { category });
    }
  }

  /**
   * Cache with automatic refresh
   */
  async getOrSet(key, fetchFunction, ttl = null, category = null) {
    const cached = await this.get(key, category);
    
    if (cached !== null) {
      return cached;
    }
    
    try {
      const value = await fetchFunction();
      await this.set(key, value, ttl, category);
      return value;
    } catch (error) {
      this.logger.error('Cache getOrSet fetch failed', error, { key });
      throw error;
    }
  }

  /**
   * Increment counter with expiration
   */
  async incr(key, increment = 1, ttl = null, category = null) {
    try {
      const fullKey = this.buildKey(key, category);
      const result = await this.redisClient.incrby(fullKey, increment);
      
      // Set TTL only on first increment
      if (result === increment && ttl) {
        await this.redisClient.expire(fullKey, ttl);
      }
      
      return result;
      
    } catch (error) {
      this.logger.warn('Cache increment failed', error, { key });
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.metrics.operations > 0 
      ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses)) * 100
      : 0;
      
    const averageResponseTime = this.metrics.operations > 0
      ? this.metrics.responseTimeSum / this.metrics.operations
      : 0;

    return {
      ...this.metrics,
      hitRate: Math.round(hitRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      categories: Object.keys(this.categories),
      timestamp: new Date(),
    };
  }

  /**
   * Build cache key with prefix and category
   */
  buildKey(key, category = null) {
    const parts = [this.config.keyPrefix];
    
    if (category && this.categories[category]) {
      parts.push(this.categories[category].prefix);
    }
    
    parts.push(key);
    
    const fullKey = parts.join(':');
    
    // Ensure key length doesn't exceed limit
    if (fullKey.length > this.config.maxKeyLength) {
      const hash = this.hashString(fullKey);
      const truncatedKey = fullKey.substring(0, this.config.maxKeyLength - 10) + ':' + hash;
      this.logger.debug('Key truncated', { original: fullKey, truncated: truncatedKey });
      return truncatedKey;
    }
    
    return fullKey;
  }

  /**
   * Serialize value for storage
   */
  serialize(value) {
    try {
      let serialized;
      
      if (this.config.serializationFormat === 'msgpack') {
        // Implement MessagePack serialization if needed
        serialized = JSON.stringify(value);
      } else {
        serialized = JSON.stringify(value);
      }
      
      // Compress if enabled and value is large enough
      if (this.config.enableCompression && serialized.length > this.config.compressionThreshold) {
        // Implement compression if needed (e.g., gzip, lz4)
        // For now, just mark it as compressed
        return `compressed:${serialized}`;
      }
      
      return serialized;
      
    } catch (error) {
      this.logger.warn('Serialization failed', error);
      return JSON.stringify(value);
    }
  }

  /**
   * Deserialize value from storage
   */
  deserialize(value) {
    try {
      // Handle compressed values
      if (value.startsWith('compressed:')) {
        // Implement decompression
        value = value.substring(11); // Remove 'compressed:' prefix
      }
      
      return JSON.parse(value);
      
    } catch (error) {
      this.logger.warn('Deserialization failed', error);
      return value;
    }
  }

  /**
   * Hash string for key truncation
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Update metrics
   */
  updateMetrics(operation, responseTime, success) {
    this.metrics.operations++;
    
    if (operation === 'get') {
      if (success) this.metrics.hits++;
      else this.metrics.misses++;
    } else if (operation === 'set' || operation === 'mset') {
      this.metrics.sets++;
    } else if (operation.includes('delete')) {
      this.metrics.deletes++;
    }
    
    this.updateResponseTime(responseTime);
  }

  /**
   * Update response time metrics
   */
  updateResponseTime(responseTime) {
    this.metrics.responseTimeSum += responseTime;
    this.metrics.averageResponseTime = this.metrics.responseTimeSum / this.metrics.operations;
  }

  /**
   * Start metrics collection and cleanup
   */
  startMetricsCollection() {
    // Emit metrics every minute
    setInterval(() => {
      const stats = this.getStats();
      this.emit('metrics', stats);
      
      this.logger.debug('Cache metrics', {
        hitRate: stats.hitRate,
        operations: stats.operations,
        errors: stats.errors,
        totalKeys: stats.totalKeys,
        averageResponseTime: stats.averageResponseTime,
      });
    }, 60000);

    // Reset counters every hour to prevent overflow
    setInterval(() => {
      const currentStats = this.getStats();
      this.metrics = {
        ...this.metrics,
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        operations: 0,
        responseTimeSum: 0,
      };
      
      this.logger.info('Cache metrics reset', {
        previousHitRate: currentStats.hitRate,
        previousOperations: currentStats.operations,
      });
    }, 3600000);
  }

  /**
   * Clear all cache
   */
  async flush() {
    try {
      await this.redisClient.flushdb();
      
      this.metrics = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        invalidations: 0,
        errors: 0,
        totalKeys: 0,
        totalSize: 0,
        hitRate: 0,
        averageResponseTime: 0,
        responseTimeSum: 0,
        operations: 0,
      };
      
      this.logger.info('Cache flushed');
      this.emit('flush');
      
      return true;
      
    } catch (error) {
      this.logger.error('Cache flush failed', error);
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testKey = `${this.config.keyPrefix}:health:${Date.now()}`;
      const testValue = { health: 'check', timestamp: Date.now() };
      
      // Test set and get
      await this.redisClient.set(testKey, JSON.stringify(testValue), 10);
      const retrieved = await this.redisClient.get(testKey);
      await this.redisClient.del(testKey);
      
      const isHealthy = retrieved !== null;
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        cache: {
          connected: isHealthy,
          metrics: this.getStats(),
        },
        timestamp: new Date(),
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }
}

export default CacheManager;