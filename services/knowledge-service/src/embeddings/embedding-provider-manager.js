// ==========================================
// KNOWLEDGE SERVICE - Embedding Provider Manager
// Multi-provider embedding with caching and cost management
// ==========================================

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

export class EmbeddingProviderManager {
  constructor(logger, mongoClient, redisClient, billingService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.billingService = billingService;
    
    // Provider configurations
    this.providers = {
      openai: {
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        models: {
          'text-embedding-ada-002': {
            dimensions: 1536,
            costPer1kTokens: 0.0001, // $0.10/1M tokens
            maxInputTokens: 8191,
            batchSize: 2048
          },
          'text-embedding-3-small': {
            dimensions: 1536,
            costPer1kTokens: 0.00002, // $0.02/1M tokens
            maxInputTokens: 8191,
            batchSize: 2048
          },
          'text-embedding-3-large': {
            dimensions: 3072,
            costPer1kTokens: 0.00013, // $0.13/1M tokens
            maxInputTokens: 8191,
            batchSize: 2048
          }
        },
        available: !!process.env.OPENAI_API_KEY,
        priority: 1
      },
      google: {
        client: new GoogleGenerativeAI(process.env.GOOGLE_API_KEY),
        models: {
          'embedding-001': {
            dimensions: 768,
            costPer1kTokens: 0.0001, // Estimate based on Gemini pricing
            maxInputTokens: 2048,
            batchSize: 100
          }
        },
        available: !!process.env.GOOGLE_API_KEY,
        priority: 2
      },
      cohere: {
        // Placeholder for future Cohere integration
        available: false,
        priority: 3
      }
    };
    
    // Default configuration
    this.defaultProvider = 'openai';
    this.defaultModel = 'text-embedding-3-small'; // Cost-optimized default
    this.fallbackChain = [
      { provider: 'openai', model: 'text-embedding-3-small' },
      { provider: 'openai', model: 'text-embedding-ada-002' },
      { provider: 'google', model: 'embedding-001' }
    ];
    
    // Cache configuration
    this.cacheConfig = {
      ttl: 30 * 24 * 60 * 60, // 30 days
      keyPrefix: 'embedding:',
      maxCacheSize: 10000 // Max cached embeddings per collection
    };
    
    this.initialize();
  }

  /**
   * Initialize embedding provider manager
   */
  async initialize() {
    try {
      // Create database indexes
      await this.createDatabaseIndexes();
      
      // Test provider connectivity
      await this.testProviderConnectivity();
      
      // Load embedding cache
      await this.loadEmbeddingCache();
      
      this.logger.info('Embedding Provider Manager initialized', {
        availableProviders: this.getAvailableProviders(),
        defaultProvider: this.defaultProvider,
        defaultModel: this.defaultModel
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize Embedding Provider Manager', error);
    }
  }

  /**
   * Create database indexes for embedding collections
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // Embedding cache collection
    await db.collection('embedding_cache').createIndexes([
      { key: { textHash: 1, provider: 1, model: 1 }, unique: true },
      { key: { createdAt: 1 }, expireAfterSeconds: this.cacheConfig.ttl },
      { key: { workspaceId: 1 } },
      { key: { dimensions: 1 } }
    ]);
    
    // Embedding usage collection
    await db.collection('embedding_usage').createIndexes([
      { key: { userId: 1, timestamp: -1 } },
      { key: { workspaceId: 1, timestamp: -1 } },
      { key: { provider: 1, model: 1, timestamp: -1 } }
    ]);
  }

  /**
   * Generate embeddings for text or text array
   */
  async generateEmbeddings(texts, options = {}) {
    const {
      userId,
      workspaceId,
      provider = this.defaultProvider,
      model = this.defaultModel,
      forceRefresh = false,
      language = 'en'
    } = options;

    // Normalize input to array
    const textArray = Array.isArray(texts) ? texts : [texts];
    const results = [];
    const uncachedTexts = [];
    const textToIndex = new Map();

    try {
      // Check cache for existing embeddings
      if (!forceRefresh) {
        for (let i = 0; i < textArray.length; i++) {
          const text = textArray[i];
          const cached = await this.getCachedEmbedding(text, provider, model);
          
          if (cached) {
            results[i] = {
              text,
              embedding: cached.embedding,
              dimensions: cached.dimensions,
              provider,
              model,
              cached: true,
              cost: 0
            };
          } else {
            uncachedTexts.push(text);
            textToIndex.set(text, i);
          }
        }
      } else {
        uncachedTexts.push(...textArray);
        textArray.forEach((text, i) => textToIndex.set(text, i));
      }

      // Generate embeddings for uncached texts
      if (uncachedTexts.length > 0) {
        const generated = await this.generateNewEmbeddings(
          uncachedTexts,
          provider,
          model,
          { userId, workspaceId, language }
        );

        // Merge generated results with cached ones
        generated.forEach((result, genIndex) => {
          const originalIndex = textToIndex.get(result.text);
          results[originalIndex] = result;
        });

        // Cache the new embeddings
        await this.cacheEmbeddings(generated, workspaceId);
        
        // Track usage and costs
        await this.trackEmbeddingUsage(userId, workspaceId, generated);
      }

      this.logger.info('Embeddings generated', {
        totalTexts: textArray.length,
        cached: results.filter(r => r.cached).length,
        generated: uncachedTexts.length,
        provider,
        model
      });

      return Array.isArray(texts) ? results : results[0];

    } catch (error) {
      this.logger.error('Failed to generate embeddings', error);
      
      // Try fallback providers
      if (provider !== 'openai' || model !== 'text-embedding-ada-002') {
        this.logger.info('Trying fallback provider for embeddings');
        return await this.generateWithFallback(texts, options);
      }
      
      throw error;
    }
  }

  /**
   * Generate new embeddings using specified provider
   */
  async generateNewEmbeddings(texts, provider, model, context) {
    const providerConfig = this.providers[provider];
    
    if (!providerConfig.available) {
      throw new Error(`Provider ${provider} is not available`);
    }

    const modelConfig = providerConfig.models[model];
    if (!modelConfig) {
      throw new Error(`Model ${model} not found for provider ${provider}`);
    }

    // Process texts in batches to respect API limits
    const batchSize = modelConfig.batchSize;
    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.callProvider(provider, model, batch, context);
        results.push(...batchResults);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await this.sleep(100); // 100ms delay
        }
        
      } catch (error) {
        this.logger.error(`Failed to process batch ${i / batchSize + 1}`, error);
        throw error;
      }
    }

    return results;
  }

  /**
   * Call specific embedding provider
   */
  async callProvider(provider, model, texts, context) {
    const startTime = Date.now();
    
    try {
      let results;
      
      switch (provider) {
        case 'openai':
          results = await this.callOpenAI(model, texts);
          break;
        
        case 'google':
          results = await this.callGoogle(model, texts);
          break;
        
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
      
      const duration = Date.now() - startTime;
      
      this.logger.debug('Provider call completed', {
        provider,
        model,
        textsCount: texts.length,
        duration
      });
      
      return results;
      
    } catch (error) {
      this.logger.error(`Provider ${provider} call failed`, error);
      throw error;
    }
  }

  /**
   * Call OpenAI embedding API
   */
  async callOpenAI(model, texts) {
    const client = this.providers.openai.client;
    const modelConfig = this.providers.openai.models[model];
    
    // Validate input length
    const validTexts = texts.filter(text => {
      if (!text || typeof text !== 'string') return false;
      if (text.length === 0) return false;
      
      // Rough token estimation (4 chars per token)
      const estimatedTokens = text.length / 4;
      return estimatedTokens <= modelConfig.maxInputTokens;
    });

    if (validTexts.length === 0) {
      throw new Error('No valid texts provided for embedding');
    }

    const response = await client.embeddings.create({
      model,
      input: validTexts,
      encoding_format: 'float'
    });

    return validTexts.map((text, index) => {
      const embeddingData = response.data[index];
      const tokens = response.usage.total_tokens / validTexts.length; // Approximate per text
      
      return {
        text,
        embedding: embeddingData.embedding,
        dimensions: modelConfig.dimensions,
        provider: 'openai',
        model,
        tokens: Math.round(tokens),
        cost: (tokens / 1000) * modelConfig.costPer1kTokens,
        cached: false
      };
    });
  }

  /**
   * Call Google embedding API
   */
  async callGoogle(model, texts) {
    const client = this.providers.google.client;
    const modelConfig = this.providers.google.models[model];
    
    const results = [];
    
    // Google API processes one text at a time
    for (const text of texts) {
      if (!text || typeof text !== 'string' || text.length === 0) {
        continue;
      }
      
      // Rough token estimation
      const estimatedTokens = text.length / 4;
      if (estimatedTokens > modelConfig.maxInputTokens) {
        this.logger.warn('Text exceeds Google model token limit', {
          textLength: text.length,
          estimatedTokens,
          maxTokens: modelConfig.maxInputTokens
        });
        continue;
      }
      
      try {
        const embeddingModel = client.getGenerativeModel({ model: 'embedding-001' });
        const result = await embeddingModel.embedContent(text);
        
        results.push({
          text,
          embedding: result.embedding.values,
          dimensions: modelConfig.dimensions,
          provider: 'google',
          model,
          tokens: Math.round(estimatedTokens),
          cost: (estimatedTokens / 1000) * modelConfig.costPer1kTokens,
          cached: false
        });
        
      } catch (error) {
        this.logger.error('Google embedding failed for text', error);
        // Continue with other texts
      }
    }
    
    return results;
  }

  /**
   * Get cached embedding
   */
  async getCachedEmbedding(text, provider, model) {
    try {
      const textHash = this.createTextHash(text);
      
      // Try Redis cache first (fastest)
      const cacheKey = `${this.cacheConfig.keyPrefix}${provider}:${model}:${textHash}`;
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Try MongoDB cache
      const db = this.mongoClient.getDb();
      const dbCached = await db.collection('embedding_cache')
        .findOne({ textHash, provider, model });
      
      if (dbCached) {
        // Update Redis cache
        await this.redisClient.setex(cacheKey, 3600, JSON.stringify({
          embedding: dbCached.embedding,
          dimensions: dbCached.dimensions
        }));
        
        return {
          embedding: dbCached.embedding,
          dimensions: dbCached.dimensions
        };
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Failed to get cached embedding', error);
      return null;
    }
  }

  /**
   * Cache embeddings for future use
   */
  async cacheEmbeddings(results, workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      const cacheEntries = [];
      const redisOps = [];
      
      for (const result of results) {
        const textHash = this.createTextHash(result.text);
        const cacheKey = `${this.cacheConfig.keyPrefix}${result.provider}:${result.model}:${textHash}`;
        
        // Prepare MongoDB entry
        cacheEntries.push({
          textHash,
          textPreview: result.text.substring(0, 100), // Store preview only
          embedding: result.embedding,
          dimensions: result.dimensions,
          provider: result.provider,
          model: result.model,
          workspaceId,
          createdAt: new Date()
        });
        
        // Prepare Redis cache
        redisOps.push(['setex', cacheKey, 3600, JSON.stringify({
          embedding: result.embedding,
          dimensions: result.dimensions
        })]);
      }
      
      // Batch insert to MongoDB
      if (cacheEntries.length > 0) {
        await db.collection('embedding_cache').insertMany(cacheEntries);
      }
      
      // Batch operations to Redis
      if (redisOps.length > 0) {
        await this.redisClient.multi(redisOps).exec();
      }
      
      this.logger.debug('Embeddings cached', { count: results.length });
      
    } catch (error) {
      this.logger.error('Failed to cache embeddings', error);
    }
  }

  /**
   * Track embedding usage for billing
   */
  async trackEmbeddingUsage(userId, workspaceId, results) {
    try {
      const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
      const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);
      
      const usage = {
        userId,
        workspaceId,
        provider: results[0]?.provider,
        model: results[0]?.model,
        textsProcessed: results.length,
        totalTokens,
        totalCost,
        timestamp: new Date()
      };
      
      // Store in database
      const db = this.mongoClient.getDb();
      await db.collection('embedding_usage').insertOne(usage);
      
      // Update billing service if available
      if (this.billingService) {
        await this.billingService.trackEmbeddingUsage(usage);
      }
      
      // Cache usage for quick access
      await this.cacheUsageData(userId, workspaceId, usage);
      
    } catch (error) {
      this.logger.error('Failed to track embedding usage', error);
    }
  }

  /**
   * Generate embeddings with fallback providers
   */
  async generateWithFallback(texts, options) {
    const originalProvider = options.provider || this.defaultProvider;
    const originalModel = options.model || this.defaultModel;
    
    this.logger.info('Attempting fallback providers', {
      originalProvider,
      originalModel
    });

    for (const fallback of this.fallbackChain) {
      if (fallback.provider === originalProvider && fallback.model === originalModel) {
        continue; // Skip the failed combination
      }
      
      const provider = this.providers[fallback.provider];
      if (!provider.available) continue;
      
      try {
        const fallbackOptions = {
          ...options,
          provider: fallback.provider,
          model: fallback.model
        };
        
        const results = await this.generateEmbeddings(texts, fallbackOptions);
        
        this.logger.info('Fallback provider succeeded', {
          provider: fallback.provider,
          model: fallback.model
        });
        
        return results;
        
      } catch (error) {
        this.logger.warn('Fallback provider also failed', error, {
          provider: fallback.provider,
          model: fallback.model
        });
        continue;
      }
    }
    
    throw new Error('All embedding providers failed');
  }

  /**
   * Test provider connectivity
   */
  async testProviderConnectivity() {
    const testText = "This is a connectivity test for embedding providers.";
    
    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (!provider.available) {
        this.logger.warn(`Provider ${providerName} not available (missing API key)`);
        continue;
      }
      
      try {
        // Test with first available model
        const firstModel = Object.keys(provider.models)[0];
        await this.callProvider(providerName, firstModel, [testText], {});
        
        this.logger.info(`Provider ${providerName} connectivity test passed`);
        
      } catch (error) {
        this.logger.error(`Provider ${providerName} connectivity test failed`, error);
        provider.available = false;
      }
    }
  }

  /**
   * Create hash for text caching
   */
  createTextHash(text) {
    return crypto.createHash('sha256')
      .update(text.trim().toLowerCase())
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Cache usage data for quick access
   */
  async cacheUsageData(userId, workspaceId, usage) {
    try {
      // Update daily usage
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `embedding_usage:daily:${userId}:${today}`;
      
      await this.redisClient.hincrbyfloat(dailyKey, 'cost', usage.totalCost);
      await this.redisClient.hincrby(dailyKey, 'requests', usage.textsProcessed);
      await this.redisClient.expire(dailyKey, 86400 * 31); // Keep for 31 days
      
      // Update monthly usage
      const month = new Date().toISOString().substring(0, 7);
      const monthlyKey = `embedding_usage:monthly:${userId}:${month}`;
      
      await this.redisClient.hincrbyfloat(monthlyKey, 'cost', usage.totalCost);
      await this.redisClient.hincrby(monthlyKey, 'requests', usage.textsProcessed);
      await this.redisClient.expire(monthlyKey, 86400 * 365); // Keep for 1 year
      
    } catch (error) {
      this.logger.error('Failed to cache usage data', error);
    }
  }

  /**
   * Load embedding cache statistics
   */
  async loadEmbeddingCache() {
    try {
      const db = this.mongoClient.getDb();
      
      // Get cache statistics
      const stats = await db.collection('embedding_cache').aggregate([
        {
          $group: {
            _id: { provider: '$provider', model: '$model' },
            count: { $sum: 1 },
            avgDimensions: { $avg: '$dimensions' }
          }
        }
      ]).toArray();
      
      this.logger.info('Embedding cache loaded', { 
        cacheEntries: stats.reduce((sum, s) => sum + s.count, 0),
        providerModels: stats.length
      });
      
    } catch (error) {
      this.logger.error('Failed to load embedding cache', error);
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([, provider]) => provider.available)
      .map(([name]) => name);
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(timeframe = '24h') {
    try {
      const db = this.mongoClient.getDb();
      
      let startTime;
      switch (timeframe) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
      
      const stats = await db.collection('embedding_usage').aggregate([
        { $match: { timestamp: { $gte: startTime } } },
        {
          $group: {
            _id: { provider: '$provider', model: '$model' },
            requests: { $sum: 1 },
            totalTexts: { $sum: '$textsProcessed' },
            totalTokens: { $sum: '$totalTokens' },
            totalCost: { $sum: '$totalCost' },
            avgTokensPerText: { $avg: { $divide: ['$totalTokens', '$textsProcessed'] } }
          }
        }
      ]).toArray();
      
      return {
        timeframe,
        stats,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get provider stats', error);
      return null;
    }
  }

  /**
   * Clean up old cache entries
   */
  async cleanupCache() {
    try {
      const db = this.mongoClient.getDb();
      
      // Remove entries older than TTL (MongoDB TTL should handle this, but double-check)
      const cutoff = new Date(Date.now() - this.cacheConfig.ttl * 1000);
      
      const result = await db.collection('embedding_cache')
        .deleteMany({ createdAt: { $lt: cutoff } });
      
      if (result.deletedCount > 0) {
        this.logger.info('Cache cleanup completed', {
          deletedEntries: result.deletedCount
        });
      }
      
    } catch (error) {
      this.logger.error('Failed to cleanup cache', error);
    }
  }

  /**
   * Utility function to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get optimal model for text length and quality requirements
   */
  getOptimalModel(textLength, qualityMode = 'standard') {
    // For standard quality, prefer cost-effective models
    if (qualityMode === 'standard' || textLength < 1000) {
      return {
        provider: 'openai',
        model: 'text-embedding-3-small'
      };
    }
    
    // For high quality or long texts, use better models
    if (qualityMode === 'pro' || textLength > 5000) {
      return {
        provider: 'openai',
        model: 'text-embedding-3-large'
      };
    }
    
    // Default fallback
    return {
      provider: 'openai',
      model: 'text-embedding-ada-002'
    };
  }
}

export default EmbeddingProviderManager;