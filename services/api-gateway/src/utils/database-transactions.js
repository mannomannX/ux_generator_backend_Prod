// ==========================================
// SERVICES/API-GATEWAY/src/utils/database-transactions.js
// ==========================================

/**
 * Database transaction utilities for critical operations
 */
export class DatabaseTransactions {
  constructor(mongoClient, logger) {
    this.mongoClient = mongoClient;
    this.logger = logger;
    this.activeTransactions = new Map();
  }

  /**
   * Execute operation within a MongoDB transaction
   */
  async withTransaction(operation, options = {}) {
    const {
      retryAttempts = 3,
      timeout = 30000,
      readConcern = 'majority',
      writeConcern = { w: 'majority', j: true },
      transactionId = this.generateTransactionId()
    } = options;

    const session = this.mongoClient.client.startSession();
    this.activeTransactions.set(transactionId, { session, startTime: Date.now() });
    
    let attempt = 0;
    
    while (attempt < retryAttempts) {
      attempt++;
      
      try {
        this.logger.debug('Starting database transaction', {
          transactionId,
          attempt,
          timeout,
          readConcern,
          writeConcern
        });

        const result = await session.withTransaction(
          async () => {
            return await operation(session);
          },
          {
            readConcern: { level: readConcern },
            writeConcern,
            maxCommitTimeMS: timeout
          }
        );

        this.logger.info('Database transaction completed successfully', {
          transactionId,
          attempt,
          duration: Date.now() - this.activeTransactions.get(transactionId).startTime
        });

        return result;
      } catch (error) {
        this.logger.error('Database transaction failed', {
          transactionId,
          attempt,
          maxAttempts: retryAttempts,
          error: error.message,
          errorCode: error.code,
          errorLabels: error.errorLabels
        });

        // Check if error is retryable
        if (attempt >= retryAttempts || !this.isRetryableError(error)) {
          throw error;
        }

        // Exponential backoff
        const backoffTime = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } finally {
        this.activeTransactions.delete(transactionId);
        await session.endSession();
      }
    }
  }

  /**
   * Create user with workspace atomically
   */
  async createUserWithWorkspace(userData, workspaceData) {
    return this.withTransaction(async (session) => {
      const db = this.mongoClient.getDb();
      
      // Create workspace first
      const workspaceResult = await db.collection('workspaces').insertOne(workspaceData, { session });
      const workspaceId = workspaceResult.insertedId.toString();
      
      // Update user data with workspace ID
      const userDataWithWorkspace = {
        ...userData,
        workspaceId
      };
      
      // Create user
      const userResult = await db.collection('users').insertOne(userDataWithWorkspace, { session });
      const userId = userResult.insertedId.toString();
      
      // Update workspace with owner information
      await db.collection('workspaces').updateOne(
        { _id: workspaceResult.insertedId },
        {
          $set: {
            ownerId: userId,
            members: [{
              userId,
              role: 'owner',
              permissions: ['read', 'write', 'admin', 'invite'],
              joinedAt: new Date()
            }],
            updatedAt: new Date()
          }
        },
        { session }
      );

      return {
        user: { id: userId, ...userDataWithWorkspace },
        workspace: { id: workspaceId, ...workspaceData }
      };
    });
  }

  /**
   * Update project and notify members atomically
   */
  async updateProjectWithNotification(projectId, updates, notificationData) {
    return this.withTransaction(async (session) => {
      const db = this.mongoClient.getDb();
      
      // Update project
      const projectResult = await db.collection('projects').findOneAndUpdate(
        { _id: this.mongoClient.createObjectId(projectId) },
        { $set: { ...updates, updatedAt: new Date() } },
        { session, returnDocument: 'after' }
      );

      if (!projectResult.value) {
        throw new Error('Project not found');
      }

      // Create notifications for all members
      const members = projectResult.value.members || [];
      const notifications = members.map(member => ({
        userId: member.userId,
        projectId,
        type: 'project_updated',
        data: notificationData,
        createdAt: new Date(),
        read: false
      }));

      if (notifications.length > 0) {
        await db.collection('notifications').insertMany(notifications, { session });
      }

      // Update project activity log
      await db.collection('project_activities').insertOne({
        projectId,
        type: 'project_updated',
        data: {
          updates: Object.keys(updates),
          ...notificationData
        },
        createdAt: new Date()
      }, { session });

      return projectResult.value;
    });
  }

  /**
   * Add member to project with permission checks
   */
  async addProjectMember(projectId, newMember, inviterId) {
    return this.withTransaction(async (session) => {
      const db = this.mongoClient.getDb();
      
      // Verify project exists and inviter has permission
      const project = await db.collection('projects').findOne(
        { _id: this.mongoClient.createObjectId(projectId) },
        { session }
      );

      if (!project) {
        throw new Error('Project not found');
      }

      // Check if inviter has permission to add members
      const inviterMember = project.members?.find(m => m.userId === inviterId);
      if (!inviterMember || !inviterMember.permissions.includes('invite')) {
        throw new Error('Insufficient permissions to add members');
      }

      // Check if user is already a member
      const existingMember = project.members?.find(m => m.userId === newMember.userId);
      if (existingMember) {
        throw new Error('User is already a member of this project');
      }

      // Verify user exists
      const user = await db.collection('users').findOne(
        { _id: this.mongoClient.createObjectId(newMember.userId) },
        { session }
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Add member to project
      const memberData = {
        userId: newMember.userId,
        role: newMember.role || 'viewer',
        permissions: newMember.permissions || ['read'],
        joinedAt: new Date(),
        invitedBy: inviterId
      };

      await db.collection('projects').updateOne(
        { _id: project._id },
        { 
          $push: { members: memberData },
          $set: { updatedAt: new Date() }
        },
        { session }
      );

      // Create notification for new member
      await db.collection('notifications').insertOne({
        userId: newMember.userId,
        type: 'project_invitation',
        data: {
          projectId,
          projectName: project.name,
          inviterName: inviterMember.userName || 'Someone',
          role: memberData.role
        },
        createdAt: new Date(),
        read: false
      }, { session });

      // Log activity
      await db.collection('project_activities').insertOne({
        projectId,
        type: 'member_added',
        data: {
          newMemberId: newMember.userId,
          newMemberRole: memberData.role,
          inviterId
        },
        createdAt: new Date()
      }, { session });

      return memberData;
    });
  }

  /**
   * Delete project and cleanup all related data
   */
  async deleteProjectWithCleanup(projectId, deleterId) {
    return this.withTransaction(async (session) => {
      const db = this.mongoClient.getDb();
      
      // Get project to verify ownership
      const project = await db.collection('projects').findOne(
        { _id: this.mongoClient.createObjectId(projectId) },
        { session }
      );

      if (!project) {
        throw new Error('Project not found');
      }

      // Check if user has permission to delete
      if (project.ownerId !== deleterId) {
        const member = project.members?.find(m => m.userId === deleterId);
        if (!member || !member.permissions.includes('admin')) {
          throw new Error('Insufficient permissions to delete project');
        }
      }

      // Soft delete project
      await db.collection('projects').updateOne(
        { _id: project._id },
        {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: deleterId,
            status: 'deleted'
          }
        },
        { session }
      );

      // Archive related conversations
      await db.collection('conversations').updateMany(
        { projectId },
        {
          $set: {
            archived: true,
            archivedAt: new Date(),
            archivedReason: 'project_deleted'
          }
        },
        { session }
      );

      // Create notifications for all members
      const members = project.members || [];
      const notifications = members
        .filter(m => m.userId !== deleterId)
        .map(member => ({
          userId: member.userId,
          type: 'project_deleted',
          data: {
            projectId,
            projectName: project.name,
            deletedBy: deleterId
          },
          createdAt: new Date(),
          read: false
        }));

      if (notifications.length > 0) {
        await db.collection('notifications').insertMany(notifications, { session });
      }

      // Log deletion activity
      await db.collection('project_activities').insertOne({
        projectId,
        type: 'project_deleted',
        data: {
          projectName: project.name,
          deletedBy: deleterId,
          memberCount: members.length
        },
        createdAt: new Date()
      }, { session });

      return { success: true, projectName: project.name };
    });
  }

  /**
   * Transfer project ownership
   */
  async transferProjectOwnership(projectId, currentOwnerId, newOwnerId) {
    return this.withTransaction(async (session) => {
      const db = this.mongoClient.getDb();
      
      // Verify project exists and current ownership
      const project = await db.collection('projects').findOne(
        { _id: this.mongoClient.createObjectId(projectId) },
        { session }
      );

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.ownerId !== currentOwnerId) {
        throw new Error('Only the current owner can transfer ownership');
      }

      // Verify new owner exists and is a project member
      const newOwner = await db.collection('users').findOne(
        { _id: this.mongoClient.createObjectId(newOwnerId) },
        { session }
      );

      if (!newOwner) {
        throw new Error('New owner user not found');
      }

      const newOwnerMember = project.members?.find(m => m.userId === newOwnerId);
      if (!newOwnerMember) {
        throw new Error('New owner must be a project member');
      }

      // Update project ownership
      await db.collection('projects').updateOne(
        { _id: project._id },
        {
          $set: {
            ownerId: newOwnerId,
            updatedAt: new Date()
          }
        },
        { session }
      );

      // Update member permissions
      await db.collection('projects').updateOne(
        { _id: project._id, 'members.userId': newOwnerId },
        {
          $set: {
            'members.$.role': 'owner',
            'members.$.permissions': ['read', 'write', 'admin', 'invite', 'transfer']
          }
        },
        { session }
      );

      // Update previous owner to admin
      await db.collection('projects').updateOne(
        { _id: project._id, 'members.userId': currentOwnerId },
        {
          $set: {
            'members.$.role': 'admin',
            'members.$.permissions': ['read', 'write', 'admin', 'invite']
          }
        },
        { session }
      );

      // Create notifications
      const notifications = [
        {
          userId: newOwnerId,
          type: 'ownership_transferred',
          data: {
            projectId,
            projectName: project.name,
            previousOwner: currentOwnerId,
            role: 'new_owner'
          },
          createdAt: new Date(),
          read: false
        },
        {
          userId: currentOwnerId,
          type: 'ownership_transferred',
          data: {
            projectId,
            projectName: project.name,
            newOwner: newOwnerId,
            role: 'previous_owner'
          },
          createdAt: new Date(),
          read: false
        }
      ];

      await db.collection('notifications').insertMany(notifications, { session });

      // Log activity
      await db.collection('project_activities').insertOne({
        projectId,
        type: 'ownership_transferred',
        data: {
          previousOwner: currentOwnerId,
          newOwner: newOwnerId,
          projectName: project.name
        },
        createdAt: new Date()
      }, { session });

      return { success: true, newOwner: newOwnerId };
    });
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    // Retryable error codes for MongoDB transactions
    const retryableErrors = [
      'TransientTransactionError',
      'UnknownTransactionCommitResult',
      'WriteConflict',
      'LockTimeout',
      'ExceededTimeLimit'
    ];

    return error.errorLabels?.some(label => retryableErrors.includes(label)) ||
           retryableErrors.includes(error.codeName) ||
           [112, 117, 118, 119].includes(error.code); // Specific MongoDB error codes
  }

  /**
   * Generate unique transaction ID
   */
  generateTransactionId() {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active transaction count
   */
  getActiveTransactionCount() {
    return this.activeTransactions.size;
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats() {
    const now = Date.now();
    const transactions = Array.from(this.activeTransactions.values());
    
    return {
      activeCount: transactions.length,
      averageDuration: transactions.length > 0 ? 
        transactions.reduce((sum, t) => sum + (now - t.startTime), 0) / transactions.length : 0,
      oldestTransaction: transactions.length > 0 ? 
        Math.max(...transactions.map(t => now - t.startTime)) : 0
    };
  }

  /**
   * Cleanup old transactions (safety mechanism)
   */
  cleanupOldTransactions() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [id, transaction] of this.activeTransactions) {
      if (now - transaction.startTime > maxAge) {
        this.logger.warn('Cleaning up old transaction', {
          transactionId: id,
          age: now - transaction.startTime
        });
        
        transaction.session.endSession().catch(err => {
          this.logger.error('Failed to end old transaction session', {
            transactionId: id,
            error: err.message
          });
        });
        
        this.activeTransactions.delete(id);
      }
    }
  }
}