// ==========================================
// COGNITIVE-CORE - Conversation Data Encryption
// ==========================================

import crypto from 'crypto';

/**
 * Field-level encryption for sensitive conversation data
 */
export class ConversationEncryption {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000,
      keyLength: 32,
      ivLength: 12,
      tagLength: 16,
      ...config
    };
    
    this.encryptionKey = this.deriveEncryptionKey();
    this.sensitiveFields = [
      'message', 
      'response', 
      'userInput', 
      'aiResponse',
      'imageData',
      'systemPrompt',
      'context'
    ];
  }

  /**
   * Derive encryption key from master key
   */
  deriveEncryptionKey() {
    const masterKey = process.env.DB_ENCRYPTION_KEY;
    
    if (!masterKey) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn('No DB_ENCRYPTION_KEY provided - using temporary key for development');
        return crypto.randomBytes(this.config.keyLength);
      } else {
        throw new Error('DB_ENCRYPTION_KEY environment variable is required for production');
      }
    }

    // Derive key using PBKDF2
    const salt = Buffer.from('ux-flow-conversations', 'utf8');
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.config.iterations,
      this.config.keyLength,
      'sha256'
    );
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data) {
    try {
      if (!data || typeof data !== 'string') {
        return { encrypted: false, data };
      }

      // Generate random IV
      const iv = crypto.randomBytes(this.config.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipher(this.config.algorithm, this.encryptionKey);
      
      // Set additional authenticated data (AAD)
      const aad = Buffer.from('conversation-data', 'utf8');
      cipher.setAAD(aad);
      
      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: true,
        data: encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: this.config.algorithm,
        version: '1.0'
      };
    } catch (error) {
      this.logger.error('Data encryption failed', {
        error: error.message,
        dataLength: data?.length
      });
      throw new Error('Failed to encrypt conversation data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedObj) {
    try {
      if (!encryptedObj || !encryptedObj.encrypted) {
        return encryptedObj?.data || encryptedObj;
      }

      const { data, iv, authTag, algorithm } = encryptedObj;
      
      if (!data || !iv || !authTag) {
        throw new Error('Invalid encrypted data format');
      }

      // Create decipher
      const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
      
      // Set additional authenticated data (AAD)
      const aad = Buffer.from('conversation-data', 'utf8');
      decipher.setAAD(aad);
      
      // Set auth tag
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      
      // Decrypt data
      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Data decryption failed', {
        error: error.message,
        hasData: !!encryptedObj?.data,
        hasIv: !!encryptedObj?.iv,
        hasAuthTag: !!encryptedObj?.authTag
      });
      throw new Error('Failed to decrypt conversation data');
    }
  }

  /**
   * Encrypt conversation document before saving
   */
  encryptConversation(conversation) {
    try {
      const encrypted = { ...conversation };

      // Encrypt sensitive fields
      for (const field of this.sensitiveFields) {
        if (conversation[field]) {
          encrypted[field] = this.encrypt(conversation[field]);
        }
      }

      // Handle nested objects
      if (conversation.messages && Array.isArray(conversation.messages)) {
        encrypted.messages = conversation.messages.map(message => ({
          ...message,
          content: this.encrypt(message.content),
          response: message.response ? this.encrypt(message.response) : message.response
        }));
      }

      // Handle context objects
      if (conversation.context && typeof conversation.context === 'object') {
        encrypted.context = {};
        for (const [key, value] of Object.entries(conversation.context)) {
          encrypted.context[key] = typeof value === 'string' ? this.encrypt(value) : value;
        }
      }

      // Add encryption metadata
      encrypted._encryption = {
        version: '1.0',
        encryptedAt: new Date().toISOString(),
        algorithm: this.config.algorithm,
        fields: this.sensitiveFields
      };

      return encrypted;
    } catch (error) {
      this.logger.error('Conversation encryption failed', {
        error: error.message,
        conversationId: conversation.id || conversation._id
      });
      throw error;
    }
  }

  /**
   * Decrypt conversation document after loading
   */
  decryptConversation(encryptedConversation) {
    try {
      if (!encryptedConversation._encryption) {
        // Not encrypted, return as-is
        return encryptedConversation;
      }

      const decrypted = { ...encryptedConversation };

      // Decrypt sensitive fields
      for (const field of this.sensitiveFields) {
        if (encryptedConversation[field]) {
          decrypted[field] = this.decrypt(encryptedConversation[field]);
        }
      }

      // Handle nested objects
      if (encryptedConversation.messages && Array.isArray(encryptedConversation.messages)) {
        decrypted.messages = encryptedConversation.messages.map(message => ({
          ...message,
          content: this.decrypt(message.content),
          response: message.response ? this.decrypt(message.response) : message.response
        }));
      }

      // Handle context objects
      if (encryptedConversation.context && typeof encryptedConversation.context === 'object') {
        decrypted.context = {};
        for (const [key, value] of Object.entries(encryptedConversation.context)) {
          decrypted.context[key] = typeof value === 'object' && value.encrypted ? 
            this.decrypt(value) : value;
        }
      }

      // Remove encryption metadata for clean object
      delete decrypted._encryption;

      return decrypted;
    } catch (error) {
      this.logger.error('Conversation decryption failed', {
        error: error.message,
        conversationId: encryptedConversation.id || encryptedConversation._id
      });
      throw error;
    }
  }

  /**
   * Encrypt multiple conversations in batch
   */
  encryptConversations(conversations) {
    return conversations.map(conversation => {
      try {
        return this.encryptConversation(conversation);
      } catch (error) {
        this.logger.error('Batch encryption failed for conversation', {
          conversationId: conversation.id || conversation._id,
          error: error.message
        });
        // Return original if encryption fails to prevent data loss
        return conversation;
      }
    });
  }

  /**
   * Decrypt multiple conversations in batch
   */
  decryptConversations(encryptedConversations) {
    return encryptedConversations.map(conversation => {
      try {
        return this.decryptConversation(conversation);
      } catch (error) {
        this.logger.error('Batch decryption failed for conversation', {
          conversationId: conversation.id || conversation._id,
          error: error.message
        });
        // Return original if decryption fails
        return conversation;
      }
    });
  }

  /**
   * Migrate existing unencrypted conversations
   */
  async migrateConversations(mongoClient, batchSize = 100) {
    try {
      this.logger.info('Starting conversation encryption migration');
      
      const db = mongoClient.getDb();
      const collection = db.collection('conversations');
      
      // Find unencrypted conversations
      const cursor = collection.find({ _encryption: { $exists: false } });
      const totalCount = await collection.countDocuments({ _encryption: { $exists: false } });
      
      let processedCount = 0;
      let batch = [];

      this.logger.info(`Found ${totalCount} unencrypted conversations to migrate`);

      for await (const conversation of cursor) {
        try {
          const encrypted = this.encryptConversation(conversation);
          batch.push({
            replaceOne: {
              filter: { _id: conversation._id },
              replacement: encrypted
            }
          });

          if (batch.length >= batchSize) {
            await collection.bulkWrite(batch);
            processedCount += batch.length;
            batch = [];
            
            this.logger.info(`Migrated ${processedCount}/${totalCount} conversations`);
          }
        } catch (error) {
          this.logger.error('Failed to migrate conversation', {
            conversationId: conversation._id,
            error: error.message
          });
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        await collection.bulkWrite(batch);
        processedCount += batch.length;
      }

      this.logger.info(`Conversation migration completed: ${processedCount}/${totalCount} conversations migrated`);
      return { total: totalCount, migrated: processedCount };
    } catch (error) {
      this.logger.error('Conversation migration failed', error);
      throw error;
    }
  }

  /**
   * Verify encryption/decryption roundtrip
   */
  verifyEncryption(testData = 'test conversation data') {
    try {
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      if (decrypted !== testData) {
        throw new Error('Encryption verification failed - data mismatch');
      }

      this.logger.debug('Encryption verification passed');
      return true;
    } catch (error) {
      this.logger.error('Encryption verification failed', error);
      throw error;
    }
  }

  /**
   * Get encryption statistics
   */
  async getEncryptionStats(mongoClient) {
    try {
      const db = mongoClient.getDb();
      const collection = db.collection('conversations');
      
      const [total, encrypted, unencrypted] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({ _encryption: { $exists: true } }),
        collection.countDocuments({ _encryption: { $exists: false } })
      ]);

      const encryptionRate = total > 0 ? (encrypted / total * 100).toFixed(2) : 0;

      return {
        total,
        encrypted,
        unencrypted,
        encryptionRate: `${encryptionRate}%`,
        algorithm: this.config.algorithm,
        keyLength: this.config.keyLength
      };
    } catch (error) {
      this.logger.error('Failed to get encryption statistics', error);
      throw error;
    }
  }

  /**
   * Secure data sanitization for logging
   */
  sanitizeForLogging(data) {
    if (typeof data !== 'object' || !data) {
      return '[REDACTED]';
    }

    const sanitized = { ...data };
    
    // Remove sensitive fields
    this.sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[ENCRYPTED]';
      }
    });

    // Handle messages array
    if (sanitized.messages && Array.isArray(sanitized.messages)) {
      sanitized.messages = sanitized.messages.map(msg => ({
        ...msg,
        content: '[ENCRYPTED]',
        response: '[ENCRYPTED]'
      }));
    }

    return sanitized;
  }

  /**
   * Key rotation for encryption key
   */
  async rotateEncryptionKey(newMasterKey) {
    try {
      this.logger.info('Starting encryption key rotation');
      
      const oldKey = this.encryptionKey;
      
      // Derive new key
      const salt = Buffer.from('ux-flow-conversations', 'utf8');
      const newKey = crypto.pbkdf2Sync(
        newMasterKey,
        salt,
        this.config.iterations,
        this.config.keyLength,
        'sha256'
      );

      // Update encryption key
      this.encryptionKey = newKey;
      
      this.logger.info('Encryption key rotation completed');
      
      // Note: This would require re-encrypting all existing data with the new key
      // This is a complex operation that should be carefully planned and executed
      return true;
    } catch (error) {
      this.logger.error('Encryption key rotation failed', error);
      throw error;
    }
  }
}