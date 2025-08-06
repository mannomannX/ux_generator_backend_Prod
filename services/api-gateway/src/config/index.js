// ==========================================
// SERVICES/API-GATEWAY/src/config/index.js
// ==========================================

export default {
  port: process.env.API_GATEWAY_PORT || 3000,
  
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  services: {
    cognitiveCore: process.env.COGNITIVE_CORE_URL || 'http://localhost:3001',
    flowService: process.env.FLOW_SERVICE_URL || 'http://localhost:3003',
    knowledgeService: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3002',
    userManagement: process.env.USER_MANAGEMENT_URL || 'http://localhost:3004',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: {
      session: 86400, // 24 hours
      cache: 3600, // 1 hour
      rateLimit: 60, // 1 minute
    },
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    },
  },
  
  websocket: {
    heartbeatInterval: 30000,
    heartbeatTimeout: 60000,
    maxConnections: 1000,
    messageRateLimit: 100, // messages per minute
  },
  
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000, // 15 minutes
  },
  
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    grafanaEnabled: process.env.GRAFANA_ENABLED === 'true',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || false,
  },
};