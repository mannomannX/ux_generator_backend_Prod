/**
 * Environment Variable Validator
 * 
 * Validates that all required environment variables are present and correctly formatted
 * for the cognitive-core service.
 */

export class EnvironmentValidator {
  constructor(logger) {
    this.logger = logger;
    
    // Required environment variables with their validation rules
    this.requiredVariables = {
      // AI Provider Configuration
      GOOGLE_API_KEY: {
        required: true,
        type: 'string',
        minLength: 20,
        description: 'Google Gemini API key for AI operations'
      },
      
      // Database Configuration
      MONGODB_URI: {
        required: true,
        type: 'string',
        pattern: /^mongodb:\/\/.*$/,
        default: 'mongodb://localhost:27017/ux-flow-engine',
        description: 'MongoDB connection URI'
      },
      
      // Redis Configuration
      REDIS_URL: {
        required: true,
        type: 'string',
        pattern: /^redis:\/\/.*$/,
        default: 'redis://localhost:6379',
        description: 'Redis connection URL for caching and rate limiting'
      },
      
      // Service Configuration
      PORT: {
        required: false,
        type: 'number',
        min: 1000,
        max: 65535,
        default: 3001,
        description: 'Port number for the cognitive-core service'
      },
      
      NODE_ENV: {
        required: false,
        type: 'string',
        allowedValues: ['development', 'production', 'test'],
        default: 'development',
        description: 'Node.js environment'
      },
      
      // Learning System Configuration
      ENABLE_LEARNING_SYSTEM: {
        required: false,
        type: 'boolean',
        default: 'true',
        description: 'Enable the self-learning prompt optimization system'
      },
      
      AUTO_ANALYZE_EPISODES: {
        required: false,
        type: 'boolean',
        default: 'true',
        description: 'Automatically analyze completed learning episodes'
      },
      
      AUTO_OPTIMIZE_PROMPTS: {
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Automatically optimize prompts based on analysis'
      },
      
      // Security Configuration
      JWT_SECRET: {
        required: true,
        type: 'string',
        minLength: 32,
        description: 'JWT signing secret for authentication'
      },
      
      ENCRYPTION_KEY: {
        required: false,
        type: 'string',
        minLength: 32,
        description: 'Encryption key for conversation storage'
      },
      
      // Rate Limiting Configuration
      RATE_LIMIT_ENABLED: {
        required: false,
        type: 'boolean',
        default: 'true',
        description: 'Enable rate limiting for API requests'
      },
      
      RATE_LIMIT_WINDOW_MS: {
        required: false,
        type: 'number',
        min: 1000,
        default: 60000,
        description: 'Rate limiting window in milliseconds'
      },
      
      RATE_LIMIT_MAX_REQUESTS: {
        required: false,
        type: 'number',
        min: 1,
        default: 100,
        description: 'Maximum requests per rate limiting window'
      },
      
      // Resource Management
      MAX_MEMORY_MB: {
        required: false,
        type: 'number',
        min: 256,
        default: 2048,
        description: 'Maximum memory usage in MB'
      },
      
      MAX_CONCURRENT_OPERATIONS: {
        required: false,
        type: 'number',
        min: 1,
        default: 20,
        description: 'Maximum concurrent operations'
      },
      
      // Optional AI Providers
      OPENAI_API_KEY: {
        required: false,
        type: 'string',
        minLength: 20,
        description: 'OpenAI API key (optional fallback provider)'
      },
      
      ANTHROPIC_API_KEY: {
        required: false,
        type: 'string',
        minLength: 20,
        description: 'Anthropic API key (optional fallback provider)'
      },
      
      // Monitoring and Logging
      LOG_LEVEL: {
        required: false,
        type: 'string',
        allowedValues: ['error', 'warn', 'info', 'debug'],
        default: 'info',
        description: 'Logging level'
      },
      
      ENABLE_METRICS: {
        required: false,
        type: 'boolean',
        default: 'true',
        description: 'Enable performance metrics collection'
      },
      
      METRICS_PORT: {
        required: false,
        type: 'number',
        min: 1000,
        max: 65535,
        default: 9090,
        description: 'Port for metrics endpoint'
      },
      
      // Development/Testing
      MOCK_AI_RESPONSES: {
        required: false,
        type: 'boolean',
        default: 'false',
        description: 'Use mock AI responses for testing'
      }
    };
  }
  
  /**
   * Validate all environment variables
   */
  async validateEnvironment() {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      missing: [],
      invalid: [],
      summary: {}
    };
    
    try {
      this.logger.info('Starting environment validation...');
      
      for (const [varName, config] of Object.entries(this.requiredVariables)) {
        const validation = this.validateVariable(varName, config);
        
        if (!validation.valid) {
          results.valid = false;
          
          if (validation.missing) {
            results.missing.push({
              variable: varName,
              description: config.description,
              required: config.required
            });
          }
          
          if (validation.error) {
            results.invalid.push({
              variable: varName,
              value: validation.value,
              error: validation.error,
              expected: validation.expected
            });
          }
        }
        
        if (validation.warning) {
          results.warnings.push({
            variable: varName,
            warning: validation.warning,
            value: validation.value
          });
        }
        
        results.summary[varName] = {
          present: validation.present,
          valid: validation.valid,
          value: validation.sanitizedValue || '[REDACTED]',
          source: validation.source
        };
      }
      
      // Check for unknown environment variables (potential typos)
      this.checkUnknownVariables(results);
      
      // Log validation results
      this.logValidationResults(results);
      
      return results;
      
    } catch (error) {
      this.logger.error('Environment validation failed', error);
      results.valid = false;
      results.errors.push(`Validation process failed: ${error.message}`);
      return results;
    }
  }
  
  /**
   * Validate a single environment variable
   */
  validateVariable(varName, config) {
    const result = {
      valid: true,
      present: false,
      missing: false,
      value: null,
      sanitizedValue: null,
      source: 'missing'
    };
    
    // Get variable value
    const envValue = process.env[varName];
    result.present = envValue !== undefined && envValue !== null && envValue !== '';
    
    if (!result.present) {
      if (config.required) {
        result.valid = false;
        result.missing = true;
        result.error = `Required environment variable ${varName} is missing`;
        return result;
      } else if (config.default !== undefined) {
        // Set default value
        process.env[varName] = String(config.default);
        result.value = config.default;
        result.sanitizedValue = this.sanitizeForLog(varName, config.default);
        result.source = 'default';
        result.warning = `Using default value for ${varName}`;
        return result;
      } else {
        // Optional variable not set
        result.source = 'optional';
        return result;
      }
    }
    
    result.value = envValue;
    result.sanitizedValue = this.sanitizeForLog(varName, envValue);
    result.source = 'environment';
    
    // Type validation
    const typeValidation = this.validateType(envValue, config);
    if (!typeValidation.valid) {
      result.valid = false;
      result.error = typeValidation.error;
      result.expected = typeValidation.expected;
      return result;
    }
    
    // Pattern validation
    if (config.pattern && !config.pattern.test(envValue)) {
      result.valid = false;
      result.error = `Value does not match required pattern`;
      result.expected = config.pattern.toString();
      return result;
    }
    
    // Allowed values validation
    if (config.allowedValues && !config.allowedValues.includes(envValue)) {
      result.valid = false;
      result.error = `Value not in allowed values`;
      result.expected = config.allowedValues.join(', ');
      return result;
    }
    
    // Length validation
    if (config.minLength && envValue.length < config.minLength) {
      result.valid = false;
      result.error = `Value too short (minimum ${config.minLength} characters)`;
      result.expected = `Minimum ${config.minLength} characters`;
      return result;
    }
    
    if (config.maxLength && envValue.length > config.maxLength) {
      result.valid = false;
      result.error = `Value too long (maximum ${config.maxLength} characters)`;
      result.expected = `Maximum ${config.maxLength} characters`;
      return result;
    }
    
    // Numeric range validation
    if (config.type === 'number') {
      const numValue = Number(envValue);
      
      if (config.min !== undefined && numValue < config.min) {
        result.valid = false;
        result.error = `Value too small (minimum ${config.min})`;
        result.expected = `Minimum ${config.min}`;
        return result;
      }
      
      if (config.max !== undefined && numValue > config.max) {
        result.valid = false;
        result.error = `Value too large (maximum ${config.max})`;
        result.expected = `Maximum ${config.max}`;
        return result;
      }
    }
    
    return result;
  }
  
  /**
   * Validate variable type
   */
  validateType(value, config) {
    const result = { valid: true };
    
    switch (config.type) {
      case 'string':
        if (typeof value !== 'string') {
          result.valid = false;
          result.error = 'Expected string value';
          result.expected = 'string';
        }
        break;
        
      case 'number':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          result.valid = false;
          result.error = 'Expected numeric value';
          result.expected = 'number';
        }
        break;
        
      case 'boolean':
        const boolValue = value.toLowerCase();
        if (!['true', 'false', '1', '0'].includes(boolValue)) {
          result.valid = false;
          result.error = 'Expected boolean value (true/false or 1/0)';
          result.expected = 'true, false, 1, or 0';
        }
        break;
        
      default:
        // No type specified, accept any
        break;
    }
    
    return result;
  }
  
  /**
   * Check for unknown environment variables that might be typos
   */
  checkUnknownVariables(results) {
    const knownVariables = new Set(Object.keys(this.requiredVariables));
    const commonPrefixes = ['NODE_', 'npm_', 'PATH', 'HOME', 'USER', 'SHELL'];
    
    for (const [key, value] of Object.entries(process.env)) {
      if (!knownVariables.has(key) && 
          !commonPrefixes.some(prefix => key.startsWith(prefix))) {
        
        // Check for possible typos
        const suggestions = this.findSimilarVariables(key, knownVariables);
        
        if (suggestions.length > 0) {
          results.warnings.push({
            variable: key,
            warning: `Unknown environment variable, did you mean: ${suggestions.join(', ')}?`,
            value: this.sanitizeForLog(key, value)
          });
        }
      }
    }
  }
  
  /**
   * Find similar variable names (for typo detection)
   */
  findSimilarVariables(target, knownVariables) {
    const suggestions = [];
    
    for (const known of knownVariables) {
      const distance = this.levenshteinDistance(target.toLowerCase(), known.toLowerCase());
      if (distance <= 2 && Math.abs(target.length - known.length) <= 2) {
        suggestions.push(known);
      }
    }
    
    return suggestions.slice(0, 3); // Max 3 suggestions
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Sanitize sensitive values for logging
   */
  sanitizeForLog(varName, value) {
    const sensitivePatterns = [
      /key/i,
      /secret/i,
      /token/i,
      /password/i,
      /credential/i
    ];
    
    if (sensitivePatterns.some(pattern => pattern.test(varName))) {
      return value ? `[${value.length} characters]` : '[empty]';
    }
    
    return value;
  }
  
  /**
   * Log validation results
   */
  logValidationResults(results) {
    if (results.valid) {
      this.logger.info('Environment validation completed successfully', {
        totalVariables: Object.keys(this.requiredVariables).length,
        warnings: results.warnings.length
      });
    } else {
      this.logger.error('Environment validation failed', {
        errors: results.errors.length,
        missing: results.missing.length,
        invalid: results.invalid.length
      });
    }
    
    // Log missing required variables
    if (results.missing.length > 0) {
      this.logger.error('Missing required environment variables:', {
        missing: results.missing.map(m => ({
          variable: m.variable,
          description: m.description
        }))
      });
    }
    
    // Log invalid variables
    if (results.invalid.length > 0) {
      this.logger.error('Invalid environment variables:', {
        invalid: results.invalid.map(i => ({
          variable: i.variable,
          error: i.error,
          expected: i.expected
        }))
      });
    }
    
    // Log warnings
    if (results.warnings.length > 0) {
      this.logger.warn('Environment variable warnings:', {
        warnings: results.warnings.map(w => ({
          variable: w.variable,
          warning: w.warning
        }))
      });
    }
  }
  
  /**
   * Get configuration summary for startup logs
   */
  getConfigurationSummary() {
    const summary = {
      service: 'cognitive-core',
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3001,
      features: {
        learningSystem: process.env.ENABLE_LEARNING_SYSTEM === 'true',
        rateLimiting: process.env.RATE_LIMIT_ENABLED !== 'false',
        metrics: process.env.ENABLE_METRICS !== 'false',
        encryption: !!process.env.ENCRYPTION_KEY
      },
      providers: {
        google: !!process.env.GOOGLE_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY
      },
      database: {
        mongodb: !!process.env.MONGODB_URI,
        redis: !!process.env.REDIS_URL
      }
    };
    
    return summary;
  }
  
  /**
   * Validate and initialize environment on startup
   */
  static async validateAndInitialize(logger) {
    const validator = new EnvironmentValidator(logger);
    
    const results = await validator.validateEnvironment();
    
    if (!results.valid) {
      logger.error('Critical environment validation failures detected');
      
      // Log startup-blocking errors
      const criticalErrors = [
        ...results.missing.filter(m => m.required),
        ...results.invalid
      ];
      
      if (criticalErrors.length > 0) {
        logger.error('The following issues must be resolved before starting:', {
          criticalErrors
        });
        
        throw new Error(`Environment validation failed: ${criticalErrors.length} critical issues`);
      }
    }
    
    // Log configuration summary
    const summary = validator.getConfigurationSummary();
    logger.info('Cognitive-core service configuration:', summary);
    
    return {
      validator,
      results,
      summary
    };
  }
}