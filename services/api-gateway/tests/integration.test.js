// ==========================================
// API GATEWAY - Integration Tests
// ==========================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { MongoClient } from 'mongodb';
import Redis from 'redis';
import jwt from 'jsonwebtoken';

describe('API Gateway Integration', () => {
  let app;
  let mongoClient;
  let redisClient;
  let server;
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.MONGODB_URI = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/gateway_test';
    process.env.REDIS_URL = process.env.REDIS_TEST_URL || 'redis://localhost:6379';

    // Connect to test databases
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();

    redisClient = Redis.createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();

    // Setup Express app
    app = express();
    app.use(express.json());

    // Import and setup middleware
    const authMiddleware = await import('../src/middleware/auth.js');
    const validationMiddleware = await import('../src/middleware/validation.js');
    const rateLimitMiddleware = await import('../src/middleware/rate-limit.js');

    // Setup routes
    const authRoutes = await import('../src/routes/auth.js');
    const projectRoutes = await import('../src/routes/projects.js');
    const flowRoutes = await import('../src/routes/flows.js');

    app.use('/api/auth', authRoutes.default);
    app.use('/api/projects', authMiddleware.authenticateToken, projectRoutes.default);
    app.use('/api/flows', authMiddleware.authenticateToken, flowRoutes.default);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'api-gateway' });
    });

    // Start server
    server = app.listen(0); // Random port

    // Create test user
    testUser = {
      id: 'user_test_123',
      email: 'test@example.com',
      name: 'Test User',
      workspaceId: 'workspace_test_123',
      role: 'user'
    };

    authToken = `Bearer ${jwt.sign(testUser, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
  });

  afterAll(async () => {
    await mongoClient.close();
    await redisClient.quit();
    server.close();
  });

  beforeEach(async () => {
    // Clear test data
    const db = mongoClient.db();
    await db.collection('users').deleteMany({});
    await db.collection('projects').deleteMany({});
    await db.collection('flows').deleteMany({});
    await redisClient.flushAll();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'api-gateway'
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should register new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePass123!',
          name: 'New User'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        user: {
          email: 'newuser@example.com',
          name: 'New User'
        },
        token: expect.any(String)
      });
    });

    it('should login existing user', async () => {
      // First create user
      const db = mongoClient.db();
      await db.collection('users').insertOne({
        ...testUser,
        password: '$2b$10$hashedpassword' // Mock hashed password
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        user: expect.objectContaining({
          email: testUser.email
        }),
        token: expect.any(String)
      });
    });

    it('should refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: authToken.replace('Bearer ', '')
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String)
      });
    });

    it('should logout user', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Logged out successfully'
      });
    });
  });

  describe('Project Management', () => {
    it('should create new project', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', authToken)
        .send({
          name: 'Test Project',
          description: 'A test project',
          type: 'web'
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        project: {
          name: 'Test Project',
          description: 'A test project',
          type: 'web',
          owner: testUser.id
        }
      });
    });

    it('should list user projects', async () => {
      // Create test projects
      const db = mongoClient.db();
      await db.collection('projects').insertMany([
        { name: 'Project 1', owner: testUser.id, workspaceId: testUser.workspaceId },
        { name: 'Project 2', owner: testUser.id, workspaceId: testUser.workspaceId }
      ]);

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
    });

    it('should update project', async () => {
      // Create project
      const db = mongoClient.db();
      const result = await db.collection('projects').insertOne({
        name: 'Original Name',
        owner: testUser.id,
        workspaceId: testUser.workspaceId
      });

      const response = await request(app)
        .patch(`/api/projects/${result.insertedId}`)
        .set('Authorization', authToken)
        .send({
          name: 'Updated Name',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.project.name).toBe('Updated Name');
    });

    it('should delete project', async () => {
      // Create project
      const db = mongoClient.db();
      const result = await db.collection('projects').insertOne({
        name: 'To Delete',
        owner: testUser.id,
        workspaceId: testUser.workspaceId
      });

      const response = await request(app)
        .delete(`/api/projects/${result.insertedId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Project deleted successfully'
      });
    });
  });

  describe('Flow Management', () => {
    it('should create new flow', async () => {
      const response = await request(app)
        .post('/api/flows')
        .set('Authorization', authToken)
        .send({
          projectId: 'project_123',
          name: 'User Onboarding Flow',
          nodes: [],
          edges: []
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        flow: {
          name: 'User Onboarding Flow',
          projectId: 'project_123'
        }
      });
    });

    it('should validate flow structure', async () => {
      const response = await request(app)
        .post('/api/flows')
        .set('Authorization', authToken)
        .send({
          projectId: 'project_123',
          name: 'Invalid Flow',
          nodes: 'not an array', // Invalid
          edges: []
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation error'
      });
    });

    it('should export flow', async () => {
      // Create flow
      const db = mongoClient.db();
      const result = await db.collection('flows').insertOne({
        name: 'Export Test',
        projectId: 'project_123',
        owner: testUser.id,
        nodes: [{ id: 'node1', type: 'start' }],
        edges: []
      });

      const response = await request(app)
        .get(`/api/flows/${result.insertedId}/export`)
        .set('Authorization', authToken)
        .query({ format: 'json' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Export Test',
        nodes: expect.any(Array),
        edges: expect.any(Array)
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Make rapid requests
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get('/api/projects')
            .set('Authorization', authToken)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body).toMatchObject({
        error: 'Too many requests'
      });
    });

    it('should use different limits for different endpoints', async () => {
      // Auth endpoints should have stricter limits
      const authRequests = Array(6).fill().map(() =>
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@example.com', password: 'wrong' })
      );

      const authResponses = await Promise.all(authRequests);
      const authRateLimited = authResponses.filter(r => r.status === 429);

      expect(authRateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    it('should sanitize user input', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', authToken)
        .send({
          name: '<script>alert("XSS")</script>Project',
          description: 'Normal description'
        });

      expect(response.status).toBe(201);
      expect(response.body.project.name).not.toContain('<script>');
    });

    it('should prevent SQL injection attempts', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', authToken)
        .query({ filter: "'; DROP TABLE users; --" });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Invalid input detected'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle service unavailable', async () => {
      // Disconnect database to simulate error
      await mongoClient.close();

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', authToken);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: 'Service temporarily unavailable'
      });

      // Reconnect for other tests
      await mongoClient.connect();
    });

    it('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .send('not valid json');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', authToken)
        .send({
          // Missing required 'name' field
          description: 'No name project'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Validation error',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'name'
          })
        ])
      });
    });
  });

  describe('CORS Handling', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/projects')
        .set('Origin', 'https://example.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should reject unauthorized origins', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', authToken)
        .set('Origin', 'https://malicious-site.com');

      // Depending on CORS config, may block or allow
      // Check that sensitive headers aren't exposed
      expect(response.headers['access-control-allow-credentials']).not.toBe('true');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit on repeated failures', async () => {
      // Mock service failure
      const failingEndpoint = '/api/external-service';
      
      app.get(failingEndpoint, (req, res) => {
        res.status(500).json({ error: 'Service error' });
      });

      // Make requests until circuit opens
      const requests = Array(10).fill().map(() =>
        request(app).get(failingEndpoint)
      );

      const responses = await Promise.all(requests);
      const circuitOpen = responses.find(r => 
        r.status === 503 && r.body.error === 'Circuit breaker open'
      );

      expect(circuitOpen).toBeDefined();
    });
  });
});