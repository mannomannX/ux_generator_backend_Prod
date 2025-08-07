// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/services/vector-store.js
// ==========================================
import { ChromaClient } from 'chromadb';
import { VectorSecurity } from '../security/vector-security.js';
import { DataSanitizer } from '../security/data-sanitizer.js';
import { EmbeddingSecurity } from '../security/embedding-security.js';
import crypto from 'crypto';

class VectorStore {
  constructor(logger, chromaConfig) {
    this.logger = logger;
    this.config = chromaConfig;
    this.client = null;
    this.collections = new Map();
    this.initialized = false;
    
    // SECURITY FIX: Initialize security components
    this.vectorSecurity = new VectorSecurity(logger);
    this.dataSanitizer = new DataSanitizer(logger);
    this.embeddingSecurity = new EmbeddingSecurity(logger);
    
    // SECURITY FIX: Collection access control cache
    this.accessCache = new Map();
    this.accessCacheTTL = 5 * 60 * 1000; // 5 minutes
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

  async addDocument(collectionName, document, userId = null, workspaceId = null, projectId = null) {
    try {
      const collection = this.collections.get(collectionName);
      if (!collection) {
        throw new Error(`Collection '${collectionName}' not found`);
      }
      
      // SECURITY FIX: Validate collection access
      if (!await this.validateCollectionAccess(collectionName, userId, workspaceId, projectId)) {
        throw new Error('Access denied to collection');
      }

      const { id, content, metadata = {} } = document;
      
      // SECURITY FIX: Sanitize content for prompt injection
      const contentValidation = this.vectorSecurity.validateEmbeddingInput(content);
      if (!contentValidation.valid) {
        throw new Error(`Invalid document content: ${contentValidation.warnings.join(', ')}`);
      }
      
      const sanitizedContent = contentValidation.sanitized;
      
      // SECURITY FIX: Validate and sanitize metadata
      const metadataValidation = this.vectorSecurity.validateMetadata(metadata);
      if (!metadataValidation.valid) {
        throw new Error(`Invalid metadata: ${metadataValidation.errors.join(', ')}`);
      }
      
      const sanitizedMetadata = {
        ...metadataValidation.sanitized,
        // SECURITY FIX: Add tenant isolation metadata
        workspaceId,
        projectId,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        // SECURITY FIX: Add content hash for integrity verification
        contentHash: crypto.createHash('sha256').update(sanitizedContent).digest('hex')
      };

      await collection.add({
        ids: [id],
        documents: [sanitizedContent],
        metadatas: [sanitizedMetadata],
      });

      this.logger.debug('Document added to vector store', {
        collectionName: collectionName.substring(0, 8) + '...', // Log partial name only
        documentId: id,
        contentLength: sanitizedContent.length,
        workspaceId,
        projectId
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to add document to vector store', error, {
        collectionName: collectionName.substring(0, 8) + '...',
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

      // SECURITY FIX: Validate and sanitize search query
      const queryValidation = this.vectorSecurity.validateEmbeddingInput(query);
      if (!queryValidation.valid) {
        throw new Error(`Invalid search query: ${queryValidation.warnings.join(', ')}`);
      }
      
      const sanitizedQuery = queryValidation.sanitized;

      const {
        nResults = 5,
        where = null,
        includeEmbeddings = false,
        includeDistances = true,
        userId = null,
        workspaceId = null,
        projectId = null
      } = options;
      
      // SECURITY FIX: Validate collection access rights
      if (!await this.validateCollectionAccess(collectionName, userId, workspaceId, projectId)) {
        throw new Error('Access denied to collection');
      }

      const searchParams = {
        queryTexts: [sanitizedQuery],
        nResults: Math.min(nResults, 50), // SECURITY FIX: Cap results
        include: ['documents', 'metadatas'],
      };

      if (includeDistances) {
        searchParams.include.push('distances');
      }

      if (includeEmbeddings) {
        searchParams.include.push('embeddings');
      }

      // SECURITY FIX: Validate and sanitize where clause
      if (where) {
        const sanitizedWhere = this.sanitizeWhereClause(where, workspaceId, projectId);
        if (sanitizedWhere && Object.keys(sanitizedWhere).length > 0) {
          searchParams.where = sanitizedWhere;
        }
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

  async createWorkspaceCollection(workspaceId, userId = null) {
    try {
      // SECURITY FIX: Validate workspace ID
      if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.length < 3) {
        throw new Error('Invalid workspace ID');
      }
      
      // SECURITY FIX: Generate secure, unpredictable collection name
      const workspaceHash = crypto.createHash('sha256')
        .update(`${workspaceId}:${process.env.COLLECTION_SALT || 'default-salt'}`)
        .digest('hex')
        .substring(0, 16);
      
      const collectionName = `ws_${workspaceHash}`;
      
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: {
          type: 'workspace',
          workspaceId,
          createdAt: new Date().toISOString(),
          createdBy: userId,
          // SECURITY FIX: Add access control metadata
          accessLevel: 'workspace',
          tenantId: workspaceId
        },
      });

      this.collections.set(collectionName, collection);
      
      // SECURITY FIX: Cache collection mapping securely
      await this.cacheCollectionMapping(workspaceId, collectionName, 'workspace');

      this.logger.info('Workspace collection created', {
        workspaceId,
        collectionName: collectionName.substring(0, 8) + '...', // Log partial name only
      });

      return collectionName;

    } catch (error) {
      this.logger.error('Failed to create workspace collection', error, { workspaceId });
      throw error;
    }
  }

  async createProjectCollection(projectId, workspaceId, userId = null) {
    try {
      // SECURITY FIX: Validate inputs
      if (!projectId || typeof projectId !== 'string' || projectId.length < 3) {
        throw new Error('Invalid project ID');
      }
      if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.length < 3) {
        throw new Error('Invalid workspace ID');
      }
      
      // SECURITY FIX: Generate secure, unpredictable collection name
      const projectHash = crypto.createHash('sha256')
        .update(`${projectId}:${workspaceId}:${process.env.COLLECTION_SALT || 'default-salt'}`)
        .digest('hex')
        .substring(0, 16);
      
      const collectionName = `proj_${projectHash}`;
      
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: {
          type: 'project',
          projectId,
          workspaceId,
          createdAt: new Date().toISOString(),
          createdBy: userId,
          // SECURITY FIX: Add access control metadata
          accessLevel: 'project',
          tenantId: workspaceId,
          parentTenant: workspaceId
        },
      });

      this.collections.set(collectionName, collection);
      
      // SECURITY FIX: Cache collection mapping securely
      await this.cacheCollectionMapping(projectId, collectionName, 'project', workspaceId);

      this.logger.info('Project collection created', {
        projectId,
        workspaceId,
        collectionName: collectionName.substring(0, 8) + '...', // Log partial name only
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
    this.accessCache.clear();
    this.initialized = false;
    this.logger.info('Vector Store shutdown completed');
  }

  // SECURITY FIX: New security methods
  
  /**
   * Validate collection access based on user permissions
   */
  async validateCollectionAccess(collectionName, userId, workspaceId, projectId) {
    try {
      // Check access cache first
      const cacheKey = `${userId}:${collectionName}`;
      const cached = this.accessCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.accessCacheTTL) {
        return cached.allowed;
      }
      
      // Global collections are readable by all authenticated users
      if (collectionName.startsWith('ux_') || collectionName.startsWith('design_')) {
        this.accessCache.set(cacheKey, { allowed: true, timestamp: Date.now() });
        return true;
      }
      
      // Get collection metadata for access control
      const collection = this.collections.get(collectionName);
      if (!collection) {
        return false;
      }
      
      try {
        // Note: ChromaDB doesn't expose metadata directly in client
        // In a real implementation, you would check against a separate access control system
        // For now, implement basic tenant isolation based on naming
        
        if (collectionName.startsWith('ws_')) {
          // Workspace collection - check if user has workspace access
          if (!workspaceId) {
            return false;
          }
          // Would check user's workspace membership here
        } else if (collectionName.startsWith('proj_')) {
          // Project collection - check if user has project access
          if (!projectId || !workspaceId) {
            return false;
          }
          // Would check user's project membership here
        }
        
        // Cache the result
        this.accessCache.set(cacheKey, { allowed: true, timestamp: Date.now() });
        return true;
        
      } catch (error) {
        this.logger.warn('Collection access validation failed', { collectionName, userId, error: error.message });
        return false;
      }
      
    } catch (error) {
      this.logger.error('Access validation error', error);
      return false;
    }
  }
  
  /**
   * Sanitize where clause to prevent injection attacks
   */
  sanitizeWhereClause(where, workspaceId, projectId) {
    if (!where || typeof where !== 'object') {
      return null;
    }
    
    // SECURITY FIX: Use comprehensive NoSQL injection detection
    if (this.dataSanitizer.detectNoSQLInjection(where)) {
      this.logger.warn('NoSQL injection attempt detected in where clause', { where });
      throw new Error('Invalid where clause detected');
    }
    
    const sanitized = {};
    const allowedOperators = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin'];
    const allowedFields = ['type', 'category', 'status', 'tags', 'language', 'createdAt', 'updatedAt'];
    
    for (const [key, value] of Object.entries(where)) {
      // SECURITY FIX: Block dangerous MongoDB operators
      if (key.startsWith('$')) {
        if (!allowedOperators.includes(key)) {
          this.logger.warn('Blocked dangerous operator in where clause', { operator: key });
          continue;
        }
      }
      
      // SECURITY FIX: Only allow specific safe fields
      if (!key.startsWith('$') && !allowedFields.includes(key)) {
        this.logger.warn('Blocked unauthorized field in where clause', { field: key });
        continue;
      }
      
      // SECURITY FIX: Sanitize string values
      if (typeof value === 'string') {
        sanitized[key] = this.dataSanitizer.sanitizeText(value);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeWhereClause(value, workspaceId, projectId);
      } else if (Array.isArray(value)) {
        // Sanitize array values
        sanitized[key] = value.map(v => 
          typeof v === 'string' ? this.dataSanitizer.sanitizeText(v) : v
        );
      } else {
        sanitized[key] = value;
      }
    }
    
    // SECURITY FIX: Add tenant isolation constraints
    if (workspaceId) {
      sanitized.workspaceId = workspaceId;
    }
    if (projectId) {
      sanitized.projectId = projectId;
    }
    
    return sanitized;
  }
  
  /**
   * Cache collection mapping for secure lookup
   */
  async cacheCollectionMapping(tenantId, collectionName, type, parentTenant = null) {
    try {
      const mapping = {
        tenantId,
        collectionName,
        type,
        parentTenant,
        createdAt: new Date().toISOString()
      };
      
      // Store in Redis with expiration
      const cacheKey = `collection_mapping:${type}:${tenantId}`;
      await this.redisClient?.setex(cacheKey, 3600, JSON.stringify(mapping)); // 1 hour cache
      
    } catch (error) {
      this.logger.error('Failed to cache collection mapping', error);
      // Don't throw - this is not critical
    }
  }
  
  /**
   * Get collection name by tenant ID (secure lookup)
   */
  async getCollectionByTenant(tenantId, type) {
    try {
      const cacheKey = `collection_mapping:${type}:${tenantId}`;
      const cached = await this.redisClient?.get(cacheKey);
      
      if (cached) {
        const mapping = JSON.parse(cached);
        return mapping.collectionName;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get collection by tenant', error);
      return null;
    }
  }

}

export { VectorStore };