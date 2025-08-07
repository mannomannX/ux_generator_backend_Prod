/**
 * Secure Cache Manager
 * Provides encrypted Redis caching with automatic encryption/decryption
 */

import { getCryptoManager } from './crypto.js';
import { CONFIG } from '../config/constants.js';
import { ErrorFactory } from './errors.js';

export class SecureCache {
  constructor(redisClient, logger, options = {}) {
    this.redisClient = redisClient;
    this.logger = logger;
    this.crypto = getCryptoManager();
    
    // Configuration
    this.config = {
      encryptionEnabled: options.encryptionEnabled !== false,
      compressionEnabled: options.compressionEnabled || false,
      defaultTTL: options.defaultTTL || CONFIG.CACHE.TTL.DEFAULT,
      keyPrefix: options.keyPrefix || CONFIG.CACHE.KEY_PREFIX.KNOWLEDGE,
      maxSize: options.maxSize || CONFIG.CACHE.MAX_SIZE.REDIS,
      ...options
    };

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      encryptionTime: 0,
      decryptionTime: 0
    };
  }

  /**
   * Generate cache key with prefix
   */
  getCacheKey(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Set value in cache with encryption
   */
  async set(key, value, ttl = null) {
    try {
      const startTime = Date.now();
      const cacheKey = this.getCacheKey(key);
      
      // Serialize the value
      let serialized = JSON.stringify(value);
      
      // Compress if enabled (for large values)
      if (this.config.compressionEnabled && serialized.length > 1024) {
        serialized = await this.compress(serialized);
      }
      
      // Encrypt if enabled
      let toStore = serialized;
      if (this.config.encryptionEnabled) {
        toStore = this.crypto.encrypt(serialized);
        this.stats.encryptionTime += Date.now() - startTime;
      }

      // Store in Redis with TTL
      const effectiveTTL = ttl || this.config.defaultTTL;
      if (effectiveTTL > 0) {
        await this.redisClient.setex(cacheKey, effectiveTTL, toStore);
      } else {
        await this.redisClient.set(cacheKey, toStore);
      }

      this.logger.debug('Cached value', { 
        key: cacheKey, 
        ttl: effectiveTTL,
        encrypted: this.config.encryptionEnabled,
        size: toStore.length
      });

      return true;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Cache set failed', { key, error: error.message });
      throw ErrorFactory.databaseOperation('cache_set', error.message);
    }
  }

  /**
   * Get value from cache with decryption
   */
  async get(key) {
    try {
      const startTime = Date.now();
      const cacheKey = this.getCacheKey(key);
      
      // Get from Redis
      const cached = await this.redisClient.get(cacheKey);
      
      if (!cached) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      
      // Decrypt if enabled
      let decrypted = cached;
      if (this.config.encryptionEnabled) {
        decrypted = this.crypto.decrypt(cached);
        this.stats.decryptionTime += Date.now() - startTime;
      }

      // Decompress if needed
      if (this.config.compressionEnabled && this.isCompressed(decrypted)) {
        decrypted = await this.decompress(decrypted);
      }

      // Deserialize
      const value = JSON.parse(decrypted);

      this.logger.debug('Cache hit', { key: cacheKey });
      
      return value;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Cache get failed', { key, error: error.message });
      
      // Return null on decryption failure (corrupted data)
      if (error.message.includes('Decryption failed')) {
        await this.delete(key);
        return null;
      }
      
      throw ErrorFactory.databaseOperation('cache_get', error.message);
    }
  }

  /**
   * Set multiple values with encryption
   */
  async mset(keyValuePairs, ttl = null) {
    try {
      const pipeline = this.redisClient.pipeline();
      const effectiveTTL = ttl || this.config.defaultTTL;

      for (const [key, value] of Object.entries(keyValuePairs)) {
        const cacheKey = this.getCacheKey(key);
        let serialized = JSON.stringify(value);
        
        // Encrypt if enabled
        if (this.config.encryptionEnabled) {
          serialized = this.crypto.encrypt(serialized);
        }

        if (effectiveTTL > 0) {
          pipeline.setex(cacheKey, effectiveTTL, serialized);
        } else {
          pipeline.set(cacheKey, serialized);
        }
      }

      await pipeline.exec();
      
      this.logger.debug('Batch cached values', { 
        count: Object.keys(keyValuePairs).length,
        ttl: effectiveTTL
      });

      return true;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Batch cache set failed', error);
      throw ErrorFactory.databaseOperation('cache_mset', error.message);
    }
  }

  /**
   * Get multiple values with decryption
   */
  async mget(keys) {
    try {
      const cacheKeys = keys.map(key => this.getCacheKey(key));
      const values = await this.redisClient.mget(cacheKeys);
      
      const results = {};
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        
        if (!value) {
          this.stats.misses++;
          results[key] = null;
          continue;
        }

        this.stats.hits++;
        
        try {
          // Decrypt if enabled
          let decrypted = value;
          if (this.config.encryptionEnabled) {
            decrypted = this.crypto.decrypt(value);
          }

          // Deserialize
          results[key] = JSON.parse(decrypted);
        } catch (error) {
          this.logger.warn('Failed to decrypt/parse cached value', { key });
          results[key] = null;
        }
      }

      return results;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Batch cache get failed', error);
      throw ErrorFactory.databaseOperation('cache_mget', error.message);
    }
  }

  /**
   * Delete from cache
   */
  async delete(key) {
    try {
      const cacheKey = this.getCacheKey(key);
      const result = await this.redisClient.del(cacheKey);
      
      this.logger.debug('Cache entry deleted', { key: cacheKey });
      
      return result > 0;
    } catch (error) {
      this.logger.error('Cache delete failed', { key, error: error.message });
      throw ErrorFactory.databaseOperation('cache_delete', error.message);
    }
  }

  /**
   * Delete multiple keys
   */
  async deletePattern(pattern) {
    try {
      const fullPattern = this.getCacheKey(pattern);
      const keys = await this.redisClient.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redisClient.del(...keys);
      
      this.logger.debug('Cache entries deleted by pattern', { 
        pattern: fullPattern, 
        count: result 
      });
      
      return result;
    } catch (error) {
      this.logger.error('Pattern delete failed', { pattern, error: error.message });
      throw ErrorFactory.databaseOperation('cache_delete_pattern', error.message);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const cacheKey = this.getCacheKey(key);
      const exists = await this.redisClient.exists(cacheKey);
      return exists > 0;
    } catch (error) {
      this.logger.error('Cache exists check failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get remaining TTL
   */
  async ttl(key) {
    try {
      const cacheKey = this.getCacheKey(key);
      return await this.redisClient.ttl(cacheKey);
    } catch (error) {
      this.logger.error('TTL check failed', { key, error: error.message });
      return -1;
    }
  }

  /**
   * Update TTL
   */
  async expire(key, ttl) {
    try {
      const cacheKey = this.getCacheKey(key);
      return await this.redisClient.expire(cacheKey, ttl);
    } catch (error) {
      this.logger.error('Expire failed', { key, error: error.message });
      return false;
    }
  }

  /**
   * Clear all cache entries with prefix
   */
  async clear() {
    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redisClient.del(...keys);
      
      this.logger.info('Cache cleared', { count: result });
      
      return result;
    } catch (error) {
      this.logger.error('Cache clear failed', error);
      throw ErrorFactory.databaseOperation('cache_clear', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate.toFixed(2)}%`,
      avgEncryptionTime: this.stats.hits > 0 
        ? (this.stats.encryptionTime / this.stats.hits).toFixed(2) + 'ms'
        : '0ms',
      avgDecryptionTime: this.stats.hits > 0
        ? (this.stats.decryptionTime / this.stats.hits).toFixed(2) + 'ms'
        : '0ms'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      errors: 0,
      encryptionTime: 0,
      decryptionTime: 0
    };
  }

  /**
   * Simple compression check
   */
  isCompressed(data) {
    return data.startsWith('COMPRESSED:');
  }

  /**
   * Simple compression (base64 encoding for demo)
   */
  async compress(data) {
    // In production, use proper compression like zlib
    const compressed = Buffer.from(data).toString('base64');
    return `COMPRESSED:${compressed}`;
  }

  /**
   * Simple decompression
   */
  async decompress(data) {
    if (!this.isCompressed(data)) {
      return data;
    }
    const compressed = data.substring('COMPRESSED:'.length);
    return Buffer.from(compressed, 'base64').toString('utf8');
  }

  /**
   * Cache wrapper with automatic get/set
   */
  async wrap(key, fn, ttl = null) {
    try {
      // Try to get from cache
      const cached = await this.get(key);
      if (cached !== null) {
        return cached;
      }

      // Execute function and cache result
      const result = await fn();
      
      if (result !== undefined && result !== null) {
        await this.set(key, result, ttl);
      }

      return result;
    } catch (error) {
      this.logger.error('Cache wrap failed', { key, error: error.message });
      // Return function result even if caching fails
      return fn();
    }
  }
}

/**
 * Factory function for creating secure cache instances
 */
export function createSecureCache(redisClient, logger, options = {}) {
  return new SecureCache(redisClient, logger, options);
}

export default {
  SecureCache,
  createSecureCache
};