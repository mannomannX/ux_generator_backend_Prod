// ==========================================
// SERVICES/API-GATEWAY/src/routes/admin.js
// ==========================================
import express from 'express';
import { MongoClient } from '@ux-flow/common';
import { asyncHandler, NotFoundError, AuthorizationError } from '../middleware/error-handler.js';
import { requireRole, requirePermission } from '../middleware/auth.js';

const router = express.Router();

// Require admin role for all admin routes
router.use(requireRole('admin'));

// Get system statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const db = req.app.locals.mongoClient.getDb();
  
  const [
    userCount,
    workspaceCount,
    projectCount,
    activeProjectCount,
    conversationCount,
  ] = await Promise.all([
    db.collection('users').countDocuments(),
    db.collection('workspaces').countDocuments(),
    db.collection('projects').countDocuments(),
    db.collection('projects').countDocuments({ status: 'active' }),
    db.collection('conversations').countDocuments(),
  ]);

  // Get system health
  const healthCheck = req.app.locals.healthCheck;
  const systemHealth = await healthCheck.checkHealth();

  // Get WebSocket statistics
  const wsManager = req.app.locals.wsManager;
  const wsStats = wsManager ? wsManager.getStats() : null;

  res.json({
    statistics: {
      users: userCount,
      workspaces: workspaceCount,
      projects: {
        total: projectCount,
        active: activeProjectCount,
        inactive: projectCount - activeProjectCount,
      },
      conversations: conversationCount,
    },
    systemHealth,
    websocketConnections: wsStats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}));

// Get all users with pagination
router.get('/users', asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, role, workspaceId } = req.query;
  
  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  // Build query
  const query = {};
  
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
    ];
  }

  if (role) {
    query.role = role;
  }

  if (workspaceId) {
    query.workspaceId = workspaceId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [users, totalCount] = await Promise.all([
    usersCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .project({ password: 0 }) // Exclude password
      .toArray(),
    usersCollection.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / parseInt(limit));

  res.json({
    users: users.map(user => ({
      ...user,
      id: user._id.toString(),
      _id: undefined,
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages,
      hasNext: parseInt(page) < totalPages,
      hasPrev: parseInt(page) > 1,
    },
  });
}));

// Get specific user details
router.get('/users/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');
  const projectsCollection = db.collection('projects');

  const user = await usersCollection.findOne(
    { _id: MongoClient.createObjectId(userId) },
    { projection: { password: 0 } }
  );

  if (!user) {
    throw new NotFoundError('User');
  }

  // Get user's projects
  const projects = await projectsCollection
    .find({
      $or: [
        { ownerId: userId },
        { 'members.userId': userId },
      ],
    })
    .project({ name: 1, status: 1, createdAt: 1, ownerId: 1 })
    .toArray();

  res.json({
    user: {
      ...user,
      id: user._id.toString(),
      _id: undefined,
    },
    projects: projects.map(project => ({
      ...project,
      id: project._id.toString(),
      _id: undefined,
      isOwner: project.ownerId === userId,
    })),
  });
}));

// Update user (admin actions)
router.patch('/users/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role, permissions, emailVerified, status } = req.body;
  
  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  const updateData = {
    updatedAt: new Date(),
  };

  if (role !== undefined) {
    if (!['user', 'admin', 'moderator'].includes(role)) {
      throw new ValidationError('Invalid role');
    }
    updateData.role = role;
  }

  if (permissions !== undefined) {
    updateData.permissions = permissions;
  }

  if (emailVerified !== undefined) {
    updateData.emailVerified = emailVerified;
  }

  if (status !== undefined) {
    updateData.status = status;
  }

  const result = await usersCollection.updateOne(
    { _id: MongoClient.createObjectId(userId) },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('User');
  }

  req.app.locals.logger.info('User updated by admin', {
    targetUserId: userId,
    adminUserId: req.user.userId,
    updatedFields: Object.keys(updateData),
    correlationId: req.correlationId,
  });

  res.json({
    message: 'User updated successfully',
  });
}));

// Get all workspaces
router.get('/workspaces', asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  
  const db = req.app.locals.mongoClient.getDb();
  const workspacesCollection = db.collection('workspaces');

  const query = {};
  
  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const [workspaces, totalCount] = await Promise.all([
    workspacesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray(),
    workspacesCollection.countDocuments(query),
  ]);

  // Get member counts for each workspace
  const workspaceIds = workspaces.map(ws => ws._id.toString());
  const memberCounts = await db.collection('users').aggregate([
    { $match: { workspaceId: { $in: workspaceIds } } },
    { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
  ]).toArray();

  const memberCountMap = memberCounts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});

  res.json({
    workspaces: workspaces.map(workspace => ({
      ...workspace,
      id: workspace._id.toString(),
      _id: undefined,
      memberCount: memberCountMap[workspace._id.toString()] || 0,
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit)),
    },
  });
}));

// Get system logs (recent errors and warnings)
router.get('/logs', asyncHandler(async (req, res) => {
  const { level = 'error', limit = 100, since } = req.query;
  
  // This would typically read from a logging service or file
  // For now, return a placeholder response
  
  const logs = [
    {
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'api-gateway',
      message: 'Sample log entry',
      correlationId: 'sample-correlation-id',
      details: {},
    },
  ];

  res.json({
    logs,
    filters: {
      level,
      limit: parseInt(limit),
      since,
    },
    count: logs.length,
  });
}));

// Get AI agent suggestions/optimizations
router.get('/suggestions', asyncHandler(async (req, res) => {
  const { status = 'new' } = req.query;
  
  const db = req.app.locals.mongoClient.getDb();
  const suggestionsCollection = db.collection('prompt_suggestions');

  const suggestions = await suggestionsCollection
    .find({ status })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  res.json({
    suggestions: suggestions.map(suggestion => ({
      ...suggestion,
      id: suggestion._id.toString(),
      _id: undefined,
    })),
  });
}));

// Approve AI suggestion
router.post('/suggestions/:suggestionId/approve', asyncHandler(async (req, res) => {
  const { suggestionId } = req.params;
  
  const db = req.app.locals.mongoClient.getDb();
  const suggestionsCollection = db.collection('prompt_suggestions');

  // Find suggestion
  const suggestion = await suggestionsCollection.findOne({
    _id: MongoClient.createObjectId(suggestionId),
  });

  if (!suggestion) {
    throw new NotFoundError('Suggestion');
  }

  // Update status
  await suggestionsCollection.updateOne(
    { _id: MongoClient.createObjectId(suggestionId) },
    {
      $set: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: req.user.userId,
      },
    }
  );

  req.app.locals.logger.info('AI suggestion approved', {
    suggestionId,
    approvedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Suggestion approved successfully',
  });
}));

// Reject AI suggestion
router.post('/suggestions/:suggestionId/reject', asyncHandler(async (req, res) => {
  const { suggestionId } = req.params;
  const { reason } = req.body;
  
  const db = req.app.locals.mongoClient.getDb();
  const suggestionsCollection = db.collection('prompt_suggestions');

  const result = await suggestionsCollection.updateOne(
    { _id: MongoClient.createObjectId(suggestionId) },
    {
      $set: {
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: req.user.userId,
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('Suggestion');
  }

  req.app.locals.logger.info('AI suggestion rejected', {
    suggestionId,
    reason,
    rejectedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Suggestion rejected successfully',
  });
}));

// System maintenance endpoints
router.post('/maintenance/cleanup', asyncHandler(async (req, res) => {
  const { type = 'soft' } = req.body;
  
  const db = req.app.locals.mongoClient.getDb();
  
  let cleanupResults = {};

  if (type === 'soft') {
    // Soft cleanup - remove old sessions, expired tokens, etc.
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    cleanupResults = {
      oldConversations: await db.collection('conversations').deleteMany({
        createdAt: { $lt: cutoffDate },
      }),
      expiredSessions: 0, // Would implement session cleanup
    };
  }

  req.app.locals.logger.info('System cleanup performed', {
    type,
    results: cleanupResults,
    performedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Cleanup completed successfully',
    results: cleanupResults,
  });
}));

export default router;