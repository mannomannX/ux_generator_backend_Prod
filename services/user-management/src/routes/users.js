// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/users.js
// ==========================================

import express from 'express';
import { validateSchema, userUpdateSchema, paginationSchema } from '@ux-flow/common';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handler.js';
import { 
  authMiddleware, 
  requireRole, 
  requireSelfOrAdmin, 
  optionalAuth 
} from '../middleware/auth.js';
import { apiRateLimit, userSpecificRateLimit } from '../middleware/rate-limit.js';

const router = express.Router();

// Apply rate limiting
router.use(apiRateLimit);

/**
 * GET /api/v1/users
 * List users with filtering and pagination
 * Admin only - for user management dashboard
 */
router.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  // Validate query parameters
  const validation = validateSchema(paginationSchema, req.query);
  if (!validation.isValid) {
    throw new ValidationError('Invalid query parameters', validation.errors);
  }

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: Math.min(parseInt(req.query.limit) || 20, 100),
    filters: {},
  };

  // Apply filters
  if (req.query.search) {
    options.filters.search = req.query.search.trim();
  }
  if (req.query.role) {
    options.filters.role = req.query.role;
  }
  if (req.query.status) {
    options.filters.status = req.query.status;
  }
  if (req.query.workspaceId) {
    options.filters.workspaceId = req.query.workspaceId;
  }
  if (req.query.emailVerified !== undefined) {
    options.filters.emailVerified = req.query.emailVerified === 'true';
  }

  const result = await req.userManager.getUsers(options);

  res.json({
    users: result.users,
    pagination: result.pagination,
    filters: options.filters,
  });
}));

/**
 * GET /api/v1/users/:userId
 * Get user profile by ID
 * Users can access their own profile, admins can access any
 */
router.get('/:userId', authMiddleware, requireSelfOrAdmin(), asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await req.userManager.getUser(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Remove sensitive information for non-admin users
  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const isSelf = req.user.userId === userId;

  const userProfile = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName || `${user.firstName} ${user.lastName}`,
    workspaceId: user.workspaceId,
    role: user.role,
    permissions: user.permissions,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt,
    preferences: user.preferences,
  };

  // Add sensitive information for self or admin
  if (isSelf || isAdmin) {
    userProfile.lastLoginAt = user.lastLoginAt;
    userProfile.updatedAt = user.updatedAt;
  }

  // Add admin-only information
  if (isAdmin) {
    userProfile.loginAttempts = user.loginAttempts;
    userProfile.lockedUntil = user.lockedUntil;
    userProfile.deletedAt = user.deletedAt;
    userProfile.deletedReason = user.deletedReason;
  }

  res.json({
    user: userProfile,
  });
}));

/**
 * PATCH /api/v1/users/:userId
 * Update user profile
 * Users can update their own profile, admins can update any
 */
router.patch('/:userId', authMiddleware, requireSelfOrAdmin(), userSpecificRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 updates per 15 minutes
}), asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Check if user exists
  const existingUser = await req.userManager.getUser(userId);
  if (!existingUser) {
    throw new NotFoundError('User');
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const isSelf = req.user.userId === userId;

  // Define allowed updates based on role
  const allowedUpdates = isSelf 
    ? ['firstName', 'lastName', 'displayName', 'preferences', 'bio']
    : [];

  const adminOnlyUpdates = ['role', 'permissions', 'status', 'emailVerified'];

  // Allow admin-only updates for admins
  if (isAdmin) {
    allowedUpdates.push(...adminOnlyUpdates);
  }

  // Filter updates to only allowed fields
  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowedUpdates.includes(key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid updates provided');
  }

  // Validate updates
  const validation = validateSchema(userUpdateSchema, updates);
  if (!validation.isValid) {
    throw new ValidationError('Invalid update data', validation.errors);
  }

  // Prevent users from escalating their own role
  if (!isAdmin && updates.role && updates.role !== existingUser.role) {
    throw new ValidationError('Cannot modify your own role');
  }

  // Update user
  const updatedUser = await req.userManager.updateUser(userId, validation.value);

  // Log the update
  req.logger?.info('User profile updated', {
    userId,
    updatedFields: Object.keys(updates),
    updatedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User updated successfully',
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      displayName: updatedUser.displayName,
      workspaceId: updatedUser.workspaceId,
      role: updatedUser.role,
      permissions: updatedUser.permissions,
      emailVerified: updatedUser.emailVerified,
      status: updatedUser.status,
      updatedAt: updatedUser.updatedAt,
    },
  });
}));

/**
 * DELETE /api/v1/users/:userId
 * Soft delete user account
 * Users can delete their own account, admins can delete any
 */
router.delete('/:userId', authMiddleware, requireSelfOrAdmin(), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason = 'user_request' } = req.body;

  // Check if user exists
  const existingUser = await req.userManager.getUser(userId);
  if (!existingUser) {
    throw new NotFoundError('User');
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const isSelf = req.user.userId === userId;

  // Prevent deletion of super admin
  if (existingUser.role === 'super_admin' && !isSelf) {
    throw new ValidationError('Cannot delete super admin user');
  }

  // Perform soft delete
  await req.userManager.deleteUser(userId, reason);

  // Log the deletion
  req.logger?.info('User deleted', {
    userId,
    deletedBy: req.user.userId,
    reason,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User deleted successfully',
    userId,
    reason,
    deletedBy: req.user.userId,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/v1/users/:userId/restore
 * Restore soft-deleted user
 * Admin only
 */
router.post('/:userId/restore', requireRole('admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Update user status to active and clear deletion fields
  const restoredUser = await req.userManager.updateUser(userId, {
    status: 'active',
    deletedAt: null,
    deletedReason: null,
  });

  req.logger?.info('User restored', {
    userId,
    restoredBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User restored successfully',
    user: restoredUser,
  });
}));

/**
 * PATCH /api/v1/users/:userId/status
 * Update user status (active, suspended, inactive)
 * Admin only
 */
router.patch('/:userId/status', requireRole('admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  const validStatuses = ['active', 'suspended', 'inactive'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const updatedUser = await req.userManager.changeUserStatus(userId, status);

  req.logger?.info('User status updated', {
    userId,
    newStatus: status,
    updatedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User status updated successfully',
    userId,
    status,
    updatedAt: updatedUser.updatedAt,
  });
}));

/**
 * GET /api/v1/users/:userId/workspaces
 * Get workspaces that the user has access to
 */
router.get('/:userId/workspaces', authMiddleware, requireSelfOrAdmin(), asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Verify user exists
  const user = await req.userManager.getUser(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get user's workspaces
  const workspaces = await req.workspaceManager.getUserWorkspaces(userId);

  res.json({
    userId,
    workspaces: workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      role: workspace.userRole,
      isOwner: workspace.ownerId === userId,
      projectCount: workspace.projectCount,
      memberCount: workspace.members?.length || 0,
      joinedAt: workspace.joinedAt,
      createdAt: workspace.createdAt,
    })),
  });
}));

/**
 * GET /api/v1/users/search
 * Search users by email/name
 * Admin only - for user management and workspace invitations
 */
router.get('/search', requireRole('admin'), asyncHandler(async (req, res) => {
  const { q: query, limit = 10 } = req.query;

  if (!query || query.length < 2) {
    throw new ValidationError('Search query must be at least 2 characters');
  }

  const searchResults = await req.userManager.getUsers({
    filters: { search: query },
    limit: Math.min(parseInt(limit), 50),
    page: 1,
  });

  res.json({
    query,
    users: searchResults.users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      status: user.status,
      emailVerified: user.emailVerified,
    })),
    totalCount: searchResults.pagination.totalCount,
  });
}));

/**
 * GET /api/v1/users/stats
 * Get user statistics
 * Admin only
 */
router.get('/stats', requireRole('admin'), asyncHandler(async (req, res) => {
  const stats = await req.userManager.getUserStats();

  res.json({
    stats,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/v1/users/:userId/unlock
 * Unlock user account (clear login attempts and locked status)
 * Admin only
 */
router.post('/:userId/unlock', requireRole('admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const unlockedUser = await req.userManager.updateUser(userId, {
    loginAttempts: 0,
    lockedUntil: null,
  });

  req.logger?.info('User account unlocked', {
    userId,
    unlockedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User account unlocked successfully',
    userId,
    unlockedBy: req.user.userId,
    timestamp: new Date().toISOString(),
  });
}));

export default router;