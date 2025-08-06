// ==========================================
// PACKAGES/COMMON/src/auth/auth-middleware.js
// ==========================================
import { JWTUtils } from './jwt-utils.js';

export const createAuthMiddleware = (options = {}) => {
  const {
    optional = false,
    requiredPermissions = [],
    requiredRole = null,
    allowServiceTokens = false,
  } = options;

  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      // Check if token is provided
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (optional) {
          return next();
        }
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Missing or invalid authorization header',
        });
      }

      const token = authHeader.substring(7);
      const decoded = JWTUtils.verify(token);

      if (!decoded) {
        if (optional) {
          return next();
        }
        return res.status(401).json({
          error: 'Invalid token',
          message: 'Token verification failed',
        });
      }

      // Handle service tokens
      if (decoded.tokenType === 'service_access') {
        if (!allowServiceTokens) {
          return res.status(403).json({
            error: 'Service tokens not allowed',
            message: 'This endpoint requires user authentication',
          });
        }
        
        req.service = {
          name: decoded.serviceName,
          permissions: decoded.permissions || [],
        };
        return next();
      }

      // Handle user tokens
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        workspaceId: decoded.workspaceId,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
      };

      // Check role requirements
      if (requiredRole && req.user.role !== requiredRole && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Insufficient role',
          message: `Required role: ${requiredRole}`,
        });
      }

      // Check permission requirements
      if (requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every(
          permission => req.user.permissions.includes(permission) || req.user.role === 'admin'
        );

        if (!hasPermissions) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            message: `Required permissions: ${requiredPermissions.join(', ')}`,
          });
        }
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        error: 'Authentication error',
        message: 'Internal authentication error',
      });
    }
  };
};

// Convenience middleware functions
export const requireAuth = createAuthMiddleware();
export const optionalAuth = createAuthMiddleware({ optional: true });
export const requireAdmin = createAuthMiddleware({ requiredRole: 'admin' });
export const requireServiceAuth = createAuthMiddleware({ allowServiceTokens: true });

export const requirePermission = (permission) => {
  return createAuthMiddleware({ requiredPermissions: [permission] });
};

export const requirePermissions = (permissions) => {
  return createAuthMiddleware({ requiredPermissions: permissions });
};

export const requireRole = (role) => {
  return createAuthMiddleware({ requiredRole: role });
};