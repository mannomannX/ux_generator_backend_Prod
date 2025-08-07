// ==========================================
// Billing Service - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '3004';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_webhook_secret';
process.env.BILLING_WEBHOOK_SECRET = 'test-billing-webhook-secret';

// Global test timeout for billing operations
jest.setTimeout(15000);

// Mock Stripe SDK
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      update: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
      del: jest.fn().mockResolvedValue({ deleted: true })
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
      update: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
      cancel: jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' })
    },
    invoices: {
      create: jest.fn().mockResolvedValue({ id: 'in_test123' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'in_test123' })
    },
    paymentMethods: {
      create: jest.fn().mockResolvedValue({ id: 'pm_test123' }),
      attach: jest.fn().mockResolvedValue({ id: 'pm_test123' })
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        id: 'evt_test123',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_test123' } }
      })
    }
  }));
});

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
    healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' })
  })),
  EventTypes: {
    BILLING_EVENT: 'billing.event',
    SUBSCRIPTION_UPDATED: 'subscription.updated',
    CREDIT_CONSUMED: 'credit.consumed'
  }
}));

// Global test utilities
global.createTestCustomer = (overrides = {}) => ({
  id: 'cus_test123',
  email: 'test@example.com',
  name: 'Test Customer',
  created: Math.floor(Date.now() / 1000),
  ...overrides
});

global.createTestSubscription = (overrides = {}) => ({
  id: 'sub_test123',
  customer: 'cus_test123',
  status: 'active',
  current_period_start: Math.floor(Date.now() / 1000),
  current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
  ...overrides
});

global.createTestInvoice = (overrides = {}) => ({
  id: 'in_test123',
  customer: 'cus_test123',
  amount_paid: 2000, // $20.00
  currency: 'usd',
  status: 'paid',
  ...overrides
});

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