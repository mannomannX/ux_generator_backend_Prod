/**
 * Learning Database Initializer
 * 
 * Responsible for setting up the complete learning database structure,
 * including collections, indexes, initial data, and configuration.
 * 
 * This ensures the learning system has a properly configured MongoDB
 * environment for optimal performance and data integrity.
 */

import { Logger } from '@ux-flow/common';

class LearningDatabaseInitializer {
  constructor(mongoClient, logger) {
    this.mongoClient = mongoClient;
    this.logger = logger || new Logger('LearningDBInitializer');
    
    // Database and collection configuration
    this.config = {
      databaseName: 'learning',
      collections: {
        episodes: {
          name: 'episodes',
          indexes: [
            { key: { 'indexFields.userId': 1 }, name: 'userId_1' },
            { key: { 'indexFields.agentUsed': 1 }, name: 'agentUsed_1' },
            { key: { 'indexFields.status': 1 }, name: 'status_1' },
            { key: { 'indexFields.createdAt': -1 }, name: 'createdAt_-1' },
            { key: { completedAt: 1 }, name: 'completedAt_1', sparse: true },
            { key: { analyzedAt: 1 }, name: 'analyzedAt_1', sparse: true },
            // Compound index for efficient queries
            { 
              key: { 'indexFields.status': 1, 'indexFields.agentUsed': 1, completedAt: 1 },
              name: 'compound_analysis_query'
            },
            // TTL index for automatic cleanup (optional)
            {
              key: { 'indexFields.createdAt': 1 },
              name: 'ttl_episodes',
              expireAfterSeconds: 7776000 // 90 days
            }
          ],
          validationSchema: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['episodeId', 'userId', 'status', 'createdAt'],
              properties: {
                episodeId: { bsonType: 'string' },
                userId: { bsonType: 'string' },
                status: { 
                  bsonType: 'string',
                  enum: ['active', 'completed', 'expired', 'analyzed']
                },
                agentUsed: { bsonType: 'string' },
                classification: { bsonType: 'object' },
                indexFields: { 
                  bsonType: 'object',
                  required: ['userId', 'status', 'createdAt']
                }
              }
            }
          }
        },
        suggestions: {
          name: 'prompt_suggestions',
          indexes: [
            { key: { status: 1 }, name: 'status_1' },
            { key: { sourceAgent: 1 }, name: 'sourceAgent_1' },
            { key: { createdAt: -1 }, name: 'createdAt_-1' },
            { key: { reviewedAt: 1 }, name: 'reviewedAt_1', sparse: true },
            { key: { priority: -1 }, name: 'priority_-1' },
            { key: { 'evidence.episodeId': 1 }, name: 'episodeId_1', sparse: true },
            { key: { confidence: -1 }, name: 'confidence_-1' },
            // Text search index
            {
              key: {
                detectedProblem: 'text',
                'evidence.userFeedback': 'text',
                sourceAgent: 'text',
                recommendation: 'text'
              },
              name: 'text_search_index'
            },
            // Compound indexes for admin queries
            {
              key: { status: 1, priority: -1, createdAt: -1 },
              name: 'admin_listing_index'
            }
          ],
          validationSchema: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['suggestionId', 'sourceAgent', 'detectedProblem', 'status', 'createdAt'],
              properties: {
                suggestionId: { bsonType: 'string' },
                sourceAgent: { bsonType: 'string' },
                detectedProblem: { bsonType: 'string' },
                status: {
                  bsonType: 'string',
                  enum: ['new', 'approved', 'rejected', 'implemented']
                },
                confidence: { 
                  bsonType: 'number',
                  minimum: 0,
                  maximum: 1
                },
                priority: {
                  bsonType: 'number',
                  minimum: 1,
                  maximum: 10
                }
              }
            }
          }
        },
        implementations: {
          name: 'prompt_implementations',
          indexes: [
            { key: { suggestionId: 1 }, name: 'suggestionId_1' },
            { key: { implementedBy: 1 }, name: 'implementedBy_1' },
            { key: { status: 1 }, name: 'status_1' },
            { key: { startTime: -1 }, name: 'startTime_-1' },
            { key: { completedAt: -1 }, name: 'completedAt_-1', sparse: true },
            { key: { sourceAgent: 1 }, name: 'sourceAgent_1' }
          ]
        },
        systemConfig: {
          name: 'learning_system_config',
          indexes: [
            { key: { configKey: 1 }, name: 'configKey_1', unique: true }
          ]
        },
        auditLog: {
          name: 'learning_audit_log',
          indexes: [
            { key: { timestamp: -1 }, name: 'timestamp_-1' },
            { key: { userId: 1 }, name: 'userId_1' },
            { key: { action: 1 }, name: 'action_1' },
            { key: { entityType: 1 }, name: 'entityType_1' },
            // TTL for log cleanup
            {
              key: { timestamp: 1 },
              name: 'ttl_audit_log',
              expireAfterSeconds: 15552000 // 180 days
            }
          ]
        }
      }
    };
    
    // Default system configuration
    this.defaultConfig = [
      {
        configKey: 'learning_system_version',
        value: '1.0.0',
        description: 'Current version of the learning system',
        updatedAt: new Date()
      },
      {
        configKey: 'episode_retention_days',
        value: 90,
        description: 'Number of days to retain learning episodes',
        updatedAt: new Date()
      },
      {
        configKey: 'suggestion_auto_approve_threshold',
        value: 0.95,
        description: 'Confidence threshold for automatic suggestion approval',
        updatedAt: new Date()
      },
      {
        configKey: 'max_suggestions_per_agent',
        value: 50,
        description: 'Maximum number of pending suggestions per agent',
        updatedAt: new Date()
      },
      {
        configKey: 'learning_system_enabled',
        value: true,
        description: 'Master switch for the learning system',
        updatedAt: new Date()
      }
    ];
  }

  /**
   * Initialize the complete learning database
   */
  async initialize() {
    try {
      this.logger.info('Starting learning database initialization');

      const db = this.mongoClient.db(this.config.databaseName);
      
      // Check if database already exists and is initialized
      const isInitialized = await this.checkIfInitialized(db);
      if (isInitialized) {
        this.logger.info('Learning database already initialized');
        await this.updateIndexes(db); // Still update indexes in case of changes
        return { alreadyInitialized: true };
      }

      // Create collections with validation schemas
      await this.createCollections(db);
      
      // Create indexes for performance
      await this.createIndexes(db);
      
      // Insert default configuration
      await this.insertDefaultConfiguration(db);
      
      // Mark as initialized
      await this.markAsInitialized(db);
      
      // Verify initialization
      await this.verifyInitialization(db);
      
      this.logger.info('Learning database initialization completed successfully');
      
      return { 
        success: true,
        collections: Object.keys(this.config.collections).length,
        indexes: this.getTotalIndexCount(),
        configEntries: this.defaultConfig.length
      };
      
    } catch (error) {
      this.logger.error('Learning database initialization failed', error);
      throw error;
    }
  }

  /**
   * Create all collections with validation schemas
   */
  async createCollections(db) {
    this.logger.info('Creating learning database collections');
    
    const operations = Object.values(this.config.collections).map(async (collection) => {
      try {
        const options = {};
        
        if (collection.validationSchema) {
          options.validator = collection.validationSchema;
          options.validationLevel = 'strict';
          options.validationAction = 'error';
        }
        
        await db.createCollection(collection.name, options);
        
        this.logger.debug(`Created collection: ${collection.name}`);
      } catch (error) {
        if (error.code === 48) { // Collection already exists
          this.logger.debug(`Collection already exists: ${collection.name}`);
        } else {
          throw error;
        }
      }
    });
    
    await Promise.all(operations);
  }

  /**
   * Create indexes for all collections
   */
  async createIndexes(db) {
    this.logger.info('Creating database indexes');
    
    const indexOperations = [];
    
    for (const [collectionKey, collection] of Object.entries(this.config.collections)) {
      if (collection.indexes && collection.indexes.length > 0) {
        const col = db.collection(collection.name);
        
        for (const indexSpec of collection.indexes) {
          indexOperations.push(
            col.createIndex(indexSpec.key, {
              name: indexSpec.name,
              background: true,
              sparse: indexSpec.sparse || false,
              expireAfterSeconds: indexSpec.expireAfterSeconds,
              unique: indexSpec.unique || false
            }).catch(error => {
              // Log but don't fail if index already exists
              if (error.code !== 85) { // Index already exists
                this.logger.warn(`Failed to create index ${indexSpec.name} on ${collection.name}`, error);
              }
            })
          );
        }
      }
    }
    
    await Promise.all(indexOperations);
    this.logger.info(`Created ${indexOperations.length} database indexes`);
  }

  /**
   * Update existing indexes (for migrations)
   */
  async updateIndexes(db) {
    // In a production system, this would handle index migrations
    // For now, we just ensure critical indexes exist
    await this.createIndexes(db);
  }

  /**
   * Insert default system configuration
   */
  async insertDefaultConfiguration(db) {
    this.logger.info('Inserting default system configuration');
    
    const configCollection = db.collection(this.config.collections.systemConfig.name);
    
    const insertOperations = this.defaultConfig.map(async (config) => {
      try {
        await configCollection.insertOne(config);
      } catch (error) {
        if (error.code === 11000) { // Duplicate key error
          // Update existing config
          await configCollection.updateOne(
            { configKey: config.configKey },
            { 
              $set: { 
                value: config.value,
                description: config.description,
                updatedAt: new Date()
              }
            }
          );
        } else {
          throw error;
        }
      }
    });
    
    await Promise.all(insertOperations);
    this.logger.info(`Inserted ${this.defaultConfig.length} configuration entries`);
  }

  /**
   * Check if database is already initialized
   */
  async checkIfInitialized(db) {
    try {
      const configCollection = db.collection(this.config.collections.systemConfig.name);
      const versionConfig = await configCollection.findOne({ configKey: 'learning_system_version' });
      return !!versionConfig;
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark database as initialized
   */
  async markAsInitialized(db) {
    const configCollection = db.collection(this.config.collections.systemConfig.name);
    
    await configCollection.updateOne(
      { configKey: 'database_initialized' },
      {
        $set: {
          configKey: 'database_initialized',
          value: true,
          description: 'Database initialization timestamp',
          initializedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  }

  /**
   * Verify initialization completed successfully
   */
  async verifyInitialization(db) {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    const requiredCollections = Object.values(this.config.collections).map(c => c.name);
    const missingCollections = requiredCollections.filter(name => !collectionNames.includes(name));
    
    if (missingCollections.length > 0) {
      throw new Error(`Missing collections after initialization: ${missingCollections.join(', ')}`);
    }
    
    // Verify configuration exists
    const configCollection = db.collection(this.config.collections.systemConfig.name);
    const configCount = await configCollection.countDocuments();
    
    if (configCount < this.defaultConfig.length) {
      throw new Error('Configuration not properly initialized');
    }
    
    this.logger.info('Database initialization verification passed');
  }

  /**
   * Get total number of indexes to be created
   */
  getTotalIndexCount() {
    return Object.values(this.config.collections)
      .reduce((total, collection) => total + (collection.indexes?.length || 0), 0);
  }

  /**
   * Clean up old data (maintenance function)
   */
  async cleanupOldData(options = {}) {
    const db = this.mongoClient.db(this.config.databaseName);
    const {
      episodeRetentionDays = 90,
      auditLogRetentionDays = 180,
      dryRun = false
    } = options;

    const results = {
      episodesDeleted: 0,
      auditLogsDeleted: 0,
      errors: []
    };

    try {
      // Clean up old episodes
      const episodesCutoff = new Date();
      episodesCutoff.setDate(episodesCutoff.getDate() - episodeRetentionDays);

      const episodesQuery = {
        'indexFields.createdAt': { $lt: episodesCutoff },
        'indexFields.status': { $in: ['expired', 'analyzed'] }
      };

      if (dryRun) {
        results.episodesDeleted = await db.collection('episodes').countDocuments(episodesQuery);
      } else {
        const episodesResult = await db.collection('episodes').deleteMany(episodesQuery);
        results.episodesDeleted = episodesResult.deletedCount;
      }

      // Clean up old audit logs  
      const auditCutoff = new Date();
      auditCutoff.setDate(auditCutoff.getDate() - auditLogRetentionDays);

      const auditQuery = { timestamp: { $lt: auditCutoff } };

      if (dryRun) {
        results.auditLogsDeleted = await db.collection('learning_audit_log').countDocuments(auditQuery);
      } else {
        const auditResult = await db.collection('learning_audit_log').deleteMany(auditQuery);
        results.auditLogsDeleted = auditResult.deletedCount;
      }

      this.logger.info('Database cleanup completed', results);

    } catch (error) {
      this.logger.error('Database cleanup failed', error);
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Get database health status
   */
  async getHealthStatus() {
    try {
      const db = this.mongoClient.db(this.config.databaseName);
      
      // Check collections exist
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Check configuration
      const configCollection = db.collection('learning_system_config');
      const configCount = await configCollection.countDocuments();
      
      // Count documents in each collection
      const documentCounts = {};
      for (const [key, collection] of Object.entries(this.config.collections)) {
        try {
          documentCounts[collection.name] = await db.collection(collection.name).estimatedDocumentCount();
        } catch (error) {
          documentCounts[collection.name] = 'error';
        }
      }
      
      return {
        status: 'healthy',
        database: this.config.databaseName,
        collectionsFound: collectionNames.length,
        collectionsExpected: Object.keys(this.config.collections).length,
        configEntries: configCount,
        documentCounts,
        lastChecked: new Date()
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Reset database (dangerous - use only in development)
   */
  async resetDatabase(confirm = false) {
    if (!confirm) {
      throw new Error('Database reset requires explicit confirmation');
    }
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is not allowed in production');
    }
    
    this.logger.warn('RESETTING LEARNING DATABASE - ALL DATA WILL BE LOST');
    
    const db = this.mongoClient.db(this.config.databaseName);
    await db.dropDatabase();
    
    this.logger.warn('Learning database reset completed');
    
    // Re-initialize
    return await this.initialize();
  }
}

export { LearningDatabaseInitializer };