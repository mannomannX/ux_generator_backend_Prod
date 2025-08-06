// ==========================================
// SERVICES/USER-MANAGEMENT/src/middleware/auth.js
// ==========================================

import { JWTUtils } from '@ux-flow/common';
import { AuthorizationError, NotFoundError } from './error-handler.js';
import config from '../config/index.js';

/**
 * Authentication Middleware
 * Validates JWT token and sets user context
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'NO_TOKEN',
          message: 'Access denied. No authentication token provided.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Verify JWT token
    const decoded = JWTUtils.verify(token);
    if (!decoded) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if user still exists and is active
    const user = await req.userManager.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User associated with token not found.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        error: {
          code: 'USER_INACTIVE',
          message: 'User account is not active.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Set user context
    req.user = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      workspaceId: user.workspaceId,
      role: user.role,
      permissions: user.permissions,
      emailVerified: user.emailVerified,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(401).json({
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed.',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Optional Authentication Middleware
 * Sets user context if token is provided, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.header('x-auth-token');

    if (!token) {
      return next(); // No token, continue without user context
    }

    const decoded = JWTUtils.verify(token);
    if (decoded) {
      const user = await req.userManager.getUser(decoded.userId);
      if (user && user.status === 'active') {
        req.user = {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workspaceId: user.workspaceId,
          role: user.role,
          permissions: user.permissions,
          emailVerified: user.emailVerified,
        };
      }
    }

    next();
  } catch (error) {
    // If optional auth fails, just continue without user context
    next();
  }
};

/**
 * Role-based Authorization Middleware
 */
export const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Role hierarchy: super_admin > admin > user
    const roleHierarchy = {
      'user': 1,
      'admin': 2,
      'super_admin': 3,
    };

    const userRoleLevel = roleHierarchy[req.user.role] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `Access denied. ${requiredRole} role required.`,
          requiredRole,
          userRole: req.user.role,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};

/**
 * Permission-based Authorization Middleware
 */
export const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSION',
          message: `Access denied. '${requiredPermission}' permission required.`,
          requiredPermission,
          userPermissions: req.user.permissions,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};

/**
 * Multiple Permission Authorization Middleware
 */
export const requireAnyPermission = (requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const hasPermission = requiredPermissions.some(permission => 
      req.user.permissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSION',
          message: `Access denied. One of these permissions required: ${requiredPermissions.join(', ')}`,
          requiredPermissions,
          userPermissions: req.user.permissions,
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};

/**
 * Workspace Ownership/Membership Authorization
 */
export const requireWorkspaceAccess = (accessType = 'member') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required.',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const workspaceId = req.params.workspaceId || req.body.workspaceId;
      
      if (!workspaceId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_WORKSPACE_ID',
            message: 'Workspace ID is required.',
            correlationId: req.correlationId,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const workspace = await req.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace');
      }

      const member = workspace.members.find(m => m.userId === req.user.userId);
      const isOwner = workspace.ownerId === req.user.userId;

      // Check access based on type
      switch (accessType) {
        case 'owner':
          if (!isOwner && req.user.role !== 'super_admin') {
            throw new AuthorizationError('Workspace ownership required');
          }
          break;
        
        case 'admin':
          if (!isOwner && 
              member?.role !== 'admin' && 
              req.user.role !== 'super_admin') {
            throw new AuthorizationError('Workspace admin access required');
          }
          break;
        
        case 'member':
        default:
          if (!member && !isOwner && req.user.role !== 'super_admin') {
            throw new AuthorizationError('Workspace membership required');
          }
          break;
      }

      // Add workspace context to request
      req.workspace = workspace;
      req.workspaceMember = member;
      req.isWorkspaceOwner = isOwner;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Self or Admin Authorization
 * Allows access if user is accessing their own resource or is admin
 */
export const requireSelfOrAdmin = (userIdParam = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const targetUserId = req.params[userIdParam];
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isSelf = req.user.userId === targetUserId;

    if (!isSelf && !isAdmin) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ACCESS',
          message: 'Access denied. You can only access your own resources.',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    next();
  };
};

/**
 * Email Verification Requirement Middleware
 */
export const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required.',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (config.security.requireEmailVerification && !req.user.emailVerified) {
    return res.status(403).json({
      error: {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification required to access this resource.',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  next();
};