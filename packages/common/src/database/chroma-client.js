import axios from 'axios';

/**
 * ChromaDB client for vector database operations
 * Used for RAG (Retrieval-Augmented Generation) and semantic search
 */
class ChromaClient {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      host: config.host || process.env.CHROMADB_HOST || 'localhost',
      port: config.port || process.env.CHROMADB_PORT || 8000,
      ssl: config.ssl || process.env.CHROMADB_SSL === 'true',
      apiKey: config.apiKey || process.env.CHROMADB_API_KEY,
      tenant: config.tenant || 'default_tenant',
      database: config.database || 'default_database',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000
    };

    // Build base URL
    const protocol = this.config.ssl ? 'https' : 'http';
    this.baseUrl = `${protocol}://${this.config.host}:${this.config.port}/api/v1`;
    
    // Setup axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      }
    });

    // Collections cache
    this.collections = new Map();
    this.connected = false;
  }

  /**
   * Connect to ChromaDB and verify connection
   */
  async connect() {
    try {
      // Test connection by getting version
      const response = await this.client.get('/');
      
      this.logger.info('ChromaDB connected', {
        host: this.config.host,
        port: this.config.port,
        version: response.data.version || 'unknown'
      });

      this.connected = true;
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to ChromaDB', error, {
        host: this.config.host,
        port: this.config.port
      });
      throw new Error(`ChromaDB connection failed: ${error.message}`);
    }
  }

  /**
   * Create or get a collection
   */
  async createCollection(name, options = {}) {
    try {
      const collectionConfig = {
        name,
        metadata: options.metadata || {},
        get_or_create: options.getOrCreate !== false
      };

      // Add embedding function if specified
      if (options.embeddingFunction) {
        collectionConfig.embedding_function = options.embeddingFunction;
      }

      const response = await this.client.post('/collections', collectionConfig);
      
      const collection = {
        id: response.data.id,
        name: response.data.name,
        metadata: response.data.metadata
      };

      this.collections.set(name, collection);
      
      this.logger.info('Collection created/retrieved', {
        name,
        id: collection.id
      });

      return collection;
    } catch (error) {
      this.logger.error('Failed to create collection', error, {
        collection: name
      });
      throw error;
    }
  }

  /**
   * Get a collection by name
   */
  async getCollection(name) {
    // Check cache first
    if (this.collections.has(name)) {
      return this.collections.get(name);
    }

    try {
      const response = await this.client.get(`/collections/${name}`);
      
      const collection = {
        id: response.data.id,
        name: response.data.name,
        metadata: response.data.metadata
      };

      this.collections.set(name, collection);
      return collection;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(name) {
    try {
      await this.client.delete(`/collections/${name}`);
      this.collections.delete(name);
      
      this.logger.info('Collection deleted', { collection: name });
      return true;
    } catch (error) {
      this.logger.error('Failed to delete collection', error, {
        collection: name
      });
      throw error;
    }
  }

  /**
   * Add documents to a collection
   */
  async addDocuments(collectionName, documents, options = {}) {
    try {
      // Ensure collection exists
      const collection = await this.getCollection(collectionName) || 
                        await this.createCollection(collectionName);

      // Prepare data for ChromaDB
      const data = {
        ids: documents.map(doc => doc.id || this.generateId()),
        documents: documents.map(doc => doc.content || doc.text),
        metadatas: documents.map(doc => doc.metadata || {}),
      };

      // Add embeddings if provided
      if (documents[0]?.embedding) {
        data.embeddings = documents.map(doc => doc.embedding);
      }

      const response = await this.client.post(
        `/collections/${collection.id}/add`,
        data
      );

      this.logger.info('Documents added to collection', {
        collection: collectionName,
        count: documents.length
      });

      return {
        success: true,
        added: documents.length,
        ids: data.ids
      };
    } catch (error) {
      this.logger.error('Failed to add documents', error, {
        collection: collectionName,
        documentCount: documents.length
      });
      throw error;
    }
  }

  /**
   * Update documents in a collection
   */
  async updateDocuments(collectionName, documents) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) {
        throw new Error(`Collection ${collectionName} not found`);
      }

      const data = {
        ids: documents.map(doc => doc.id),
        documents: documents.map(doc => doc.content || doc.text),
        metadatas: documents.map(doc => doc.metadata || {})
      };

      if (documents[0]?.embedding) {
        data.embeddings = documents.map(doc => doc.embedding);
      }

      await this.client.post(
        `/collections/${collection.id}/update`,
        data
      );

      this.logger.info('Documents updated', {
        collection: collectionName,
        count: documents.length
      });

      return {
        success: true,
        updated: documents.length
      };
    } catch (error) {
      this.logger.error('Failed to update documents', error, {
        collection: collectionName
      });
      throw error;
    }
  }

  /**
   * Delete documents from a collection
   */
  async deleteDocuments(collectionName, ids) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) {
        throw new Error(`Collection ${collectionName} not found`);
      }

      await this.client.post(
        `/collections/${collection.id}/delete`,
        { ids }
      );

      this.logger.info('Documents deleted', {
        collection: collectionName,
        count: ids.length
      });

      return {
        success: true,
        deleted: ids.length
      };
    } catch (error) {
      this.logger.error('Failed to delete documents', error, {
        collection: collectionName
      });
      throw error;
    }
  }

  /**
   * Query documents using vector similarity search
   */
  async query(collectionName, queryOptions = {}) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) {
        throw new Error(`Collection ${collectionName} not found`);
      }

      const queryData = {
        n_results: queryOptions.limit || 10,
      };

      // Add query text or embeddings
      if (queryOptions.queryTexts) {
        queryData.query_texts = Array.isArray(queryOptions.queryTexts) ? 
          queryOptions.queryTexts : [queryOptions.queryTexts];
      } else if (queryOptions.queryEmbeddings) {
        queryData.query_embeddings = Array.isArray(queryOptions.queryEmbeddings) ? 
          queryOptions.queryEmbeddings : [queryOptions.queryEmbeddings];
      } else {
        throw new Error('Either queryTexts or queryEmbeddings must be provided');
      }

      // Add optional filters
      if (queryOptions.where) {
        queryData.where = queryOptions.where;
      }
      if (queryOptions.whereDocument) {
        queryData.where_document = queryOptions.whereDocument;
      }

      const response = await this.client.post(
        `/collections/${collection.id}/query`,
        queryData
      );

      // Format results
      const results = [];
      const data = response.data;
      
      for (let i = 0; i < data.ids[0].length; i++) {
        results.push({
          id: data.ids[0][i],
          document: data.documents[0][i],
          metadata: data.metadatas[0][i],
          distance: data.distances[0][i]
        });
      }

      return {
        success: true,
        results,
        count: results.length
      };
    } catch (error) {
      this.logger.error('Query failed', error, {
        collection: collectionName
      });
      throw error;
    }
  }

  /**
   * Get documents by IDs
   */
  async getDocuments(collectionName, ids = null, options = {}) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) {
        throw new Error(`Collection ${collectionName} not found`);
      }

      const getData = {};
      
      if (ids) {
        getData.ids = ids;
      }
      if (options.where) {
        getData.where = options.where;
      }
      if (options.limit) {
        getData.limit = options.limit;
      }
      if (options.offset) {
        getData.offset = options.offset;
      }

      const response = await this.client.post(
        `/collections/${collection.id}/get`,
        getData
      );

      // Format results
      const documents = [];
      const data = response.data;
      
      for (let i = 0; i < data.ids.length; i++) {
        documents.push({
          id: data.ids[i],
          document: data.documents[i],
          metadata: data.metadatas[i]
        });
      }

      return {
        success: true,
        documents,
        count: documents.length
      };
    } catch (error) {
      this.logger.error('Failed to get documents', error, {
        collection: collectionName
      });
      throw error;
    }
  }

  /**
   * Count documents in a collection
   */
  async countDocuments(collectionName) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) {
        return 0;
      }

      const response = await this.client.get(`/collections/${collection.id}/count`);
      return response.data.count || 0;
    } catch (error) {
      this.logger.error('Failed to count documents', error, {
        collection: collectionName
      });
      throw error;
    }
  }

  /**
   * List all collections
   */
  async listCollections() {
    try {
      const response = await this.client.get('/collections');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list collections', error);
      throw error;
    }
  }

  /**
   * Create embeddings for text (requires embedding service)
   */
  async createEmbeddings(texts, model = 'default') {
    try {
      const response = await this.client.post('/embeddings', {
        texts: Array.isArray(texts) ? texts : [texts],
        model
      });
      
      return response.data.embeddings;
    } catch (error) {
      this.logger.error('Failed to create embeddings', error);
      throw error;
    }
  }

  /**
   * Reset database (delete all collections)
   */
  async reset() {
    try {
      const collections = await this.listCollections();
      
      for (const collection of collections) {
        await this.deleteCollection(collection.name);
      }
      
      this.collections.clear();
      
      this.logger.info('ChromaDB reset completed', {
        deletedCollections: collections.length
      });
      
      return true;
    } catch (error) {
      this.logger.error('Failed to reset ChromaDB', error);
      throw error;
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Retry logic for failed requests
   */
  async retryOperation(operation, retries = null) {
    const maxRetries = retries || this.config.maxRetries;
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          const delay = this.config.retryDelay * Math.pow(2, i);
          this.logger.warn(`Operation failed, retrying in ${delay}ms`, {
            attempt: i + 1,
            maxRetries,
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/');
      return {
        healthy: true,
        version: response.data.version,
        collections: this.collections.size
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Disconnect (cleanup)
   */
  async disconnect() {
    this.collections.clear();
    this.connected = false;
    this.logger.info('ChromaDB disconnected');
  }
}

export { ChromaClient };