/**
 * ChromaDB Connection Manager
 * Centralized ChromaDB client management with connection pooling and error handling
 */

import { ChromaClient } from '@chromadb/client';

class ChromaDBManager {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      host: process.env.CHROMADB_HOST || 'localhost',
      port: parseInt(process.env.CHROMADB_PORT) || 8000,
      ssl: process.env.CHROMADB_SSL === 'true',
      apiKey: process.env.CHROMADB_API_KEY,
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 5000,
      ...config
    };

    this.client = null;
    this.connected = false;
    this.collections = new Map();
    this.connectionPromise = null;
  }

  /**
   * Initialize ChromaDB connection with retry logic
   */
  async connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }

    return this.client;
  }

  async _connect() {
    if (this.connected && this.client) {
      return this.client;
    }

    let retries = 0;
    let lastError;

    while (retries < this.config.maxRetries) {
      try {
        this.logger.info('Connecting to ChromaDB', {
          host: this.config.host,
          port: this.config.port,
          attempt: retries + 1
        });

        // Create ChromaDB client
        this.client = new ChromaClient({
          path: `http${this.config.ssl ? 's' : ''}://${this.config.host}:${this.config.port}`,
          fetchOptions: {
            headers: this.config.apiKey ? {
              'Authorization': `Bearer ${this.config.apiKey}`
            } : undefined,
            timeout: this.config.connectionTimeout
          }
        });

        // Test connection by listing collections
        await this.client.listCollections();

        this.connected = true;
        this.logger.info('Successfully connected to ChromaDB');
        
        return this.client;
      } catch (error) {
        lastError = error;
        retries++;
        
        this.logger.warn(`ChromaDB connection attempt ${retries} failed`, {
          error: error.message,
          willRetry: retries < this.config.maxRetries
        });

        if (retries < this.config.maxRetries) {
          await this.sleep(this.config.retryDelay * retries);
        }
      }
    }

    this.logger.error('Failed to connect to ChromaDB after all retries', lastError);
    throw new Error(`ChromaDB connection failed: ${lastError.message}`);
  }

  /**
   * Get or create a collection with caching
   */
  async getOrCreateCollection(name, metadata = {}) {
    if (!this.connected) {
      await this.connect();
    }

    // Check cache first
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }

    try {
      // Try to get existing collection
      let collection;
      try {
        collection = await this.client.getCollection({ name });
        this.logger.debug(`Retrieved existing collection: ${name}`);
      } catch (error) {
        // Collection doesn't exist, create it
        collection = await this.client.createCollection({
          name,
          metadata: {
            ...metadata,
            created_at: new Date().toISOString()
          }
        });
        this.logger.info(`Created new collection: ${name}`);
      }

      // Cache the collection
      this.collections.set(name, collection);
      return collection;
    } catch (error) {
      this.logger.error(`Failed to get or create collection: ${name}`, error);
      throw error;
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      await this.client.deleteCollection({ name });
      this.collections.delete(name);
      this.logger.info(`Deleted collection: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to delete collection: ${name}`, error);
      throw error;
    }
  }

  /**
   * List all collections
   */
  async listCollections() {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const collections = await this.client.listCollections();
      return collections;
    } catch (error) {
      this.logger.error('Failed to list collections', error);
      throw error;
    }
  }

  /**
   * Check connection health
   */
  async isHealthy() {
    try {
      if (!this.connected) {
        return false;
      }

      // Test connection with a simple operation
      await this.client.heartbeat();
      return true;
    } catch (error) {
      this.logger.warn('ChromaDB health check failed', error);
      return false;
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (this.client) {
      this.collections.clear();
      this.connected = false;
      this.client = null;
      this.logger.info('Disconnected from ChromaDB');
    }
  }

  /**
   * Reset connection (useful for error recovery)
   */
  async reset() {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Get client for direct operations
   */
  getClient() {
    if (!this.connected || !this.client) {
      throw new Error('ChromaDB not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Helper method for sleep/delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      connected: this.connected,
      collectionsCount: this.collections.size,
      cachedCollections: Array.from(this.collections.keys()),
      config: {
        host: this.config.host,
        port: this.config.port,
        ssl: this.config.ssl
      }
    };
  }
}

// Export singleton instance
let instance = null;

export class ChromaDBConnectionManager {
  static getInstance(logger, config) {
    if (!instance) {
      instance = new ChromaDBManager(logger, config);
    }
    return instance;
  }

  static async getConnection(logger, config) {
    const manager = ChromaDBConnectionManager.getInstance(logger, config);
    await manager.connect();
    return manager;
  }

  static async resetConnection() {
    if (instance) {
      await instance.reset();
    }
  }
}

export { ChromaDBManager };