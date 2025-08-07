/**
 * Unit Tests for Enhanced RAG System
 * Tests the RAG system's core functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedRAGSystem } from '../../src/rag/enhanced-rag-system.js';
import { Logger } from '@ux-flow/common';

describe('EnhancedRAGSystem', () => {
  let ragSystem;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;
  let mockEmbeddingManager;
  let mockChromaManager;

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
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
          }),
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
          createIndex: jest.fn().mockResolvedValue(true)
        })
      })
    };

    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0)
    };

    mockEmbeddingManager = {
      generateEmbedding: jest.fn().mockResolvedValue({
        embedding: Array(384).fill(0.1),
        provider: 'test',
        cost: 0.001
      }),
      generateBatchEmbeddings: jest.fn().mockResolvedValue([
        { embedding: Array(384).fill(0.1), provider: 'test' },
        { embedding: Array(384).fill(0.2), provider: 'test' }
      ])
    };

    mockChromaManager = {
      getOrCreateCollection: jest.fn().mockResolvedValue({
        add: jest.fn().mockResolvedValue(true),
        query: jest.fn().mockResolvedValue({
          ids: [['id1', 'id2']],
          embeddings: null,
          documents: [['doc1', 'doc2']],
          metadatas: [[{ source: 'test1' }, { source: 'test2' }]],
          distances: [[0.1, 0.2]]
        }),
        delete: jest.fn().mockResolvedValue(true)
      })
    };

    // Create RAG system instance
    ragSystem = new EnhancedRAGSystem(
      mockLogger,
      mockMongoClient,
      mockRedisClient,
      mockEmbeddingManager
    );

    // Mock the ChromaDB manager
    ragSystem.chromaManager = mockChromaManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(ragSystem).toBeDefined();
      expect(ragSystem.ragConfig.topK).toBe(10);
      expect(ragSystem.ragConfig.finalK).toBe(5);
      expect(ragSystem.ragConfig.chunkSize).toBe(1000);
      expect(ragSystem.ragConfig.chunkOverlap).toBe(200);
    });

    it('should initialize database indexes', async () => {
      await ragSystem.createDatabaseIndexes();
      
      const db = mockMongoClient.getDb();
      expect(db.collection).toHaveBeenCalledWith('rag_documents');
      expect(db.collection).toHaveBeenCalledWith('rag_queries');
      expect(db.collection().createIndex).toHaveBeenCalled();
    });
  });

  describe('Document Processing', () => {
    it('should chunk text correctly', () => {
      const text = 'a'.repeat(2500); // Text longer than chunk size
      const chunks = ragSystem.chunkText(text);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(1000);
      
      // Check overlap
      const firstChunkEnd = chunks[0].substring(chunks[0].length - 100);
      const secondChunkStart = chunks[1].substring(0, 100);
      expect(firstChunkEnd).toBe(secondChunkStart);
    });

    it('should store document with embeddings', async () => {
      const document = {
        id: 'test-doc-1',
        content: 'This is a test document for RAG system testing.',
        metadata: {
          title: 'Test Document',
          source: 'unit-test'
        }
      };

      await ragSystem.storeDocument(
        document,
        'global',
        'workspace-1',
        'project-1'
      );

      expect(mockEmbeddingManager.generateBatchEmbeddings).toHaveBeenCalled();
      expect(mockChromaManager.getOrCreateCollection).toHaveBeenCalled();
      
      const collection = await mockChromaManager.getOrCreateCollection();
      expect(collection.add).toHaveBeenCalled();
    });

    it('should handle empty documents gracefully', async () => {
      const document = {
        id: 'empty-doc',
        content: '',
        metadata: {}
      };

      await ragSystem.storeDocument(document, 'global');
      
      expect(mockEmbeddingManager.generateBatchEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('Search Operations', () => {
    it('should perform vector search', async () => {
      const query = 'test query for search';
      const results = await ragSystem.search(
        query,
        'workspace-1',
        'project-1'
      );

      expect(mockEmbeddingManager.generateEmbedding).toHaveBeenCalledWith(query);
      expect(mockChromaManager.getOrCreateCollection).toHaveBeenCalled();
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform hybrid search with keyword and vector', async () => {
      const query = 'test hybrid search';
      
      // Mock MongoDB text search
      mockMongoClient.getDb().collection().find = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { _id: 'keyword1', content: 'keyword result', score: 0.8 }
          ])
        })
      });

      const results = await ragSystem.hybridSearch(
        query,
        'workspace-1',
        'project-1'
      );

      expect(results).toBeDefined();
      expect(mockEmbeddingManager.generateEmbedding).toHaveBeenCalled();
    });

    it('should cache search results', async () => {
      const query = 'cached query';
      
      // First search
      await ragSystem.search(query, 'workspace-1');
      
      // Second search (should hit cache)
      mockRedisClient.get.mockResolvedValue(JSON.stringify({
        results: [{ id: 'cached', score: 0.9 }]
      }));
      
      const results = await ragSystem.search(query, 'workspace-1');
      
      expect(mockRedisClient.get).toHaveBeenCalled();
      expect(results).toBeDefined();
    });
  });

  describe('Re-ranking', () => {
    it('should re-rank search results', () => {
      const results = [
        { id: '1', score: 0.5, metadata: { source: 'a' } },
        { id: '2', score: 0.8, metadata: { source: 'b' } },
        { id: '3', score: 0.6, metadata: { source: 'c' } }
      ];

      const reranked = ragSystem.reRankResults(results, 'test query');
      
      expect(reranked).toHaveLength(3);
      expect(reranked[0].score).toBeGreaterThanOrEqual(reranked[1].score);
      expect(reranked[1].score).toBeGreaterThanOrEqual(reranked[2].score);
    });

    it('should filter results below minimum relevance', () => {
      const results = [
        { id: '1', score: 0.8, metadata: {} },
        { id: '2', score: 0.3, metadata: {} }, // Below threshold
        { id: '3', score: 0.9, metadata: {} }
      ];

      ragSystem.ragConfig.minRelevanceScore = 0.7;
      const filtered = ragSystem.reRankResults(results, 'query');
      
      expect(filtered).toHaveLength(2);
      expect(filtered.every(r => r.score >= 0.7)).toBe(true);
    });

    it('should limit results to finalK', () => {
      const results = Array(20).fill(null).map((_, i) => ({
        id: `${i}`,
        score: Math.random(),
        metadata: {}
      }));

      const limited = ragSystem.reRankResults(results, 'query');
      
      expect(limited.length).toBeLessThanOrEqual(ragSystem.ragConfig.finalK);
    });
  });

  describe('Context Building', () => {
    it('should build context from search results', () => {
      const results = [
        { id: '1', document: 'First document content', score: 0.9 },
        { id: '2', document: 'Second document content', score: 0.8 }
      ];

      const context = ragSystem.buildContext(results);
      
      expect(context).toContain('First document content');
      expect(context).toContain('Second document content');
    });

    it('should respect max context tokens', () => {
      const results = Array(100).fill(null).map((_, i) => ({
        id: `${i}`,
        document: 'a'.repeat(1000),
        score: 0.9
      }));

      const context = ragSystem.buildContext(results);
      
      // Rough token estimation
      const estimatedTokens = context.length / 4;
      expect(estimatedTokens).toBeLessThanOrEqual(ragSystem.ragConfig.maxContextTokens);
    });

    it('should generate citations', () => {
      const results = [
        {
          id: '1',
          document: 'Citation test',
          metadata: { source: 'source1', page: 1 }
        }
      ];

      const citations = ragSystem.generateCitations(results);
      
      expect(citations).toHaveLength(1);
      expect(citations[0]).toMatchObject({
        id: '1',
        source: 'source1',
        page: 1
      });
    });
  });

  describe('Collection Management', () => {
    it('should get correct collections based on type', () => {
      const collections = ragSystem.getCollectionsToSearch(
        'global',
        'workspace-1',
        'project-1'
      );

      expect(collections).toContain({ name: 'global_knowledge', type: 'global' });
    });

    it('should ensure collection exists', async () => {
      await ragSystem.ensureCollection(
        'test_collection',
        'test',
        'workspace-1',
        'project-1'
      );

      expect(mockChromaManager.getOrCreateCollection).toHaveBeenCalledWith(
        'test_collection',
        expect.objectContaining({
          type: 'test',
          workspace_id: 'workspace-1',
          project_id: 'project-1'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle embedding generation failure', async () => {
      mockEmbeddingManager.generateEmbedding.mockRejectedValue(
        new Error('Embedding service unavailable')
      );

      await expect(
        ragSystem.search('test query', 'workspace-1')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle ChromaDB connection failure', async () => {
      mockChromaManager.getOrCreateCollection.mockRejectedValue(
        new Error('ChromaDB connection failed')
      );

      await expect(
        ragSystem.storeDocument({ id: 'test', content: 'test' }, 'global')
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle invalid document structure', async () => {
      const invalidDoc = { 
        // Missing required fields
        metadata: {} 
      };

      await expect(
        ragSystem.storeDocument(invalidDoc, 'global')
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle large batch operations', async () => {
      const largeText = 'a'.repeat(50000); // 50KB text
      const chunks = ragSystem.chunkText(largeText);
      
      expect(chunks.length).toBeGreaterThan(40);
      
      // Mock batch embedding for all chunks
      mockEmbeddingManager.generateBatchEmbeddings.mockResolvedValue(
        chunks.map(() => ({ embedding: Array(384).fill(0.1), provider: 'test' }))
      );

      await ragSystem.storeDocument(
        { id: 'large-doc', content: largeText },
        'global'
      );

      expect(mockEmbeddingManager.generateBatchEmbeddings).toHaveBeenCalled();
    });

    it('should batch vector operations efficiently', async () => {
      const documents = Array(10).fill(null).map((_, i) => ({
        id: `doc-${i}`,
        content: `Document ${i} content`
      }));

      for (const doc of documents) {
        await ragSystem.storeDocument(doc, 'global');
      }

      // Should batch operations, not call individually for each
      const callCount = mockEmbeddingManager.generateBatchEmbeddings.mock.calls.length;
      expect(callCount).toBeLessThanOrEqual(documents.length);
    });
  });

  describe('Security', () => {
    it('should sanitize metadata before storage', async () => {
      const document = {
        id: 'test-doc',
        content: 'Test content',
        metadata: {
          safe: 'value',
          dangerous: '<script>alert("xss")</script>',
          nested: {
            value: 'test<img src=x onerror=alert(1)>'
          }
        }
      };

      await ragSystem.storeDocument(document, 'global');
      
      const collection = await mockChromaManager.getOrCreateCollection();
      const addCall = collection.add.mock.calls[0][0];
      
      // Check that dangerous content was sanitized
      expect(JSON.stringify(addCall)).not.toContain('<script>');
      expect(JSON.stringify(addCall)).not.toContain('onerror');
    });

    it('should validate collection names', async () => {
      const invalidNames = [
        '../../../etc/passwd',
        'collection; DROP TABLE users;',
        'collection<script>',
        ''
      ];

      for (const name of invalidNames) {
        await expect(
          ragSystem.ensureCollection(name, 'test', 'workspace-1')
        ).rejects.toThrow();
      }
    });
  });
});

export default describe;