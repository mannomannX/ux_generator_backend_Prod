/**
 * GDPR Compliance Service
 * Handles data privacy, user rights, and compliance requirements
 */

import crypto from 'crypto';
import { Transform } from 'stream';

export class GDPRComplianceService {
  constructor(logger, mongoClient, redisClient, auditLogger) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.auditLogger = auditLogger;
    
    // Configuration
    this.config = {
      dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 730, // 2 years
      anonymizationDelay: parseInt(process.env.ANONYMIZATION_DELAY) || 30, // 30 days
      exportFormat: process.env.GDPR_EXPORT_FORMAT || 'json',
      encryptExports: process.env.GDPR_ENCRYPT_EXPORTS !== 'false',
      maxExportSize: parseInt(process.env.MAX_EXPORT_SIZE) || 100 * 1024 * 1024 // 100MB
    };
    
    // Initialize database
    this.initializeDatabase();
  }

  /**
   * Initialize GDPR database collections
   */
  async initializeDatabase() {
    try {
      const db = this.mongoClient.getDb();
      
      // Create indexes for GDPR requests
      await db.collection('gdpr_requests').createIndexes([
        { key: { userId: 1, type: 1, status: 1 } },
        { key: { requestedAt: -1 } },
        { key: { processedAt: -1 } },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
      ]);
      
      // Create indexes for consent records
      await db.collection('consent_records').createIndexes([
        { key: { userId: 1, purpose: 1 } },
        { key: { grantedAt: -1 } },
        { key: { revokedAt: -1 } },
        { key: { version: 1 } }
      ]);
      
      // Create indexes for data processing activities
      await db.collection('processing_activities').createIndexes([
        { key: { userId: 1, activity: 1 } },
        { key: { timestamp: -1 } },
        { key: { lawfulBasis: 1 } }
      ]);
      
      this.logger.info('GDPR database initialized');
    } catch (error) {
      this.logger.error('Failed to initialize GDPR database', error);
    }
  }

  /**
   * Handle data export request (Right to Access)
   */
  async handleDataExportRequest(userId, options = {}) {
    try {
      // Create GDPR request record
      const request = await this.createGDPRRequest(userId, 'DATA_EXPORT', options);
      
      // Collect user data from all sources
      const userData = await this.collectUserData(userId);
      
      // Format data for export
      const exportData = this.formatDataForExport(userData, options.format);
      
      // Encrypt if required
      let finalData = exportData;
      if (this.config.encryptExports) {
        finalData = await this.encryptExportData(exportData, userId);
      }
      
      // Store export for download
      await this.storeExport(request.id, finalData);
      
      // Update request status
      await this.updateGDPRRequest(request.id, 'COMPLETED', {
        exportUrl: await this.generateSecureDownloadUrl(request.id)
      });
      
      // Log the export
      await this.auditLogger.log(this.auditLogger.eventTypes.DATA_EXPORTED, {
        userId,
        requestId: request.id,
        format: options.format
      });
      
      return {
        requestId: request.id,
        status: 'completed',
        downloadUrl: await this.generateSecureDownloadUrl(request.id)
      };
      
    } catch (error) {
      this.logger.error('Failed to handle data export request', { userId, error });
      throw error;
    }
  }

  /**
   * Handle data deletion request (Right to Erasure)
   */
  async handleDataDeletionRequest(userId, options = {}) {
    try {
      // Create GDPR request record
      const request = await this.createGDPRRequest(userId, 'DATA_DELETION', options);
      
      // Check for legal holds or obligations
      const canDelete = await this.checkDeletionEligibility(userId);
      
      if (!canDelete.eligible) {
        await this.updateGDPRRequest(request.id, 'REJECTED', {
          reason: canDelete.reason
        });
        
        return {
          requestId: request.id,
          status: 'rejected',
          reason: canDelete.reason
        };
      }
      
      // Schedule deletion (with grace period)
      const deletionDate = new Date();
      deletionDate.setDate(deletionDate.getDate() + this.config.anonymizationDelay);
      
      await this.scheduleDeletion(userId, deletionDate);
      
      // Update request status
      await this.updateGDPRRequest(request.id, 'SCHEDULED', {
        scheduledDate: deletionDate
      });
      
      // Log the request
      await this.auditLogger.log(this.auditLogger.eventTypes.DATA_DELETION_REQUESTED, {
        userId,
        requestId: request.id,
        scheduledDate: deletionDate
      });
      
      return {
        requestId: request.id,
        status: 'scheduled',
        deletionDate
      };
      
    } catch (error) {
      this.logger.error('Failed to handle data deletion request', { userId, error });
      throw error;
    }
  }

  /**
   * Handle data portability request (Right to Data Portability)
   */
  async handleDataPortabilityRequest(userId, targetService = null) {
    try {
      // Create GDPR request record
      const request = await this.createGDPRRequest(userId, 'DATA_PORTABILITY', {
        targetService
      });
      
      // Collect portable data
      const portableData = await this.collectPortableData(userId);
      
      // Format in machine-readable format
      const formattedData = this.formatPortableData(portableData);
      
      if (targetService) {
        // Transfer to another service
        await this.transferDataToService(formattedData, targetService);
        
        await this.updateGDPRRequest(request.id, 'TRANSFERRED', {
          targetService,
          transferredAt: new Date()
        });
      } else {
        // Provide download link
        await this.storeExport(request.id, formattedData);
        
        await this.updateGDPRRequest(request.id, 'COMPLETED', {
          downloadUrl: await this.generateSecureDownloadUrl(request.id)
        });
      }
      
      return {
        requestId: request.id,
        status: 'completed',
        format: 'json',
        downloadUrl: targetService ? null : await this.generateSecureDownloadUrl(request.id)
      };
      
    } catch (error) {
      this.logger.error('Failed to handle data portability request', { userId, error });
      throw error;
    }
  }

  /**
   * Handle consent management
   */
  async updateConsent(userId, purpose, granted, metadata = {}) {
    try {
      const db = this.mongoClient.getDb();
      
      const consentRecord = {
        userId,
        purpose,
        granted,
        version: metadata.version || '1.0',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        timestamp: new Date(),
        ...(granted ? { grantedAt: new Date() } : { revokedAt: new Date() })
      };
      
      // Store consent record
      await db.collection('consent_records').insertOne(consentRecord);
      
      // Update user consent preferences
      await db.collection('users').updateOne(
        { id: userId },
        {
          $set: {
            [`consent.${purpose}`]: granted,
            [`consent.lastUpdated`]: new Date()
          }
        }
      );
      
      // Log consent change
      await this.auditLogger.log('CONSENT_UPDATED', {
        userId,
        purpose,
        granted,
        ...metadata
      });
      
      return {
        success: true,
        purpose,
        granted,
        timestamp: consentRecord.timestamp
      };
      
    } catch (error) {
      this.logger.error('Failed to update consent', { userId, purpose, error });
      throw error;
    }
  }

  /**
   * Get user consent status
   */
  async getConsentStatus(userId) {
    try {
      const db = this.mongoClient.getDb();
      
      // Get latest consent records for each purpose
      const consents = await db.collection('consent_records').aggregate([
        { $match: { userId } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$purpose',
            granted: { $first: '$granted' },
            timestamp: { $first: '$timestamp' },
            version: { $first: '$version' }
          }
        }
      ]).toArray();
      
      const consentMap = {};
      consents.forEach(consent => {
        consentMap[consent._id] = {
          granted: consent.granted,
          timestamp: consent.timestamp,
          version: consent.version
        };
      });
      
      return consentMap;
      
    } catch (error) {
      this.logger.error('Failed to get consent status', { userId, error });
      throw error;
    }
  }

  /**
   * Anonymize user data
   */
  async anonymizeUserData(userId) {
    try {
      const db = this.mongoClient.getDb();
      
      // Generate anonymous ID
      const anonymousId = `anon_${crypto.randomBytes(16).toString('hex')}`;
      
      // Anonymize user profile
      await db.collection('users').updateOne(
        { id: userId },
        {
          $set: {
            email: `${anonymousId}@anonymized.local`,
            firstName: 'Anonymous',
            lastName: 'User',
            displayName: 'Anonymous User',
            profile: {},
            anonymizedAt: new Date(),
            status: 'anonymized'
          },
          $unset: {
            phone: '',
            address: '',
            dateOfBirth: '',
            socialProfiles: ''
          }
        }
      );
      
      // Anonymize related data
      await this.anonymizeRelatedData(userId, anonymousId);
      
      // Log anonymization
      await this.auditLogger.log('DATA_ANONYMIZED', {
        originalUserId: userId,
        anonymousId
      });
      
      return {
        success: true,
        anonymousId,
        anonymizedAt: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to anonymize user data', { userId, error });
      throw error;
    }
  }

  /**
   * Collect all user data
   */
  async collectUserData(userId) {
    const db = this.mongoClient.getDb();
    const userData = {};
    
    // User profile
    userData.profile = await db.collection('users').findOne({ id: userId });
    
    // Workspaces
    userData.workspaces = await db.collection('workspaces')
      .find({ 'members.userId': userId })
      .toArray();
    
    // Sessions
    userData.sessions = await db.collection('sessions')
      .find({ userId })
      .toArray();
    
    // API keys
    userData.apiKeys = await db.collection('api_keys')
      .find({ userId })
      .project({ keyHash: 0 }) // Exclude sensitive data
      .toArray();
    
    // Audit logs
    userData.auditLogs = await db.collection('audit_logs')
      .find({ userId })
      .limit(1000) // Limit for performance
      .toArray();
    
    // Consent records
    userData.consentRecords = await db.collection('consent_records')
      .find({ userId })
      .toArray();
    
    // Notifications
    userData.notifications = await db.collection('notifications')
      .find({ userId })
      .toArray();
    
    return userData;
  }

  /**
   * Collect portable data (structured format)
   */
  async collectPortableData(userId) {
    const userData = await this.collectUserData(userId);
    
    // Filter to only portable data
    return {
      profile: {
        email: userData.profile.email,
        firstName: userData.profile.firstName,
        lastName: userData.profile.lastName,
        displayName: userData.profile.displayName,
        createdAt: userData.profile.createdAt
      },
      workspaces: userData.workspaces.map(w => ({
        name: w.name,
        role: w.members.find(m => m.userId === userId)?.role,
        joinedAt: w.members.find(m => m.userId === userId)?.joinedAt
      })),
      preferences: userData.profile.preferences,
      exportedAt: new Date()
    };
  }

  /**
   * Format data for export
   */
  formatDataForExport(data, format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      
      case 'csv':
        return this.convertToCSV(data);
      
      case 'xml':
        return this.convertToXML(data);
      
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Format portable data (machine-readable)
   */
  formatPortableData(data) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'DataDownload',
      name: 'User Data Export',
      description: 'Personal data export from UX Flow Engine',
      encodingFormat: 'application/json',
      contentSize: JSON.stringify(data).length,
      dateCreated: new Date().toISOString(),
      data
    }, null, 2);
  }

  /**
   * Check if user data can be deleted
   */
  async checkDeletionEligibility(userId) {
    const db = this.mongoClient.getDb();
    
    // Check for active subscriptions
    const activeSubscriptions = await db.collection('subscriptions')
      .countDocuments({ userId, status: 'active' });
    
    if (activeSubscriptions > 0) {
      return {
        eligible: false,
        reason: 'Active subscriptions must be cancelled first'
      };
    }
    
    // Check for workspace ownership
    const ownedWorkspaces = await db.collection('workspaces')
      .countDocuments({ ownerId: userId, status: 'active' });
    
    if (ownedWorkspaces > 0) {
      return {
        eligible: false,
        reason: 'Workspace ownership must be transferred first'
      };
    }
    
    // Check for legal holds
    const legalHolds = await db.collection('legal_holds')
      .countDocuments({ userId, active: true });
    
    if (legalHolds > 0) {
      return {
        eligible: false,
        reason: 'Account is under legal hold'
      };
    }
    
    return { eligible: true };
  }

  /**
   * Schedule data deletion
   */
  async scheduleDeletion(userId, deletionDate) {
    const db = this.mongoClient.getDb();
    
    await db.collection('scheduled_deletions').insertOne({
      userId,
      scheduledFor: deletionDate,
      createdAt: new Date(),
      status: 'pending'
    });
  }

  /**
   * Process scheduled deletions
   */
  async processScheduledDeletions() {
    const db = this.mongoClient.getDb();
    const now = new Date();
    
    const deletions = await db.collection('scheduled_deletions')
      .find({
        scheduledFor: { $lte: now },
        status: 'pending'
      })
      .toArray();
    
    for (const deletion of deletions) {
      try {
        await this.performDataDeletion(deletion.userId);
        
        await db.collection('scheduled_deletions').updateOne(
          { _id: deletion._id },
          {
            $set: {
              status: 'completed',
              completedAt: new Date()
            }
          }
        );
      } catch (error) {
        this.logger.error('Failed to process scheduled deletion', {
          userId: deletion.userId,
          error
        });
      }
    }
  }

  /**
   * Perform actual data deletion
   */
  async performDataDeletion(userId) {
    const db = this.mongoClient.getDb();
    
    // Delete from all collections
    const collections = [
      'users', 'sessions', 'tokens', 'api_keys',
      'password_reset_tokens', 'email_verification_tokens',
      'notifications', 'audit_logs', 'consent_records'
    ];
    
    for (const collection of collections) {
      await db.collection(collection).deleteMany({ userId });
    }
    
    // Remove from workspaces
    await db.collection('workspaces').updateMany(
      { 'members.userId': userId },
      { $pull: { members: { userId } } }
    );
    
    // Clear cache
    await this.clearUserCache(userId);
    
    // Log deletion
    await this.auditLogger.log(this.auditLogger.eventTypes.DATA_DELETED, {
      userId,
      deletedAt: new Date()
    });
  }

  /**
   * Anonymize related data
   */
  async anonymizeRelatedData(userId, anonymousId) {
    const db = this.mongoClient.getDb();
    
    // Anonymize audit logs
    await db.collection('audit_logs').updateMany(
      { userId },
      { $set: { userId: anonymousId } }
    );
    
    // Anonymize in workspaces
    await db.collection('workspaces').updateMany(
      { 'members.userId': userId },
      { $set: { 'members.$.userId': anonymousId, 'members.$.anonymized': true } }
    );
  }

  /**
   * Create GDPR request record
   */
  async createGDPRRequest(userId, type, metadata = {}) {
    const db = this.mongoClient.getDb();
    
    const request = {
      id: `gdpr_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      userId,
      type,
      status: 'PENDING',
      metadata,
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };
    
    await db.collection('gdpr_requests').insertOne(request);
    
    return request;
  }

  /**
   * Update GDPR request status
   */
  async updateGDPRRequest(requestId, status, metadata = {}) {
    const db = this.mongoClient.getDb();
    
    await db.collection('gdpr_requests').updateOne(
      { id: requestId },
      {
        $set: {
          status,
          ...metadata,
          processedAt: new Date()
        }
      }
    );
  }

  /**
   * Generate secure download URL
   */
  async generateSecureDownloadUrl(requestId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    
    // Store download token
    await this.redisClient.setex(
      `gdpr:download:${token}`,
      86400,
      JSON.stringify({ requestId, expiry })
    );
    
    return `${process.env.BASE_URL}/gdpr/download/${token}`;
  }

  /**
   * Store export data
   */
  async storeExport(requestId, data) {
    // In production, store in secure object storage
    // For now, store in Redis with expiration
    await this.redisClient.setex(
      `gdpr:export:${requestId}`,
      86400, // 24 hours
      data
    );
  }

  /**
   * Encrypt export data
   */
  async encryptExportData(data, userId) {
    const password = crypto.randomBytes(16).toString('hex');
    const salt = crypto.randomBytes(32);
    const key = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Store password separately for user
    await this.storeExportPassword(userId, password);
    
    return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
  }

  /**
   * Store export password for user
   */
  async storeExportPassword(userId, password) {
    // In production, send via secure channel (email, SMS, etc.)
    await this.redisClient.setex(
      `gdpr:export:password:${userId}`,
      86400,
      password
    );
  }

  /**
   * Clear user cache
   */
  async clearUserCache(userId) {
    const keys = await this.redisClient.keys(`*:${userId}:*`);
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    // Simplified CSV conversion
    const rows = [];
    
    // Profile data
    if (data.profile) {
      rows.push(['Profile Data']);
      rows.push(['Field', 'Value']);
      Object.entries(data.profile).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          rows.push([key, value]);
        }
      });
      rows.push([]);
    }
    
    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Convert data to XML format
   */
  convertToXML(data) {
    // Simplified XML conversion
    const xmlBuilder = (obj, rootName = 'root') => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>`;
      
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) continue;
        
        if (typeof value === 'object' && !Array.isArray(value)) {
          xml += `\n  <${key}>${xmlBuilder(value, key)}</${key}>`;
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            xml += `\n  <${key}>${typeof item === 'object' ? xmlBuilder(item, key) : item}</${key}>`;
          });
        } else {
          xml += `\n  <${key}>${value}</${key}>`;
        }
      }
      
      xml += `\n</${rootName}>`;
      return xml;
    };
    
    return xmlBuilder(data, 'UserData');
  }

  /**
   * Transfer data to another service
   */
  async transferDataToService(data, targetService) {
    // Implement actual transfer logic based on target service API
    this.logger.info('Data transfer initiated', { targetService });
    
    // Placeholder for actual implementation
    return true;
  }

  /**
   * Get GDPR compliance report
   */
  async getComplianceReport() {
    const db = this.mongoClient.getDb();
    
    const report = {
      generatedAt: new Date(),
      requests: {
        total: await db.collection('gdpr_requests').countDocuments(),
        byType: await db.collection('gdpr_requests').aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]).toArray(),
        pending: await db.collection('gdpr_requests').countDocuments({ status: 'PENDING' }),
        completed: await db.collection('gdpr_requests').countDocuments({ status: 'COMPLETED' })
      },
      consents: {
        total: await db.collection('consent_records').countDocuments(),
        granted: await db.collection('consent_records').countDocuments({ granted: true }),
        revoked: await db.collection('consent_records').countDocuments({ granted: false })
      },
      deletions: {
        scheduled: await db.collection('scheduled_deletions').countDocuments({ status: 'pending' }),
        completed: await db.collection('scheduled_deletions').countDocuments({ status: 'completed' })
      },
      dataRetention: {
        policy: `${this.config.dataRetentionDays} days`,
        oldestRecord: await db.collection('users').findOne({}, { sort: { createdAt: 1 } })
      }
    };
    
    return report;
  }
}

export default GDPRComplianceService;