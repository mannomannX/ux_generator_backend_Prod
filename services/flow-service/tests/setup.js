// ==========================================
// Flow Service - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '3003';
process.env.MAX_FLOW_NODES = '1000';
process.env.MAX_FLOW_EDGES = '2000';
process.env.MAX_FLOW_VERSIONS = '100';

// Global test timeout for flow operations
jest.setTimeout(15000);

// Mock UX-Flow common package
jest.mock('@ux-flow/common', () => ({
  Logger: jest.fn().mockImplementation((serviceName) => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn()
  })),
  EventEmitter: jest.fn().mockImplementation((logger, serviceName) => ({
    emit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn()
  })),
  MongoClient: jest.fn().mockImplementation((logger) => ({
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
        countDocuments: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
      })
    }),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
    withTransaction: jest.fn().mockImplementation(async (callback) => {
      const session = {
        commitTransaction: jest.fn(),
        abortTransaction: jest.fn(),
        endSession: jest.fn()
      };
      return await callback(session);
    })
  })),
  RedisClient: jest.fn().mockImplementation((logger) => ({
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
  })),
  EventTypes: {
    FLOW_UPDATE_REQUESTED: 'flow.update.requested',
    FLOW_UPDATED: 'flow.updated',
    FLOW_VERSION_CREATED: 'flow.version.created',
    FLOW_COLLABORATION_EVENT: 'flow.collaboration.event'
  }
}));

// Global test utilities
global.createTestFlow = (overrides = {}) => ({
  id: 'flow_test123',
  projectId: 'proj_test123',
  userId: 'user_test123',
  name: 'Test Flow',
  description: 'A test flow for unit testing',
  metadata: {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  nodes: [
    {
      id: 'start_node',
      type: 'Start',
      position: { x: 100, y: 100 },
      data: { label: 'Start' }
    }
  ],
  edges: [],
  status: 'draft',
  ...overrides
});

global.createTestFlowVersion = (overrides = {}) => ({
  id: 'version_test123',
  flowId: 'flow_test123',
  version: '1.0.0',
  snapshot: global.createTestFlow(),
  changeLog: 'Initial version',
  createdAt: new Date().toISOString(),
  createdBy: 'user_test123',
  ...overrides
});

global.createTestNode = (overrides = {}) => ({
  id: 'node_test123',
  type: 'Screen',
  position: { x: 200, y: 200 },
  data: {
    label: 'Test Screen',
    description: 'A test screen node'
  },
  ...overrides
});

global.createTestEdge = (overrides = {}) => ({
  id: 'edge_test123',
  source: 'node_1',
  target: 'node_2',
  type: 'default',
  data: {
    label: 'Test Connection'
  },
  ...overrides
});

global.createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: { id: 'user_test123', workspaceId: 'workspace_test123' },
  ...overrides
});

global.createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis()
  };
  return res;
};

global.createMockNext = () => jest.fn();

global.createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn()
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Console suppression for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});