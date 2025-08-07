/**
 * Knowledge Service Optimizer
 * 
 * Optimizations for the knowledge service to improve performance and reduce costs:
 * - Intelligent prefetching
 * - Query optimization
 * - Memory compression
 * - Batch processing
 * - Relevance scoring improvements
 */

import { ChromaClient } from 'chromadb';

class KnowledgeOptimizer {
  constructor(logger, knowledgeManager, memoryManager) {
    this.logger = logger;
    this.knowledgeManager = knowledgeManager;
    this.memoryManager = memoryManager;
    
    this.config = {
      prefetchEnabled: true,
      compressionEnabled: true,
      batchSize: 10,
      relevanceThreshold: 0.7,
      cacheTimeout: 300000, // 5 minutes
      embeddingCache: new Map(),
      queryCache: new Map()
    };

    // Performance metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      prefetchHits: 0,
      compressionSavings: 0,
      batchProcessed: 0
    };

    // Prefetch queue
    this.prefetchQueue = [];
    this.prefetchCache = new Map();
  }

  /**
   * Optimized query with caching and prefetching
   */
  async optimizedQuery(query, options = {}) {
    const startTime = Date.now();
    
    // Check query cache first
    const cacheKey = this.generateCacheKey(query, options);
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        this.metrics.cacheHits++;
        this.logger.debug('Query cache hit', { query: query.substring(0, 50) });
        return cached.results;
      }
    }
    
    // Check prefetch cache
    if (this.prefetchCache.has(cacheKey)) {
      const prefetched = this.prefetchCache.get(cacheKey);
      this.prefetchCache.delete(cacheKey);
      this.metrics.prefetchHits++;
      this.logger.debug('Prefetch cache hit', { query: query.substring(0, 50) });
      return prefetched;
    }
    
    this.metrics.cacheMisses++;
    
    // Perform actual query with optimizations
    const results = await this.performOptimizedQuery(query, options);
    
    // Cache results
    this.queryCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });
    
    // Trigger prefetching for related queries
    if (this.config.prefetchEnabled) {
      this.triggerPrefetch(query, options);
    }
    
    const duration = Date.now() - startTime;
    this.logger.debug('Optimized query completed', {
      query: query.substring(0, 50),
      duration,
      resultCount: results.length
    });
    
    return results;
  }

  /**
   * Perform optimized query with batching and relevance filtering
   */
  async performOptimizedQuery(query, options) {
    // Get embedding once and cache it
    const embedding = await this.getCachedEmbedding(query);
    
    // Parallel query across different knowledge levels
    const promises = [];
    
    // Global knowledge
    if (options.includeGlobal !== false) {
      promises.push(this.queryWithEmbedding(
        this.knowledgeManager.GLOBAL_COLLECTION,
        embedding,
        Math.ceil(options.nResults * 0.4)
      ));
    }
    
    // Workspace knowledge
    if (options.workspaceId) {
      promises.push(this.queryWithEmbedding(
        `${this.knowledgeManager.WORKSPACE_PREFIX}${options.workspaceId}`,
        embedding,
        Math.ceil(options.nResults * 0.3)
      ));
    }
    
    // Project knowledge
    if (options.projectId) {
      promises.push(this.queryWithEmbedding(
        `${this.knowledgeManager.PROJECT_PREFIX}${options.projectId}`,
        embedding,
        Math.ceil(options.nResults * 0.3)
      ));
    }
    
    // Execute all queries in parallel
    const allResults = await Promise.all(promises);
    const flatResults = allResults.flat();
    
    // Apply relevance filtering and deduplication
    const filteredResults = this.filterAndDeduplicateResults(flatResults);
    
    // Sort by relevance and limit
    filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return filteredResults.slice(0, options.nResults || 5);
  }

  /**
   * Query with pre-computed embedding
   */
  async queryWithEmbedding(collectionName, embedding, nResults) {
    try {
      const collection = await this.knowledgeManager.getCollection(collectionName);
      if (!collection) return [];
      
      const results = await collection.query({
        queryEmbeddings: [embedding],
        nResults,
        include: ['documents', 'metadatas', 'distances']
      });
      
      if (!results.documents || !results.documents[0]) return [];
      
      return results.documents[0].map((doc, index) => ({
        content: doc,
        metadata: results.metadatas?.[0]?.[index] || {},
        relevanceScore: 1 - (results.distances?.[0]?.[index] || 0), // Convert distance to similarity
        collection: collectionName
      }));
    } catch (error) {
      this.logger.warn('Query with embedding failed', { collectionName, error: error.message });
      return [];
    }
  }

  /**
   * Get cached embedding or compute new one
   */
  async getCachedEmbedding(text) {
    const cacheKey = this.hashText(text);
    
    if (this.config.embeddingCache.has(cacheKey)) {
      return this.config.embeddingCache.get(cacheKey);
    }
    
    // Compute embedding (simplified - in production use actual embedding model)
    const embedding = await this.computeEmbedding(text);
    
    // Cache with size limit
    if (this.config.embeddingCache.size > 1000) {
      // Remove oldest entries
      const firstKey = this.config.embeddingCache.keys().next().value;
      this.config.embeddingCache.delete(firstKey);
    }
    
    this.config.embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Compute text embedding (simplified version)
   */
  async computeEmbedding(text) {
    // In production, use actual embedding model (e.g., sentence-transformers)
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(384).fill(0); // Standard embedding size
    
    // Simple hash-based embedding
    words.forEach((word, idx) => {
      const hash = this.hashText(word);
      for (let i = 0; i < 384; i++) {
        vector[i] += ((hash >> (i % 32)) & 1) * (1 / (idx + 1));
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return vector;
  }

  /**
   * Filter and deduplicate results
   */
  filterAndDeduplicateResults(results) {
    const seen = new Set();
    const filtered = [];
    
    for (const result of results) {
      // Filter by relevance threshold
      if (result.relevanceScore < this.config.relevanceThreshold) {
        continue;
      }
      
      // Deduplicate by content hash
      const contentHash = this.hashText(result.content.substring(0, 200));
      if (seen.has(contentHash)) {
        continue;
      }
      
      seen.add(contentHash);
      filtered.push(result);
    }
    
    return filtered;
  }

  /**
   * Trigger prefetching for related queries
   */
  async triggerPrefetch(query, options) {
    // Generate related queries
    const relatedQueries = this.generateRelatedQueries(query);
    
    // Add to prefetch queue
    for (const relatedQuery of relatedQueries) {
      this.prefetchQueue.push({ query: relatedQuery, options });
    }
    
    // Process prefetch queue asynchronously
    this.processPrefetchQueue();
  }

  /**
   * Generate related queries for prefetching
   */
  generateRelatedQueries(query) {
    const related = [];
    const words = query.toLowerCase().split(/\s+/);
    
    // Variations with synonyms
    const synonyms = {
      'create': ['build', 'make', 'generate'],
      'update': ['modify', 'change', 'edit'],
      'delete': ['remove', 'destroy', 'eliminate'],
      'flow': ['process', 'workflow', 'sequence'],
      'user': ['customer', 'visitor', 'client']
    };
    
    for (const word of words) {
      if (synonyms[word]) {
        for (const synonym of synonyms[word]) {
          related.push(query.replace(new RegExp(word, 'gi'), synonym));
        }
      }
    }
    
    // Add partial queries
    if (words.length > 3) {
      related.push(words.slice(0, -1).join(' '));
      related.push(words.slice(1).join(' '));
    }
    
    return related.slice(0, 3); // Limit to 3 related queries
  }

  /**
   * Process prefetch queue
   */
  async processPrefetchQueue() {
    if (this.prefetchQueue.length === 0) return;
    
    // Process in batches
    const batch = this.prefetchQueue.splice(0, this.config.batchSize);
    
    for (const item of batch) {
      const cacheKey = this.generateCacheKey(item.query, item.options);
      
      // Skip if already cached
      if (this.queryCache.has(cacheKey) || this.prefetchCache.has(cacheKey)) {
        continue;
      }
      
      // Perform query in background
      this.performOptimizedQuery(item.query, item.options)
        .then(results => {
          this.prefetchCache.set(cacheKey, results);
          
          // Clean old prefetch entries
          if (this.prefetchCache.size > 50) {
            const firstKey = this.prefetchCache.keys().next().value;
            this.prefetchCache.delete(firstKey);
          }
        })
        .catch(error => {
          this.logger.warn('Prefetch failed', { query: item.query, error: error.message });
        });
    }
    
    this.metrics.batchProcessed += batch.length;
  }

  /**
   * Compress memory context for efficiency
   */
  async compressMemoryContext(context) {
    if (!this.config.compressionEnabled) return context;
    
    const compressed = {
      ...context,
      shortTerm: this.compressShortTerm(context.shortTerm),
      midTerm: this.compressMidTerm(context.midTerm),
      longTerm: context.longTerm // Keep long-term as-is (already compressed)
    };
    
    // Calculate savings
    const originalSize = JSON.stringify(context).length;
    const compressedSize = JSON.stringify(compressed).length;
    this.metrics.compressionSavings += (originalSize - compressedSize);
    
    return compressed;
  }

  /**
   * Compress short-term memory
   */
  compressShortTerm(shortTerm) {
    if (!shortTerm || !shortTerm.messages) return shortTerm;
    
    return {
      ...shortTerm,
      messages: shortTerm.messages.map(msg => ({
        role: msg.role,
        content: msg.content.substring(0, 500), // Limit content length
        timestamp: msg.timestamp,
        messageId: msg.messageId
      }))
    };
  }

  /**
   * Compress mid-term memory
   */
  compressMidTerm(midTerm) {
    if (!midTerm || !midTerm.episodes) return midTerm;
    
    return {
      ...midTerm,
      episodes: midTerm.episodes.map(episode => ({
        episodeNumber: episode.episodeNumber,
        summary: episode.summary.description?.substring(0, 200),
        keyDecisions: episode.keyDecisions?.slice(0, 3), // Keep only top 3
        timespan: episode.timespan,
        messageCount: episode.messageCount
      }))
    };
  }

  /**
   * Batch process multiple knowledge queries
   */
  async batchQuery(queries, options = {}) {
    const results = new Map();
    
    // Group similar queries
    const groups = this.groupSimilarQueries(queries);
    
    // Process each group
    for (const group of groups) {
      if (group.length === 1) {
        // Single query
        const result = await this.optimizedQuery(group[0].query, group[0].options || options);
        results.set(group[0].id, result);
      } else {
        // Batch similar queries
        const batchEmbedding = await this.getCachedEmbedding(group[0].query);
        const batchResults = await this.queryWithEmbedding(
          this.knowledgeManager.GLOBAL_COLLECTION,
          batchEmbedding,
          options.nResults * group.length
        );
        
        // Distribute results
        for (const item of group) {
          const relevantResults = batchResults.filter(r => 
            this.isRelevantToQuery(r.content, item.query)
          ).slice(0, options.nResults || 5);
          
          results.set(item.id, relevantResults);
        }
      }
    }
    
    return results;
  }

  /**
   * Group similar queries for batch processing
   */
  groupSimilarQueries(queries) {
    const groups = [];
    const processed = new Set();
    
    for (let i = 0; i < queries.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [queries[i]];
      processed.add(i);
      
      for (let j = i + 1; j < queries.length; j++) {
        if (processed.has(j)) continue;
        
        const similarity = this.calculateQuerySimilarity(queries[i].query, queries[j].query);
        if (similarity > 0.8) {
          group.push(queries[j]);
          processed.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Calculate similarity between queries
   */
  calculateQuerySimilarity(query1, query2) {
    const words1 = new Set(query1.toLowerCase().split(/\s+/));
    const words2 = new Set(query2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Check if content is relevant to query
   */
  isRelevantToQuery(content, query) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    
    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) matches++;
    }
    
    return matches >= queryWords.length * 0.5;
  }

  /**
   * Generate cache key
   */
  generateCacheKey(query, options) {
    const optionsStr = JSON.stringify({
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      userId: options.userId,
      nResults: options.nResults
    });
    
    return `${this.hashText(query)}:${this.hashText(optionsStr)}`;
  }

  /**
   * Simple hash function
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Clear caches
   */
  clearCaches() {
    this.queryCache.clear();
    this.prefetchCache.clear();
    this.config.embeddingCache.clear();
    this.prefetchQueue = [];
    
    this.logger.info('Knowledge optimizer caches cleared');
  }

  /**
   * Get optimization metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
      : 0;
    
    return {
      ...this.metrics,
      cacheHitRate,
      queryCacheSize: this.queryCache.size,
      prefetchCacheSize: this.prefetchCache.size,
      embeddingCacheSize: this.config.embeddingCache.size,
      compressionRatio: this.metrics.compressionSavings > 0
        ? this.metrics.compressionSavings / (this.metrics.compressionSavings + 1000000)
        : 0
    };
  }

  /**
   * Warm up caches with common queries
   */
  async warmupCaches() {
    const commonQueries = [
      'How to create a login flow',
      'Best practices for UX design',
      'Accessibility guidelines',
      'User registration flow',
      'Dashboard layout patterns',
      'Navigation best practices',
      'Form validation patterns',
      'Error handling in UX'
    ];
    
    for (const query of commonQueries) {
      await this.optimizedQuery(query, { nResults: 3 });
    }
    
    this.logger.info('Knowledge optimizer caches warmed up', {
      queries: commonQueries.length
    });
  }
}

export { KnowledgeOptimizer };