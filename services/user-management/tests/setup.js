// ==========================================
// services/user-management/tests/setup.js
// ==========================================

import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.PORT = '3005';
  process.env.BASE_URL = 'http://localhost:3005';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'error'; // Minimize logs during tests
  process.env.EMAIL_FROM = 'noreply@test.com';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SAML_PRIVATE_KEY = 'test-saml-key';
  process.env.SAML_CERTIFICATE = 'test-saml-cert';
});

// Cleanup after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Setup before each test
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
});

// Cleanup after each test
afterEach(() => {
  // Restore all mocks
  jest.restoreAllMocks();
});

// Mock implementations for common modules
global.mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn()
};

global.mockMongoClient = {
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  getDb: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis()
      }),
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      createIndex: jest.fn().mockResolvedValue(true),
      createIndexes: jest.fn().mockResolvedValue(true),
      countDocuments: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      })
    })
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
};

global.mockRedisClient = {
  connect: jest.fn().mockResolvedValue(true),
  disconnect: jest.fn().mockResolvedValue(true),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-2),
  keys: jest.fn().mockResolvedValue([]),
  zadd: jest.fn().mockResolvedValue(1),
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
};

// Helper functions for tests
export function createTestUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User',
    emailVerified: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

export function createTestWorkspace(overrides = {}) {
  return {
    id: 'test-workspace-id',
    name: 'Test Workspace',
    slug: 'test-workspace',
    ownerId: 'test-user-id',
    status: 'active',
    members: [],
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

export function createTestToken(overrides = {}) {
  return {
    token: 'test-jwt-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 3600,
    ...overrides
  };
}