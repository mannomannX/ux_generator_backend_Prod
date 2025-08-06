import crypto from 'crypto';

/**
 * DataComplianceManager handles GDPR compliance, data retention policies,
 * and user privacy protection across all services
 * 
 * This is a shared utility for enterprise-wide data compliance
 */
class DataComplianceManager {
  constructor(logger, mongoClient, backupManager, config = {}) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.backupManager = backupManager;
    
    this.config = {
      // Data retention policies
      conversationRetentionDays: config.conversationRetentionDays || 365,
      performanceDataRetentionDays: config.performanceDataRetentionDays || 90,
      auditLogRetentionDays: config.auditLogRetentionDays || 2555, // 7 years
      userDataRetentionDays: config.userDataRetentionDays || 730, // 2 years
      
      // GDPR settings
      enableGDPRCompliance: config.enableGDPRCompliance !== false,
      exportRequestTimeoutHours: config.exportRequestTimeoutHours || 72,
      deletionGracePeriodDays: config.deletionGracePeriodDays || 30,
      
      // Anonymization settings
      enableDataAnonymization: config.enableDataAnonymization !== false,
      anonymizationSalt: config.anonymizationSalt || process.env.ANONYMIZATION_SALT || 'default-salt',
      
      // Automatic cleanup
      enableAutoCleanup: config.enableAutoCleanup !== false,
      cleanupIntervalHours: config.cleanupIntervalHours || 24,
      
      // Collection mappings for different services
      collectionMappings: config.collectionMappings || {
        conversations: 'conversationRetentionDays',
        agent_performance: 'performanceDataRetentionDays',
        audit_logs: 'auditLogRetentionDays',
        users: 'userDataRetentionDays',
        flows: 'conversationRetentionDays',
        projects: 'conversationRetentionDays'
      }
    };

    // Data processing activity log
    this.processingLog = [];
    
    // Start automatic cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.startAutomaticCleanup();
    }

    this.logger.info('DataComplianceManager initialized', {
      gdprCompliance: this.config.enableGDPRCompliance,
      autoCleanup: this.config.enableAutoCleanup,
      retentionPolicies: {
        conversations: this.config.conversationRetentionDays,
        performance: this.config.performanceDataRetentionDays,
        audit: this.config.auditLogRetentionDays,
        users: this.config.userDataRetentionDays
      }
    });
  }

  /**
   * Process GDPR data export request
   */
  async processDataExportRequest(userId, requestId = null) {
    const startTime = Date.now();
    
    try {
      requestId = requestId || `export_${userId}_${Date.now()}`;
      
      this.logger.info('Processing GDPR data export request', {
        userId,
        requestId
      });

      // Log the processing activity
      this.logProcessingActivity({
        type: 'DATA_EXPORT',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'INITIATED'
      });

      // Collect user data from all collections
      const userData = await this.collectUserData(userId);
      
      // Create encrypted backup for export
      const backupResult = await this.backupManager.createBackup(
        'gdpr_exports',
        requestId,
        {
          includeRelated: {
            conversations: { collection: 'conversations', filter: { userId } },
            projects: { collection: 'projects', filter: { userId } },
            flows: { collection: 'flows', filter: { userId } }
          }
        }
      );

      // Generate export package
      const exportPackage = {
        requestId,
        userId,
        exportDate: new Date().toISOString(),
        dataCategories: Object.keys(userData),
        data: userData,
        metadata: {
          totalRecords: this.countTotalRecords(userData),
          collections: Object.keys(userData),
          backupKey: backupResult.backupKey
        }
      };

      // Store export request with TTL
      const ttl = this.config.exportRequestTimeoutHours * 60 * 60;
      await this.mongoClient.insertDocument('gdpr_export_requests', {
        ...exportPackage,
        expiresAt: new Date(Date.now() + ttl * 1000)
      });

      const processingTime = Date.now() - startTime;
      
      this.logProcessingActivity({
        type: 'DATA_EXPORT',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'COMPLETED',
        processingTime
      });

      this.logger.info('GDPR data export completed', {
        userId,
        requestId,
        recordCount: exportPackage.metadata.totalRecords,
        processingTime
      });

      return {
        success: true,
        requestId,
        exportPackage,
        downloadUrl: `/api/gdpr/export/${requestId}`,
        expiresIn: `${this.config.exportRequestTimeoutHours} hours`,
        processingTime
      };

    } catch (error) {
      this.logProcessingActivity({
        type: 'DATA_EXPORT',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        error: error.message
      });

      this.logger.error('GDPR data export failed', error, {
        userId,
        requestId
      });

      throw error;
    }
  }

  /**
   * Process GDPR data deletion request (Right to be Forgotten)
   */
  async processDataDeletionRequest(userId, requestId = null, options = {}) {
    const startTime = Date.now();
    
    try {
      requestId = requestId || `deletion_${userId}_${Date.now()}`;
      
      this.logger.info('Processing GDPR data deletion request', {
        userId,
        requestId,
        gracePeriod: this.config.deletionGracePeriodDays
      });

      // Log the processing activity
      this.logProcessingActivity({
        type: 'DATA_DELETION',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'INITIATED'
      });

      // Create backup before deletion (for recovery during grace period)
      if (!options.skipBackup) {
        await this.backupManager.createBackup('users', userId, {
          includeRelated: {
            conversations: { collection: 'conversations', filter: { userId } },
            projects: { collection: 'projects', filter: { userId } },
            flows: { collection: 'flows', filter: { userId } }
          }
        });
      }

      // Schedule deletion after grace period
      const deletionDate = new Date(
        Date.now() + this.config.deletionGracePeriodDays * 24 * 60 * 60 * 1000
      );

      const deletionRequest = {
        requestId,
        userId,
        requestDate: new Date().toISOString(),
        scheduledDeletionDate: deletionDate.toISOString(),
        status: 'SCHEDULED',
        gracePeriodDays: this.config.deletionGracePeriodDays,
        affectedCollections: Object.keys(this.config.collectionMappings)
      };

      // Store deletion request
      await this.mongoClient.insertDocument('gdpr_deletion_requests', deletionRequest);

      const processingTime = Date.now() - startTime;
      
      this.logProcessingActivity({
        type: 'DATA_DELETION',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'SCHEDULED',
        scheduledDate: deletionDate.toISOString(),
        processingTime
      });

      this.logger.info('GDPR deletion request scheduled', {
        userId,
        requestId,
        scheduledDate: deletionDate.toISOString(),
        processingTime
      });

      return {
        success: true,
        requestId,
        deletionRequest,
        message: `Data deletion scheduled for ${deletionDate.toISOString()}. You have ${this.config.deletionGracePeriodDays} days to cancel this request.`,
        processingTime
      };

    } catch (error) {
      this.logProcessingActivity({
        type: 'DATA_DELETION',
        userId,
        requestId,
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        error: error.message
      });

      this.logger.error('GDPR deletion request failed', error, {
        userId,
        requestId
      });

      throw error;
    }
  }

  /**
   * Anonymize user data while preserving analytics value
   */
  async anonymizeUserData(userId, options = {}) {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting data anonymization', {
        userId,
        preserveAnalytics: options.preserveAnalytics
      });

      // Generate anonymous ID
      const anonymousId = this.generateAnonymousId(userId);
      
      // Collections to anonymize
      const collections = options.collections || Object.keys(this.config.collectionMappings);
      
      const results = {};
      
      for (const collection of collections) {
        const updateResult = await this.anonymizeCollection(
          collection,
          userId,
          anonymousId,
          options
        );
        results[collection] = updateResult;
      }

      const processingTime = Date.now() - startTime;
      
      this.logger.info('Data anonymization completed', {
        userId,
        anonymousId,
        collections: Object.keys(results),
        processingTime
      });

      return {
        success: true,
        anonymousId,
        results,
        processingTime
      };

    } catch (error) {
      this.logger.error('Data anonymization failed', error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Apply data retention policies
   */
  async applyRetentionPolicies() {
    const startTime = Date.now();
    const results = {};
    
    try {
      this.logger.info('Applying data retention policies');

      for (const [collection, retentionKey] of Object.entries(this.config.collectionMappings)) {
        const retentionDays = this.config[retentionKey];
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        
        const deleteResult = await this.mongoClient.deleteDocuments(collection, {
          createdAt: { $lt: cutoffDate },
          retentionExempt: { $ne: true }
        });

        results[collection] = {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          deletedCount: deleteResult.deletedCount || 0
        };

        if (deleteResult.deletedCount > 0) {
          this.logger.info('Retention policy applied', {
            collection,
            retentionDays,
            deletedCount: deleteResult.deletedCount
          });
        }
      }

      const processingTime = Date.now() - startTime;
      const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deletedCount, 0);
      
      this.logger.info('Retention policies applied', {
        collections: Object.keys(results).length,
        totalDeleted,
        processingTime
      });

      return {
        success: true,
        results,
        totalDeleted,
        processingTime
      };

    } catch (error) {
      this.logger.error('Failed to apply retention policies', error);
      throw error;
    }
  }

  /**
   * Process scheduled deletions
   */
  async processScheduledDeletions() {
    const startTime = Date.now();
    
    try {
      // Find deletion requests that are due
      const dueDeletions = await this.mongoClient.findDocuments('gdpr_deletion_requests', {
        status: 'SCHEDULED',
        scheduledDeletionDate: { $lte: new Date().toISOString() }
      });

      if (dueDeletions.length === 0) {
        return { success: true, processed: 0 };
      }

      this.logger.info('Processing scheduled deletions', {
        count: dueDeletions.length
      });

      const results = [];
      
      for (const request of dueDeletions) {
        try {
          // Execute the actual deletion
          await this.executeDataDeletion(request.userId);
          
          // Update request status
          await this.mongoClient.updateDocument(
            'gdpr_deletion_requests',
            { requestId: request.requestId },
            { 
              $set: { 
                status: 'COMPLETED',
                completedAt: new Date().toISOString()
              }
            }
          );
          
          results.push({
            userId: request.userId,
            requestId: request.requestId,
            success: true
          });
          
        } catch (error) {
          this.logger.error('Failed to process deletion', error, {
            userId: request.userId,
            requestId: request.requestId
          });
          
          results.push({
            userId: request.userId,
            requestId: request.requestId,
            success: false,
            error: error.message
          });
        }
      }

      const processingTime = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      
      this.logger.info('Scheduled deletions processed', {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
        processingTime
      });

      return {
        success: true,
        processed: results.length,
        successful: successCount,
        results,
        processingTime
      };

    } catch (error) {
      this.logger.error('Failed to process scheduled deletions', error);
      throw error;
    }
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(options = {}) {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        gdprCompliance: this.config.enableGDPRCompliance,
        retentionPolicies: {
          conversations: `${this.config.conversationRetentionDays} days`,
          performanceData: `${this.config.performanceDataRetentionDays} days`,
          auditLogs: `${this.config.auditLogRetentionDays} days`,
          userData: `${this.config.userDataRetentionDays} days`
        },
        processingActivities: this.processingLog.slice(-100), // Last 100 activities
        pendingRequests: {
          exports: await this.mongoClient.countDocuments('gdpr_export_requests', {
            status: { $ne: 'COMPLETED' }
          }),
          deletions: await this.mongoClient.countDocuments('gdpr_deletion_requests', {
            status: 'SCHEDULED'
          })
        },
        statistics: await this.getComplianceStatistics()
      };

      return report;

    } catch (error) {
      this.logger.error('Failed to generate compliance report', error);
      throw error;
    }
  }

  // Helper methods

  /**
   * Collect all user data from various collections
   */
  async collectUserData(userId) {
    const userData = {};
    
    // Define data collection queries
    const queries = {
      profile: { collection: 'users', filter: { _id: userId } },
      conversations: { collection: 'conversations', filter: { userId } },
      projects: { collection: 'projects', filter: { userId } },
      flows: { collection: 'flows', filter: { userId } },
      audit_logs: { collection: 'audit_logs', filter: { userId } }
    };

    for (const [key, query] of Object.entries(queries)) {
      try {
        const data = await this.mongoClient.findDocuments(query.collection, query.filter);
        userData[key] = data;
      } catch (error) {
        this.logger.warn(`Failed to collect ${key} data`, {
          userId,
          error: error.message
        });
        userData[key] = [];
      }
    }

    return userData;
  }

  /**
   * Execute actual data deletion
   */
  async executeDataDeletion(userId) {
    const collections = Object.keys(this.config.collectionMappings);
    const results = {};
    
    for (const collection of collections) {
      const deleteResult = await this.mongoClient.deleteDocuments(collection, { userId });
      results[collection] = deleteResult.deletedCount || 0;
    }

    this.logger.info('User data deleted', {
      userId,
      collections: Object.keys(results),
      totalDeleted: Object.values(results).reduce((sum, count) => sum + count, 0)
    });

    return results;
  }

  /**
   * Anonymize a specific collection
   */
  async anonymizeCollection(collection, userId, anonymousId, options = {}) {
    const anonymizationFields = {
      userId: anonymousId,
      email: `${anonymousId}@anonymized.local`,
      name: `User ${anonymousId.substring(0, 8)}`,
      personalData: null
    };

    if (options.preserveAnalytics) {
      // Keep non-identifying analytics data
      delete anonymizationFields.createdAt;
      delete anonymizationFields.metrics;
    }

    const updateResult = await this.mongoClient.updateDocuments(
      collection,
      { userId },
      { $set: anonymizationFields }
    );

    return {
      collection,
      modifiedCount: updateResult.modifiedCount || 0,
      anonymousId
    };
  }

  /**
   * Generate anonymous ID from user ID
   */
  generateAnonymousId(userId) {
    const hash = crypto.createHash('sha256');
    hash.update(userId + this.config.anonymizationSalt);
    return `anon_${hash.digest('hex').substring(0, 16)}`;
  }

  /**
   * Count total records in user data
   */
  countTotalRecords(userData) {
    let total = 0;
    for (const data of Object.values(userData)) {
      if (Array.isArray(data)) {
        total += data.length;
      } else if (data) {
        total += 1;
      }
    }
    return total;
  }

  /**
   * Log processing activity for audit
   */
  logProcessingActivity(activity) {
    this.processingLog.push(activity);
    
    // Keep only last 1000 activities in memory
    if (this.processingLog.length > 1000) {
      this.processingLog = this.processingLog.slice(-1000);
    }

    // Also persist to database for long-term audit
    this.mongoClient.insertDocument('gdpr_processing_log', activity).catch(error => {
      this.logger.error('Failed to persist processing activity', error);
    });
  }

  /**
   * Get compliance statistics
   */
  async getComplianceStatistics() {
    try {
      const stats = {
        totalExportRequests: await this.mongoClient.countDocuments('gdpr_export_requests', {}),
        totalDeletionRequests: await this.mongoClient.countDocuments('gdpr_deletion_requests', {}),
        pendingDeletions: await this.mongoClient.countDocuments('gdpr_deletion_requests', {
          status: 'SCHEDULED'
        }),
        completedDeletions: await this.mongoClient.countDocuments('gdpr_deletion_requests', {
          status: 'COMPLETED'
        })
      };

      return stats;
    } catch (error) {
      this.logger.error('Failed to get compliance statistics', error);
      return null;
    }
  }

  /**
   * Start automatic cleanup process
   */
  startAutomaticCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performAutomaticCleanup();
      } catch (error) {
        this.logger.error('Automatic cleanup failed', error);
      }
    }, intervalMs);

    this.logger.info('Automatic cleanup started', {
      intervalHours: this.config.cleanupIntervalHours
    });
  }

  /**
   * Perform automatic cleanup tasks
   */
  async performAutomaticCleanup() {
    try {
      this.logger.info('Starting automatic cleanup');

      // Apply retention policies
      const retentionResult = await this.applyRetentionPolicies();
      
      // Process scheduled deletions
      const deletionResult = await this.processScheduledDeletions();
      
      // Clean up expired export requests
      const exportCleanup = await this.mongoClient.deleteDocuments('gdpr_export_requests', {
        expiresAt: { $lt: new Date() }
      });

      this.logger.info('Automatic cleanup completed', {
        retentionDeleted: retentionResult.totalDeleted,
        scheduledDeletions: deletionResult.processed,
        expiredExports: exportCleanup.deletedCount || 0
      });

    } catch (error) {
      this.logger.error('Automatic cleanup process failed', error);
    }
  }

  /**
   * Shutdown compliance manager
   */
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.logger.info('DataComplianceManager shutdown completed');
  }
}

export { DataComplianceManager };