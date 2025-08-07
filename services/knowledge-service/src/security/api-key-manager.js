// ==========================================
// KNOWLEDGE SERVICE - Secure API Key Management
// SECURITY FIX: Secure storage and rotation of API keys
// ==========================================

import crypto from 'crypto';
import { Logger } from '@ux-flow/common';

/**
 * Secure API Key Management with encryption, rotation, and monitoring
 */
export class ApiKeyManager {
  constructor(logger = new Logger('ApiKeyManager'), redisClient, config = {}) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.config = {
      encryptionKey: config.encryptionKey || this.generateDefaultKey(),
      rotationInterval: config.rotationInterval || 24 * 60 * 60 * 1000, // 24 hours
      maxKeyAge: config.maxKeyAge || 7 * 24 * 60 * 60 * 1000, // 7 days
      backupKeyCount: config.backupKeyCount || 3,
      ...config
    };
    
    this.keyCache = new Map();
    this.rotationTimer = null;
    this.keyUsage = new Map();
    
    // Start automatic key rotation monitoring
    this.startKeyRotation();
  }

  /**
   * Generate default encryption key if not provided
   */
  generateDefaultKey() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Encryption key must be provided in production');
    }
    
    const key = crypto.randomBytes(32);
    this.logger.warn('Using generated encryption key - not suitable for production');
    return key;
  }

  /**
   * SECURITY FIX: Encrypt API key with AES-256-GCM
   */
  encryptApiKey(apiKey) {
    try {
      // Generate secure random IV for each encryption
      const iv = crypto.randomBytes(12);
      
      // Use secure createCipherGCM with proper IV
      const cipher = crypto.createCipherGCM('aes-256-gcm', this.config.encryptionKey, iv);
      cipher.setAAD(Buffer.from('embedding-api-key'));
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm',
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('API key encryption failed', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  /**
   * SECURITY FIX: Decrypt API key with proper validation
   */
  decryptApiKey(encryptedData) {
    try {
      const { encrypted, iv, authTag, algorithm = 'aes-256-gcm' } = encryptedData;
      
      // Validate required fields
      if (!encrypted || !iv || !authTag) {
        throw new Error('Missing required encryption fields');
      }
      
      // Convert IV back to buffer
      const ivBuffer = Buffer.from(iv, 'hex');
      
      // Use secure createDecipherGCM with proper IV
      const decipher = crypto.createDecipherGCM(algorithm, this.config.encryptionKey, ivBuffer);
      decipher.setAAD(Buffer.from('embedding-api-key'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('API key decryption failed', error);
      throw new Error('Failed to decrypt API key');
    }
  }

  /**
   * Store API key securely with metadata
   */
  async storeApiKey(provider, apiKey, metadata = {}) {
    try {
      const encryptedKey = this.encryptApiKey(apiKey);
      const keyData = {
        provider,
        encrypted: encryptedKey,
        metadata,
        createdAt: new Date().toISOString(),
        version: this.generateKeyVersion(),
        active: true,
        usage: {
          totalRequests: 0,
          lastUsed: null,
          rateLimitHits: 0,
          errors: 0
        }
      };

      // Store in Redis with expiration
      const keyId = `embedding_api_key:${provider}:${keyData.version}`;
      await this.redisClient.setex(keyId, this.config.maxKeyAge / 1000, JSON.stringify(keyData));
      
      // Update cache
      this.keyCache.set(`${provider}:current`, keyData);
      
      this.logger.info('API key stored securely', {
        provider,
        version: keyData.version,
        keyId: keyId.substring(0, 25) + '...' // Partial key ID for logging
      });
      
      return keyData.version;
    } catch (error) {
      this.logger.error('Failed to store API key', { provider, error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve API key securely
   */
  async getApiKey(provider, version = null) {
    try {
      // Check cache first
      const cacheKey = version ? `${provider}:${version}` : `${provider}:current`;
      let keyData = this.keyCache.get(cacheKey);
      
      if (!keyData) {
        // Load from Redis
        const keyId = version ? 
          `embedding_api_key:${provider}:${version}` : 
          await this.getCurrentKeyId(provider);
          
        if (!keyId) {
          throw new Error(`No API key found for provider: ${provider}`);
        }
        
        const storedData = await this.redisClient.get(keyId);
        if (!storedData) {
          throw new Error(`API key not found in storage: ${keyId}`);
        }
        
        keyData = JSON.parse(storedData);
        this.keyCache.set(cacheKey, keyData);
      }

      if (!keyData.active) {
        throw new Error(`API key is inactive for provider: ${provider}`);
      }

      // Decrypt and return the API key
      const apiKey = this.decryptApiKey(keyData.encrypted);
      
      // Update usage statistics
      await this.updateKeyUsage(provider, keyData.version);
      
      return {
        apiKey,
        version: keyData.version,
        metadata: keyData.metadata
      };
    } catch (error) {
      this.logger.error('Failed to retrieve API key', { provider, version, error: error.message });
      throw error;
    }
  }

  /**
   * Generate unique key version identifier
   */
  generateKeyVersion() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${random}`;
  }

  /**
   * Update key usage statistics
   */
  async updateKeyUsage(provider, version, success = true, type = 'request') {
    try {
      const keyId = `embedding_api_key:${provider}:${version}`;
      const storedData = await this.redisClient.get(keyId);
      
      if (!storedData) return;
      
      const keyData = JSON.parse(storedData);
      const usage = keyData.usage || {};
      
      usage.totalRequests = (usage.totalRequests || 0) + 1;
      usage.lastUsed = new Date().toISOString();
      
      if (!success) {
        usage.errors = (usage.errors || 0) + 1;
      }
      
      if (type === 'rate_limit') {
        usage.rateLimitHits = (usage.rateLimitHits || 0) + 1;
      }

      keyData.usage = usage;
      
      // Update in Redis
      await this.redisClient.setex(keyId, this.config.maxKeyAge / 1000, JSON.stringify(keyData));
      
      // Update cache
      this.keyCache.set(`${provider}:${version}`, keyData);
      
    } catch (error) {
      this.logger.error('Failed to update key usage', { provider, version, error: error.message });
    }
  }

  /**
   * Get current key ID for provider
   */
  async getCurrentKeyId(provider) {
    try {
      const pattern = `embedding_api_key:${provider}:*`;
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length === 0) {
        return null;
      }

      // Sort by creation time and return the newest active key
      const keyDataPromises = keys.map(async key => {
        const data = await this.redisClient.get(key);
        return { key, data: JSON.parse(data) };
      });

      const keyDataList = await Promise.all(keyDataPromises);
      const activeKeys = keyDataList.filter(item => item.data.active);
      
      if (activeKeys.length === 0) {
        return null;
      }

      activeKeys.sort((a, b) => new Date(b.data.createdAt) - new Date(a.data.createdAt));
      return activeKeys[0].key;
      
    } catch (error) {
      this.logger.error('Failed to get current key ID', { provider, error: error.message });
      return null;
    }
  }

  /**
   * Validate API key health and usage patterns
   */
  async validateApiKeyHealth(provider) {
    try {
      const keyData = await this.getCurrentKeyData(provider);
      if (!keyData) {
        return { healthy: false, reason: 'No key found' };
      }

      const usage = keyData.usage || {};
      const createdAt = new Date(keyData.createdAt);
      const keyAge = Date.now() - createdAt.getTime();
      
      // Check if key is too old
      if (keyAge > this.config.maxKeyAge) {
        return { 
          healthy: false, 
          reason: 'Key expired',
          keyAge,
          maxAge: this.config.maxKeyAge
        };
      }

      // Check error rate
      const errorRate = usage.totalRequests > 0 ? usage.errors / usage.totalRequests : 0;
      if (errorRate > 0.1) { // 10% error rate threshold
        return {
          healthy: false,
          reason: 'High error rate',
          errorRate,
          totalRequests: usage.totalRequests,
          errors: usage.errors
        };
      }

      return { 
        healthy: true, 
        usage,
        keyAge,
        lastUsed: usage.lastUsed
      };
    } catch (error) {
      this.logger.error('API key health validation failed', { provider, error: error.message });
      return { healthy: false, reason: 'Validation error', error: error.message };
    }
  }

  /**
   * Get current key data
   */
  async getCurrentKeyData(provider) {
    const keyId = await this.getCurrentKeyId(provider);
    if (!keyId) return null;
    
    const data = await this.redisClient.get(keyId);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Start automatic key rotation monitoring
   */
  startKeyRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        await this.checkKeyHealth();
      } catch (error) {
        this.logger.error('Automatic key health check failed', error);
      }
    }, this.config.rotationInterval / 4); // Check every 6 hours if rotation interval is 24 hours

    this.logger.info('Started automatic API key monitoring', {
      rotationInterval: this.config.rotationInterval,
      maxKeyAge: this.config.maxKeyAge
    });
  }

  /**
   * Check health of all managed keys
   */
  async checkKeyHealth() {
    const providers = ['openai', 'google'];
    
    for (const provider of providers) {
      try {
        const health = await this.validateApiKeyHealth(provider);
        
        if (!health.healthy) {
          this.logger.warn('API key health check failed', {
            provider,
            reason: health.reason,
            details: health
          });

          // Log security event for monitoring
          this.logger.audit('API key health issue detected', {
            provider,
            reason: health.reason,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        this.logger.error('Key health check failed', { provider, error: error.message });
      }
    }
  }

  /**
   * Cleanup expired keys and logs
   */
  async cleanup() {
    try {
      // Clean up expired keys would be handled by Redis TTL
      // Clear cache of old entries
      for (const [key, data] of this.keyCache.entries()) {
        if (data.encrypted && data.encrypted.timestamp) {
          const age = Date.now() - data.encrypted.timestamp;
          if (age > this.config.maxKeyAge) {
            this.keyCache.delete(key);
          }
        }
      }

      this.logger.debug('API key cleanup completed');
    } catch (error) {
      this.logger.error('API key cleanup failed', error);
    }
  }

  /**
   * Shutdown key manager
   */
  async shutdown() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    
    await this.cleanup();
    this.keyCache.clear();
    
    this.logger.info('API Key Manager shut down');
  }
}