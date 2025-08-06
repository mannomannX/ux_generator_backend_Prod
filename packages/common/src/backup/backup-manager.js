import crypto from 'crypto';
import { promisify } from 'util';
import zlib from 'zlib';

/**
 * BackupManager handles conversation data backup, encryption, and recovery
 * for GDPR compliance and disaster recovery scenarios
 * 
 * This is a shared utility that can be used by any service requiring backup capabilities
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
   * Create encrypted backup of data
   */
  async createBackup(collectionName, documentId, options = {}) {
    const startTime = Date.now();
    
    try {
      // Fetch data from MongoDB
      const data = await this.mongoClient.findDocument(collectionName, {
        _id: documentId
      });

      if (!data) {
        throw new Error(`Document ${documentId} not found in ${collectionName}`);
      }

      // Fetch related data if specified
      const relatedData = {};
      if (options.includeRelated) {
        for (const [key, query] of Object.entries(options.includeRelated)) {
          relatedData[key] = await this.mongoClient.findDocuments(query.collection, query.filter);
        }
      }

      // Create backup payload
      const backupPayload = {
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        documentId,
        collectionName,
        data: {
          primary: data,
          related: relatedData,
          metadata: {
            documentCount: 1 + Object.values(relatedData).reduce((sum, arr) => sum + arr.length, 0),
            collections: [collectionName, ...Object.keys(relatedData)]
          }
        },
        checksum: null
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
      const backupKey = `backup:${collectionName}:${documentId}:${Date.now()}`;
      const ttl = this.config.retentionDays * 24 * 60 * 60;
      
      await this.redisClient.set(backupKey, processedData.toString('base64'), ttl);

      // Store backup metadata
      const metadata = {
        backupKey,
        documentId,
        collectionName,
        timestamp: new Date().toISOString(),
        originalSize: serializedData.length,
        compressedSize: processedData.length,
        compressionRatio: serializedData.length > 0 ? (processedData.length / serializedData.length) : 1,
        encrypted: this.config.enableEncryption,
        compressed: this.config.enableCompression,
        checksum: backupPayload.checksum,
        ttl
      };

      this.backupMetadata.set(`${collectionName}:${documentId}`, metadata);
      await this.redisClient.set(`backup:meta:${collectionName}:${documentId}`, metadata, ttl);

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Backup created', {
        collectionName,
        documentId,
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
      
      this.logger.error('Failed to create backup', error, {
        collectionName,
        documentId,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Restore data from encrypted backup
   */
  async restoreBackup(backupKey, options = {}) {
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
      if (!backupPayload.data || !backupPayload.data.primary) {
        throw new Error('Invalid backup structure - missing primary data');
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Backup restored', {
        backupKey,
        documentId: backupPayload.documentId,
        collectionName: backupPayload.collectionName,
        backupTimestamp: backupPayload.timestamp,
        processingTime
      });

      return {
        success: true,
        documentId: backupPayload.documentId,
        collectionName: backupPayload.collectionName,
        data: backupPayload.data,
        metadata: {
          backupTimestamp: backupPayload.timestamp,
          version: backupPayload.version,
          documentCount: backupPayload.data.metadata?.documentCount || 1
        },
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Failed to restore backup', error, {
        backupKey,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Create bulk backup of multiple documents
   */
  async createBulkBackup(backupRequests, options = {}) {
    const startTime = Date.now();
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    this.logger.info('Starting bulk backup', {
      requestCount: backupRequests.length,
      options
    });

    for (const request of backupRequests) {
      try {
        const result = await this.createBackup(
          request.collectionName,
          request.documentId,
          request.options || options
        );
        results.push({ ...request, success: true, ...result });
        successCount++;
      } catch (error) {
        results.push({
          ...request,
          success: false,
          error: error.message
        });
        failureCount++;
        
        this.logger.warn('Individual backup failed in bulk operation', {
          collectionName: request.collectionName,
          documentId: request.documentId,
          error: error.message
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    this.logger.info('Bulk backup completed', {
      total: backupRequests.length,
      successes: successCount,
      failures: failureCount,
      processingTime,
      avgTimePerBackup: Math.round(processingTime / backupRequests.length)
    });

    return {
      success: successCount > 0,
      total: backupRequests.length,
      successes: successCount,
      failures: failureCount,
      results,
      processingTime
    };
  }

  /**
   * Export data for GDPR compliance
   */
  async exportDataForCompliance(collectionName, documentId, format = 'json') {
    try {
      const backup = await this.createBackup(collectionName, documentId, {
        includeRelated: {}
      });

      const restored = await this.restoreBackup(backup.backupKey);
      
      // Format data for export
      const exportData = {
        documentId,
        collectionName,
        exportedAt: new Date().toISOString(),
        format,
        data: restored.data
      };

      if (format === 'csv') {
        return this.convertToCSV(exportData);
      }

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      this.logger.error('Failed to export data for compliance', error, {
        collectionName,
        documentId,
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
      const backupKeys = await this.redisClient.keys('backup:*');
      
      for (const key of backupKeys) {
        if (key.startsWith('backup:meta:')) continue; // Skip metadata keys
        
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
      const backupKeys = await this.redisClient.keys('backup:*');
      const actualBackupKeys = backupKeys.filter(k => !k.startsWith('backup:meta:'));
      const metaKeys = backupKeys.filter(k => k.startsWith('backup:meta:'));
      
      let totalSize = 0;
      let totalOriginalSize = 0;
      
      for (const key of actualBackupKeys) {
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
        totalBackups: actualBackupKeys.length,
        totalSize,
        totalOriginalSize,
        compressionRatio: totalOriginalSize > 0 ? (totalSize / totalOriginalSize) : 1,
        averageBackupSize: actualBackupKeys.length > 0 ? Math.round(totalSize / actualBackupKeys.length) : 0,
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
   * Perform automatic backup of active data
   */
  async performAutomaticBackup() {
    try {
      // This method should be overridden by services using the BackupManager
      // to define their specific backup strategy
      this.logger.info('Automatic backup triggered - no default implementation');
    } catch (error) {
      this.logger.error('Automatic backup process failed', error);
    }
  }

  /**
   * Encrypt data using AES-256-GCM (FIXED: using createCipheriv instead of deprecated createCipher)
   */
  encryptData(data) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    // Derive a proper key from the encryption key
    const salt = 'ux-flow-backup-salt'; // Fixed salt for key derivation
    const key = crypto.scryptSync(this.config.encryptionKey, salt, 32);
    
    // Generate random IV for each encryption
    const iv = crypto.randomBytes(16);
    
    // Create cipher with key and IV
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt the data
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM (FIXED: using createDecipheriv instead of deprecated createDecipher)
   */
  decryptData(encryptedData) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    // Derive the same key used for encryption
    const salt = 'ux-flow-backup-salt';
    const key = crypto.scryptSync(this.config.encryptionKey, salt, 32);
    
    // Extract IV, auth tag, and encrypted data
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encrypted = encryptedData.slice(32);
    
    // Create decipher with key and IV
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    
    // Set the authentication tag
    decipher.setAuthTag(authTag);
    
    // Decrypt the data
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Convert export data to CSV format
   */
  convertToCSV(exportData) {
    const data = exportData.data.primary;
    
    // Flatten the object for CSV conversion
    const flattenObject = (obj, prefix = '') => {
      const flattened = {};
      for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(flattened, flattenObject(value, newKey));
        } else if (Array.isArray(value)) {
          flattened[newKey] = JSON.stringify(value);
        } else {
          flattened[newKey] = value;
        }
      }
      return flattened;
    };

    const flattened = flattenObject(data);
    const headers = Object.keys(flattened);
    const values = Object.values(flattened).map(v => 
      typeof v === 'string' && v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v
    );

    return [
      headers.join(','),
      values.join(',')
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