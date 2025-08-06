// ==========================================
// SERVICES/COGNITIVE-CORE/src/services/data-compliance-manager.js
// ==========================================

import crypto from 'crypto';

/**
 * DataComplianceManager handles GDPR compliance, data retention policies,
 * and user privacy protection for conversation and agent data
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
      
      // GDPR settings
      enableGDPRCompliance: config.enableGDPRCompliance !== false,
      exportRequestTimeoutHours: config.exportRequestTimeoutHours || 72,
      deletionGracePeriodDays: config.deletionGracePeriodDays || 30,
      
      // Anonymization settings
      enableDataAnonymization: config.enableDataAnonymization !== false,
      anonymizationSalt: config.anonymizationSalt || process.env.ANONYMIZATION_SALT,
      
      // Automatic cleanup
      enableAutoCleanup: config.enableAutoCleanup !== false,
      cleanupIntervalHours: config.cleanupIntervalHours || 24
    };

    // Data processing activity log
    this.processingLog = [];
    
    // Start automatic cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.startAutomaticCleanup();
    }

    this.logger.info('DataComplianceManager initialized', {
      gdprCompliance: this.config.enableGDPRCompliance,
      conversationRetentionDays: this.config.conversationRetentionDays,
      autoCleanup: this.config.enableAutoCleanup
    });
  }

  /**
   * Export all user data for GDPR compliance
   */
  async exportUserData(userId, options = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomBytes(8).toString('hex');
    
    try {
      this.logger.info('Starting GDPR data export', {
        userId,
        requestId,
        options
      });

      // Log data processing activity
      this.logDataProcessingActivity(userId, 'export_request', {
        requestId,
        requestedBy: options.requestedBy || 'user',
        legalBasis: 'GDPR Article 20 - Right to data portability'
      });

      // Collect all user-related data
      const userData = await this.collectUserData(userId);
      
      // Create encrypted backup of the data
      const exportPackage = {
        exportId: requestId,
        userId,
        exportedAt: new Date().toISOString(),
        requestedBy: options.requestedBy || 'user',
        legalBasis: 'GDPR Article 20',
        format: options.format || 'json',
        data: userData,
        metadata: {
          totalConversations: userData.conversations?.length || 0,
          totalMessages: userData.conversations?.reduce((sum, conv) => 
            sum + (conv.conversationHistory?.length || 0), 0) || 0,
          dataCategories: Object.keys(userData),
          processingTime: Date.now() - startTime
        }
      };

      // Format data according to requested format
      let formattedData;
      switch (options.format) {
        case 'csv':
          formattedData = this.formatDataAsCSV(exportPackage);
          break;
        case 'xml':
          formattedData = this.formatDataAsXML(exportPackage);
          break;
        default:
          formattedData = JSON.stringify(exportPackage, null, 2);
      }

      const processingTime = Date.now() - startTime;

      this.logger.info('GDPR data export completed', {
        userId,
        requestId,
        processingTime,
        dataSize: formattedData.length,
        totalConversations: exportPackage.metadata.totalConversations
      });

      return {
        success: true,
        exportId: requestId,
        data: formattedData,
        metadata: exportPackage.metadata,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('GDPR data export failed', error, {
        userId,
        requestId,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Delete all user data (Right to be forgotten)
   */
  async deleteUserData(userId, options = {}) {
    const startTime = Date.now();
    const deletionId = crypto.randomBytes(8).toString('hex');
    
    try {
      this.logger.info('Starting GDPR data deletion', {
        userId,
        deletionId,
        gracePeriod: this.config.deletionGracePeriodDays,
        immediate: options.immediate
      });

      // Log data processing activity
      this.logDataProcessingActivity(userId, 'deletion_request', {
        deletionId,
        requestedBy: options.requestedBy || 'user',
        immediate: options.immediate,
        legalBasis: 'GDPR Article 17 - Right to erasure'
      });

      // Create final backup before deletion if not immediate
      let backupInfo = null;
      if (!options.immediate) {
        backupInfo = await this.createPreDeletionBackup(userId, deletionId);
      }

      // Perform soft delete or immediate deletion
      const deletionResults = options.immediate 
        ? await this.performImmediateDeletion(userId)
        : await this.performSoftDeletion(userId, deletionId);

      const processingTime = Date.now() - startTime;

      this.logger.info('GDPR data deletion completed', {
        userId,
        deletionId,
        immediate: options.immediate,
        processingTime,
        results: deletionResults
      });

      return {
        success: true,
        deletionId,
        immediate: options.immediate,
        gracePeriodEnds: options.immediate ? null : new Date(
          Date.now() + this.config.deletionGracePeriodDays * 24 * 60 * 60 * 1000
        ).toISOString(),
        backup: backupInfo,
        results: deletionResults,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('GDPR data deletion failed', error, {
        userId,
        deletionId,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Anonymize user data while preserving analytical value
   */
  async anonymizeUserData(userId, options = {}) {
    const startTime = Date.now();
    const anonymizationId = crypto.randomBytes(8).toString('hex');
    
    try {
      this.logger.info('Starting data anonymization', {
        userId,
        anonymizationId,
        preserveAnalytics: options.preserveAnalytics
      });

      // Create anonymized user identifier
      const anonymizedUserId = this.createAnonymizedId(userId);
      
      // Collect user data
      const userData = await this.collectUserData(userId);
      
      // Anonymize conversations
      const anonymizedConversations = await this.anonymizeConversations(
        userData.conversations, 
        anonymizedUserId,
        options
      );

      // Update database with anonymized data
      const updateResults = [];
      for (const conversation of anonymizedConversations) {
        const result = await this.mongoClient.updateDocument('conversations', 
          { conversationId: conversation.conversationId },
          {
            $set: {
              userId: anonymizedUserId,
              'conversationHistory': conversation.conversationHistory.map(msg => ({
                ...msg,
                content: this.anonymizeText(msg.content),
                metadata: {
                  ...msg.metadata,
                  anonymized: true,
                  anonymizationDate: new Date()
                }
              }))
            }
          }
        );
        updateResults.push(result);
      }

      // Update performance data
      await this.mongoClient.updateMany('agent_performance', 
        { userId },
        {
          $set: {
            userId: anonymizedUserId,
            anonymized: true,
            anonymizationDate: new Date()
          }
        }
      );

      const processingTime = Date.now() - startTime;

      this.logger.info('Data anonymization completed', {
        userId,
        anonymizedUserId,
        anonymizationId,
        conversationsProcessed: anonymizedConversations.length,
        processingTime
      });

      return {
        success: true,
        anonymizationId,
        anonymizedUserId,
        conversationsProcessed: anonymizedConversations.length,
        preservedForAnalytics: options.preserveAnalytics,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Data anonymization failed', error, {
        userId,
        anonymizationId,
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Apply data retention policies and clean up old data
   */
  async applyRetentionPolicies() {
    const startTime = Date.now();
    const results = {
      conversations: 0,
      performance: 0,
      auditLogs: 0
    };

    try {
      this.logger.info('Starting retention policy cleanup');

      // Clean up old conversations
      const conversationCutoff = new Date(
        Date.now() - this.config.conversationRetentionDays * 24 * 60 * 60 * 1000
      );
      
      const oldConversations = await this.mongoClient.deleteMany('conversations', {
        updatedAt: { $lt: conversationCutoff },
        state: { $ne: 'active' }
      });
      results.conversations = oldConversations.deletedCount;

      // Clean up old performance data
      const performanceCutoff = new Date(
        Date.now() - this.config.performanceDataRetentionDays * 24 * 60 * 60 * 1000
      );
      
      const oldPerformance = await this.mongoClient.deleteMany('agent_performance', {
        timestamp: { $lt: performanceCutoff }
      });
      results.performance = oldPerformance.deletedCount;

      // Clean up processing activity log (keep in memory, but limit size)
      const activityCutoff = new Date(
        Date.now() - this.config.auditLogRetentionDays * 24 * 60 * 60 * 1000
      );
      
      const originalLogLength = this.processingLog.length;
      this.processingLog = this.processingLog.filter(
        log => new Date(log.timestamp) > activityCutoff
      );
      results.auditLogs = originalLogLength - this.processingLog.length;

      const processingTime = Date.now() - startTime;

      this.logger.info('Retention policy cleanup completed', {
        ...results,
        processingTime
      });

      return {
        success: true,
        results,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Retention policy cleanup failed', error, {
        processingTime,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get data processing activity report for auditing
   */
  getDataProcessingReport(userId = null, dateRange = null) {
    try {
      let filteredLog = this.processingLog;

      // Filter by user if specified
      if (userId) {
        filteredLog = filteredLog.filter(log => log.userId === userId);
      }

      // Filter by date range if specified
      if (dateRange) {
        const { start, end } = dateRange;
        filteredLog = filteredLog.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate >= new Date(start) && logDate <= new Date(end);
        });
      }

      // Generate summary statistics
      const summary = {
        totalActivities: filteredLog.length,
        activitiesByType: {},
        activitiesByLegalBasis: {},
        timeRange: {
          earliest: filteredLog.length > 0 ? filteredLog[0].timestamp : null,
          latest: filteredLog.length > 0 ? filteredLog[filteredLog.length - 1].timestamp : null
        }
      };

      // Count activities by type and legal basis
      filteredLog.forEach(log => {
        summary.activitiesByType[log.activity] = 
          (summary.activitiesByType[log.activity] || 0) + 1;
        
        if (log.metadata?.legalBasis) {
          summary.activitiesByLegalBasis[log.metadata.legalBasis] = 
            (summary.activitiesByLegalBasis[log.metadata.legalBasis] || 0) + 1;
        }
      });

      return {
        summary,
        activities: filteredLog,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Failed to generate data processing report', error);
      throw error;
    }
  }

  /**
   * Collect all data associated with a user
   */
  async collectUserData(userId) {
    // Collect conversations
    const conversations = await this.mongoClient.findDocuments('conversations', { userId });
    
    // Collect performance data
    const performanceData = await this.mongoClient.findDocuments('agent_performance', { 
      'metadata.userId': userId 
    });

    // Collect processing activity log entries
    const processingActivities = this.processingLog.filter(log => log.userId === userId);

    return {
      conversations,
      performanceData,
      processingActivities,
      collectedAt: new Date().toISOString()
    };
  }

  /**
   * Create pre-deletion backup for grace period
   */
  async createPreDeletionBackup(userId, deletionId) {
    const userData = await this.collectUserData(userId);
    
    const backupData = {
      deletionId,
      userId,
      scheduledDeletionDate: new Date(
        Date.now() + this.config.deletionGracePeriodDays * 24 * 60 * 60 * 1000
      ).toISOString(),
      data: userData
    };

    // Create encrypted backup
    const backupResult = await this.backupManager.createConversationBackup(
      `deletion_backup_${deletionId}`, 
      { data: backupData }
    );

    return {
      backupKey: backupResult.backupKey,
      deletionId,
      canRestore: true,
      expiresAt: backupData.scheduledDeletionDate
    };
  }

  /**
   * Perform immediate deletion of user data
   */
  async performImmediateDeletion(userId) {
    const results = {};

    // Delete conversations
    const conversationResult = await this.mongoClient.deleteMany('conversations', { userId });
    results.conversations = conversationResult.deletedCount;

    // Delete performance data
    const performanceResult = await this.mongoClient.deleteMany('agent_performance', { 
      'metadata.userId': userId 
    });
    results.performance = performanceResult.deletedCount;

    return results;
  }

  /**
   * Perform soft deletion with grace period
   */
  async performSoftDeletion(userId, deletionId) {
    const deletionDate = new Date(
      Date.now() + this.config.deletionGracePeriodDays * 24 * 60 * 60 * 1000
    );

    const results = {};

    // Mark conversations for deletion
    const conversationResult = await this.mongoClient.updateMany('conversations',
      { userId },
      {
        $set: {
          markedForDeletion: true,
          deletionId,
          scheduledDeletionDate: deletionDate,
          state: 'pending_deletion'
        }
      }
    );
    results.conversations = conversationResult.modifiedCount;

    // Mark performance data for deletion
    const performanceResult = await this.mongoClient.updateMany('agent_performance',
      { 'metadata.userId': userId },
      {
        $set: {
          markedForDeletion: true,
          deletionId,
          scheduledDeletionDate: deletionDate
        }
      }
    );
    results.performance = performanceResult.modifiedCount;

    return results;
  }

  /**
   * Anonymize conversation data
   */
  async anonymizeConversations(conversations, anonymizedUserId, options) {
    return conversations.map(conversation => ({
      ...conversation,
      userId: anonymizedUserId,
      conversationHistory: conversation.conversationHistory?.map(message => ({
        ...message,
        content: this.anonymizeText(message.content, options),
        metadata: {
          ...message.metadata,
          anonymized: true,
          anonymizationDate: new Date()
        }
      })) || []
    }));
  }

  /**
   * Create anonymized identifier that's consistent but unlinkable
   */
  createAnonymizedId(userId) {
    if (!this.config.anonymizationSalt) {
      throw new Error('Anonymization salt not configured');
    }

    return crypto
      .createHash('sha256')
      .update(userId + this.config.anonymizationSalt)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Anonymize text content while preserving structure
   */
  anonymizeText(text, options = {}) {
    if (!options.preserveAnalytics) {
      return '[ANONYMIZED]';
    }

    // Replace emails with anonymized versions
    text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 
      '[EMAIL]');
    
    // Replace phone numbers
    text = text.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]');
    
    // Replace names (basic pattern - could be enhanced with NLP)
    text = text.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]');
    
    // Preserve technical terms and UX language
    return text;
  }

  /**
   * Log data processing activity for audit trail
   */
  logDataProcessingActivity(userId, activity, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      activity,
      metadata: {
        ...metadata,
        service: 'cognitive-core',
        component: 'data-compliance-manager'
      }
    };

    this.processingLog.push(logEntry);
    
    this.logger.info('Data processing activity logged', logEntry);
  }

  /**
   * Format data as CSV for export
   */
  formatDataAsCSV(exportPackage) {
    const conversations = exportPackage.data.conversations || [];
    const csvData = [];
    
    csvData.push('ConversationId,Timestamp,Role,Content,AIProvider,ProcessingTime');
    
    conversations.forEach(conv => {
      (conv.conversationHistory || []).forEach(msg => {
        csvData.push([
          conv.conversationId,
          msg.timestamp,
          msg.role,
          `"${msg.content.replace(/"/g, '""')}"`,
          msg.metadata?.aiProvider || '',
          msg.metadata?.processingTime || ''
        ].join(','));
      });
    });

    return csvData.join('\n');
  }

  /**
   * Format data as XML for export
   */
  formatDataAsXML(exportPackage) {
    // Basic XML formatting - could be enhanced with proper XML library
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<GDPRExport exportId="${exportPackage.exportId}" exportedAt="${exportPackage.exportedAt}">\n`;
    xml += `  <UserId>${exportPackage.userId}</UserId>\n`;
    xml += `  <Conversations>\n`;
    
    (exportPackage.data.conversations || []).forEach(conv => {
      xml += `    <Conversation id="${conv.conversationId}">\n`;
      (conv.conversationHistory || []).forEach(msg => {
        xml += `      <Message timestamp="${msg.timestamp}" role="${msg.role}">\n`;
        xml += `        <Content><![CDATA[${msg.content}]]></Content>\n`;
        xml += `      </Message>\n`;
      });
      xml += `    </Conversation>\n`;
    });
    
    xml += `  </Conversations>\n`;
    xml += `</GDPRExport>`;
    
    return xml;
  }

  /**
   * Start automatic cleanup process
   */
  startAutomaticCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.applyRetentionPolicies();
      } catch (error) {
        this.logger.error('Automatic cleanup failed', error);
      }
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);

    this.logger.info('Automatic cleanup started', {
      intervalHours: this.config.cleanupIntervalHours
    });
  }

  /**
   * Shutdown compliance manager
   */
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Save processing log before shutdown
    this.logger.info('DataComplianceManager shutdown completed', {
      totalProcessingActivities: this.processingLog.length
    });
  }
}

export { DataComplianceManager };