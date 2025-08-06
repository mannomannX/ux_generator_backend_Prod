// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/config/index.js
// ==========================================
const config = {
  port: process.env.KNOWLEDGE_SERVICE_PORT || 3002,
  
  // Database Configuration
  database: {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  },

  // ChromaDB Configuration
  chromadb: {
    url: process.env.CHROMADB_URL || 'http://localhost:8000',
    timeout: 30000,
    retryAttempts: 3,
  },

  // Knowledge Configuration
  knowledge: {
    maxDocumentSize: 10 * 1024 * 1024, // 10MB max document size
    chunkSize: 500, // Characters per chunk
    maxChunksPerDocument: 1000,
    cacheExpiryMinutes: 30,
  },

  // Search Configuration
  search: {
    defaultResultCount: 5,
    maxResultCount: 50,
    relevanceThreshold: 0.1, // Minimum relevance score
    globalKnowledgeWeight: 0.6,
    workspaceKnowledgeWeight: 0.3,
    projectKnowledgeWeight: 0.1,
  },

  // Collection Configuration
  collections: {
    globalCollection: 'ux_global_knowledge',
    workspacePrefix: 'workspace_',
    projectPrefix: 'project_',
    maxCollections: 1000, // Safety limit
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    structuredFormat: process.env.NODE_ENV === 'production',
  },

  // Performance Configuration
  performance: {
    enableCaching: true,
    batchOperations: true,
    maxBatchSize: 100,
    collectionCacheSize: 50,
  },
};

export default config;