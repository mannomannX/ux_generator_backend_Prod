// ==========================================
// PACKAGES/COMMON/src/database/mongo-client.js
// ==========================================
import { MongoClient as MongoDB, ObjectId } from 'mongodb';

class MongoClient {
  constructor(logger) {
    this.logger = logger;
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect(uri = process.env.MONGODB_URI) {
    try {
      // Enhanced connection options for production
      const connectionOptions = {
        // Connection Pool settings
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 50,
        minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE) || 5,
        maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS) || 30000,
        
        // Server Discovery and Monitoring
        serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 5000,
        socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS) || 45000,
        
        // Connection Timeout
        connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 10000,
        
        // Heartbeat Frequency
        heartbeatFrequencyMS: parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY_MS) || 10000,
        
        // Retry Logic
        retryWrites: true,
        retryReads: true,
        
        // Compression (if supported)
        compressors: process.env.MONGODB_COMPRESSORS ? process.env.MONGODB_COMPRESSORS.split(',') : ['snappy', 'zlib'],
        
        // Monitoring
        monitorCommands: process.env.NODE_ENV === 'development',
      };

      this.client = new MongoDB(uri, connectionOptions);
      
      // Set up connection monitoring
      this.setupConnectionMonitoring();
      
      await this.client.connect();
      this.db = this.client.db();
      this.isConnected = true;
      
      this.logger.info('MongoDB connected successfully with connection pooling', {
        database: this.db.databaseName,
        maxPoolSize: connectionOptions.maxPoolSize,
        minPoolSize: connectionOptions.minPoolSize,
        serverSelectionTimeout: connectionOptions.serverSelectionTimeoutMS,
        compressors: connectionOptions.compressors,
      });
      
      return this.db;
    } catch (error) {
      this.logger.error('MongoDB connection failed', error);
      throw error;
    }
  }

  setupConnectionMonitoring() {
    if (!this.client) return;

    // Connection pool monitoring
    this.client.on('connectionPoolCreated', (event) => {
      this.logger.debug('MongoDB connection pool created', {
        address: event.address,
        maxPoolSize: event.options?.maxPoolSize,
        minPoolSize: event.options?.minPoolSize,
      });
    });

    this.client.on('connectionPoolReady', (event) => {
      this.logger.info('MongoDB connection pool ready', {
        address: event.address,
      });
    });

    this.client.on('connectionPoolClosed', (event) => {
      this.logger.warn('MongoDB connection pool closed', {
        address: event.address,
      });
    });

    this.client.on('connectionCreated', (event) => {
      this.logger.debug('MongoDB connection created', {
        address: event.address,
        connectionId: event.connectionId,
      });
    });

    this.client.on('connectionReady', (event) => {
      this.logger.debug('MongoDB connection ready', {
        address: event.address,
        connectionId: event.connectionId,
      });
    });

    this.client.on('connectionClosed', (event) => {
      this.logger.debug('MongoDB connection closed', {
        address: event.address,
        connectionId: event.connectionId,
        reason: event.reason,
      });
    });

    this.client.on('connectionCheckOutStarted', (event) => {
      this.logger.debug('MongoDB connection checkout started', {
        address: event.address,
      });
    });

    this.client.on('connectionCheckOutFailed', (event) => {
      this.logger.warn('MongoDB connection checkout failed', {
        address: event.address,
        reason: event.reason,
      });
    });

    // Server monitoring
    this.client.on('serverHeartbeatStarted', (event) => {
      this.logger.debug('MongoDB server heartbeat started', {
        address: event.address,
      });
    });

    this.client.on('serverHeartbeatSucceeded', (event) => {
      this.logger.debug('MongoDB server heartbeat succeeded', {
        address: event.address,
        duration: event.duration,
      });
    });

    this.client.on('serverHeartbeatFailed', (event) => {
      this.logger.warn('MongoDB server heartbeat failed', {
        address: event.address,
        failure: event.failure,
      });
    });

    // Command monitoring (only in development)
    if (process.env.NODE_ENV === 'development') {
      this.client.on('commandStarted', (event) => {
        this.logger.debug('MongoDB command started', {
          commandName: event.commandName,
          databaseName: event.databaseName,
          requestId: event.requestId,
        });
      });

      this.client.on('commandSucceeded', (event) => {
        this.logger.debug('MongoDB command succeeded', {
          commandName: event.commandName,
          duration: event.duration,
          requestId: event.requestId,
        });
      });

      this.client.on('commandFailed', (event) => {
        this.logger.error('MongoDB command failed', {
          commandName: event.commandName,
          failure: event.failure,
          duration: event.duration,
          requestId: event.requestId,
        });
      });
    }
  }

  async disconnect() {
    if (this.client) {
      // Gracefully close all connections
      await this.client.close(true);
      this.isConnected = false;
      this.logger.info('MongoDB disconnected gracefully');
    }
  }

  getDb() {
    if (!this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  // Common database operations with logging
  async insertDocument(collection, document) {
    const result = await this.db.collection(collection).insertOne(document);
    this.logger.debug('Document inserted', {
      collection,
      insertedId: result.insertedId,
    });
    return result;
  }

  async findDocument(collection, query) {
    const result = await this.db.collection(collection).findOne(query);
    this.logger.debug('Document found', {
      collection,
      found: !!result,
    });
    return result;
  }

  async updateDocument(collection, query, update) {
    const result = await this.db.collection(collection).updateOne(query, update);
    this.logger.debug('Document updated', {
      collection,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
    return result;
  }

  // Health check with connection pool stats
  async healthCheck() {
    try {
      const startTime = Date.now();
      await this.db.admin().ping();
      const latency = Date.now() - startTime;
      
      // Get connection pool statistics
      const poolStats = this.getConnectionPoolStats();
      
      return { 
        status: 'ok', 
        latency,
        connectionPool: poolStats,
        database: this.db.databaseName,
      };
    } catch (error) {
      this.logger.error('MongoDB health check failed', error);
      return { status: 'error', error: error.message };
    }
  }

  // Get connection pool statistics
  getConnectionPoolStats() {
    if (!this.client || !this.client.topology) {
      return { available: false };
    }

    try {
      const servers = this.client.topology.s.servers;
      let totalConnections = 0;
      let availableConnections = 0;
      let maxPoolSize = 0;
      let minPoolSize = 0;

      for (const [, server] of servers) {
        if (server.pool) {
          totalConnections += server.pool.totalConnectionCount || 0;
          availableConnections += server.pool.availableConnectionCount || 0;
          maxPoolSize = Math.max(maxPoolSize, server.pool.options.maxPoolSize || 0);
          minPoolSize = Math.max(minPoolSize, server.pool.options.minPoolSize || 0);
        }
      }

      return {
        available: true,
        totalConnections,
        availableConnections,
        checkedOutConnections: totalConnections - availableConnections,
        maxPoolSize,
        minPoolSize,
        utilizationPercentage: totalConnections > 0 ? 
          Math.round((totalConnections - availableConnections) / totalConnections * 100) : 0,
      };
    } catch (error) {
      this.logger.warn('Failed to get connection pool stats', error);
      return { available: false, error: error.message };
    }
  }

  // Utility to create ObjectId
  static createObjectId(id) {
    return id ? new ObjectId(id) : new ObjectId();
  }

  static isValidObjectId(id) {
    return ObjectId.isValid(id);
  }
}

export { MongoClient };