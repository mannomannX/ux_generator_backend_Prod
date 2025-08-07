/**
 * Audit Logger Service
 * Comprehensive audit logging for security and compliance
 */

import crypto from 'crypto';

export class AuditLogger {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // Audit event types
    this.eventTypes = {
      // Authentication events
      LOGIN_SUCCESS: 'AUTH.LOGIN_SUCCESS',
      LOGIN_FAILED: 'AUTH.LOGIN_FAILED',
      LOGOUT: 'AUTH.LOGOUT',
      TOKEN_REFRESH: 'AUTH.TOKEN_REFRESH',
      PASSWORD_RESET_REQUESTED: 'AUTH.PASSWORD_RESET_REQUESTED',
      PASSWORD_RESET_COMPLETED: 'AUTH.PASSWORD_RESET_COMPLETED',
      PASSWORD_CHANGED: 'AUTH.PASSWORD_CHANGED',
      
      // Account events
      ACCOUNT_CREATED: 'ACCOUNT.CREATED',
      ACCOUNT_VERIFIED: 'ACCOUNT.VERIFIED',
      ACCOUNT_UPDATED: 'ACCOUNT.UPDATED',
      ACCOUNT_DELETED: 'ACCOUNT.DELETED',
      ACCOUNT_SUSPENDED: 'ACCOUNT.SUSPENDED',
      ACCOUNT_REACTIVATED: 'ACCOUNT.REACTIVATED',
      
      // 2FA events
      TWO_FA_ENABLED: '2FA.ENABLED',
      TWO_FA_DISABLED: '2FA.DISABLED',
      TWO_FA_VERIFIED: '2FA.VERIFIED',
      TWO_FA_FAILED: '2FA.FAILED',
      BACKUP_CODE_USED: '2FA.BACKUP_CODE_USED',
      
      // Session events
      SESSION_CREATED: 'SESSION.CREATED',
      SESSION_REVOKED: 'SESSION.REVOKED',
      SESSION_EXPIRED: 'SESSION.EXPIRED',
      
      // API key events
      API_KEY_CREATED: 'API_KEY.CREATED',
      API_KEY_REVOKED: 'API_KEY.REVOKED',
      API_KEY_ROTATED: 'API_KEY.ROTATED',
      API_KEY_USED: 'API_KEY.USED',
      
      // Workspace events
      WORKSPACE_CREATED: 'WORKSPACE.CREATED',
      WORKSPACE_UPDATED: 'WORKSPACE.UPDATED',
      WORKSPACE_DELETED: 'WORKSPACE.DELETED',
      MEMBER_ADDED: 'WORKSPACE.MEMBER_ADDED',
      MEMBER_REMOVED: 'WORKSPACE.MEMBER_REMOVED',
      MEMBER_ROLE_CHANGED: 'WORKSPACE.MEMBER_ROLE_CHANGED',
      
      // Permission events
      PERMISSION_GRANTED: 'PERMISSION.GRANTED',
      PERMISSION_REVOKED: 'PERMISSION.REVOKED',
      PERMISSION_DENIED: 'PERMISSION.DENIED',
      
      // Data access events
      DATA_ACCESSED: 'DATA.ACCESSED',
      DATA_EXPORTED: 'DATA.EXPORTED',
      DATA_DELETED: 'DATA.DELETED',
      
      // Security events
      SUSPICIOUS_ACTIVITY: 'SECURITY.SUSPICIOUS_ACTIVITY',
      RATE_LIMIT_EXCEEDED: 'SECURITY.RATE_LIMIT_EXCEEDED',
      INVALID_TOKEN_USED: 'SECURITY.INVALID_TOKEN_USED',
      BRUTE_FORCE_DETECTED: 'SECURITY.BRUTE_FORCE_DETECTED'
    };
    
    // Initialize database
    this.initializeDatabase();
  }

  /**
   * Initialize audit log database
   */
  async initializeDatabase() {
    try {
      const db = this.mongoClient.getDb();
      
      // Create indexes for audit logs
      await db.collection('audit_logs').createIndexes([
        { key: { timestamp: -1 } },
        { key: { userId: 1, timestamp: -1 } },
        { key: { event: 1, timestamp: -1 } },
        { key: { correlationId: 1 } },
        { key: { sessionId: 1 } },
        { key: { ip: 1, timestamp: -1 } },
        { key: { workspaceId: 1, timestamp: -1 } },
        // TTL index to auto-delete old logs after 2 years
        { key: { timestamp: 1 }, expireAfterSeconds: 63072000 }
      ]);
      
      this.logger.info('Audit logger database initialized');
    } catch (error) {
      this.logger.error('Failed to initialize audit logger database', error);
    }
  }

  /**
   * Log an audit event
   */
  async log(event, data = {}, options = {}) {
    try {
      const auditEntry = {
        id: this.generateAuditId(),
        event,
        timestamp: new Date(),
        ...this.extractContext(data, options),
        data: this.sanitizeData(data),
        metadata: {
          version: '1.0',
          service: 'user-management',
          environment: process.env.NODE_ENV,
          ...options.metadata
        }
      };
      
      // Add hash for integrity verification
      auditEntry.hash = this.generateHash(auditEntry);
      
      // Store in database
      await this.storeAuditLog(auditEntry);
      
      // Check for critical events
      if (this.isCriticalEvent(event)) {
        await this.handleCriticalEvent(auditEntry);
      }
      
      // Update metrics
      await this.updateMetrics(event);
      
      return auditEntry.id;
      
    } catch (error) {
      this.logger.error('Failed to log audit event', { event, error });
      // Don't throw - audit logging should not break the application
    }
  }

  /**
   * Extract context information
   */
  extractContext(data, options) {
    const context = {};
    
    // User context
    if (data.userId || options.userId) {
      context.userId = data.userId || options.userId;
    }
    
    // Session context
    if (data.sessionId || options.sessionId) {
      context.sessionId = data.sessionId || options.sessionId;
    }
    
    // Request context
    if (options.req) {
      context.ip = this.getClientIp(options.req);
      context.userAgent = options.req.headers['user-agent'];
      context.correlationId = options.req.correlationId;
      context.method = options.req.method;
      context.path = options.req.path;
    }
    
    // Workspace context
    if (data.workspaceId || options.workspaceId) {
      context.workspaceId = data.workspaceId || options.workspaceId;
    }
    
    // Actor information (who performed the action)
    if (options.actor) {
      context.actor = {
        id: options.actor.id,
        type: options.actor.type || 'user',
        email: options.actor.email
      };
    }
    
    // Target information (who/what was affected)
    if (data.targetUserId || options.targetUserId) {
      context.target = {
        id: data.targetUserId || options.targetUserId,
        type: 'user'
      };
    }
    
    return context;
  }

  /**
   * Sanitize sensitive data
   */
  sanitizeData(data) {
    const sanitized = { ...data };
    const sensitiveFields = [
      'password', 
      'passwordHash', 
      'token', 
      'refreshToken',
      'secret',
      'apiKey',
      'privateKey',
      'certificate'
    ];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  /**
   * Generate audit entry ID
   */
  generateAuditId() {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate hash for integrity verification
   */
  generateHash(entry) {
    const content = JSON.stringify({
      event: entry.event,
      timestamp: entry.timestamp,
      userId: entry.userId,
      data: entry.data
    });
    
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Store audit log in database
   */
  async storeAuditLog(entry) {
    const db = this.mongoClient.getDb();
    await db.collection('audit_logs').insertOne(entry);
    
    // Also cache recent entries for quick access
    const cacheKey = `audit:recent:${entry.userId || 'system'}`;
    await this.redisClient.zadd(
      cacheKey,
      Date.now(),
      JSON.stringify(entry)
    );
    await this.redisClient.expire(cacheKey, 3600); // 1 hour cache
  }

  /**
   * Check if event is critical
   */
  isCriticalEvent(event) {
    const criticalEvents = [
      this.eventTypes.ACCOUNT_DELETED,
      this.eventTypes.SUSPICIOUS_ACTIVITY,
      this.eventTypes.BRUTE_FORCE_DETECTED,
      this.eventTypes.INVALID_TOKEN_USED,
      this.eventTypes.DATA_DELETED,
      this.eventTypes.PERMISSION_DENIED
    ];
    
    return criticalEvents.includes(event);
  }

  /**
   * Handle critical events
   */
  async handleCriticalEvent(entry) {
    // Send alert
    this.logger.warn('Critical audit event', {
      event: entry.event,
      userId: entry.userId,
      ip: entry.ip
    });
    
    // Store in critical events collection
    const db = this.mongoClient.getDb();
    await db.collection('critical_audit_events').insertOne({
      ...entry,
      alertedAt: new Date()
    });
    
    // Trigger notifications (implement based on your notification service)
    // await this.notificationService.sendCriticalAlert(entry);
  }

  /**
   * Update audit metrics
   */
  async updateMetrics(event) {
    const key = `audit:metrics:${event}:${new Date().toISOString().slice(0, 10)}`;
    await this.redisClient.incr(key);
    await this.redisClient.expire(key, 86400 * 30); // 30 days
  }

  /**
   * Get client IP from request
   */
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip;
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}, options = {}) {
    const {
      userId,
      event,
      startDate,
      endDate,
      ip,
      workspaceId,
      correlationId
    } = filters;
    
    const {
      limit = 100,
      skip = 0,
      sort = { timestamp: -1 }
    } = options;
    
    const query = {};
    
    if (userId) query.userId = userId;
    if (event) query.event = event;
    if (ip) query.ip = ip;
    if (workspaceId) query.workspaceId = workspaceId;
    if (correlationId) query.correlationId = correlationId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const db = this.mongoClient.getDb();
    const logs = await db.collection('audit_logs')
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
    
    const total = await db.collection('audit_logs').countDocuments(query);
    
    return {
      logs,
      total,
      page: Math.floor(skip / limit) + 1,
      pages: Math.ceil(total / limit)
    };
  }

  /**
   * Get user activity summary
   */
  async getUserActivity(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const db = this.mongoClient.getDb();
    const activity = await db.collection('audit_logs').aggregate([
      {
        $match: {
          userId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            event: '$event'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          events: {
            $push: {
              event: '$_id.event',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]).toArray();
    
    return activity;
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(auditId) {
    const db = this.mongoClient.getDb();
    const entry = await db.collection('audit_logs').findOne({ id: auditId });
    
    if (!entry) {
      return { valid: false, reason: 'Entry not found' };
    }
    
    const expectedHash = this.generateHash(entry);
    const valid = entry.hash === expectedHash;
    
    return {
      valid,
      reason: valid ? 'Valid' : 'Hash mismatch - entry may have been tampered with'
    };
  }

  /**
   * Export audit logs for compliance
   */
  async exportLogs(filters, format = 'json') {
    const { logs } = await this.queryLogs(filters, { limit: 10000 });
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    } else if (format === 'csv') {
      return this.convertToCSV(logs);
    }
    
    throw new Error(`Unsupported format: ${format}`);
  }

  /**
   * Convert logs to CSV format
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]).join(',');
    const rows = logs.map(log => 
      Object.values(log).map(value => 
        typeof value === 'object' ? JSON.stringify(value) : value
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }

  /**
   * Get audit statistics
   */
  async getStatistics(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const db = this.mongoClient.getDb();
    const stats = await db.collection('audit_logs').aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $facet: {
          byEvent: [
            {
              $group: {
                _id: '$event',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          byUser: [
            {
              $group: {
                _id: '$userId',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          byDay: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          total: [
            {
              $count: 'count'
            }
          ]
        }
      }
    ]).toArray();
    
    return stats[0];
  }
}

export default AuditLogger;