/**
 * Integration Tests for User Routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { UserManager } from '../../src/services/user-manager.js';
import usersRoutes from '../../src/routes/users.js';
import { authMiddleware } from '../../src/middleware/auth.js';

describe('User Routes Integration', () => {
  let app;
  let userManager;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock auth middleware for testing
    app.use((req, res, next) => {
      req.user = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'user'
      };
      next();
    });
    
    // Setup user manager with mocks
    userManager = new UserManager(
      global.mockLogger,
      global.mockMongoClient,
      global.mockRedisClient,
      { sendEmail: jest.fn().mockResolvedValue(true) }
    );
    
    // Mount routes
    app.use('/users', usersRoutes);
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('GET /users/profile', () => {
    it('should return user profile', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User'
      };
      
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue(mockUser);
      
      const response = await request(app)
        .get('/users/profile')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        user: mockUser
      });
    });
    
    it('should handle user not found', async () => {
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue(null);
      
      const response = await request(app)
        .get('/users/profile')
        .expect(404);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'USER_NOT_FOUND'
        }
      });
    });
  });
  
  describe('PUT /users/profile', () => {
    it('should update user profile', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        displayName: 'Updated Name'
      };
      
      global.mockMongoClient.getDb().collection().updateOne
        .mockResolvedValue({ modifiedCount: 1 });
      
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({ ...updateData, id: 'test-user-id' });
      
      const response = await request(app)
        .put('/users/profile')
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        user: expect.objectContaining(updateData)
      });
    });
    
    it('should validate input data', async () => {
      const invalidData = {
        email: 'not-allowed-to-change@example.com'
      };
      
      const response = await request(app)
        .put('/users/profile')
        .send(invalidData)
        .expect(400);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR'
        }
      });
    });
  });
  
  describe('POST /users/change-password', () => {
    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!'
      };
      
      // Mock current user with password
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({
          id: 'test-user-id',
          email: 'test@example.com',
          passwordHash: '$2b$12$mock.hash.for.old.password'
        });
      
      // Mock password comparison
      jest.spyOn(require('../../src/utils/security.js').SecurityUtils, 'comparePassword')
        .mockResolvedValue(true);
      
      global.mockMongoClient.getDb().collection().updateOne
        .mockResolvedValue({ modifiedCount: 1 });
      
      const response = await request(app)
        .post('/users/change-password')
        .send(passwordData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        message: 'Password changed successfully'
      });
    });
    
    it('should reject incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'WrongPassword',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!'
      };
      
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({
          id: 'test-user-id',
          passwordHash: '$2b$12$mock.hash'
        });
      
      jest.spyOn(require('../../src/utils/security.js').SecurityUtils, 'comparePassword')
        .mockResolvedValue(false);
      
      const response = await request(app)
        .post('/users/change-password')
        .send(passwordData)
        .expect(401);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'INVALID_PASSWORD'
        }
      });
    });
    
    it('should validate password requirements', async () => {
      const weakPassword = {
        currentPassword: 'OldPassword123!',
        newPassword: 'weak',
        confirmPassword: 'weak'
      };
      
      const response = await request(app)
        .post('/users/change-password')
        .send(weakPassword)
        .expect(400);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'WEAK_PASSWORD'
        }
      });
    });
  });
  
  describe('POST /users/enable-2fa', () => {
    it('should enable 2FA successfully', async () => {
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({
          id: 'test-user-id',
          twoFactorEnabled: false
        });
      
      global.mockMongoClient.getDb().collection().updateOne
        .mockResolvedValue({ modifiedCount: 1 });
      
      const response = await request(app)
        .post('/users/enable-2fa')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        secret: expect.any(String),
        qrCode: expect.any(String),
        backupCodes: expect.any(Array)
      });
    });
    
    it('should not enable 2FA if already enabled', async () => {
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({
          id: 'test-user-id',
          twoFactorEnabled: true
        });
      
      const response = await request(app)
        .post('/users/enable-2fa')
        .expect(400);
      
      expect(response.body).toMatchObject({
        error: {
          code: '2FA_ALREADY_ENABLED'
        }
      });
    });
  });
  
  describe('DELETE /users/account', () => {
    it('should delete user account', async () => {
      const deleteData = {
        password: 'Password123!',
        confirmation: 'DELETE'
      };
      
      global.mockMongoClient.getDb().collection().findOne
        .mockResolvedValue({
          id: 'test-user-id',
          passwordHash: '$2b$12$mock.hash'
        });
      
      jest.spyOn(require('../../src/utils/security.js').SecurityUtils, 'comparePassword')
        .mockResolvedValue(true);
      
      // Mock deletion operations
      global.mockMongoClient.getDb().collection().updateOne
        .mockResolvedValue({ modifiedCount: 1 });
      
      global.mockMongoClient.getDb().collection().deleteMany
        .mockResolvedValue({ deletedCount: 5 });
      
      const response = await request(app)
        .delete('/users/account')
        .send(deleteData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        message: 'Account deleted successfully'
      });
    });
    
    it('should require confirmation', async () => {
      const deleteData = {
        password: 'Password123!'
        // Missing confirmation
      };
      
      const response = await request(app)
        .delete('/users/account')
        .send(deleteData)
        .expect(400);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'CONFIRMATION_REQUIRED'
        }
      });
    });
  });
  
  describe('GET /users/sessions', () => {
    it('should return active sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          userAgent: 'Mozilla/5.0',
          ip: '192.168.1.1',
          createdAt: new Date(),
          lastAccessedAt: new Date()
        },
        {
          id: 'session-2',
          userAgent: 'Chrome/96.0',
          ip: '10.0.0.1',
          createdAt: new Date(),
          lastAccessedAt: new Date()
        }
      ];
      
      global.mockMongoClient.getDb().collection().find().toArray
        .mockResolvedValue(mockSessions);
      
      const response = await request(app)
        .get('/users/sessions')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        sessions: expect.arrayContaining([
          expect.objectContaining({
            id: 'session-1',
            userAgent: 'Mozilla/5.0'
          })
        ])
      });
    });
  });
  
  describe('POST /users/revoke-session', () => {
    it('should revoke a session', async () => {
      const sessionData = {
        sessionId: 'session-to-revoke'
      };
      
      global.mockMongoClient.getDb().collection().deleteOne
        .mockResolvedValue({ deletedCount: 1 });
      
      global.mockRedisClient.del
        .mockResolvedValue(1);
      
      const response = await request(app)
        .post('/users/revoke-session')
        .send(sessionData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        message: 'Session revoked successfully'
      });
    });
    
    it('should handle non-existent session', async () => {
      const sessionData = {
        sessionId: 'non-existent'
      };
      
      global.mockMongoClient.getDb().collection().deleteOne
        .mockResolvedValue({ deletedCount: 0 });
      
      const response = await request(app)
        .post('/users/revoke-session')
        .send(sessionData)
        .expect(404);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'SESSION_NOT_FOUND'
        }
      });
    });
  });
  
  describe('GET /users/api-keys', () => {
    it('should return user API keys', async () => {
      const mockApiKeys = [
        {
          id: 'key-1',
          name: 'Production API',
          prefix: 'uxf_prod',
          createdAt: new Date(),
          lastUsedAt: new Date()
        }
      ];
      
      global.mockMongoClient.getDb().collection().find().toArray
        .mockResolvedValue(mockApiKeys);
      
      const response = await request(app)
        .get('/users/api-keys')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        apiKeys: expect.arrayContaining([
          expect.objectContaining({
            name: 'Production API'
          })
        ])
      });
    });
  });
  
  describe('POST /users/api-keys', () => {
    it('should create new API key', async () => {
      const keyData = {
        name: 'New API Key',
        scopes: ['read', 'write']
      };
      
      global.mockMongoClient.getDb().collection().insertOne
        .mockResolvedValue({ insertedId: 'new-key-id' });
      
      const response = await request(app)
        .post('/users/api-keys')
        .send(keyData)
        .expect(201);
      
      expect(response.body).toMatchObject({
        success: true,
        apiKey: expect.objectContaining({
          name: 'New API Key',
          key: expect.stringMatching(/^uxf_[a-f0-9]{48}$/)
        })
      });
    });
    
    it('should enforce API key limits', async () => {
      global.mockMongoClient.getDb().collection().countDocuments
        .mockResolvedValue(10); // Assuming limit is 10
      
      const response = await request(app)
        .post('/users/api-keys')
        .send({ name: 'Exceeds Limit' })
        .expect(400);
      
      expect(response.body).toMatchObject({
        error: {
          code: 'API_KEY_LIMIT_REACHED'
        }
      });
    });
  });
});

export default describe;