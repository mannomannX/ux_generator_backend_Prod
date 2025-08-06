// ==========================================
// SERVICES/USER-MANAGEMENT/src/services/workspace-manager.js
// ==========================================
import { MongoClient, Validators } from '@ux-flow/common';

class WorkspaceManager {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // Workspace cache TTL (5 minutes)
    this.workspaceCacheTTL = 300;
  }

  async createWorkspace(workspaceData) {
    try {
      const { name, description = '', ownerId, settings = {} } = workspaceData;

      // Validate required fields
      if (!name || !ownerId) {
        throw new Error('Workspace name and owner ID are required');
      }

      // Check if workspace name already exists for this owner
      const existingWorkspace = await this.getWorkspaceByName(name, ownerId);
      if (existingWorkspace) {
        throw new Error('A workspace with this name already exists');
      }

      // Create workspace document
      const workspace = {
        name: name.trim(),
        description: description.trim(),
        ownerId,
        members: [
          {
            userId: ownerId,
            role: 'owner',
            permissions: ['all'],
            joinedAt: new Date(),
            addedBy: ownerId,
          }
        ],
        projectCount: 0,
        settings: {
          allowGuestAccess: false,
          maxProjects: 10,
          maxMembers: 10,
          allowPublicProjects: false,
          requireApprovalForMembers: false,
          ...settings,
        },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          plan: 'free', // free, starter, professional, enterprise
          billingEmail: null,
          lastActivityAt: new Date(),
        },
        billing: {
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          credits: {
            balance: 100, // Free plan default
            monthlyAllocation: 100,
            additionalCredits: 0,
            resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1), // First day of next month
          },
          status: 'active',
        },
      };

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');
      
      const result = await workspacesCollection.insertOne(workspace);
      const workspaceId = result.insertedId.toString();

      // Cache the workspace
      await this.cacheWorkspace(workspaceId, { ...workspace, id: workspaceId, _id: undefined });

      this.logger.info('Workspace created successfully', {
        workspaceId,
        name: workspace.name,
        ownerId,
      });

      return {
        id: workspaceId,
        name: workspace.name,
        description: workspace.description,
        ownerId: workspace.ownerId,
        members: workspace.members,
        projectCount: workspace.projectCount,
        settings: workspace.settings,
        status: workspace.status,
        createdAt: workspace.createdAt,
      };

    } catch (error) {
      this.logger.error('Failed to create workspace', error, { 
        name: workspaceData.name, 
        ownerId: workspaceData.ownerId 
      });
      throw error;
    }
  }

  async getWorkspace(workspaceId) {
    try {
      if (!Validators.isValidObjectId(workspaceId)) {
        return null;
      }

      // Try cache first
      const cachedWorkspace = await this.getCachedWorkspace(workspaceId);
      if (cachedWorkspace) {
        return cachedWorkspace;
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');
      
      const workspace = await workspacesCollection.findOne({ 
        _id: MongoClient.createObjectId(workspaceId),
        status: { $ne: 'deleted' }
      });

      if (!workspace) {
        return null;
      }

      const formattedWorkspace = {
        id: workspace._id.toString(),
        name: workspace.name,
        description: workspace.description,
        ownerId: workspace.ownerId,
        members: workspace.members || [],
        projectCount: workspace.projectCount || 0,
        settings: workspace.settings,
        status: workspace.status,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        metadata: workspace.metadata,
      };

      // Cache the workspace
      await this.cacheWorkspace(workspaceId, formattedWorkspace);

      return formattedWorkspace;

    } catch (error) {
      this.logger.error('Failed to get workspace', error, { workspaceId });
      throw error;
    }
  }

  async getWorkspaceByName(name, ownerId) {
    try {
      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');
      
      const workspace = await workspacesCollection.findOne({ 
        name: name.trim(),
        ownerId,
        status: { $ne: 'deleted' }
      });

      if (!workspace) {
        return null;
      }

      return {
        id: workspace._id.toString(),
        name: workspace.name,
        description: workspace.description,
        ownerId: workspace.ownerId,
        members: workspace.members || [],
        projectCount: workspace.projectCount || 0,
        settings: workspace.settings,
        status: workspace.status,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      };

    } catch (error) {
      this.logger.error('Failed to get workspace by name', error, { name, ownerId });
      throw error;
    }
  }

  async getUserWorkspaces(userId) {
    try {
      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      const workspaces = await workspacesCollection
        .find({
          'members.userId': userId,
          status: { $ne: 'deleted' }
        })
        .sort({ updatedAt: -1 })
        .toArray();

      return workspaces.map(workspace => {
        const member = workspace.members.find(m => m.userId === userId);
        return {
          id: workspace._id.toString(),
          name: workspace.name,
          description: workspace.description,
          ownerId: workspace.ownerId,
          userRole: member?.role || 'member',
          projectCount: workspace.projectCount || 0,
          maxProjects: workspace.settings?.maxProjects || 10,
          members: workspace.members || [],
          settings: workspace.settings,
          status: workspace.status,
          createdAt: workspace.createdAt,
          joinedAt: member?.joinedAt,
        };
      });

    } catch (error) {
      this.logger.error('Failed to get user workspaces', error, { userId });
      throw error;
    }
  }

  async updateWorkspace(workspaceId, updates) {
    try {
      if (!Validators.isValidObjectId(workspaceId)) {
        throw new Error('Invalid workspace ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Prepare update data
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      // Validate settings if being updated
      if (updates.settings) {
        updateData.settings = {
          allowGuestAccess: false,
          maxProjects: 10,
          maxMembers: 10,
          allowPublicProjects: false,
          requireApprovalForMembers: false,
          ...updates.settings,
        };
      }

      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      // Get updated workspace
      const updatedWorkspace = await this.getWorkspace(workspaceId);

      this.logger.info('Workspace updated', {
        workspaceId,
        updatedFields: Object.keys(updates),
      });

      return updatedWorkspace;

    } catch (error) {
      this.logger.error('Failed to update workspace', error, { workspaceId, updates });
      throw error;
    }
  }

  async addMember(workspaceId, memberData) {
    try {
      const { userId, role = 'member', permissions = ['read_projects'], addedBy, joinedAt = new Date() } = memberData;

      if (!Validators.isValidObjectId(workspaceId) || !userId) {
        throw new Error('Invalid workspace ID or user ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Check if user is already a member
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const existingMember = workspace.members.find(m => m.userId === userId);
      if (existingMember) {
        throw new Error('User is already a member of this workspace');
      }

      // Check member limits
      if (workspace.members.length >= workspace.settings.maxMembers) {
        throw new Error('Workspace has reached its member limit');
      }

      const newMember = {
        userId,
        role,
        permissions,
        joinedAt,
        addedBy,
      };

      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        { 
          $push: { members: newMember },
          $set: { updatedAt: new Date() }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.info('Member added to workspace', {
        workspaceId,
        userId,
        role,
        addedBy,
      });

      return newMember;

    } catch (error) {
      this.logger.error('Failed to add member to workspace', error, { workspaceId, memberData });
      throw error;
    }
  }

  async removeMember(workspaceId, userId) {
    try {
      if (!Validators.isValidObjectId(workspaceId) || !userId) {
        throw new Error('Invalid workspace ID or user ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Check if workspace exists and user is a member
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Cannot remove the owner
      if (workspace.ownerId === userId) {
        throw new Error('Cannot remove the workspace owner');
      }

      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        { 
          $pull: { members: { userId } },
          $set: { updatedAt: new Date() }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.info('Member removed from workspace', {
        workspaceId,
        userId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to remove member from workspace', error, { workspaceId, userId });
      throw error;
    }
  }

  async updateMember(workspaceId, userId, updates) {
    try {
      if (!Validators.isValidObjectId(workspaceId) || !userId) {
        throw new Error('Invalid workspace ID or user ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Build update query for array element
      const setFields = {};
      if (updates.role) {
        setFields['members.$.role'] = updates.role;
      }
      if (updates.permissions) {
        setFields['members.$.permissions'] = updates.permissions;
      }
      setFields.updatedAt = new Date();

      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          'members.userId': userId,
          status: { $ne: 'deleted' }
        },
        { $set: setFields }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace or member not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.info('Workspace member updated', {
        workspaceId,
        userId,
        updates,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to update workspace member', error, { workspaceId, userId, updates });
      throw error;
    }
  }

  async transferOwnership(workspaceId, newOwnerId) {
    try {
      if (!Validators.isValidObjectId(workspaceId) || !newOwnerId) {
        throw new Error('Invalid workspace ID or new owner ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Update workspace ownership and member roles
      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        {
          $set: {
            ownerId: newOwnerId,
            updatedAt: new Date(),
            'members.$[newOwner].role': 'owner',
            'members.$[oldOwner].role': 'admin',
          }
        },
        {
          arrayFilters: [
            { 'newOwner.userId': newOwnerId },
            { 'oldOwner.role': 'owner' }
          ]
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.info('Workspace ownership transferred', {
        workspaceId,
        newOwnerId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to transfer workspace ownership', error, { workspaceId, newOwnerId });
      throw error;
    }
  }

  async deleteWorkspace(workspaceId, reason = 'user_request') {
    try {
      if (!Validators.isValidObjectId(workspaceId)) {
        throw new Error('Invalid workspace ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      // Soft delete
      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        {
          $set: {
            status: 'deleted',
            deletedAt: new Date(),
            deletedReason: reason,
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.info('Workspace soft deleted', {
        workspaceId,
        reason,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to delete workspace', error, { workspaceId, reason });
      throw error;
    }
  }

  async incrementProjectCount(workspaceId) {
    try {
      return await this.updateProjectCount(workspaceId, 1);
    } catch (error) {
      this.logger.error('Failed to increment project count', error, { workspaceId });
      throw error;
    }
  }

  async decrementProjectCount(workspaceId) {
    try {
      return await this.updateProjectCount(workspaceId, -1);
    } catch (error) {
      this.logger.error('Failed to decrement project count', error, { workspaceId });
      throw error;
    }
  }

  async updateProjectCount(workspaceId, increment) {
    try {
      if (!Validators.isValidObjectId(workspaceId)) {
        throw new Error('Invalid workspace ID');
      }

      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');

      const result = await workspacesCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(workspaceId),
          status: { $ne: 'deleted' }
        },
        {
          $inc: { projectCount: increment },
          $set: { 
            updatedAt: new Date(),
            'metadata.lastActivityAt': new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Workspace not found');
      }

      // Invalidate cache
      await this.invalidateWorkspaceCache(workspaceId);

      this.logger.debug('Project count updated', {
        workspaceId,
        increment,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to update project count', error, { workspaceId, increment });
      throw error;
    }
  }

  async getWorkspaceMembers(workspaceId) {
    try {
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      return workspace.members || [];

    } catch (error) {
      this.logger.error('Failed to get workspace members', error, { workspaceId });
      throw error;
    }
  }

  async getWorkspaceUsage(workspaceId) {
    try {
      const workspace = await this.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Get current period usage
      const currentDate = new Date();
      const billingPeriodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const billingPeriodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const usage = {
        projectCount: workspace.projectCount || 0,
        memberCount: workspace.members?.length || 0,
        storage: {
          current: 0, // Would need to calculate from actual projects
          maximum: 1024 * 1024 * 1024, // 1GB default
          percentage: 0,
        },
        billingPeriodStart,
        billingPeriodEnd,
        warnings: [],
      };

      // Check for usage warnings
      const projectUsageRatio = usage.projectCount / workspace.settings.maxProjects;
      if (projectUsageRatio >= 0.8) {
        usage.warnings.push({
          type: 'project_limit',
          message: `Approaching project limit (${usage.projectCount}/${workspace.settings.maxProjects})`,
          severity: projectUsageRatio >= 0.95 ? 'high' : 'medium',
        });
      }

      const memberUsageRatio = usage.memberCount / workspace.settings.maxMembers;
      if (memberUsageRatio >= 0.8) {
        usage.warnings.push({
          type: 'member_limit',
          message: `Approaching member limit (${usage.memberCount}/${workspace.settings.maxMembers})`,
          severity: memberUsageRatio >= 0.95 ? 'high' : 'medium',
        });
      }

      return usage;

    } catch (error) {
      this.logger.error('Failed to get workspace usage', error, { workspaceId });
      throw error;
    }
  }

  async getWorkspaceActivity(workspaceId, options = {}) {
    try {
      const { page = 1, limit = 50, type } = options;

      // This would typically read from an activity log collection
      // For now, return a basic structure
      const activities = [];

      return {
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };

    } catch (error) {
      this.logger.error('Failed to get workspace activity', error, { workspaceId, options });
      throw error;
    }
  }

  // Cache management methods
  async cacheWorkspace(workspaceId, workspace) {
    try {
      const cacheKey = `workspace:${workspaceId}`;
      await this.setCachedData(cacheKey, workspace, this.workspaceCacheTTL);
    } catch (error) {
      this.logger.warn('Failed to cache workspace', error, { workspaceId });
    }
  }

  async getCachedWorkspace(workspaceId) {
    try {
      const cacheKey = `workspace:${workspaceId}`;
      return await this.getCachedData(cacheKey);
    } catch (error) {
      this.logger.warn('Failed to get cached workspace', error, { workspaceId });
      return null;
    }
  }

  async invalidateWorkspaceCache(workspaceId) {
    try {
      const cacheKey = `workspace:${workspaceId}`;
      await this.redisClient.del(cacheKey);
    } catch (error) {
      this.logger.warn('Failed to invalidate workspace cache', error, { workspaceId });
    }
  }

  async setCachedData(key, data, ttl) {
    try {
      await this.redisClient.set(key, data, ttl);
    } catch (error) {
      this.logger.warn('Failed to set cached data', error, { key });
    }
  }

  async getCachedData(key) {
    try {
      return await this.redisClient.get(key);
    } catch (error) {
      this.logger.warn('Failed to get cached data', error, { key });
      return null;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const db = this.mongoClient.getDb();
      const workspacesCollection = db.collection('workspaces');
      
      // Simple query to test database connectivity
      await workspacesCollection.findOne({}, { projection: { _id: 1 } });
      
      return {
        status: 'ok',
        component: 'workspace-manager',
      };

    } catch (error) {
      this.logger.error('Workspace manager health check failed', error);
      return {
        status: 'error',
        component: 'workspace-manager',
        error: error.message,
      };
    }
  }
}

export { WorkspaceManager };