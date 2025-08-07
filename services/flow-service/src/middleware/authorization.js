// ==========================================
// FLOW SERVICE - Authorization Middleware
// ==========================================

import { MongoClient } from '@ux-flow/common';

/**
 * Middleware to check user permissions for flow operations
 */
export async function checkFlowPermission(permissionType = 'read') {
  return async (req, res, next) => {
    try {
      const userId = req.headers['x-user-id'];
      const workspaceId = req.query.workspaceId || req.body?.workspaceId;
      const flowId = req.params.flowId || req.body?.flowId;
      const projectId = req.query.projectId || req.body?.projectId;

      // Validate required fields
      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User ID is required',
          correlationId: req.correlationId
        });
      }

      // Get database connection
      const db = req.mongoClient.getDb();
      
      // Check workspace membership
      if (workspaceId) {
        const workspace = await db.collection('workspaces').findOne({
          _id: MongoClient.createObjectId(workspaceId),
          $or: [
            { ownerId: userId },
            { 'members.userId': userId }
          ]
        });

        if (!workspace) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have access to this workspace',
            correlationId: req.correlationId
          });
        }

        // Check permission level for non-owners
        if (workspace.ownerId !== userId) {
          const member = workspace.members.find(m => m.userId === userId);
          if (!member) {
            return res.status(403).json({
              error: 'Forbidden',
              message: 'You are not a member of this workspace',
              correlationId: req.correlationId
            });
          }

          // Check role-based permissions
          const hasPermission = checkRolePermission(member.role, permissionType);
          if (!hasPermission) {
            return res.status(403).json({
              error: 'Forbidden',
              message: `You do not have ${permissionType} permission in this workspace`,
              correlationId: req.correlationId
            });
          }
        }

        // Attach workspace info to request
        req.workspace = workspace;
        req.userRole = workspace.ownerId === userId ? 'owner' : 
                       workspace.members.find(m => m.userId === userId)?.role;
      }

      // Check project access
      if (projectId) {
        const project = await db.collection('projects').findOne({
          _id: MongoClient.createObjectId(projectId),
          workspaceId: workspaceId || { $exists: true }
        });

        if (!project) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Project not found',
            correlationId: req.correlationId
          });
        }

        // Verify project belongs to accessible workspace
        if (workspaceId && project.workspaceId !== workspaceId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Project does not belong to the specified workspace',
            correlationId: req.correlationId
          });
        }

        // Check project-level permissions
        if (project.permissions) {
          const userPermission = project.permissions.find(p => p.userId === userId);
          if (userPermission) {
            const hasPermission = checkProjectPermission(userPermission.level, permissionType);
            if (!hasPermission) {
              return res.status(403).json({
                error: 'Forbidden',
                message: `You do not have ${permissionType} permission for this project`,
                correlationId: req.correlationId
              });
            }
          }
        }

        req.project = project;
      }

      // Check flow-specific access
      if (flowId) {
        const flow = await db.collection('flows').findOne({
          _id: MongoClient.createObjectId(flowId)
        });

        if (!flow) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Flow not found',
            correlationId: req.correlationId
          });
        }

        // Verify flow belongs to the project/workspace
        if (projectId && flow.metadata?.projectId !== projectId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Flow does not belong to the specified project',
            correlationId: req.correlationId
          });
        }

        if (workspaceId && flow.metadata?.workspaceId !== workspaceId) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Flow does not belong to the specified workspace',
            correlationId: req.correlationId
          });
        }

        // Check if user has access to the flow
        const canAccess = await checkFlowAccess(db, flow, userId, permissionType);
        if (!canAccess) {
          return res.status(403).json({
            error: 'Forbidden',
            message: `You do not have ${permissionType} permission for this flow`,
            correlationId: req.correlationId
          });
        }

        req.flow = flow;
      }

      // All checks passed
      req.hasPermission = true;
      next();

    } catch (error) {
      req.logger?.error('Authorization check failed', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify permissions',
        correlationId: req.correlationId
      });
    }
  };
}

/**
 * Check if a role has specific permission
 */
function checkRolePermission(role, permissionType) {
  const permissions = {
    owner: ['read', 'write', 'delete', 'admin'],
    admin: ['read', 'write', 'delete'],
    editor: ['read', 'write'],
    viewer: ['read']
  };

  return permissions[role]?.includes(permissionType) || false;
}

/**
 * Check project-level permission
 */
function checkProjectPermission(level, permissionType) {
  const permissions = {
    owner: ['read', 'write', 'delete'],
    contributor: ['read', 'write'],
    viewer: ['read']
  };

  return permissions[level]?.includes(permissionType) || false;
}

/**
 * Check if user has access to a specific flow
 */
async function checkFlowAccess(db, flow, userId, permissionType) {
  // Check if user is the creator
  if (flow.metadata?.createdBy === userId) {
    return true;
  }

  // Check if user is the last modifier (has write access)
  if (flow.metadata?.lastModifiedBy === userId && permissionType !== 'delete') {
    return true;
  }

  // Check workspace membership
  if (flow.metadata?.workspaceId) {
    const workspace = await db.collection('workspaces').findOne({
      _id: MongoClient.createObjectId(flow.metadata.workspaceId),
      $or: [
        { ownerId: userId },
        { 'members.userId': userId }
      ]
    });

    if (workspace) {
      const isOwner = workspace.ownerId === userId;
      const member = workspace.members?.find(m => m.userId === userId);
      const role = isOwner ? 'owner' : member?.role;
      
      return checkRolePermission(role, permissionType);
    }
  }

  // Check if flow is public (read-only)
  if (flow.metadata?.isPublic && permissionType === 'read') {
    return true;
  }

  // Check explicit flow permissions
  if (flow.permissions) {
    const userPermission = flow.permissions.find(p => p.userId === userId);
    if (userPermission) {
      return checkProjectPermission(userPermission.level, permissionType);
    }
  }

  return false;
}

/**
 * Middleware for version restoration authorization
 */
export async function checkVersionRestorePermission(req, res, next) {
  try {
    const userId = req.headers['x-user-id'];
    const { flowId, versionNumber } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID is required',
        correlationId: req.correlationId
      });
    }

    const db = req.mongoClient.getDb();

    // Get the flow
    const flow = await db.collection('flows').findOne({
      _id: MongoClient.createObjectId(flowId)
    });

    if (!flow) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Flow not found',
        correlationId: req.correlationId
      });
    }

    // Get the version
    const version = await db.collection('flow_versions').findOne({
      flowId,
      versionNumber: parseInt(versionNumber)
    });

    if (!version) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Version not found',
        correlationId: req.correlationId
      });
    }

    // Check if user has write permission to the flow
    const canRestore = await checkFlowAccess(db, flow, userId, 'write');
    
    if (!canRestore) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to restore versions of this flow',
        correlationId: req.correlationId
      });
    }

    // Additional check: warn if restoring a version created by another user
    if (version.createdBy !== userId) {
      req.restoringOtherUserVersion = true;
      req.originalVersionCreator = version.createdBy;
    }

    req.flow = flow;
    req.version = version;
    next();

  } catch (error) {
    req.logger?.error('Version restore authorization failed', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify version restore permissions',
      correlationId: req.correlationId
    });
  }
}

/**
 * Middleware to check batch operation permissions
 */
export async function checkBatchPermissions(req, res, next) {
  try {
    const userId = req.headers['x-user-id'];
    const { operations } = req.body;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID is required',
        correlationId: req.correlationId
      });
    }

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Operations array is required',
        correlationId: req.correlationId
      });
    }

    const db = req.mongoClient.getDb();
    const unauthorizedOps = [];

    // Check permissions for each operation
    for (const op of operations) {
      const permissionType = getRequiredPermission(op.type);
      const flowId = op.flowId || op.data?.flowId;

      if (flowId) {
        const flow = await db.collection('flows').findOne({
          _id: MongoClient.createObjectId(flowId)
        });

        if (!flow) {
          unauthorizedOps.push({
            operation: op.type,
            flowId,
            reason: 'Flow not found'
          });
          continue;
        }

        const hasAccess = await checkFlowAccess(db, flow, userId, permissionType);
        if (!hasAccess) {
          unauthorizedOps.push({
            operation: op.type,
            flowId,
            reason: `Missing ${permissionType} permission`
          });
        }
      }
    }

    if (unauthorizedOps.length > 0) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Some operations are not authorized',
        unauthorizedOperations: unauthorizedOps,
        correlationId: req.correlationId
      });
    }

    next();

  } catch (error) {
    req.logger?.error('Batch permissions check failed', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify batch operation permissions',
      correlationId: req.correlationId
    });
  }
}

/**
 * Get required permission type for an operation
 */
function getRequiredPermission(operationType) {
  const permissions = {
    'CREATE': 'write',
    'UPDATE': 'write',
    'DELETE': 'delete',
    'EXPORT': 'read',
    'IMPORT': 'write',
    'DUPLICATE': 'write',
    'RESTORE': 'write',
    'PUBLISH': 'admin',
    'ARCHIVE': 'delete'
  };

  return permissions[operationType] || 'read';
}

export default {
  checkFlowPermission,
  checkVersionRestorePermission,
  checkBatchPermissions
};