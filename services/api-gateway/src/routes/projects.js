// ==========================================
// SERVICES/API-GATEWAY/src/routes/projects.js
// ==========================================
import express from 'express';
import { MongoClient } from '@ux-flow/common';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/error-handler.js';
import { requireWorkspaceAccess, requirePermission } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const router = express.Router();

// Apply API rate limiting
router.use(apiRateLimit);

// Get all projects for the user's workspace
router.get('/', requirePermission('read_projects'), asyncHandler(async (req, res) => {
  const { workspaceId, userId } = req.user;
  const { page = 1, limit = 20, search, status } = req.query;
  
  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Build query
  const query = {
    workspaceId,
    $or: [
      { ownerId: userId },
      { 'members.userId': userId },
      { visibility: 'public' },
    ],
  };

  if (search) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ],
    });
  }

  if (status) {
    query.status = status;
  }

  // Execute query with pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [projects, totalCount] = await Promise.all([
    projectsCollection
      .find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .project({
        name: 1,
        description: 1,
        ownerId: 1,
        members: 1,
        status: 1,
        visibility: 1,
        flowMetadata: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .toArray(),
    projectsCollection.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / parseInt(limit));

  res.json({
    projects: projects.map(project => ({
      ...project,
      id: project._id.toString(),
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

// Get specific project
router.get('/:projectId', requirePermission('read_projects'), asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { workspaceId, userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check access permissions
  const hasAccess = 
    project.ownerId === userId ||
    project.members?.some(member => member.userId === userId) ||
    project.visibility === 'public';

  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this project');
  }

  // Get flow data from Flow Service
  const flowData = await getProjectFlow(projectId);

  res.json({
    project: {
      ...project,
      id: project._id.toString(),
      _id: undefined,
    },
    flow: flowData,
  });
}));

// Create new project
router.post('/', requirePermission('write_projects'), asyncHandler(async (req, res) => {
  const { name, description, visibility = 'private', template } = req.body;
  const { workspaceId, userId } = req.user;

  if (!name) {
    throw new ValidationError('Project name is required');
  }

  if (name.length > 100) {
    throw new ValidationError('Project name must not exceed 100 characters');
  }

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Check if project name already exists in workspace
  const existingProject = await projectsCollection.findOne({
    workspaceId,
    name,
  });

  if (existingProject) {
    throw new ValidationError('A project with this name already exists in your workspace');
  }

  // Create project
  const project = {
    name,
    description: description || '',
    ownerId: userId,
    workspaceId,
    members: [
      {
        userId,
        role: 'owner',
        permissions: ['read', 'write', 'admin'],
        joinedAt: new Date(),
      },
    ],
    status: 'active',
    visibility,
    flowMetadata: {
      nodeCount: 1, // Start node
      edgeCount: 0,
      lastModifiedBy: userId,
      version: '1.0.0',
    },
    settings: {
      allowComments: true,
      allowGuestView: visibility === 'public',
      autoSave: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await projectsCollection.insertOne(project);
  const projectId = result.insertedId.toString();

  // Initialize flow in Flow Service
  await initializeProjectFlow(projectId, template);

  req.app.locals.logger.info('Project created', {
    projectId,
    name,
    ownerId: userId,
    workspaceId,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    message: 'Project created successfully',
    project: {
      ...project,
      id: projectId,
      _id: undefined,
    },
  });
}));

// Update project
router.patch('/:projectId', requirePermission('write_projects'), asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, description, visibility, settings } = req.body;
  const { workspaceId, userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Check if project exists and user has access
  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Check if user has write permissions
  const userMember = project.members?.find(member => member.userId === userId);
  const canWrite = 
    project.ownerId === userId ||
    userMember?.permissions.includes('write') ||
    userMember?.permissions.includes('admin');

  if (!canWrite) {
    throw new AuthorizationError('You do not have permission to edit this project');
  }

  // Build update object
  const updateData = {
    updatedAt: new Date(),
    'flowMetadata.lastModifiedBy': userId,
  };

  if (name !== undefined) {
    if (!name || name.length > 100) {
      throw new ValidationError('Project name must be between 1 and 100 characters');
    }
    
    // Check for name conflicts
    const existingProject = await projectsCollection.findOne({
      workspaceId,
      name,
      _id: { $ne: MongoClient.createObjectId(projectId) },
    });

    if (existingProject) {
      throw new ValidationError('A project with this name already exists in your workspace');
    }

    updateData.name = name;
  }

  if (description !== undefined) {
    updateData.description = description;
  }

  if (visibility !== undefined) {
    if (!['private', 'public', 'workspace'].includes(visibility)) {
      throw new ValidationError('Invalid visibility value');
    }
    updateData.visibility = visibility;
  }

  if (settings !== undefined) {
    updateData.settings = { ...project.settings, ...settings };
  }

  // Update project
  const result = await projectsCollection.updateOne(
    { _id: MongoClient.createObjectId(projectId) },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError('Project');
  }

  req.app.locals.logger.info('Project updated', {
    projectId,
    updatedFields: Object.keys(updateData),
    userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Project updated successfully',
  });
}));

// Delete project
router.delete('/:projectId', requirePermission('delete_own_projects'), asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { workspaceId, userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Check if project exists and user is owner
  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
    ownerId: userId, // Only owner can delete
  });

  if (!project) {
    throw new NotFoundError('Project or you do not have permission to delete it');
  }

  // Soft delete the project
  await projectsCollection.updateOne(
    { _id: MongoClient.createObjectId(projectId) },
    {
      $set: {
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: userId,
      },
    }
  );

  // Archive flow data in Flow Service
  await archiveProjectFlow(projectId);

  req.app.locals.logger.info('Project deleted', {
    projectId,
    name: project.name,
    ownerId: userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Project deleted successfully',
  });
}));

// Add member to project
router.post('/:projectId/members', requirePermission('write_projects'), asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { email, role = 'editor', permissions = ['read', 'write'] } = req.body;
  const { workspaceId, userId } = req.user;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');
  const usersCollection = db.collection('users');

  // Check if project exists and user has admin access
  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  const userMember = project.members?.find(member => member.userId === userId);
  const canAddMembers = 
    project.ownerId === userId ||
    userMember?.permissions.includes('admin');

  if (!canAddMembers) {
    throw new AuthorizationError('You do not have permission to add members to this project');
  }

  // Find user to add
  const userToAdd = await usersCollection.findOne({ email, workspaceId });
  if (!userToAdd) {
    throw new NotFoundError('User not found in this workspace');
  }

  const userToAddId = userToAdd._id.toString();

  // Check if user is already a member
  const isAlreadyMember = project.members?.some(member => member.userId === userToAddId);
  if (isAlreadyMember) {
    throw new ValidationError('User is already a member of this project');
  }

  // Add member
  const newMember = {
    userId: userToAddId,
    email,
    role,
    permissions,
    joinedAt: new Date(),
    addedBy: userId,
  };

  await projectsCollection.updateOne(
    { _id: MongoClient.createObjectId(projectId) },
    {
      $push: { members: newMember },
      $set: { updatedAt: new Date() },
    }
  );

  req.app.locals.logger.info('Member added to project', {
    projectId,
    newMemberEmail: email,
    newMemberId: userToAddId,
    addedBy: userId,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    message: 'Member added successfully',
    member: {
      ...newMember,
      name: `${userToAdd.firstName || ''} ${userToAdd.lastName || ''}`.trim(),
    },
  });
}));

// Remove member from project
router.delete('/:projectId/members/:memberId', requirePermission('write_projects'), asyncHandler(async (req, res) => {
  const { projectId, memberId } = req.params;
  const { workspaceId, userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Check if project exists and user has admin access
  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  // Cannot remove the owner
  if (project.ownerId === memberId) {
    throw new ValidationError('Cannot remove the project owner');
  }

  const userMember = project.members?.find(member => member.userId === userId);
  const canRemoveMembers = 
    project.ownerId === userId ||
    userMember?.permissions.includes('admin') ||
    userId === memberId; // Users can remove themselves

  if (!canRemoveMembers) {
    throw new AuthorizationError('You do not have permission to remove members from this project');
  }

  // Remove member
  const result = await projectsCollection.updateOne(
    { _id: MongoClient.createObjectId(projectId) },
    {
      $pull: { members: { userId: memberId } },
      $set: { updatedAt: new Date() },
    }
  );

  if (result.modifiedCount === 0) {
    throw new NotFoundError('Member not found in project');
  }

  req.app.locals.logger.info('Member removed from project', {
    projectId,
    removedMemberId: memberId,
    removedBy: userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Member removed successfully',
  });
}));

// Export project flow
router.get('/:projectId/export', requirePermission('read_projects'), asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { format = 'json' } = req.query;
  const { workspaceId, userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const projectsCollection = db.collection('projects');

  // Check access
  const project = await projectsCollection.findOne({
    _id: MongoClient.createObjectId(projectId),
    workspaceId,
  });

  if (!project) {
    throw new NotFoundError('Project');
  }

  const hasAccess = 
    project.ownerId === userId ||
    project.members?.some(member => member.userId === userId) ||
    project.visibility === 'public';

  if (!hasAccess) {
    throw new AuthorizationError('You do not have access to this project');
  }

  // Get flow data from Flow Service
  const flowData = await getProjectFlow(projectId);

  // Prepare export data
  const exportData = {
    project: {
      name: project.name,
      description: project.description,
      version: project.flowMetadata.version,
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
    },
    flow: flowData,
  };

  // Set appropriate headers
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
  
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`);
  
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } else {
    throw new ValidationError('Unsupported export format');
  }

  req.app.locals.logger.info('Project exported', {
    projectId,
    format,
    exportedBy: userId,
    correlationId: req.correlationId,
  });
}));

// Helper functions for Flow Service integration
async function getProjectFlow(projectId) {
  // TODO: Integrate with Flow Service
  // For now, return basic structure
  return {
    metadata: { flowName: 'Flow', version: '1.0.0' },
    nodes: [{ id: 'start', type: 'Start' }],
    edges: [],
  };
}

async function initializeProjectFlow(projectId, template = null) {
  // TODO: Send event to Flow Service to initialize flow
  console.log(`Initializing flow for project ${projectId} with template ${template}`);
}

async function archiveProjectFlow(projectId) {
  // TODO: Send event to Flow Service to archive flow
  console.log(`Archiving flow for project ${projectId}`);
}

export default router;