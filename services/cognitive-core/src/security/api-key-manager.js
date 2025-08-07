// ==========================================
// COGNITIVE-CORE - Secure API Key Management
// ==========================================

import crypto from 'crypto';

/**
 * Secure API Key Management with rotation and encryption
 */
export class ApiKeyManager {
  constructor(logger, redisClient, config = {}) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.config = {
      encryptionKey: this.getEncryptionKey(),
      rotationInterval: config.rotationInterval || 24 * 60 * 60 * 1000, // 24 hours
      maxKeyAge: config.maxKeyAge || 7 * 24 * 60 * 60 * 1000, // 7 days
      backupKeyCount: config.backupKeyCount || 3,
      ...config
    };
    
    this.keyCache = new Map();
    this.rotationTimer = null;
    this.keyUsage = new Map();
    
    this.startKeyRotation();
  }

  /**
   * Get or generate encryption key for API keys
   */
  getEncryptionKey() {
    let key = process.env.API_KEY_ENCRYPTION_KEY;
    
    if (!key) {
      // Generate a new key if not provided (development only)
      if (process.env.NODE_ENV === 'development') {
        key = crypto.randomBytes(32).toString('base64');
        this.logger.warn('Generated temporary API key encryption key - set API_KEY_ENCRYPTION_KEY in production');
      } else {
        throw new Error('API_KEY_ENCRYPTION_KEY environment variable is required in production');
      }
    }
    
    return Buffer.from(key, 'base64');
  }

  /**
   * Encrypt API key
   */
  encryptApiKey(apiKey) {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipher('aes-256-gcm', this.config.encryptionKey);
      cipher.setAAD(Buffer.from('api-key'));
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      this.logger.error('API key encryption failed', error);
      throw new Error('Failed to encrypt API key');
    }
  }

  /**
   * Decrypt API key
   */
  decryptApiKey(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      const decipher = crypto.createDecipher('aes-256-gcm', this.config.encryptionKey);
      decipher.setAAD(Buffer.from('api-key'));
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
   * Store API key securely
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
      const keyId = `api_key:${provider}:${keyData.version}`;
      await this.redisClient.setex(keyId, this.config.maxKeyAge / 1000, JSON.stringify(keyData));
      
      // Update cache
      this.keyCache.set(`${provider}:current`, keyData);
      
      this.logger.info('API key stored securely', {
        provider,
        version: keyData.version,
        keyId: keyId.substring(0, 20) + '...' // Partial key ID for logging
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
          `api_key:${provider}:${version}` : 
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
      this.updateKeyUsage(provider, keyData.version);
      
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
   * Rotate API key for a provider
   */
  async rotateApiKey(provider, newApiKey, reason = 'scheduled_rotation') {
    try {
      this.logger.info('Starting API key rotation', { provider, reason });
      
      // Get current key data
      const currentKey = await this.getCurrentKeyData(provider);
      
      // Store new key
      const newVersion = await this.storeApiKey(provider, newApiKey, {
        rotationReason: reason,
        previousVersion: currentKey?.version,
        rotatedAt: new Date().toISOString()
      });

      // Deactivate old key after a grace period
      if (currentKey) {
        setTimeout(async () => {
          await this.deactivateApiKey(provider, currentKey.version);
        }, 30000); // 30 second grace period
      }

      // Update cache
      this.keyCache.delete(`${provider}:current`);
      
      // Log rotation
      await this.logKeyRotation(provider, currentKey?.version, newVersion, reason);
      
      this.logger.info('API key rotation completed', {
        provider,
        oldVersion: currentKey?.version,
        newVersion,
        reason
      });
      
      return newVersion;
    } catch (error) {
      this.logger.error('API key rotation failed', { provider, reason, error: error.message });
      throw error;
    }
  }

  /**
   * Validate API key health and usage
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

      // Check rate limit hits
      const rateLimitRate = usage.totalRequests > 0 ? usage.rateLimitHits / usage.totalRequests : 0;
      if (rateLimitRate > 0.05) { // 5% rate limit threshold
        return {
          healthy: false,
          reason: 'Frequent rate limiting',
          rateLimitRate,
          rateLimitHits: usage.rateLimitHits
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
   * Update key usage statistics
   */
  async updateKeyUsage(provider, version, type = 'request', success = true) {
    try {
      const keyId = `api_key:${provider}:${version}`;
      const keyData = JSON.parse(await this.redisClient.get(keyId));
      
      if (!keyData) return;

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
      
      // Log high error rates
      if (usage.errors > 10 && usage.errors % 10 === 0) {
        this.logger.warn('High error count for API key', {
          provider,
          version,
          errors: usage.errors,
          totalRequests: usage.totalRequests
        });
      }
    } catch (error) {
      this.logger.error('Failed to update key usage', { provider, version, error: error.message });
    }
  }

  /**
   * Start automatic key rotation
   */
  startKeyRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        await this.checkAndRotateKeys();
      } catch (error) {
        this.logger.error('Automatic key rotation check failed', error);
      }
    }, this.config.rotationInterval / 4); // Check every 6 hours if rotation interval is 24 hours

    this.logger.info('Started automatic API key rotation', {
      rotationInterval: this.config.rotationInterval,
      maxKeyAge: this.config.maxKeyAge
    });
  }

  /**
   * Check all keys and rotate if necessary
   */
  async checkAndRotateKeys() {
    const providers = ['gemini', 'openai', 'anthropic'];
    
    for (const provider of providers) {
      try {
        const health = await this.validateApiKeyHealth(provider);
        
        if (!health.healthy) {
          this.logger.warn('API key health check failed - rotation needed', {
            provider,
            reason: health.reason,
            details: health
          });

          // For production, you would need a secure way to get new keys
          // This is a placeholder that would need to be implemented based on your key management strategy
          if (process.env.NODE_ENV !== 'production') {
            this.logger.info('Automatic key rotation disabled in production - manual intervention required', {
              provider,
              reason: health.reason
            });
          }
        }
      } catch (error) {
        this.logger.error('Key health check failed', { provider, error: error.message });
      }
    }
  }

  /**
   * Generate unique key version
   */
  generateKeyVersion() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${random}`;
  }

  /**
   * Get current key ID for provider
   */
  async getCurrentKeyId(provider) {
    // Find the most recent active key
    const pattern = `api_key:${provider}:*`;
    const keys = await this.redisClient.keys(pattern);
    
    if (keys.length === 0) {
      return null;
    }

    // Sort by creation time and return the newest
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
   * Deactivate API key
   */
  async deactivateApiKey(provider, version) {
    try {
      const keyId = `api_key:${provider}:${version}`;
      const keyData = JSON.parse(await this.redisClient.get(keyId));
      
      if (keyData) {
        keyData.active = false;
        keyData.deactivatedAt = new Date().toISOString();
        
        await this.redisClient.setex(keyId, this.config.maxKeyAge / 1000, JSON.stringify(keyData));
        
        // Remove from cache
        this.keyCache.delete(`${provider}:${version}`);
        this.keyCache.delete(`${provider}:current`);
        
        this.logger.info('API key deactivated', { provider, version });
      }
    } catch (error) {
      this.logger.error('Failed to deactivate API key', { provider, version, error: error.message });
    }
  }

  /**
   * Log key rotation for audit trail
   */
  async logKeyRotation(provider, oldVersion, newVersion, reason) {
    const logEntry = {
      provider,
      oldVersion,
      newVersion,
      reason,
      timestamp: new Date().toISOString(),
      processId: process.pid
    };

    // Store in Redis for audit trail
    const logKey = `key_rotation_log:${provider}:${Date.now()}`;
    await this.redisClient.setex(logKey, 30 * 24 * 60 * 60, JSON.stringify(logEntry)); // 30 days

    this.logger.audit('API key rotation', logEntry);
  }

  /**
   * Cleanup expired keys and logs
   */
  async cleanup() {
    try {
      // Clean up expired rotation logs
      const logPattern = 'key_rotation_log:*';
      const logs = await this.redisClient.keys(logPattern);
      
      for (const logKey of logs) {
        const ttl = await this.redisClient.ttl(logKey);
        if (ttl === -1) { // No expiration set
          await this.redisClient.expire(logKey, 30 * 24 * 60 * 60); // Set 30 day expiration
        }
      }

      this.logger.debug('API key cleanup completed', { processedLogs: logs.length });
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