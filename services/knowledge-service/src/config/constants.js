/**
 * Centralized Configuration Constants
 * Single source of truth for all configuration values
 */

// Cache Configuration
export const CACHE_CONFIG = {
  TTL: {
    DEFAULT: 3600,           // 1 hour in seconds
    EMBEDDINGS: 86400,       // 24 hours for embeddings
    SEARCH_RESULTS: 1800,    // 30 minutes for search results
    DOCUMENTS: 7200,         // 2 hours for documents
    METADATA: 3600,          // 1 hour for metadata
  },
  MAX_SIZE: {
    MEMORY: 100,            // Maximum items in memory cache
    REDIS: 10000,           // Maximum items in Redis cache
  },
  KEY_PREFIX: {
    EMBEDDING: 'emb:',
    SEARCH: 'search:',
    DOCUMENT: 'doc:',
    KNOWLEDGE: 'know:',
    COLLECTION: 'coll:',
  }
};

// Batch Processing Configuration
export const BATCH_CONFIG = {
  MAX_SIZE: {
    EMBEDDINGS: 100,        // Maximum embeddings per batch
    DOCUMENTS: 50,          // Maximum documents per batch
    SEARCH: 20,             // Maximum search queries per batch
    CHUNKS: 100,            // Maximum chunks per batch
  },
  TIMEOUT: {
    EMBEDDING: 30000,       // 30 seconds for embedding generation
    PROCESSING: 60000,      // 60 seconds for document processing
    SEARCH: 15000,          // 15 seconds for search operations
  }
};

// RAG Configuration
export const RAG_CONFIG = {
  SEARCH: {
    TOP_K: 10,              // Retrieve top 10 candidates
    FINAL_K: 5,             // Return top 5 after re-ranking
    MIN_RELEVANCE: 0.7,     // Minimum relevance score
    MAX_CONTEXT_TOKENS: 8000, // Maximum context size
  },
  CHUNKING: {
    SIZE: 1000,             // Characters per chunk
    OVERLAP: 200,           // Overlap between chunks
    MIN_SIZE: 100,          // Minimum chunk size
    MAX_SIZE: 2000,         // Maximum chunk size
  },
  HYBRID_SEARCH_WEIGHT: {
    VECTOR: 0.7,            // Weight for vector search
    KEYWORD: 0.3,           // Weight for keyword search
  }
};

// Embedding Configuration
export const EMBEDDING_CONFIG = {
  DIMENSION: {
    OPENAI_ADA: 1536,
    OPENAI_SMALL: 1536,
    OPENAI_LARGE: 3072,
    GOOGLE: 768,
    LOCAL: 384,
  },
  PROVIDERS: {
    OPENAI: {
      MODELS: ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'],
      RATE_LIMIT: 3000,     // Requests per minute
      BATCH_SIZE: 100,
      TIMEOUT: 30000,
    },
    GOOGLE: {
      MODELS: ['embedding-001'],
      RATE_LIMIT: 1000,
      BATCH_SIZE: 50,
      TIMEOUT: 30000,
    },
    LOCAL: {
      DIMENSION: 384,
      ALGORITHM: 'sha256',
    }
  },
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000,            // Base delay in ms
    MAX_DELAY: 10000,       // Maximum delay in ms
  }
};

// ChromaDB Configuration
export const CHROMADB_CONFIG = {
  CONNECTION: {
    DEFAULT_HOST: 'localhost',
    DEFAULT_PORT: 8000,
    SSL: false,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    CONNECTION_TIMEOUT: 5000,
  },
  COLLECTIONS: {
    GLOBAL: 'global_knowledge',
    WORKSPACE_PREFIX: 'workspace_',
    PROJECT_PREFIX: 'project_',
    DEFAULT_METADATA: {
      type: 'knowledge_base',
    }
  }
};

// Security Configuration
export const SECURITY_CONFIG = {
  VECTOR: {
    MAX_DIMENSION: 4096,
    MIN_DIMENSION: 100,
    MAX_METADATA_SIZE: 10240,  // 10KB
    ALLOWED_METADATA_KEYS: [
      'documentId', 'chunkId', 'source', 'type', 
      'workspaceId', 'projectId', 'createdAt', 'updatedAt'
    ],
  },
  SANITIZATION: {
    MAX_INPUT_LENGTH: 50000,
    STRIP_SCRIPTS: true,
    STRIP_HTML: true,
    NORMALIZE_WHITESPACE: true,
  },
  RATE_LIMITING: {
    SEARCH: {
      MAX_PER_MINUTE: 60,
      MAX_PER_HOUR: 1000,
    },
    EMBEDDING: {
      MAX_PER_MINUTE: 30,
      MAX_PER_HOUR: 500,
    }
  }
};

// Database Configuration
export const DATABASE_CONFIG = {
  MONGODB: {
    COLLECTIONS: {
      KNOWLEDGE: 'knowledge_base',
      DOCUMENTS: 'documents',
      QUERIES: 'search_queries',
      EMBEDDINGS_CACHE: 'embeddings_cache',
      AUDIT_LOG: 'knowledge_audit',
    },
    INDEXES: {
      COMPOUND: [
        { workspaceId: 1, type: 1 },
        { workspaceId: 1, projectId: 1 },
        { 'metadata.tags': 1 },
      ],
      TEXT: ['content', 'title', 'description'],
      TTL: { createdAt: 1 },
    }
  },
  REDIS: {
    KEY_PATTERNS: {
      CACHE: 'knowledge:cache:',
      LOCK: 'knowledge:lock:',
      RATE_LIMIT: 'knowledge:ratelimit:',
      SESSION: 'knowledge:session:',
    },
    TTL: {
      CACHE: 3600,
      LOCK: 30,
      RATE_LIMIT: 60,
      SESSION: 86400,
    }
  }
};

// Performance Configuration
export const PERFORMANCE_CONFIG = {
  TIMEOUTS: {
    SEARCH: 10000,          // 10 seconds
    EMBEDDING: 30000,       // 30 seconds
    PROCESSING: 60000,      // 60 seconds
    DATABASE: 5000,         // 5 seconds
  },
  LIMITS: {
    MAX_CONCURRENT_OPERATIONS: 10,
    MAX_QUEUE_SIZE: 1000,
    MAX_MEMORY_USAGE: 512 * 1024 * 1024, // 512MB
  },
  MONITORING: {
    HEALTH_CHECK_INTERVAL: 30000,  // 30 seconds
    METRICS_INTERVAL: 60000,       // 1 minute
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  }
};

// Error Messages
export const ERROR_MESSAGES = {
  VECTOR: {
    INVALID_DIMENSION: 'Invalid vector dimension',
    INVALID_VALUES: 'Vector contains invalid values',
    DIMENSION_MISMATCH: 'Vector dimension mismatch',
  },
  EMBEDDING: {
    GENERATION_FAILED: 'Failed to generate embedding',
    PROVIDER_UNAVAILABLE: 'Embedding provider unavailable',
    RATE_LIMIT_EXCEEDED: 'Embedding rate limit exceeded',
  },
  SEARCH: {
    QUERY_TOO_LONG: 'Search query exceeds maximum length',
    NO_RESULTS: 'No results found',
    TIMEOUT: 'Search operation timed out',
  },
  DATABASE: {
    CONNECTION_FAILED: 'Database connection failed',
    OPERATION_FAILED: 'Database operation failed',
    TRANSACTION_FAILED: 'Database transaction failed',
  }
};

// Export all configurations as a single object for convenience
export const CONFIG = {
  CACHE: CACHE_CONFIG,
  BATCH: BATCH_CONFIG,
  RAG: RAG_CONFIG,
  EMBEDDING: EMBEDDING_CONFIG,
  CHROMADB: CHROMADB_CONFIG,
  SECURITY: SECURITY_CONFIG,
  DATABASE: DATABASE_CONFIG,
  PERFORMANCE: PERFORMANCE_CONFIG,
  ERRORS: ERROR_MESSAGES,
};

export default CONFIG;