/**
 * Cryptography Utilities
 * Handles encryption/decryption for sensitive data like API keys
 */

import crypto from 'crypto';
import { ErrorFactory } from './errors.js';
import { Logger } from '@ux-flow/common';

const logger = new Logger('crypto-utils');

class CryptoManager {
  constructor(config = {}) {
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    this.iterations = config.iterations || 100000;
    
    // Derive encryption key from master secret
    this.masterSecret = process.env.ENCRYPTION_MASTER_KEY || this.generateMasterKey();
    this.encryptionKey = this.deriveKey(this.masterSecret);
  }

  /**
   * Generate a master key if not provided
   */
  generateMasterKey() {
    if (process.env.NODE_ENV === 'production') {
      throw ErrorFactory.configuration(
        'ENCRYPTION_MASTER_KEY',
        'Master encryption key must be set in production'
      );
    }
    // Generate a deterministic key for development
    return crypto.createHash('sha256')
      .update('knowledge-service-dev-key')
      .digest();
  }

  /**
   * Derive encryption key from master secret
   */
  deriveKey(masterSecret, salt = null) {
    const useSalt = salt || crypto.randomBytes(this.saltLength);
    const key = crypto.pbkdf2Sync(
      masterSecret,
      useSalt,
      this.iterations,
      this.keyLength,
      'sha256'
    );
    return { key, salt: useSalt };
  }

  /**
   * Encrypt sensitive data (like API keys)
   */
  encrypt(plaintext) {
    try {
      if (!plaintext) {
        return null;
      }

      // Generate random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey.key,
        iv
      );

      // Encrypt the plaintext
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt, iv, tag, and encrypted data
      const combined = Buffer.concat([
        this.encryptionKey.salt,
        iv,
        tag,
        encrypted
      ]);

      // Return base64 encoded string
      return combined.toString('base64');
    } catch (error) {
      throw ErrorFactory.configuration('encryption', `Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    try {
      if (!encryptedData) {
        return null;
      }

      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const salt = combined.slice(0, this.saltLength);
      const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
      const tag = combined.slice(
        this.saltLength + this.ivLength,
        this.saltLength + this.ivLength + this.tagLength
      );
      const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);

      // Derive key with the stored salt
      const { key } = this.deriveKey(this.masterSecret, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw ErrorFactory.configuration('decryption', `Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash sensitive data for comparison (one-way)
   */
  hash(data) {
    if (!data) {
      return null;
    }
    
    const salt = crypto.randomBytes(this.saltLength);
    const hash = crypto.pbkdf2Sync(
      data,
      salt,
      this.iterations,
      64,
      'sha512'
    );
    
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  /**
   * Verify hashed data
   */
  verifyHash(data, hashedData) {
    if (!data || !hashedData) {
      return false;
    }

    const [salt, originalHash] = hashedData.split(':');
    const hash = crypto.pbkdf2Sync(
      data,
      Buffer.from(salt, 'hex'),
      this.iterations,
      64,
      'sha512'
    );

    return crypto.timingSafeEqual(
      Buffer.from(originalHash, 'hex'),
      hash
    );
  }

  /**
   * Generate a secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure API key
   */
  generateApiKey(prefix = 'knw') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(24).toString('base64url');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Encrypt object properties
   */
  encryptObject(obj, fieldsToEncrypt) {
    const encrypted = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (obj[field]) {
        encrypted[field] = this.encrypt(obj[field]);
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt object properties
   */
  decryptObject(obj, fieldsToDecrypt) {
    const decrypted = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (obj[field]) {
        try {
          decrypted[field] = this.decrypt(obj[field]);
        } catch (error) {
          // Log error but don't expose decryption failures
          logger.error('Failed to decrypt field', { fieldType: 'sensitive_field' }, error);
          decrypted[field] = null;
        }
      }
    }
    
    return decrypted;
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(data, oldMasterSecret) {
    try {
      // Create temporary instance with old key
      const oldCrypto = new CryptoManager({
        masterSecret: oldMasterSecret
      });

      // Decrypt with old key
      const decrypted = oldCrypto.decrypt(data);

      // Encrypt with new key
      return this.encrypt(decrypted);
    } catch (error) {
      throw ErrorFactory.configuration('keyRotation', `Key rotation failed: ${error.message}`);
    }
  }
}

/**
 * API Key Manager
 * Handles API key storage and validation
 */
export class ApiKeyManager {
  constructor(mongoClient, redisClient, logger) {
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.logger = logger;
    this.crypto = new CryptoManager();
    this.collection = 'api_keys';
  }

  /**
   * Store API key securely
   */
  async storeApiKey(provider, apiKey, metadata = {}) {
    try {
      const db = this.mongoClient.getDb();
      
      // Encrypt the API key
      const encryptedKey = this.crypto.encrypt(apiKey);
      
      // Create hash for quick lookup
      const keyHash = this.crypto.hash(apiKey);
      
      // Store in database
      const document = {
        provider,
        encryptedKey,
        keyHash,
        metadata: {
          ...metadata,
          createdAt: new Date(),
          lastUsed: null,
          usageCount: 0
        }
      };

      await db.collection(this.collection).insertOne(document);
      
      // Cache in Redis (encrypted)
      const cacheKey = `api_key:${provider}`;
      await this.redisClient.setex(
        cacheKey,
        3600, // 1 hour cache
        encryptedKey
      );

      this.logger.info('API key stored securely', { provider });
      
      return document._id;
    } catch (error) {
      this.logger.error('Failed to store API key', error);
      throw error;
    }
  }

  /**
   * Retrieve API key
   */
  async getApiKey(provider) {
    try {
      // Check Redis cache first
      const cacheKey = `api_key:${provider}`;
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        return this.crypto.decrypt(cached);
      }

      // Get from database
      const db = this.mongoClient.getDb();
      const document = await db.collection(this.collection).findOne(
        { provider },
        { sort: { 'metadata.createdAt': -1 } }
      );

      if (!document) {
        return null;
      }

      // Decrypt the key
      const apiKey = this.crypto.decrypt(document.encryptedKey);

      // Update cache
      await this.redisClient.setex(cacheKey, 3600, document.encryptedKey);

      // Update usage stats
      await db.collection(this.collection).updateOne(
        { _id: document._id },
        {
          $set: { 'metadata.lastUsed': new Date() },
          $inc: { 'metadata.usageCount': 1 }
        }
      );

      return apiKey;
    } catch (error) {
      this.logger.error('Failed to retrieve API key', error);
      throw error;
    }
  }

  /**
   * Update API key
   */
  async updateApiKey(provider, newApiKey) {
    try {
      const db = this.mongoClient.getDb();
      
      // Encrypt new key
      const encryptedKey = this.crypto.encrypt(newApiKey);
      const keyHash = this.crypto.hash(newApiKey);

      // Update in database
      const result = await db.collection(this.collection).updateOne(
        { provider },
        {
          $set: {
            encryptedKey,
            keyHash,
            'metadata.updatedAt': new Date()
          }
        }
      );

      if (result.modifiedCount === 0) {
        // Key doesn't exist, create it
        return this.storeApiKey(provider, newApiKey);
      }

      // Invalidate cache
      const cacheKey = `api_key:${provider}`;
      await this.redisClient.del(cacheKey);

      this.logger.info('API key updated', { provider });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to update API key', error);
      throw error;
    }
  }

  /**
   * Delete API key
   */
  async deleteApiKey(provider) {
    try {
      const db = this.mongoClient.getDb();
      
      // Delete from database
      await db.collection(this.collection).deleteOne({ provider });

      // Remove from cache
      const cacheKey = `api_key:${provider}`;
      await this.redisClient.del(cacheKey);

      this.logger.info('API key deleted', { provider });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to delete API key', error);
      throw error;
    }
  }

  /**
   * List all stored API key providers
   */
  async listProviders() {
    try {
      const db = this.mongoClient.getDb();
      
      const providers = await db.collection(this.collection)
        .find({}, { projection: { provider: 1, metadata: 1 } })
        .toArray();

      return providers.map(p => ({
        provider: p.provider,
        createdAt: p.metadata.createdAt,
        lastUsed: p.metadata.lastUsed,
        usageCount: p.metadata.usageCount
      }));
    } catch (error) {
      this.logger.error('Failed to list API key providers', error);
      throw error;
    }
  }

  /**
   * Validate API key format
   */
  validateApiKeyFormat(apiKey, provider) {
    const patterns = {
      openai: /^sk-[A-Za-z0-9]{48}$/,
      google: /^[A-Za-z0-9_-]{39}$/,
      anthropic: /^sk-ant-[A-Za-z0-9]{95}$/,
      cohere: /^[A-Za-z0-9]{40}$/
    };

    const pattern = patterns[provider];
    if (!pattern) {
      // Unknown provider, skip validation
      return true;
    }

    return pattern.test(apiKey);
  }
}

// Export singleton instance
let cryptoInstance = null;

export function getCryptoManager(config) {
  if (!cryptoInstance) {
    cryptoInstance = new CryptoManager(config);
  }
  return cryptoInstance;
}

export { CryptoManager };
export default {
  CryptoManager,
  ApiKeyManager,
  getCryptoManager
};