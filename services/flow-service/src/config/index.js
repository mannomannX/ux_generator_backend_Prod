// ==========================================
// SERVICES/FLOW-SERVICE/src/config/index.js
// ==========================================
const config = {
  port: process.env.FLOW_SERVICE_PORT || 3003,
  
  // Database Configuration
  database: {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  },

  // Flow Configuration
  flows: {
    maxFlowSize: 50 * 1024 * 1024, // 50MB max flow size
    maxVersionsPerFlow: 100,
    cacheExpiryMinutes: 5,
    autoCleanupVersions: true,
    keepVersions: 10, // Keep latest 10 versions by default
  },

  // Validation Configuration
  validation: {
    strictMode: process.env.NODE_ENV === 'production',
    maxNodes: 1000,
    maxEdges: 2000,
    allowExperimentalTypes: process.env.NODE_ENV === 'development',
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
  },
};

export default config;