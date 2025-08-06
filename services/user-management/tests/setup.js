// ==========================================
// services/user-management/tests/setup.js
// ==========================================

import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createClient } from 'redis';

let mongoServer;
let redisClient;

// Setup before all tests
export async function setupTestEnvironment() {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;

  // Start Redis (or mock it)
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.LOG_LEVEL = 'error'; // Minimize logs during tests
}

// Cleanup after all tests
export async function teardownTestEnvironment() {
  if (mongoServer) {
    await mongoServer.stop();
  }
  
  if (redisClient) {
    await redisClient.disconnect();
  }
}

// Setup before each test
export async function setupTest() {
  // Clear all mocks
  jest.clearAllMocks();
}

// Cleanup after each test
export async function cleanupTest() {
  // Clear test data if needed
}