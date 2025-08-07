// ==========================================
// USER MANAGEMENT - Validation Middleware
// ==========================================

import Joi from 'joi';

// Validation schemas
const schemas = {
  userRegistration: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      }),
    firstName: Joi.string().min(1).max(100).required(),
    lastName: Joi.string().min(1).max(100).required(),
    company: Joi.string().max(200).optional(),
    role: Joi.string().valid('user', 'admin', 'viewer').default('user'),
    metadata: Joi.object().optional()
  }),

  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().default(false)
  }),

  userUpdate: Joi.object({
    firstName: Joi.string().min(1).max(100).optional(),
    lastName: Joi.string().min(1).max(100).optional(),
    company: Joi.string().max(200).optional(),
    phone: Joi.string().pattern(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/).optional(),
    timezone: Joi.string().optional(),
    language: Joi.string().valid('en', 'es', 'fr', 'de', 'pt', 'zh', 'ja').optional(),
    preferences: Joi.object().optional(),
    metadata: Joi.object().optional()
  }),

  passwordChange: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
      .messages({
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      }),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
      .messages({
        'any.only': 'Passwords do not match'
      })
  }),

  passwordReset: Joi.object({
    email: Joi.string().email().required()
  }),

  passwordResetConfirm: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  }),

  workspaceCreation: Joi.object({
    name: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('personal', 'team', 'enterprise').default('team'),
    settings: Joi.object({
      allowInvites: Joi.boolean().default(true),
      requireApproval: Joi.boolean().default(false),
      maxMembers: Joi.number().integer().min(1).max(1000).optional()
    }).optional(),
    metadata: Joi.object().optional()
  }),

  workspaceUpdate: Joi.object({
    name: Joi.string().min(1).max(200).optional(),
    description: Joi.string().max(1000).optional(),
    settings: Joi.object({
      allowInvites: Joi.boolean().optional(),
      requireApproval: Joi.boolean().optional(),
      maxMembers: Joi.number().integer().min(1).max(1000).optional()
    }).optional(),
    metadata: Joi.object().optional()
  }),

  workspaceInvite: Joi.object({
    email: Joi.string().email().required(),
    role: Joi.string().valid('member', 'admin', 'viewer').default('member'),
    message: Joi.string().max(500).optional(),
    expiresIn: Joi.number().integer().min(1).max(30).default(7) // Days
  }),

  teamMemberUpdate: Joi.object({
    role: Joi.string().valid('member', 'admin', 'viewer').required()
  }),

  apiKeyCreation: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    permissions: Joi.array().items(
      Joi.string().valid('read', 'write', 'delete', 'admin')
    ).default(['read']),
    expiresAt: Joi.date().iso().optional()
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    sort: Joi.string().valid('name', 'email', 'created', 'updated').default('created'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(100).optional()
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

// Validate email uniqueness
export const validateEmailUniqueness = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return next();
    }

    const existingUser = await req.userManager.findByEmail(email);
    
    if (existingUser) {
      return res.status(409).json({
        error: 'Email already registered',
        message: 'An account with this email already exists',
        correlationId: req.correlationId
      });
    }

    next();
  } catch (error) {
    req.logger?.error('Email uniqueness check failed', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate workspace ownership
export const validateWorkspaceOwnership = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return next();
    }

    const isOwner = await req.workspaceManager.isOwner(workspaceId, userId);
    
    if (!isOwner) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only workspace owners can perform this action',
        correlationId: req.correlationId
      });
    }

    next();
  } catch (error) {
    req.logger?.error('Workspace ownership validation failed', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate workspace membership
export const validateWorkspaceMembership = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.user?.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return next();
    }

    const isMember = await req.workspaceManager.isMember(workspaceId, userId);
    
    if (!isMember) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You are not a member of this workspace',
        correlationId: req.correlationId
      });
    }

    req.workspaceId = workspaceId;
    next();
  } catch (error) {
    req.logger?.error('Workspace membership validation failed', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate admin role
export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Admin privileges required',
      correlationId: req.correlationId
    });
  }
  next();
};

// Validate password strength
export const validatePasswordStrength = (req, res, next) => {
  const { password, newPassword } = req.body;
  const passwordToCheck = password || newPassword;
  
  if (!passwordToCheck) {
    return next();
  }

  // Check common passwords
  const commonPasswords = [
    'password', '12345678', 'qwerty', 'abc123', 'password123',
    'admin', 'letmein', 'welcome', 'monkey', '1234567890'
  ];
  
  if (commonPasswords.includes(passwordToCheck.toLowerCase())) {
    return res.status(400).json({
      error: 'Weak password',
      message: 'This password is too common. Please choose a stronger password.',
      correlationId: req.correlationId
    });
  }

  // Check password entropy
  const entropy = calculatePasswordEntropy(passwordToCheck);
  if (entropy < 30) {
    return res.status(400).json({
      error: 'Weak password',
      message: 'Password is too simple. Use a mix of uppercase, lowercase, numbers, and symbols.',
      correlationId: req.correlationId
    });
  }

  next();
};

// Sanitize user input
export const sanitizeInput = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query
  if (req.query) {
    req.query = sanitizeObject(req.query);
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
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
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

function calculatePasswordEntropy(password) {
  let charset = 0;
  
  if (/[a-z]/.test(password)) charset += 26;
  if (/[A-Z]/.test(password)) charset += 26;
  if (/[0-9]/.test(password)) charset += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charset += 32;
  
  return password.length * Math.log2(charset);
}

export default {
  validateRequest,
  validateEmailUniqueness,
  validateWorkspaceOwnership,
  validateWorkspaceMembership,
  requireAdmin,
  validatePasswordStrength,
  sanitizeInput
};