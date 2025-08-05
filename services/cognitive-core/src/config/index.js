// ==========================================
// SERVICES/COGNITIVE-CORE/src/config/index.js
// ==========================================
const config = {
  port: process.env.COGNITIVE_CORE_PORT || 3001,
  
  // Google Gemini Configuration
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    models: {
      standard: "gemini-1.5-flash-latest",
      pro: "gemini-1.5-pro-latest",
    },
  },

  // Database Configuration
  database: {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  },

  // Agent Configuration
  agents: {
    defaultQualityMode: 'standard',
    retryAttempts: 2,
    timeoutMs: 30000,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    structuredFormat: process.env.NODE_ENV === 'production',
  },
};

export default config;