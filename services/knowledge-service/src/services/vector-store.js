// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/services/vector-store.js
// ==========================================
import { ChromaClient } from 'chromadb';

class VectorStore {
  constructor(logger, chromaConfig) {
    this.logger = logger;
    this.config = chromaConfig;
    this.client = null;
    this.collections = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize ChromaDB client
      this.client = new ChromaClient({
        path: this.config.url,
        fetchOptions: {
          timeout: 30000,
        },
      });

      // Test connection
      await this.client.heartbeat();
      this.logger.info('ChromaDB connection established');

      // Initialize collections
      await this.initializeCollections();

      this.initialized = true;
      this.logger.info('Vector Store initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Vector Store', error);
      throw error;
    }
  }

  async initializeCollections() {
    const collectionsToCreate = [
      {
        name: 'ux_principles',
        description: 'Global UX principles and best practices',
        metadata: { type: 'global', category: 'principles' },
      },
      {
        name: 'design_patterns',
        description: 'Common UI/UX design patterns',
        metadata: { type: 'global', category: 'patterns' },
      },
      {
        name: 'project_knowledge',
        description: 'Project-specific knowledge and context',
        metadata: { type: 'project', category: 'context' },
      },
      {
        name: 'conversation_context',
        description: 'Processed conversation context for RAG',
        metadata: { type: 'contextual', category: 'memory' },
      },
    ];

    for (const collectionConfig of collectionsToCreate) {
      try {
        const collection = await this.client.getOrCreateCollection({
          name: collectionConfig.name,
          metadata: collectionConfig.metadata,
        });

        this.collections.set(collectionConfig.name, collection);

        this.logger.info('Collection initialized', {
          name: collectionConfig.name,
          description: collectionConfig.description,
        });

      } catch (error) {
        this.logger.error('Failed to initialize collection', error, {
          name: collectionConfig.name,
        });
      }
    }
  }

  async addDocument(collectionName, document) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      const { id, content, metadata = {} } = document;

      await collection.add({
        ids: [id],
        documents: [content],
        metadatas: [metadata],
      });

      this.logger.debug('Document added to vector store', {
        collectionName,
        documentId: id,
        contentLength: content.length,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to add document to vector store', error, {
        collectionName,
        documentId: document.id,
      });
      throw error;
    }
  }

  async addBulkDocuments(collectionName, documents) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      const ids = documents.map(doc => doc.id);
      const contents = documents.map(doc => doc.content);
      const metadatas = documents.map(doc => doc.metadata || {});

      await collection.add({
        ids,
        documents: contents,
        metadatas,
      });

      this.logger.info('Bulk documents added to vector store', {
        collectionName,
        documentCount: documents.length,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to add bulk documents to vector store', error, {
        collectionName,
        documentCount: documents.length,
      });
      throw error;
    }
  }

  async searchDocuments(collectionName, query, options = {}) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      const {
        nResults = 5,
        where = null,
        includeEmbeddings = false,
        includeDistances = true,
      } = options;

      const searchParams = {
        queryTexts: [query],
        nResults,
        include: ['documents', 'metadatas'],
      };

      if (includeDistances) {
        searchParams.include.push('distances');
      }

      if (includeEmbeddings) {
        searchParams.include.push('embeddings');
      }

      if (where) {
        searchParams.where = where;
      }

      const results = await collection.query(searchParams);

      // Format results
      const formattedResults = this.formatSearchResults(results, query);

      this.logger.debug('Vector search completed', {
        collectionName,
        query: query.substring(0, 100),
        resultCount: formattedResults.length,
        nResults,
      });

      return formattedResults;

    } catch (error) {
      this.logger.error('Failed to search vector store', error, {
        collectionName,
        query: query.substring(0, 100),
      });
      throw error;
    }
  }

  formatSearchResults(results, originalQuery) {
    const documents = results.documents[0] || [];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances?.[0] || [];
    const ids = results.ids[0] || [];

    return documents.map((doc, index) => ({
      id: ids[index],
      content: doc,
      metadata: metadatas[index] || {},
      similarity: distances[index] ? 1 - distances[index] : null, // Convert distance to similarity
      relevanceScore: this.calculateRelevanceScore(doc, originalQuery, distances[index]),
    }));
  }

  calculateRelevanceScore(document, query, distance) {
    // Simple relevance scoring based on distance and keyword overlap
    const similarity = distance ? 1 - distance : 0.5;
    
    // Keyword overlap bonus
    const queryWords = query.toLowerCase().split(/\s+/);
    const docWords = document.toLowerCase().split(/\s+/);
    const overlap = queryWords.filter(word => docWords.includes(word)).length;
    const keywordBonus = overlap / queryWords.length * 0.2;

    return Math.min(1.0, similarity + keywordBonus);
  }

  async searchMultipleCollections(collectionNames, query, options = {}) {
    try {
      const searchPromises = collectionNames.map(collectionName =>
        this.searchDocuments(collectionName, query, options)
          .then(results => results.map(result => ({ ...result, collection: collectionName })))
          .catch(error => {
            this.logger.warn('Search failed for collection', error, { collectionName });
            return [];
          })
      );

      const allResults = await Promise.all(searchPromises);
      const combinedResults = allResults.flat();

      // Sort by relevance score
      combinedResults.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

      const maxResults = options.nResults || 10;
      return combinedResults.slice(0, maxResults);

    } catch (error) {
      this.logger.error('Failed to search multiple collections', error, {
        collectionNames,
        query: query.substring(0, 100),
      });
      throw error;
    }
  }

  async updateDocument(collectionName, documentId, newContent, newMetadata = null) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      // ChromaDB doesn't have direct update - we need to delete and re-add
      await this.deleteDocument(collectionName, documentId);
      
      await this.addDocument(collectionName, {
        id: documentId,
        content: newContent,
        metadata: newMetadata,
      });

      this.logger.debug('Document updated in vector store', {
        collectionName,
        documentId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to update document in vector store', error, {
        collectionName,
        documentId,
      });
      throw error;
    }
  }

  async deleteDocument(collectionName, documentId) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      await collection.delete({
        ids: [documentId],
      });

      this.logger.debug('Document deleted from vector store', {
        collectionName,
        documentId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to delete document from vector store', error, {
        collectionName,
        documentId,
      });
      throw error;
    }
  }

  async getCollectionInfo(collectionName) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }

      const count = await collection.count();
      
      return {
        name: collectionName,
        documentCount: count,
        metadata: collection.metadata || {},
      };

    } catch (error) {
      this.logger.error('Failed to get collection info', error, { collectionName });
      throw error;
    }
  }

  async getAllCollections() {
    try {
      const collectionsInfo = [];
      
      for (const [name, collection] of this.collections) {
        const info = await this.getCollectionInfo(name);
        collectionsInfo.push(info);
      }

      return collectionsInfo;

    } catch (error) {
      this.logger.error('Failed to get all collections info', error);
      throw error;
    }
  }

  async createWorkspaceCollection(workspaceId) {
    try {
      const collectionName = `workspace_${workspaceId}`;
      
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: {
          type: 'workspace',
          workspaceId,
          createdAt: new Date().toISOString(),
        },
      });

      this.collections.set(collectionName, collection);

      this.logger.info('Workspace collection created', {
        workspaceId,
        collectionName,
      });

      return collectionName;

    } catch (error) {
      this.logger.error('Failed to create workspace collection', error, { workspaceId });
      throw error;
    }
  }

  async createProjectCollection(projectId, workspaceId) {
    try {
      const collectionName = `project_${projectId}`;
      
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: {
          type: 'project',
          projectId,
          workspaceId,
          createdAt: new Date().toISOString(),
        },
      });

      this.collections.set(collectionName, collection);

      this.logger.info('Project collection created', {
        projectId,
        workspaceId,
        collectionName,
      });

      return collectionName;

    } catch (error) {
      this.logger.error('Failed to create project collection', error, { projectId });
      throw error;
    }
  }

  async deleteCollection(collectionName) {
    try {
      await this.client.deleteCollection({ name: collectionName });
      this.collections.delete(collectionName);

      this.logger.info('Collection deleted', { collectionName });
      return true;

    } catch (error) {
      this.logger.error('Failed to delete collection', error, { collectionName });
      throw error;
    }
  }

  // Advanced search with filters
  async searchWithFilters(collectionName, query, filters = {}) {
    const {
      category = null,
      type = null,
      workspaceId = null,
      projectId = null,
      dateRange = null,
      minRelevance = 0.3,
    } = filters;

    const whereConditions = {};

    if (category) whereConditions.category = category;
    if (type) whereConditions.type = type;
    if (workspaceId) whereConditions.workspaceId = workspaceId;
    if (projectId) whereConditions.projectId = projectId;

    if (dateRange) {
      whereConditions.createdAt = {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }

    const results = await this.searchDocuments(collectionName, query, {
      where: Object.keys(whereConditions).length > 0 ? whereConditions : null,
      nResults: 20,
    });

    // Filter by minimum relevance
    return results.filter(result => (result.relevanceScore || 0) >= minRelevance);
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'error', message: 'Vector store not initialized' };
      }

      await this.client.heartbeat();
      
      const collectionsInfo = await this.getAllCollections();
      const totalDocuments = collectionsInfo.reduce((sum, col) => sum + col.documentCount, 0);

      return {
        status: 'ok',
        collections: collectionsInfo.length,
        totalDocuments,
        initialized: this.initialized,
      };

    } catch (error) {
      this.logger.error('Vector store health check failed', error);
      return {
        status: 'error',
        message: error.message,
        initialized: this.initialized,
      };
    }
  }

  isInitialized() {
    return this.initialized;
  }

  async shutdown() {
    this.logger.info('Shutting down Vector Store...');
    this.collections.clear();
    this.initialized = false;
    this.logger.info('Vector Store shutdown completed');
  }
}

export { VectorStore };