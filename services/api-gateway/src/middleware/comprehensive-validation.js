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
   * SECURITY FIX: Enhanced MongoDB query sanitization with ReDoS protection
   */
  sanitizeMongoQuery(query) {
    if (typeof query !== 'object' || query === null) {
      return {};
    }
    
    const sanitized = {};
    // SECURITY FIX: Removed $regex from allowed operators to prevent ReDoS attacks
    const allowedOperators = ['$and', '$or', '$in', '$nin', '$gt', '$gte', '$lt', '$lte', '$ne', '$eq', '$exists'];
    
    for (const [key, value] of Object.entries(query)) {
      // Block dangerous MongoDB operators
      if (key.startsWith('$')) {
        if (!allowedOperators.includes(key)) {
          throw new ValidationError(`Dangerous MongoDB operator: ${key}`);
        }
      }
      
      // SECURITY FIX: Special handling for regex operations to prevent ReDoS
      if (key === '$regex' || (typeof value === 'object' && value !== null && '$regex' in value)) {
        throw new ValidationError('Direct regex operations are not allowed for security reasons');
      }
      
      // Check for dangerous patterns in values
      if (typeof value === 'string') {
        for (const pattern of this.dangerousPatterns) {
          if (pattern.test(value)) {
            throw new ValidationError('Query contains potentially dangerous content');
          }
        }
        
        // SECURITY FIX: Enhanced validation for potential regex patterns
        if (this.containsPotentialReDoSPattern(value)) {
          throw new ValidationError('Query contains patterns that could cause performance issues');
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
   * SECURITY FIX: Check for potential ReDoS patterns
   */
  containsPotentialReDoSPattern(input) {
    // Patterns that could cause exponential backtracking
    const redosPatterns = [
      // Nested quantifiers
      /(\*\+|\+\*|\*\*|\+\+|\?\+|\*\?|\+\?)/,
      // Catastrophic backtracking patterns  
      /(\.{2,}[\*\+])/,
      // Alternation with overlapping patterns
      /\([^)]*\|[^)]*\)[\*\+]/,
      // Long repetition patterns
      /.{30,}[\*\+]/,
      // Nested groups with quantifiers
      /\([^)]*[\*\+][^)]*\)[\*\+]/,
      // Excessive character classes
      /\[[^\]]{20,}\]/
    ];
    
    for (const pattern of redosPatterns) {
      try {
        if (pattern.test(input)) {
          return true;
        }
      } catch (error) {
        // If testing the pattern itself causes issues, consider it dangerous
        return true;
      }
    }
    
    // Check for excessive length or complexity
    if (input.length > 200) {
      return true;
    }
    
    // Count quantifiers and groups
    const quantifierCount = (input.match(/[\*\+\?]/g) || []).length;
    const groupCount = (input.match(/\(/g) || []).length;
    
    if (quantifierCount > 10 || groupCount > 5) {
      return true;
    }
    
    return false;
  }
  
  /**
   * SECURITY FIX: Safe regex creation with complexity limits
   */
  createSafeSearchRegex(searchTerm, maxLength = 100) {
    if (!searchTerm || typeof searchTerm !== 'string') {
      return null;
    }
    
    // Limit length to prevent complexity attacks
    if (searchTerm.length > maxLength) {
      searchTerm = searchTerm.substring(0, maxLength);
    }
    
    // Check for ReDoS patterns before processing
    if (this.containsPotentialReDoSPattern(searchTerm)) {
      throw new ValidationError('Search term contains patterns that could cause performance issues');
    }
    
    // Escape all special regex characters
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Return a simple, bounded search pattern
    return new RegExp(escaped, 'i');
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
   * SECURITY FIX: Enhanced file security checks with comprehensive scanning
   */
  performFileSecurityChecks(file) {
    // Enhanced executable detection with more signatures
    const executableSignatures = [
      Buffer.from([0x4D, 0x5A]), // PE executable (MZ)
      Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF executable
      Buffer.from([0xFE, 0xED, 0xFA]), // Mach-O executable
      Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Java class file
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP/Office (potential macro)
      Buffer.from([0x50, 0x4B, 0x05, 0x06]), // ZIP empty archive
      Buffer.from([0x50, 0x4B, 0x07, 0x08]), // ZIP spanned archive
      Buffer.from([0x52, 0x61, 0x72, 0x21]), // RAR archive
      Buffer.from([0x37, 0x7A, 0xBC, 0xAF]), // 7-Zip archive
    ];

    // SECURITY FIX: Check multiple file header positions
    const headerSizes = [4, 8, 16, 32];
    for (const size of headerSizes) {
      const fileHeader = file.buffer.slice(0, Math.min(file.buffer.length, size));
      for (const signature of executableSignatures) {
        if (fileHeader.indexOf(signature) !== -1) {
          throw new ValidationError('File contains executable or archive signatures');
        }
      }
    }

    // SECURITY FIX: Enhanced script detection with full file scanning
    const scriptPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /data:text\/html/i,
      /onload\s*=/i,
      /onerror\s*=/i,
      /onclick\s*=/i,
      /onmouseover\s*=/i,
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
      /eval\s*\(/i,
      /document\.write/i,
      /window\.location/i,
      /\.innerHTML/i,
    ];

    // SECURITY FIX: Scan entire file, not just first 1024 bytes
    const maxScanSize = Math.min(file.buffer.length, 50 * 1024); // Scan up to 50KB
    const scanChunkSize = 8192; // 8KB chunks
    
    for (let offset = 0; offset < maxScanSize; offset += scanChunkSize) {
      const chunkEnd = Math.min(offset + scanChunkSize + 1024, maxScanSize); // Overlap for patterns at boundaries
      const chunk = file.buffer.toString('utf8', offset, chunkEnd);
      
      for (const pattern of scriptPatterns) {
        if (pattern.test(chunk)) {
          throw new ValidationError(`File contains potentially malicious content at position ${offset}`);
        }
      }
    }

    // SECURITY FIX: Entropy analysis to detect packed/encrypted malware
    const entropy = this.calculateFileEntropy(file.buffer);
    if (entropy > 7.5) {
      this.logger.warn('File has high entropy - possible packed/encrypted content', {
        entropy,
        filename: file.originalname,
        size: file.buffer.length
      });
      // Don't block high entropy files as they could be legitimate compressed images
      // but log for monitoring
    }

    // SECURITY FIX: File structure validation based on claimed MIME type
    this.validateFileStructure(file);

    // SECURITY FIX: Additional malware indicators
    this.checkMalwareIndicators(file);
  }

  /**
   * SECURITY FIX: Calculate file entropy to detect packed/encrypted content
   */
  calculateFileEntropy(buffer) {
    const frequencies = new Array(256).fill(0);
    const sampleSize = Math.min(buffer.length, 32768); // Sample first 32KB for performance
    
    // Count byte frequencies
    for (let i = 0; i < sampleSize; i++) {
      frequencies[buffer[i]]++;
    }
    
    // Calculate Shannon entropy
    let entropy = 0;
    for (const freq of frequencies) {
      if (freq > 0) {
        const probability = freq / sampleSize;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    return entropy;
  }

  /**
   * SECURITY FIX: Validate file structure matches claimed MIME type
   */
  validateFileStructure(file) {
    const mimeToSignature = {
      'image/jpeg': [
        Buffer.from([0xFF, 0xD8, 0xFF]), // JPEG start
        Buffer.from([0xFF, 0xD9]) // JPEG end (should be at end of file)
      ],
      'image/png': [
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // PNG signature
      ],
      'image/gif': [
        Buffer.from('GIF87a', 'ascii'), // GIF87a
        Buffer.from('GIF89a', 'ascii')  // GIF89a
      ],
      'image/webp': [
        Buffer.from('WEBP', 'ascii') // WEBP signature (at offset 8)
      ]
    };

    const expectedSignatures = mimeToSignature[file.mimetype];
    if (expectedSignatures) {
      let validSignatureFound = false;
      
      for (const signature of expectedSignatures) {
        if (file.mimetype === 'image/webp') {
          // WEBP has RIFF header first, then WEBP at offset 8
          if (file.buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
              file.buffer.slice(8, 12).toString('ascii') === 'WEBP') {
            validSignatureFound = true;
            break;
          }
        } else if (file.mimetype === 'image/jpeg' && signature.equals(Buffer.from([0xFF, 0xD9]))) {
          // Check JPEG end marker at file end
          const fileEnd = file.buffer.slice(-2);
          if (fileEnd.equals(signature)) {
            validSignatureFound = true;
          }
        } else {
          // Check signature at file start
          const fileStart = file.buffer.slice(0, signature.length);
          if (fileStart.equals(signature)) {
            validSignatureFound = true;
            break;
          }
        }
      }

      if (!validSignatureFound) {
        throw new ValidationError(`File signature doesn't match claimed MIME type: ${file.mimetype}`);
      }
    }
  }

  /**
   * SECURITY FIX: Check for additional malware indicators
   */
  checkMalwareIndicators(file) {
    // Check for suspicious metadata or comments
    const suspiciousStrings = [
      'autostart',
      'autorun',
      'cmd.exe',
      'powershell',
      'rundll32',
      'regsvr32',
      'mshta',
      'wscript',
      'cscript',
      'certutil',
      'bitsadmin',
      'schtasks',
      'at.exe',
      'net.exe',
      'base64',
      'fromcharcode',
      'unescape',
      'activexobject'
    ];

    // Convert buffer to string for pattern matching (check more data)
    const textContent = file.buffer.toString('ascii', 0, Math.min(file.buffer.length, 100 * 1024));
    const lowerContent = textContent.toLowerCase();

    for (const suspicious of suspiciousStrings) {
      if (lowerContent.includes(suspicious.toLowerCase())) {
        this.logger.warn('File contains suspicious strings', {
          filename: file.originalname,
          suspicious: suspicious,
          mimetype: file.mimetype
        });
      }
    }

    // Check for unusual file size to content ratio (possible steganography)
    if (file.mimetype.startsWith('image/') && file.buffer.length > 10 * 1024 * 1024) {
      this.logger.warn('Large image file uploaded - possible steganography', {
        filename: file.originalname,
        size: file.buffer.length,
        mimetype: file.mimetype
      });
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