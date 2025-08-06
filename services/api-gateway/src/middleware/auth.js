// ==========================================
// SERVICES/API-GATEWAY/src/middleware/auth.js
// ==========================================
import { JWTUtils } from '@ux-flow/common';

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
    
    const decoded = JWTUtils.verify(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
        correlationId: req.correlationId,
      });
    }

    // Check if token is expired
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again',
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
      const decoded = JWTUtils.verify(token);
      
      if (decoded && (!decoded.exp || Date.now() < decoded.exp * 1000)) {
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          workspaceId: decoded.workspaceId,
          role: decoded.role || 'user',
          permissions: decoded.permissions || [],
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

    // Check if user has access to this workspace
    if (req.user.workspaceId !== workspaceId && req.user.role !== 'admin') {
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