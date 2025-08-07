// ==========================================
// SERVICES/API-GATEWAY/src/middleware/auth.js
// ==========================================
import { JWTUtils } from '@ux-flow/common';
import { TokenBlacklistService } from '../services/token-blacklist.js';

let tokenBlacklist = null;

export const initializeTokenBlacklist = (redisClient, logger) => {
  tokenBlacklist = new TokenBlacklistService(redisClient, logger);
  tokenBlacklist.startCleanupJob();
  return tokenBlacklist;
};

export const getTokenBlacklist = () => tokenBlacklist;

/**
 * SECURITY FIX: Validate workspace access with proper authorization
 * This function should be implemented to check workspace membership/permissions
 */
async function validateWorkspaceAccess(user, workspaceId, logger = null) {
  try {
    // Check if user is in their primary workspace
    if (user.workspaceId === workspaceId) {
      return true;
    }
    
    // Check if user is a global admin (with additional verification)
    if (user.role === 'admin') {
      // TODO: Add additional admin verification (e.g., check admin scope, permissions)
      // For now, allow admin access but log for audit
      const auditMessage = `Admin access to workspace ${workspaceId} by user ${user.userId}`;
      if (logger) {
        logger.info(auditMessage, { userId: user.userId, workspaceId, adminAccess: true });
      }
      return true;
    }
    
    // Check if user has explicit workspace permissions (multi-workspace support)
    if (user.permissions && Array.isArray(user.permissions)) {
      const workspacePermission = user.permissions.find(
        perm => perm.workspace === workspaceId && perm.access
      );
      if (workspacePermission) {
        return true;
      }
    }
    
    // TODO: In a complete implementation, this should call user-management service
    // to verify workspace membership, roles, and permissions:
    // 
    // const userManagementService = new ServiceClient('api-gateway', authenticator, logger);
    // const response = await userManagementService.get('user-management', 
    //   `/api/users/${user.userId}/workspaces/${workspaceId}/access`
    // );
    // return response.hasAccess;
    
    return false;
  } catch (error) {
    const errorMessage = 'Error validating workspace access';
    if (logger) {
      logger.error(errorMessage, error, { userId: user.userId, workspaceId });
    }
    // Fail secure - deny access on error
    return false;
  }
}

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing or invalid authorization header',
        correlationId: req.correlationId,
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Check if token is blacklisted
    if (tokenBlacklist && await tokenBlacklist.isBlacklisted(token)) {
      return res.status(401).json({
        error: 'Token revoked',
        message: 'This token has been revoked',
        correlationId: req.correlationId,
      });
    }
    
    // SECURITY FIX: Rely on JWT library for proper expiration validation
    // Manual expiration checks can introduce timing vulnerabilities and bypass library safeguards
    const decoded = JWTUtils.verify(token);
    if (!decoded) {
      // JWTUtils.verify() handles all token validation including expiration
      // Return appropriate error message for expired tokens
      return res.status(401).json({
        error: 'Token invalid',
        message: 'Token verification failed - token may be expired, invalid, or malformed',
        correlationId: req.correlationId,
      });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      workspaceId: decoded.workspaceId,
      role: decoded.role || 'user',
      permissions: decoded.permissions || [],
      token, // Store token for potential revocation
      tokenExp: decoded.exp
    };

    next();
  } catch (error) {
    req.logger?.error('Authentication middleware error', error, {
      correlationId: req.correlationId,
    });

    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Token processing error',
      correlationId: req.correlationId,
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Check if token is blacklisted
      if (tokenBlacklist && await tokenBlacklist.isBlacklisted(token)) {
        // For optional auth, we just skip setting user
        return next();
      }
      
      // SECURITY FIX: Rely on JWT library for proper expiration validation
      const decoded = JWTUtils.verify(token);
      
      if (decoded) {
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          workspaceId: decoded.workspaceId,
          role: decoded.role || 'user',
          permissions: decoded.permissions || [],
          token,
          tokenExp: decoded.exp
        };
      }
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on errors
    next();
  }
};

export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        correlationId: req.correlationId,
      });
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Required permission: ${permission}`,
        correlationId: req.correlationId,
      });
    }

    next();
  };
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        correlationId: req.correlationId,
      });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Insufficient role',
        message: `Required role: ${role}`,
        correlationId: req.correlationId,
      });
    }

    next();
  };
};

export const requireWorkspaceAccess = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({
        error: 'Workspace ID required',
        correlationId: req.correlationId,
      });
    }

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        correlationId: req.correlationId,
      });
    }

    // SECURITY FIX: Proper workspace access validation
    // Check if user has legitimate access to this workspace
    const hasWorkspaceAccess = await validateWorkspaceAccess(req.user, workspaceId, req.logger);
    if (!hasWorkspaceAccess) {
      return res.status(403).json({
        error: 'Workspace access denied',
        message: 'You do not have access to this workspace',
        correlationId: req.correlationId,
      });
    }

    next();
  } catch (error) {
    req.logger?.error('Workspace access check failed', error, {
      correlationId: req.correlationId,
    });

    return res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId,
    });
  }
};