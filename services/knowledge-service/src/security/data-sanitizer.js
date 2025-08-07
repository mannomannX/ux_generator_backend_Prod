import { Logger } from '@ux-flow/common';
import DOMPurify from 'isomorphic-dompurify';
import validator from 'validator';

export class DataSanitizer {
  constructor(logger = new Logger('DataSanitizer')) {
    this.logger = logger;
    this.purifier = DOMPurify;
    
    // Patterns to detect and remove
    this.maliciousPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>/gi,
      /<embed[^>]*>/gi,
      /<object[^>]*>/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /file:\/\//gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /document\./gi,
      /window\./gi,
      /eval\(/gi,
      /Function\(/gi,
      /setTimeout\(/gi,
      /setInterval\(/gi
    ];
    
    // SQL injection patterns
    this.sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|JOIN|ORDER BY|GROUP BY|HAVING)\b)/gi,
      /(--|#|\/\*|\*\/)/g,
      /(\bOR\b.*=.*)/gi,
      /(\bAND\b.*=.*)/gi,
      /(';|";)/g,
      /(\bxp_\w+)/gi,
      /(\bsp_\w+)/gi
    ];
    
    // NoSQL injection patterns
    this.nosqlPatterns = [
      /\$where/gi,
      /\$regex/gi,
      /\$ne/gi,
      /\$gt/gi,
      /\$lt/gi,
      /\$gte/gi,
      /\$lte/gi,
      /\$in/gi,
      /\$nin/gi,
      /\$or/gi,
      /\$and/gi,
      /\$not/gi,
      /\$exists/gi,
      /\$type/gi,
      /\$mod/gi,
      /\$text/gi,
      /\$where.*function/gi,
      /mapReduce/gi,
      /aggregate/gi,
      /findAndModify/gi
    ];
  }
  
  sanitizeText(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }
    
    let sanitized = text;
    
    // Remove HTML and scripts
    sanitized = this.purifier.sanitize(sanitized, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true 
    });
    
    // Remove malicious patterns
    for (const pattern of this.maliciousPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    
    // Escape special characters
    sanitized = validator.escape(sanitized);
    
    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');
    
    // Trim and normalize whitespace
    sanitized = sanitized.trim().replace(/\s+/g, ' ');
    
    if (sanitized !== text) {
      this.logger.warn('Potentially malicious content sanitized', {
        originalLength: text.length,
        sanitizedLength: sanitized.length
      });
    }
    
    return sanitized;
  }
  
  sanitizeHTML(html) {
    if (!html || typeof html !== 'string') {
      return html;
    }
    
    // Allow only safe HTML tags and attributes
    const sanitized = this.purifier.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'pre', 'code'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'target'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):)/i,
      KEEP_CONTENT: true,
      RETURN_TRUSTED_TYPE: false
    });
    
    if (sanitized !== html) {
      this.logger.warn('HTML content was sanitized', {
        originalLength: html.length,
        sanitizedLength: sanitized.length
      });
    }
    
    return sanitized;
  }
  
  sanitizeJSON(data) {
    if (!data) return data;
    
    try {
      // Convert to string and back to remove functions and undefined values
      const jsonString = JSON.stringify(data);
      const parsed = JSON.parse(jsonString);
      
      // Recursively sanitize string values
      return this.recursiveSanitize(parsed);
    } catch (error) {
      this.logger.error('Failed to sanitize JSON', error);
      return null;
    }
  }
  
  recursiveSanitize(obj) {
    if (typeof obj === 'string') {
      return this.sanitizeText(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.recursiveSanitize(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key
        const sanitizedKey = this.sanitizeText(key);
        // Recursively sanitize the value
        sanitized[sanitizedKey] = this.recursiveSanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  }
  
  detectSQLInjection(input) {
    if (!input || typeof input !== 'string') {
      return false;
    }
    
    for (const pattern of this.sqlPatterns) {
      if (pattern.test(input)) {
        this.logger.warn('Potential SQL injection detected', { input });
        return true;
      }
    }
    
    return false;
  }
  
  detectNoSQLInjection(input) {
    if (!input) return false;
    
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    
    for (const pattern of this.nosqlPatterns) {
      if (pattern.test(inputStr)) {
        this.logger.warn('Potential NoSQL injection detected', { input: inputStr });
        return true;
      }
    }
    
    // Check for object injection attempts
    if (typeof input === 'object') {
      const keys = Object.keys(input);
      for (const key of keys) {
        if (key.startsWith('$') || key.includes('.')) {
          this.logger.warn('Potential NoSQL operator injection detected', { key });
          return true;
        }
      }
    }
    
    return false;
  }
  
  sanitizeQuery(query) {
    if (!query) return {};
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(query)) {
      // Check for injection attempts
      if (this.detectSQLInjection(key) || this.detectNoSQLInjection(key)) {
        this.logger.warn('Query key contains potential injection', { key });
        continue;
      }
      
      if (this.detectSQLInjection(value) || this.detectNoSQLInjection(value)) {
        this.logger.warn('Query value contains potential injection', { key, value });
        continue;
      }
      
      // Sanitize the values
      sanitized[key] = this.recursiveSanitize(value);
    }
    
    return sanitized;
  }
  
  sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return 'unnamed';
    }
    
    // Remove path traversal attempts
    let sanitized = filename.replace(/\.\./g, '');
    sanitized = sanitized.replace(/[\/\\]/g, '');
    
    // Remove special characters except dots and hyphens
    sanitized = sanitized.replace(/[^a-zA-Z0-9.\-_]/g, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop();
      sanitized = sanitized.substring(0, 250) + '.' + ext;
    }
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'unnamed';
    }
    
    return sanitized;
  }
  
  sanitizeURL(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    try {
      // Validate URL format
      if (!validator.isURL(url, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true,
        require_host: true,
        require_tld: true,
        allow_query_components: true,
        allow_fragments: true
      })) {
        this.logger.warn('Invalid URL format', { url });
        return null;
      }
      
      // Parse and validate URL
      const parsed = new URL(url);
      
      // Check for suspicious patterns
      if (parsed.hostname.includes('@') || 
          parsed.hostname.includes(':') ||
          parsed.pathname.includes('..') ||
          parsed.href.includes('javascript:') ||
          parsed.href.includes('data:')) {
        this.logger.warn('Suspicious URL pattern detected', { url });
        return null;
      }
      
      // Rebuild URL with only safe components
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (error) {
      this.logger.error('Failed to sanitize URL', error);
      return null;
    }
  }
  
  sanitizeEmail(email) {
    if (!email || typeof email !== 'string') {
      return null;
    }
    
    const normalized = validator.normalizeEmail(email, {
      all_lowercase: true,
      gmail_remove_dots: true,
      gmail_remove_subaddress: true,
      outlookdotcom_remove_subaddress: true,
      yahoo_remove_subaddress: true
    });
    
    if (!validator.isEmail(normalized)) {
      this.logger.warn('Invalid email format', { email });
      return null;
    }
    
    return normalized;
  }
  
  validateAndSanitize(data, schema) {
    const sanitized = {};
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      
      // Check required fields
      if (rules.required && !value) {
        errors.push(`${field} is required`);
        continue;
      }
      
      // Skip optional empty fields
      if (!rules.required && !value) {
        continue;
      }
      
      // Apply type-specific sanitization
      let sanitizedValue = value;
      
      switch (rules.type) {
        case 'text':
          sanitizedValue = this.sanitizeText(value);
          break;
        case 'html':
          sanitizedValue = this.sanitizeHTML(value);
          break;
        case 'email':
          sanitizedValue = this.sanitizeEmail(value);
          if (!sanitizedValue) {
            errors.push(`${field} must be a valid email`);
          }
          break;
        case 'url':
          sanitizedValue = this.sanitizeURL(value);
          if (!sanitizedValue) {
            errors.push(`${field} must be a valid URL`);
          }
          break;
        case 'filename':
          sanitizedValue = this.sanitizeFilename(value);
          break;
        case 'number':
          sanitizedValue = validator.toFloat(value);
          if (isNaN(sanitizedValue)) {
            errors.push(`${field} must be a number`);
          }
          break;
        case 'boolean':
          sanitizedValue = validator.toBoolean(value);
          break;
        case 'json':
          sanitizedValue = this.sanitizeJSON(value);
          break;
        default:
          sanitizedValue = this.sanitizeText(value);
      }
      
      // Apply additional validation rules
      if (rules.minLength && sanitizedValue.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      
      if (rules.maxLength && sanitizedValue.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }
      
      if (rules.pattern && !rules.pattern.test(sanitizedValue)) {
        errors.push(`${field} has invalid format`);
      }
      
      if (rules.enum && !rules.enum.includes(sanitizedValue)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
      
      sanitized[field] = sanitizedValue;
    }
    
    return {
      valid: errors.length === 0,
      errors,
      data: sanitized
    };
  }
}