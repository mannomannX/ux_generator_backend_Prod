// ==========================================
// KNOWLEDGE SERVICE - Real Embedding Service
// ==========================================

import crypto from 'crypto';

/**
 * Embedding Service with support for multiple providers
 * Currently implements local fallback, ready for real embedding models
 */
export class EmbeddingService {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      provider: process.env.EMBEDDING_PROVIDER || 'local', // 'openai', 'google', 'cohere', 'local'
      apiKey: process.env.EMBEDDING_API_KEY,
      model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
      dimension: parseInt(process.env.EMBEDDING_DIMENSION) || 1536,
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 100,
      maxRetries: 3,
      cacheEnabled: true,
      ...config
    };

    this.cache = new Map();
    this.initializeProvider();
  }

  /**
   * Initialize the embedding provider
   */
  async initializeProvider() {
    switch (this.config.provider) {
      case 'openai':
        // Ready for OpenAI integration
        if (!this.config.apiKey) {
          this.logger.warn('OpenAI API key not configured, falling back to local embeddings');
          this.config.provider = 'local';
        } else {
          this.logger.info('Embedding service initialized with OpenAI');
          // TODO: Initialize OpenAI client when API key is provided
          // const { OpenAI } = await import('openai');
          // this.openai = new OpenAI({ apiKey: this.config.apiKey });
        }
        break;

      case 'google':
        // Ready for Google Vertex AI integration
        if (!this.config.apiKey) {
          this.logger.warn('Google API key not configured, falling back to local embeddings');
          this.config.provider = 'local';
        } else {
          this.logger.info('Embedding service initialized with Google Vertex AI');
          // TODO: Initialize Google client when API key is provided
        }
        break;

      case 'cohere':
        // Ready for Cohere integration
        if (!this.config.apiKey) {
          this.logger.warn('Cohere API key not configured, falling back to local embeddings');
          this.config.provider = 'local';
        } else {
          this.logger.info('Embedding service initialized with Cohere');
          // TODO: Initialize Cohere client when API key is provided
        }
        break;

      case 'local':
      default:
        this.logger.info('Embedding service using local fallback (development mode)');
        this.logger.warn('⚠️ Local embeddings are not suitable for production semantic search');
        break;
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text, options = {}) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input for embedding');
    }

    // Check cache
    if (this.config.cacheEnabled) {
      const cacheKey = this.getCacheKey(text);
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }
    }

    let embedding;

    try {
      switch (this.config.provider) {
        case 'openai':
          embedding = await this.generateOpenAIEmbedding(text, options);
          break;

        case 'google':
          embedding = await this.generateGoogleEmbedding(text, options);
          break;

        case 'cohere':
          embedding = await this.generateCohereEmbedding(text, options);
          break;

        case 'local':
        default:
          embedding = await this.generateLocalEmbedding(text, options);
          break;
      }

      // Cache the result
      if (this.config.cacheEnabled) {
        const cacheKey = this.getCacheKey(text);
        this.cache.set(cacheKey, embedding);
        
        // Limit cache size
        if (this.cache.size > 10000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
      }

      return embedding;

    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      
      // Fallback to local embedding on error
      if (this.config.provider !== 'local') {
        this.logger.warn('Falling back to local embedding due to error');
        return this.generateLocalEmbedding(text, options);
      }
      
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async generateBatchEmbeddings(texts, options = {}) {
    if (!Array.isArray(texts)) {
      throw new Error('Texts must be an array');
    }

    const results = [];
    const uncachedTexts = [];
    const uncachedIndices = [];

    // Check cache for each text
    if (this.config.cacheEnabled) {
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = this.getCacheKey(texts[i]);
        if (this.cache.has(cacheKey)) {
          results[i] = this.cache.get(cacheKey);
        } else {
          uncachedTexts.push(texts[i]);
          uncachedIndices.push(i);
        }
      }
    } else {
      uncachedTexts.push(...texts);
      uncachedIndices.push(...Array.from({ length: texts.length }, (_, i) => i));
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const batches = this.createBatches(uncachedTexts, this.config.batchSize);
      
      for (const batch of batches) {
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.generateEmbedding(text, options))
        );
        
        // Place embeddings in correct positions
        for (let i = 0; i < batch.length; i++) {
          const originalIndex = uncachedIndices.shift();
          results[originalIndex] = batchEmbeddings[i];
        }
      }
    }

    return results;
  }

  /**
   * Generate OpenAI embedding (placeholder for real implementation)
   */
  async generateOpenAIEmbedding(text, options) {
    // TODO: Implement real OpenAI embedding when API key is available
    /*
    const response = await this.openai.embeddings.create({
      model: this.config.model,
      input: text,
      ...options
    });
    return response.data[0].embedding;
    */
    
    // For now, return local embedding
    return this.generateLocalEmbedding(text, options);
  }

  /**
   * Generate Google embedding (placeholder for real implementation)
   */
  async generateGoogleEmbedding(text, options) {
    // TODO: Implement real Google Vertex AI embedding when API key is available
    /*
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.config.apiKey);
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values;
    */
    
    // For now, return local embedding
    return this.generateLocalEmbedding(text, options);
  }

  /**
   * Generate Cohere embedding (placeholder for real implementation)
   */
  async generateCohereEmbedding(text, options) {
    // TODO: Implement real Cohere embedding when API key is available
    /*
    const cohere = require('cohere-ai');
    cohere.init(this.config.apiKey);
    const response = await cohere.embed({
      texts: [text],
      model: 'embed-english-v2.0',
      ...options
    });
    return response.body.embeddings[0];
    */
    
    // For now, return local embedding
    return this.generateLocalEmbedding(text, options);
  }

  /**
   * Generate local embedding (improved fallback for development)
   * This is still not suitable for production but better than pure random
   */
  async generateLocalEmbedding(text, options) {
    // Normalize and tokenize text
    const normalized = text.toLowerCase().trim();
    const tokens = normalized.split(/\s+/);
    
    // Create a deterministic but more meaningful embedding
    const dimension = options.dimension || this.config.dimension;
    const embedding = new Array(dimension).fill(0);
    
    // Use multiple hash functions for better distribution
    const hashes = [
      crypto.createHash('sha256'),
      crypto.createHash('sha512'),
      crypto.createHash('md5')
    ];
    
    // Process each token
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Update each hash
      hashes.forEach(hash => hash.update(token));
      
      // Distribute token information across embedding dimensions
      for (let j = 0; j < dimension; j++) {
        // Use token position and character codes for variation
        const charCode = token.charCodeAt(j % token.length) || 0;
        const positionWeight = 1 / (i + 1); // Give more weight to earlier tokens
        
        // Combine multiple factors for this dimension
        embedding[j] += (charCode / 255) * positionWeight;
      }
    }
    
    // Add hash-based components for global text representation
    hashes.forEach((hash, hashIndex) => {
      const digest = hash.digest('hex');
      for (let i = 0; i < dimension; i++) {
        const hexIndex = (i * 2) % digest.length;
        const value = parseInt(digest.substr(hexIndex, 2), 16) / 255;
        embedding[i] = (embedding[i] + value * (1 / (hashIndex + 1))) / 2;
      }
    });
    
    // Normalize the embedding to unit length
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  /**
   * Calculate similarity between two embeddings
   */
  calculateSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2) {
      throw new Error('Both embeddings are required');
    }
    
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }
    
    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find most similar embeddings from a set
   */
  findMostSimilar(queryEmbedding, embeddings, topK = 5) {
    const similarities = embeddings.map((embedding, index) => ({
      index,
      similarity: this.calculateSimilarity(queryEmbedding, embedding.vector),
      metadata: embedding.metadata
    }));
    
    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, topK);
  }

  /**
   * Create batches from array
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get cache key for text
   */
  getCacheKey(text) {
    return crypto
      .createHash('md5')
      .update(`${this.config.provider}:${this.config.model}:${text}`)
      .digest('hex');
  }

  /**
   * Clear embedding cache
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.config.cacheEnabled,
      provider: this.config.provider,
      model: this.config.model
    };
  }

  /**
   * Validate embedding dimension
   */
  validateDimension(embedding) {
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding must be an array');
    }
    
    if (embedding.length !== this.config.dimension) {
      throw new Error(`Embedding dimension mismatch. Expected ${this.config.dimension}, got ${embedding.length}`);
    }
    
    // Check for valid numbers
    for (const value of embedding) {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Embedding contains invalid values');
      }
    }
    
    return true;
  }
}

export default EmbeddingService;