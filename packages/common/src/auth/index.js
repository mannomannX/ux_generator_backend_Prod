// ==========================================
// PACKAGES/COMMON/src/auth/index.js
// ==========================================
export { JWTUtils } from './jwt-utils.js';
export { 
  createAuthMiddleware,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireServiceAuth,
  requirePermission,
  requirePermissions,
  requireRole
} from './auth-middleware.js';