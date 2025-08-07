// ==========================================
// SERVICES/API-GATEWAY/src/middleware/comprehensive-validation.js
// Security-hardened input validation middleware
// ==========================================
import Joi from 'joi';
import validator from 'validator';
import createDOMPurify from 'isomorphic-dompurify';
import { ValidationError } from './error-handler.js';

const DOMPurify = createDOMPurify();

/**
 * Comprehensive input validation and sanitization system
 */
export class ComprehensiveValidator {
  constructor(logger) {
    this.logger = logger;
    this.setupSchemas();
  }

  setupSchemas() {
    // Common validation patterns - ReDoS safe
    this.patterns = {
      objectId: /^[0-9a-fA-F]{24}$/,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      projectName: /^[a-zA-Z0-9\s\-_]{1,100}$/,
      workspaceName: /^[a-zA-Z0-9\s\-_]{1,50}$/,
      alphanumeric: /^[a-zA-Z0-9]+$/,
      slug: /^[a-zA-Z0-9\-_]+$/,
      // Safe search pattern to prevent ReDoS
      safeSearch: /^[a-zA-Z0-9\s\-_]{1,100}$/
    };
    
    // Dangerous patterns to block
    this.dangerousPatterns = [
      /\$where/i,
      /\$function/i,
      /\$accumulator/i,
      /\$exec/i,
      /javascript:/i,
      /<script/i,
      /on\w+=/i,
      /eval\(/i,
      /setTimeout/i,
      /setInterval/i
    ];

    // Joi schemas for different data types
    this.schemas = {
      // User schemas
      userRegistration: Joi.object({
        email: Joi.string().email().max(254).required(),
        password: Joi.string().min(8).max(128).required(),
        firstName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s\-']+$/).optional(),
        lastName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s\-']+$/).optional(),
        workspaceName: Joi.string().min(1).max(50).pattern(this.patterns.workspaceName).optional()
      }),

      userLogin: Joi.object({
        email: Joi.string().email().max(254).required(),
        password: Joi.string().min(1).max(128).required()
      }),

      passwordChange: Joi.object({
        currentPassword: Joi.string().min(1).max(128).required(),
        newPassword: Joi.string().min(12).max(128)
          .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
          .required()
          .custom((value, helpers) => {
            // Check for common passwords
            const commonPasswords = ['password123', 'admin123', 'qwerty123'];
            if (commonPasswords.some(p => value.toLowerCase().includes(p))) {
              return helpers.error('Password too common');
            }
            return value;
          })
          .messages({
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            'string.min': 'Password must be at least 12 characters long'
          })
      }),

      userProfileUpdate: Joi.object({
        firstName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s\-']+$/).optional(),
        lastName: Joi.string().min(1).max(50).pattern(/^[a-zA-Z\s\-']+$/).optional(),
        avatar: Joi.string().uri().max(500).optional(),
        preferences: Joi.object().optional()
      }),

      // Project schemas
      projectCreation: Joi.object({
        name: Joi.string().min(1).max(100).pattern(this.patterns.projectName).required(),
        description: Joi.string().max(500).allow('').optional(),
        visibility: Joi.string().valid('public', 'private', 'team').default('private'),
        template: Joi.string().valid('basic', 'login_flow', 'ecommerce', 'dashboard', 'mobile_app').optional(),
        settings: Joi.object({
          allowComments: Joi.boolean().default(true),
          allowGuestView: Joi.boolean().default(false),
          autoSave: Joi.boolean().default(true)
        }).optional()
      }),

      projectUpdate: Joi.object({
        name: Joi.string().min(1).max(100).pattern(this.patterns.projectName).optional(),
        description: Joi.string().max(500).allow('').optional(),
        visibility: Joi.string().valid('public', 'private', 'team').optional(),
        settings: Joi.object({
          allowComments: Joi.boolean().optional(),
          allowGuestView: Joi.boolean().optional(),
          autoSave: Joi.boolean().optional()
        }).optional()
      }),

      projectMemberAdd: Joi.object({
        email: Joi.string().email().max(254).required(),
        role: Joi.string().valid('viewer', 'editor', 'admin').default('viewer'),
        permissions: Joi.array().items(
          Joi.string().valid('read', 'write', 'delete', 'admin', 'invite')
        ).optional()
      }),

      // Query parameter validation
      pagination: Joi.object({
        page: Joi.number().integer().min(1).max(1000).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20)
      }),

      projectsQuery: Joi.object({
        page: Joi.number().integer().min(1).max(1000).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        search: Joi.string().max(100)
          .pattern(this.patterns.safeSearch)
          .custom((value, helpers) => {
            // Escape special regex characters to prevent ReDoS
            return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .optional(),
        status: Joi.string().valid('active', 'archived', 'draft', 'completed').optional(),
        visibility: Joi.string().valid('public', 'private', 'team').optional(),
        sortBy: Joi.string().valid('name', 'createdAt', 'updatedAt', 'lastModified').default('updatedAt'),
        sortOrder: Joi.string().valid('asc', 'desc').default('desc')
      }),

      // Parameter validation
      objectIdParam: Joi.object({
        id: Joi.string().pattern(this.patterns.objectId).required().messages({
          'string.pattern.base': 'Invalid ID format'
        })
      }),

      projectIdParam: Joi.object({
        projectId: Joi.string().pattern(this.patterns.objectId).required().messages({
          'string.pattern.base': 'Invalid project ID format'
        })
      }),

      // WebSocket message validation
      webSocketMessage: Joi.object({
        type: Joi.string().valid(
          'user_message', 'plan_approved', 'image_upload', 
          'cursor_position', 'join_project', 'leave_project'
        ).required(),
        userId: Joi.string().pattern(this.patterns.objectId).required(),
        projectId: Joi.string().pattern(this.patterns.objectId).required(),
        data: Joi.object().optional()
      }),

      userMessage: Joi.object({
        type: Joi.string().valid('user_message').required(),
        userId: Joi.string().pattern(this.patterns.objectId).required(),
        projectId: Joi.string().pattern(this.patterns.objectId).required(),
        workspaceId: Joi.string().pattern(this.patterns.objectId).required(),
        message: Joi.string().min(1).max(2000).required(),
        qualityMode: Joi.string().valid('standard', 'pro').default('standard')
      }),

      imageUpload: Joi.object({
        type: Joi.string().valid('image_upload').required(),
        userId: Joi.string().pattern(this.patterns.objectId).required(),
        projectId: Joi.string().pattern(this.patterns.objectId).required(),
        imageData: Joi.string().required(),
        mimeType: Joi.string().valid('image/jpeg', 'image/png', 'image/gif', 'image/webp').required()
      }),

      // File upload validation
      fileUpload: Joi.object({
        filename: Joi.string().max(255).pattern(/^[a-zA-Z0-9\-_.\s]+$/).required(),
        size: Joi.number().integer().min(1).max(10485760).required(), // 10MB max
        mimeType: Joi.string().valid(
          'image/jpeg', 'image/png', 'image/gif', 'image/webp',
          'application/pdf', 'text/plain', 'application/json'
        ).required()
      })
    };
  }

  /**
   * Validate request body
   */
  validateBody(schema) {
    return (req, res, next) => {
      try {
        const joiSchema = this.schemas[schema];
        if (!joiSchema) {
          throw new Error(`Unknown validation schema: ${schema}`);
        }

        const { error, value } = joiSchema.validate(req.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const details = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          this.logger.warn('Request body validation failed', {
            schema,
            errors: details,
            correlationId: req.correlationId
          });

          throw new ValidationError('Request body validation failed', details);
        }

        req.body = value;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  /**
   * Validate query parameters
   */
  validateQuery(schema) {
    return (req, res, next) => {
      try {
        const joiSchema = this.schemas[schema];
        if (!joiSchema) {
          throw new Error(`Unknown validation schema: ${schema}`);
        }

        const { error, value } = joiSchema.validate(req.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const details = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationError('Query parameter validation failed', details);
        }

        req.query = value;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  /**
   * Validate URL parameters
   */
  validateParams(schema) {
    return (req, res, next) => {
      try {
        const joiSchema = this.schemas[schema];
        if (!joiSchema) {
          throw new Error(`Unknown validation schema: ${schema}`);
        }

        const { error, value } = joiSchema.validate(req.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true
        });

        if (error) {
          const details = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
            value: detail.context?.value
          }));

          throw new ValidationError('URL parameter validation failed', details);
        }

        req.params = value;
        next();
      } catch (err) {
        next(err);
      }
    };
  }

  /**
   * Validate WebSocket messages
   */
  validateWebSocketMessage(message, messageType = 'webSocketMessage') {
    const joiSchema = this.schemas[messageType];
    if (!joiSchema) {
      throw new Error(`Unknown WebSocket message schema: ${messageType}`);
    }

    const { error, value } = joiSchema.validate(message, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      throw new ValidationError('WebSocket message validation failed', details);
    }

    return value;
  }

  /**
   * Sanitize HTML content using DOMPurify
   */
  sanitizeHtml(content, options = {}) {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    const config = {
      ALLOWED_TAGS: options.allowedTags || [],
      ALLOWED_ATTR: options.allowedAttr || [],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      USE_PROFILES: { html: false }
    };
    
    return DOMPurify.sanitize(content, config);
  }
  
  /**
   * Validate and sanitize MongoDB query to prevent injection
   */
  sanitizeMongoQuery(query) {
    if (typeof query !== 'object' || query === null) {
      return {};
    }
    
    const sanitized = {};
    const allowedOperators = ['$and', '$or', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$ne', '$eq', '$exists', '$regex'];
    
    for (const [key, value] of Object.entries(query)) {
      // Block dangerous MongoDB operators
      if (key.startsWith('$')) {
        if (!allowedOperators.includes(key)) {
          throw new ValidationError(`Dangerous MongoDB operator: ${key}`);
        }
      }
      
      // Check for dangerous patterns in values
      if (typeof value === 'string') {
        for (const pattern of this.dangerousPatterns) {
          if (pattern.test(value)) {
            throw new ValidationError('Query contains potentially dangerous content');
          }
        }
        // Escape special MongoDB characters
        sanitized[key] = value.replace(/\$/g, '\\$');
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeMongoQuery(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Validate ObjectId format to prevent injection
   */
  validateObjectId(id, fieldName = 'id') {
    if (!id || typeof id !== 'string') {
      throw new ValidationError(`Invalid ${fieldName}: must be a string`);
    }
    
    if (!this.patterns.objectId.test(id)) {
      throw new ValidationError(`Invalid ${fieldName} format`);
    }
    
    return id.toLowerCase();
  }

  /**
   * File upload validation middleware
   */
  validateFileUpload(options = {}) {
    const {
      maxSize = 10485760, // 10MB
      allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxFiles = 1
    } = options;

    return (req, res, next) => {
      try {
        if (!req.files || req.files.length === 0) {
          throw new ValidationError('No files uploaded');
        }

        if (req.files.length > maxFiles) {
          throw new ValidationError(`Too many files. Maximum allowed: ${maxFiles}`);
        }

        for (const file of req.files) {
          // Validate file size
          if (file.size > maxSize) {
            throw new ValidationError(`File too large. Maximum size: ${maxSize} bytes`);
          }

          // Validate MIME type
          if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new ValidationError(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`);
          }

          // Validate filename
          if (!/^[a-zA-Z0-9\-_.\s]+$/.test(file.originalname)) {
            throw new ValidationError('Invalid filename. Only alphanumeric characters, hyphens, underscores, dots, and spaces are allowed');
          }

          // Additional security checks
          this.performFileSecurityChecks(file);
        }

        next();
      } catch (err) {
        next(err);
      }
    };
  }

  /**
   * Perform additional security checks on uploaded files
   */
  performFileSecurityChecks(file) {
    // Check for executable files disguised as images
    const executableSignatures = [
      Buffer.from([0x4D, 0x5A]), // PE executable
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF executable
      Buffer.from([0xFE, 0xED, 0xFA]), // Mach-O executable
    ];

    const fileHeader = file.buffer.slice(0, 10);
    for (const signature of executableSignatures) {
      if (fileHeader.indexOf(signature) !== -1) {
        throw new ValidationError('File appears to be an executable');
      }
    }

    // Check for embedded scripts in image files
    const scriptPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i
    ];

    const fileContent = file.buffer.toString('utf8', 0, Math.min(file.buffer.length, 1024));
    for (const pattern of scriptPatterns) {
      if (pattern.test(fileContent)) {
        throw new ValidationError('File contains potentially malicious content');
      }
    }
  }

  /**
   * Rate limiting validation
   */
  validateRateLimit(req, res, next) {
    const rateLimitInfo = req.rateLimit;
    
    if (rateLimitInfo && rateLimitInfo.remaining < 10) {
      this.logger.warn('User approaching rate limit', {
        userId: req.user?.userId,
        ip: req.ip,
        remaining: rateLimitInfo.remaining,
        total: rateLimitInfo.total,
        resetTime: rateLimitInfo.resetTime,
        correlationId: req.correlationId
      });
    }

    next();
  }

  /**
   * Custom validation middleware creator
   */
  custom(validationFunction) {
    return async (req, res, next) => {
      try {
        await validationFunction(req, res);
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Validate and sanitize all request data
   */
  validateAndSanitizeRequest(options = {}) {
    return (req, res, next) => {
      try {
        // Sanitize request headers
        if (options.sanitizeHeaders !== false) {
          this.sanitizeHeaders(req);
        }

        // Validate content length
        if (req.headers['content-length']) {
          const contentLength = parseInt(req.headers['content-length']);
          const maxLength = options.maxContentLength || 10485760; // 10MB
          
          if (contentLength > maxLength) {
            throw new ValidationError(`Request too large. Maximum size: ${maxLength} bytes`);
          }
        }

        // Validate request origin if specified
        if (options.validateOrigin && req.headers.origin) {
          const allowedOrigins = options.allowedOrigins || [];
          if (!allowedOrigins.includes(req.headers.origin)) {
            throw new ValidationError('Invalid request origin');
          }
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Sanitize request headers
   */
  sanitizeHeaders(req) {
    const dangerousHeaders = ['x-forwarded-host', 'x-real-ip'];
    
    dangerousHeaders.forEach(header => {
      if (req.headers[header]) {
        // Basic validation for IP addresses and hostnames
        const value = req.headers[header];
        if (!/^[a-zA-Z0-9\-.:]+$/.test(value)) {
          delete req.headers[header];
          this.logger.warn('Dangerous header removed', {
            header,
            value,
            ip: req.ip,
            correlationId: req.correlationId
          });
        }
      }
    });
  }
}

// Export singleton instance
export const validator = new ComprehensiveValidator();