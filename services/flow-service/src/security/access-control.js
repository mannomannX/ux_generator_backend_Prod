import { Logger } from '@ux-flow/common';
import crypto from 'crypto';

export class AccessControl {
  constructor(logger = new Logger('AccessControl'), mongoClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Permission levels
    this.permissions = {
      OWNER: 'owner',
      ADMIN: 'admin',
      EDITOR: 'editor',
      VIEWER: 'viewer',
      NONE: 'none'
    };
    
    // Action permissions mapping
    this.actionPermissions = {
      'flow.create': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR],
      'flow.read': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR, this.permissions.VIEWER],
      'flow.update': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR],
      'flow.delete': [this.permissions.OWNER, this.permissions.ADMIN],
      'flow.share': [this.permissions.OWNER, this.permissions.ADMIN],
      'flow.export': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR],
      'flow.duplicate': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR],
      'version.create': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR],
      'version.read': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR, this.permissions.VIEWER],
      'version.restore': [this.permissions.OWNER, this.permissions.ADMIN],
      'comment.create': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR, this.permissions.VIEWER],
      'comment.read': [this.permissions.OWNER, this.permissions.ADMIN, this.permissions.EDITOR, this.permissions.VIEWER],
      'comment.update': [this.permissions.OWNER, this.permissions.ADMIN],
      'comment.delete': [this.permissions.OWNER, this.permissions.ADMIN],
      'workspace.manage': [this.permissions.OWNER, this.permissions.ADMIN],
      'workspace.invite': [this.permissions.OWNER, this.permissions.ADMIN],
      'workspace.remove': [this.permissions.OWNER]
    };
    
    // Resource access cache (with TTL)
    this.accessCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    
    // Rate limiting for permission checks
    this.permissionCheckLimit = new Map();
    this.maxChecksPerMinute = 100;
  }
  
  async checkPermission(userId, resourceId, action, resourceType = 'flow') {
    try {
      // Check rate limiting
      if (!this.checkRateLimit(userId)) {
        this.logger.warn('Permission check rate limit exceeded', { userId });
        return false;
      }
      
      // Check cache first
      const cacheKey = `${userId}:${resourceId}:${action}`;
      const cached = this.accessCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.allowed;
      }
      
      // Get user's permission level for the resource
      const permissionLevel = await this.getUserPermissionLevel(userId, resourceId, resourceType);
      
      // Check if the user's permission level allows the action
      const allowedPermissions = this.actionPermissions[action] || [];
      const allowed = allowedPermissions.includes(permissionLevel);
      
      // Cache the result
      this.accessCache.set(cacheKey, {
        allowed,
        expires: Date.now() + this.cacheTTL
      });
      
      // Log access attempt
      await this.logAccessAttempt(userId, resourceId, action, allowed);
      
      if (!allowed) {
        this.logger.warn('Permission denied', {
          userId,
          resourceId,
          action,
          permissionLevel
        });
      }
      
      return allowed;
    } catch (error) {
      this.logger.error('Error checking permission', error);
      return false;
    }
  }
  
  async getUserPermissionLevel(userId, resourceId, resourceType = 'flow') {
    if (!this.mongoClient) {
      this.logger.warn('MongoDB client not available, defaulting to no permission');
      return this.permissions.NONE;
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Check direct resource ownership/permissions
      const resource = await db.collection(`${resourceType}s`).findOne({
        _id: resourceId
      });
      
      if (!resource) {
        return this.permissions.NONE;
      }
      
      // Check if user is the owner
      if (resource.ownerId === userId) {
        return this.permissions.OWNER;
      }
      
      // Check shared permissions
      if (resource.permissions && resource.permissions[userId]) {
        return resource.permissions[userId];
      }
      
      // Check workspace permissions
      if (resource.workspaceId) {
        const workspace = await db.collection('workspaces').findOne({
          _id: resource.workspaceId
        });
        
        if (workspace) {
          // Check if user is workspace owner
          if (workspace.ownerId === userId) {
            return this.permissions.ADMIN;
          }
          
          // Check workspace member permissions
          if (workspace.members) {
            const member = workspace.members.find(m => m.userId === userId);
            if (member) {
              return this.mapWorkspaceRoleToPermission(member.role);
            }
          }
        }
      }
      
      // Check organization-level permissions
      const user = await db.collection('users').findOne({ _id: userId });
      if (user && user.organizationId === resource.organizationId) {
        if (user.role === 'admin') {
          return this.permissions.ADMIN;
        }
        if (user.role === 'member') {
          return this.permissions.VIEWER;
        }
      }
      
      return this.permissions.NONE;
    } catch (error) {
      this.logger.error('Error getting user permission level', error);
      return this.permissions.NONE;
    }
  }
  
  mapWorkspaceRoleToPermission(role) {
    const roleMapping = {
      'owner': this.permissions.OWNER,
      'admin': this.permissions.ADMIN,
      'editor': this.permissions.EDITOR,
      'member': this.permissions.VIEWER,
      'viewer': this.permissions.VIEWER
    };
    
    return roleMapping[role] || this.permissions.NONE;
  }
  
  async grantPermission(grantorId, resourceId, targetUserId, permission, resourceType = 'flow') {
    // Check if grantor has permission to share
    const canShare = await this.checkPermission(grantorId, resourceId, `${resourceType}.share`, resourceType);
    if (!canShare) {
      throw new Error('You do not have permission to share this resource');
    }
    
    // Validate permission level
    if (!Object.values(this.permissions).includes(permission)) {
      throw new Error('Invalid permission level');
    }
    
    // Cannot grant owner permission
    if (permission === this.permissions.OWNER) {
      throw new Error('Cannot grant owner permission');
    }
    
    if (!this.mongoClient) {
      throw new Error('MongoDB client not available');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Update resource permissions
      await db.collection(`${resourceType}s`).updateOne(
        { _id: resourceId },
        {
          $set: {
            [`permissions.${targetUserId}`]: permission,
            updatedAt: new Date(),
            updatedBy: grantorId
          }
        }
      );
      
      // Clear cache for the target user
      this.clearUserCache(targetUserId, resourceId);
      
      // Log the permission grant
      await this.logPermissionChange(grantorId, resourceId, targetUserId, permission, 'grant');
      
      this.logger.info('Permission granted', {
        grantorId,
        resourceId,
        targetUserId,
        permission
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error granting permission', error);
      throw error;
    }
  }
  
  async revokePermission(revokerId, resourceId, targetUserId, resourceType = 'flow') {
    // Check if revoker has permission to manage sharing
    const canShare = await this.checkPermission(revokerId, resourceId, `${resourceType}.share`, resourceType);
    if (!canShare) {
      throw new Error('You do not have permission to manage sharing for this resource');
    }
    
    if (!this.mongoClient) {
      throw new Error('MongoDB client not available');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Remove user's permission
      await db.collection(`${resourceType}s`).updateOne(
        { _id: resourceId },
        {
          $unset: {
            [`permissions.${targetUserId}`]: ""
          },
          $set: {
            updatedAt: new Date(),
            updatedBy: revokerId
          }
        }
      );
      
      // Clear cache for the target user
      this.clearUserCache(targetUserId, resourceId);
      
      // Log the permission revocation
      await this.logPermissionChange(revokerId, resourceId, targetUserId, null, 'revoke');
      
      this.logger.info('Permission revoked', {
        revokerId,
        resourceId,
        targetUserId
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error revoking permission', error);
      throw error;
    }
  }
  
  async transferOwnership(currentOwnerId, resourceId, newOwnerId, resourceType = 'flow') {
    if (!this.mongoClient) {
      throw new Error('MongoDB client not available');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Verify current owner
      const resource = await db.collection(`${resourceType}s`).findOne({
        _id: resourceId,
        ownerId: currentOwnerId
      });
      
      if (!resource) {
        throw new Error('Resource not found or you are not the owner');
      }
      
      // Transfer ownership
      await db.collection(`${resourceType}s`).updateOne(
        { _id: resourceId },
        {
          $set: {
            ownerId: newOwnerId,
            previousOwnerId: currentOwnerId,
            ownershipTransferredAt: new Date(),
            updatedAt: new Date(),
            updatedBy: currentOwnerId
          }
        }
      );
      
      // Clear cache for both users
      this.clearUserCache(currentOwnerId, resourceId);
      this.clearUserCache(newOwnerId, resourceId);
      
      // Log ownership transfer
      await this.logPermissionChange(currentOwnerId, resourceId, newOwnerId, this.permissions.OWNER, 'transfer');
      
      this.logger.info('Ownership transferred', {
        resourceId,
        currentOwnerId,
        newOwnerId
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error transferring ownership', error);
      throw error;
    }
  }
  
  async getResourcePermissions(userId, resourceId, resourceType = 'flow') {
    // Check if user can view permissions
    const canRead = await this.checkPermission(userId, resourceId, `${resourceType}.read`, resourceType);
    if (!canRead) {
      throw new Error('You do not have permission to view this resource');
    }
    
    if (!this.mongoClient) {
      throw new Error('MongoDB client not available');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      const resource = await db.collection(`${resourceType}s`).findOne(
        { _id: resourceId },
        { projection: { ownerId: 1, permissions: 1, workspaceId: 1 } }
      );
      
      if (!resource) {
        throw new Error('Resource not found');
      }
      
      // Get user details for all users with permissions
      const userIds = [resource.ownerId];
      if (resource.permissions) {
        userIds.push(...Object.keys(resource.permissions));
      }
      
      const users = await db.collection('users').find(
        { _id: { $in: userIds } },
        { projection: { _id: 1, name: 1, email: 1, avatar: 1 } }
      ).toArray();
      
      const userMap = {};
      users.forEach(user => {
        userMap[user._id] = user;
      });
      
      // Build permissions list
      const permissionsList = [];
      
      // Add owner
      if (userMap[resource.ownerId]) {
        permissionsList.push({
          user: userMap[resource.ownerId],
          permission: this.permissions.OWNER,
          grantedAt: resource.createdAt
        });
      }
      
      // Add other permissions
      if (resource.permissions) {
        for (const [userId, permission] of Object.entries(resource.permissions)) {
          if (userMap[userId]) {
            permissionsList.push({
              user: userMap[userId],
              permission,
              grantedAt: null // Could track this separately if needed
            });
          }
        }
      }
      
      return permissionsList;
    } catch (error) {
      this.logger.error('Error getting resource permissions', error);
      throw error;
    }
  }
  
  checkRateLimit(userId) {
    const now = Date.now();
    const userChecks = this.permissionCheckLimit.get(userId) || [];
    
    // Remove checks older than 1 minute
    const recentChecks = userChecks.filter(timestamp => now - timestamp < 60000);
    
    if (recentChecks.length >= this.maxChecksPerMinute) {
      return false;
    }
    
    // Add current check
    recentChecks.push(now);
    this.permissionCheckLimit.set(userId, recentChecks);
    
    return true;
  }
  
  clearUserCache(userId, resourceId = null) {
    if (resourceId) {
      // Clear specific resource cache for user
      for (const [key] of this.accessCache) {
        if (key.startsWith(`${userId}:${resourceId}:`)) {
          this.accessCache.delete(key);
        }
      }
    } else {
      // Clear all cache for user
      for (const [key] of this.accessCache) {
        if (key.startsWith(`${userId}:`)) {
          this.accessCache.delete(key);
        }
      }
    }
  }
  
  clearResourceCache(resourceId) {
    // Clear all cache entries for a resource
    for (const [key] of this.accessCache) {
      if (key.includes(`:${resourceId}:`)) {
        this.accessCache.delete(key);
      }
    }
  }
  
  async logAccessAttempt(userId, resourceId, action, allowed) {
    if (!this.mongoClient) {
      return;
    }
    
    try {
      const db = this.mongoClient.getDb();
      await db.collection('access_logs').insertOne({
        userId,
        resourceId,
        action,
        allowed,
        timestamp: new Date(),
        ip: null // Could be passed from request context
      });
    } catch (error) {
      this.logger.error('Error logging access attempt', error);
    }
  }
  
  async logPermissionChange(grantorId, resourceId, targetUserId, permission, action) {
    if (!this.mongoClient) {
      return;
    }
    
    try {
      const db = this.mongoClient.getDb();
      await db.collection('permission_logs').insertOne({
        grantorId,
        resourceId,
        targetUserId,
        permission,
        action,
        timestamp: new Date()
      });
    } catch (error) {
      this.logger.error('Error logging permission change', error);
    }
  }
  
  generateShareToken(resourceId, permission, expiresIn = 24 * 60 * 60 * 1000) {
    // Generate a secure share token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + expiresIn);
    
    // Store token (would normally go to database)
    const tokenData = {
      token,
      resourceId,
      permission,
      expires,
      used: false
    };
    
    return {
      token,
      expires,
      shareUrl: `/share/${token}`
    };
  }
  
  async validateShareToken(token) {
    if (!this.mongoClient) {
      throw new Error('MongoDB client not available');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      const tokenData = await db.collection('share_tokens').findOne({
        token,
        used: false,
        expires: { $gt: new Date() }
      });
      
      if (!tokenData) {
        throw new Error('Invalid or expired share token');
      }
      
      // Mark token as used
      await db.collection('share_tokens').updateOne(
        { token },
        { $set: { used: true, usedAt: new Date() } }
      );
      
      return tokenData;
    } catch (error) {
      this.logger.error('Error validating share token', error);
      throw error;
    }
  }
  
  getAccessMetrics() {
    return {
      cacheSize: this.accessCache.size,
      rateLimitedUsers: this.permissionCheckLimit.size,
      maxChecksPerMinute: this.maxChecksPerMinute,
      cacheTTL: this.cacheTTL,
      permissionLevels: Object.keys(this.permissions).length,
      definedActions: Object.keys(this.actionPermissions).length
    };
  }
}