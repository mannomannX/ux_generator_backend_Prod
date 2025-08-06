// ==========================================
// SERVICES/USER-MANAGEMENT/src/events/event-handlers.js
// ==========================================
import { EventTypes } from '@ux-flow/common';

class EventHandlers {
  constructor(logger, eventEmitter, userManager, workspaceManager) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.userManager = userManager;
    this.workspaceManager = workspaceManager;
  }

  setupAllHandlers() {
    // User lifecycle events
    this.eventEmitter.on(EventTypes.USER_REGISTRATION_REQUESTED, 
      this.handleUserRegistration.bind(this)
    );

    this.eventEmitter.on(EventTypes.USER_LOGIN_REQUESTED,
      this.handleUserLogin.bind(this)
    );

    this.eventEmitter.on(EventTypes.USER_PROFILE_UPDATE_REQUESTED,
      this.handleUserProfileUpdate.bind(this)
    );

    this.eventEmitter.on(EventTypes.USER_DELETION_REQUESTED,
      this.handleUserDeletion.bind(this)
    );

    // Workspace lifecycle events
    this.eventEmitter.on(EventTypes.WORKSPACE_CREATION_REQUESTED,
      this.handleWorkspaceCreation.bind(this)
    );

    this.eventEmitter.on(EventTypes.WORKSPACE_MEMBER_ADDED,
      this.handleWorkspaceMemberAdded.bind(this)
    );

    this.eventEmitter.on(EventTypes.WORKSPACE_MEMBER_REMOVED,
      this.handleWorkspaceMemberRemoved.bind(this)
    );

    // Cross-service integration events
    this.eventEmitter.on('PROJECT_CREATED',
      this.handleProjectCreated.bind(this)
    );

    this.eventEmitter.on('PROJECT_DELETED',
      this.handleProjectDeleted.bind(this)
    );

    // GDPR compliance events
    this.eventEmitter.on('USER_DATA_EXPORT_REQUESTED',
      this.handleUserDataExport.bind(this)
    );

    this.eventEmitter.on('USER_DATA_DELETION_REQUESTED',
      this.handleUserDataDeletion.bind(this)
    );

    this.logger.info('User Management Service event handlers setup completed');
  }

  async handleUserRegistration(data) {
    try {
      const { email, password, firstName, lastName, workspaceName, correlationId } = data;

      this.logger.info('Processing user registration', {
        email,
        hasWorkspaceName: !!workspaceName,
        correlationId,
      });

      // Create user
      const user = await this.userManager.createUser({
        email,
        password,
        firstName,
        lastName,
      });

      // Create workspace if provided
      let workspace = null;
      if (workspaceName) {
        workspace = await this.workspaceManager.createWorkspace({
          name: workspaceName,
          ownerId: user.id,
          settings: {
            allowGuestAccess: false,
            maxProjects: 10, // Default limit for new workspaces
          },
        });

        // Update user with workspace reference
        await this.userManager.updateUser(user.id, {
          workspaceId: workspace.id,
        });
      }

      // Emit success event
      this.eventEmitter.emit(EventTypes.USER_REGISTERED, {
        userId: user.id,
        email: user.email,
        workspaceId: workspace?.id,
        firstName: user.firstName,
        lastName: user.lastName,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      // Trigger knowledge space initialization if workspace was created
      if (workspace) {
        this.eventEmitter.emit('WORKSPACE_CREATED', {
          workspaceId: workspace.id,
          userId: user.id,
          workspaceName,
          settings: workspace.settings,
          correlationId,
        });
      }

      this.logger.info('User registration completed successfully', {
        userId: user.id,
        email: user.email,
        workspaceId: workspace?.id,
      });

    } catch (error) {
      this.logger.error('Failed to handle user registration', error, {
        email: data.email,
        correlationId: data.correlationId,
      });

      // Emit error event
      this.eventEmitter.emit(EventTypes.USER_REGISTRATION_FAILED, {
        email: data.email,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleUserLogin(data) {
    try {
      const { email, password, correlationId } = data;

      this.logger.info('Processing user login', {
        email,
        correlationId,
      });

      // Authenticate user
      const authResult = await this.userManager.authenticateUser(email, password);

      if (!authResult.success) {
        this.eventEmitter.emit(EventTypes.USER_LOGIN_FAILED, {
          email,
          reason: authResult.reason,
          timestamp: new Date().toISOString(),
          correlationId,
        });
        return;
      }

      // Update last login timestamp
      await this.userManager.updateUser(authResult.user.id, {
        lastLoginAt: new Date(),
      });

      // Emit success event
      this.eventEmitter.emit(EventTypes.USER_LOGGED_IN, {
        userId: authResult.user.id,
        email: authResult.user.email,
        workspaceId: authResult.user.workspaceId,
        role: authResult.user.role,
        permissions: authResult.user.permissions,
        token: authResult.token,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('User login completed successfully', {
        userId: authResult.user.id,
        email: authResult.user.email,
      });

    } catch (error) {
      this.logger.error('Failed to handle user login', error, {
        email: data.email,
        correlationId: data.correlationId,
      });

      this.eventEmitter.emit(EventTypes.USER_LOGIN_FAILED, {
        email: data.email,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleUserProfileUpdate(data) {
    try {
      const { userId, updates, correlationId } = data;

      this.logger.info('Processing user profile update', {
        userId,
        updateFields: Object.keys(updates),
        correlationId,
      });

      const updatedUser = await this.userManager.updateUser(userId, updates);

      // Emit success event
      this.eventEmitter.emit(EventTypes.USER_PROFILE_UPDATED, {
        userId,
        updates,
        user: updatedUser,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('User profile update completed', {
        userId,
        updatedFields: Object.keys(updates),
      });

    } catch (error) {
      this.logger.error('Failed to handle user profile update', error, {
        userId: data.userId,
        correlationId: data.correlationId,
      });

      this.eventEmitter.emit(EventTypes.USER_PROFILE_UPDATE_FAILED, {
        userId: data.userId,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleUserDeletion(data) {
    try {
      const { userId, reason = 'user_request', correlationId } = data;

      this.logger.info('Processing user deletion', {
        userId,
        reason,
        correlationId,
      });

      // Get user data before deletion for cleanup
      const user = await this.userManager.getUser(userId);
      
      // Soft delete user
      await this.userManager.deleteUser(userId, reason);

      // Emit event for cross-service cleanup
      this.eventEmitter.emit(EventTypes.USER_DELETED, {
        userId,
        email: user.email,
        workspaceId: user.workspaceId,
        reason,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      // If user was workspace owner, handle workspace deletion
      if (user.workspaceId) {
        const workspace = await this.workspaceManager.getWorkspace(user.workspaceId);
        if (workspace.ownerId === userId) {
          await this.handleWorkspaceOwnerDeletion(workspace, correlationId);
        }
      }

      this.logger.info('User deletion completed', {
        userId,
        reason,
      });

    } catch (error) {
      this.logger.error('Failed to handle user deletion', error, {
        userId: data.userId,
        correlationId: data.correlationId,
      });
    }
  }

  async handleWorkspaceCreation(data) {
    try {
      const { name, ownerId, settings, correlationId } = data;

      this.logger.info('Processing workspace creation', {
        name,
        ownerId,
        correlationId,
      });

      const workspace = await this.workspaceManager.createWorkspace({
        name,
        ownerId,
        settings: {
          allowGuestAccess: false,
          maxProjects: 10,
          ...settings,
        },
      });

      // Emit success event
      this.eventEmitter.emit(EventTypes.WORKSPACE_CREATED, {
        workspaceId: workspace.id,
        name: workspace.name,
        ownerId,
        settings: workspace.settings,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      // Trigger knowledge space creation
      this.eventEmitter.emit('WORKSPACE_CREATED', {
        workspaceId: workspace.id,
        userId: ownerId,
        workspaceName: name,
        settings: workspace.settings,
        correlationId,
      });

      this.logger.info('Workspace creation completed', {
        workspaceId: workspace.id,
        name,
        ownerId,
      });

    } catch (error) {
      this.logger.error('Failed to handle workspace creation', error, {
        name: data.name,
        ownerId: data.ownerId,
        correlationId: data.correlationId,
      });
    }
  }

  async handleWorkspaceMemberAdded(data) {
    try {
      const { workspaceId, userId, role, addedBy, correlationId } = data;

      this.logger.info('Processing workspace member addition', {
        workspaceId,
        userId,
        role,
        addedBy,
        correlationId,
      });

      await this.workspaceManager.addMember(workspaceId, {
        userId,
        role: role || 'member',
        addedBy,
        joinedAt: new Date(),
      });

      // Update user's workspace reference if they don't have one
      const user = await this.userManager.getUser(userId);
      if (!user.workspaceId) {
        await this.userManager.updateUser(userId, {
          workspaceId,
        });
      }

      // Emit success event
      this.eventEmitter.emit(EventTypes.WORKSPACE_MEMBER_ADDED, {
        workspaceId,
        userId,
        role,
        addedBy,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('Workspace member addition completed', {
        workspaceId,
        userId,
        role,
      });

    } catch (error) {
      this.logger.error('Failed to handle workspace member addition', error, {
        workspaceId: data.workspaceId,
        userId: data.userId,
        correlationId: data.correlationId,
      });
    }
  }

  async handleWorkspaceMemberRemoved(data) {
    try {
      const { workspaceId, userId, removedBy, reason = 'removed', correlationId } = data;

      this.logger.info('Processing workspace member removal', {
        workspaceId,
        userId,
        removedBy,
        reason,
        correlationId,
      });

      await this.workspaceManager.removeMember(workspaceId, userId);

      // Clear user's workspace reference if this was their primary workspace
      const user = await this.userManager.getUser(userId);
      if (user.workspaceId === workspaceId) {
        await this.userManager.updateUser(userId, {
          workspaceId: null,
        });
      }

      // Emit success event
      this.eventEmitter.emit(EventTypes.WORKSPACE_MEMBER_REMOVED, {
        workspaceId,
        userId,
        removedBy,
        reason,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('Workspace member removal completed', {
        workspaceId,
        userId,
        reason,
      });

    } catch (error) {
      this.logger.error('Failed to handle workspace member removal', error, {
        workspaceId: data.workspaceId,
        userId: data.userId,
        correlationId: data.correlationId,
      });
    }
  }

  async handleProjectCreated(data) {
    try {
      const { projectId, workspaceId, userId, projectName, correlationId } = data;

      this.logger.info('Processing project creation notification', {
        projectId,
        workspaceId,
        userId,
        projectName,
        correlationId,
      });

      // Update workspace project count
      await this.workspaceManager.incrementProjectCount(workspaceId);

      // Check if workspace is approaching project limits
      const workspace = await this.workspaceManager.getWorkspace(workspaceId);
      const usageRatio = workspace.projectCount / workspace.settings.maxProjects;
      
      if (usageRatio >= 0.8) {
        this.eventEmitter.emit('WORKSPACE_USAGE_WARNING', {
          workspaceId,
          currentProjects: workspace.projectCount,
          maxProjects: workspace.settings.maxProjects,
          usageRatio,
          correlationId,
        });
      }

      this.logger.info('Project creation notification processed', {
        projectId,
        workspaceId,
        newProjectCount: workspace.projectCount + 1,
      });

    } catch (error) {
      this.logger.error('Failed to handle project creation notification', error, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });
    }
  }

  async handleProjectDeleted(data) {
    try {
      const { projectId, workspaceId, userId, correlationId } = data;

      this.logger.info('Processing project deletion notification', {
        projectId,
        workspaceId,
        userId,
        correlationId,
      });

      // Update workspace project count
      await this.workspaceManager.decrementProjectCount(workspaceId);

      this.logger.info('Project deletion notification processed', {
        projectId,
        workspaceId,
      });

    } catch (error) {
      this.logger.error('Failed to handle project deletion notification', error, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });
    }
  }

  async handleUserDataExport(data) {
    try {
      const { userId, correlationId } = data;

      this.logger.info('Processing user data export request', {
        userId,
        correlationId,
      });

      // Collect user data
      const user = await this.userManager.getUser(userId);
      const userWorkspaces = await this.workspaceManager.getUserWorkspaces(userId);

      const exportData = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
        workspaces: userWorkspaces.map(ws => ({
          id: ws.id,
          name: ws.name,
          role: ws.userRole,
          joinedAt: ws.joinedAt,
        })),
        exportedAt: new Date().toISOString(),
        format: 'json',
      };

      // Emit event for other services to add their data
      this.eventEmitter.emit('USER_DATA_EXPORT_READY', {
        userId,
        exportData,
        correlationId,
      });

      this.logger.info('User data export completed', {
        userId,
        workspaceCount: userWorkspaces.length,
      });

    } catch (error) {
      this.logger.error('Failed to handle user data export', error, {
        userId: data.userId,
        correlationId: data.correlationId,
      });
    }
  }

  async handleUserDataDeletion(data) {
    try {
      const { userId, correlationId } = data;

      this.logger.info('Processing user data deletion request (GDPR)', {
        userId,
        correlationId,
      });

      // Get user info before deletion
      const user = await this.userManager.getUser(userId);

      // Hard delete user and related data
      await this.userManager.hardDeleteUser(userId);

      // Emit event for other services to delete their data
      this.eventEmitter.emit('USER_DATA_DELETED', {
        userId,
        email: user.email,
        workspaceId: user.workspaceId,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('User data deletion completed (GDPR)', {
        userId,
        email: user.email,
      });

    } catch (error) {
      this.logger.error('Failed to handle user data deletion', error, {
        userId: data.userId,
        correlationId: data.correlationId,
      });
    }
  }

  // Helper method for workspace owner deletion
  async handleWorkspaceOwnerDeletion(workspace, correlationId) {
    try {
      this.logger.info('Handling workspace owner deletion', {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      });

      // Check if workspace has other members
      const members = await this.workspaceManager.getWorkspaceMembers(workspace.id);
      const otherMembers = members.filter(m => m.userId !== workspace.ownerId);

      if (otherMembers.length > 0) {
        // Transfer ownership to the oldest admin member
        const adminMembers = otherMembers.filter(m => m.role === 'admin');
        const newOwner = adminMembers.length > 0 ? adminMembers[0] : otherMembers[0];

        await this.workspaceManager.transferOwnership(workspace.id, newOwner.userId);
        
        this.logger.info('Workspace ownership transferred', {
          workspaceId: workspace.id,
          newOwnerId: newOwner.userId,
        });
      } else {
        // No other members, delete the workspace
        await this.workspaceManager.deleteWorkspace(workspace.id);
        
        this.eventEmitter.emit('WORKSPACE_DELETED', {
          workspaceId: workspace.id,
          reason: 'owner_deleted',
          timestamp: new Date().toISOString(),
          correlationId,
        });

        this.logger.info('Workspace deleted due to owner deletion', {
          workspaceId: workspace.id,
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle workspace owner deletion', error, {
        workspaceId: workspace.id,
      });
    }
  }
}

export { EventHandlers };