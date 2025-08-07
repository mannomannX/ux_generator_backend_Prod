// ==========================================
// FLOW SERVICE - Constants Configuration
// ==========================================

/**
 * Flow Service Constants
 * Centralized configuration for all magic numbers and limits
 */

// Pagination and Limits
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
};

// Cache Configuration
export const CACHE = {
  DEFAULT_TTL: 3600, // 1 hour in seconds
  FLOW_TTL: 1800, // 30 minutes
  LIST_TTL: 600, // 10 minutes
  STATISTICS_TTL: 300, // 5 minutes
  MAX_CACHE_SIZE: 1000,
  STAMPEDE_PROTECTION_TTL: 5 // 5 seconds
};

// Collaboration Service
export const COLLABORATION = {
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  PRESENCE_TTL: 5 * 60 * 1000, // 5 minutes
  MAX_HISTORY_SIZE: 1000,
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  MAX_CONNECTIONS_PER_USER: 5,
  OPERATION_SEQUENCE_START: 0
};

// Versioning
export const VERSIONING = {
  MAX_VERSIONS_PER_FLOW: 100,
  DEFAULT_VERSION_LIMIT: 20,
  VERSION_CLEANUP_DAYS: 90,
  VERSION_COMPRESSION_THRESHOLD: 1024 * 10 // 10KB
};

// Flow Limits
export const FLOW_LIMITS = {
  MAX_NODES: 1000,
  MAX_EDGES: 2000,
  MAX_FLOW_SIZE: 1024 * 1024 * 5, // 5MB
  MAX_NODE_LABEL_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_FLOW_NAME_LENGTH: 100
};

// Batch Operations
export const BATCH = {
  MAX_BATCH_SIZE: 100,
  DEFAULT_BATCH_SIZE: 10,
  BATCH_TIMEOUT: 30000, // 30 seconds
  MAX_CONCURRENT_BATCHES: 5
};

// Database
export const DATABASE = {
  QUERY_TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  CONNECTION_POOL_SIZE: 10,
  TRANSACTION_TIMEOUT: 5000 // 5 seconds
};

// Business Rules
export const BUSINESS_RULES = {
  MAX_CUSTOM_RULES: 50,
  RULE_EXECUTION_TIMEOUT: 1000, // 1 second
  MAX_RULE_CODE_LENGTH: 10000,
  RULE_CACHE_TTL: 3600 // 1 hour
};

// WebSocket
export const WEBSOCKET = {
  MAX_MESSAGE_SIZE: 1024 * 64, // 64KB
  CONNECTION_TIMEOUT: 60000, // 1 minute
  PING_INTERVAL: 30000, // 30 seconds
  PONG_TIMEOUT: 10000 // 10 seconds
};

// Rate Limiting
export const RATE_LIMITS = {
  GLOBAL_WINDOW: 60000, // 1 minute
  GLOBAL_MAX: 100,
  WRITE_WINDOW: 60000,
  WRITE_MAX: 50,
  DELETE_WINDOW: 60000,
  DELETE_MAX: 10,
  EXPORT_WINDOW: 300000, // 5 minutes
  EXPORT_MAX: 20
};

// Export Formats
export const EXPORT_FORMATS = {
  JSON: 'json',
  XML: 'xml',
  YAML: 'yaml',
  MERMAID: 'mermaid'
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Sort Options
export const SORT = {
  DEFAULT_FIELD: 'updatedAt',
  DEFAULT_ORDER: 'desc',
  ALLOWED_FIELDS: ['createdAt', 'updatedAt', 'flowName', 'version'],
  ALLOWED_ORDERS: ['asc', 'desc']
};

// Security
export const SECURITY = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  TOKEN_EXPIRY: 24 * 60 * 60, // 24 hours
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60 // 7 days
};

// File Operations
export const FILE = {
  MAX_UPLOAD_SIZE: 1024 * 1024 * 10, // 10MB
  ALLOWED_MIME_TYPES: ['application/json', 'text/xml', 'text/yaml'],
  TEMP_FILE_CLEANUP_INTERVAL: 60 * 60 * 1000 // 1 hour
};

// Monitoring
export const MONITORING = {
  METRICS_INTERVAL: 60000, // 1 minute
  HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
  LOG_ROTATION_SIZE: 1024 * 1024 * 10, // 10MB
  LOG_RETENTION_DAYS: 30
};

export default {
  PAGINATION,
  CACHE,
  COLLABORATION,
  VERSIONING,
  FLOW_LIMITS,
  BATCH,
  DATABASE,
  BUSINESS_RULES,
  WEBSOCKET,
  RATE_LIMITS,
  EXPORT_FORMATS,
  HTTP_STATUS,
  SORT,
  SECURITY,
  FILE,
  MONITORING
};