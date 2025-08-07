// ==========================================
// PACKAGES/COMMON/src/database/index-manager.js
// ==========================================

/**
 * Database Index Manager - Creates and manages MongoDB indexes across all services
 * Optimizes query performance for production workloads
 */
export class IndexManager {
  constructor(mongoClient, logger) {
    this.mongoClient = mongoClient;
    this.logger = logger;
    this.indexDefinitions = this.getIndexDefinitions();
  }

  /**
   * Initialize all database indexes
   */
  async initializeAllIndexes() {
    try {
      const db = this.mongoClient.getDb();
      const startTime = Date.now();
      let totalIndexes = 0;
      let createdIndexes = 0;
      let errors = 0;

      this.logger.info('Starting database index initialization...');

      for (const [collectionName, indexes] of Object.entries(this.indexDefinitions)) {
        try {
          const result = await this.createCollectionIndexes(db, collectionName, indexes);
          totalIndexes += result.totalIndexes;
          createdIndexes += result.createdIndexes;
          errors += result.errors;
          
          this.logger.info(`Indexes processed for ${collectionName}`, {
            collection: collectionName,
            totalIndexes: result.totalIndexes,
            created: result.createdIndexes,
            errors: result.errors,
          });
          
        } catch (error) {
          this.logger.error(`Failed to create indexes for collection ${collectionName}`, error);
          errors++;
        }
      }

      const duration = Date.now() - startTime;
      
      this.logger.info('Database index initialization completed', {
        totalCollections: Object.keys(this.indexDefinitions).length,
        totalIndexes,
        createdIndexes,
        errors,
        duration,
      });

      return {
        success: errors === 0,
        totalCollections: Object.keys(this.indexDefinitions).length,
        totalIndexes,
        createdIndexes,
        errors,
        duration,
      };

    } catch (error) {
      this.logger.error('Database index initialization failed', error);
      throw error;
    }
  }

  /**
   * Create indexes for a specific collection
   */
  async createCollectionIndexes(db, collectionName, indexDefinitions) {
    let totalIndexes = 0;
    let createdIndexes = 0;
    let errors = 0;

    try {
      const collection = db.collection(collectionName);

      for (const indexDef of indexDefinitions) {
        totalIndexes++;
        try {
          await collection.createIndex(indexDef.key, {
            name: indexDef.name,
            background: true,
            ...indexDef.options,
          });
          
          createdIndexes++;
          
          this.logger.debug('Index created successfully', {
            collection: collectionName,
            index: indexDef.name,
            key: indexDef.key,
          });
          
        } catch (error) {
          if (error.message.includes('already exists')) {
            this.logger.debug('Index already exists', {
              collection: collectionName,
              index: indexDef.name,
            });
          } else {
            this.logger.warn('Failed to create index', error, {
              collection: collectionName,
              index: indexDef.name,
            });
            errors++;
          }
        }
      }

    } catch (error) {
      this.logger.error(`Failed to process collection ${collectionName}`, error);
      errors = totalIndexes; // All indexes failed for this collection
    }

    return { totalIndexes, createdIndexes, errors };
  }

  /**
   * Get index definitions for all collections
   */
  getIndexDefinitions() {
    return {
      // Flow Service - Flows Collection
      flows: [
        // Project and workspace queries
        {
          name: 'project_workspace_status',
          key: { 'metadata.projectId': 1, 'metadata.workspaceId': 1, 'metadata.status': 1 },
          options: { background: true },
        },
        
        // User queries
        {
          name: 'created_by_status',
          key: { 'metadata.createdBy': 1, 'metadata.status': 1 },
          options: { background: true },
        },
        
        // Sorting and filtering
        {
          name: 'updated_at_status',
          key: { 'metadata.updatedAt': -1, 'metadata.status': 1 },
          options: { background: true },
        },
        {
          name: 'created_at_status',
          key: { 'metadata.createdAt': -1, 'metadata.status': 1 },
          options: { background: true },
        },
        
        // Search optimization
        {
          name: 'search_text',
          key: { 'metadata.flowName': 'text', 'metadata.description': 'text' },
          options: { background: true },
        },
        
        // Template and version queries
        {
          name: 'template_status',
          key: { 'metadata.template': 1, 'metadata.status': 1 },
          options: { background: true },
        },
        {
          name: 'version',
          key: { 'metadata.version': 1 },
          options: { background: true },
        },

        // Performance optimization for large datasets
        {
          name: 'workspace_updated_at',
          key: { 'metadata.workspaceId': 1, 'metadata.updatedAt': -1 },
          options: { background: true },
        },
      ],

      // Flow Service - Flow Versions Collection
      flow_versions: [
        {
          name: 'flow_id_version',
          key: { flowId: 1, version: -1 },
          options: { background: true },
        },
        {
          name: 'flow_id_created_at',
          key: { flowId: 1, createdAt: -1 },
          options: { background: true },
        },
        {
          name: 'created_by',
          key: { createdBy: 1 },
          options: { background: true },
        },
      ],

      // User Management - Users Collection
      users: [
        // Authentication and lookup
        {
          name: 'email_unique',
          key: { email: 1 },
          options: { unique: true, background: true },
        },
        {
          name: 'workspace_id',
          key: { workspaceId: 1 },
          options: { background: true },
        },
        {
          name: 'status_role',
          key: { status: 1, role: 1 },
          options: { background: true },
        },
        
        // Security and auditing
        {
          name: 'last_login_at',
          key: { lastLoginAt: -1 },
          options: { background: true, sparse: true },
        },
        {
          name: 'created_at',
          key: { createdAt: -1 },
          options: { background: true },
        },
        {
          name: 'deleted_at',
          key: { deletedAt: 1 },
          options: { background: true, sparse: true },
        },

        // Security features
        {
          name: 'login_attempts_locked',
          key: { loginAttempts: 1, lockedUntil: 1 },
          options: { background: true, sparse: true },
        },

        // User search and filtering
        {
          name: 'name_search',
          key: { firstName: 'text', lastName: 'text', email: 'text' },
          options: { background: true },
        },
      ],

      // User Management - Workspaces Collection
      workspaces: [
        {
          name: 'name_unique',
          key: { name: 1 },
          options: { unique: true, background: true },
        },
        {
          name: 'owner_id',
          key: { ownerId: 1 },
          options: { background: true },
        },
        {
          name: 'status_type',
          key: { status: 1, type: 1 },
          options: { background: true },
        },
        {
          name: 'created_at',
          key: { createdAt: -1 },
          options: { background: true },
        },
        {
          name: 'updated_at',
          key: { updatedAt: -1 },
          options: { background: true },
        },
        
        // Workspace search
        {
          name: 'workspace_search',
          key: { name: 'text', description: 'text' },
          options: { background: true },
        },
      ],

      // User Management - User Sessions Collection
      user_sessions: [
        {
          name: 'user_id',
          key: { userId: 1 },
          options: { background: true },
        },
        {
          name: 'session_token',
          key: { sessionToken: 1 },
          options: { unique: true, background: true },
        },
        {
          name: 'expires_at',
          key: { expiresAt: 1 },
          options: { background: true, expireAfterSeconds: 0 }, // TTL index
        },
        {
          name: 'created_at',
          key: { createdAt: -1 },
          options: { background: true },
        },
      ],

      // Billing Service - Subscriptions Collection
      subscriptions: [
        {
          name: 'user_id',
          key: { userId: 1 },
          options: { background: true },
        },
        {
          name: 'workspace_id',
          key: { workspaceId: 1 },
          options: { background: true },
        },
        {
          name: 'status_plan',
          key: { status: 1, planId: 1 },
          options: { background: true },
        },
        {
          name: 'stripe_subscription_id',
          key: { stripeSubscriptionId: 1 },
          options: { unique: true, background: true, sparse: true },
        },
        {
          name: 'current_period_end',
          key: { currentPeriodEnd: 1 },
          options: { background: true },
        },
        {
          name: 'created_at',
          key: { createdAt: -1 },
          options: { background: true },
        },
      ],

      // Billing Service - Usage Records Collection
      usage_records: [
        {
          name: 'user_id_date',
          key: { userId: 1, date: -1 },
          options: { background: true },
        },
        {
          name: 'workspace_id_date',
          key: { workspaceId: 1, date: -1 },
          options: { background: true },
        },
        {
          name: 'subscription_id',
          key: { subscriptionId: 1 },
          options: { background: true },
        },
        {
          name: 'date',
          key: { date: -1 },
          options: { background: true },
        },
        {
          name: 'feature_usage',
          key: { feature: 1, date: -1 },
          options: { background: true },
        },
      ],

      // Billing Service - Invoices Collection
      invoices: [
        {
          name: 'user_id',
          key: { userId: 1 },
          options: { background: true },
        },
        {
          name: 'subscription_id',
          key: { subscriptionId: 1 },
          options: { background: true },
        },
        {
          name: 'stripe_invoice_id',
          key: { stripeInvoiceId: 1 },
          options: { unique: true, background: true, sparse: true },
        },
        {
          name: 'status_due_date',
          key: { status: 1, dueDate: 1 },
          options: { background: true },
        },
        {
          name: 'created_at',
          key: { createdAt: -1 },
          options: { background: true },
        },
      ],

      // Knowledge Service - Document Metadata Collection
      knowledge_documents: [
        {
          name: 'workspace_id',
          key: { workspaceId: 1 },
          options: { background: true, sparse: true },
        },
        {
          name: 'project_id',
          key: { projectId: 1 },
          options: { background: true, sparse: true },
        },
        {
          name: 'added_by',
          key: { addedBy: 1 },
          options: { background: true },
        },
        {
          name: 'scope_added_at',
          key: { scope: 1, addedAt: -1 },
          options: { background: true },
        },
        {
          name: 'document_search',
          key: { title: 'text', description: 'text' },
          options: { background: true },
        },
      ],

      // Cognitive Core - AI Request Logs Collection
      ai_request_logs: [
        {
          name: 'user_id_timestamp',
          key: { userId: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'workspace_id',
          key: { workspaceId: 1 },
          options: { background: true, sparse: true },
        },
        {
          name: 'provider_status',
          key: { provider: 1, status: 1 },
          options: { background: true },
        },
        {
          name: 'request_type',
          key: { requestType: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'timestamp_ttl',
          key: { timestamp: 1 },
          options: { background: true, expireAfterSeconds: 2592000 }, // 30 days TTL
        },
      ],

      // Audit Logs Collection (GDPR Compliance)
      audit_logs: [
        {
          name: 'user_id_timestamp',
          key: { userId: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'action_timestamp',
          key: { action: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'resource_type',
          key: { resourceType: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'ip_address',
          key: { ipAddress: 1 },
          options: { background: true, sparse: true },
        },
        {
          name: 'correlation_id',
          key: { correlationId: 1 },
          options: { background: true, sparse: true },
        },
      ],

      // System Metrics Collection
      system_metrics: [
        {
          name: 'service_timestamp',
          key: { service: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'metric_name',
          key: { metricName: 1, timestamp: -1 },
          options: { background: true },
        },
        {
          name: 'timestamp_ttl',
          key: { timestamp: 1 },
          options: { background: true, expireAfterSeconds: 604800 }, // 7 days TTL
        },
      ],

      // Notification Queue Collection
      notification_queue: [
        {
          name: 'user_id_status',
          key: { userId: 1, status: 1 },
          options: { background: true },
        },
        {
          name: 'scheduled_at',
          key: { scheduledAt: 1 },
          options: { background: true },
        },
        {
          name: 'type_priority',
          key: { type: 1, priority: -1 },
          options: { background: true },
        },
        {
          name: 'status_attempts',
          key: { status: 1, attempts: 1 },
          options: { background: true },
        },
      ],

      // Rate Limiting Collection
      rate_limits: [
        {
          name: 'identifier_window',
          key: { identifier: 1, windowStart: 1 },
          options: { background: true },
        },
        {
          name: 'expires_at_ttl',
          key: { expiresAt: 1 },
          options: { background: true, expireAfterSeconds: 0 }, // TTL index
        },
      ],
    };
  }

  /**
   * Create indexes for a specific service
   */
  async createServiceIndexes(serviceName) {
    const serviceCollections = this.getServiceCollections(serviceName);
    
    if (serviceCollections.length === 0) {
      this.logger.warn(`No collections found for service: ${serviceName}`);
      return;
    }

    const db = this.mongoClient.getDb();
    let totalCreated = 0;
    let totalErrors = 0;

    for (const collectionName of serviceCollections) {
      if (this.indexDefinitions[collectionName]) {
        const result = await this.createCollectionIndexes(
          db, 
          collectionName, 
          this.indexDefinitions[collectionName]
        );
        totalCreated += result.createdIndexes;
        totalErrors += result.errors;
      }
    }

    this.logger.info(`Service indexes created for ${serviceName}`, {
      service: serviceName,
      collections: serviceCollections,
      createdIndexes: totalCreated,
      errors: totalErrors,
    });

    return { serviceName, createdIndexes: totalCreated, errors: totalErrors };
  }

  /**
   * Get collections for a specific service
   */
  getServiceCollections(serviceName) {
    const serviceMapping = {
      'flow-service': ['flows', 'flow_versions'],
      'user-management': ['users', 'workspaces', 'user_sessions'],
      'billing-service': ['subscriptions', 'usage_records', 'invoices'],
      'knowledge-service': ['knowledge_documents'],
      'cognitive-core': ['ai_request_logs'],
      'common': ['audit_logs', 'system_metrics', 'notification_queue', 'rate_limits'],
    };

    return serviceMapping[serviceName] || [];
  }

  /**
   * Analyze existing indexes
   */
  async analyzeIndexes() {
    try {
      const db = this.mongoClient.getDb();
      const analysis = {
        collections: {},
        recommendations: [],
        totalIndexes: 0,
        unusedIndexes: [],
        duplicateIndexes: [],
      };

      const collections = await db.listCollections().toArray();
      
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        try {
          const collection = db.collection(collectionName);
          const indexes = await collection.indexes();
          
          analysis.collections[collectionName] = {
            indexCount: indexes.length,
            indexes: indexes.map(idx => ({
              name: idx.name,
              key: idx.key,
              unique: idx.unique || false,
              sparse: idx.sparse || false,
              background: idx.background || false,
            })),
          };
          
          analysis.totalIndexes += indexes.length;
          
          // Check for potential issues
          this.analyzeCollectionIndexes(collectionName, indexes, analysis);
          
        } catch (error) {
          this.logger.warn(`Failed to analyze indexes for ${collectionName}`, error);
        }
      }

      this.logger.info('Index analysis completed', {
        totalCollections: Object.keys(analysis.collections).length,
        totalIndexes: analysis.totalIndexes,
        recommendations: analysis.recommendations.length,
      });

      return analysis;
      
    } catch (error) {
      this.logger.error('Index analysis failed', error);
      throw error;
    }
  }

  /**
   * Analyze indexes for a specific collection
   */
  analyzeCollectionIndexes(collectionName, indexes, analysis) {
    // Check for duplicate indexes
    const keyStrings = indexes.map(idx => JSON.stringify(idx.key));
    const duplicates = keyStrings.filter((key, index) => keyStrings.indexOf(key) !== index);
    
    if (duplicates.length > 0) {
      analysis.duplicateIndexes.push({
        collection: collectionName,
        duplicateKeys: duplicates,
      });
      
      analysis.recommendations.push({
        type: 'duplicate_indexes',
        collection: collectionName,
        message: `Collection has duplicate indexes that should be removed`,
        severity: 'medium',
      });
    }

    // Check for too many indexes (performance impact)
    if (indexes.length > 20) {
      analysis.recommendations.push({
        type: 'too_many_indexes',
        collection: collectionName,
        message: `Collection has ${indexes.length} indexes, consider reviewing necessity`,
        severity: 'low',
      });
    }

    // Check for missing recommended indexes
    const recommendedIndexes = this.indexDefinitions[collectionName] || [];
    const existingIndexNames = indexes.map(idx => idx.name);
    
    for (const recommendedIndex of recommendedIndexes) {
      if (!existingIndexNames.includes(recommendedIndex.name)) {
        analysis.recommendations.push({
          type: 'missing_index',
          collection: collectionName,
          message: `Missing recommended index: ${recommendedIndex.name}`,
          severity: 'high',
          indexName: recommendedIndex.name,
          indexKey: recommendedIndex.key,
        });
      }
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats() {
    try {
      const db = this.mongoClient.getDb();
      const stats = {
        totalCollections: 0,
        totalIndexes: 0,
        indexSize: 0,
        collections: {},
      };

      const collections = await db.listCollections().toArray();
      stats.totalCollections = collections.length;

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        try {
          const collection = db.collection(collectionName);
          const collStats = await collection.stats();
          const indexes = await collection.indexes();
          
          stats.collections[collectionName] = {
            documents: collStats.count,
            indexCount: indexes.length,
            indexSize: collStats.totalIndexSize,
            dataSize: collStats.size,
          };
          
          stats.totalIndexes += indexes.length;
          stats.indexSize += collStats.totalIndexSize;
          
        } catch (error) {
          this.logger.debug(`Could not get stats for ${collectionName}`, error);
        }
      }

      return stats;
      
    } catch (error) {
      this.logger.error('Failed to get index statistics', error);
      throw error;
    }
  }

  /**
   * Drop unused indexes
   */
  async dropUnusedIndexes(dryRun = true) {
    if (dryRun) {
      this.logger.info('Running in dry-run mode - no indexes will be dropped');
    }

    const analysis = await this.analyzeIndexes();
    const dropped = [];
    
    for (const duplicate of analysis.duplicateIndexes) {
      const db = this.mongoClient.getDb();
      const collection = db.collection(duplicate.collection);
      
      // In a real implementation, you'd need more sophisticated logic
      // to determine which duplicate to drop
      if (!dryRun) {
        // This is a placeholder - implement actual duplicate removal logic
        this.logger.info('Would drop duplicate index', duplicate);
      } else {
        this.logger.info('Dry run - would drop duplicate index', duplicate);
      }
    }

    return dropped;
  }
}

export default IndexManager;