/**
 * Encrypted Cache Utility
 * Provides transparent encryption/decryption for Redis cache entries
 */

import crypto from 'crypto';

export class EncryptedCache {
  constructor(redisClient, logger, options = {}) {
    this.redis = redisClient;
    this.logger = logger;
    
    // Encryption configuration
    this.algorithm = options.algorithm || 'aes-256-gcm';
    this.keyLength = options.keyLength || 32;
    this.ivLength = options.ivLength || 16;
    this.tagLength = options.tagLength || 16;
    this.saltLength = options.saltLength || 32;
    
    // Get or generate encryption key
    this.masterKey = this.getMasterKey(options.encryptionKey);
    
    // Cache configuration
    this.defaultTTL = options.defaultTTL || 3600; // 1 hour
    this.keyPrefix = options.keyPrefix || 'enc:';
    
    // Performance optimization
    this.compressionThreshold = options.compressionThreshold || 1024; // Compress data > 1KB
  }

  /**
   * Get or generate master encryption key
   */
  getMasterKey(providedKey) {
    if (providedKey) {
      // Ensure key is correct length
      const key = Buffer.from(providedKey, 'hex');
      if (key.length !== this.keyLength) {
        throw new Error(`Encryption key must be ${this.keyLength} bytes`);
      }
      return key;
    }
    
    // Generate key from environment or create new one
    if (process.env.CACHE_ENCRYPTION_KEY) {
      return Buffer.from(process.env.CACHE_ENCRYPTION_KEY, 'hex');
    }
    
    // Generate new key for development (not for production!)
    if (process.env.NODE_ENV !== 'production') {
      const key = crypto.randomBytes(this.keyLength);
      this.logger.warn('Generated temporary encryption key for cache (development only)');
      return key;
    }
    
    throw new Error('CACHE_ENCRYPTION_KEY must be set in production');
  }

  /**
   * Derive key from master key using salt
   */
  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 10000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt data
   */
  encrypt(data) {
    try {
      // Convert data to string if needed
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key from salt
      const key = this.deriveKey(salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);
      
      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      // Get auth tag for GCM mode
      const authTag = cipher.getAuthTag();
      
      // Combine salt, iv, authTag, and encrypted data
      const combined = Buffer.concat([
        salt,
        iv,
        authTag,
        encrypted
      ]);
      
      // Return base64 encoded
      return combined.toString('base64');
      
    } catch (error) {
      this.logger.error('Encryption failed', error);
      throw new Error('Failed to encrypt cache data');
    }
  }

  /**
   * Decrypt data
   */
  decrypt(encryptedData) {
    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const authTag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);
      
      // Derive key from salt
      const key = this.deriveKey(salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      const plaintext = decrypted.toString('utf8');
      
      // Try to parse as JSON
      try {
        return JSON.parse(plaintext);
      } catch {
        return plaintext;
      }
      
    } catch (error) {
      this.logger.error('Decryption failed', error);
      throw new Error('Failed to decrypt cache data');
    }
  }

  /**
   * Compress data if needed
   */
  compress(data) {
    const stringData = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (stringData.length < this.compressionThreshold) {
      return { compressed: false, data: stringData };
    }
    
    // Use zlib compression
    const zlib = require('zlib');
    const compressed = zlib.gzipSync(stringData);
    
    return {
      compressed: true,
      data: compressed.toString('base64')
    };
  }

  /**
   * Decompress data
   */
  decompress(compressedData, isCompressed) {
    if (!isCompressed) {
      return compressedData;
    }
    
    const zlib = require('zlib');
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressed = zlib.gunzipSync(buffer);
    
    return decompressed.toString('utf8');
  }

  /**
   * Set encrypted cache entry
   */
  async set(key, value, ttl = null) {
    try {
      const fullKey = `${this.keyPrefix}${key}`;
      
      // Compress if needed
      const { compressed, data } = this.compress(value);
      
      // Prepare cache entry
      const cacheEntry = {
        data,
        compressed,
        timestamp: Date.now(),
        version: 1
      };
      
      // Encrypt the entry
      const encrypted = this.encrypt(cacheEntry);
      
      // Store in Redis
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(fullKey, expiry, encrypted);
      
      return true;
      
    } catch (error) {
      this.logger.error('Failed to set encrypted cache', { key, error });
      return false;
    }
  }

  /**
   * Get encrypted cache entry
   */
  async get(key) {
    try {
      const fullKey = `${this.keyPrefix}${key}`;
      
      // Get from Redis
      const encrypted = await this.redis.get(fullKey);
      
      if (!encrypted) {
        return null;
      }
      
      // Decrypt the entry
      const cacheEntry = this.decrypt(encrypted);
      
      // Decompress if needed
      const decompressed = this.decompress(cacheEntry.data, cacheEntry.compressed);
      
      // Parse if JSON
      try {
        return JSON.parse(decompressed);
      } catch {
        return decompressed;
      }
      
    } catch (error) {
      this.logger.error('Failed to get encrypted cache', { key, error });
      return null;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key) {
    try {
      const fullKey = `${this.keyPrefix}${key}`;
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.logger.error('Failed to delete cache entry', { key, error });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const fullKey = `${this.keyPrefix}${key}`;
      const result = await this.redis.exists(fullKey);
      return result > 0;
    } catch (error) {
      this.logger.error('Failed to check cache existence', { key, error });
      return false;
    }
  }

  /**
   * Set multiple entries (batch operation)
   */
  async mset(entries, ttl = null) {
    const pipeline = this.redis.pipeline();
    const expiry = ttl || this.defaultTTL;
    
    for (const [key, value] of Object.entries(entries)) {
      try {
        const fullKey = `${this.keyPrefix}${key}`;
        const { compressed, data } = this.compress(value);
        
        const cacheEntry = {
          data,
          compressed,
          timestamp: Date.now(),
          version: 1
        };
        
        const encrypted = this.encrypt(cacheEntry);
        pipeline.setex(fullKey, expiry, encrypted);
      } catch (error) {
        this.logger.error('Failed to prepare batch entry', { key, error });
      }
    }
    
    try {
      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.error('Failed to execute batch set', error);
      return false;
    }
  }

  /**
   * Get multiple entries
   */
  async mget(keys) {
    const fullKeys = keys.map(key => `${this.keyPrefix}${key}`);
    
    try {
      const values = await this.redis.mget(fullKeys);
      const results = {};
      
      for (let i = 0; i < keys.length; i++) {
        if (values[i]) {
          try {
            const cacheEntry = this.decrypt(values[i]);
            const decompressed = this.decompress(cacheEntry.data, cacheEntry.compressed);
            
            try {
              results[keys[i]] = JSON.parse(decompressed);
            } catch {
              results[keys[i]] = decompressed;
            }
          } catch (error) {
            this.logger.error('Failed to decrypt batch entry', { key: keys[i], error });
            results[keys[i]] = null;
          }
        } else {
          results[keys[i]] = null;
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error('Failed to execute batch get', error);
      return {};
    }
  }

  /**
   * Clear all encrypted cache entries
   */
  async clear() {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      
      return keys.length;
    } catch (error) {
      this.logger.error('Failed to clear encrypted cache', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      let totalSize = 0;
      let totalEntries = keys.length;
      
      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          totalSize += Buffer.byteLength(value);
        }
      }
      
      return {
        entries: totalEntries,
        sizeBytes: totalSize,
        sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        averageSizeBytes: totalEntries > 0 ? Math.round(totalSize / totalEntries) : 0
      };
    } catch (error) {
      this.logger.error('Failed to get cache statistics', error);
      return null;
    }
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(newKey) {
    try {
      // Get all existing entries
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      const entries = {};
      
      // Decrypt with old key
      for (const key of keys) {
        const shortKey = key.replace(this.keyPrefix, '');
        const value = await this.get(shortKey);
        if (value !== null) {
          entries[shortKey] = value;
        }
      }
      
      // Update master key
      this.masterKey = Buffer.from(newKey, 'hex');
      
      // Re-encrypt with new key
      for (const [key, value] of Object.entries(entries)) {
        await this.set(key, value);
      }
      
      this.logger.info('Cache encryption key rotated successfully', {
        entriesRotated: Object.keys(entries).length
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to rotate encryption key', error);
      return false;
    }
  }
}

export default EncryptedCache;