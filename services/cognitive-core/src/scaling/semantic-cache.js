const EventEmitter = require('events');
const crypto = require('crypto');
const { Logger } = require('@ux-flow/common');

const logger = new Logger('semantic-cache');

/**
 * Semantic Cache for AI Responses
 * 
 * Intelligent caching system with:
 * - Semantic similarity matching
 * - Context-aware caching
 * - TTL management
 * - Cache warming
 * - Invalidation strategies
 */
class SemanticCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize || 10000,
      ttl: config.ttl || {
        exact: 3600,    // 1 hour for exact matches
        semantic: 1800,  // 30 min for semantic matches
        default: 900     // 15 min default
      },
      similarityThreshold: config.similarityThreshold || 0.85,
      warmupEnabled: config.warmupEnabled !== false,
      compressionEnabled: config.compressionEnabled !== false,
      ...config
    };

    // Cache storage
    this.exactCache = new Map();
    this.semanticCache = new Map();
    this.embeddings = new Map();
    
    // Cache metadata
    this.metadata = new Map();
    this.accessPatterns = new Map();
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      exactHits: 0,
      semanticHits: 0,
      evictions: 0,
      totalSize: 0
    };

    // Cleanup timer
    this.cleanupTimer = null;

    this.initialize();
  }

  initialize() {
    // Start cleanup timer
    this.startCleanupTimer();
    
    // Warm up cache if enabled
    if (this.config.warmupEnabled) {
      this.warmupCache();
    }
  }

  /**
   * Get cached response
   */
  async get(prompt, context = {}) {
    const key = this.generateKey(prompt, context);
    
    // Check exact cache first
    const exactMatch = this.exactCache.get(key);
    if (exactMatch && !this.isExpired(exactMatch)) {
      this.stats.hits++;
      this.stats.exactHits++;
      this.updateAccessPattern(key);
      
      return {
        hit: true,
        type: 'exact',
        content: exactMatch.content,
        metadata: exactMatch.metadata
      };
    }
    
    // Check semantic cache
    const semanticMatch = await this.findSemanticMatch(prompt, context);
    if (semanticMatch) {
      this.stats.hits++;
      this.stats.semanticHits++;
      
      return {
        hit: true,
        type: 'semantic',
        content: semanticMatch.content,
        metadata: semanticMatch.metadata,
        similarity: semanticMatch.similarity
      };
    }
    
    // Cache miss
    this.stats.misses++;
    return {
      hit: false
    };
  }

  /**
   * Set cache entry
   */
  async set(prompt, content, metadata = {}) {
    const key = this.generateKey(prompt, metadata.context);
    const embedding = await this.generateEmbedding(prompt);
    
    // Check cache size
    if (this.getTotalSize() >= this.config.maxSize) {
      this.evictOldest();
    }
    
    const entry = {
      key,
      prompt,
      content: this.config.compressionEnabled ? this.compress(content) : content,
      metadata,
      embedding,
      timestamp: Date.now(),
      ttl: this.determineTTL(metadata),
      accessCount: 0,
      lastAccess: Date.now()
    };
    
    // Store in both caches
    this.exactCache.set(key, entry);
    this.semanticCache.set(key, entry);
    this.embeddings.set(key, embedding);
    this.metadata.set(key, metadata);
    
    this.stats.totalSize++;
    
    this.emit('cache-set', {
      key,
      size: this.getTotalSize()
    });
  }

  /**
   * Find semantic match in cache
   */
  async findSemanticMatch(prompt, context) {
    const queryEmbedding = await this.generateEmbedding(prompt);
    
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const [key, entry] of this.semanticCache) {
      // Skip expired entries
      if (this.isExpired(entry)) continue;
      
      // Skip if context doesn't match
      if (!this.contextMatches(entry.metadata.context, context)) continue;
      
      // Calculate similarity
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      
      if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
        bestMatch = entry;
        bestSimilarity = similarity;
      }
    }
    
    if (bestMatch) {
      this.updateAccessPattern(bestMatch.key);
      return {
        ...bestMatch,
        content: this.config.compressionEnabled ? this.decompress(bestMatch.content) : bestMatch.content,
        similarity: bestSimilarity
      };
    }
    
    return null;
  }

  /**
   * Generate embedding for text (simplified version)
   */
  async generateEmbedding(text) {
    // In production, this would use a real embedding model
    // For now, use a simple hash-based approach
    const words = text.toLowerCase().split(/\s+/);
    const vector = new Array(128).fill(0);
    
    words.forEach(word => {
      const hash = this.hashString(word);
      for (let i = 0; i < 128; i++) {
        vector[i] += (hash >> i) & 1;
      }
    });
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Generate cache key
   */
  generateKey(prompt, context = {}) {
    const contextStr = JSON.stringify(context, Object.keys(context).sort());
    return crypto
      .createHash('sha256')
      .update(`${prompt}:${contextStr}`)
      .digest('hex');
  }

  /**
   * Check if entry is expired
   */
  isExpired(entry) {
    if (!entry || !entry.timestamp) return true;
    
    const age = Date.now() - entry.timestamp;
    const ttl = entry.ttl || this.config.ttl.default;
    
    return age > ttl * 1000;
  }

  /**
   * Check if context matches
   */
  contextMatches(entryContext, queryContext) {
    if (!entryContext && !queryContext) return true;
    if (!entryContext || !queryContext) return false;
    
    // Check key fields
    const importantKeys = ['userTier', 'agent', 'flowId'];
    
    for (const key of importantKeys) {
      if (entryContext[key] !== queryContext[key]) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Determine TTL based on metadata
   */
  determineTTL(metadata) {
    if (metadata.ttl) return metadata.ttl;
    
    // Longer TTL for higher-tier users
    if (metadata.userTier === 'enterprise') {
      return this.config.ttl.exact * 2;
    }
    
    // Shorter TTL for real-time requests
    if (metadata.realtime) {
      return this.config.ttl.default / 2;
    }
    
    return this.config.ttl.default;
  }

  /**
   * Update access pattern for adaptive caching
   */
  updateAccessPattern(key) {
    const pattern = this.accessPatterns.get(key) || {
      count: 0,
      lastAccess: null,
      frequency: 0
    };
    
    pattern.count++;
    pattern.lastAccess = Date.now();
    
    // Calculate access frequency (accesses per hour)
    const hoursSinceCreation = (Date.now() - (this.exactCache.get(key)?.timestamp || Date.now())) / 3600000;
    pattern.frequency = pattern.count / Math.max(hoursSinceCreation, 1);
    
    this.accessPatterns.set(key, pattern);
  }

  /**
   * Evict oldest/least used entries
   */
  evictOldest() {
    // LRU with frequency consideration
    const entries = Array.from(this.exactCache.entries());
    
    // Sort by score (lower is worse)
    entries.sort((a, b) => {
      const scoreA = this.calculateEvictionScore(a[1]);
      const scoreB = this.calculateEvictionScore(b[1]);
      return scoreA - scoreB;
    });
    
    // Evict bottom 10%
    const evictCount = Math.max(1, Math.floor(entries.length * 0.1));
    
    for (let i = 0; i < evictCount; i++) {
      const [key] = entries[i];
      this.removeEntry(key);
      this.stats.evictions++;
    }
    
    this.emit('cache-eviction', {
      evicted: evictCount,
      remaining: this.getTotalSize()
    });
  }

  /**
   * Calculate eviction score (higher is better)
   */
  calculateEvictionScore(entry) {
    const pattern = this.accessPatterns.get(entry.key);
    const age = Date.now() - entry.timestamp;
    const recency = Date.now() - (pattern?.lastAccess || entry.timestamp);
    
    // Factors:
    // - Frequency of access (higher is better)
    // - Recency of access (lower is better)
    // - Age of entry (older is worse)
    // - User tier (enterprise entries score higher)
    
    let score = 0;
    
    // Frequency score (0-100)
    score += Math.min((pattern?.frequency || 0) * 10, 100);
    
    // Recency score (0-100)
    score += Math.max(100 - (recency / 3600000) * 10, 0);
    
    // Age penalty (0-50)
    score -= Math.min((age / 86400000) * 10, 50);
    
    // User tier bonus
    if (entry.metadata?.userTier === 'enterprise') {
      score += 50;
    } else if (entry.metadata?.userTier === 'pro') {
      score += 25;
    }
    
    return score;
  }

  /**
   * Remove cache entry
   */
  removeEntry(key) {
    this.exactCache.delete(key);
    this.semanticCache.delete(key);
    this.embeddings.delete(key);
    this.metadata.delete(key);
    this.accessPatterns.delete(key);
    this.stats.totalSize--;
  }

  /**
   * Invalidate cache entries
   */
  invalidate(pattern = null) {
    if (!pattern) {
      // Clear all
      this.exactCache.clear();
      this.semanticCache.clear();
      this.embeddings.clear();
      this.metadata.clear();
      this.accessPatterns.clear();
      this.stats.totalSize = 0;
      
      this.emit('cache-cleared');
      return;
    }
    
    // Selective invalidation
    const keysToRemove = [];
    
    for (const [key, entry] of this.exactCache) {
      if (this.matchesPattern(entry, pattern)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.removeEntry(key));
    
    this.emit('cache-invalidated', {
      pattern,
      removed: keysToRemove.length
    });
  }

  /**
   * Check if entry matches invalidation pattern
   */
  matchesPattern(entry, pattern) {
    if (pattern.agent && entry.metadata?.agent !== pattern.agent) {
      return false;
    }
    
    if (pattern.userTier && entry.metadata?.userTier !== pattern.userTier) {
      return false;
    }
    
    if (pattern.flowId && entry.metadata?.context?.flowId !== pattern.flowId) {
      return false;
    }
    
    if (pattern.olderThan) {
      const age = Date.now() - entry.timestamp;
      if (age < pattern.olderThan) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Warm up cache with common queries
   */
  async warmupCache() {
    const commonQueries = [
      { prompt: 'Create a login flow', agent: 'architect' },
      { prompt: 'Design a checkout process', agent: 'uxExpert' },
      { prompt: 'Build a user registration form', agent: 'architect' },
      { prompt: 'Create a dashboard layout', agent: 'uxExpert' },
      { prompt: 'Design a search interface', agent: 'uxExpert' }
    ];
    
    // Pre-populate with common responses
    for (const query of commonQueries) {
      const embedding = await this.generateEmbedding(query.prompt);
      const key = this.generateKey(query.prompt, { agent: query.agent });
      
      // Store placeholder entry
      const entry = {
        key,
        prompt: query.prompt,
        content: `Cached response for: ${query.prompt}`,
        metadata: { agent: query.agent, warmed: true },
        embedding,
        timestamp: Date.now(),
        ttl: this.config.ttl.exact * 2, // Longer TTL for warmed entries
        accessCount: 0,
        lastAccess: Date.now()
      };
      
      this.exactCache.set(key, entry);
      this.semanticCache.set(key, entry);
      this.embeddings.set(key, embedding);
    }
    
    this.emit('cache-warmed', {
      entries: commonQueries.length
    });
  }

  /**
   * Compress content
   */
  compress(content) {
    // Simple compression - in production would use zlib
    return content;
  }

  /**
   * Decompress content
   */
  decompress(content) {
    return content;
  }

  /**
   * Hash string for embedding
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Get total cache size
   */
  getTotalSize() {
    return this.exactCache.size;
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Every minute
  }

  /**
   * Clean up expired entries
   */
  cleanupExpired() {
    let removed = 0;
    
    for (const [key, entry] of this.exactCache) {
      if (this.isExpired(entry)) {
        this.removeEntry(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.emit('cleanup-complete', {
        removed,
        remaining: this.getTotalSize()
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStatistics() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;
    
    return {
      ...this.stats,
      hitRate,
      exactHitRate: this.stats.hits > 0 ? this.stats.exactHits / this.stats.hits : 0,
      semanticHitRate: this.stats.hits > 0 ? this.stats.semanticHits / this.stats.hits : 0,
      size: this.getTotalSize(),
      maxSize: this.config.maxSize,
      utilization: this.getTotalSize() / this.config.maxSize
    };
  }

  /**
   * Export cache for persistence
   */
  export() {
    const data = {
      exact: Array.from(this.exactCache.entries()),
      semantic: Array.from(this.semanticCache.entries()),
      embeddings: Array.from(this.embeddings.entries()),
      metadata: Array.from(this.metadata.entries()),
      patterns: Array.from(this.accessPatterns.entries()),
      stats: this.stats
    };
    
    return JSON.stringify(data);
  }

  /**
   * Import cache from persistence
   */
  import(data) {
    try {
      const parsed = JSON.parse(data);
      
      this.exactCache = new Map(parsed.exact);
      this.semanticCache = new Map(parsed.semantic);
      this.embeddings = new Map(parsed.embeddings);
      this.metadata = new Map(parsed.metadata);
      this.accessPatterns = new Map(parsed.patterns);
      this.stats = parsed.stats;
      
      this.emit('cache-imported', {
        entries: this.getTotalSize()
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to import semantic cache', error);
      return false;
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.invalidate();
    
    this.emit('cleanup-complete');
  }
}

module.exports = SemanticCache;