// ==========================================
// Common Package - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-common-test';
process.env.REDIS_URL = 'redis://localhost:6379/3'; // Dedicated DB for common tests
process.env.JWT_SECRET = 'test-jwt-secret-common';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';

// Global test timeout
jest.setTimeout(15000);

// Mock external database connections for unit testing
jest.mock('mongodb', () => ({
  MongoClient: {
    connect: jest.fn().mockResolvedValue({
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          findOne: jest.fn(),
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
          }),
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
        })
      }),
      close: jest.fn().mockResolvedValue()
    })
  }
}));

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-2),
    keys: jest.fn().mockResolvedValue([]),
    zAdd: jest.fn().mockResolvedValue(1),
    zRemRangeByScore: jest.fn().mockResolvedValue(0),
    zCard: jest.fn().mockResolvedValue(0),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(),
    on: jest.fn(),
    off: jest.fn()
  })
}));

// Mock Winston logger for testing
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn(),
    json: jest.fn(),
    printf: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock ChromaDB for vector store testing
jest.mock('chromadb', () => ({
  ChromaApi: jest.fn().mockImplementation(() => ({
    createCollection: jest.fn().mockResolvedValue({
      name: 'test-collection'
    }),
    getCollection: jest.fn().mockResolvedValue({
      name: 'test-collection',
      add: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue({
        ids: [['test-doc']],
        documents: [['test document content']],
        distances: [[0.1]],
        metadatas: [[{ source: 'test' }]]
      })
    })
  }))
}));

// Global test utilities
global.createMockMongoClient = () => ({
  connect: jest.fn().mockResolvedValue(),
  disconnect: jest.fn().mockResolvedValue(),
  getDb: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
    })
  }),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
});

global.createMockRedisClient = () => ({
  connect: jest.fn().mockResolvedValue(),
  disconnect: jest.fn().mockResolvedValue(),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(-2),
  keys: jest.fn().mockResolvedValue([]),
  publish: jest.fn().mockResolvedValue(1),
  subscribe: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  off: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
});

global.createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  child: jest.fn().mockReturnThis()
});

global.createMockEventEmitter = () => ({
  emit: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  off: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn()
});

// Test data factories
global.createTestEvent = (type, data = {}, overrides = {}) => ({
  id: `evt_${Date.now()}`,
  type,
  data,
  timestamp: new Date().toISOString(),
  source: 'test-service',
  version: '1.0.0',
  ...overrides
});

global.createTestUser = (overrides = {}) => ({
  id: 'test_user_123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  workspaceId: 'test_workspace_123',
  role: 'user',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

global.createTestWorkspace = (overrides = {}) => ({
  id: 'test_workspace_123',
  name: 'Test Workspace',
  slug: 'test-workspace',
  ownerId: 'test_user_123',
  status: 'active',
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Console suppression for cleaner test output
const originalConsole = { ...console };

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});