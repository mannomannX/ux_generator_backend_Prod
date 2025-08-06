// ==========================================
// PACKAGES/COMMON/src/validation/schemas.js
// ==========================================
import Joi from 'joi';

// Base schemas
const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);
const emailSchema = Joi.string().email().max(255);
const passwordSchema = Joi.string().min(8).max(128);
const uuidSchema = Joi.string().uuid();

// User schemas
export const userRegistrationSchema = Joi.object({
  email: emailSchema.required(),
  password: passwordSchema.required(),
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  workspaceName: Joi.string().min(2).max(50).optional(),
});

export const userLoginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().required(),
});

export const userUpdateSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  email: emailSchema.optional(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordSchema.required(),
});

// Project schemas
export const projectCreateSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  visibility: Joi.string().valid('private', 'public', 'workspace').default('private'),
  template: Joi.string().valid('empty', 'basic', 'ecommerce').default('empty'),
});

export const projectUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  visibility: Joi.string().valid('private', 'public', 'workspace').optional(),
  settings: Joi.object({
    allowComments: Joi.boolean(),
    allowGuestView: Joi.boolean(),
    autoSave: Joi.boolean(),
  }).optional(),
});

export const projectMemberSchema = Joi.object({
  email: emailSchema.required(),
  role: Joi.string().valid('viewer', 'editor', 'admin').default('editor'),
  permissions: Joi.array().items(
    Joi.string().valid('read', 'write', 'admin', 'delete')
  ).default(['read', 'write']),
});

// Flow schemas
export const flowCreateSchema = Joi.object({
  projectId: objectIdSchema.required(),
  workspaceId: objectIdSchema.required(),
  template: Joi.string().valid('empty', 'basic', 'ecommerce').default('empty'),
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
});

export const flowNodeSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid(
    'Start', 'End', 'Screen', 'Popup', 'API Call', 
    'Decision', 'Component', 'Note'
  ).required(),
  position: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required(),
  }).optional(),
  data: Joi.object().optional(),
});

export const flowEdgeSchema = Joi.object({
  id: Joi.string().required(),
  source: Joi.string().required(),
  target: Joi.string().required(),
  data: Joi.object({
    trigger: Joi.string().optional(),
  }).optional(),
});

export const flowSchema = Joi.object({
  metadata: Joi.object({
    flowName: Joi.string().min(1).max(100).required(),
    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
    description: Joi.string().max(500).optional(),
  }).required(),
  nodes: Joi.array().items(flowNodeSchema).required(),
  edges: Joi.array().items(flowEdgeSchema).required(),
});

export const transactionSchema = Joi.object({
  action: Joi.string().valid(
    'ADD_NODE', 'UPDATE_NODE', 'DELETE_NODE',
    'ADD_EDGE', 'UPDATE_EDGE', 'DELETE_EDGE'
  ).required(),
  payload: Joi.object().required(),
});

export const flowUpdateSchema = Joi.object({
  transactions: Joi.array().items(transactionSchema).min(1).required(),
  projectId: objectIdSchema.optional(),
});

// Knowledge schemas
export const knowledgeQuerySchema = Joi.object({
  query: Joi.string().min(1).max(1000).required(),
  userId: objectIdSchema.optional(),
  workspaceId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  nResults: Joi.number().integer().min(1).max(50).default(5),
  includeGlobal: Joi.boolean().default(true),
});

export const knowledgeAddSchema = Joi.object({
  content: Joi.string().min(1).max(50000).required(),
  metadata: Joi.object({
    title: Joi.string().max(200).optional(),
    description: Joi.string().max(500).optional(),
    category: Joi.string().max(50).optional(),
    tags: Joi.array().items(Joi.string().max(30)).max(10).optional(),
  }).optional(),
  userId: objectIdSchema.required(),
  workspaceId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
});

// Workspace schemas
export const workspaceCreateSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  description: Joi.string().max(500).optional(),
  settings: Joi.object({
    allowGuestAccess: Joi.boolean().default(false),
    maxProjects: Joi.number().integer().min(1).max(1000).default(10),
  }).optional(),
});

export const workspaceUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  description: Joi.string().max(500).optional(),
  settings: Joi.object({
    allowGuestAccess: Joi.boolean(),
    maxProjects: Joi.number().integer().min(1).max(1000),
  }).optional(),
});

// Pagination schema
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().max(50).optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// File upload schema
export const fileUploadSchema = Joi.object({
  file: Joi.object({
    originalname: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().integer().max(10 * 1024 * 1024).required(), // 10MB
  }).required(),
  description: Joi.string().max(200).optional(),
  category: Joi.string().max(50).optional(),
});

// Admin schemas
export const adminUserUpdateSchema = Joi.object({
  role: Joi.string().valid('user', 'admin', 'moderator').optional(),
  permissions: Joi.array().items(Joi.string()).optional(),
  emailVerified: Joi.boolean().optional(),
  status: Joi.string().valid('active', 'suspended', 'deleted').optional(),
});

// WebSocket message schemas
export const websocketMessageSchema = Joi.object({
  type: Joi.string().valid(
    'user_message', 'plan_approved', 'plan_feedback', 
    'image_upload', 'ping', 'join_project', 'leave_project',
    'cursor_position'
  ).required(),
  message: Joi.string().when('type', {
    is: Joi.string().valid('user_message', 'plan_feedback'),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  projectId: objectIdSchema.optional(),
  workspaceId: objectIdSchema.optional(),
  qualityMode: Joi.string().valid('standard', 'pro').default('standard'),
});

// Version schemas
export const versionCreateSchema = Joi.object({
  description: Joi.string().max(200).optional(),
});

export const versionRestoreSchema = Joi.object({
  versionNumber: Joi.number().integer().min(1).required(),
});

// Helper function to validate with better error messages
export const validateSchema = (schema, data, options = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options,
  });

  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value,
    }));

    return {
      isValid: false,
      errors: details,
      value: null,
    };
  }

  return {
    isValid: true,
    errors: [],
    value,
  };
};