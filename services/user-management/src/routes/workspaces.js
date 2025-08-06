// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/workspaces.js
// ==========================================
import express from 'express';
import { validateSchema, workspaceCreateSchema, workspaceUpdateSchema, projectMemberSchema } from '@ux-flow/common';
import { asyncHandler, ValidationError, AuthorizationError, NotFoundError } from '../middleware/error-handler.js';
import { authMiddleware, requireRole, requirePermission } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const router = express.Router();

// Apply API rate limiting
router.use(apiRateLimit);

// Get user's workspaces
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const workspaces = await req.workspaceManager.getUserWorkspaces(userId);

  res.json({
    workspaces: workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.userRole,
      isOwner: workspace.ownerId === userId,
      projectCount: workspace.projectCount,
      maxProjects: workspace.settings.maxProjects,
      memberCount: workspace.members?.length || 0,
      createdAt: workspace.createdAt,
      joinedAt: workspace.joinedAt,
    })),
  });
}));

// Get specific workspace
router.get('/:workspaceId', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check if user has access to this workspace
  const member = workspace.members.find(m => m.userId === userId);
  if (!member && req.user.role !== 'admin') {
    throw new AuthorizationError('You do not have access to this workspace');
  }

  // Get detailed member information
  const membersWithDetails = await Promise.all(
    workspace.members.map(async (member) => {
      try {
        const user = await req.userManager.getUser(member.userId);
        return {
          userId: member.userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: member.role,
          joinedAt: member.joinedAt,
          addedBy: member.addedBy,
        };
      } catch (error) {
        req.logger.warn('Failed to get member details', error, {
          memberId: member.userId,
          workspaceId,
        });
        return {
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
          error: 'User not found',
        };
      }
    })
  );

  res.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      ownerId: workspace.ownerId,
      projectCount: workspace.projectCount,
      maxProjects: workspace.settings.maxProjects,
      settings: workspace.settings,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
    userRole: member?.role || (req.user.role === 'admin' ? 'admin' : null),
    isOwner: workspace.ownerId === userId,
    members: membersWithDetails,
    memberCount: membersWithDetails.length,
    usage: {
      projects: workspace.projectCount,
      maxProjects: workspace.settings.maxProjects,
      usagePercentage: (workspace.projectCount / workspace.settings.maxProjects) * 100,
    },
  });
}));

// Create new workspace
router.post('/', authMiddleware, asyncHandler(async (req, res) => {
  const validation = validateSchema(workspaceCreateSchema, req.body);
  if (!validation.isValid) {
    throw new ValidationError('Workspace creation validation failed', validation.errors);
  }

  const { userId } = req.user;
  const { name, description, settings } = validation.value;

  // Check if user already owns a workspace (business rule)
  const userWorkspaces = await req.workspaceManager.getUserWorkspaces(userId);
  const ownedWorkspaces = userWorkspaces.filter(ws => ws.ownerId === userId);
  
  if (ownedWorkspaces.length >= 1 && req.user.role !== 'admin') {
    throw new ValidationError('Users can only own one workspace. Please upgrade your plan for multiple workspaces.');
  }

  // Create workspace
  const workspace = await req.workspaceManager.createWorkspace({
    name,
    description,
    ownerId: userId,
    settings: {
      allowGuestAccess: false,
      maxProjects: 10, // Default for free tier
      ...settings,
    },
  });

  // Update user's primary workspace
  await req.userManager.updateUser(userId, {
    workspaceId: workspace.id,
  });

  // Emit workspace creation event
  req.eventEmitter.emit('WORKSPACE_CREATION_REQUESTED', {
    workspaceId: workspace.id,
    name: workspace.name,
    ownerId: userId,
    settings: workspace.settings,
    correlationId: req.correlationId,
  });

  req.logger.info('Workspace created', {
    workspaceId: workspace.id,
    name: workspace.name,
    ownerId: userId,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    message: 'Workspace created successfully',
    workspace: {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      role: 'owner',
      isOwner: true,
      projectCount: 0,
      maxProjects: workspace.settings.maxProjects,
      settings: workspace.settings,
      createdAt: workspace.createdAt,
    },
  });
}));

// Update workspace
router.patch('/:workspaceId', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;

  const validation = validateSchema(workspaceUpdateSchema, req.body);
  if (!validation.isValid) {
    throw new ValidationError('Workspace update validation failed', validation.errors);
  }

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check permissions
  const member = workspace.members.find(m => m.userId === userId);
  const canUpdate = 
    workspace.ownerId === userId ||
    member?.role === 'admin' ||
    req.user.role === 'admin';

  if (!canUpdate) {
    throw new AuthorizationError('You do not have permission to update this workspace');
  }

  const updates = validation.value;
  const updatedWorkspace = await req.workspaceManager.updateWorkspace(workspaceId, updates);

  req.logger.info('Workspace updated', {
    workspaceId,
    updatedFields: Object.keys(updates),
    updatedBy: userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Workspace updated successfully',
    workspace: {
      id: updatedWorkspace.id,
      name: updatedWorkspace.name,
      description: updatedWorkspace.description,
      settings: updatedWorkspace.settings,
      updatedAt: updatedWorkspace.updatedAt,
    },
  });
}));

// Add member to workspace
router.post('/:workspaceId/members', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;

  const validation = validateSchema(projectMemberSchema, req.body);
  if (!validation.isValid) {
    throw new ValidationError('Member addition validation failed', validation.errors);
  }

  const { email, role, permissions } = validation.value;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check permissions
  const member = workspace.members.find(m => m.userId === userId);
  const canAddMembers = 
    workspace.ownerId === userId ||
    member?.role === 'admin' ||
    req.user.role === 'admin';

  if (!canAddMembers) {
    throw new AuthorizationError('You do not have permission to add members to this workspace');
  }

  // Find user to add
  const userToAdd = await req.userManager.getUserByEmail(email);
  if (!userToAdd) {
    throw new NotFoundError('User not found with this email address');
  }

  // Check if user is already a member
  const isAlreadyMember = workspace.members.some(m => m.userId === userToAdd.id);
  if (isAlreadyMember) {
    throw new ValidationError('User is already a member of this workspace');
  }

  // Add member
  await req.workspaceManager.addMember(workspaceId, {
    userId: userToAdd.id,
    role: role || 'member',
    permissions: permissions || ['read_projects', 'write_projects'],
    addedBy: userId,
    joinedAt: new Date(),
  });

  // If user doesn't have a primary workspace, set this as their primary
  if (!userToAdd.workspaceId) {
    await req.userManager.updateUser(userToAdd.id, {
      workspaceId,
    });
  }

  // Emit member addition event
  req.eventEmitter.emit('WORKSPACE_MEMBER_ADDED', {
    workspaceId,
    userId: userToAdd.id,
    role: role || 'member',
    addedBy: userId,
    correlationId: req.correlationId,
  });

  req.logger.info('Member added to workspace', {
    workspaceId,
    newMemberEmail: email,
    newMemberId: userToAdd.id,
    role: role || 'member',
    addedBy: userId,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    message: 'Member added successfully',
    member: {
      userId: userToAdd.id,
      email: userToAdd.email,
      firstName: userToAdd.firstName,
      lastName: userToAdd.lastName,
      role: role || 'member',
      joinedAt: new Date(),
      addedBy: userId,
    },
  });
}));

// Update member role
router.patch('/:workspaceId/members/:memberId', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const { userId } = req.user;
  const { role, permissions } = req.body;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check permissions
  const currentMember = workspace.members.find(m => m.userId === userId);
  const canUpdateMembers = 
    workspace.ownerId === userId ||
    currentMember?.role === 'admin' ||
    req.user.role === 'admin';

  if (!canUpdateMembers) {
    throw new AuthorizationError('You do not have permission to update members in this workspace');
  }

  // Cannot demote the owner
  if (workspace.ownerId === memberId && role !== 'owner') {
    throw new ValidationError('Cannot change the role of the workspace owner');
  }

  // Update member
  const updates = {};
  if (role !== undefined) updates.role = role;
  if (permissions !== undefined) updates.permissions = permissions;

  await req.workspaceManager.updateMember(workspaceId, memberId, updates);

  req.logger.info('Workspace member updated', {
    workspaceId,
    memberId,
    updates,
    updatedBy: userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Member updated successfully',
    memberId,
    updates,
  });
}));

// Remove member from workspace
router.delete('/:workspaceId/members/:memberId', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const { userId } = req.user;
  const { reason = 'removed' } = req.body;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Cannot remove the owner
  if (workspace.ownerId === memberId) {
    throw new ValidationError('Cannot remove the workspace owner');
  }

  // Check permissions (admins and owners can remove, users can remove themselves)
  const currentMember = workspace.members.find(m => m.userId === userId);
  const canRemoveMembers = 
    workspace.ownerId === userId ||
    currentMember?.role === 'admin' ||
    userId === memberId || // Self-removal
    req.user.role === 'admin';

  if (!canRemoveMembers) {
    throw new AuthorizationError('You do not have permission to remove members from this workspace');
  }

  // Remove member
  await req.workspaceManager.removeMember(workspaceId, memberId);

  // Clear user's workspace reference if this was their primary workspace
  const user = await req.userManager.getUser(memberId);
  if (user && user.workspaceId === workspaceId) {
    await req.userManager.updateUser(memberId, {
      workspaceId: null,
    });
  }

  // Emit member removal event
  req.eventEmitter.emit('WORKSPACE_MEMBER_REMOVED', {
    workspaceId,
    userId: memberId,
    removedBy: userId,
    reason,
    correlationId: req.correlationId,
  });

  req.logger.info('Member removed from workspace', {
    workspaceId,
    removedMemberId: memberId,
    removedBy: userId,
    reason,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Member removed successfully',
    memberId,
    reason,
  });
}));

// Transfer workspace ownership
router.post('/:workspaceId/transfer-ownership', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;
  const { newOwnerId } = req.body;

  if (!newOwnerId) {
    throw new ValidationError('New owner ID is required');
  }

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Only current owner can transfer ownership
  if (workspace.ownerId !== userId && req.user.role !== 'admin') {
    throw new AuthorizationError('Only the workspace owner can transfer ownership');
  }

  // Verify new owner is a member
  const newOwnerMember = workspace.members.find(m => m.userId === newOwnerId);
  if (!newOwnerMember) {
    throw new ValidationError('New owner must be a member of the workspace');
  }

  // Transfer ownership
  await req.workspaceManager.transferOwnership(workspaceId, newOwnerId);

  req.logger.info('Workspace ownership transferred', {
    workspaceId,
    oldOwnerId: userId,
    newOwnerId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Ownership transferred successfully',
    workspaceId,
    newOwnerId,
  });
}));

// Delete workspace
router.delete('/:workspaceId', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;
  const { reason = 'user_request' } = req.body;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Only owner can delete workspace
  if (workspace.ownerId !== userId && req.user.role !== 'admin') {
    throw new AuthorizationError('Only the workspace owner can delete the workspace');
  }

  // Soft delete workspace
  await req.workspaceManager.deleteWorkspace(workspaceId, reason);

  // Update all members' workspace references
  for (const member of workspace.members) {
    const user = await req.userManager.getUser(member.userId);
    if (user && user.workspaceId === workspaceId) {
      await req.userManager.updateUser(member.userId, {
        workspaceId: null,
      });
    }
  }

  // Emit workspace deletion event for cleanup
  req.eventEmitter.emit('WORKSPACE_DELETED', {
    workspaceId,
    name: workspace.name,
    deletedBy: userId,
    reason,
    memberCount: workspace.members.length,
    projectCount: workspace.projectCount,
    correlationId: req.correlationId,
  });

  req.logger.info('Workspace deleted', {
    workspaceId,
    name: workspace.name,
    deletedBy: userId,
    reason,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Workspace deleted successfully',
    workspaceId,
    reason,
  });
}));

// Get workspace usage statistics
router.get('/:workspaceId/usage', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check access
  const member = workspace.members.find(m => m.userId === userId);
  if (!member && req.user.role !== 'admin') {
    throw new AuthorizationError('You do not have access to this workspace');
  }

  // Get usage statistics
  const usage = await req.workspaceManager.getWorkspaceUsage(workspaceId);

  res.json({
    workspaceId,
    usage: {
      projects: {
        current: usage.projectCount,
        maximum: workspace.settings.maxProjects,
        percentage: (usage.projectCount / workspace.settings.maxProjects) * 100,
      },
      members: {
        current: workspace.members.length,
        maximum: workspace.settings.maxMembers || 50, // Default limit
        percentage: (workspace.members.length / (workspace.settings.maxMembers || 50)) * 100,
      },
      storage: usage.storage || {
        current: 0,
        maximum: 1024 * 1024 * 1024, // 1GB default
        percentage: 0,
      },
    },
    billingPeriod: {
      start: usage.billingPeriodStart || workspace.createdAt,
      end: usage.billingPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    warnings: usage.warnings || [],
  });
}));

// Get workspace activity log
router.get('/:workspaceId/activity', authMiddleware, asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const { userId } = req.user;
  const { page = 1, limit = 50, type } = req.query;

  const workspace = await req.workspaceManager.getWorkspace(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check access
  const member = workspace.members.find(m => m.userId === userId);
  if (!member && req.user.role !== 'admin') {
    throw new AuthorizationError('You do not have access to this workspace');
  }

  // Get activity log
  const activity = await req.workspaceManager.getWorkspaceActivity(workspaceId, {
    page: parseInt(page),
    limit: parseInt(limit),
    type,
  });

  res.json({
    workspaceId,
    activity: activity.activities,
    pagination: activity.pagination,
  });
}));

export default router;