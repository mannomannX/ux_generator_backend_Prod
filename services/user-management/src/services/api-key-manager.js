/**
 * API Key Management Service
 * Handles creation, validation, rotation, and revocation of API keys
 */

import crypto from 'crypto';
import { SecurityUtils } from '../utils/security.js';

export class ApiKeyManager {
  constructor(logger, mongoClient, redisClient, auditLogger) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.auditLogger = auditLogger;
    
    // Configuration
    this.config = {
      keyPrefix: process.env.API_KEY_PREFIX || 'uxf',
      maxKeysPerUser: parseInt(process.env.MAX_API_KEYS_PER_USER) || 10,
      keyLength: 32,
      hashAlgorithm: 'sha256',
      cacheExpiry: 3600, // 1 hour
      rotationPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
      expiryWarningDays: 14
    };
    
    // Initialize database
    this.initializeDatabase();
  }

  /**
   * Initialize database collections and indexes
   */
  async initializeDatabase() {
    try {
      const db = this.mongoClient.getDb();
      
      // Create indexes for API keys collection
      await db.collection('api_keys').createIndexes([
        { key: { userId: 1 } },
        { key: { keyHash: 1 }, unique: true },
        { key: { status: 1 } },
        { key: { expiresAt: 1 } },
        { key: { lastUsedAt: 1 } },
        { key: { createdAt: 1 } },
        // TTL index for automatic deletion of expired keys
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
      ]);
      
      // Create indexes for API key usage stats
      await db.collection('api_key_usage').createIndexes([
        { key: { keyId: 1, timestamp: -1 } },
        { key: { userId: 1, timestamp: -1 } },
        { key: { timestamp: 1 }, expireAfterSeconds: 2592000 } // 30 days
      ]);
      
      this.logger.info('API Key Manager database initialized');
    } catch (error) {
      this.logger.error('Failed to initialize API Key Manager database', error);
    }
  }

  /**
   * Create a new API key
   */
  async createApiKey(userId, options = {}) {
    const {
      name = 'API Key',
      scopes = [],
      expiresIn = null, // null means no expiration
      ipWhitelist = [],
      rateLimit = null,
      metadata = {}
    } = options;
    
    try {
      // Check user's API key limit
      const existingKeysCount = await this.getUserKeyCount(userId);
      if (existingKeysCount >= this.config.maxKeysPerUser) {
        throw new Error(`API key limit reached (${this.config.maxKeysPerUser})`);
      }
      
      // Generate API key
      const rawKey = this.generateApiKey();
      const keyHash = this.hashApiKey(rawKey);
      
      // Create key document
      const apiKeyDoc = {
        id: `apikey_${crypto.randomBytes(8).toString('hex')}`,
        userId,
        name,
        keyHash,
        prefix: rawKey.substring(0, 10) + '...',
        scopes,
        status: 'active',
        ipWhitelist,
        rateLimit,
        metadata,
        createdAt: new Date(),
        lastUsedAt: null,
        lastRotatedAt: null,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : null,
        usageCount: 0
      };
      
      // Store in database
      const db = this.mongoClient.getDb();
      await db.collection('api_keys').insertOne(apiKeyDoc);
      
      // Log creation
      await this.auditLogger.log(this.auditLogger.eventTypes.API_KEY_CREATED, {
        userId,
        keyId: apiKeyDoc.id,
        name,
        scopes
      });
      
      // Return key info (only time the raw key is returned)
      return {
        id: apiKeyDoc.id,
        key: rawKey,
        name,
        scopes,
        expiresAt: apiKeyDoc.expiresAt,
        createdAt: apiKeyDoc.createdAt
      };
      
    } catch (error) {
      this.logger.error('Failed to create API key', { userId, error });
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  async validateApiKey(rawKey) {
    try {
      // Check cache first
      const cachedKey = await this.getCachedKey(rawKey);
      if (cachedKey) {
        return cachedKey;
      }
      
      // Hash the key
      const keyHash = this.hashApiKey(rawKey);
      
      // Find key in database
      const db = this.mongoClient.getDb();
      const apiKey = await db.collection('api_keys').findOne({
        keyHash,
        status: 'active'
      });
      
      if (!apiKey) {
        return { valid: false, reason: 'Invalid or inactive API key' };
      }
      
      // Check expiration
      if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
        await this.expireApiKey(apiKey.id);
        return { valid: false, reason: 'API key expired' };
      }
      
      // Check IP whitelist
      if (apiKey.ipWhitelist && apiKey.ipWhitelist.length > 0) {
        // This check would be done with the actual request IP
        // For now, we'll skip this validation
      }
      
      // Update usage stats
      await this.updateUsageStats(apiKey);
      
      // Cache the key
      await this.cacheKey(rawKey, apiKey);
      
      return {
        valid: true,
        userId: apiKey.userId,
        keyId: apiKey.id,
        scopes: apiKey.scopes,
        rateLimit: apiKey.rateLimit,
        metadata: apiKey.metadata
      };
      
    } catch (error) {
      this.logger.error('Failed to validate API key', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Rotate an API key
   */
  async rotateApiKey(userId, keyId, options = {}) {
    try {
      const db = this.mongoClient.getDb();
      
      // Find existing key
      const existingKey = await db.collection('api_keys').findOne({
        id: keyId,
        userId,
        status: 'active'
      });
      
      if (!existingKey) {
        throw new Error('API key not found or inactive');
      }
      
      // Generate new key
      const newRawKey = this.generateApiKey();
      const newKeyHash = this.hashApiKey(newRawKey);
      
      // Create new key document with same settings
      const newApiKey = {
        ...existingKey,
        id: `apikey_${crypto.randomBytes(8).toString('hex')}`,
        keyHash: newKeyHash,
        prefix: newRawKey.substring(0, 10) + '...',
        createdAt: new Date(),
        lastRotatedAt: new Date(),
        parentKeyId: keyId,
        usageCount: 0
      };
      
      // Insert new key
      await db.collection('api_keys').insertOne(newApiKey);
      
      // Mark old key for expiration (grace period)
      const gracePeriod = options.gracePeriod || 24 * 60 * 60 * 1000; // 24 hours
      await db.collection('api_keys').updateOne(
        { id: keyId },
        {
          $set: {
            status: 'rotating',
            rotatedTo: newApiKey.id,
            expiresAt: new Date(Date.now() + gracePeriod)
          }
        }
      );
      
      // Clear cache for old key
      await this.clearKeyCache(existingKey.keyHash);
      
      // Log rotation
      await this.auditLogger.log(this.auditLogger.eventTypes.API_KEY_ROTATED, {
        userId,
        oldKeyId: keyId,
        newKeyId: newApiKey.id
      });
      
      return {
        id: newApiKey.id,
        key: newRawKey,
        name: newApiKey.name,
        scopes: newApiKey.scopes,
        expiresAt: newApiKey.expiresAt,
        createdAt: newApiKey.createdAt
      };
      
    } catch (error) {
      this.logger.error('Failed to rotate API key', { userId, keyId, error });
      throw error;
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(userId, keyId, reason = 'User requested') {
    try {
      const db = this.mongoClient.getDb();
      
      const result = await db.collection('api_keys').updateOne(
        { id: keyId, userId },
        {
          $set: {
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: reason
          }
        }
      );
      
      if (result.modifiedCount === 0) {
        throw new Error('API key not found');
      }
      
      // Clear cache
      const key = await db.collection('api_keys').findOne({ id: keyId });
      if (key) {
        await this.clearKeyCache(key.keyHash);
      }
      
      // Log revocation
      await this.auditLogger.log(this.auditLogger.eventTypes.API_KEY_REVOKED, {
        userId,
        keyId,
        reason
      });
      
      return { success: true };
      
    } catch (error) {
      this.logger.error('Failed to revoke API key', { userId, keyId, error });
      throw error;
    }
  }

  /**
   * List user's API keys
   */
  async listUserApiKeys(userId, options = {}) {
    const {
      includeRevoked = false,
      includeExpired = false,
      limit = 100,
      skip = 0
    } = options;
    
    try {
      const db = this.mongoClient.getDb();
      
      const query = { userId };
      const statusFilters = ['active'];
      
      if (includeRevoked) statusFilters.push('revoked');
      if (includeExpired) statusFilters.push('expired');
      
      query.status = { $in: statusFilters };
      
      const keys = await db.collection('api_keys')
        .find(query)
        .project({
          keyHash: 0 // Don't expose the hash
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      const total = await db.collection('api_keys').countDocuments(query);
      
      return {
        keys,
        total,
        page: Math.floor(skip / limit) + 1,
        pages: Math.ceil(total / limit)
      };
      
    } catch (error) {
      this.logger.error('Failed to list API keys', { userId, error });
      throw error;
    }
  }

  /**
   * Get API key usage statistics
   */
  async getKeyUsageStats(userId, keyId, period = '7d') {
    try {
      const db = this.mongoClient.getDb();
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }
      
      // Aggregate usage stats
      const stats = await db.collection('api_key_usage').aggregate([
        {
          $match: {
            keyId,
            userId,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              hour: { $hour: '$timestamp' }
            },
            requests: { $sum: 1 },
            errors: { $sum: { $cond: ['$error', 1, 0] } }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            hourly: {
              $push: {
                hour: '$_id.hour',
                requests: '$requests',
                errors: '$errors'
              }
            },
            totalRequests: { $sum: '$requests' },
            totalErrors: { $sum: '$errors' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();
      
      return {
        period,
        startDate,
        endDate,
        stats
      };
      
    } catch (error) {
      this.logger.error('Failed to get key usage stats', { userId, keyId, error });
      throw error;
    }
  }

  /**
   * Check for keys needing rotation
   */
  async checkKeysForRotation() {
    try {
      const db = this.mongoClient.getDb();
      const rotationDate = new Date(Date.now() - this.config.rotationPeriod);
      
      const keysNeedingRotation = await db.collection('api_keys').find({
        status: 'active',
        $or: [
          { lastRotatedAt: { $lt: rotationDate } },
          { lastRotatedAt: null, createdAt: { $lt: rotationDate } }
        ]
      }).toArray();
      
      return keysNeedingRotation;
      
    } catch (error) {
      this.logger.error('Failed to check keys for rotation', error);
      return [];
    }
  }

  /**
   * Check for expiring keys
   */
  async checkExpiringKeys() {
    try {
      const db = this.mongoClient.getDb();
      const warningDate = new Date(Date.now() + this.config.expiryWarningDays * 24 * 60 * 60 * 1000);
      
      const expiringKeys = await db.collection('api_keys').find({
        status: 'active',
        expiresAt: {
          $ne: null,
          $lt: warningDate,
          $gt: new Date()
        }
      }).toArray();
      
      return expiringKeys;
      
    } catch (error) {
      this.logger.error('Failed to check expiring keys', error);
      return [];
    }
  }

  /**
   * Generate a new API key
   */
  generateApiKey() {
    const random = crypto.randomBytes(this.config.keyLength).toString('hex');
    return `${this.config.keyPrefix}_${random}`;
  }

  /**
   * Hash an API key
   */
  hashApiKey(rawKey) {
    return crypto
      .createHash(this.config.hashAlgorithm)
      .update(rawKey)
      .digest('hex');
  }

  /**
   * Update usage statistics
   */
  async updateUsageStats(apiKey) {
    try {
      const db = this.mongoClient.getDb();
      
      // Update last used time and usage count
      await db.collection('api_keys').updateOne(
        { id: apiKey.id },
        {
          $set: { lastUsedAt: new Date() },
          $inc: { usageCount: 1 }
        }
      );
      
      // Record usage event
      await db.collection('api_key_usage').insertOne({
        keyId: apiKey.id,
        userId: apiKey.userId,
        timestamp: new Date(),
        endpoint: null, // Would be filled with actual endpoint
        statusCode: null, // Would be filled with actual response
        responseTime: null // Would be filled with actual timing
      });
      
    } catch (error) {
      this.logger.error('Failed to update usage stats', error);
      // Don't throw - stats update shouldn't break the request
    }
  }

  /**
   * Get cached API key
   */
  async getCachedKey(rawKey) {
    try {
      const keyHash = this.hashApiKey(rawKey);
      const cached = await this.redisClient.get(`apikey:${keyHash}`);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached key', error);
      return null;
    }
  }

  /**
   * Cache API key
   */
  async cacheKey(rawKey, apiKey) {
    try {
      const keyHash = this.hashApiKey(rawKey);
      const cacheData = {
        valid: true,
        userId: apiKey.userId,
        keyId: apiKey.id,
        scopes: apiKey.scopes,
        rateLimit: apiKey.rateLimit,
        metadata: apiKey.metadata
      };
      
      await this.redisClient.setex(
        `apikey:${keyHash}`,
        this.config.cacheExpiry,
        JSON.stringify(cacheData)
      );
    } catch (error) {
      this.logger.error('Failed to cache key', error);
      // Don't throw - caching failure shouldn't break the request
    }
  }

  /**
   * Clear cached API key
   */
  async clearKeyCache(keyHash) {
    try {
      await this.redisClient.del(`apikey:${keyHash}`);
    } catch (error) {
      this.logger.error('Failed to clear key cache', error);
    }
  }

  /**
   * Get user's API key count
   */
  async getUserKeyCount(userId) {
    const db = this.mongoClient.getDb();
    return await db.collection('api_keys').countDocuments({
      userId,
      status: 'active'
    });
  }

  /**
   * Expire an API key
   */
  async expireApiKey(keyId) {
    const db = this.mongoClient.getDb();
    await db.collection('api_keys').updateOne(
      { id: keyId },
      {
        $set: {
          status: 'expired',
          expiredAt: new Date()
        }
      }
    );
  }
}

export default ApiKeyManager;