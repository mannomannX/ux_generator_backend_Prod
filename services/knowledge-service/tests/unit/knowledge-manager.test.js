// ==========================================
// KNOWLEDGE SERVICE - KnowledgeManager Unit Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { KnowledgeManager } from '../../src/services/knowledge-manager.js';

describe('KnowledgeManager', () => {
  let knowledgeManager;
  let mockLogger;
  let mockChromaClient;
  let mockMongoClient;
  let mockEmbeddingService;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockCollection = {
      findOne: jest.fn(),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn(() => ({
        toArray: jest.fn(),
        limit: jest.fn(() => ({
          toArray: jest.fn()
        }))
      })),
      aggregate: jest.fn(() => ({
        toArray: jest.fn()
      }))
    };

    mockDb = {
      collection: jest.fn(() => mockCollection)
    };

    mockMongoClient = {
      getDb: jest.fn(() => mockDb)
    };

    mockChromaClient = {
      createCollection: jest.fn(),
      getCollection: jest.fn(),
      listCollections: jest.fn(),
      deleteCollection: jest.fn(),
      query: jest.fn(),
      add: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };

    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      generateBatchEmbeddings: jest.fn()
    };

    knowledgeManager = new KnowledgeManager(
      mockLogger,
      mockChromaClient,
      mockMongoClient,
      mockEmbeddingService
    );
  });

  describe('storeKnowledge', () => {
    it('should store knowledge with embeddings', async () => {
      const knowledge = {
        content: 'UX design principle: Keep it simple',
        type: 'principle',
        category: 'design',
        metadata: { source: 'user' }
      };

      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockChromaClient.add.mockResolvedValue({ ids: ['know_123'] });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'know_123' });

      const result = await knowledgeManager.storeKnowledge(knowledge);

      expect(result).toMatchObject({
        id: 'know_123',
        stored: true
      });
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(knowledge.content);
      expect(mockChromaClient.add).toHaveBeenCalled();
    });

    it('should handle batch knowledge storage', async () => {
      const knowledgeItems = [
        { content: 'Design principle 1', type: 'principle' },
        { content: 'Design principle 2', type: 'principle' }
      ];

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6]
      ]);
      mockChromaClient.add.mockResolvedValue({ ids: ['know_1', 'know_2'] });

      const result = await knowledgeManager.storeBatchKnowledge(knowledgeItems);

      expect(result.stored).toBe(2);
      expect(mockEmbeddingService.generateBatchEmbeddings).toHaveBeenCalled();
    });
  });

  describe('searchKnowledge', () => {
    it('should search knowledge by semantic similarity', async () => {
      const query = 'How to improve user experience?';
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = {
        ids: [['know_1', 'know_2']],
        documents: [['UX tip 1', 'UX tip 2']],
        metadatas: [[{ category: 'ux' }, { category: 'design' }]],
        distances: [[0.1, 0.2]]
      };

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockChromaClient.query.mockResolvedValue(mockResults);

      const results = await knowledgeManager.searchKnowledge(query, { limit: 2 });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: 'know_1',
        content: 'UX tip 1',
        relevance: expect.any(Number)
      });
    });

    it('should filter search by category', async () => {
      const query = 'Design patterns';
      const mockEmbedding = [0.1, 0.2, 0.3];

      mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbedding);
      mockChromaClient.query.mockResolvedValue({
        ids: [['know_1']],
        documents: [['Pattern description']],
        metadatas: [[{ category: 'patterns' }]],
        distances: [[0.15]]
      });

      const results = await knowledgeManager.searchKnowledge(query, {
        category: 'patterns',
        limit: 5
      });

      expect(mockChromaClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          queryEmbeddings: [mockEmbedding],
          where: { category: 'patterns' }
        })
      );
    });
  });

  describe('extractConcepts', () => {
    it('should extract concepts from text', async () => {
      const text = 'User experience design focuses on usability, accessibility, and visual design';
      
      mockCollection.find().toArray.mockResolvedValue([
        { term: 'user experience', weight: 0.9 },
        { term: 'usability', weight: 0.8 },
        { term: 'accessibility', weight: 0.8 }
      ]);

      const concepts = await knowledgeManager.extractConcepts(text);

      expect(concepts).toContainEqual(
        expect.objectContaining({
          term: 'user experience',
          weight: expect.any(Number)
        })
      );
    });
  });

  describe('learnFromConversation', () => {
    it('should learn patterns from conversations', async () => {
      const conversation = {
        messages: [
          { role: 'user', content: 'How to design a login form?' },
          { role: 'assistant', content: 'A good login form should have clear labels...' }
        ],
        outcome: 'successful',
        rating: 5
      };

      mockEmbeddingService.generateBatchEmbeddings.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6]
      ]);
      mockChromaClient.add.mockResolvedValue({ ids: ['conv_123'] });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'pattern_123' });

      const result = await knowledgeManager.learnFromConversation(conversation);

      expect(result.learned).toBe(true);
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conversation_pattern',
          rating: 5
        })
      );
    });
  });

  describe('getUXPatterns', () => {
    it('should retrieve UX patterns by component type', async () => {
      mockCollection.find().toArray.mockResolvedValue([
        {
          name: 'Login Form Pattern',
          component: 'form',
          description: 'Standard login form pattern',
          examples: ['example1.png'],
          bestPractices: ['Use clear labels']
        }
      ]);

      const patterns = await knowledgeManager.getUXPatterns('form');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].name).toBe('Login Form Pattern');
      expect(mockCollection.find).toHaveBeenCalledWith({ component: 'form' });
    });
  });

  describe('generateRAGResponse', () => {
    it('should generate response using RAG', async () => {
      const query = 'Best practices for mobile design';
      const context = [
        { content: 'Mobile design should be touch-friendly', relevance: 0.9 },
        { content: 'Consider thumb reach zones', relevance: 0.85 }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockChromaClient.query.mockResolvedValue({
        ids: [['ctx_1', 'ctx_2']],
        documents: [[context[0].content, context[1].content]],
        distances: [[0.1, 0.15]]
      });

      const response = await knowledgeManager.generateRAGResponse(query);

      expect(response).toMatchObject({
        answer: expect.any(String),
        sources: expect.any(Array),
        confidence: expect.any(Number)
      });
    });
  });

  describe('updateKnowledgeRelevance', () => {
    it('should update knowledge relevance based on usage', async () => {
      const knowledgeId = 'know_123';
      const feedback = {
        useful: true,
        rating: 4
      };

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await knowledgeManager.updateKnowledgeRelevance(knowledgeId, feedback);

      expect(result.updated).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: knowledgeId },
        expect.objectContaining({
          $inc: { usageCount: 1, totalRating: 4 }
        })
      );
    });
  });

  describe('cleanupOldKnowledge', () => {
    it('should remove outdated knowledge', async () => {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      
      mockCollection.find().toArray.mockResolvedValue([
        { _id: 'old_1', vectorId: 'vec_1' },
        { _id: 'old_2', vectorId: 'vec_2' }
      ]);
      mockChromaClient.delete.mockResolvedValue({ success: true });
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await knowledgeManager.cleanupOldKnowledge(90);

      expect(result.removed).toBe(2);
      expect(mockChromaClient.delete).toHaveBeenCalledTimes(2);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});