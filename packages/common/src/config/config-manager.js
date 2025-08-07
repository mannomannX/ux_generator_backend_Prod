// ==========================================
// COMMON - Configuration Manager
// Centralized configuration with validation and types
// ==========================================

import fs from 'fs';
import path from 'path';

export class ConfigManager {
  constructor() {
    this.config = {};
    this.validationErrors = [];
    this.requiredVars = new Set();
    this.validators = new Map();
    this.defaults = new Map();
    
    this.initialize();
  }

  /**
   * Initialize configuration
   */
  initialize() {
    // Load environment variables
    this.loadEnvironment();
    
    // Define configuration schema
    this.defineSchema();
    
    // Validate configuration
    this.validate();
    
    // Parse and transform values
    this.parseValues();
  }

  /**
   * Load environment variables from .env file
   */
  loadEnvironment() {
    const envPath = path.join(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      const lines = envFile.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          
          if (key && value !== undefined) {
            process.env[key.trim()] = value.trim();
          }
        }
      }
    }
  }

  /**
   * Define configuration schema with validation
   */
  defineSchema() {
    // Core Configuration
    this.define('NODE_ENV', {
      type: 'string',
      required: true,
      default: 'development',
      validator: (value) => ['development', 'staging', 'production', 'test'].includes(value)
    });

    this.define('BASE_URL', {
      type: 'string',
      required: true,
      validator: (value) => value.startsWith('http')
    });

    this.define('FRONTEND_URL', {
      type: 'string',
      required: true,
      validator: (value) => value.startsWith('http')
    });

    this.define('LOG_LEVEL', {
      type: 'string',
      default: 'info',
      validator: (value) => ['error', 'warn', 'info', 'debug', 'trace'].includes(value)
    });

    // Service Ports
    this.define('API_GATEWAY_PORT', { type: 'number', default: 3000 });
    this.define('COGNITIVE_CORE_PORT', { type: 'number', default: 3001 });
    this.define('KNOWLEDGE_SERVICE_PORT', { type: 'number', default: 3002 });
    this.define('FLOW_SERVICE_PORT', { type: 'number', default: 3003 });
    this.define('USER_MANAGEMENT_PORT', { type: 'number', default: 3004 });
    this.define('BILLING_SERVICE_PORT', { type: 'number', default: 3005 });

    // Database Configuration
    this.define('MONGODB_URI', {
      type: 'string',
      required: true,
      validator: (value) => value.startsWith('mongodb://')
    });

    this.define('MONGODB_POOL_SIZE', { type: 'number', default: 10 });
    this.define('MONGODB_TIMEOUT', { type: 'number', default: 30000 });

    this.define('REDIS_URL', {
      type: 'string',
      required: true,
      validator: (value) => value.startsWith('redis://')
    });

    this.define('REDIS_PASSWORD', { type: 'string' });
    this.define('REDIS_DB', { type: 'number', default: 0 });
    this.define('REDIS_POOL_SIZE', { type: 'number', default: 10 });

    this.define('CHROMADB_URL', { type: 'string', default: 'http://localhost:8000' });
    this.define('CHROMADB_AUTH_TOKEN', { type: 'string' });

    // AI Providers
    this.define('GOOGLE_API_KEY', {
      type: 'string',
      required: true,
      sensitive: true,
      validator: (value) => value && value.length > 10
    });

    this.define('OPENAI_API_KEY', {
      type: 'string',
      sensitive: true,
      validator: (value) => !value || value.startsWith('sk-')
    });

    this.define('ANTHROPIC_API_KEY', {
      type: 'string',
      sensitive: true,
      validator: (value) => !value || value.startsWith('sk-ant-')
    });

    // Security Configuration
    this.define('JWT_SECRET', {
      type: 'string',
      required: true,
      sensitive: true,
      validator: (value) => value && value.length >= 32
    });

    this.define('JWT_REFRESH_SECRET', {
      type: 'string',
      required: true,
      sensitive: true,
      validator: (value) => value && value.length >= 32
    });

    this.define('JWT_ACCESS_EXPIRY', { type: 'string', default: '15m' });
    this.define('JWT_REFRESH_EXPIRY', { type: 'string', default: '7d' });

    this.define('ENCRYPTION_KEY', {
      type: 'string',
      required: true,
      sensitive: true,
      validator: (value) => value && value.length === 32
    });

    this.define('LEARNING_SALT', {
      type: 'string',
      required: true,
      sensitive: true,
      validator: (value) => value && value.length >= 16
    });

    this.define('INTERNAL_SERVICE_KEY', {
      type: 'string',
      required: true,
      sensitive: true
    });

    this.define('API_GATEWAY_SECRET', {
      type: 'string',
      required: true,
      sensitive: true
    });

    // SAML Configuration
    this.define('SAML_PRIVATE_KEY', { type: 'string', sensitive: true });
    this.define('SAML_CERTIFICATE', { type: 'string', sensitive: true });

    // Enterprise Limits
    this.define('ENTERPRISE_AI_LIMIT', { type: 'number', default: 10000 });
    this.define('ENTERPRISE_DATA_LIMIT', { type: 'number', default: 1000000 });
    this.define('ENTERPRISE_WS_MSG_LIMIT', { type: 'number', default: 1000 });
    this.define('ENTERPRISE_WS_CONN_LIMIT', { type: 'number', default: 100 });
    this.define('ENTERPRISE_DAILY_AI_LIMIT', { type: 'number', default: 1000.0 });
    this.define('ENTERPRISE_MONTHLY_AI_LIMIT', { type: 'number', default: 10000.0 });

    // External Services
    this.define('AWS_ACCESS_KEY_ID', { type: 'string', sensitive: true });
    this.define('AWS_SECRET_ACCESS_KEY', { type: 'string', sensitive: true });
    this.define('AWS_REGION', { type: 'string', default: 'us-east-1' });
    this.define('SES_FROM_EMAIL', { type: 'string' });
    this.define('SES_FROM_NAME', { type: 'string', default: 'UX Flow Engine' });

    this.define('STRIPE_PUBLISHABLE_KEY', { type: 'string', sensitive: true });
    this.define('STRIPE_SECRET_KEY', { type: 'string', sensitive: true });
    this.define('STRIPE_WEBHOOK_SECRET', { type: 'string', sensitive: true });

    this.define('CLOUDFLARE_API_TOKEN', { type: 'string', sensitive: true });
    this.define('CLOUDFLARE_ZONE_ID', { type: 'string' });

    // Monitoring & Logging
    this.define('ELASTICSEARCH_URL', { type: 'string', default: 'http://localhost:9200' });
    this.define('ELASTICSEARCH_USER', { type: 'string', default: 'elastic' });
    this.define('ELASTICSEARCH_PASSWORD', { type: 'string', sensitive: true, default: 'changeme' });
    this.define('LOG_INDEX', { type: 'string', default: 'ux-flow-engine' });

    this.define('OTEL_EXPORTER_OTLP_ENDPOINT', { type: 'string' });
    this.define('OTEL_SERVICE_NAME', { type: 'string', default: 'ux-flow-engine' });
    this.define('OTEL_RESOURCE_ATTRIBUTES', { type: 'string' });

    this.define('SENTRY_DSN', { type: 'string', sensitive: true });

    // Feature Flags
    this.define('LEARNING_SYSTEM_ENABLED', { type: 'boolean', default: true });
    this.define('LEARNING_RETENTION_DAYS', { type: 'number', default: 90 });
    this.define('LEARNING_MIN_FEEDBACK_SAMPLES', { type: 'number', default: 10 });

    this.define('ANALYTICS_ENABLED', { type: 'boolean', default: true });
    this.define('ANALYTICS_PROVIDER', { type: 'string', default: 'mixpanel' });
    this.define('MIXPANEL_PROJECT_TOKEN', { type: 'string', sensitive: true });

    this.define('REAL_TIME_COLLABORATION', { type: 'boolean', default: true });
    this.define('OPERATIONAL_TRANSFORMATION', { type: 'boolean', default: true });
    this.define('BUSINESS_RULES_ENGINE', { type: 'boolean', default: true });
    this.define('TEMPLATE_SYSTEM', { type: 'boolean', default: true });
    this.define('WORKFLOW_AUTOMATION', { type: 'boolean', default: false });

    // Flow Engine Configuration
    this.define('FLOW_MAX_NODES', { type: 'number', default: 1000 });
    this.define('FLOW_MAX_EDGES', { type: 'number', default: 2000 });
    this.define('FLOW_MAX_FLOW_SIZE', { type: 'number', default: 10485760 });

    this.define('TEMPLATE_CACHE_TTL', { type: 'number', default: 3600 });
    this.define('TEMPLATE_MAX_SIZE', { type: 'number', default: 5242880 });

    this.define('VALIDATION_STRICT_MODE', { type: 'boolean', default: false });
    this.define('CUSTOM_RULES_ENABLED', { type: 'boolean', default: true });

    // Knowledge Service
    this.define('EMBEDDING_DEFAULT_PROVIDER', { type: 'string', default: 'openai' });
    this.define('EMBEDDING_DEFAULT_MODEL', { type: 'string', default: 'text-embedding-3-small' });
    this.define('EMBEDDING_CACHE_TTL', { type: 'number', default: 2592000 });

    this.define('RAG_TOP_K', { type: 'number', default: 10 });
    this.define('RAG_FINAL_K', { type: 'number', default: 5 });
    this.define('RAG_MIN_RELEVANCE_SCORE', { type: 'number', default: 0.7 });
    this.define('RAG_MAX_CONTEXT_TOKENS', { type: 'number', default: 8000 });

    this.define('TEXT_CHUNK_SIZE', { type: 'number', default: 1000 });
    this.define('TEXT_CHUNK_OVERLAP', { type: 'number', default: 200 });

    // User & Workspace Limits
    this.define('FREE_TIER_USERS', { type: 'number', default: 10 });
    this.define('FREE_TIER_PROJECTS', { type: 'number', default: 5 });
    this.define('FREE_TIER_AI_REQUESTS', { type: 'number', default: 10 });
    this.define('FREE_TIER_DATA_OPERATIONS', { type: 'number', default: 1000 });

    this.define('PRO_TIER_USERS', { type: 'number', default: 100 });
    this.define('PRO_TIER_PROJECTS', { type: 'number', default: 50 });
    this.define('PRO_TIER_AI_REQUESTS', { type: 'number', default: 100 });
    this.define('PRO_TIER_DATA_OPERATIONS', { type: 'number', default: 10000 });

    this.define('MAX_CONCURRENT_SESSIONS', { type: 'number', default: 5 });
    this.define('SESSION_CLEANUP_INTERVAL', { type: 'number', default: 3600000 });

    // CORS & Security
    this.define('ALLOWED_ORIGINS', { type: 'string', default: 'http://localhost:3000' });
    this.define('CORS_CREDENTIALS', { type: 'boolean', default: true });
    this.define('CORS_MAX_AGE', { type: 'number', default: 86400 });

    this.define('SECURITY_HSTS_MAX_AGE', { type: 'number', default: 31536000 });
    this.define('SECURITY_HSTS_INCLUDE_SUBDOMAINS', { type: 'boolean', default: true });
    this.define('SECURITY_HSTS_PRELOAD', { type: 'boolean', default: true });

    // Development & Testing
    this.define('DEBUG_MODE', { type: 'boolean', default: false });
    this.define('VERBOSE_LOGGING', { type: 'boolean', default: false });

    this.define('TEST_DATABASE_URI', { type: 'string' });
    this.define('TEST_REDIS_URL', { type: 'string' });

    this.define('LOAD_SAMPLE_DATA', { type: 'boolean', default: false });
    this.define('SEED_ADMIN_EMAIL', { type: 'string' });
    this.define('SEED_ADMIN_PASSWORD', { type: 'string', sensitive: true });

    // Performance Configuration
    this.define('CACHE_DEFAULT_TTL', { type: 'number', default: 3600 });
    this.define('CACHE_MAX_MEMORY', { type: 'string', default: '256mb' });
    this.define('CACHE_EVICTION_POLICY', { type: 'string', default: 'allkeys-lru' });

    this.define('DB_CONNECTION_POOL_SIZE', { type: 'number', default: 10 });
    this.define('REDIS_CONNECTION_POOL_SIZE', { type: 'number', default: 10 });
    this.define('HTTP_KEEP_ALIVE_TIMEOUT', { type: 'number', default: 5000 });

    this.define('REQUEST_TIMEOUT', { type: 'number', default: 30000 });
    this.define('REQUEST_SIZE_LIMIT', { type: 'string', default: '10mb' });
    this.define('PAYLOAD_SIZE_LIMIT', { type: 'string', default: '1mb' });

    // Health Check Configuration
    this.define('HEALTH_CHECK_INTERVAL', { type: 'number', default: 30000 });
    this.define('HEALTH_CHECK_TIMEOUT', { type: 'number', default: 5000 });
    this.define('HEALTH_CHECK_RETRIES', { type: 'number', default: 3 });
    this.define('GRACEFUL_SHUTDOWN_TIMEOUT', { type: 'number', default: 30000 });
  }

  /**
   * Define a configuration variable
   */
  define(key, options = {}) {
    const {
      type = 'string',
      required = false,
      default: defaultValue,
      validator,
      sensitive = false,
      description
    } = options;

    if (required) {
      this.requiredVars.add(key);
    }

    if (defaultValue !== undefined) {
      this.defaults.set(key, defaultValue);
    }

    if (validator) {
      this.validators.set(key, validator);
    }

    // Store metadata
    this.config[key] = {
      type,
      required,
      sensitive,
      description,
      value: null
    };
  }

  /**
   * Validate configuration
   */
  validate() {
    this.validationErrors = [];

    // Check required variables
    for (const key of this.requiredVars) {
      const value = process.env[key];
      
      if (value === undefined || value === '') {
        const defaultValue = this.defaults.get(key);
        
        if (defaultValue === undefined) {
          this.validationErrors.push(`Required environment variable ${key} is missing`);
        }
      }
    }

    // Run custom validators
    for (const [key, validator] of this.validators) {
      const value = process.env[key] || this.defaults.get(key);
      
      if (value !== undefined && !validator(value)) {
        this.validationErrors.push(`Invalid value for ${key}: ${value}`);
      }
    }

    // Check for validation errors
    if (this.validationErrors.length > 0) {
      const errorMessage = `Configuration validation failed:\n${this.validationErrors.join('\n')}`;
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error(errorMessage);
      } else {
        console.warn(errorMessage);
      }
    }
  }

  /**
   * Parse and transform values based on type
   */
  parseValues() {
    for (const [key, meta] of Object.entries(this.config)) {
      let value = process.env[key];
      
      // Use default if value is missing
      if (value === undefined) {
        value = this.defaults.get(key);
      }

      // Parse based on type
      if (value !== undefined) {
        switch (meta.type) {
          case 'number':
            meta.value = parseFloat(value);
            if (isNaN(meta.value)) {
              throw new Error(`Invalid number value for ${key}: ${value}`);
            }
            break;
          
          case 'boolean':
            meta.value = value === 'true' || value === '1' || value === 'yes';
            break;
          
          case 'array':
            meta.value = value.split(',').map(v => v.trim()).filter(v => v);
            break;
          
          case 'json':
            try {
              meta.value = JSON.parse(value);
            } catch (error) {
              throw new Error(`Invalid JSON value for ${key}: ${value}`);
            }
            break;
          
          default:
            meta.value = value;
        }
      }
    }
  }

  /**
   * Get configuration value
   */
  get(key, defaultValue) {
    const meta = this.config[key];
    
    if (!meta) {
      return defaultValue;
    }
    
    return meta.value !== null ? meta.value : defaultValue;
  }

  /**
   * Check if configuration value exists
   */
  has(key) {
    const meta = this.config[key];
    return meta && meta.value !== null && meta.value !== undefined;
  }

  /**
   * Get all configuration (excluding sensitive values)
   */
  getAll(includeSensitive = false) {
    const result = {};
    
    for (const [key, meta] of Object.entries(this.config)) {
      if (!meta.sensitive || includeSensitive) {
        result[key] = meta.value;
      } else {
        result[key] = '[REDACTED]';
      }
    }
    
    return result;
  }

  /**
   * Get configuration by namespace
   */
  getNamespace(namespace) {
    const result = {};
    const prefix = namespace.toUpperCase() + '_';
    
    for (const [key, meta] of Object.entries(this.config)) {
      if (key.startsWith(prefix)) {
        const localKey = key.substring(prefix.length);
        result[localKey] = meta.value;
      }
    }
    
    return result;
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return {
      mongodb: {
        uri: this.get('MONGODB_URI'),
        poolSize: this.get('MONGODB_POOL_SIZE'),
        timeout: this.get('MONGODB_TIMEOUT')
      },
      redis: {
        url: this.get('REDIS_URL'),
        password: this.get('REDIS_PASSWORD'),
        db: this.get('REDIS_DB'),
        poolSize: this.get('REDIS_POOL_SIZE')
      },
      chromadb: {
        url: this.get('CHROMADB_URL'),
        authToken: this.get('CHROMADB_AUTH_TOKEN')
      }
    };
  }

  /**
   * Get AI provider configuration
   */
  getAIProviderConfig() {
    return {
      google: {
        apiKey: this.get('GOOGLE_API_KEY'),
        enabled: this.has('GOOGLE_API_KEY')
      },
      openai: {
        apiKey: this.get('OPENAI_API_KEY'),
        enabled: this.has('OPENAI_API_KEY')
      },
      anthropic: {
        apiKey: this.get('ANTHROPIC_API_KEY'),
        enabled: this.has('ANTHROPIC_API_KEY')
      }
    };
  }

  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return {
      jwt: {
        secret: this.get('JWT_SECRET'),
        refreshSecret: this.get('JWT_REFRESH_SECRET'),
        accessExpiry: this.get('JWT_ACCESS_EXPIRY'),
        refreshExpiry: this.get('JWT_REFRESH_EXPIRY')
      },
      encryption: {
        key: this.get('ENCRYPTION_KEY')
      },
      saml: {
        privateKey: this.get('SAML_PRIVATE_KEY'),
        certificate: this.get('SAML_CERTIFICATE')
      },
      cors: {
        origins: this.get('ALLOWED_ORIGINS').split(',').map(o => o.trim()),
        credentials: this.get('CORS_CREDENTIALS'),
        maxAge: this.get('CORS_MAX_AGE')
      }
    };
  }

  /**
   * Get service ports
   */
  getServicePorts() {
    return {
      apiGateway: this.get('API_GATEWAY_PORT'),
      cognitiveCore: this.get('COGNITIVE_CORE_PORT'),
      knowledgeService: this.get('KNOWLEDGE_SERVICE_PORT'),
      flowService: this.get('FLOW_SERVICE_PORT'),
      userManagement: this.get('USER_MANAGEMENT_PORT'),
      billingService: this.get('BILLING_SERVICE_PORT')
    };
  }

  /**
   * Get tier limits
   */
  getTierLimits() {
    return {
      free: {
        users: this.get('FREE_TIER_USERS'),
        projects: this.get('FREE_TIER_PROJECTS'),
        aiRequests: this.get('FREE_TIER_AI_REQUESTS'),
        dataOperations: this.get('FREE_TIER_DATA_OPERATIONS')
      },
      pro: {
        users: this.get('PRO_TIER_USERS'),
        projects: this.get('PRO_TIER_PROJECTS'),
        aiRequests: this.get('PRO_TIER_AI_REQUESTS'),
        dataOperations: this.get('PRO_TIER_DATA_OPERATIONS')
      },
      enterprise: {
        aiLimit: this.get('ENTERPRISE_AI_LIMIT'),
        dataLimit: this.get('ENTERPRISE_DATA_LIMIT'),
        wsMessageLimit: this.get('ENTERPRISE_WS_MSG_LIMIT'),
        wsConnectionLimit: this.get('ENTERPRISE_WS_CONN_LIMIT'),
        dailyAILimit: this.get('ENTERPRISE_DAILY_AI_LIMIT'),
        monthlyAILimit: this.get('ENTERPRISE_MONTHLY_AI_LIMIT')
      }
    };
  }

  /**
   * Get feature flags
   */
  getFeatureFlags() {
    return {
      learningSystem: this.get('LEARNING_SYSTEM_ENABLED'),
      analytics: this.get('ANALYTICS_ENABLED'),
      realTimeCollaboration: this.get('REAL_TIME_COLLABORATION'),
      operationalTransformation: this.get('OPERATIONAL_TRANSFORMATION'),
      businessRulesEngine: this.get('BUSINESS_RULES_ENGINE'),
      templateSystem: this.get('TEMPLATE_SYSTEM'),
      workflowAutomation: this.get('WORKFLOW_AUTOMATION')
    };
  }

  /**
   * Validate configuration on startup
   */
  static validateOnStartup() {
    const config = new ConfigManager();
    
    if (config.validationErrors.length > 0) {
      console.error('Configuration validation failed:');
      config.validationErrors.forEach(error => console.error(`  - ${error}`));
      
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
    
    return config;
  }

  /**
   * Generate configuration documentation
   */
  generateDocs() {
    const docs = [];
    
    docs.push('# Configuration Documentation\n');
    docs.push('Generated automatically from configuration schema.\n');
    
    const sections = {};
    
    // Group by prefix
    for (const [key, meta] of Object.entries(this.config)) {
      const parts = key.split('_');
      const section = parts[0];
      
      if (!sections[section]) {
        sections[section] = [];
      }
      
      sections[section].push({ key, meta });
    }
    
    // Generate documentation for each section
    for (const [sectionName, configs] of Object.entries(sections)) {
      docs.push(`## ${sectionName}\n`);
      
      for (const { key, meta } of configs) {
        docs.push(`### ${key}`);
        
        if (meta.description) {
          docs.push(meta.description);
        }
        
        docs.push(`- **Type:** ${meta.type}`);
        docs.push(`- **Required:** ${meta.required ? 'Yes' : 'No'}`);
        
        if (this.defaults.has(key)) {
          const defaultValue = meta.sensitive ? '[REDACTED]' : this.defaults.get(key);
          docs.push(`- **Default:** \`${defaultValue}\``);
        }
        
        if (meta.sensitive) {
          docs.push(`- **Sensitive:** Yes - This value will be redacted in logs`);
        }
        
        docs.push('');
      }
    }
    
    return docs.join('\n');
  }
}

// Create singleton instance
const configManager = new ConfigManager();

export default configManager;
export { ConfigManager };