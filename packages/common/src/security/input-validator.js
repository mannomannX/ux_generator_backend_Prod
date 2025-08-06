const validator = require('validator');
const xss = require('xss');
const DOMPurify = require('isomorphic-dompurify');

class InputValidator {
  constructor(config = {}) {
    this.config = {
      maxLength: config.maxLength || 10000,
      allowedTags: config.allowedTags || [],
      allowedAttributes: config.allowedAttributes || {},
      ...config
    };
  }

  // Sanitize HTML input to prevent XSS
  sanitizeHtml(input) {
    if (!input) return '';
    
    // Use DOMPurify for comprehensive HTML sanitization
    const clean = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: this.config.allowedTags,
      ALLOWED_ATTR: this.config.allowedAttributes,
      KEEP_CONTENT: false,
      SAFE_FOR_TEMPLATES: true
    });
    
    return clean;
  }

  // Sanitize plain text input
  sanitizeText(input) {
    if (!input) return '';
    
    // Convert to string and trim
    let text = String(input).trim();
    
    // Remove control characters
    text = text.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Escape HTML entities
    text = validator.escape(text);
    
    // Limit length
    if (text.length > this.config.maxLength) {
      text = text.substring(0, this.config.maxLength);
    }
    
    return text;
  }

  // Validate and sanitize email
  validateEmail(email) {
    if (!email || !validator.isEmail(email)) {
      throw new Error('Invalid email address');
    }
    
    return validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: false,
      gmail_remove_subaddress: false
    });
  }

  // Validate and sanitize URL
  validateUrl(url, options = {}) {
    const validatorOptions = {
      protocols: options.protocols || ['http', 'https'],
      require_protocol: true,
      require_valid_protocol: true,
      require_host: true,
      require_port: false,
      allow_query_components: true,
      allow_fragments: true,
      ...options
    };
    
    if (!url || !validator.isURL(url, validatorOptions)) {
      throw new Error('Invalid URL');
    }
    
    return validator.trim(url);
  }

  // Validate MongoDB ObjectId
  validateObjectId(id) {
    if (!id || !validator.isMongoId(String(id))) {
      throw new Error('Invalid ID format');
    }
    return String(id);
  }

  // Validate and sanitize JSON input
  validateJson(input, schema = null) {
    let data;
    
    try {
      data = typeof input === 'string' ? JSON.parse(input) : input;
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
    
    // Deep sanitize all string values
    const sanitizeObject = (obj) => {
      if (typeof obj === 'string') {
        return this.sanitizeText(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
      }
      if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          // Validate key name (prevent prototype pollution)
          if (this.isPrototypePollution(key)) {
            continue;
          }
          sanitized[this.sanitizeText(key)] = sanitizeObject(value);
        }
        return sanitized;
      }
      return obj;
    };
    
    return sanitizeObject(data);
  }

  // Check for prototype pollution attempts
  isPrototypePollution(key) {
    const dangerous = ['__proto__', 'constructor', 'prototype'];
    return dangerous.includes(key.toLowerCase());
  }

  // Validate file upload
  validateFileUpload(file, options = {}) {
    const config = {
      maxSize: options.maxSize || 10 * 1024 * 1024, // 10MB default
      allowedMimeTypes: options.allowedMimeTypes || [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'text/plain'
      ],
      allowedExtensions: options.allowedExtensions || [
        'jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt'
      ],
      ...options
    };
    
    if (!file) {
      throw new Error('No file provided');
    }
    
    // Check file size
    if (file.size > config.maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${config.maxSize} bytes`);
    }
    
    // Check MIME type
    if (!config.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('File type not allowed');
    }
    
    // Check file extension
    const extension = file.name.split('.').pop().toLowerCase();
    if (!config.allowedExtensions.includes(extension)) {
      throw new Error('File extension not allowed');
    }
    
    // Sanitize filename
    const sanitizedName = validator.escape(file.name)
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 255);
    
    return {
      ...file,
      name: sanitizedName
    };
  }

  // Validate pagination parameters
  validatePagination(params) {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 20;
    
    if (page < 1) {
      throw new Error('Page number must be greater than 0');
    }
    
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
    
    return {
      page,
      limit,
      skip: (page - 1) * limit
    };
  }

  // SQL injection prevention for raw queries
  escapeSql(input) {
    if (!input) return '';
    
    return String(input)
      .replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
        switch (char) {
          case '\0': return '\\0';
          case '\x08': return '\\b';
          case '\x09': return '\\t';
          case '\x1a': return '\\z';
          case '\n': return '\\n';
          case '\r': return '\\r';
          case '"':
          case "'":
          case '\\':
          case '%':
            return '\\' + char;
          default:
            return char;
        }
      });
  }

  // NoSQL injection prevention
  sanitizeMongoQuery(query) {
    if (!query || typeof query !== 'object') {
      return {};
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(query)) {
      // Skip dangerous MongoDB operators
      if (key.startsWith('$')) {
        continue;
      }
      
      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMongoQuery(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeText(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // Command injection prevention
  sanitizeCommand(input) {
    if (!input) return '';
    
    // Remove dangerous characters used in command injection
    const dangerous = /[;&|`$()<>\\]/g;
    return String(input).replace(dangerous, '');
  }

  // Path traversal prevention
  sanitizePath(path) {
    if (!path) return '';
    
    // Remove path traversal attempts
    let sanitized = String(path)
      .replace(/\.\./g, '')
      .replace(/~\//g, '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/');
    
    // Remove leading slashes to prevent absolute paths
    if (sanitized.startsWith('/')) {
      sanitized = sanitized.substring(1);
    }
    
    return sanitized;
  }
}

module.exports = InputValidator;