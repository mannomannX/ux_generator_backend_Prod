/**
 * Integration Tests for Knowledge Service
 * Tests the complete flow of knowledge management operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import axios from 'axios';
import { MongoClient, RedisClient } from '@ux-flow/common';

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3002';
const TEST_TIMEOUT = 30000; // 30 seconds for integration tests

describe('Knowledge Service Integration Tests', () => {
  let mongoClient;
  let redisClient;
  let testWorkspaceId;
  let testProjectId;
  let testDocumentId;
  let authToken;

  beforeAll(async () => {
    // Initialize database connections
    mongoClient = new MongoClient();
    redisClient = new RedisClient();
    
    await mongoClient.connect();
    await redisClient.connect();

    // Create test workspace and project
    testWorkspaceId = 'test-workspace-' + Date.now();
    testProjectId = 'test-project-' + Date.now();
    
    // Mock auth token for testing
    authToken = 'test-token-' + Date.now();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test data
    const db = mongoClient.getDb();
    await db.collection('documents').deleteMany({ workspaceId: testWorkspaceId });
    await db.collection('knowledge_base').deleteMany({ workspaceId: testWorkspaceId });
    
    // Clear Redis test data
    await redisClient.del(`knowledge:cache:${testWorkspaceId}:*`);
    
    // Close connections
    await mongoClient.disconnect();
    await redisClient.disconnect();
  });

  beforeEach(() => {
    // Reset any test state if needed
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await axios.get(`${API_BASE_URL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'healthy',
        service: 'knowledge-service'
      });
    });

    it('should check readiness with dependencies', async () => {
      const response = await axios.get(`${API_BASE_URL}/health/ready`);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'ready',
        service: 'knowledge-service',
        checks: {
          mongodb: true,
          redis: true,
          chromadb: true
        }
      });
    });

    it('should confirm liveness', async () => {
      const response = await axios.get(`${API_BASE_URL}/health/live`);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        status: 'alive',
        service: 'knowledge-service'
      });
    });
  });

  describe('Document Management', () => {
    it('should create a new document', async () => {
      const documentData = {
        title: 'Test Document',
        content: 'This is a test document for integration testing.',
        type: 'knowledge',
        metadata: {
          tags: ['test', 'integration'],
          category: 'testing'
        }
      };

      const response = await axios.post(
        `${API_BASE_URL}/documents`,
        documentData,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId,
            'X-Project-Id': testProjectId
          }
        }
      );

      expect(response.status).toBe(201);
      expect(response.data).toMatchObject({
        success: true,
        documentId: expect.any(String)
      });

      testDocumentId = response.data.documentId;
    });

    it('should retrieve a document by ID', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/documents/${testDocumentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        _id: testDocumentId,
        title: 'Test Document',
        content: expect.any(String),
        workspaceId: testWorkspaceId
      });
    });

    it('should update a document', async () => {
      const updateData = {
        title: 'Updated Test Document',
        metadata: {
          tags: ['test', 'integration', 'updated'],
          lastModified: new Date().toISOString()
        }
      };

      const response = await axios.put(
        `${API_BASE_URL}/documents/${testDocumentId}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Document updated successfully'
      });
    });

    it('should list documents with pagination', async () => {
      const response = await axios.get(
        `${API_BASE_URL}/documents`,
        {
          params: {
            page: 1,
            limit: 10
          },
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        documents: expect.any(Array),
        total: expect.any(Number),
        page: 1,
        limit: 10
      });
    });
  });

  describe('Knowledge Search', () => {
    it('should perform semantic search', async () => {
      const searchQuery = {
        query: 'test document integration',
        type: 'semantic',
        limit: 5
      };

      const response = await axios.post(
        `${API_BASE_URL}/knowledge/search`,
        searchQuery,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId,
            'X-Project-Id': testProjectId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        results: expect.any(Array),
        query: searchQuery.query,
        type: 'semantic'
      });
    });

    it('should perform hybrid search', async () => {
      const searchQuery = {
        query: 'test',
        type: 'hybrid',
        filters: {
          tags: ['test']
        },
        limit: 10
      };

      const response = await axios.post(
        `${API_BASE_URL}/knowledge/search`,
        searchQuery,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        results: expect.any(Array),
        query: searchQuery.query,
        type: 'hybrid'
      });

      // Verify results have relevance scores
      if (response.data.results.length > 0) {
        expect(response.data.results[0]).toHaveProperty('score');
        expect(response.data.results[0]).toHaveProperty('document');
      }
    });
  });

  describe('Embedding Operations', () => {
    it('should generate embeddings for text', async () => {
      const embeddingRequest = {
        text: 'This is a test text for embedding generation.',
        provider: 'local' // Use local provider for testing
      };

      const response = await axios.post(
        `${API_BASE_URL}/embeddings/generate`,
        embeddingRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        embedding: expect.any(Array),
        dimension: expect.any(Number),
        provider: 'local'
      });

      // Validate embedding vector
      expect(response.data.embedding.length).toBeGreaterThan(0);
      expect(response.data.dimension).toBe(response.data.embedding.length);
    });

    it('should handle batch embedding generation', async () => {
      const batchRequest = {
        texts: [
          'First test text',
          'Second test text',
          'Third test text'
        ],
        provider: 'local'
      };

      const response = await axios.post(
        `${API_BASE_URL}/embeddings/batch`,
        batchRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        embeddings: expect.any(Array),
        count: 3,
        provider: 'local'
      });

      expect(response.data.embeddings).toHaveLength(3);
    });
  });

  describe('RAG Operations', () => {
    it('should retrieve augmented context', async () => {
      const ragRequest = {
        query: 'What is integration testing?',
        maxContext: 1000,
        topK: 3
      };

      const response = await axios.post(
        `${API_BASE_URL}/rag/context`,
        ragRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        context: expect.any(String),
        sources: expect.any(Array),
        query: ragRequest.query
      });
    });

    it('should generate answer with RAG', async () => {
      const ragRequest = {
        question: 'What is the purpose of this system?',
        useContext: true,
        maxTokens: 500
      };

      const response = await axios.post(
        `${API_BASE_URL}/rag/answer`,
        ragRequest,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        answer: expect.any(String),
        sources: expect.any(Array),
        confidence: expect.any(Number)
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authentication', async () => {
      try {
        await axios.get(`${API_BASE_URL}/documents`);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.any(String),
            code: 'UNAUTHORIZED'
          }
        });
      }
    });

    it('should handle invalid document ID', async () => {
      try {
        await axios.get(
          `${API_BASE_URL}/documents/invalid-id-123`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Workspace-Id': testWorkspaceId
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toMatchObject({
          error: {
            message: expect.any(String),
            code: 'NOT_FOUND'
          }
        });
      }
    });

    it('should handle rate limiting', async () => {
      // Make multiple rapid requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          axios.get(`${API_BASE_URL}/health`, {
            headers: { 'X-Forwarded-For': '192.168.1.1' }
          })
        );
      }

      try {
        await Promise.all(requests);
        // Some requests should fail with rate limit
      } catch (error) {
        if (error.response) {
          expect(error.response.status).toBe(429);
          expect(error.response.data).toMatchObject({
            error: {
              code: 'RATE_LIMIT_EXCEEDED'
            }
          });
        }
      }
    });
  });

  describe('Security Validation', () => {
    it('should reject invalid vectors', async () => {
      const invalidVector = {
        vector: [NaN, Infinity, -Infinity, 'invalid'],
        metadata: {
          test: true
        }
      };

      try {
        await axios.post(
          `${API_BASE_URL}/vectors/store`,
          invalidVector,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'X-Workspace-Id': testWorkspaceId
            }
          }
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error.code).toContain('VECTOR');
      }
    });

    it('should sanitize metadata', async () => {
      const documentWithDangerousMetadata = {
        title: 'Test',
        content: 'Content',
        metadata: {
          safe: 'value',
          dangerous: '<script>alert("xss")</script>',
          email: 'test@example.com' // Should be anonymized
        }
      };

      const response = await axios.post(
        `${API_BASE_URL}/documents`,
        documentWithDangerousMetadata,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(201);
      
      // Retrieve and verify sanitization
      const getResponse = await axios.get(
        `${API_BASE_URL}/documents/${response.data.documentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(getResponse.data.metadata.dangerous).not.toContain('<script>');
      expect(getResponse.data.metadata.email).not.toBe('test@example.com');
    });
  });

  describe('Cache Operations', () => {
    it('should cache frequently accessed documents', async () => {
      // First request - should hit database
      const start1 = Date.now();
      const response1 = await axios.get(
        `${API_BASE_URL}/documents/${testDocumentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );
      const time1 = Date.now() - start1;

      // Second request - should hit cache
      const start2 = Date.now();
      const response2 = await axios.get(
        `${API_BASE_URL}/documents/${testDocumentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );
      const time2 = Date.now() - start2;

      expect(response1.data).toEqual(response2.data);
      expect(time2).toBeLessThan(time1); // Cache should be faster
    });
  });

  describe('Cleanup', () => {
    it('should delete test document', async () => {
      const response = await axios.delete(
        `${API_BASE_URL}/documents/${testDocumentId}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Workspace-Id': testWorkspaceId
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: true,
        message: 'Document deleted successfully'
      });
    });
  });
});

export default describe;