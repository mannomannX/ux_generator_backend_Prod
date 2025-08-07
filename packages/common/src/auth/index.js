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
export {
  UnifiedAuthMiddleware,
  createAuthMiddleware as createUnifiedAuthMiddleware,
  getDefaultAuthMiddleware,
  requireAuth as unifiedRequireAuth,
  optionalAuth as unifiedOptionalAuth,
  requireRole as unifiedRequireRole,
  requirePermission as unifiedRequirePermission,
  requirePermissions as unifiedRequirePermissions,
  requireWorkspaceAccess,
  requireEmailVerification
} from './unified-auth-middleware.js';