// ==========================================
// COMMON - Security Configuration Manager
// ==========================================

/**
 * Centralized security configuration for all services
 */
export class SecurityConfig {
  constructor() {
    this.loadConfiguration();
  }

  loadConfiguration() {
    // Environment-specific security settings
    this.environment = process.env.NODE_ENV || 'development';
    this.isDevelopment = this.environment === 'development';
    this.isProduction = this.environment === 'production';
    
    // JWT Configuration
    this.jwt = {
      secret: this.getRequiredEnv('JWT_SECRET'),
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || 'ux-flow-engine',
      audience: process.env.JWT_AUDIENCE || 'ux-flow-users'
    };

    // Password Policy
    this.password = {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
      maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
      requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
      requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
      requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
    };

    // Rate Limiting
    this.rateLimiting = {
      window: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      authWindow: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW) || 900000, // 15 minutes
      authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'false'
    };

    // Account Security
    this.account = {
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
      lockoutDuration: parseInt(process.env.ACCOUNT_LOCKOUT_DURATION) || 3600000, // 1 hour
      maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER) || 5,
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400000, // 24 hours
      passwordResetTimeout: parseInt(process.env.PASSWORD_RESET_TIMEOUT) || 3600000 // 1 hour
    };

    // CORS Configuration
    this.cors = {
      origins: this.parseArray(process.env.CORS_ORIGINS) || ['http://localhost:3000'],
      methods: this.parseArray(process.env.CORS_METHODS) || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: this.parseArray(process.env.CORS_ALLOWED_HEADERS) || [
        'Content-Type', 'Authorization', 'X-Requested-With'
      ],
      credentials: process.env.CORS_CREDENTIALS !== 'false'
    };

    // Security Headers
    this.headers = {
      hsts: process.env.ENABLE_HSTS !== 'false',
      hstsMaxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000, // 1 year
      csp: process.env.ENABLE_CSP !== 'false',
      cspDirectives: this.parseCSPDirectives(),
      frameOptions: process.env.FRAME_OPTIONS || 'DENY',
      contentTypeOptions: process.env.CONTENT_TYPE_OPTIONS !== 'false'
    };

    // Encryption Configuration
    this.encryption = {
      algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
      keyDerivation: process.env.KEY_DERIVATION || 'pbkdf2',
      iterations: parseInt(process.env.PBKDF2_ITERATIONS) || 100000,
      keyLength: parseInt(process.env.ENCRYPTION_KEY_LENGTH) || 32,
      ivLength: parseInt(process.env.ENCRYPTION_IV_LENGTH) || 16
    };

    // API Security
    this.api = {
      enableApiKeyAuth: process.env.ENABLE_API_KEY_AUTH === 'true',
      apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
      apiKeyPrefix: process.env.API_KEY_PREFIX || 'uxflow_',
      maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
      enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
      logSensitiveData: process.env.LOG_SENSITIVE_DATA === 'true' && this.isDevelopment
    };

    // Input Validation
    this.validation = {
      maxStringLength: parseInt(process.env.MAX_STRING_LENGTH) || 1000,
      maxSearchLength: parseInt(process.env.MAX_SEARCH_LENGTH) || 100,
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
      allowedFileTypes: this.parseArray(process.env.ALLOWED_FILE_TYPES) || [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp'
      ],
      sanitizeHtml: process.env.SANITIZE_HTML !== 'false'
    };

    // Database Security
    this.database = {
      encryptData: process.env.ENCRYPT_CONVERSATIONS !== 'false',
      encryptionKey: process.env.DB_ENCRYPTION_KEY,
      enableQueryLogging: process.env.DB_QUERY_LOGGING === 'true' && this.isDevelopment,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10
    };

    // Redis Security
    this.redis = {
      enableAuth: process.env.REDIS_AUTH !== 'false',
      password: process.env.REDIS_PASSWORD,
      enableTLS: process.env.REDIS_TLS === 'true',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'uxflow:',
      ttl: parseInt(process.env.REDIS_TTL) || 3600 // 1 hour
    };

    // AI Provider Security
    this.aiProviders = {
      enableKeyRotation: process.env.ENABLE_KEY_ROTATION === 'true',
      keyRotationInterval: parseInt(process.env.KEY_ROTATION_INTERVAL) || 86400000, // 24 hours
      maxTokensPerRequest: parseInt(process.env.MAX_TOKENS_PER_REQUEST) || 4000,
      enablePromptFiltering: process.env.ENABLE_PROMPT_FILTERING !== 'false',
      logAIInteractions: process.env.LOG_AI_INTERACTIONS === 'true' && this.isDevelopment
    };

    // Monitoring and Alerting
    this.monitoring = {
      enableSecurityLogging: process.env.ENABLE_SECURITY_LOGGING !== 'false',
      alertThreshold: parseInt(process.env.ALERT_THRESHOLD) || 10,
      alertWindow: parseInt(process.env.ALERT_WINDOW) || 300000, // 5 minutes
      enableRealTimeMonitoring: process.env.ENABLE_REALTIME_MONITORING === 'true'
    };
  }

  /**
   * Get required environment variable or throw error
   */
  getRequiredEnv(key) {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Parse comma-separated array from environment variable
   */
  parseArray(value, delimiter = ',') {
    if (!value) return null;
    return value.split(delimiter).map(item => item.trim()).filter(Boolean);
  }

  /**
   * Parse CSP directives from environment
   */
  parseCSPDirectives() {
    const defaultDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'font-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"]
    };

    const customCSP = process.env.CSP_DIRECTIVES;
    if (customCSP) {
      try {
        const parsed = JSON.parse(customCSP);
        return { ...defaultDirectives, ...parsed };
      } catch (error) {
        console.warn('Invalid CSP_DIRECTIVES JSON, using defaults');
      }
    }

    return defaultDirectives;
  }

  /**
   * Validate configuration on startup
   */
  validate() {
    const errors = [];

    // JWT Secret validation
    if (this.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    // Database encryption key validation
    if (this.database.encryptData && !this.database.encryptionKey) {
      errors.push('DB_ENCRYPTION_KEY is required when ENCRYPT_CONVERSATIONS is enabled');
    }

    // Production-specific validations
    if (this.isProduction) {
      if (this.api.logSensitiveData) {
        errors.push('LOG_SENSITIVE_DATA must not be enabled in production');
      }

      if (!this.headers.hsts) {
        errors.push('HSTS should be enabled in production');
      }

      if (!this.redis.enableAuth && !this.isDevelopment) {
        errors.push('Redis authentication should be enabled in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * Get configuration for specific service
   */
  getServiceConfig(serviceName) {
    const baseConfig = {
      environment: this.environment,
      jwt: this.jwt,
      rateLimiting: this.rateLimiting,
      cors: this.cors,
      headers: this.headers,
      validation: this.validation
    };

    switch (serviceName) {
      case 'api-gateway':
        return {
          ...baseConfig,
          account: this.account,
          api: this.api,
          database: this.database,
          redis: this.redis
        };

      case 'cognitive-core':
        return {
          ...baseConfig,
          aiProviders: this.aiProviders,
          database: this.database,
          redis: this.redis,
          encryption: this.encryption
        };

      case 'billing-service':
        return {
          ...baseConfig,
          database: this.database,
          api: this.api
        };

      case 'user-management':
        return {
          ...baseConfig,
          password: this.password,
          account: this.account,
          database: this.database
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Generate secure configuration summary for logging
   */
  getSummary() {
    return {
      environment: this.environment,
      security: {
        jwtConfigured: !!this.jwt.secret,
        passwordPolicyEnabled: this.password.minLength >= 8,
        rateLimitingEnabled: this.rateLimiting.max > 0,
        corsConfigured: this.cors.origins.length > 0,
        hstsEnabled: this.headers.hsts,
        cspEnabled: this.headers.csp,
        encryptionEnabled: this.database.encryptData,
        redisAuthEnabled: this.redis.enableAuth
      },
      features: {
        apiKeyAuth: this.api.enableApiKeyAuth,
        requestLogging: this.api.enableRequestLogging,
        securityLogging: this.monitoring.enableSecurityLogging,
        promptFiltering: this.aiProviders.enablePromptFiltering
      }
    };
  }
}