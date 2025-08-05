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
      this.client = new MongoDB(uri);
      await this.client.connect();
      this.db = this.client.db();
      this.isConnected = true;
      
      this.logger.info('MongoDB connected successfully', {
        database: this.db.databaseName,
      });
      
      return this.db;
    } catch (error) {
      this.logger.error('MongoDB connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      this.logger.info('MongoDB disconnected');
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

  // Health check
  async healthCheck() {
    try {
      await this.db.admin().ping();
      return { status: 'ok', latency: Date.now() };
    } catch (error) {
      this.logger.error('MongoDB health check failed', error);
      return { status: 'error', error: error.message };
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