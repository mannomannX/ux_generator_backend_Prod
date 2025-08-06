// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/workspaces.js
// ==========================================
import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
  validateSchema,
  workspaceCreateSchema,
  workspaceUpdateSchema,
  projectMemberSchema,
  requireAuth 
} from '@ux-flow/common';
import config from '../config/index.js';

const router = express.Router();

// Rate limiting for workspace operations
const workspaceRateLimit = rateLimit({
  windowMs: config.rateLimit.workspace.windowMs,
  max: config.rateLimit.workspace.max,
  message: {
    error: 'Too many workspace operations',
    message: 'Please wait before performing more workspace operations',
  },
});

// Apply authentication to all workspace routes
router.use(requireAuth);

// Apply rate limiting to creation and modification operations
router.use(workspaceRateLimit);

// Get all workspaces for the user
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const workspaces = await req.workspaceManager.getUserWorkspaces(req.user.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
    });

    res.json(workspaces);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get workspaces',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Create new workspace
router.post('/', async (req, res) => {
  try {
    const validation = validateSchema(workspaceCreateSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const workspace = await req.workspaceManager.createWorkspace(
      req.user.userId,
      validation.value
    );

    res.status(201).json({
      message: 'Workspace created successfully',
      workspace,
    });

  } catch (error) {
    if (error.message.includes('limit') || error.message.includes('maximum')) {
      res.status(403).json({
        error: 'Workspace limit reached',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('already have') || error.message.includes('exists')) {
      res.status(409).json({
        error: 'Workspace name conflict',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('must be') || error.message.includes('characters')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to create workspace',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get specific workspace
router.get('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { includeProjects = false } = req.query;

    const workspace = await req.workspaceManager.getWorkspace(
      workspaceId,
      req.user.userId
    );

    // Optionally include projects (will require integration with project service)
    if (includeProjects === 'true') {
      workspace.projects = await req.workspaceManager.getWorkspaceProjects(workspaceId);
    }

    res.json({
      workspace,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('access')) {
      res.status(403).json({
        error: 'Access denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to get workspace',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Update workspace
router.patch('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const validation = validateSchema(workspaceUpdateSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const workspace = await req.workspaceManager.updateWorkspace(
      workspaceId,
      req.user.userId,
      validation.value
    );

    res.json({
      message: 'Workspace updated successfully',
      workspace,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('must be') || error.message.includes('characters')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to update workspace',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Delete workspace
router.delete('/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { confirm } = req.body;

    if (!confirm) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'You must confirm workspace deletion',
        correlationId: req.correlationId,
      });
    }

    await req.workspaceManager.deleteWorkspace(workspaceId, req.user.userId);

    res.json({
      message: 'Workspace deleted successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission') || error.message.includes('owner')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to delete workspace',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get workspace members
router.get('/:workspaceId/members', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const members = await req.workspaceManager.getWorkspaceMembers(workspaceId, {
      userId: req.user.userId,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json(members);

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('access')) {
      res.status(403).json({
        error: 'Access denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to get workspace members',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Add member to workspace
router.post('/:workspaceId/members', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const validation = validateSchema(projectMemberSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const result = await req.workspaceManager.addMember(
      workspaceId,
      req.user.userId,
      validation.value
    );

    res.status(201).json({
      message: result.invitationId ? 'Invitation sent successfully' : 'Member added successfully',
      member: result.invitationId ? null : result,
      invitation: result.invitationId ? {
        invitationId: result.invitationId,
        expiresAt: result.expiresAt,
      } : null,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('already') || error.message.includes('limit')) {
      res.status(409).json({
        error: 'Conflict',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('Invalid email')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to add member',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Update member role/permissions
router.patch('/:workspaceId/members/:memberId', async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;
    const { role, permissions } = req.body;

    if (!role && !permissions) {
      return res.status(400).json({
        error: 'Role or permissions must be provided',
        correlationId: req.correlationId,
      });
    }

    await req.workspaceManager.updateMemberRole(
      workspaceId,
      req.user.userId,
      memberId,
      role,
      permissions
    );

    res.json({
      message: 'Member updated successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace or member not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission') || error.message.includes('owner')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to update member',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Remove member from workspace
router.delete('/:workspaceId/members/:memberId', async (req, res) => {
  try {
    const { workspaceId, memberId } = req.params;

    await req.workspaceManager.removeMember(
      workspaceId,
      req.user.userId,
      memberId
    );

    res.json({
      message: 'Member removed successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace or member not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission') || error.message.includes('owner')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to remove member',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get workspace invitations
router.get('/:workspaceId/invitations', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { status = 'pending' } = req.query;

    const invitations = await req.workspaceManager.getWorkspaceInvitations(
      workspaceId,
      req.user.userId,
      { status }
    );

    res.json({
      invitations,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to get invitations',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Resend invitation
router.post('/:workspaceId/invitations/:invitationId/resend', async (req, res) => {
  try {
    const { workspaceId, invitationId } = req.params;

    await req.workspaceManager.resendInvitation(
      workspaceId,
      invitationId,
      req.user.userId
    );

    res.json({
      message: 'Invitation resent successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace or invitation not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to resend invitation',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Cancel invitation
router.delete('/:workspaceId/invitations/:invitationId', async (req, res) => {
  try {
    const { workspaceId, invitationId } = req.params;

    await req.workspaceManager.cancelInvitation(
      workspaceId,
      invitationId,
      req.user.userId
    );

    res.json({
      message: 'Invitation cancelled successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace or invitation not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('permission')) {
      res.status(403).json({
        error: 'Permission denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to cancel invitation',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Accept workspace invitation
router.post('/invitations/:token/accept', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await req.workspaceManager.acceptInvitation(
      token,
      req.user.userId
    );

    res.json({
      message: 'Invitation accepted successfully',
      workspace: result.workspace,
    });

  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      res.status(400).json({
        error: 'Invalid or expired invitation',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('already')) {
      res.status(409).json({
        error: 'Already accepted',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to accept invitation',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get workspace statistics
router.get('/:workspaceId/statistics', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { period = '30d' } = req.query;

    const statistics = await req.workspaceManager.getWorkspaceStatistics(
      workspaceId,
      req.user.userId,
      { period }
    );

    res.json({
      statistics,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('access')) {
      res.status(403).json({
        error: 'Access denied',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to get workspace statistics',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Leave workspace
router.post('/:workspaceId/leave', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    await req.workspaceManager.removeMember(
      workspaceId,
      req.user.userId,
      req.user.userId // User removing themselves
    );

    res.json({
      message: 'Left workspace successfully',
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Workspace not found',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('owner')) {
      res.status(403).json({
        error: 'Cannot leave as owner',
        message: 'Transfer ownership before leaving the workspace',
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to leave workspace',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

export default router;