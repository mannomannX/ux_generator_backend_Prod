// ==========================================
// SERVICES/COGNITIVE-CORE/src/security/backup-manager.js
// ==========================================

import crypto from 'crypto';
import { promisify } from 'util';
import zlib from 'zlib';

/**
 * BackupManager handles conversation data backup, encryption, and recovery
 * for GDPR compliance and disaster recovery scenarios
 */
class BackupManager {
  constructor(logger, mongoClient, redisClient, config = {}) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    this.config = {
      encryptionKey: config.encryptionKey || process.env.BACKUP_ENCRYPTION_KEY,
      compressionLevel: config.compressionLevel || 6,
      backupInterval: config.backupInterval || 24 * 60 * 60 * 1000, // 24 hours
      retentionDays: config.retentionDays || 30,
      maxBackupSize: config.maxBackupSize || 50 * 1024 * 1024, // 50MB
      enableCompression: config.enableCompression !== false,
      enableEncryption: config.enableEncryption !== false
    };

    // Async utilities
    this.gzip = promisify(zlib.gzip);
    this.gunzip = promisify(zlib.gunzip);
    
    // Backup metadata cache
    this.backupMetadata = new Map();
    
    // Start automatic backup if configured
    if (config.enableAutoBackup !== false) {
      this.startAutomaticBackup();
    }

    this.logger.info('BackupManager initialized', {
      compressionEnabled: this.config.enableCompression,
      encryptionEnabled: this.config.enableEncryption,
      retentionDays: this.config.retentionDays
    });
  }

  /**
   * Create encrypted backup of conversation data
   */
  async createConversationBackup(conversationId, options = {}) {
    const startTime = Date.now();
    
    try {
      // Fetch conversation data from MongoDB
      const conversationData = await this.mongoClient.findDocument('conversations', {
        conversationId
      });

      if (!conversationData) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Fetch related performance data
      const performanceData = await this.mongoClient.findDocuments('agent_performance', {
        'metadata.conversationId': conversationId
      });

      // Create backup payload
      const backupPayload = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        conversationId,
        data: {
          conversation: conversationData,
          performance: performanceData,
          metadata: {
            totalMessages: conversationData.conversationHistory?.length || 0,
            agentActions: conversationData.agentHistory?.length || 0,
            state: conversationData.state
          }
        },
        checksum: null // Will be calculated after serialization
      };

      // Serialize data
      let serializedData = JSON.stringify(backupPayload);
      
      // Calculate checksum before compression/encryption
      backupPayload.checksum = crypto
        .createHash('sha256')
        .update(serializedData)
        .digest('hex');
      
      serializedData = JSON.stringify(backupPayload);

      // Compress data if enabled
      let processedData = Buffer.from(serializedData);
      if (this.config.enableCompression) {
        processedData = await this.gzip(processedData, {
          level: this.config.compressionLevel
        });
      }

      // Encrypt data if enabled
      if (this.config.enableEncryption) {
        processedData = this.encryptData(processedData);
      }

      // Check size limits
      if (processedData.length > this.config.maxBackupSize) {
        throw new Error(`Backup size ${processedData.length} exceeds limit ${this.config.maxBackupSize}`);
      }

      // Store backup in Redis with expiration
      const backupKey = `backup:conversation:${conversationId}:${Date.now()}`;
      const ttl = this.config.retentionDays * 24 * 60 * 60; // Convert days to seconds
      
      await this.redisClient.set(backupKey, processedData.toString('base64'), ttl);

      // Store backup metadata
      const metadata = {
        backupKey,
        conversationId,
        timestamp: new Date().toISOString(),
        originalSize: serializedData.length,
        compressedSize: processedData.length,
        compressionRatio: serializedData.length > 0 ? (processedData.length / serializedData.length) : 1,
        encrypted: this.config.enableEncryption,
        compressed: this.config.enableCompression,
        checksum: backupPayload.checksum,
        ttl
      };

      this.backupMetadata.set(conversationId, metadata);
      await this.redisClient.set(`backup:meta:${conversationId}`, metadata, ttl);

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Conversation backup created', {
        conversationId,
        backupKey,
        originalSize: metadata.originalSize,
        compressedSize: metadata.compressedSize,
        compressionRatio: Math.round(metadata.compressionRatio * 100) / 100,
        processingTime,
        encrypted: metadata.encrypted
      });

      return {
        success: true,
        backupKey,
        metadata,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Failed to create conversation backup', error, {
        conversationId,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Restore conversation from encrypted backup
   */
  async restoreConversationBackup(backupKey, options = {}) {
    const startTime = Date.now();
    
    try {
      // Retrieve backup data from Redis
      const encryptedData = await this.redisClient.get(backupKey);
      if (!encryptedData) {
        throw new Error(`Backup ${backupKey} not found or expired`);
      }

      // Convert from base64
      let processedData = Buffer.from(encryptedData, 'base64');

      // Decrypt data if encrypted
      if (this.config.enableEncryption) {
        processedData = this.decryptData(processedData);
      }

      // Decompress data if compressed
      if (this.config.enableCompression) {
        processedData = await this.gunzip(processedData);
      }

      // Parse JSON data
      const backupPayload = JSON.parse(processedData.toString());
      
      // Verify checksum
      const payloadCopy = { ...backupPayload };
      const originalChecksum = payloadCopy.checksum;
      payloadCopy.checksum = null;
      
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(payloadCopy))
        .digest('hex');

      if (originalChecksum !== calculatedChecksum) {
        throw new Error('Backup data integrity check failed - checksum mismatch');
      }

      // Validate backup structure
      if (!backupPayload.data || !backupPayload.data.conversation) {
        throw new Error('Invalid backup structure - missing conversation data');
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Conversation backup restored', {
        backupKey,
        conversationId: backupPayload.conversationId,
        backupTimestamp: backupPayload.timestamp,
        processingTime,
        messagesRestored: backupPayload.data.metadata?.totalMessages || 0
      });

      return {
        success: true,
        conversationId: backupPayload.conversationId,
        data: backupPayload.data,
        metadata: {
          backupTimestamp: backupPayload.timestamp,
          version: backupPayload.version,
          totalMessages: backupPayload.data.metadata?.totalMessages || 0,
          agentActions: backupPayload.data.metadata?.agentActions || 0
        },
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Failed to restore conversation backup', error, {
        backupKey,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create bulk backup of multiple conversations
   */
  async createBulkBackup(conversationIds, options = {}) {
    const startTime = Date.now();
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    this.logger.info('Starting bulk backup', {
      conversationCount: conversationIds.length,
      options
    });

    for (const conversationId of conversationIds) {
      try {
        const result = await this.createConversationBackup(conversationId, options);
        results.push({ conversationId, success: true, ...result });
        successCount++;
      } catch (error) {
        results.push({
          conversationId,
          success: false,
          error: error.message
        });
        failureCount++;
        
        // Continue with other backups even if one fails
        this.logger.warn('Individual backup failed in bulk operation', {
          conversationId,
          error: error.message
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    this.logger.info('Bulk backup completed', {
      total: conversationIds.length,
      successes: successCount,
      failures: failureCount,
      processingTime,
      avgTimePerBackup: Math.round(processingTime / conversationIds.length)
    });

    return {
      success: successCount > 0,
      total: conversationIds.length,
      successes: successCount,
      failures: failureCount,
      results,
      processingTime
    };
  }

  /**
   * Export conversation data for GDPR compliance
   */
  async exportConversationData(conversationId, format = 'json') {
    try {
      const backup = await this.createConversationBackup(conversationId, {
        includePerformance: true,
        includeMetadata: true
      });

      const restored = await this.restoreConversationBackup(backup.backupKey);
      
      // Format data for export
      const exportData = {
        conversationId,
        exportedAt: new Date().toISOString(),
        format,
        data: restored.data
      };

      if (format === 'csv') {
        return this.convertToCSV(exportData);
      }

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      this.logger.error('Failed to export conversation data', error, {
        conversationId,
        format
      });
      throw error;
    }
  }

  /**
   * Clean up expired backups
   */
  async cleanupExpiredBackups() {
    const startTime = Date.now();
    let cleanedCount = 0;
    
    try {
      // Get all backup keys
      const backupKeys = await this.redisClient.keys('backup:conversation:*');
      
      for (const key of backupKeys) {
        const ttl = await this.redisClient.ttl(key);
        
        // Remove keys that are close to expiration (within 1 hour)
        if (ttl > 0 && ttl < 3600) {
          await this.redisClient.del(key);
          cleanedCount++;
        }
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Backup cleanup completed', {
        totalKeys: backupKeys.length,
        cleanedCount,
        processingTime
      });

      return { cleanedCount, totalKeys: backupKeys.length };

    } catch (error) {
      this.logger.error('Backup cleanup failed', error);
      throw error;
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStatistics() {
    try {
      const backupKeys = await this.redisClient.keys('backup:conversation:*');
      const metaKeys = await this.redisClient.keys('backup:meta:*');
      
      let totalSize = 0;
      let totalOriginalSize = 0;
      
      for (const key of backupKeys) {
        const data = await this.redisClient.get(key);
        if (data) {
          totalSize += Buffer.byteLength(data, 'base64');
        }
      }

      for (const metaKey of metaKeys) {
        const meta = await this.redisClient.get(metaKey);
        if (meta && meta.originalSize) {
          totalOriginalSize += meta.originalSize;
        }
      }

      return {
        totalBackups: backupKeys.length,
        totalSize,
        totalOriginalSize,
        compressionRatio: totalOriginalSize > 0 ? (totalSize / totalOriginalSize) : 1,
        averageBackupSize: backupKeys.length > 0 ? Math.round(totalSize / backupKeys.length) : 0,
        spaceSaved: totalOriginalSize - totalSize,
        retentionDays: this.config.retentionDays
      };

    } catch (error) {
      this.logger.error('Failed to get backup statistics', error);
      return null;
    }
  }

  /**
   * Start automatic backup process
   */
  startAutomaticBackup() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    this.backupInterval = setInterval(async () => {
      try {
        await this.performAutomaticBackup();
      } catch (error) {
        this.logger.error('Automatic backup failed', error);
      }
    }, this.config.backupInterval);

    this.logger.info('Automatic backup started', {
      intervalMinutes: this.config.backupInterval / (60 * 1000)
    });
  }

  /**
   * Perform automatic backup of active conversations
   */
  async performAutomaticBackup() {
    try {
      // Find active conversations from last 24 hours
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const activeConversations = await this.mongoClient.findDocuments('conversations', {
        lastActivity: { $gte: cutoffDate },
        state: { $ne: 'deleted' }
      });

      if (activeConversations.length === 0) {
        this.logger.info('No active conversations to backup');
        return;
      }

      const conversationIds = activeConversations.map(conv => conv.conversationId);
      const result = await this.createBulkBackup(conversationIds);

      this.logger.info('Automatic backup completed', result);

    } catch (error) {
      this.logger.error('Automatic backup process failed', error);
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encryptData(data) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key);
    cipher.setAutoPadding(true);
    
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decryptData(encryptedData) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    
    // Extract IV, auth tag, and encrypted data
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encrypted = encryptedData.slice(32);
    
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Convert export data to CSV format
   */
  convertToCSV(exportData) {
    const conversation = exportData.data.conversation;
    const history = conversation.conversationHistory || [];
    
    const csvHeaders = [
      'timestamp',
      'role',
      'content',
      'aiProvider',
      'processingTime'
    ];

    const csvRows = history.map(message => [
      message.timestamp,
      message.role,
      `"${message.content.replace(/"/g, '""')}"`, // Escape quotes
      message.metadata?.aiProvider || '',
      message.metadata?.processingTime || ''
    ]);

    return [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');
  }

  /**
   * Shutdown backup manager
   */
  async shutdown() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }

    // Perform final cleanup
    try {
      await this.cleanupExpiredBackups();
    } catch (error) {
      this.logger.warn('Error during shutdown cleanup', error);
    }

    this.logger.info('BackupManager shutdown completed');
  }
}

export { BackupManager };