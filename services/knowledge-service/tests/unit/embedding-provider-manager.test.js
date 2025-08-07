/**
 * Unit Tests for Embedding Provider Manager
 * Tests multi-provider embedding generation and management
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EmbeddingProviderManager } from '../../src/embeddings/embedding-provider-manager.js';

describe('EmbeddingProviderManager', () => {
  let manager;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;
  let mockBillingService;

  beforeEach(() => {
    // Create mocks
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockMongoClient = {
      getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          findOne: jest.fn(),
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'cache-id' }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          createIndex: jest.fn().mockResolvedValue(true)
        })
      })
    };

    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1)
    };

    mockBillingService = {
      trackUsage: jest.fn().mockResolvedValue(true),
      checkCredits: jest.fn().mockResolvedValue({ hasCredits: true, remaining: 1000 })
    };

    // Create manager instance
    manager = new EmbeddingProviderManager(
      mockLogger,
      mockMongoClient,
      mockRedisClient,
      mockBillingService
    );

    // Mock provider initialization
    manager.providers = {
      openai: {
        generateEmbedding: jest.fn().mockResolvedValue({
          embedding: Array(1536).fill(0.1),
          model: 'text-embedding-ada-002'
        }),
        isAvailable: jest.fn().mockResolvedValue(true),
        getDimension: jest.fn().mockReturnValue(1536),
        getCostPerToken: jest.fn().mockReturnValue(0.0001)
      },
      google: {
        generateEmbedding: jest.fn().mockResolvedValue({
          embedding: Array(768).fill(0.2),
          model: 'embedding-001'
        }),
        isAvailable: jest.fn().mockResolvedValue(true),
        getDimension: jest.fn().mockReturnValue(768),
        getCostPerToken: jest.fn().mockReturnValue(0.00005)
      },
      local: {
        generateEmbedding: jest.fn().mockResolvedValue({
          embedding: Array(384).fill(0.3)
        }),
        isAvailable: jest.fn().mockResolvedValue(true),
        getDimension: jest.fn().mockReturnValue(384),
        getCostPerToken: jest.fn().mockReturnValue(0)
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Management', () => {
    it('should initialize with multiple providers', async () => {
      await manager.initialize();
      
      expect(Object.keys(manager.providers)).toContain('openai');
      expect(Object.keys(manager.providers)).toContain('google');
      expect(Object.keys(manager.providers)).toContain('local');
    });

    it('should select optimal provider based on cost', async () => {
      const provider = await manager.selectProvider('cost');
      
      expect(provider).toBe('local'); // Local has 0 cost
    });

    it('should select provider based on quality', async () => {
      manager.providerPriority = ['openai', 'google', 'local'];
      const provider = await manager.selectProvider('quality');
      
      expect(provider).toBe('openai'); // OpenAI is first in priority
    });

    it('should fallback to next provider on failure', async () => {
      manager.providers.openai.isAvailable.mockResolvedValue(false);
      manager.providers.google.isAvailable.mockResolvedValue(false);
      
      const provider = await manager.selectProvider();
      
      expect(provider).toBe('local');
    });

    it('should handle all providers unavailable', async () => {
      Object.values(manager.providers).forEach(provider => {
        provider.isAvailable.mockResolvedValue(false);
      });

      await expect(manager.selectProvider()).rejects.toThrow('No embedding providers available');
    });
  });

  describe('Embedding Generation', () => {
    it('should generate embedding with selected provider', async () => {
      const text = 'Test text for embedding';
      const result = await manager.generateEmbedding(text);
      
      expect(result).toMatchObject({
        embedding: expect.any(Array),
        provider: expect.any(String),
        dimension: expect.any(Number),
        cached: false
      });
    });

    it('should cache embeddings in Redis', async () => {
      const text = 'Cacheable text';
      await manager.generateEmbedding(text);
      
      expect(mockRedisClient.setex).toHaveBeenCalled();
      const cacheKey = mockRedisClient.setex.mock.calls[0][0];
      expect(cacheKey).toContain('embedding:');
    });

    it('should retrieve cached embeddings', async () => {
      const text = 'Cached text';
      const cachedEmbedding = {
        embedding: Array(384).fill(0.5),
        provider: 'cached',
        dimension: 384
      };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedEmbedding));
      
      const result = await manager.generateEmbedding(text);
      
      expect(result.cached).toBe(true);
      expect(result.provider).toBe('cached');
      expect(manager.providers.openai.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle batch embedding generation', async () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];
      const results = await manager.generateBatchEmbeddings(texts);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toMatchObject({
          embedding: expect.any(Array),
          provider: expect.any(String)
        });
      });
    });

    it('should respect batch size limits', async () => {
      const texts = Array(150).fill('Text'); // Exceeds typical batch limit
      await manager.generateBatchEmbeddings(texts);
      
      // Should split into multiple batches
      const callCount = manager.providers.openai.generateEmbedding.mock.calls.length +
                       manager.providers.google.generateEmbedding.mock.calls.length +
                       manager.providers.local.generateEmbedding.mock.calls.length;
      
      expect(callCount).toBeGreaterThanOrEqual(2); // At least 2 batches
    });
  });

  describe('Caching Strategy', () => {
    it('should implement multi-level caching', async () => {
      const text = 'Multi-cache text';
      
      // First call - generates and caches
      await manager.generateEmbedding(text);
      expect(mockRedisClient.setex).toHaveBeenCalled();
      expect(mockMongoClient.getDb().collection().insertOne).toHaveBeenCalled();
      
      // Second call - should hit Redis cache
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        embedding: Array(384).fill(0.1),
        provider: 'cached'
      }));
      
      const cached = await manager.generateEmbedding(text);
      expect(cached.cached).toBe(true);
    });

    it('should fallback to MongoDB cache when Redis misses', async () => {
      const text = 'MongoDB cached text';
      
      mockRedisClient.get.mockResolvedValue(null);
      mockMongoClient.getDb().collection().findOne.mockResolvedValue({
        text,
        embedding: Array(384).fill(0.2),
        provider: 'mongodb-cached',
        createdAt: new Date()
      });
      
      const result = await manager.generateEmbedding(text);
      
      expect(result.cached).toBe(true);
      expect(result.provider).toBe('mongodb-cached');
    });

    it('should handle cache expiration', async () => {
      const text = 'Expired cache text';
      
      // Simulate expired MongoDB cache
      mockMongoClient.getDb().collection().findOne.mockResolvedValue({
        text,
        embedding: Array(384).fill(0.2),
        provider: 'expired',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days old
      });
      
      const result = await manager.generateEmbedding(text);
      
      // Should regenerate instead of using expired cache
      expect(result.cached).toBe(false);
      expect(manager.providers.local.generateEmbedding).toHaveBeenCalled();
    });
  });

  describe('Cost Management', () => {
    it('should track embedding costs', async () => {
      const text = 'Cost tracking text';
      await manager.generateEmbedding(text, { provider: 'openai' });
      
      expect(mockBillingService.trackUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'embedding',
          provider: 'openai',
          cost: expect.any(Number)
        })
      );
    });

    it('should check credits before generation', async () => {
      mockBillingService.checkCredits.mockResolvedValue({
        hasCredits: false,
        remaining: 0
      });
      
      await expect(
        manager.generateEmbedding('No credits text', { checkCredits: true })
      ).rejects.toThrow('Insufficient credits');
    });

    it('should optimize for cost when requested', async () => {
      const text = 'Optimize cost text';
      const result = await manager.generateEmbedding(text, { optimize: 'cost' });
      
      expect(result.provider).toBe('local'); // Local has lowest cost
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits per provider', async () => {
      // Simulate rate limit hit
      mockRedisClient.incr.mockResolvedValue(101); // Over limit
      
      manager.providers.openai.isAvailable.mockResolvedValue(false);
      
      const result = await manager.generateEmbedding('Rate limited text');
      
      // Should fallback to another provider
      expect(result.provider).not.toBe('openai');
    });

    it('should track rate limit windows', async () => {
      await manager.checkRateLimit('openai');
      
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should retry on transient failures', async () => {
      let attempts = 0;
      manager.providers.openai.generateEmbedding.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return { embedding: Array(1536).fill(0.1) };
      });
      
      const result = await manager.generateEmbedding('Retry text');
      
      expect(attempts).toBe(3);
      expect(result.embedding).toBeDefined();
    });

    it('should fallback on provider failure', async () => {
      manager.providers.openai.generateEmbedding.mockRejectedValue(
        new Error('Provider error')
      );
      
      const result = await manager.generateEmbedding('Fallback text');
      
      expect(result.provider).not.toBe('openai');
      expect(result.embedding).toBeDefined();
    });

    it('should handle invalid text input', async () => {
      const invalidInputs = [null, undefined, '', 123, {}, []];
      
      for (const input of invalidInputs) {
        await expect(
          manager.generateEmbedding(input)
        ).rejects.toThrow();
      }
    });

    it('should handle provider configuration errors', async () => {
      manager.providers = {}; // No providers configured
      
      await expect(
        manager.generateEmbedding('No providers text')
      ).rejects.toThrow('No embedding providers available');
    });
  });

  describe('Performance Optimization', () => {
    it('should batch similar requests', async () => {
      const promises = [];
      const sameText = 'Duplicate text';
      
      // Make multiple concurrent requests for same text
      for (let i = 0; i < 5; i++) {
        promises.push(manager.generateEmbedding(sameText));
      }
      
      const results = await Promise.all(promises);
      
      // Should only call provider once
      const totalCalls = Object.values(manager.providers).reduce(
        (sum, provider) => sum + provider.generateEmbedding.mock.calls.length,
        0
      );
      
      expect(totalCalls).toBe(1);
      results.forEach(result => {
        expect(result.embedding).toEqual(results[0].embedding);
      });
    });

    it('should implement request coalescing', async () => {
      manager.pendingRequests = new Map();
      
      const text = 'Coalesce text';
      const promise1 = manager.generateEmbedding(text);
      const promise2 = manager.generateEmbedding(text);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      expect(result1).toEqual(result2);
      expect(manager.providers.local.generateEmbedding).toHaveBeenCalledTimes(1);
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should track provider usage metrics', async () => {
      await manager.generateEmbedding('Metrics text');
      
      const metrics = manager.getMetrics();
      
      expect(metrics).toMatchObject({
        totalRequests: expect.any(Number),
        cacheHits: expect.any(Number),
        cacheMisses: expect.any(Number),
        providerUsage: expect.any(Object)
      });
    });

    it('should track error rates', async () => {
      manager.providers.openai.generateEmbedding.mockRejectedValue(
        new Error('Error for metrics')
      );
      
      try {
        await manager.generateEmbedding('Error text', { provider: 'openai' });
      } catch (e) {
        // Expected error
      }
      
      const metrics = manager.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);
    });

    it('should calculate average latency', async () => {
      await manager.generateEmbedding('Latency test');
      
      const metrics = manager.getMetrics();
      expect(metrics.avgLatency).toBeGreaterThan(0);
    });
  });
});

export default describe;