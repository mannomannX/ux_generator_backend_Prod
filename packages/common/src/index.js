// ==========================================
// PACKAGES/COMMON/src/index.js - Main Export
// ==========================================

// Logging
export { Logger } from './logger/index.js';

// Events
export { EventEmitter, EventTypes } from './events/index.js';

// Database
export { MongoClient, RedisClient, ChromaClient } from './database/index.js';

// Authentication
export { 
  createAuthMiddleware, 
  requireAuth, 
  optionalAuth, 
  requireAdmin,
  requireServiceAuth,
  requirePermission,
  requirePermissions,
  requireRole
} from './auth/auth-middleware.js';
export { JWTUtils } from './auth/jwt-utils.js';

// Validation
export { Validators } from './validation/validators.js';
export { 
  validateSchema,
  userRegistrationSchema,
  userLoginSchema,
  projectCreateSchema,
  flowCreateSchema,
  knowledgeQuerySchema,
  paginationSchema
} from './validation/schemas.js';

// Utilities
export { HealthCheck, RetryUtils } from './utils/index.js';

// Backup & Compliance
export { BackupManager } from './backup/backup-manager.js';
export { DataComplianceManager } from './compliance/data-compliance-manager.js';

// Security
export { EncryptionUtils } from './security/encryption-utils.js';
export { PromptSecurity } from './security/prompt-security.js';

// Credit System
export { 
  requireCredits, 
  consumeCredits, 
  calculateCreditCost,
  consumeCreditsAfterSuccess,
  CREDIT_COSTS 
} from './middleware/credit-check.js';

// New Security Modules
export {
  InputValidator,
  CSRFProtection,
  SecurityHeaders,
  SecurityMiddleware,
  SecretsManager,
  SecurityMonitor
} from './security/index.js';

// GDPR Compliance
export {
  DataProtection,
  ConsentManager,
  AuditLogger,
  RightsHandler
} from './gdpr/index.js';

// Optimization
export {
  CostOptimizer,
  PerformanceOptimizer
} from './optimization/index.js';