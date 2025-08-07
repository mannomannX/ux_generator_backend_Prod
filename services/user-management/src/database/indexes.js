/**
 * Database Indexes Configuration
 * Comprehensive indexes for optimal query performance
 */

export class DatabaseIndexManager {
  constructor(mongoClient, logger) {
    this.mongoClient = mongoClient;
    this.logger = logger;
  }

  /**
   * Create all required indexes
   */
  async createAllIndexes() {
    try {
      const db = this.mongoClient.getDb();
      
      await Promise.all([
        this.createUserIndexes(db),
        this.createWorkspaceIndexes(db),
        this.createSessionIndexes(db),
        this.createTokenIndexes(db),
        this.createApiKeyIndexes(db),
        this.createAuditLogIndexes(db),
        this.createPasswordResetIndexes(db),
        this.createEmailVerificationIndexes(db),
        this.createSAMLIndexes(db),
        this.createRoleIndexes(db),
        this.createPermissionIndexes(db),
        this.createNotificationIndexes(db)
      ]);
      
      this.logger.info('All database indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create database indexes', error);
      throw error;
    }
  }

  /**
   * User collection indexes
   */
  async createUserIndexes(db) {
    await db.collection('users').createIndexes([
      // Unique constraints
      { key: { email: 1 }, unique: true, sparse: true },
      { key: { username: 1 }, unique: true, sparse: true },
      
      // Query optimization
      { key: { status: 1, createdAt: -1 } },
      { key: { emailVerified: 1 } },
      { key: { lastLoginAt: -1 } },
      { key: { 'profile.firstName': 1, 'profile.lastName': 1 } },
      
      // Full-text search
      { key: { email: 'text', 'profile.firstName': 'text', 'profile.lastName': 'text' } },
      
      // Compound indexes for common queries
      { key: { workspaceIds: 1, status: 1 } },
      { key: { roles: 1, status: 1 } },
      
      // TTL for soft-deleted users
      { key: { deletedAt: 1 }, expireAfterSeconds: 2592000 } // 30 days
    ]);
  }

  /**
   * Workspace collection indexes
   */
  async createWorkspaceIndexes(db) {
    await db.collection('workspaces').createIndexes([
      // Unique constraints
      { key: { slug: 1 }, unique: true },
      
      // Query optimization
      { key: { ownerId: 1 } },
      { key: { 'members.userId': 1 } },
      { key: { status: 1, createdAt: -1 } },
      { key: { plan: 1 } },
      
      // Compound indexes
      { key: { 'members.userId': 1, 'members.role': 1 } },
      { key: { ownerId: 1, status: 1 } },
      
      // Full-text search
      { key: { name: 'text', description: 'text' } }
    ]);
  }

  /**
   * Session collection indexes
   */
  async createSessionIndexes(db) {
    await db.collection('sessions').createIndexes([
      // Primary lookup
      { key: { sessionId: 1 }, unique: true },
      { key: { userId: 1, status: 1 } },
      
      // Security tracking
      { key: { ipAddress: 1 } },
      { key: { userAgent: 1 } },
      
      // Cleanup
      { key: { lastAccessedAt: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      
      // Compound indexes
      { key: { userId: 1, deviceId: 1 } },
      { key: { userId: 1, lastAccessedAt: -1 } }
    ]);
  }

  /**
   * Token collection indexes
   */
  async createTokenIndexes(db) {
    await db.collection('tokens').createIndexes([
      // Token lookups
      { key: { token: 1 }, unique: true },
      { key: { refreshToken: 1 }, unique: true, sparse: true },
      
      // User tokens
      { key: { userId: 1, type: 1 } },
      
      // Cleanup
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      
      // Blacklist checks
      { key: { blacklisted: 1, expiresAt: 1 } }
    ]);
  }

  /**
   * API Key collection indexes
   */
  async createApiKeyIndexes(db) {
    await db.collection('api_keys').createIndexes([
      // Key lookups
      { key: { keyHash: 1 }, unique: true },
      { key: { userId: 1, status: 1 } },
      
      // Management
      { key: { name: 1, userId: 1 } },
      { key: { lastUsedAt: -1 } },
      { key: { createdAt: -1 } },
      
      // Expiration
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      
      // Rotation tracking
      { key: { parentKeyId: 1 }, sparse: true },
      { key: { rotatedTo: 1 }, sparse: true }
    ]);
    
    // API key usage statistics
    await db.collection('api_key_usage').createIndexes([
      { key: { keyId: 1, timestamp: -1 } },
      { key: { userId: 1, timestamp: -1 } },
      { key: { endpoint: 1, timestamp: -1 } },
      
      // Cleanup old stats
      { key: { timestamp: 1 }, expireAfterSeconds: 2592000 } // 30 days
    ]);
  }

  /**
   * Audit log collection indexes
   */
  async createAuditLogIndexes(db) {
    await db.collection('audit_logs').createIndexes([
      // Time-based queries
      { key: { timestamp: -1 } },
      
      // User activity
      { key: { userId: 1, timestamp: -1 } },
      { key: { targetUserId: 1, timestamp: -1 } },
      
      // Event tracking
      { key: { event: 1, timestamp: -1 } },
      { key: { correlationId: 1 } },
      { key: { sessionId: 1 } },
      
      // Security monitoring
      { key: { ip: 1, timestamp: -1 } },
      { key: { 'metadata.severity': 1, timestamp: -1 } },
      
      // Workspace auditing
      { key: { workspaceId: 1, timestamp: -1 } },
      
      // Retention policy
      { key: { timestamp: 1 }, expireAfterSeconds: 63072000 } // 2 years
    ]);
    
    // Critical events collection
    await db.collection('critical_audit_events').createIndexes([
      { key: { timestamp: -1 } },
      { key: { event: 1, timestamp: -1 } },
      { key: { resolved: 1 } }
    ]);
  }

  /**
   * Password reset token indexes
   */
  async createPasswordResetIndexes(db) {
    await db.collection('password_reset_tokens').createIndexes([
      { key: { token: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { email: 1 } },
      { key: { used: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ]);
  }

  /**
   * Email verification token indexes
   */
  async createEmailVerificationIndexes(db) {
    await db.collection('email_verification_tokens').createIndexes([
      { key: { token: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { email: 1 } },
      { key: { verified: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ]);
  }

  /**
   * SAML configuration indexes
   */
  async createSAMLIndexes(db) {
    // SAML configurations
    await db.collection('saml_configurations').createIndexes([
      { key: { workspaceId: 1 }, unique: true },
      { key: { entityId: 1 } },
      { key: { enabled: 1 } },
      { key: { provider: 1 } }
    ]);
    
    // SAML sessions
    await db.collection('saml_sessions').createIndexes([
      { key: { sessionIndex: 1 }, unique: true },
      { key: { nameId: 1 } },
      { key: { userId: 1 } },
      { key: { workspaceId: 1 } },
      { key: { status: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ]);
    
    // SAML audit logs
    await db.collection('saml_audit_logs').createIndexes([
      { key: { workspaceId: 1, timestamp: -1 } },
      { key: { userId: 1, timestamp: -1 } },
      { key: { event: 1, timestamp: -1 } },
      { key: { timestamp: 1 }, expireAfterSeconds: 7776000 } // 90 days
    ]);
  }

  /**
   * Role collection indexes
   */
  async createRoleIndexes(db) {
    await db.collection('roles').createIndexes([
      { key: { name: 1 }, unique: true },
      { key: { workspaceId: 1 } },
      { key: { isSystem: 1 } },
      { key: { 'permissions.resource': 1, 'permissions.action': 1 } }
    ]);
  }

  /**
   * Permission collection indexes
   */
  async createPermissionIndexes(db) {
    await db.collection('permissions').createIndexes([
      { key: { userId: 1, resource: 1, action: 1 } },
      { key: { roleId: 1 } },
      { key: { workspaceId: 1 } },
      { key: { resource: 1, action: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ]);
  }

  /**
   * Notification collection indexes
   */
  async createNotificationIndexes(db) {
    await db.collection('notifications').createIndexes([
      { key: { userId: 1, read: 1, createdAt: -1 } },
      { key: { userId: 1, type: 1 } },
      { key: { workspaceId: 1, createdAt: -1 } },
      { key: { priority: -1, createdAt: -1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 }
    ]);
  }

  /**
   * Drop all indexes (use with caution)
   */
  async dropAllIndexes() {
    try {
      const db = this.mongoClient.getDb();
      const collections = [
        'users', 'workspaces', 'sessions', 'tokens', 'api_keys',
        'audit_logs', 'critical_audit_events', 'password_reset_tokens',
        'email_verification_tokens', 'saml_configurations', 'saml_sessions',
        'saml_audit_logs', 'roles', 'permissions', 'notifications'
      ];
      
      for (const collection of collections) {
        try {
          await db.collection(collection).dropIndexes();
          this.logger.info(`Dropped indexes for collection: ${collection}`);
        } catch (error) {
          this.logger.warn(`Failed to drop indexes for ${collection}:`, error.message);
        }
      }
      
      this.logger.info('All indexes dropped');
    } catch (error) {
      this.logger.error('Failed to drop indexes', error);
      throw error;
    }
  }

  /**
   * Analyze index usage
   */
  async analyzeIndexUsage() {
    try {
      const db = this.mongoClient.getDb();
      const collections = await db.listCollections().toArray();
      const analysis = {};
      
      for (const collection of collections) {
        const stats = await db.collection(collection.name).aggregate([
          { $indexStats: {} }
        ]).toArray();
        
        analysis[collection.name] = stats.map(stat => ({
          name: stat.name,
          accesses: stat.accesses.ops,
          since: stat.accesses.since,
          size: stat.size
        }));
      }
      
      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze index usage', error);
      return null;
    }
  }
}

export default DatabaseIndexManager;