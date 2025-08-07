// ==========================================
// SERVICES/API-GATEWAY/src/config/index.js
// ==========================================

import crypto from 'crypto';

// Validate and generate secure secrets
const validateSecrets = () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be set with at least 32 characters in production');
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
      throw new Error('JWT_REFRESH_SECRET must be set with at least 32 characters in production');
    }
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters in production');
    }
  }
  
  return {
    jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    refreshSecret: process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex'),
    encryptionKey: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
  };
};

const secrets = validateSecrets();

// Validate CORS origins
const getCorsOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    const origins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
    if (!origins || origins.length === 0) {
      throw new Error('ALLOWED_ORIGINS must be set in production');
    }
    return origins;
  }
  return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
};

export default {
  port: process.env.API_GATEWAY_PORT || 3000,
  environment: process.env.NODE_ENV || 'development',
  
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 86400 // 24 hours
  },
  
  rateLimit: {
    // Global rate limiting
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: 60
      }
    },
    // Endpoint-specific limits
    endpoints: {
      auth: {
        login: { windowMs: 900000, max: 5 }, // 5 attempts per 15 minutes
        register: { windowMs: 3600000, max: 10 }, // 10 per hour
        resetPassword: { windowMs: 3600000, max: 3 } // 3 per hour
      },
      api: {
        chat: { windowMs: 60000, max: 30 }, // 30 messages per minute
        generate: { windowMs: 60000, max: 10 }, // 10 generations per minute
        export: { windowMs: 300000, max: 5 } // 5 exports per 5 minutes
      },
      webhook: {
        stripe: { windowMs: 1000, max: 50 } // 50 per second
      }
    }
  },
  
  jwt: {
    secret: secrets.jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: secrets.refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    algorithm: 'HS512',
    issuer: 'ux-flow-engine',
    audience: 'ux-flow-users'
  },
  
  services: {
    cognitiveCore: process.env.COGNITIVE_CORE_URL || 'http://localhost:3001',
    flowService: process.env.FLOW_SERVICE_URL || 'http://localhost:3003',
    knowledgeService: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3002',
    userManagement: process.env.USER_MANAGEMENT_URL || 'http://localhost:3004',
    billingService: process.env.BILLING_SERVICE_URL || 'http://localhost:3005',
    timeout: parseInt(process.env.SERVICE_TIMEOUT) || 30000, // 30 seconds
    retries: parseInt(process.env.SERVICE_RETRIES) || 3
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: 'uxflow:',
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,
    ttl: {
      session: 86400, // 24 hours
      cache: 3600, // 1 hour
      rateLimit: 60, // 1 minute
      lock: 30, // 30 seconds
      verification: 3600 // 1 hour
    }
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    options: {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority'
    }
  },
  
  websocket: {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 1e6, // 1MB
    perMessageDeflate: {
      threshold: 1024
    },
    httpCompression: true,
    cors: {
      origin: getCorsOrigins(),
      credentials: true
    },
    allowEIO3: true,
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
    messageRateLimit: 100 // messages per minute per connection
  },
  
  security: {
    encryption: {
      algorithm: 'aes-256-gcm',
      key: secrets.encryptionKey,
      saltRounds: 12
    },
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000, // 15 minutes
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400000, // 24 hours
    csrfEnabled: process.env.NODE_ENV === 'production',
    csrfSecret: process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex'),
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' }
    }
  },
  
  validation: {
    maxRequestSize: '10mb',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    sanitization: {
      stripTags: true,
      escapHtml: true,
      trimStrings: true,
      normalizeEmail: true
    }
  },
  
  circuitBreaker: {
    enabled: process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 10
  },
  
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9090,
    grafanaEnabled: process.env.GRAFANA_ENABLED === 'true',
    healthCheckInterval: 30000,
    metrics: {
      requestDuration: true,
      requestCount: true,
      errorRate: true,
      activeConnections: true
    }
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || false,
    maxSize: '10m',
    maxFiles: 5,
    colorize: process.env.NODE_ENV !== 'production',
    timestamp: true,
    prettyPrint: process.env.NODE_ENV !== 'production'
  }
};