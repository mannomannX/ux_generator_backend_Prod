// ==========================================
// COGNITIVE CORE SERVICE - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.GOOGLE_API_KEY = 'test-api-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret';

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => '{"test": "response"}'
        }
      })
    })
  }))
}));

// Mock UX-Flow common package
jest.mock('@ux-flow/common', () => ({
  Logger: jest.fn().mockImplementation((serviceName) => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logAgentAction: jest.fn()
  })),
  EventEmitter: jest.fn().mockImplementation((logger, serviceName) => ({
    emit: jest.fn(),
    on: jest.fn(),
    emitAgentTaskStarted: jest.fn(),
    emitAgentTaskCompleted: jest.fn()
  })),
  MongoClient: jest.fn().mockImplementation((logger) => ({
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
    insertDocument: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
    findDocument: jest.fn().mockResolvedValue(null),
    updateDocument: jest.fn().mockResolvedValue({ modifiedCount: 1 })
  })),
  RedisClient: jest.fn().mockImplementation((logger) => ({
    connect: jest.fn().mockResolvedValue(),
    disconnect: jest.fn().mockResolvedValue(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue()
  })),
  RetryUtils: {
    retryApiCall: jest.fn().mockImplementation(async (fn) => await fn())
  },
  EventTypes: {
    AGENT_TASK_STARTED: 'agent.task.started',
    AGENT_TASK_COMPLETED: 'agent.task.completed',
    AGENT_TASK_FAILED: 'agent.task.failed',
    USER_MESSAGE_RECEIVED: 'user.message.received',
    USER_RESPONSE_READY: 'user.response.ready'
  }
}));

// Global test utilities
global.createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logAgentAction: jest.fn()
});

global.createMockEventEmitter = () => ({
  emit: jest.fn(),
  on: jest.fn(),
  emitAgentTaskStarted: jest.fn(),
  emitAgentTaskCompleted: jest.fn()
});

global.createMockContext = () => ({
  logger: global.createMockLogger(),
  eventEmitter: global.createMockEventEmitter(),
  mongoClient: {
    connect: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' })
  },
  redisClient: {
    connect: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok' })
  },
  models: {
    standard: {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => '{"test": "response"}'
        }
      })
    },
    pro: {
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => '{"test": "response"}'
        }
      })
    }
  }
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

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});