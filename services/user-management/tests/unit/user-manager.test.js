// ==========================================
// services/user-management/tests/unit/user-manager.test.js
// ==========================================

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { UserManager } from '../../src/services/user-manager.js';
import { Logger, MongoClient, RedisClient } from '@ux-flow/common';
import { testUsers } from '../fixtures/users.js';

describe('UserManager', () => {
  let userManager;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockMongoClient = {
      getDb: jest.fn(() => ({
        collection: jest.fn(() => ({
          insertOne: jest.fn(),
          findOne: jest.fn(),
          updateOne: jest.fn(),
          find: jest.fn(() => ({
            sort: jest.fn(() => ({
              skip: jest.fn(() => ({
                limit: jest.fn(() => ({
                  toArray: jest.fn(),
                })),
              })),
            })),
          })),
          countDocuments: jest.fn(),
        })),
      })),
    };

    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    userManager = new UserManager(mockLogger, mockMongoClient, mockRedisClient);
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      // Mock successful insertion
      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.findOne.mockResolvedValue(null); // No existing user
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => 'user123' },
      });

      const result = await userManager.createUser(testUsers.validUser);

      expect(result).toHaveProperty('id', 'user123');
      expect(result).toHaveProperty('email', testUsers.validUser.email);
      expect(result).toHaveProperty('firstName', testUsers.validUser.firstName);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('should throw error if user already exists', async () => {
      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.findOne.mockResolvedValue({ email: testUsers.validUser.email });

      await expect(userManager.createUser(testUsers.validUser))
        .rejects
        .toThrow('User with this email already exists');
    });

    it('should hash password before storing', async () => {
      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => 'user123' },
      });

      await userManager.createUser(testUsers.validUser);

      const insertCall = mockCollection.insertOne.mock.calls[0][0];
      expect(insertCall.password).not.toBe(testUsers.validUser.password);
      expect(insertCall.password).toMatch(/^\$2b\$12\$/); // bcrypt hash pattern
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate valid credentials', async () => {
      const mockUser = {
        _id: { toString: () => 'user123' },
        email: testUsers.validUser.email,
        password: '$2b$12$hashedpassword',
        status: 'active',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        permissions: ['read_projects'],
      };

      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.findOne.mockResolvedValue(mockUser);

      // Mock bcrypt.compare to return true
      jest.doMock('bcrypt', () => ({
        compare: jest.fn().mockResolvedValue(true),
        hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
      }));

      const result = await userManager.authenticateUser(
        testUsers.validUser.email,
        testUsers.validUser.password
      );

      expect(result.success).toBe(true);
      expect(result.user).toHaveProperty('id', 'user123');
      expect(result).toHaveProperty('token');
    });

    it('should reject invalid credentials', async () => {
      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.findOne.mockResolvedValue(null);

      const result = await userManager.authenticateUser(
        'invalid@example.com',
        'wrongpassword'
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Invalid email or password');
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const mockCollection = mockMongoClient.getDb().collection();
      mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
      mockCollection.findOne.mockResolvedValue({
        _id: { toString: () => 'user123' },
        email: 'test@example.com',
        firstName: 'Updated',
        lastName: 'User',
      });

      const result = await userManager.updateUser('user123', {
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Object),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            firstName: 'Updated',
            updatedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});