// ==========================================
// PACKAGES/COMMON/src/index.js - Main Export
// ==========================================
export { Logger } from './logger/index.js';
export { EventEmitter, EventTypes } from './events/index.js';
export { MongoClient, RedisClient, ChromaClient } from './database/index.js';
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
export { HealthCheck, RetryUtils } from './utils/index.js';