// ==========================================
// KNOWLEDGE SERVICE - Enhanced RAG System
// Hybrid search with re-ranking and citation
// ==========================================

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import crypto from 'crypto';
import { ChromaDBConnectionManager } from '../services/chromadb-manager.js';
import { CONFIG } from '../config/constants.js';
// SECURITY FIX: Import security components
import { VectorSecurity } from '../security/vector-security.js';
import { DataSanitizer } from '../security/data-sanitizer.js';
import { EmbeddingSecurity } from '../security/embedding-security.js';

export class EnhancedRAGSystem {
  constructor(logger, mongoClient, redisClient, embeddingManager) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.embeddingManager = embeddingManager;
    
    // SECURITY FIX: Initialize security components
    this.vectorSecurity = new VectorSecurity(logger);
    this.dataSanitizer = new DataSanitizer(logger);
    this.embeddingSecurity = new EmbeddingSecurity(logger);
    
    // ChromaDB manager (will be initialized in initialize())
    this.chromaManager = null;
    
    // RAG configuration from centralized config
    this.ragConfig = {
      topK: CONFIG.RAG.SEARCH.TOP_K,
      finalK: CONFIG.RAG.SEARCH.FINAL_K,
      chunkSize: CONFIG.RAG.CHUNKING.SIZE,
      chunkOverlap: CONFIG.RAG.CHUNKING.OVERLAP,
      minRelevanceScore: CONFIG.RAG.SEARCH.MIN_RELEVANCE,
      maxContextTokens: CONFIG.RAG.SEARCH.MAX_CONTEXT_TOKENS,
      hybridSearchWeight: {
        semantic: CONFIG.RAG.HYBRID_SEARCH_WEIGHT.VECTOR,
        keyword: CONFIG.RAG.HYBRID_SEARCH_WEIGHT.KEYWORD
      }
    };
    
    // Collection naming strategy from centralized config
    this.collections = {
      global: CONFIG.CHROMADB.COLLECTIONS.GLOBAL,
      workspace: (workspaceId) => `${CONFIG.CHROMADB.COLLECTIONS.WORKSPACE_PREFIX}${workspaceId}`,
      project: (projectId) => `${CONFIG.CHROMADB.COLLECTIONS.PROJECT_PREFIX}${projectId}`
    };
    
    // Text splitter for chunking
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.ragConfig.chunkSize,
      chunkOverlap: this.ragConfig.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', '']
    });
    
    // PII detection patterns
    this.piiPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
      /\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g // Phone
    ];
    
    this.initialize();
  }

  /**
   * Initialize RAG system
   */
  async initialize() {
    try {
      // Initialize ChromaDB connection using centralized manager
      this.chromaManager = await ChromaDBConnectionManager.getConnection(
        this.logger,
        {
          host: process.env.CHROMADB_HOST || 'localhost',
          port: parseInt(process.env.CHROMADB_PORT) || 8000,
          ssl: process.env.CHROMADB_SSL === 'true'
        }
      );
      
      // Create database indexes
      await this.createDatabaseIndexes();
      
      // Initialize ChromaDB collections
      await this.initializeCollections();
      
      // Load pre-built knowledge
      await this.loadPreBuiltKnowledge();
      
      this.logger.info('Enhanced RAG System initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize Enhanced RAG System', error);
    }
  }

  /**
   * Create database indexes
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // Documents collection
    await db.collection('rag_documents').createIndexes([
      { key: { documentHash: 1 }, unique: true },
      { key: { workspaceId: 1, type: 1 } },
      { key: { projectId: 1 } },
      { key: { createdAt: 1 } },
      { key: { status: 1 } },
      { key: { tags: 1 } }
    ]);
    
    // Document chunks collection
    await db.collection('rag_chunks').createIndexes([
      { key: { documentId: 1, chunkIndex: 1 } },
      { key: { workspaceId: 1 } },
      { key: { projectId: 1 } },
      { key: { embeddingId: 1 } }
    ]);
    
    // RAG queries collection (for analytics)
    await db.collection('rag_queries').createIndexes([
      { key: { userId: 1, timestamp: -1 } },
      { key: { workspaceId: 1, timestamp: -1 } },
      { key: { timestamp: 1 }, expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
    ]);
  }

  /**
   * Initialize ChromaDB collections
   */
  async initializeCollections() {
    try {
      // Create collections if they don't exist
      const collections = [
        this.collections.global,
        // Workspace and project collections are created dynamically
      ];
      
      for (const collectionName of collections) {
        // Use centralized manager to get or create collection
        await this.chromaManager.getOrCreateCollection(collectionName, {
          type: 'knowledge_base',
          created_at: new Date().toISOString()
        });
        
        this.logger.info('Initialized ChromaDB collection', { name: collectionName });
      }
      
    } catch (error) {
      this.logger.error('Failed to initialize ChromaDB collections', error);
    }
  }

  /**
   * Add document to knowledge base
   */
  async addDocument(documentData) {
    const {
      content,
      title,
      type, // 'global', 'workspace', 'project'
      workspaceId,
      projectId,
      userId,
      metadata = {},
      tags = [],
      language = 'en'
    } = documentData;

    try {
      // Check for PII in content
      const piiCheck = this.detectPII(content);
      if (piiCheck.hasPII) {
        throw new Error(`Document contains PII: ${piiCheck.types.join(', ')}`);
      }

      // Create document hash for deduplication
      const documentHash = this.createDocumentHash(content, title);
      
      // Check if document already exists
      const db = this.mongoClient.getDb();
      const existing = await db.collection('rag_documents')
        .findOne({ documentHash });
      
      if (existing) {
        return {
          success: false,
          reason: 'Document already exists',
          documentId: existing._id
        };
      }

      // Split document into chunks
      const chunks = await this.textSplitter.splitText(content);
      
      if (chunks.length === 0) {
        throw new Error('No valid chunks generated from document');
      }

      // Generate embeddings for chunks
      const embeddingResults = await this.embeddingManager.generateEmbeddings(
        chunks,
        {
          userId,
          workspaceId,
          language,
          provider: 'openai',
          model: 'text-embedding-3-small'
        }
      );

      // Store document metadata
      const document = {
        documentHash,
        title,
        type,
        workspaceId,
        projectId,
        userId,
        content: content.substring(0, 1000), // Store preview only
        metadata: {
          ...metadata,
          language,
          chunkCount: chunks.length,
          totalTokens: embeddingResults.reduce((sum, r) => sum + r.tokens, 0),
          totalCost: embeddingResults.reduce((sum, r) => sum + r.cost, 0)
        },
        tags,
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docResult = await db.collection('rag_documents').insertOne(document);
      const documentId = docResult.insertedId;

      // Determine target collection
      const collectionName = this.getCollectionName(type, workspaceId, projectId);
      
      // Ensure collection exists
      await this.ensureCollection(collectionName, type, workspaceId, projectId);
      
      // Get or create ChromaDB collection
      const collection = await this.chromaManager.getOrCreateCollection(collectionName, {
        type,
        workspaceId,
        projectId
      });

      // Prepare chunk data for ChromaDB
      const chunkIds = [];
      const chunkEmbeddings = [];
      const chunkMetadatas = [];
      const chunkDocuments = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddingResults[i];
        
        if (!embedding || !embedding.embedding) {
          this.logger.warn('Skipping chunk with missing embedding', { 
            documentId, 
            chunkIndex: i 
          });
          continue;
        }

        const chunkId = `${documentId}_chunk_${i}`;
        
        chunkIds.push(chunkId);
        chunkEmbeddings.push(embedding.embedding);
        chunkDocuments.push(chunk);
        chunkMetadatas.push({
          document_id: documentId.toString(),
          chunk_index: i,
          title,
          type,
          workspace_id: workspaceId,
          project_id: projectId,
          user_id: userId,
          language,
          tags: tags.join(','),
          created_at: new Date().toISOString()
        });

        // Store chunk metadata in MongoDB
        await db.collection('rag_chunks').insertOne({
          documentId,
          chunkIndex: i,
          chunkId,
          content: chunk,
          workspaceId,
          projectId,
          embeddingId: embedding._id || null,
          metadata: chunkMetadatas[chunkMetadatas.length - 1],
          createdAt: new Date()
        });
      }

      // Add to ChromaDB
      if (chunkIds.length > 0) {
        await collection.add({
          ids: chunkIds,
          embeddings: chunkEmbeddings,
          documents: chunkDocuments,
          metadatas: chunkMetadatas
        });
      }

      // Update document status
      await db.collection('rag_documents').updateOne(
        { _id: documentId },
        { 
          $set: { 
            status: 'indexed',
            indexedChunks: chunkIds.length,
            updatedAt: new Date()
          }
        }
      );

      this.logger.info('Document added to RAG system', {
        documentId,
        title,
        type,
        chunks: chunkIds.length,
        collection: collectionName
      });

      return {
        success: true,
        documentId,
        chunks: chunkIds.length,
        collection: collectionName,
        cost: embeddingResults.reduce((sum, r) => sum + r.cost, 0)
      };

    } catch (error) {
      this.logger.error('Failed to add document to RAG system', error);
      throw error;
    }
  }

  /**
   * Query knowledge base with hybrid search
   */
  async queryKnowledgeBase(query, options = {}) {
    const {
      userId,
      workspaceId,
      projectId,
      type = 'all', // 'global', 'workspace', 'project', 'all'
      language = 'en',
      topK = this.ragConfig.topK,
      minScore = this.ragConfig.minRelevanceScore,
      includeMetadata = true,
      includeCitations = true
    } = options;

    const startTime = Date.now();

    try {
      // SECURITY FIX: Validate and sanitize query input
      if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string');
      }
      
      // SECURITY FIX: Validate query for prompt injection and sanitize
      const queryValidation = this.vectorSecurity.validateEmbeddingInput(query);
      if (!queryValidation.valid) {
        throw new Error(`Invalid query: ${queryValidation.warnings.join(', ')}`);
      }
      
      const sanitizedQuery = queryValidation.sanitized;
      
      // SECURITY FIX: Check for NoSQL injection attempts
      if (this.dataSanitizer.detectNoSQLInjection(sanitizedQuery)) {
        this.logger.warn('Potential NoSQL injection in query blocked', { userId, originalQuery: query.substring(0, 100) });
        throw new Error('Invalid query format detected');
      }
      
      // SECURITY FIX: Validate user permissions before proceeding
      if (!await this.validateQueryAccess(userId, workspaceId, projectId, type)) {
        throw new Error('Access denied for query scope');
      }

      // Log query for analytics (with sanitized query)
      await this.logQuery(userId, workspaceId, sanitizedQuery, options);

      // Check cache for similar queries
      const cachedResult = await this.getCachedQueryResult(sanitizedQuery, workspaceId, type);
      if (cachedResult) {
        return {
          ...cachedResult,
          cached: true,
          duration: Date.now() - startTime
        };
      }

      // Generate query embedding with sanitized input
      const queryEmbedding = await this.embeddingManager.generateEmbeddings(
        sanitizedQuery,
        {
          userId,
          workspaceId,
          language,
          provider: 'openai',
          model: 'text-embedding-3-small'
        }
      );

      // Determine collections to search
      const collectionsToSearch = this.getSearchCollections(type, workspaceId, projectId);
      
      // Perform semantic search across collections
      const semanticResults = await this.performSemanticSearch(
        queryEmbedding.embedding,
        collectionsToSearch,
        { topK, workspaceId, projectId }
      );

      // Perform keyword search with sanitized query
      const keywordResults = await this.performKeywordSearch(
        sanitizedQuery,
        collectionsToSearch,
        { topK, workspaceId, projectId }
      );

      // Combine and re-rank results
      const combinedResults = await this.combineAndRerank(
        semanticResults,
        keywordResults,
        sanitizedQuery,
        queryEmbedding.embedding
      );

      // Filter by minimum score
      const filteredResults = combinedResults.filter(r => r.score >= minScore);

      // Limit to final K results
      const finalResults = filteredResults.slice(0, this.ragConfig.finalK);

      // Enhance results with metadata and citations
      const enhancedResults = await this.enhanceResults(
        finalResults,
        { includeMetadata, includeCitations }
      );

      const result = {
        query: sanitizedQuery, // Return sanitized query
        results: enhancedResults,
        totalFound: combinedResults.length,
        filtered: finalResults.length,
        collections: collectionsToSearch.map(c => c.name),
        duration: Date.now() - startTime,
        cached: false,
        queryEmbeddingCost: queryEmbedding.cost
      };

      // Cache successful results
      if (finalResults.length > 0) {
        await this.cacheQueryResult(sanitizedQuery, workspaceId, type, result);
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to query knowledge base', error);
      throw error;
    }
  }

  /**
   * Perform semantic search using ChromaDB
   */
  async performSemanticSearch(queryEmbedding, collections, options) {
    const { topK, workspaceId, projectId } = options;
    const allResults = [];

    for (const collectionInfo of collections) {
      try {
        const collection = await this.chromaManager.getOrCreateCollection(
          collectionInfo.name,
          { type: collectionInfo.type }
        );

        // Build where clause for filtering
        const whereClause = this.buildWhereClause(collectionInfo.type, workspaceId, projectId);

        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: Math.ceil(topK / collections.length), // Distribute across collections
          where: whereClause,
          include: ['documents', 'metadatas', 'distances']
        });

        // Transform results
        if (results.documents && results.documents[0]) {
          for (let i = 0; i < results.documents[0].length; i++) {
            allResults.push({
              type: 'semantic',
              collection: collectionInfo.name,
              document: results.documents[0][i],
              metadata: results.metadatas[0][i],
              distance: results.distances[0][i],
              score: 1 - results.distances[0][i], // Convert distance to similarity
              source: 'chromadb'
            });
          }
        }

      } catch (error) {
        this.logger.error('Semantic search failed for collection', error, {
          collection: collectionInfo.name
        });
      }
    }

    // Sort by score descending
    return allResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Perform keyword search using MongoDB text search
   */
  async performKeywordSearch(query, collections, options) {
    const { topK, workspaceId, projectId } = options;
    
    try {
      const db = this.mongoClient.getDb();
      
      // Build match criteria
      const matchCriteria = {
        $text: { $search: query },
        status: 'indexed'
      };

      // Add workspace/project filters
      if (workspaceId) {
        matchCriteria.$or = [
          { workspaceId },
          { type: 'global' }
        ];
      }
      
      if (projectId) {
        matchCriteria.projectId = projectId;
      }

      // SECURITY FIX: Safe regex construction to prevent ReDoS attacks
      const safeRegexQuery = this.createSafeRegexPattern(query);
      
      // Search in document chunks
      const keywordResults = await db.collection('rag_chunks').aggregate([
        {
          $match: {
            ...matchCriteria,
            content: { $regex: safeRegexQuery, $options: 'i' }
          }
        },
        {
          $addFields: {
            score: { $meta: 'textScore' }
          }
        },
        { $sort: { score: { $meta: 'textScore' } } },
        { $limit: topK },
        {
          $lookup: {
            from: 'rag_documents',
            localField: 'documentId',
            foreignField: '_id',
            as: 'document'
          }
        }
      ]).toArray();

      return keywordResults.map(result => ({
        type: 'keyword',
        collection: 'mongodb',
        document: result.content,
        metadata: {
          ...result.metadata,
          document_title: result.document[0]?.title
        },
        score: result.score || 0.5,
        source: 'mongodb'
      }));

    } catch (error) {
      this.logger.error('Keyword search failed', error);
      return [];
    }
  }

  /**
   * Combine semantic and keyword results with re-ranking
   */
  async combineAndRerank(semanticResults, keywordResults, query, queryEmbedding) {
    // Create combined result set
    const combined = new Map();
    
    // Add semantic results
    semanticResults.forEach(result => {
      const key = this.createResultKey(result);
      const weightedScore = result.score * this.ragConfig.hybridSearchWeight.semantic;
      
      combined.set(key, {
        ...result,
        scores: { semantic: result.score, keyword: 0 },
        combinedScore: weightedScore
      });
    });

    // Add keyword results
    keywordResults.forEach(result => {
      const key = this.createResultKey(result);
      const weightedScore = result.score * this.ragConfig.hybridSearchWeight.keyword;
      
      if (combined.has(key)) {
        // Merge with existing result
        const existing = combined.get(key);
        existing.scores.keyword = result.score;
        existing.combinedScore += weightedScore;
      } else {
        combined.set(key, {
          ...result,
          scores: { semantic: 0, keyword: result.score },
          combinedScore: weightedScore
        });
      }
    });

    // Convert to array and sort by combined score
    let results = Array.from(combined.values())
      .sort((a, b) => b.combinedScore - a.combinedScore);

    // Apply additional re-ranking based on context relevance
    results = await this.applyContextualReranking(results, query);

    return results;
  }

  /**
   * Apply contextual re-ranking
   */
  async applyContextualReranking(results, query) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return results.map(result => {
      let contextScore = result.combinedScore;
      
      // Boost results that contain query terms in title
      const title = result.metadata?.title || result.metadata?.document_title || '';
      const titleBoost = queryTerms.reduce((boost, term) => {
        return boost + (title.toLowerCase().includes(term) ? 0.1 : 0);
      }, 0);
      
      // Boost more recent documents
      const createdAt = result.metadata?.created_at;
      let recencyBoost = 0;
      if (createdAt) {
        const age = Date.now() - new Date(createdAt).getTime();
        const daysSinceCreation = age / (24 * 60 * 60 * 1000);
        recencyBoost = Math.max(0, 0.05 - (daysSinceCreation * 0.001)); // Small boost for recent docs
      }
      
      // Boost results from project-specific knowledge
      const typeBoost = result.metadata?.type === 'project' ? 0.05 : 0;
      
      contextScore += titleBoost + recencyBoost + typeBoost;
      
      return {
        ...result,
        score: contextScore,
        boosts: {
          title: titleBoost,
          recency: recencyBoost,
          type: typeBoost
        }
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Enhance results with metadata and citations
   */
  async enhanceResults(results, options) {
    const { includeMetadata, includeCitations } = options;
    
    const enhanced = [];
    
    for (const result of results) {
      const enhanced_result = {
        content: result.document,
        score: result.score,
        type: result.type,
        source: result.source
      };
      
      if (includeMetadata) {
        enhanced_result.metadata = {
          title: result.metadata?.title || result.metadata?.document_title,
          type: result.metadata?.type,
          workspace_id: result.metadata?.workspace_id,
          project_id: result.metadata?.project_id,
          language: result.metadata?.language,
          tags: result.metadata?.tags?.split(',') || [],
          created_at: result.metadata?.created_at,
          scores: result.scores || { combined: result.score }
        };
      }
      
      if (includeCitations) {
        enhanced_result.citation = await this.generateCitation(result);
      }
      
      enhanced.push(enhanced_result);
    }
    
    return enhanced;
  }

  /**
   * Generate citation for result
   */
  async generateCitation(result) {
    const metadata = result.metadata;
    
    const citation = {
      title: metadata?.title || metadata?.document_title || 'Untitled Document',
      type: metadata?.type || 'unknown',
      created_at: metadata?.created_at,
      chunk_index: metadata?.chunk_index,
      document_id: metadata?.document_id
    };
    
    // Add workspace/project context
    if (metadata?.workspace_id) {
      citation.workspace_id = metadata.workspace_id;
    }
    
    if (metadata?.project_id) {
      citation.project_id = metadata.project_id;
    }
    
    // Generate citation URL (for frontend navigation)
    citation.url = this.generateCitationURL(citation);
    
    return citation;
  }

  /**
   * Generate citation URL for frontend
   */
  generateCitationURL(citation) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    if (citation.type === 'global') {
      return `${baseUrl}/knowledge/global/${citation.document_id}`;
    } else if (citation.type === 'workspace') {
      return `${baseUrl}/workspace/${citation.workspace_id}/knowledge/${citation.document_id}`;
    } else if (citation.type === 'project') {
      return `${baseUrl}/project/${citation.project_id}/knowledge/${citation.document_id}`;
    }
    
    return `${baseUrl}/knowledge/${citation.document_id}`;
  }

  /**
   * Get collection name based on type
   */
  getCollectionName(type, workspaceId, projectId) {
    switch (type) {
      case 'global':
        return this.collections.global;
      case 'workspace':
        return this.collections.workspace(workspaceId);
      case 'project':
        return this.collections.project(projectId);
      default:
        throw new Error(`Invalid collection type: ${type}`);
    }
  }

  /**
   * Ensure ChromaDB collection exists
   */
  async ensureCollection(collectionName, type, workspaceId, projectId) {
    try {
      // Use centralized manager to ensure collection exists
      await this.chromaManager.getOrCreateCollection(collectionName, {
        type,
        workspace_id: workspaceId,
        project_id: projectId,
        created_at: new Date().toISOString()
      });
      
      this.logger.debug('Ensured ChromaDB collection exists', { 
        name: collectionName,
        type 
      });
    } catch (error) {
      this.logger.error('Failed to ensure collection', { 
        collectionName, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get collections to search based on type
   */
  getSearchCollections(type, workspaceId, projectId) {
    const collections = [];
    
    if (type === 'all' || type === 'global') {
      collections.push({ name: this.collections.global, type: 'global' });
    }
    
    if ((type === 'all' || type === 'workspace') && workspaceId) {
      collections.push({ 
        name: this.collections.workspace(workspaceId), 
        type: 'workspace' 
      });
    }
    
    if ((type === 'all' || type === 'project') && projectId) {
      collections.push({ 
        name: this.collections.project(projectId), 
        type: 'project' 
      });
    }
    
    return collections;
  }

  /**
   * Build ChromaDB where clause for filtering
   */
  buildWhereClause(type, workspaceId, projectId) {
    const where = {};
    
    if (workspaceId && type !== 'global') {
      where.workspace_id = workspaceId;
    }
    
    if (projectId && type === 'project') {
      where.project_id = projectId;
    }
    
    return Object.keys(where).length > 0 ? where : undefined;
  }

  /**
   * Create result key for deduplication
   */
  createResultKey(result) {
    const content = result.document || '';
    const hash = crypto.createHash('md5').update(content).digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Detect PII in content
   */
  detectPII(content) {
    const foundTypes = [];
    
    for (const pattern of this.piiPatterns) {
      if (pattern.test(content)) {
        foundTypes.push(pattern.source);
      }
    }
    
    return {
      hasPII: foundTypes.length > 0,
      types: foundTypes
    };
  }

  /**
   * Create document hash for deduplication
   */
  createDocumentHash(content, title) {
    const combined = `${title}|${content}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Log query for analytics
   */
  async logQuery(userId, workspaceId, query, options) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('rag_queries').insertOne({
        userId,
        workspaceId,
        query: query.substring(0, 500), // Limit query length
        options: {
          type: options.type,
          language: options.language,
          topK: options.topK
        },
        timestamp: new Date()
      });
      
    } catch (error) {
      this.logger.error('Failed to log RAG query', error);
    }
  }

  /**
   * Get cached query result
   */
  async getCachedQueryResult(query, workspaceId, type) {
    try {
      const cacheKey = this.createQueryCacheKey(query, workspaceId, type);
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Failed to get cached query result', error);
      return null;
    }
  }

  /**
   * Cache query result
   */
  async cacheQueryResult(query, workspaceId, type, result) {
    try {
      const cacheKey = this.createQueryCacheKey(query, workspaceId, type);
      const ttl = 3600; // 1 hour
      
      // Remove some fields to reduce cache size
      const cacheableResult = {
        ...result,
        results: result.results.map(r => ({
          content: r.content.substring(0, 500), // Truncate content
          score: r.score,
          metadata: r.metadata,
          citation: r.citation
        }))
      };
      
      await this.redisClient.setex(cacheKey, ttl, JSON.stringify(cacheableResult));
      
    } catch (error) {
      this.logger.error('Failed to cache query result', error);
    }
  }

  /**
   * Create cache key for query
   */
  createQueryCacheKey(query, workspaceId, type) {
    const key = `${query}|${workspaceId || 'global'}|${type}`;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return `rag_query:${hash}`;
  }

  /**
   * Load pre-built knowledge base
   */
  async loadPreBuiltKnowledge() {
    try {
      // Check if global knowledge already loaded
      const db = this.mongoClient.getDb();
      const globalCount = await db.collection('rag_documents')
        .countDocuments({ type: 'global' });
      
      if (globalCount > 0) {
        this.logger.info('Pre-built knowledge already loaded', { count: globalCount });
        return;
      }
      
      // Load UX frameworks and best practices
      const preBuiltDocs = [
        {
          title: 'Atomic Design Methodology',
          content: this.getAtomicDesignContent(),
          type: 'global',
          tags: ['design-system', 'atomic-design', 'methodology'],
          metadata: { category: 'design-framework' }
        },
        {
          title: 'WCAG Accessibility Guidelines',
          content: this.getWCAGContent(),
          type: 'global',
          tags: ['accessibility', 'wcag', 'guidelines'],
          metadata: { category: 'accessibility' }
        },
        {
          title: 'UX Best Practices for Login Flows',
          content: this.getLoginFlowContent(),
          type: 'global',
          tags: ['login', 'authentication', 'best-practices'],
          metadata: { category: 'flow-patterns' }
        },
        {
          title: 'E-commerce Checkout Best Practices',
          content: this.getCheckoutFlowContent(),
          type: 'global',
          tags: ['checkout', 'ecommerce', 'conversion'],
          metadata: { category: 'flow-patterns' }
        }
      ];
      
      // Add each document
      for (const doc of preBuiltDocs) {
        try {
          await this.addDocument({
            ...doc,
            userId: 'system',
            workspaceId: null,
            projectId: null
          });
          
          this.logger.info('Added pre-built knowledge', { title: doc.title });
          
        } catch (error) {
          this.logger.error('Failed to add pre-built knowledge', error, {
            title: doc.title
          });
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to load pre-built knowledge', error);
    }
  }

  /**
   * Get Atomic Design content (placeholder)
   */
  getAtomicDesignContent() {
    return `
# Atomic Design Methodology

Atomic Design is a methodology for creating design systems. It consists of five distinct stages:

## Atoms
Atoms are the basic building blocks of all matter. Applied to web interfaces, atoms are HTML tags such as form labels, inputs, or buttons. They include more abstract elements like color palettes, fonts, and animations.

## Molecules  
Molecules are groups of atoms bonded together, which take on their own properties and serve as the backbone of design systems. For example, a form label, input field, and submit button atom can be combined to form a search form molecule.

## Organisms
Organisms are groups of molecules (and possibly atoms) joined together to form distinct sections of an interface. For example, a website header organism might consist of a logo, navigation, and search form molecules.

## Templates
Templates are page-level objects that place components into a layout and articulate the design's underlying content structure.

## Pages
Pages are specific instances of templates that show what a UI looks like with real representative content in place.

This methodology helps create consistent, scalable design systems that can be maintained and evolved over time.
    `;
  }

  /**
   * Get WCAG content (placeholder)
   */
  getWCAGContent() {
    return `
# Web Content Accessibility Guidelines (WCAG)

WCAG provides guidelines for making web content accessible to people with disabilities. The guidelines are organized around four principles:

## 1. Perceivable
Information must be presentable to users in ways they can perceive:
- Provide text alternatives for images
- Provide captions for videos
- Ensure sufficient color contrast
- Make content adaptable to different presentations

## 2. Operable
User interface components must be operable:
- Make all functionality keyboard accessible
- Give users enough time to read content
- Don't use content that causes seizures
- Help users navigate and find content

## 3. Understandable
Information and UI operation must be understandable:
- Make text readable and understandable
- Make content appear and operate predictably
- Help users avoid and correct mistakes

## 4. Robust
Content must be robust enough for interpretation by assistive technologies:
- Maximize compatibility with assistive technologies
- Use valid, semantic HTML
- Ensure content works across different browsers and devices

Following these guidelines ensures your UX flows are accessible to all users.
    `;
  }

  /**
   * Get Login Flow content (placeholder)
   */
  getLoginFlowContent() {
    return `
# UX Best Practices for Login Flows

A well-designed login flow balances security with user experience:

## Key Principles

### 1. Minimize Friction
- Use single-field forms when possible
- Implement smart defaults
- Provide clear error messages
- Support autofill and password managers

### 2. Progressive Enhancement
- Start with basic email/password
- Add optional security features
- Implement social login options
- Consider passwordless authentication

### 3. Error Handling
- Provide specific, actionable error messages
- Highlight problematic fields clearly
- Offer recovery options immediately
- Don't reveal which field is incorrect for security

### 4. Security Considerations
- Implement rate limiting
- Use HTTPS always
- Consider multi-factor authentication
- Provide account lockout protection

### 5. Mobile Optimization
- Use appropriate input types
- Implement touch-friendly buttons
- Consider biometric authentication
- Optimize keyboard behavior

A successful login flow gets users to their destination quickly while maintaining appropriate security measures.
    `;
  }

  /**
   * Get Checkout Flow content (placeholder)
   */
  getCheckoutFlowContent() {
    return `
# E-commerce Checkout Best Practices

The checkout process is critical for conversion. Here are key UX principles:

## Checkout Flow Structure

### 1. Guest Checkout Option
- Always offer guest checkout
- Make account creation optional
- Show benefits of creating account
- Allow post-purchase registration

### 2. Progress Indicators
- Show clear step-by-step progress
- Allow users to edit previous steps
- Indicate required vs optional fields
- Provide estimated completion time

### 3. Form Design
- Use single-column layouts
- Group related information
- Implement inline validation
- Provide helpful placeholder text

### 4. Payment Options
- Support multiple payment methods
- Display security badges clearly
- Show accepted credit cards
- Consider digital wallets (Apple Pay, etc.)

### 5. Mobile Optimization
- Use mobile-friendly form inputs
- Implement autofill capabilities
- Optimize button sizes for touch
- Consider mobile payment options

### 6. Trust Signals
- Display security certificates
- Show return/refund policies
- Include customer service contact
- Display reviews or testimonials

A smooth checkout process can significantly improve conversion rates and reduce cart abandonment.
    `;
  }

  /**
   * Get RAG system statistics
   */
  async getRAGStats() {
    try {
      const db = this.mongoClient.getDb();
      
      const [docStats, queryStats] = await Promise.all([
        // Document statistics
        db.collection('rag_documents').aggregate([
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              totalChunks: { $sum: '$metadata.chunkCount' },
              avgTokens: { $avg: '$metadata.totalTokens' }
            }
          }
        ]).toArray(),
        
        // Query statistics (last 24h)
        db.collection('rag_queries').aggregate([
          {
            $match: {
              timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: '$workspaceId',
              queryCount: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' }
            }
          }
        ]).toArray()
      ]);
      
      return {
        documents: docStats,
        queries: queryStats,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get RAG stats', error);
      return null;
    }
  }
  
  // SECURITY FIX: New security methods
  
  /**
   * Validate query access permissions
   */
  async validateQueryAccess(userId, workspaceId, projectId, type) {
    try {
      // Basic validation - in a real system, this would check user permissions
      if (!userId) {
        return false;
      }
      
      // Global access is allowed for authenticated users
      if (type === 'global') {
        return true;
      }
      
      // Workspace access requires workspace membership
      if (type === 'workspace' && !workspaceId) {
        return false;
      }
      
      // Project access requires both workspace and project membership
      if (type === 'project' && (!workspaceId || !projectId)) {
        return false;
      }
      
      // In a real implementation, you would check against user permissions database
      // For now, assume authenticated users have access to their own workspaces/projects
      return true;
      
    } catch (error) {
      this.logger.error('Query access validation failed', error);
      return false;
    }
  }
  
  /**
   * Create safe regex pattern to prevent ReDoS attacks
   */
  createSafeRegexPattern(query) {
    // SECURITY FIX: Escape special regex characters and limit complexity
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Limit the length to prevent complex regex attacks
    if (escaped.length > 100) {
      return escaped.substring(0, 100);
    }
    
    // Split into words and create a safe pattern
    const words = escaped.split(/\s+/).filter(w => w.length > 0);
    
    // Limit number of words to prevent complex patterns
    const safeWords = words.slice(0, 10);
    
    // Create alternation pattern instead of complex nested patterns
    return safeWords.join('|');
  }
  
  /**
   * Enhanced PII detection with more patterns
   */
  detectPII(content) {
    const piiFound = [];
    
    // Enhanced PII patterns
    const enhancedPiiPatterns = [
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'email' },
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: 'ssn' },
      { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, type: 'credit_card' },
      { pattern: /\b\+?1?[-.]?\s?\(?\d{3}\)?[-.]?\s?\d{3}[-.]?\s?\d{4}\b/g, type: 'phone' },
      // Additional patterns
      { pattern: /\b\d{9}\b/g, type: 'tax_id' },
      { pattern: /\b[A-Z]{2}\d{6,8}\b/g, type: 'passport' },
      { pattern: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, type: 'date_of_birth' },
      { pattern: /\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/g, type: 'formatted_credit_card' }
    ];
    
    for (const { pattern, type } of enhancedPiiPatterns) {
      if (pattern.test(content)) {
        piiFound.push(type);
      }
    }
    
    return {
      hasPII: piiFound.length > 0,
      types: piiFound
    };
  }
  
  /**
   * Enhanced document hash with security considerations
   */
  createDocumentHash(content, title, additionalData = {}) {
    // SECURITY FIX: Include more data in hash to prevent hash collisions
    const hashData = {
      content: content.substring(0, 10000), // Limit content size for hashing
      title,
      timestamp: Date.now(),
      ...additionalData
    };
    
    const dataString = JSON.stringify(hashData);
    return crypto.createHash('sha256').update(dataString, 'utf8').digest('hex');
  }
}

export default EnhancedRAGSystem;