// ==========================================
// API Gateway Service - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '3000';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.RATE_LIMIT_WINDOW = '900000'; // 15 minutes
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';

// Global test timeout for gateway operations
jest.setTimeout(20000);

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
          toArray: jest.fn().mockResolvedValue([])
        }),
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
      })
    }),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
  })),
  RedisClient: jest.fn().mockImplementation((logger) => ({
    connect: jest.fn().mockResolvedValue(true),
    disconnect: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
  })),
  EventTypes: {
    USER_MESSAGE_RECEIVED: 'user.message.received',
    USER_RESPONSE_READY: 'user.response.ready',
    WEBSOCKET_CONNECTION_ESTABLISHED: 'websocket.connection.established',
    WEBSOCKET_CONNECTION_CLOSED: 'websocket.connection.closed'
  }
}));

// Mock WebSocket for testing
global.MockWebSocket = class MockWebSocket {
  constructor() {
    this.readyState = 1; // OPEN
    this.send = jest.fn();
    this.close = jest.fn();
    this.addEventListener = jest.fn();
    this.removeEventListener = jest.fn();
  }
};

// Global test utilities
global.createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
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