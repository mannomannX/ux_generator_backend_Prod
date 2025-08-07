// ==========================================
// SERVICES/FLOW-SERVICE/src/middleware/authorization.js
// RBAC-based authorization middleware
// ==========================================

import { Logger, MongoClient } from '@ux-flow/common';

class AuthorizationMiddleware {
  constructor(logger = new Logger('AuthzMiddleware'), mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Permission definitions
    this.permissions = {
      FLOW_READ: 'flow.read',
      FLOW_WRITE: 'flow.write',
      FLOW_DELETE: 'flow.delete',
      FLOW_ADMIN: 'flow.admin',
      FLOW_SHARE: 'flow.share',
      FLOW_EXPORT: 'flow.export',
      FLOW_IMPORT: 'flow.import',
      FLOW_EXECUTE: 'flow.execute',
      FLOW_VERSION: 'flow.version',
      FLOW_COMMENT: 'flow.comment',
    };
    
    // Role hierarchy
    this.roleHierarchy = {
      'super_admin': 100,
      'admin': 80,
      'editor': 60,
      'contributor': 40,
      'viewer': 20,
      'guest': 10,
    };
    
    // Role permissions mapping
    this.rolePermissions = {
      'super_admin': ['*'], // All permissions
      'admin': [
        this.permissions.FLOW_READ,
        this.permissions.FLOW_WRITE,
        this.permissions.FLOW_DELETE,
        this.permissions.FLOW_ADMIN,
        this.permissions.FLOW_SHARE,
        this.permissions.FLOW_EXPORT,
        this.permissions.FLOW_IMPORT,
        this.permissions.FLOW_EXECUTE,
        this.permissions.FLOW_VERSION,
        this.permissions.FLOW_COMMENT,
      ],
      'editor': [
        this.permissions.FLOW_READ,
        this.permissions.FLOW_WRITE,
        this.permissions.FLOW_SHARE,
        this.permissions.FLOW_EXPORT,
        this.permissions.FLOW_EXECUTE,
        this.permissions.FLOW_VERSION,
        this.permissions.FLOW_COMMENT,
      ],
      'contributor': [
        this.permissions.FLOW_READ,
        this.permissions.FLOW_WRITE,
        this.permissions.FLOW_COMMENT,
      ],
      'viewer': [
        this.permissions.FLOW_READ,
        this.permissions.FLOW_EXPORT,
        this.permissions.FLOW_COMMENT,
      ],
      'guest': [
        this.permissions.FLOW_READ,
      ],
    };
  }
  
  /**
   * Check if user has required permission
   */
  requirePermission(permission) {
    return async (req, res, next) => {
      try {
        // Check if user is authenticated
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'You must be authenticated to access this resource',
            correlationId: req.correlationId,
          });
        }
        
        // Service accounts have all permissions
        if (req.user.role === 'service') {
          return next();
        }
        
        // Check if user has the required permission
        const hasPermission = this.userHasPermission(req.user, permission);
        
        if (!hasPermission) {
          this.logger.warn('Permission denied', {
            userId: req.user.id,
            permission,
            userPermissions: req.user.permissions,
            correlationId: req.correlationId,
          });
          
          return res.status(403).json({
            error: 'Permission denied',
            message: `You do not have permission to ${permission}`,
            required: permission,
            correlationId: req.correlationId,
          });
        }
        
        next();
      } catch (error) {
        this.logger.error('Authorization error', error);
        
        res.status(500).json({
          error: 'Authorization failed',
          message: 'An error occurred during authorization',
          correlationId: req.correlationId,
        });
      }
    };
  }
  
  /**
   * Check if user owns or has access to a specific flow
   */
  requireFlowAccess(accessType = 'read') {
    return async (req, res, next) => {
      try {
        // Check if user is authenticated
        if (!req.user) {
          return res.status(401).json({
            error: 'Authentication required',
            correlationId: req.correlationId,
          });
        }
        
        // Service accounts have access to all flows
        if (req.user.role === 'service') {
          return next();
        }
        
        // Get flow ID from params or body
        const flowId = req.params.flowId || req.params.id || req.body?.flowId;
        
        if (!flowId) {
          return res.status(400).json({
            error: 'Flow ID required',
            message: 'Flow ID must be provided',
            correlationId: req.correlationId,
          });
        }
        
        // Get flow from database
        const db = this.mongoClient.getDb();
        const flow = await db.collection('flows').findOne({
          _id: MongoClient.createObjectId(flowId),
        });
        
        if (!flow) {
          return res.status(404).json({
            error: 'Flow not found',
            message: 'The requested flow does not exist',
            correlationId: req.correlationId,
          });
        }
        
        // Check access based on type
        const hasAccess = await this.checkFlowAccess(req.user, flow, accessType);
        
        if (!hasAccess) {
          this.logger.warn('Flow access denied', {
            userId: req.user.id,
            flowId,
            accessType,
            correlationId: req.correlationId,
          });
          
          return res.status(403).json({
            error: 'Access denied',
            message: `You do not have ${accessType} access to this flow`,
            correlationId: req.correlationId,
          });
        }
        
        // Attach flow to request for use in route handler
        req.flow = flow;
        
        next();
      } catch (error) {
        this.logger.error('Flow access check error', error);
        
        res.status(500).json({
          error: 'Authorization failed',
          message: 'An error occurred while checking flow access',
          correlationId: req.correlationId,
        });
      }
    };
  }
  
  /**
   * Check if user has specific permission
   */
  userHasPermission(user, permission) {
    // Check explicit permissions
    if (user.permissions?.includes('*') || user.permissions?.includes(permission)) {
      return true;
    }
    
    // Check role-based permissions
    const rolePermissions = this.rolePermissions[user.role] || [];
    return rolePermissions.includes('*') || rolePermissions.includes(permission);
  }
  
  /**
   * Check if user has access to a flow
   */
  async checkFlowAccess(user, flow, accessType) {
    // Owner has full access
    if (flow.metadata?.ownerId === user.id) {
      return true;
    }
    
    // Check workspace membership
    if (flow.metadata?.workspaceId === user.workspaceId) {
      // Check workspace role
      const permission = this.getRequiredPermission(accessType);
      return this.userHasPermission(user, permission);
    }
    
    // Check if flow is shared with user
    if (flow.metadata?.sharedWith?.includes(user.id)) {
      // Check share permissions
      const sharePermission = flow.metadata?.sharePermissions?.[user.id];
      if (sharePermission === 'write' && accessType !== 'delete') {
        return true;
      }
      if (sharePermission === 'read' && accessType === 'read') {
        return true;
      }
    }
    
    // Check if flow is public
    if (flow.metadata?.visibility === 'public' && accessType === 'read') {
      return true;
    }
    
    // Check if user is admin
    if (user.role === 'admin' || user.role === 'super_admin') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get required permission for access type
   */
  getRequiredPermission(accessType) {
    const permissionMap = {
      'read': this.permissions.FLOW_READ,
      'write': this.permissions.FLOW_WRITE,
      'delete': this.permissions.FLOW_DELETE,
      'admin': this.permissions.FLOW_ADMIN,
      'share': this.permissions.FLOW_SHARE,
      'export': this.permissions.FLOW_EXPORT,
      'import': this.permissions.FLOW_IMPORT,
      'execute': this.permissions.FLOW_EXECUTE,
      'version': this.permissions.FLOW_VERSION,
      'comment': this.permissions.FLOW_COMMENT,
    };
    
    return permissionMap[accessType] || this.permissions.FLOW_READ;
  }
  
  /**
   * Check if user has minimum role
   */
  requireRole(minimumRole) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          correlationId: req.correlationId,
        });
      }
      
      const userRoleLevel = this.roleHierarchy[req.user.role] || 0;
      const requiredRoleLevel = this.roleHierarchy[minimumRole] || 0;
      
      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          error: 'Insufficient role',
          message: `This action requires ${minimumRole} role or higher`,
          correlationId: req.correlationId,
        });
      }
      
      next();
    };
  }
  
  /**
   * Rate limit based on user role
   */
  getRateLimitForRole(role) {
    const limits = {
      'super_admin': { windowMs: 60000, max: 1000 },
      'admin': { windowMs: 60000, max: 500 },
      'editor': { windowMs: 60000, max: 200 },
      'contributor': { windowMs: 60000, max: 100 },
      'viewer': { windowMs: 60000, max: 50 },
      'guest': { windowMs: 60000, max: 20 },
    };
    
    return limits[role] || limits['guest'];
  }
  
  /**
   * Log authorization events
   */
  async logAuthorizationEvent(userId, resource, action, granted) {
    try {
      const db = this.mongoClient.getDb();
      await db.collection('authorization_logs').insertOne({
        userId,
        resource,
        action,
        granted,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to log authorization event', error);
    }
  }
}

export { AuthorizationMiddleware };