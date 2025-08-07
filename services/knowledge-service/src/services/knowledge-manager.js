// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/services/knowledge-manager.js
// ==========================================

import { ChromaClient, OpenAIEmbeddingFunction, Collection } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

export class KnowledgeManager {
  constructor(logger, mongoClient, redisClient, config) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.config = config;
    
    // ChromaDB client
    this.chromaClient = null;
    this.collections = new Map();
    
    // Embedding models
    this.embeddingModel = null;
    this.geminiClient = null;
    
    // MongoDB collections
    this.knowledgeCollection = null;
    this.documentsCollection = null;
    this.queriesCollection = null;
    
    // Cache settings
    this.cacheTimeout = 3600000; // 1 hour
    this.semanticCache = new Map();
  }

  async initialize() {
    try {
      // Initialize ChromaDB
      this.chromaClient = new ChromaClient({
        path: this.config.chromadb?.path || 'http://localhost:8000'
      });

      // Initialize embedding models
      if (this.config.gemini?.apiKey) {
        this.geminiClient = new GoogleGenerativeAI(this.config.gemini.apiKey);
        this.embeddingModel = this.geminiClient.getGenerativeModel({ 
          model: 'embedding-001' 
        });
      }

      // Initialize MongoDB collections
      const db = this.mongoClient.getDb();
      this.knowledgeCollection = db.collection('knowledge_base');
      this.documentsCollection = db.collection('documents');
      this.queriesCollection = db.collection('search_queries');

      // Create indexes
      await this.createIndexes();

      // Initialize default collections
      await this.initializeCollections();

      this.logger.info('KnowledgeManager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize KnowledgeManager', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Knowledge base indexes
      await this.knowledgeCollection.createIndex({ workspaceId: 1, type: 1 });
      await this.knowledgeCollection.createIndex({ 'metadata.tags': 1 });
      await this.knowledgeCollection.createIndex({ createdAt: -1 });
      await this.knowledgeCollection.createIndex({ 
        title: 'text', 
        content: 'text', 
        'metadata.description': 'text' 
      });

      // Documents indexes
      await this.documentsCollection.createIndex({ workspaceId: 1, status: 1 });
      await this.documentsCollection.createIndex({ documentHash: 1 }, { unique: true });
      await this.documentsCollection.createIndex({ processedAt: -1 });

      // Queries indexes
      await this.queriesCollection.createIndex({ workspaceId: 1, userId: 1 });
      await this.queriesCollection.createIndex({ timestamp: -1 });
      await this.queriesCollection.createIndex({ 'performance.responseTime': 1 });

      this.logger.info('MongoDB indexes created for knowledge service');
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
    }
  }

  async initializeCollections() {
    try {
      // Create default ChromaDB collections
      const collections = [
        'ux_patterns',
        'design_systems',
        'user_flows',
        'best_practices',
        'component_library',
        'accessibility_guidelines'
      ];

      for (const collectionName of collections) {
        await this.getOrCreateCollection(collectionName);
      }

      this.logger.info('ChromaDB collections initialized');
    } catch (error) {
      this.logger.error('Failed to initialize collections', error);
    }
  }

  /**
   * Get or create a ChromaDB collection
   */
  async getOrCreateCollection(name, metadata = {}) {
    try {
      if (this.collections.has(name)) {
        return this.collections.get(name);
      }

      let collection;
      try {
        collection = await this.chromaClient.getCollection({
          name,
          embeddingFunction: this.getEmbeddingFunction()
        });
      } catch (error) {
        // Collection doesn't exist, create it
        collection = await this.chromaClient.createCollection({
          name,
          metadata: {
            ...metadata,
            createdAt: new Date().toISOString()
          },
          embeddingFunction: this.getEmbeddingFunction()
        });
      }

      this.collections.set(name, collection);
      return collection;
    } catch (error) {
      this.logger.error('Failed to get/create collection', error);
      throw error;
    }
  }

  /**
   * Get embedding function for ChromaDB
   */
  getEmbeddingFunction() {
    if (this.config.openai?.apiKey) {
      return new OpenAIEmbeddingFunction({
        apiKey: this.config.openai.apiKey,
        modelName: 'text-embedding-3-small'
      });
    }
    
    // Fallback to custom embedding function using Gemini
    return {
      generate: async (texts) => {
        const embeddings = [];
        for (const text of texts) {
          const embedding = await this.generateEmbedding(text);
          embeddings.push(embedding);
        }
        return embeddings;
      }
    };
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text) {
    try {
      if (!this.embeddingModel) {
        throw new Error('Embedding model not initialized');
      }

      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      
      // Fallback to simple hash-based embedding for development
      const hash = crypto.createHash('sha256').update(text).digest();
      const embedding = [];
      for (let i = 0; i < 768; i++) {
        embedding.push((hash[i % hash.length] / 255) * 2 - 1);
      }
      return embedding;
    }
  }

  /**
   * Add document to knowledge base
   */
  async addDocument(workspaceId, document, options = {}) {
    try {
      const {
        title,
        content,
        type = 'document',
        source = 'manual',
        tags = [],
        metadata = {}
      } = document;

      // Generate document hash to prevent duplicates
      const documentHash = crypto
        .createHash('sha256')
        .update(content)
        .digest('hex');

      // Check if document already exists
      const existing = await this.documentsCollection.findOne({ documentHash });
      if (existing) {
        this.logger.info('Document already exists in knowledge base', {
          documentId: existing._id
        });
        return existing;
      }

      // Create document record
      const doc = {
        _id: new ObjectId(),
        workspaceId,
        title,
        content,
        type,
        source,
        documentHash,
        metadata: {
          ...metadata,
          tags,
          wordCount: content.split(/\s+/).length,
          language: this.detectLanguage(content)
        },
        processing: {
          status: 'pending',
          chunks: [],
          embeddings: []
        },
        statistics: {
          queries: 0,
          relevanceScore: 0,
          lastAccessed: null
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert document
      await this.documentsCollection.insertOne(doc);

      // Process document asynchronously
      this.processDocument(doc._id, workspaceId, content, type).catch(error => {
        this.logger.error('Failed to process document', error);
      });

      this.logger.info('Document added to knowledge base', {
        documentId: doc._id,
        workspaceId
      });

      return doc;
    } catch (error) {
      this.logger.error('Failed to add document', error);
      throw error;
    }
  }

  /**
   * Process document for vector storage
   */
  async processDocument(documentId, workspaceId, content, type) {
    try {
      // Update status
      await this.documentsCollection.updateOne(
        { _id: documentId },
        { $set: { 'processing.status': 'processing' } }
      );

      // Chunk document
      const chunks = this.chunkDocument(content);
      
      // Get appropriate collection
      const collectionName = this.getCollectionName(type);
      const collection = await this.getOrCreateCollection(collectionName);

      // Process each chunk
      const chunkIds = [];
      const embeddings = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkId = `${documentId}_chunk_${i}`;
        
        // Add to ChromaDB
        await collection.add({
          ids: [chunkId],
          documents: [chunk.text],
          metadatas: [{
            documentId: documentId.toString(),
            workspaceId,
            chunkIndex: i,
            type,
            timestamp: new Date().toISOString()
          }]
        });

        chunkIds.push(chunkId);
        embeddings.push(chunk.embedding || null);
      }

      // Update document with processing results
      await this.documentsCollection.updateOne(
        { _id: documentId },
        {
          $set: {
            'processing.status': 'completed',
            'processing.chunks': chunkIds,
            'processing.embeddings': embeddings,
            'processing.processedAt': new Date(),
            'processing.chunkCount': chunks.length
          }
        }
      );

      // Clear relevant caches
      await this.clearCache(workspaceId);

      this.logger.info('Document processed successfully', {
        documentId,
        chunks: chunks.length
      });
    } catch (error) {
      // Update status to failed
      await this.documentsCollection.updateOne(
        { _id: documentId },
        {
          $set: {
            'processing.status': 'failed',
            'processing.error': error.message
          }
        }
      );
      
      throw error;
    }
  }

  /**
   * Chunk document into smaller pieces
   */
  chunkDocument(content, maxChunkSize = 1000) {
    const chunks = [];
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChunkSize && currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          size: currentChunk.length
        });
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    if (currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        size: currentChunk.length
      });
    }

    return chunks;
  }

  /**
   * Semantic search in knowledge base
   */
  async search(workspaceId, query, options = {}) {
    try {
      const {
        limit = 10,
        threshold = 0.7,
        collections = ['ux_patterns', 'design_systems', 'user_flows'],
        includeMetadata = true,
        userId = null
      } = options;

      const startTime = Date.now();

      // Check semantic cache
      const cacheKey = this.getSemanticCacheKey(query, options);
      const cached = this.getFromSemanticCache(cacheKey);
      if (cached) {
        this.logger.debug('Semantic cache hit for query', { query });
        return cached;
      }

      // Record query for analytics
      const queryRecord = {
        workspaceId,
        userId,
        query,
        timestamp: new Date(),
        options,
        performance: {
          startTime: new Date()
        }
      };

      const queryId = await this.recordQuery(queryRecord);

      // Search across specified collections
      const allResults = [];
      
      for (const collectionName of collections) {
        const collection = await this.getOrCreateCollection(collectionName);
        
        try {
          const results = await collection.query({
            queryTexts: [query],
            nResults: limit,
            where: { workspaceId }
          });

          if (results && results.documents && results.documents[0]) {
            for (let i = 0; i < results.documents[0].length; i++) {
              const distance = results.distances?.[0]?.[i] || 0;
              const similarity = 1 - distance; // Convert distance to similarity
              
              if (similarity >= threshold) {
                allResults.push({
                  document: results.documents[0][i],
                  metadata: includeMetadata ? results.metadatas?.[0]?.[i] : null,
                  similarity,
                  collection: collectionName,
                  id: results.ids?.[0]?.[i]
                });
              }
            }
          }
        } catch (error) {
          this.logger.error(`Failed to search collection ${collectionName}`, error);
        }
      }

      // Sort by similarity
      allResults.sort((a, b) => b.similarity - a.similarity);
      
      // Limit results
      const finalResults = allResults.slice(0, limit);

      // Enhance results with document metadata
      const enhancedResults = await this.enhanceSearchResults(finalResults);

      // Update query performance metrics
      const responseTime = Date.now() - startTime;
      await this.updateQueryMetrics(queryId, {
        responseTime,
        resultCount: enhancedResults.length,
        topSimilarity: enhancedResults[0]?.similarity || 0
      });

      // Cache results
      this.setInSemanticCache(cacheKey, enhancedResults);

      // Update document statistics
      for (const result of enhancedResults) {
        if (result.documentId) {
          await this.updateDocumentStatistics(result.documentId);
        }
      }

      this.logger.info('Knowledge search completed', {
        query,
        results: enhancedResults.length,
        responseTime
      });

      return enhancedResults;
    } catch (error) {
      this.logger.error('Failed to search knowledge base', error);
      throw error;
    }
  }

  /**
   * Generate contextual response using RAG
   */
  async generateRAGResponse(workspaceId, query, options = {}) {
    try {
      const {
        maxContextLength = 4000,
        temperature = 0.7,
        includeReferences = true,
        model = 'gemini-1.5-flash'
      } = options;

      // Search for relevant context
      const searchResults = await this.search(workspaceId, query, {
        limit: 5,
        threshold: 0.6
      });

      if (searchResults.length === 0) {
        return {
          response: 'I could not find relevant information in the knowledge base to answer your question.',
          context: [],
          references: []
        };
      }

      // Build context from search results
      let context = '';
      const references = [];
      
      for (const result of searchResults) {
        if (context.length + result.document.length > maxContextLength) {
          break;
        }
        
        context += `\n\n${result.document}`;
        
        if (includeReferences && result.metadata) {
          references.push({
            id: result.id,
            title: result.metadata.title || 'Untitled',
            similarity: result.similarity,
            collection: result.collection
          });
        }
      }

      // Generate response using AI model
      const prompt = `Based on the following context, answer the user's question. If the context doesn't contain relevant information, say so.

Context:
${context}

Question: ${query}

Answer:`;

      let response;
      
      if (this.geminiClient) {
        const model = this.geminiClient.getGenerativeModel({ model });
        const result = await model.generateContent(prompt);
        response = result.response.text();
      } else {
        // Fallback response without AI
        response = `Based on the knowledge base, here are the most relevant findings:\n\n` +
                  searchResults.slice(0, 3).map(r => `• ${r.document.substring(0, 200)}...`).join('\n');
      }

      const ragResponse = {
        response,
        query,
        context: searchResults.map(r => ({
          content: r.document,
          similarity: r.similarity,
          source: r.collection
        })),
        references: includeReferences ? references : null,
        metadata: {
          model,
          contextLength: context.length,
          timestamp: new Date()
        }
      };

      // Cache RAG response
      const cacheKey = `rag:${workspaceId}:${crypto.createHash('md5').update(query).digest('hex')}`;
      await this.setInCache(cacheKey, ragResponse, 3600); // Cache for 1 hour

      this.logger.info('RAG response generated', {
        workspaceId,
        query: query.substring(0, 50),
        contextSources: searchResults.length
      });

      return ragResponse;
    } catch (error) {
      this.logger.error('Failed to generate RAG response', error);
      throw error;
    }
  }

  /**
   * Update knowledge base from conversation
   */
  async learnFromConversation(workspaceId, conversation) {
    try {
      const { messages, metadata } = conversation;
      
      // Extract Q&A pairs
      const qaPairs = [];
      for (let i = 0; i < messages.length - 1; i += 2) {
        if (messages[i].role === 'user' && messages[i + 1].role === 'assistant') {
          qaPairs.push({
            question: messages[i].content,
            answer: messages[i + 1].content,
            timestamp: messages[i].timestamp
          });
        }
      }

      // Add Q&A pairs to knowledge base
      for (const qa of qaPairs) {
        const document = {
          title: `Q: ${qa.question.substring(0, 100)}`,
          content: `Question: ${qa.question}\n\nAnswer: ${qa.answer}`,
          type: 'conversation',
          source: 'chat',
          tags: ['qa', 'conversation'],
          metadata: {
            ...metadata,
            questionLength: qa.question.length,
            answerLength: qa.answer.length,
            timestamp: qa.timestamp
          }
        };

        await this.addDocument(workspaceId, document);
      }

      // Extract key concepts and add them
      const concepts = this.extractConcepts(messages);
      for (const concept of concepts) {
        await this.addConcept(workspaceId, concept);
      }

      this.logger.info('Learned from conversation', {
        workspaceId,
        qaPairs: qaPairs.length,
        concepts: concepts.length
      });

      return {
        qaPairsAdded: qaPairs.length,
        conceptsExtracted: concepts.length
      };
    } catch (error) {
      this.logger.error('Failed to learn from conversation', error);
      throw error;
    }
  }

  /**
   * Add UX pattern to knowledge base
   */
  async addUXPattern(workspaceId, pattern) {
    try {
      const {
        name,
        description,
        category,
        implementation,
        useCases,
        pros,
        cons,
        examples,
        accessibility,
        relatedPatterns
      } = pattern;

      const document = {
        title: name,
        content: `
          Pattern: ${name}
          Category: ${category}
          
          Description:
          ${description}
          
          Implementation:
          ${implementation}
          
          Use Cases:
          ${useCases.join('\n')}
          
          Pros:
          ${pros.join('\n')}
          
          Cons:
          ${cons.join('\n')}
          
          Accessibility Considerations:
          ${accessibility}
          
          Related Patterns: ${relatedPatterns.join(', ')}
        `,
        type: 'ux_pattern',
        source: 'manual',
        tags: ['ux', 'pattern', category.toLowerCase()],
        metadata: {
          category,
          examples,
          relatedPatterns,
          addedAt: new Date()
        }
      };

      const result = await this.addDocument(workspaceId, document);
      
      // Add to specific UX patterns collection
      const collection = await this.getOrCreateCollection('ux_patterns');
      await collection.add({
        ids: [`pattern_${result._id}`],
        documents: [document.content],
        metadatas: [{
          workspaceId,
          patternName: name,
          category,
          ...document.metadata
        }]
      });

      this.logger.info('UX pattern added', {
        workspaceId,
        pattern: name
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add UX pattern', error);
      throw error;
    }
  }

  /**
   * Get knowledge statistics
   */
  async getStatistics(workspaceId) {
    try {
      const stats = {
        documents: {
          total: 0,
          byType: {},
          byStatus: {}
        },
        storage: {
          collections: [],
          totalChunks: 0,
          totalEmbeddings: 0
        },
        usage: {
          totalQueries: 0,
          averageResponseTime: 0,
          topSearchTerms: []
        }
      };

      // Document statistics
      stats.documents.total = await this.documentsCollection.countDocuments({ workspaceId });
      
      const typeAggregation = await this.documentsCollection.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]).toArray();
      
      typeAggregation.forEach(item => {
        stats.documents.byType[item._id] = item.count;
      });

      // Storage statistics
      for (const [name, collection] of this.collections) {
        try {
          const count = await collection.count();
          stats.storage.collections.push({ name, count });
          stats.storage.totalChunks += count;
        } catch (error) {
          this.logger.error(`Failed to get count for collection ${name}`, error);
        }
      }

      // Usage statistics
      const queries = await this.queriesCollection.aggregate([
        { $match: { workspaceId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgResponseTime: { $avg: '$performance.responseTime' }
          }
        }
      ]).toArray();

      if (queries.length > 0) {
        stats.usage.totalQueries = queries[0].total;
        stats.usage.averageResponseTime = Math.round(queries[0].avgResponseTime || 0);
      }

      // Top search terms
      const topTerms = await this.queriesCollection.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$query', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).toArray();

      stats.usage.topSearchTerms = topTerms.map(term => ({
        query: term._id,
        count: term.count
      }));

      return stats;
    } catch (error) {
      this.logger.error('Failed to get knowledge statistics', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  detectLanguage(text) {
    // Simple language detection based on character patterns
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    return 'en';
  }

  getCollectionName(type) {
    const collectionMap = {
      'ux_pattern': 'ux_patterns',
      'design_system': 'design_systems',
      'user_flow': 'user_flows',
      'best_practice': 'best_practices',
      'component': 'component_library',
      'accessibility': 'accessibility_guidelines',
      'conversation': 'conversations',
      'document': 'documents'
    };
    
    return collectionMap[type] || 'general';
  }

  extractConcepts(messages) {
    // Extract key concepts from conversation
    const concepts = new Set();
    const keywords = ['button', 'form', 'navigation', 'layout', 'color', 'typography', 
                     'responsive', 'accessibility', 'user flow', 'interaction'];
    
    for (const message of messages) {
      const content = message.content.toLowerCase();
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          concepts.add(keyword);
        }
      }
    }
    
    return Array.from(concepts);
  }

  async addConcept(workspaceId, concept) {
    // Add concept to knowledge base
    const document = {
      title: `Concept: ${concept}`,
      content: `This conversation discussed the concept of ${concept}.`,
      type: 'concept',
      source: 'extracted',
      tags: ['concept', concept.replace(/\s+/g, '-')],
      metadata: {
        concept,
        extractedAt: new Date()
      }
    };
    
    await this.addDocument(workspaceId, document);
  }

  async enhanceSearchResults(results) {
    const enhanced = [];
    
    for (const result of results) {
      const documentId = result.metadata?.documentId;
      let documentInfo = null;
      
      if (documentId) {
        try {
          documentInfo = await this.documentsCollection.findOne({ 
            _id: new ObjectId(documentId) 
          });
        } catch (error) {
          this.logger.error('Failed to fetch document info', error);
        }
      }
      
      enhanced.push({
        ...result,
        documentId,
        title: documentInfo?.title || result.metadata?.title || 'Untitled',
        type: documentInfo?.type || result.metadata?.type || 'unknown',
        source: documentInfo?.source || result.metadata?.source || 'unknown'
      });
    }
    
    return enhanced;
  }

  async recordQuery(queryRecord) {
    const result = await this.queriesCollection.insertOne(queryRecord);
    return result.insertedId;
  }

  async updateQueryMetrics(queryId, metrics) {
    await this.queriesCollection.updateOne(
      { _id: queryId },
      {
        $set: {
          'performance.responseTime': metrics.responseTime,
          'performance.resultCount': metrics.resultCount,
          'performance.topSimilarity': metrics.topSimilarity,
          'performance.endTime': new Date()
        }
      }
    );
  }

  async updateDocumentStatistics(documentId) {
    await this.documentsCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $inc: { 'statistics.queries': 1 },
        $set: { 'statistics.lastAccessed': new Date() }
      }
    );
  }

  /**
   * Cache management
   */
  getSemanticCacheKey(query, options) {
    const hash = crypto.createHash('md5')
      .update(JSON.stringify({ query, ...options }))
      .digest('hex');
    return `semantic:${hash}`;
  }

  getFromSemanticCache(key) {
    const cached = this.semanticCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.semanticCache.delete(key);
    return null;
  }

  setInSemanticCache(key, data) {
    this.semanticCache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.semanticCache.size > 1000) {
      const firstKey = this.semanticCache.keys().next().value;
      this.semanticCache.delete(firstKey);
    }
  }

  async setInCache(key, value, ttl = 3600) {
    try {
      await this.redisClient.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      this.logger.error('Cache set error', error);
    }
  }

  async clearCache(workspaceId) {
    // Clear semantic cache
    this.semanticCache.clear();
    
    // Clear Redis cache
    try {
      const keys = await this.redisClient.keys(`rag:${workspaceId}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      this.logger.error('Failed to clear cache', error);
    }
  }
}