// ==========================================
// Integration Tests - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-integration-test';
process.env.REDIS_URL = 'redis://localhost:6379/2'; // Different DB for integration tests

// Service ports for integration testing
process.env.API_GATEWAY_PORT = '3000';
process.env.COGNITIVE_CORE_PORT = '3001';
process.env.KNOWLEDGE_SERVICE_PORT = '3002';
process.env.FLOW_SERVICE_PORT = '3003';
process.env.BILLING_SERVICE_PORT = '3004';
process.env.USER_MANAGEMENT_PORT = '3005';

// External service test configs
process.env.GOOGLE_API_KEY = 'test-google-api-key-integration';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_integration_key';
process.env.CHROMA_HOST = 'localhost';
process.env.CHROMA_PORT = '8001'; // Different port for integration tests

// Extended timeout for integration tests
jest.setTimeout(60000);

// Mock external dependencies that shouldn't be called in integration tests
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'create_flow',
            confidence: 0.95,
            entities: ['login', 'dashboard'],
            response: 'Integration test AI response'
          })
        }
      }),
      embedContent: jest.fn().mockResolvedValue({
        embedding: {
          values: Array(768).fill(0.1)
        }
      })
    })
  }))
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_integration_test' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_integration_test' })
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({ 
        id: 'sub_integration_test', 
        status: 'active' 
      })
    }
  }));
});

jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    createCollection: jest.fn().mockResolvedValue({
      name: 'integration-test-collection',
      add: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue({
        ids: [['doc1']],
        documents: [['Integration test document']],
        distances: [[0.1]],
        metadatas: [[{ source: 'integration-test' }]]
      })
    })
  }))
}));

// Global test utilities for integration tests
global.createIntegrationTestUser = (overrides = {}) => ({
  id: 'integration_user_123',
  email: 'integration.test@example.com',
  firstName: 'Integration',
  lastName: 'Test',
  displayName: 'Integration Test User',
  workspaceId: 'integration_workspace_123',
  role: 'user',
  status: 'active',
  emailVerified: true,
  ...overrides
});

global.createIntegrationTestProject = (overrides = {}) => ({
  id: 'integration_project_123',
  name: 'Integration Test Project',
  description: 'A project for integration testing',
  ownerId: 'integration_user_123',
  workspaceId: 'integration_workspace_123',
  status: 'active',
  createdAt: new Date().toISOString(),
  ...overrides
});

global.createIntegrationTestFlow = (overrides = {}) => ({
  id: 'integration_flow_123',
  projectId: 'integration_project_123',
  name: 'Integration Test Flow',
  description: 'A flow for integration testing',
  nodes: [
    {
      id: 'start_node',
      type: 'Start',
      position: { x: 100, y: 100 },
      data: { label: 'Start' }
    },
    {
      id: 'screen_node',
      type: 'Screen',
      position: { x: 300, y: 100 },
      data: { label: 'Login Screen', description: 'User login interface' }
    }
  ],
  edges: [
    {
      id: 'edge_1',
      source: 'start_node',
      target: 'screen_node',
      type: 'default'
    }
  ],
  ...overrides
});

global.waitFor = (condition, timeout = 5000) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
};

global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// Suppress console output for cleaner integration test runs
const originalConsole = { ...console };

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});