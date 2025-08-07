// ==========================================
// FLOW SERVICE - Validation Middleware
// ==========================================

import Joi from 'joi';

// Validation schemas
const schemas = {
  createFlow: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional(),
    projectId: Joi.string().required(),
    type: Joi.string().valid('user-flow', 'wireframe', 'prototype', 'sitemap').default('user-flow'),
    nodes: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      type: Joi.string().required(),
      position: Joi.object({
        x: Joi.number().required(),
        y: Joi.number().required()
      }).required(),
      data: Joi.object().optional()
    })).default([]),
    edges: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      source: Joi.string().required(),
      target: Joi.string().required(),
      type: Joi.string().optional(),
      data: Joi.object().optional()
    })).default([]),
    metadata: Joi.object().optional()
  }),

  updateFlow: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    nodes: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      type: Joi.string().required(),
      position: Joi.object({
        x: Joi.number().required(),
        y: Joi.number().required()
      }).required(),
      data: Joi.object().optional()
    })).optional(),
    edges: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      source: Joi.string().required(),
      target: Joi.string().required(),
      type: Joi.string().optional(),
      data: Joi.object().optional()
    })).optional(),
    metadata: Joi.object().optional()
  }),

  addNode: Joi.object({
    id: Joi.string().required(),
    type: Joi.string().required(),
    position: Joi.object({
      x: Joi.number().required(),
      y: Joi.number().required()
    }).required(),
    data: Joi.object().optional()
  }),

  addEdge: Joi.object({
    id: Joi.string().required(),
    source: Joi.string().required(),
    target: Joi.string().required(),
    type: Joi.string().valid('default', 'straight', 'step', 'smoothstep').default('default'),
    animated: Joi.boolean().default(false),
    data: Joi.object().optional()
  }),

  shareFlow: Joi.object({
    shareType: Joi.string().valid('public', 'private', 'password').required(),
    password: Joi.when('shareType', {
      is: 'password',
      then: Joi.string().min(6).required(),
      otherwise: Joi.optional()
    }),
    expiresAt: Joi.date().iso().optional(),
    permissions: Joi.array().items(
      Joi.string().valid('view', 'comment', 'edit')
    ).default(['view'])
  }),

  exportFlow: Joi.object({
    format: Joi.string().valid('json', 'svg', 'png', 'pdf').required(),
    includeMetadata: Joi.boolean().default(true),
    scale: Joi.number().min(0.5).max(4).default(1),
    quality: Joi.when('format', {
      is: Joi.string().valid('png', 'jpg'),
      then: Joi.number().min(0).max(100).default(90),
      otherwise: Joi.optional()
    })
  }),

  cloneFlow: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    projectId: Joi.string().required(),
    includeHistory: Joi.boolean().default(false)
  }),

  validateFlow: Joi.object({
    flowId: Joi.string().required(),
    rules: Joi.array().items(
      Joi.string().valid('no-orphans', 'no-cycles', 'single-start', 'single-end', 'connected')
    ).default(['no-orphans', 'connected'])
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    sort: Joi.string().valid('name', 'created', 'updated', 'accessed').default('updated'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    filter: Joi.object({
      type: Joi.string().optional(),
      projectId: Joi.string().optional(),
      search: Joi.string().optional()
    }).optional()
  })
};

// Validation middleware factory
export const validateRequest = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Invalid validation schema'
      });
    }

    // Determine what to validate
    const toValidate = req.method === 'GET' ? req.query : req.body;
    
    const { error, value } = schema.validate(toValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        errors,
        correlationId: req.correlationId
      });
    }

    // Replace with validated values
    if (req.method === 'GET') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Validate flow structure
export const validateFlowStructure = (req, res, next) => {
  const { nodes, edges } = req.body;
  
  if (!nodes && !edges) {
    return next();
  }

  // Check for orphaned edges
  if (nodes && edges) {
    const nodeIds = new Set(nodes.map(n => n.id));
    const invalidEdges = edges.filter(e => 
      !nodeIds.has(e.source) || !nodeIds.has(e.target)
    );
    
    if (invalidEdges.length > 0) {
      return res.status(400).json({
        error: 'Invalid flow structure',
        message: 'Edges reference non-existent nodes',
        invalidEdges: invalidEdges.map(e => e.id),
        correlationId: req.correlationId
      });
    }
  }

  // Check for duplicate node IDs
  if (nodes) {
    const nodeIds = nodes.map(n => n.id);
    const duplicates = nodeIds.filter((id, index) => nodeIds.indexOf(id) !== index);
    
    if (duplicates.length > 0) {
      return res.status(400).json({
        error: 'Invalid flow structure',
        message: 'Duplicate node IDs found',
        duplicates,
        correlationId: req.correlationId
      });
    }
  }

  // Check for duplicate edge IDs
  if (edges) {
    const edgeIds = edges.map(e => e.id);
    const duplicates = edgeIds.filter((id, index) => edgeIds.indexOf(id) !== index);
    
    if (duplicates.length > 0) {
      return res.status(400).json({
        error: 'Invalid flow structure',
        message: 'Duplicate edge IDs found',
        duplicates,
        correlationId: req.correlationId
      });
    }
  }

  next();
};

// Validate flow ownership
export const validateFlowOwnership = async (req, res, next) => {
  try {
    const flowId = req.params.flowId || req.body.flowId;
    const userId = req.user?.id;
    
    if (!flowId || !userId) {
      return next();
    }

    // Check if user owns the flow or has permission
    const hasAccess = await req.flowManager.checkAccess(flowId, userId);
    
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this flow',
        correlationId: req.correlationId
      });
    }

    next();
  } catch (error) {
    req.logger?.error('Flow ownership validation error', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate project access
export const validateProjectAccess = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
    const userId = req.user?.id;
    const workspaceId = req.user?.workspaceId;
    
    if (!projectId) {
      return next();
    }

    // Check if user has access to the project
    const hasAccess = await req.flowManager.checkProjectAccess(
      projectId,
      userId,
      workspaceId
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this project',
        correlationId: req.correlationId
      });
    }

    req.projectId = projectId;
    next();
  } catch (error) {
    req.logger?.error('Project access validation error', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Sanitize flow data
export const sanitizeFlowData = (req, res, next) => {
  // Sanitize node and edge data
  if (req.body.nodes) {
    req.body.nodes = req.body.nodes.map(node => ({
      ...node,
      data: sanitizeObject(node.data)
    }));
  }

  if (req.body.edges) {
    req.body.edges = req.body.edges.map(edge => ({
      ...edge,
      data: sanitizeObject(edge.data)
    }));
  }

  if (req.body.metadata) {
    req.body.metadata = sanitizeObject(req.body.metadata);
  }

  next();
};

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove script tags and dangerous content
      sanitized[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export default {
  validateRequest,
  validateFlowStructure,
  validateFlowOwnership,
  validateProjectAccess,
  sanitizeFlowData
};