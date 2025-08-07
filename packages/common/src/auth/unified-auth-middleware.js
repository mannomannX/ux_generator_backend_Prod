// ==========================================
// PACKAGES/COMMON/src/auth/unified-auth-middleware.js
// ==========================================
import { JWTUtils } from './jwt-utils.js';

/**
 * Unified Authentication Middleware
 * Single source of truth for all authentication across services
 */
export class UnifiedAuthMiddleware {
  constructor(options = {}) {
    this.options = {
      userService: null, // User service instance for user lookup
      allowServiceTokens: false,
      requireEmailVerification: false,
      ...options
    };
  }

  /**
   * Main authentication middleware
   */
  authenticate(options = {}) {
    const {
      optional = false,
      requiredPermissions = [],
      requiredRole = null,
      requireWorkspaceAccess = false,
      requireEmailVerification = this.options.requireEmailVerification,
      allowServiceTokens = this.options.allowServiceTokens,
    } = options;

    return async (req, res, next) => {
      try {
        const authResult = await this.processAuthentication(req, {
          optional,
          allowServiceTokens,
        });

        if (!authResult.success) {
          if (optional) {
            return next();
          }
          return this.sendAuthError(res, authResult.error, req.correlationId);
        }

        // Set user or service context
        if (authResult.user) {
          req.user = authResult.user;
          req.isServiceToken = false;
        } else if (authResult.service) {
          req.service = authResult.service;
          req.isServiceToken = true;
        }

        // Check email verification
        if (requireEmailVerification && req.user && !req.user.emailVerified) {
          return this.sendAuthError(res, {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Email verification required to access this resource.'
          }, req.correlationId);
        }

        // Check role requirements
        if (requiredRole && req.user) {
          if (!this.checkRole(req.user.role, requiredRole)) {
            return this.sendAuthError(res, {
              code: 'INSUFFICIENT_ROLE',
              message: `Access denied. ${requiredRole} role required.`,
              requiredRole,
              userRole: req.user.role
            }, req.correlationId);
          }
        }

        // Check permission requirements
        if (requiredPermissions.length > 0 && req.user) {
          const hasPermissions = this.checkPermissions(req.user, requiredPermissions);
          if (!hasPermissions) {
            return this.sendAuthError(res, {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
              requiredPermissions,
              userPermissions: req.user.permissions || []
            }, req.correlationId);
          }
        }

        // Check workspace access
        if (requireWorkspaceAccess && req.user) {
          const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
          if (!workspaceId) {
            return this.sendAuthError(res, {
              code: 'MISSING_WORKSPACE_ID',
              message: 'Workspace ID is required.'
            }, req.correlationId);
          }

          if (!this.checkWorkspaceAccess(req.user, workspaceId)) {
            return this.sendAuthError(res, {
              code: 'WORKSPACE_ACCESS_DENIED',
              message: 'You do not have access to this workspace.'
            }, req.correlationId);
          }
        }

        next();
      } catch (error) {
        console.error('Unified auth middleware error:', error);
        return this.sendAuthError(res, {
          code: 'AUTHENTICATION_ERROR',
          message: 'Internal authentication error.'
        }, req.correlationId);
      }
    };
  }

  /**
   * Process authentication token
   */
  async processAuthentication(req, options = {}) {
    const { optional = false, allowServiceTokens = false } = options;

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: optional,
        error: optional ? null : {
          code: 'NO_TOKEN',
          message: 'Access denied. No authentication token provided.'
        }
      };
    }

    const token = authHeader.substring(7);
    const decoded = JWTUtils.verify(token);

    if (!decoded) {
      return {
        success: optional,
        error: optional ? null : {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token.'
        }
      };
    }

    // Check token expiration
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return {
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired.'
        }
      };
    }

    // Handle service tokens
    if (decoded.tokenType === 'service_access') {
      if (!allowServiceTokens) {
        return {
          success: false,
          error: {
            code: 'SERVICE_TOKENS_NOT_ALLOWED',
            message: 'Service tokens not allowed for this endpoint.'
          }
        };
      }
      
      return {
        success: true,
        service: {
          name: decoded.serviceName,
          permissions: decoded.permissions || [],
          tokenType: 'service'
        }
      };
    }

    // Handle user tokens - validate user still exists and is active
    if (this.options.userService) {
      try {
        const user = await this.options.userService.getUser(decoded.userId);
        if (!user) {
          return {
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User associated with token not found.'
            }
          };
        }

        if (user.status !== 'active') {
          return {
            success: false,
            error: {
              code: 'USER_INACTIVE',
              message: 'User account is not active.'
            }
          };
        }

        return {
          success: true,
          user: {
            userId: user.id || decoded.userId,
            email: user.email || decoded.email,
            firstName: user.firstName,
            lastName: user.lastName,
            workspaceId: user.workspaceId || decoded.workspaceId,
            role: user.role || decoded.role || 'user',
            permissions: user.permissions || decoded.permissions || [],
            emailVerified: user.emailVerified || false,
          }
        };
      } catch (error) {
        console.error('User validation error:', error);
        // Fallback to token data if user service is unavailable
      }
    }

    // Fallback to token data
    return {
      success: true,
      user: {
        userId: decoded.userId,
        email: decoded.email,
        workspaceId: decoded.workspaceId,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
        emailVerified: decoded.emailVerified || false,
      }
    };
  }

  /**
   * Check role hierarchy
   */
  checkRole(userRole, requiredRole) {
    const roleHierarchy = {
      'user': 1,
      'admin': 2,
      'super_admin': 3,
    };

    const userRoleLevel = roleHierarchy[userRole] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    return userRoleLevel >= requiredRoleLevel;
  }

  /**
   * Check permissions
   */
  checkPermissions(user, requiredPermissions) {
    // Super admins have all permissions
    if (user.role === 'super_admin') {
      return true;
    }

    // Regular admins have most permissions
    if (user.role === 'admin') {
      const adminRestrictedPermissions = ['super_admin_only'];
      const hasRestrictedPermission = requiredPermissions.some(p => 
        adminRestrictedPermissions.includes(p)
      );
      if (!hasRestrictedPermission) {
        return true;
      }
    }

    // Check specific permissions
    return requiredPermissions.every(permission => 
      (user.permissions || []).includes(permission)
    );
  }

  /**
   * Check workspace access
   */
  checkWorkspaceAccess(user, workspaceId) {
    // Super admins have access to all workspaces
    if (user.role === 'super_admin') {
      return true;
    }

    // Check if user belongs to the workspace
    return user.workspaceId === workspaceId;
  }

  /**
   * Send authentication error response
   */
  sendAuthError(res, error, correlationId) {
    return res.status(error.code === 'TOKEN_EXPIRED' ? 401 : 
                     error.code.includes('INSUFFICIENT') ? 403 : 401).json({
      error: {
        ...error,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Convenience methods
   */
  requireAuth(options = {}) {
    return this.authenticate({ ...options, optional: false });
  }

  optionalAuth(options = {}) {
    return this.authenticate({ ...options, optional: true });
  }

  requireRole(role, options = {}) {
    return this.authenticate({ ...options, requiredRole: role });
  }

  requirePermission(permission, options = {}) {
    return this.authenticate({ ...options, requiredPermissions: [permission] });
  }

  requirePermissions(permissions, options = {}) {
    return this.authenticate({ ...options, requiredPermissions: permissions });
  }

  requireWorkspaceAccess(options = {}) {
    return this.authenticate({ ...options, requireWorkspaceAccess: true });
  }

  requireEmailVerification(options = {}) {
    return this.authenticate({ ...options, requireEmailVerification: true });
  }

  allowServiceTokens(options = {}) {
    return this.authenticate({ ...options, allowServiceTokens: true });
  }
}

// Export singleton instance and factory function
let defaultInstance = null;

export const createAuthMiddleware = (options = {}) => {
  return new UnifiedAuthMiddleware(options);
};

export const getDefaultAuthMiddleware = (options = {}) => {
  if (!defaultInstance) {
    defaultInstance = new UnifiedAuthMiddleware(options);
  }
  return defaultInstance;
};

// Export convenience functions for backward compatibility
export const requireAuth = (options = {}) => getDefaultAuthMiddleware().requireAuth(options);
export const optionalAuth = (options = {}) => getDefaultAuthMiddleware().optionalAuth(options);
export const requireRole = (role, options = {}) => getDefaultAuthMiddleware().requireRole(role, options);
export const requirePermission = (permission, options = {}) => getDefaultAuthMiddleware().requirePermission(permission, options);
export const requirePermissions = (permissions, options = {}) => getDefaultAuthMiddleware().requirePermissions(permissions, options);
export const requireWorkspaceAccess = (options = {}) => getDefaultAuthMiddleware().requireWorkspaceAccess(options);
export const requireEmailVerification = (options = {}) => getDefaultAuthMiddleware().requireEmailVerification(options);