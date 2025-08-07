/**
 * Comprehensive Security Tests for API Gateway
 */

import request from 'supertest';
import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createClient } from 'redis-mock';
import { JWTUtils } from '@ux-flow/common';

describe('API Gateway Security Tests', () => {
  let app;
  let mongoServer;
  let redisClient;
  let server;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Setup mock Redis
    redisClient = createClient();
    
    // Initialize app with test configuration
    process.env.MONGODB_URI = mongoUri;
    process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
    process.env.NODE_ENV = 'test';
    
    // Import app after setting env vars
    const { createApp } = await import('../src/app.js');
    app = await createApp({ mongoUri, redisClient });
    server = app.listen(0);
  });

  afterAll(async () => {
    await server.close();
    await mongoServer.stop();
    await redisClient.quit();
  });

  describe('Authentication Tests', () => {
    test('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(401);
      
      expect(response.body.error).toBe('Authentication required');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject expired tokens', async () => {
      const expiredToken = JWTUtils.sign({
        userId: 'test-user',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      expect(response.body.error).toBe('Token expired');
    });

    test('should accept valid tokens', async () => {
      const validToken = JWTUtils.sign({
        userId: 'test-user',
        email: 'test@example.com',
        workspaceId: 'test-workspace'
      });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('projects');
    });
  });

  describe('Token Blacklisting Tests', () => {
    test('should reject blacklisted tokens', async () => {
      const token = JWTUtils.sign({
        userId: 'test-user',
        email: 'test@example.com'
      });

      // Login and logout to blacklist token
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Try to use blacklisted token
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      
      expect(response.body.error).toBe('Token revoked');
    });

    test('should revoke all tokens on logout-all', async () => {
      const token1 = JWTUtils.sign({ userId: 'user1', email: 'user1@example.com' });
      const token2 = JWTUtils.sign({ userId: 'user1', email: 'user1@example.com' });

      // Logout all sessions
      await request(app)
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Both tokens should be rejected
      await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should rate limit excessive requests', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      // Make many requests quickly
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(
          request(app)
            .get('/api/test')
            .set('Authorization', `Bearer ${token}`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.error).toContain('Too Many Requests');
    });

    test('should apply stricter limits to auth endpoints', async () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'wrong' })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body.error).toContain('Too Many Login Attempts');
    });
  });

  describe('NoSQL Injection Prevention', () => {
    test('should reject NoSQL injection in projectId', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      const response = await request(app)
        .get('/api/projects/$where')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      
      expect(response.body.error.message).toContain('Invalid');
    });

    test('should sanitize search queries', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      const response = await request(app)
        .get('/api/projects?search=$regex')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      // Should succeed but with sanitized search
      expect(response.body).toHaveProperty('projects');
    });

    test('should validate ObjectId format', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      const response = await request(app)
        .get('/api/projects/invalid-object-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
      
      expect(response.body.error.message).toContain('Invalid');
    });
  });

  describe('XSS Prevention', () => {
    test('should sanitize user input', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '<script>alert("XSS")</script>',
          description: 'Test project'
        })
        .expect(201);
      
      expect(response.body.project.name).not.toContain('<script>');
    });

    test('should set security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });

  describe('Service Authentication Tests', () => {
    test('should reject service requests without auth headers', async () => {
      const response = await request(app)
        .post('/internal/service-endpoint')
        .expect(401);
      
      expect(response.body.error).toBe('Service authentication failed');
    });

    test('should reject invalid service signatures', async () => {
      const response = await request(app)
        .post('/internal/service-endpoint')
        .set('X-Service-Auth', 'invalid-token')
        .set('X-Service-Signature', 'invalid-signature')
        .expect(401);
      
      expect(response.body.error).toBe('Service authentication failed');
    });

    test('should prevent replay attacks', async () => {
      // Create valid service token
      const { ServiceAuthenticator } = await import('../src/middleware/service-auth-fixed.js');
      const authenticator = new ServiceAuthenticator(console, redisClient);
      
      const { token, signature } = authenticator.generateServiceToken(
        'flow-service',
        'api-gateway',
        { test: true }
      );

      // First request should succeed
      await request(app)
        .post('/internal/service-endpoint')
        .set('X-Service-Auth', token)
        .set('X-Service-Signature', signature)
        .expect(200);

      // Replay should fail
      const response = await request(app)
        .post('/internal/service-endpoint')
        .set('X-Service-Auth', token)
        .set('X-Service-Signature', signature)
        .expect(401);
      
      expect(response.body.message).toContain('already used');
    });
  });

  describe('WebSocket Security Tests', () => {
    test('should reject WebSocket connections without token', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:${server.address().port}/ws`);
      
      ws.on('error', (error) => {
        expect(error.message).toContain('401');
        done();
      });
    });

    test('should reject WebSocket connections with invalid token', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(
        `ws://localhost:${server.address().port}/ws?token=invalid-token`
      );
      
      ws.on('error', (error) => {
        expect(error.message).toContain('401');
        done();
      });
    });

    test('should validate WebSocket message format', async () => {
      const WebSocket = require('ws');
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      const ws = new WebSocket(
        `ws://localhost:${server.address().port}/ws?token=${token}&projectId=test&workspaceId=test`
      );
      
      await new Promise((resolve) => {
        ws.on('open', () => {
          // Send invalid message
          ws.send('invalid json');
          
          ws.on('message', (data) => {
            const message = JSON.parse(data);
            expect(message.type).toBe('error');
            expect(message.code).toBe('INVALID_MESSAGE');
            ws.close();
            resolve();
          });
        });
      });
    });
  });

  describe('MFA Tests', () => {
    test('should require MFA code when enabled', async () => {
      // Setup user with MFA
      const userId = 'mfa-test-user';
      const db = app.locals.mongoClient.getDb();
      await db.collection('users').insertOne({
        _id: userId,
        email: 'mfa@example.com',
        mfa: {
          enabled: true,
          secret: 'test-secret'
        }
      });

      const response = await request(app)
        .post('/auth/verify-mfa')
        .send({
          userId,
          code: '000000' // Invalid code
        })
        .expect(400);
      
      expect(response.body.error).toContain('Invalid authentication code');
    });
  });

  describe('CSRF Protection', () => {
    test('should validate CSRF tokens on state-changing operations', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      // Get CSRF token
      const csrfResponse = await request(app)
        .get('/csrf-token')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      const csrfToken = csrfResponse.body.csrfToken;
      
      // Should reject without CSRF token
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test' })
        .expect(403);
      
      // Should accept with valid CSRF token
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Test' })
        .expect(201);
    });
  });

  describe('Error Handling Tests', () => {
    test('should not expose stack traces in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const response = await request(app)
        .get('/api/trigger-error')
        .expect(500);
      
      expect(response.body.error).not.toHaveProperty('stack');
      expect(response.body.error.message).toBe('An error occurred processing your request');
      
      process.env.NODE_ENV = originalEnv;
    });

    test('should sanitize sensitive error messages', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrong-password' })
        .expect(401);
      
      // Should not reveal whether email exists
      expect(response.body.error).toBe('Invalid email or password');
      expect(response.body.error).not.toContain('User not found');
    });
  });

  describe('Input Validation Tests', () => {
    test('should validate email format', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Test123!@#'
        })
        .expect(400);
      
      expect(response.body.error).toContain('Invalid email');
    });

    test('should enforce password complexity', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak'
        })
        .expect(400);
      
      expect(response.body.error).toContain('password');
    });

    test('should limit input length', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      const longString = 'a'.repeat(10000);
      
      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: longString,
          description: 'Test'
        })
        .expect(400);
      
      expect(response.body.error).toContain('exceed');
    });
  });

  describe('Circuit Breaker Tests', () => {
    test('should open circuit after failures', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      // Simulate service failures
      for (let i = 0; i < 10; i++) {
        await request(app)
          .get('/api/external-service')
          .set('Authorization', `Bearer ${token}`)
          .set('X-Simulate-Failure', 'true');
      }
      
      // Circuit should be open
      const response = await request(app)
        .get('/api/external-service')
        .set('Authorization', `Bearer ${token}`)
        .expect(503);
      
      expect(response.body.error).toContain('Circuit breaker');
    });
  });

  describe('Session Security Tests', () => {
    test('should invalidate sessions on password change', async () => {
      const token = JWTUtils.sign({ userId: 'test-user' });
      
      // Change password
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: 'old-password',
          newPassword: 'New123!@#'
        })
        .expect(200);
      
      // Old token should be invalid
      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      
      expect(response.body.error).toBe('Token revoked');
    });
  });
});

export default {
  securityTests: true
};