import { Logger } from '@ux-flow/common';
import crypto from 'crypto';
import { CONFIG } from '../config/constants.js';
import { ErrorFactory } from '../utils/errors.js';

export class VectorSecurity {
  constructor(logger = new Logger('VectorSecurity')) {
    this.logger = logger;
    
    // Security thresholds from config
    this.maxVectorDimension = CONFIG.SECURITY.VECTOR.MAX_DIMENSION;
    this.minVectorDimension = CONFIG.SECURITY.VECTOR.MIN_DIMENSION;
    this.maxMetadataSize = CONFIG.SECURITY.VECTOR.MAX_METADATA_SIZE;
    this.allowedMetadataKeys = CONFIG.SECURITY.VECTOR.ALLOWED_METADATA_KEYS;
    this.maxQueryResults = 100;
    this.minSimilarityScore = 0.0;
    this.maxSimilarityScore = 1.0;
    
    // Rate limiting for vector operations
    this.queryRateLimit = new Map();
    this.maxQueriesPerMinute = 60;
    
    // Embedding validation patterns
    this.suspiciousPatterns = [
      /[<>]/g,  // HTML tags
      /javascript:/gi,
      /data:/gi,
      /vbscript:/gi,
      /on\w+=/gi,
      /\{\{.*\}\}/g,  // Template injection
      /\$\{.*\}/g,    // Template literals
      /<script/gi,
      /eval\(/gi,
      /Function\(/gi
    ];
  }
  
  validateEmbeddingInput(text) {
    const validation = {
      valid: true,
      sanitized: text,
      warnings: []
    };
    
    // Check for empty input
    if (!text || typeof text !== 'string') {
      validation.valid = false;
      validation.warnings.push('Invalid or empty input');
      return validation;
    }
    
    // Check length constraints
    if (text.length > 10000) {
      validation.sanitized = text.substring(0, 10000);
      validation.warnings.push('Input truncated to 10000 characters');
    }
    
    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(text)) {
        validation.warnings.push(`Suspicious pattern detected: ${pattern.source}`);
        validation.sanitized = validation.sanitized.replace(pattern, '');
      }
    }
    
    // Remove non-printable characters
    validation.sanitized = validation.sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalize whitespace
    validation.sanitized = validation.sanitized.replace(/\s+/g, ' ').trim();
    
    if (validation.sanitized.length === 0) {
      validation.valid = false;
      validation.warnings.push('Input became empty after sanitization');
    }
    
    return validation;
  }
  
  validateVector(vector) {
    const validation = {
      valid: true,
      errors: []
    };
    
    // Check if vector is an array
    if (!Array.isArray(vector)) {
      validation.valid = false;
      validation.errors.push('Vector must be an array');
      return validation;
    }
    
    // Check vector dimension
    if (vector.length === 0 || vector.length > this.maxVectorDimension) {
      validation.valid = false;
      validation.errors.push(`Vector dimension must be between 1 and ${this.maxVectorDimension}`);
      return validation;
    }
    
    // Validate each element
    for (let i = 0; i < vector.length; i++) {
      const element = vector[i];
      
      // Check if element is a number
      if (typeof element !== 'number' || isNaN(element)) {
        validation.valid = false;
        validation.errors.push(`Vector element at index ${i} is not a valid number`);
        continue;
      }
      
      // Check for infinity
      if (!isFinite(element)) {
        validation.valid = false;
        validation.errors.push(`Vector element at index ${i} is infinite`);
        continue;
      }
      
      // Check reasonable range (-1000 to 1000 for normalized vectors)
      if (Math.abs(element) > 1000) {
        validation.valid = false;
        validation.errors.push(`Vector element at index ${i} is out of reasonable range`);
      }
    }
    
    return validation;
  }
  
  validateSearchQuery(query) {
    const validation = {
      valid: true,
      sanitized: {},
      errors: []
    };
    
    // Validate text if present
    if (query.text) {
      const textValidation = this.validateEmbeddingInput(query.text);
      if (!textValidation.valid) {
        validation.valid = false;
        validation.errors.push(...textValidation.warnings);
      }
      validation.sanitized.text = textValidation.sanitized;
    }
    
    // Validate vector if present
    if (query.vector) {
      const vectorValidation = this.validateVector(query.vector);
      if (!vectorValidation.valid) {
        validation.valid = false;
        validation.errors.push(...vectorValidation.errors);
      }
      validation.sanitized.vector = query.vector;
    }
    
    // Validate and sanitize limit
    if (query.limit !== undefined) {
      const limit = parseInt(query.limit, 10);
      if (isNaN(limit) || limit < 1) {
        validation.sanitized.limit = 10;
        validation.errors.push('Invalid limit, using default: 10');
      } else if (limit > this.maxQueryResults) {
        validation.sanitized.limit = this.maxQueryResults;
        validation.errors.push(`Limit exceeded maximum, capped at ${this.maxQueryResults}`);
      } else {
        validation.sanitized.limit = limit;
      }
    } else {
      validation.sanitized.limit = 10;
    }
    
    // Validate similarity threshold
    if (query.threshold !== undefined) {
      const threshold = parseFloat(query.threshold);
      if (isNaN(threshold) || threshold < this.minSimilarityScore || threshold > this.maxSimilarityScore) {
        validation.sanitized.threshold = 0.5;
        validation.errors.push('Invalid threshold, using default: 0.5');
      } else {
        validation.sanitized.threshold = threshold;
      }
    } else {
      validation.sanitized.threshold = 0.5;
    }
    
    // Validate filters
    if (query.filters) {
      validation.sanitized.filters = this.sanitizeFilters(query.filters);
    }
    
    return validation;
  }
  
  sanitizeFilters(filters) {
    if (!filters || typeof filters !== 'object') {
      return {};
    }
    
    const sanitized = {};
    const allowedOperators = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin'];
    
    for (const [key, value] of Object.entries(filters)) {
      // Skip keys with suspicious characters
      if (key.includes('$') && !allowedOperators.includes(key)) {
        this.logger.warn('Suspicious filter operator blocked', { key });
        continue;
      }
      
      // Sanitize the value based on type
      if (typeof value === 'string') {
        // Remove potential injection attempts
        sanitized[key] = value.replace(/[<>'"]/g, '');
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeFilters(value);
      } else if (Array.isArray(value)) {
        // Sanitize array elements
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? item.replace(/[<>'"]/g, '') : item
        );
      } else {
        // Keep numbers and booleans as is
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  checkRateLimit(userId) {
    const now = Date.now();
    const userQueries = this.queryRateLimit.get(userId) || [];
    
    // Remove queries older than 1 minute
    const recentQueries = userQueries.filter(timestamp => now - timestamp < 60000);
    
    if (recentQueries.length >= this.maxQueriesPerMinute) {
      this.logger.warn('Rate limit exceeded for vector queries', { userId });
      return false;
    }
    
    // Add current query
    recentQueries.push(now);
    this.queryRateLimit.set(userId, recentQueries);
    
    return true;
  }
  
  hashVector(vector) {
    // Create a hash of the vector for caching and deduplication
    const vectorString = JSON.stringify(vector);
    return crypto.createHash('sha256').update(vectorString).digest('hex');
  }
  
  normalizeVector(vector) {
    // L2 normalization for consistent similarity calculations
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) {
      return vector;
    }
    
    return vector.map(val => val / magnitude);
  }
  
  calculateCosineSimilarity(vector1, vector2) {
    if (vector1.length !== vector2.length) {
      throw new Error('Vectors must have the same dimension');
    }
    
    // Normalize vectors
    const norm1 = this.normalizeVector(vector1);
    const norm2 = this.normalizeVector(vector2);
    
    // Calculate dot product
    const dotProduct = norm1.reduce((sum, val, i) => sum + val * norm2[i], 0);
    
    // Cosine similarity is the dot product of normalized vectors
    return Math.max(0, Math.min(1, dotProduct));
  }
  
  anonymizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return {};
    }
    
    const anonymized = { ...metadata };
    
    // Remove or hash sensitive fields
    const sensitiveFields = ['email', 'phone', 'ssn', 'creditCard', 'password', 'apiKey', 'token'];
    
    for (const field of sensitiveFields) {
      if (anonymized[field]) {
        // Hash sensitive data instead of storing it
        anonymized[field] = crypto.createHash('sha256')
          .update(anonymized[field])
          .digest('hex')
          .substring(0, 8);
      }
    }
    
    // Remove any fields that look like personal identifiers
    for (const key of Object.keys(anonymized)) {
      if (key.toLowerCase().includes('name') || 
          key.toLowerCase().includes('address') ||
          key.toLowerCase().includes('dob') ||
          key.toLowerCase().includes('birth')) {
        delete anonymized[key];
      }
    }
    
    return anonymized;
  }
  
  validateBatchOperation(items) {
    const maxBatchSize = 100;
    
    if (!Array.isArray(items)) {
      return {
        valid: false,
        error: 'Batch items must be an array'
      };
    }
    
    if (items.length === 0) {
      return {
        valid: false,
        error: 'Batch cannot be empty'
      };
    }
    
    if (items.length > maxBatchSize) {
      return {
        valid: false,
        error: `Batch size exceeds maximum of ${maxBatchSize}`
      };
    }
    
    // Validate each item
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      if (!item.id) {
        errors.push(`Item at index ${i} missing required 'id' field`);
      }
      
      if (item.vector) {
        const vectorValidation = this.validateVector(item.vector);
        if (!vectorValidation.valid) {
          errors.push(`Item at index ${i}: ${vectorValidation.errors.join(', ')}`);
        }
      }
      
      if (item.text) {
        const textValidation = this.validateEmbeddingInput(item.text);
        if (!textValidation.valid) {
          errors.push(`Item at index ${i}: ${textValidation.warnings.join(', ')}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Comprehensive vector validation
   */
  validateVector(vector, expectedDimension = null) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check if vector exists and is array
    if (!vector || !Array.isArray(vector)) {
      validation.valid = false;
      validation.errors.push('Vector must be a non-empty array');
      return validation;
    }

    // Check dimension bounds
    if (vector.length < this.minVectorDimension) {
      validation.valid = false;
      validation.errors.push(`Vector dimension ${vector.length} is below minimum ${this.minVectorDimension}`);
    }

    if (vector.length > this.maxVectorDimension) {
      validation.valid = false;
      validation.errors.push(`Vector dimension ${vector.length} exceeds maximum ${this.maxVectorDimension}`);
    }

    // Check expected dimension if provided
    if (expectedDimension && vector.length !== expectedDimension) {
      validation.valid = false;
      validation.errors.push(`Vector dimension ${vector.length} does not match expected ${expectedDimension}`);
    }

    // Validate vector values
    let hasNaN = false;
    let hasInfinity = false;
    let outOfRange = false;
    let zeroVector = true;
    let magnitude = 0;

    for (let i = 0; i < vector.length; i++) {
      const value = vector[i];

      // Check if value is a number
      if (typeof value !== 'number') {
        validation.valid = false;
        validation.errors.push(`Non-numeric value at index ${i}: ${typeof value}`);
        continue;
      }

      // Check for NaN
      if (isNaN(value)) {
        hasNaN = true;
        validation.valid = false;
      }

      // Check for Infinity
      if (!isFinite(value)) {
        hasInfinity = true;
        validation.valid = false;
      }

      // Check range (typical embeddings are between -1 and 1, but allow wider range)
      if (value < -100 || value > 100) {
        outOfRange = true;
        validation.warnings.push(`Value at index ${i} is unusually large: ${value}`);
      }

      // Check if vector is all zeros
      if (value !== 0) {
        zeroVector = false;
      }

      // Calculate magnitude for normalization check
      magnitude += value * value;
    }

    if (hasNaN) {
      validation.errors.push('Vector contains NaN values');
    }

    if (hasInfinity) {
      validation.errors.push('Vector contains Infinity values');
    }

    if (outOfRange) {
      validation.warnings.push('Vector contains values outside typical range');
    }

    if (zeroVector) {
      validation.valid = false;
      validation.errors.push('Vector is all zeros');
    }

    // Check if vector is normalized (magnitude should be close to 1)
    magnitude = Math.sqrt(magnitude);
    if (magnitude < 0.9 || magnitude > 1.1) {
      validation.warnings.push(`Vector may not be normalized (magnitude: ${magnitude.toFixed(4)})`);
    }

    return validation;
  }

  /**
   * Validate vector metadata
   */
  validateMetadata(metadata) {
    const validation = {
      valid: true,
      errors: [],
      sanitized: {}
    };

    if (!metadata || typeof metadata !== 'object') {
      return validation;
    }

    // Check metadata size
    const metadataStr = JSON.stringify(metadata);
    if (metadataStr.length > this.maxMetadataSize) {
      validation.valid = false;
      validation.errors.push(`Metadata size ${metadataStr.length} exceeds maximum ${this.maxMetadataSize}`);
      return validation;
    }

    // Validate and sanitize each key
    for (const [key, value] of Object.entries(metadata)) {
      // Check if key is allowed
      if (this.allowedMetadataKeys.length > 0 && !this.allowedMetadataKeys.includes(key)) {
        validation.errors.push(`Metadata key '${key}' is not allowed`);
        continue;
      }

      // Sanitize key (remove special characters)
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
      if (sanitizedKey !== key) {
        validation.warnings.push(`Metadata key '${key}' was sanitized to '${sanitizedKey}'`);
      }

      // Sanitize value based on type
      if (typeof value === 'string') {
        validation.sanitized[sanitizedKey] = value.replace(/[<>'"]/g, '');
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        validation.sanitized[sanitizedKey] = value;
      } else if (value instanceof Date) {
        validation.sanitized[sanitizedKey] = value.toISOString();
      } else if (Array.isArray(value)) {
        validation.sanitized[sanitizedKey] = value.map(v => 
          typeof v === 'string' ? v.replace(/[<>'"]/g, '') : v
        );
      } else if (typeof value === 'object' && value !== null) {
        // Recursively validate nested objects (limited depth)
        const nestedValidation = this.validateMetadata(value);
        validation.sanitized[sanitizedKey] = nestedValidation.sanitized;
      } else {
        validation.errors.push(`Invalid metadata value type for key '${key}': ${typeof value}`);
      }
    }

    return validation;
  }

  /**
   * Validate similarity score
   */
  validateSimilarityScore(score) {
    if (typeof score !== 'number') {
      throw ErrorFactory.invalidVector('Similarity score must be a number');
    }

    if (isNaN(score) || !isFinite(score)) {
      throw ErrorFactory.invalidVector('Similarity score must be a valid number');
    }

    if (score < this.minSimilarityScore || score > this.maxSimilarityScore) {
      throw ErrorFactory.invalidVector(
        `Similarity score ${score} is outside valid range [${this.minSimilarityScore}, ${this.maxSimilarityScore}]`
      );
    }

    return true;
  }

  /**
   * Sanitize vector for storage
   */
  sanitizeVector(vector) {
    if (!Array.isArray(vector)) {
      throw ErrorFactory.invalidVector('Vector must be an array');
    }

    return vector.map(value => {
      // Convert to number and handle edge cases
      const num = Number(value);
      
      if (isNaN(num)) {
        throw ErrorFactory.invalidVector('Vector contains non-numeric values');
      }
      
      if (!isFinite(num)) {
        throw ErrorFactory.invalidVector('Vector contains infinite values');
      }
      
      // Round to reasonable precision to avoid floating point issues
      return Math.round(num * 1000000) / 1000000;
    });
  }

  generateSecureId() {
    // Generate a secure random ID for vector documents
    return crypto.randomBytes(16).toString('hex');
  }
  
  getSecurityMetrics() {
    return {
      maxVectorDimension: this.maxVectorDimension,
      maxQueryResults: this.maxQueryResults,
      maxQueriesPerMinute: this.maxQueriesPerMinute,
      activeRateLimits: this.queryRateLimit.size,
      suspiciousPatternsCount: this.suspiciousPatterns.length
    };
  }
}