// ==========================================
// Knowledge Service - Test Setup
// ==========================================

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ux-flow-engine-test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.PORT = '3002';
process.env.GOOGLE_API_KEY = 'test-google-api-key';
process.env.OPENAI_API_KEY = 'test-openai-api-key';
process.env.CHROMA_HOST = 'localhost';
process.env.CHROMA_PORT = '8000';
process.env.VECTOR_DIMENSION = '768';
process.env.MAX_CHUNK_SIZE = '8000';

// Global test timeout for knowledge operations
jest.setTimeout(20000);

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Test AI response'
        }
      }),
      embedContent: jest.fn().mockResolvedValue({
        embedding: {
          values: Array(768).fill(0.1) // Mock embedding vector
        }
      })
    })
  }))
}));

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{
          embedding: Array(768).fill(0.1) // Mock embedding vector
        }]
      })
    },
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Test OpenAI response'
            }
          }]
        })
      }
    }
  }));
});

// Mock ChromaDB client
jest.mock('chromadb', () => ({
  ChromaApi: jest.fn().mockImplementation(() => ({
    createCollection: jest.fn().mockResolvedValue({
      name: 'test-collection',
      id: 'test-collection-id'
    }),
    getCollection: jest.fn().mockResolvedValue({
      name: 'test-collection',
      add: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue({
        ids: [['doc1', 'doc2']],
        documents: [['Test document 1', 'Test document 2']],
        distances: [[0.1, 0.2]],
        metadatas: [[{}, {}]]
      }),
      update: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValue(10)
    }),
    deleteCollection: jest.fn().mockResolvedValue(true),
    listCollections: jest.fn().mockResolvedValue([
      { name: 'test-collection', id: 'test-collection-id' }
    ])
  })),
  ChromaClient: jest.fn().mockImplementation(() => ({
    createCollection: jest.fn().mockResolvedValue({
      name: 'test-collection',
      id: 'test-collection-id'
    }),
    getCollection: jest.fn().mockResolvedValue({
      name: 'test-collection',
      add: jest.fn().mockResolvedValue(true),
      query: jest.fn().mockResolvedValue({
        ids: [['doc1', 'doc2']],
        documents: [['Test document 1', 'Test document 2']],
        distances: [[0.1, 0.2]],
        metadatas: [[{}, {}]]
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
        createIndex: jest.fn().mockResolvedValue(true),
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
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
    KNOWLEDGE_QUERY_REQUESTED: 'knowledge.query.requested',
    KNOWLEDGE_RESPONSE_READY: 'knowledge.response.ready',
    DOCUMENT_INDEXED: 'document.indexed',
    DOCUMENT_UPDATED: 'document.updated'
  }
}));

// Global test utilities
global.createTestDocument = (overrides = {}) => ({
  id: 'doc_test123',
  title: 'Test Document',
  content: 'This is a test document for knowledge service testing.',
  metadata: {
    type: 'ux-guide',
    tags: ['testing', 'ux'],
    source: 'test-source',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  embedding: Array(768).fill(0.1),
  workspaceId: 'workspace_test123',
  userId: 'user_test123',
  ...overrides
});

global.createTestKnowledgeQuery = (overrides = {}) => ({
  query: 'What are the best UX practices?',
  workspaceId: 'workspace_test123',
  userId: 'user_test123',
  context: {
    projectId: 'proj_test123',
    flowId: 'flow_test123'
  },
  filters: {
    type: 'ux-guide',
    tags: ['ux']
  },
  maxResults: 5,
  ...overrides
});

global.createTestEmbedding = () => Array(768).fill(0).map(() => Math.random() - 0.5);

global.createMockChromaCollection = () => ({
  name: 'test-collection',
  add: jest.fn().mockResolvedValue(true),
  query: jest.fn().mockResolvedValue({
    ids: [['doc1', 'doc2']],
    documents: [['Test document 1', 'Test document 2']],
    distances: [[0.1, 0.2]],
    metadatas: [[{}, {}]]
  }),
  update: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  count: jest.fn().mockResolvedValue(10)
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