// ==========================================
// SERVICES/API-GATEWAY/src/middleware/validation.js
// ==========================================

import validator from 'validator';
import xss from 'xss';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';
import config from '../config/index.js';

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE|SCRIPT|JAVASCRIPT|EVAL)\b)/gi,
  /(--|#|\/\*|\*\/|;|\||\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4})/g,
  /(\bOR\b\s*\d+\s*=\s*\d+|\bAND\b\s*\d+\s*=\s*\d+)/gi,
  /(\'|\")\s*\bOR\b\s*(\'|\")\s*=\s*(\'|\")/gi
];

// NoSQL injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where/gi,
  /\$regex/gi,
  /\$ne/gi,
  /\$gt/gi,
  /\$lt/gi,
  /\$gte/gi,
  /\$lte/gi,
  /\$in/gi,
  /\$nin/gi,
  /\$exists/gi,
  /\$type/gi,
  /\$mod/gi,
  /\$text/gi,
  /\$elemMatch/gi
];

// Command injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$(){}[\]<>]/g,
  /\b(cat|ls|pwd|echo|rm|mv|cp|chmod|chown|sudo|wget|curl|bash|sh|python|node|php)\b/gi
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\+/g,
  /%2e%2e%2f/gi,
  /%252e%252e%252f/gi,
  /\.\./g
];

// XSS patterns
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gis,
  /<iframe[^>]*>.*?<\/iframe>/gis,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<img[^>]*onerror[^>]*>/gi,
  /<svg[^>]*onload[^>]*>/gi
];

// Sanitization class
class InputSanitizer {
  constructor(options = {}) {
    this.options = {
      stripTags: options.stripTags !== false,
      escapeHtml: options.escapeHtml !== false,
      trimStrings: options.trimStrings !== false,
      normalizeEmail: options.normalizeEmail !== false,
      maxLength: options.maxLength || 10000,
      allowedTags: options.allowedTags || [],
      allowedAttributes: options.allowedAttributes || {}
    };
  }

  sanitizeString(input, fieldName = 'input') {
    if (typeof input !== 'string') {
      return input;
    }

    let sanitized = input;

    // Length check
    if (sanitized.length > this.options.maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${this.options.maxLength}`);
    }

    // Trim whitespace
    if (this.options.trimStrings) {
      sanitized = sanitized.trim();
    }

    // Check for SQL injection
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error(`Potential SQL injection detected in ${fieldName}`);
      }
    }

    // Check for NoSQL injection
    for (const pattern of NOSQL_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error(`Potential NoSQL injection detected in ${fieldName}`);
      }
    }

    // Check for command injection
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error(`Potential command injection detected in ${fieldName}`);
      }
    }

    // Check for path traversal
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(sanitized)) {
        throw new Error(`Potential path traversal detected in ${fieldName}`);
      }
    }

    // Strip HTML tags if enabled
    if (this.options.stripTags) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Escape HTML entities
    if (this.options.escapeHtml) {
      sanitized = validator.escape(sanitized);
    }

    // XSS protection using DOMPurify
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: this.options.allowedTags,
      ALLOWED_ATTR: this.options.allowedAttributes,
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_DOM_IMPORT: false,
      FORCE_BODY: false,
      SANITIZE_DOM: true,
      IN_PLACE: false
    });

    return sanitized;
  }

  sanitizeEmail(email) {
    if (!validator.isEmail(email)) {
      throw new Error('Invalid email address');
    }

    let sanitized = email.toLowerCase().trim();

    if (this.options.normalizeEmail) {
      sanitized = validator.normalizeEmail(sanitized, {
        gmail_remove_dots: true,
        gmail_remove_subaddress: true,
        gmail_convert_googlemaildotcom: true,
        outlookdotcom_remove_subaddress: true,
        yahoo_remove_subaddress: true,
        icloud_remove_subaddress: true
      });
    }

    return sanitized;
  }

  sanitizeUrl(url) {
    if (!validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true
    })) {
      throw new Error('Invalid URL');
    }

    // Check for javascript: protocol
    if (url.toLowerCase().includes('javascript:')) {
      throw new Error('JavaScript protocol not allowed in URLs');
    }

    return url;
  }

  sanitizeNumber(input, options = {}) {
    const num = Number(input);
    
    if (isNaN(num)) {
      throw new Error('Invalid number');
    }

    if (options.min !== undefined && num < options.min) {
      throw new Error(`Number must be at least ${options.min}`);
    }

    if (options.max !== undefined && num > options.max) {
      throw new Error(`Number must be at most ${options.max}`);
    }

    if (options.integer && !Number.isInteger(num)) {
      throw new Error('Number must be an integer');
    }

    return num;
  }

  sanitizeObject(obj, schema = {}) {
    if (typeof obj !== 'object' || obj === null) {
      throw new Error('Invalid object');
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = this.sanitizeString(key, 'object key');

      // Check if key is allowed
      if (schema.allowedKeys && !schema.allowedKeys.includes(key)) {
        continue; // Skip disallowed keys
      }

      // Sanitize value based on type
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = this.sanitizeString(value, key);
      } else if (typeof value === 'number') {
        sanitized[sanitizedKey] = this.sanitizeNumber(value);
      } else if (typeof value === 'boolean') {
        sanitized[sanitizedKey] = Boolean(value);
      } else if (Array.isArray(value)) {
        sanitized[sanitizedKey] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item, `${key} array item`) : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = this.sanitizeObject(value, schema[key] || {});
      }
    }

    return sanitized;
  }
}

// Validation schemas using Zod
export const schemas = {
  // User authentication schemas
  auth: {
    login: z.object({
      email: z.string().email().toLowerCase(),
      password: z.string().min(8).max(128),
      rememberMe: z.boolean().optional()
    }),

    register: z.object({
      email: z.string().email().toLowerCase(),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
      confirmPassword: z.string(),
      name: z.string().min(2).max(100),
      acceptTerms: z.boolean().refine(val => val === true, {
        message: 'You must accept the terms and conditions'
      })
    }).refine(data => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword']
    }),

    resetPassword: z.object({
      email: z.string().email().toLowerCase()
    }),

    changePassword: z.object({
      currentPassword: z.string(),
      newPassword: z.string()
        .min(8)
        .max(128)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/)
        .regex(/[^A-Za-z0-9]/),
      confirmPassword: z.string()
    }).refine(data => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword']
    })
  },

  // Chat message schemas
  chat: {
    message: z.object({
      content: z.string().min(1).max(5000),
      conversationId: z.string().uuid().optional(),
      attachments: z.array(z.object({
        type: z.enum(['image', 'file', 'code']),
        url: z.string().url(),
        name: z.string(),
        size: z.number().max(10 * 1024 * 1024) // 10MB max
      })).optional()
    }),

    feedback: z.object({
      messageId: z.string().uuid(),
      rating: z.number().min(1).max(5),
      comment: z.string().max(1000).optional()
    })
  },

  // Flow schemas
  flow: {
    create: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      type: z.enum(['userflow', 'wireframe', 'prototype']),
      isPublic: z.boolean().default(false)
    }),

    update: z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      nodes: z.array(z.object({
        id: z.string(),
        type: z.string(),
        position: z.object({
          x: z.number(),
          y: z.number()
        }),
        data: z.record(z.unknown())
      })).optional(),
      edges: z.array(z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
        type: z.string().optional(),
        data: z.record(z.unknown()).optional()
      })).optional()
    })
  },

  // Workspace schemas
  workspace: {
    create: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      type: z.enum(['personal', 'team', 'enterprise'])
    }),

    invite: z.object({
      email: z.string().email().toLowerCase(),
      role: z.enum(['viewer', 'editor', 'admin']),
      message: z.string().max(500).optional()
    })
  }
};

// Validation middleware factory
export const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      // Create sanitizer instance
      const sanitizer = new InputSanitizer(config.validation.sanitization);

      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizer.sanitizeObject(req.body);
      }

      // Validate against schema
      const validated = await schema.parseAsync(req.body);
      req.validatedBody = validated;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }

      return res.status(400).json({
        error: 'Validation Error',
        message: error.message
      });
    }
  };
};

// File upload validation
export const validateFileUpload = (options = {}) => {
  const defaultOptions = {
    maxSize: config.validation.maxFileSize,
    allowedTypes: config.validation.allowedFileTypes,
    required: false
  };

  const opts = { ...defaultOptions, ...options };

  return (req, res, next) => {
    if (!req.files && !req.file) {
      if (opts.required) {
        return res.status(400).json({
          error: 'File Required',
          message: 'No file uploaded'
        });
      }
      return next();
    }

    const files = req.files ? Object.values(req.files).flat() : [req.file];

    for (const file of files) {
      // Check file size
      if (file.size > opts.maxSize) {
        return res.status(400).json({
          error: 'File Too Large',
          message: `File size exceeds maximum of ${opts.maxSize / 1024 / 1024}MB`
        });
      }

      // Check file type
      if (!opts.allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          error: 'Invalid File Type',
          message: `File type ${file.mimetype} is not allowed`,
          allowedTypes: opts.allowedTypes
        });
      }

      // Check for malicious file names
      const sanitizer = new InputSanitizer();
      try {
        file.name = sanitizer.sanitizeString(file.name, 'filename');
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid Filename',
          message: 'Filename contains invalid characters'
        });
      }

      // Additional security checks for images
      if (file.mimetype.startsWith('image/')) {
        // Could add image dimension checks, EXIF data removal, etc.
      }
    }

    next();
  };
};

// MongoDB query sanitization
export const sanitizeMongoQuery = (query) => {
  if (typeof query !== 'object' || query === null) {
    return query;
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(query)) {
    // Remove any keys starting with $
    if (key.startsWith('$')) {
      continue;
    }

    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

// Request sanitization middleware
export const sanitizeRequest = (req, res, next) => {
  try {
    const sanitizer = new InputSanitizer(config.validation.sanitization);

    // Sanitize query parameters
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          req.query[key] = sanitizer.sanitizeString(value, `query.${key}`);
        }
      }
    }

    // Sanitize path parameters
    if (req.params) {
      for (const [key, value] of Object.entries(req.params)) {
        if (typeof value === 'string') {
          req.params[key] = sanitizer.sanitizeString(value, `params.${key}`);
        }
      }
    }

    // Sanitize headers (selective)
    const headersToSanitize = ['x-correlation-id', 'x-workspace-id', 'x-user-agent'];
    for (const header of headersToSanitize) {
      if (req.headers[header] && typeof req.headers[header] === 'string') {
        req.headers[header] = sanitizer.sanitizeString(
          req.headers[header], 
          `header.${header}`
        );
      }
    }

    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid Input',
      message: error.message
    });
  }
};

// CSRF protection middleware
export const csrfProtection = (req, res, next) => {
  if (!config.security.csrfEnabled) {
    return next();
  }

  // Skip CSRF for certain paths
  const skipPaths = ['/health', '/metrics', '/webhooks'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip for GET requests
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // Check CSRF token
  const token = req.headers['x-csrf-token'] || req.body?._csrf;
  
  if (!token) {
    return res.status(403).json({
      error: 'CSRF Token Missing',
      message: 'CSRF token is required for this request'
    });
  }

  // Validate token (implementation depends on your CSRF library)
  // This is a simplified example
  if (token !== req.session?.csrfToken) {
    return res.status(403).json({
      error: 'Invalid CSRF Token',
      message: 'CSRF token validation failed'
    });
  }

  next();
};

export default {
  validateRequest,
  validateFileUpload,
  sanitizeMongoQuery,
  sanitizeRequest,
  csrfProtection,
  schemas,
  InputSanitizer
};