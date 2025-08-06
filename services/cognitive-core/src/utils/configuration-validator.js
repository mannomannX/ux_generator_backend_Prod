// ==========================================
// SERVICES/COGNITIVE-CORE/src/utils/configuration-validator.js
// ==========================================

/**
 * ConfigurationValidator validates service configuration and environment setup
 * Ensures all required settings are present and valid for production deployment
 */
class ConfigurationValidator {
  constructor(logger) {
    this.logger = logger;
    this.validationResults = {
      errors: [],
      warnings: [],
      info: [],
      score: 0
    };
  }

  /**
   * Validate complete service configuration
   */
  async validateConfiguration(config, env = process.env) {
    this.validationResults = { errors: [], warnings: [], info: [], score: 0 };
    
    this.logger.info('Starting configuration validation', {
      component: 'ConfigurationValidator',
      environment: env.NODE_ENV || 'development'
    });

    // Core validation checks
    await this.validateEnvironmentVariables(env);
    await this.validateServiceConfiguration(config);
    await this.validateSecuritySettings(config, env);
    await this.validateAIProviderSettings(config, env);
    await this.validateDatabaseSettings(config, env);
    await this.validatePerformanceSettings(config);
    await this.validateMonitoringSettings(config);
    await this.validateProductionReadiness(env);

    // Calculate overall score
    this.calculateValidationScore();

    // Log summary
    this.logValidationSummary();

    return this.validationResults;
  }

  /**
   * Validate required environment variables
   */
  async validateEnvironmentVariables(env) {
    const requiredVars = [
      { name: 'COGNITIVE_CORE_PORT', type: 'number', default: 3001 },
      { name: 'NODE_ENV', type: 'string', required: true },
      { name: 'GOOGLE_API_KEY', type: 'string', required: true, sensitive: true },
      { name: 'MONGODB_URI', type: 'string', required: true, sensitive: true },
      { name: 'REDIS_URL', type: 'string', required: true, sensitive: true },
      { name: 'JWT_SECRET', type: 'string', required: true, sensitive: true }
    ];

    const optionalVars = [
      { name: 'OPENAI_API_KEY', type: 'string', sensitive: true },
      { name: 'CLAUDE_API_KEY', type: 'string', sensitive: true },
      { name: 'LOG_LEVEL', type: 'string', default: 'info' },
      { name: 'AGENT_DEFAULT_QUALITY_MODE', type: 'string', default: 'standard' },
      { name: 'AGENT_RETRY_ATTEMPTS', type: 'number', default: 2 },
      { name: 'AGENT_TIMEOUT_MS', type: 'number', default: 30000 }
    ];

    this.validateVariables(env, requiredVars, true);
    this.validateVariables(env, optionalVars, false);

    // Validate specific constraints
    this.validatePortNumber(env.COGNITIVE_CORE_PORT);
    this.validateEnvironmentType(env.NODE_ENV);
    this.validateLogLevel(env.LOG_LEVEL);
  }

  /**
   * Validate service-specific configuration
   */
  async validateServiceConfiguration(config) {
    if (!config) {
      this.addError('Service configuration object is missing');
      return;
    }

    // Validate port configuration
    if (config.port) {
      if (typeof config.port !== 'number' || config.port < 1024 || config.port > 65535) {
        this.addError(`Invalid port number: ${config.port}. Must be between 1024-65535`);
      }
    }

    // Validate agent configuration
    if (config.agents) {
      this.validateAgentConfiguration(config.agents);
    }

    // Validate logging configuration
    if (config.logging) {
      this.validateLoggingConfiguration(config.logging);
    }

    this.addInfo('Service configuration structure validated');
  }

  /**
   * Validate security settings
   */
  async validateSecuritySettings(config, env) {
    // JWT Secret validation
    if (env.JWT_SECRET) {
      if (env.JWT_SECRET.length < 32) {
        this.addError('JWT_SECRET must be at least 32 characters long');
      } else if (env.JWT_SECRET.length < 64) {
        this.addWarning('JWT_SECRET should be at least 64 characters for better security');
      }
      
      // Check for weak secrets
      if (/^(test|demo|secret|password|123)/.test(env.JWT_SECRET.toLowerCase())) {
        this.addError('JWT_SECRET appears to be a weak default value');
      }
    }

    // Validate HTTPS in production
    if (env.NODE_ENV === 'production') {
      if (!env.FORCE_HTTPS && !env.HTTPS_ENABLED) {
        this.addWarning('HTTPS should be enabled in production environment');
      }
    }

    // Rate limiting validation
    if (config.rateLimiting) {
      if (!config.rateLimiting.windowMs || !config.rateLimiting.max) {
        this.addWarning('Rate limiting configuration incomplete');
      }
    }

    this.addInfo('Security settings validated');
  }

  /**
   * Validate AI provider settings
   */
  async validateAIProviderSettings(config, env) {
    const providers = [];
    
    // Google Gemini (required)
    if (env.GOOGLE_API_KEY) {
      if (!env.GOOGLE_API_KEY.startsWith('AIza')) {
        this.addWarning('GOOGLE_API_KEY format appears invalid (should start with AIza)');
      } else {
        providers.push('google-gemini');
      }
    }

    // OpenAI (optional)
    if (env.OPENAI_API_KEY) {
      if (!env.OPENAI_API_KEY.startsWith('sk-')) {
        this.addWarning('OPENAI_API_KEY format appears invalid (should start with sk-)');
      } else {
        providers.push('openai');
      }
    }

    // Claude (optional)
    if (env.CLAUDE_API_KEY) {
      if (!env.CLAUDE_API_KEY.startsWith('sk-ant-')) {
        this.addWarning('CLAUDE_API_KEY format appears invalid (should start with sk-ant-)');
      } else {
        providers.push('claude');
      }
    }

    if (providers.length === 0) {
      this.addError('No valid AI providers configured');
    } else if (providers.length === 1) {
      this.addWarning('Only one AI provider configured. Consider adding fallback providers.');
    } else {
      this.addInfo(`Multi-provider setup detected: ${providers.join(', ')}`);
    }

    // Validate quality modes
    const validQualityModes = ['standard', 'pro'];
    if (env.AGENT_DEFAULT_QUALITY_MODE && !validQualityModes.includes(env.AGENT_DEFAULT_QUALITY_MODE)) {
      this.addError(`Invalid AGENT_DEFAULT_QUALITY_MODE: ${env.AGENT_DEFAULT_QUALITY_MODE}`);
    }
  }

  /**
   * Validate database settings
   */
  async validateDatabaseSettings(config, env) {
    // MongoDB validation
    if (env.MONGODB_URI) {
      if (!env.MONGODB_URI.startsWith('mongodb://') && !env.MONGODB_URI.startsWith('mongodb+srv://')) {
        this.addError('MONGODB_URI must start with mongodb:// or mongodb+srv://');
      }

      // Check for localhost in production
      if (env.NODE_ENV === 'production' && env.MONGODB_URI.includes('localhost')) {
        this.addWarning('Using localhost MongoDB connection in production');
      }

      // Check for default database name
      if (env.MONGODB_URI.includes('test') && env.NODE_ENV === 'production') {
        this.addWarning('Using test database name in production');
      }
    }

    // Redis validation
    if (env.REDIS_URL) {
      if (!env.REDIS_URL.startsWith('redis://') && !env.REDIS_URL.startsWith('rediss://')) {
        this.addError('REDIS_URL must start with redis:// or rediss://');
      }

      // Check for SSL in production
      if (env.NODE_ENV === 'production' && env.REDIS_URL.startsWith('redis://')) {
        this.addWarning('Consider using rediss:// (SSL) for Redis in production');
      }
    }

    this.addInfo('Database settings validated');
  }

  /**
   * Validate performance settings
   */
  async validatePerformanceSettings(config) {
    // Agent timeout validation
    const agentTimeout = parseInt(process.env.AGENT_TIMEOUT_MS) || 30000;
    if (agentTimeout < 5000) {
      this.addWarning('AGENT_TIMEOUT_MS is very low (<5s), may cause timeouts');
    } else if (agentTimeout > 120000) {
      this.addWarning('AGENT_TIMEOUT_MS is very high (>120s), may impact responsiveness');
    }

    // Retry attempts validation
    const retryAttempts = parseInt(process.env.AGENT_RETRY_ATTEMPTS) || 2;
    if (retryAttempts < 1) {
      this.addError('AGENT_RETRY_ATTEMPTS must be at least 1');
    } else if (retryAttempts > 5) {
      this.addWarning('AGENT_RETRY_ATTEMPTS is high (>5), may impact performance');
    }

    // Memory and performance warnings
    if (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('--max-old-space-size')) {
      const match = process.env.NODE_OPTIONS.match(/--max-old-space-size=(\d+)/);
      if (match) {
        const memoryMB = parseInt(match[1]);
        if (memoryMB < 512) {
          this.addWarning('Low memory allocation detected (<512MB)');
        }
      }
    }

    this.addInfo('Performance settings validated');
  }

  /**
   * Validate monitoring settings
   */
  async validateMonitoringSettings(config) {
    // Metrics configuration
    if (process.env.ENABLE_METRICS === 'false') {
      this.addWarning('Metrics collection is disabled');
    }

    // Debug mode in production
    if (process.env.NODE_ENV === 'production') {
      if (process.env.LOG_LEVEL === 'debug') {
        this.addWarning('Debug logging enabled in production (performance impact)');
      }

      if (process.env.ENABLE_DEBUG_MODE === 'true') {
        this.addError('Debug mode should not be enabled in production');
      }
    }

    // Health check configuration
    if (config.healthCheck) {
      if (!config.healthCheck.timeout || config.healthCheck.timeout > 10000) {
        this.addWarning('Health check timeout should be reasonable (<10s)');
      }
    }

    this.addInfo('Monitoring settings validated');
  }

  /**
   * Validate production readiness
   */
  async validateProductionReadiness(env) {
    if (env.NODE_ENV !== 'production') {
      this.addInfo('Running in development mode - production checks skipped');
      return;
    }

    const productionChecks = [
      { check: () => env.JWT_SECRET && env.JWT_SECRET.length >= 64, message: 'Strong JWT secret' },
      { check: () => env.MONGODB_URI && !env.MONGODB_URI.includes('localhost'), message: 'Remote MongoDB connection' },
      { check: () => env.REDIS_URL && !env.REDIS_URL.includes('localhost'), message: 'Remote Redis connection' },
      { check: () => env.LOG_LEVEL !== 'debug', message: 'Appropriate log level for production' },
      { check: () => !env.ENABLE_DEBUG_MODE || env.ENABLE_DEBUG_MODE === 'false', message: 'Debug mode disabled' },
      { check: () => env.OPENAI_API_KEY || env.CLAUDE_API_KEY, message: 'Fallback AI providers configured' }
    ];

    let passedChecks = 0;
    productionChecks.forEach(({ check, message }) => {
      if (check()) {
        passedChecks++;
        this.addInfo(`✓ ${message}`);
      } else {
        this.addWarning(`✗ ${message}`);
      }
    });

    const productionScore = (passedChecks / productionChecks.length) * 100;
    
    if (productionScore >= 80) {
      this.addInfo(`Production readiness: ${productionScore.toFixed(0)}% (Good)`);
    } else if (productionScore >= 60) {
      this.addWarning(`Production readiness: ${productionScore.toFixed(0)}% (Needs improvement)`);
    } else {
      this.addError(`Production readiness: ${productionScore.toFixed(0)}% (Not ready)`);
    }
  }

  /**
   * Helper validation methods
   */

  validateVariables(env, variables, required) {
    variables.forEach(variable => {
      const value = env[variable.name];
      
      if (!value) {
        if (required || variable.required) {
          this.addError(`Required environment variable missing: ${variable.name}`);
        } else if (variable.default !== undefined) {
          this.addInfo(`Using default value for ${variable.name}: ${variable.default}`);
        }
        return;
      }

      // Type validation
      if (variable.type === 'number' && isNaN(Number(value))) {
        this.addError(`${variable.name} must be a number, got: ${value}`);
      }

      // Sensitive variable logging
      if (variable.sensitive) {
        this.addInfo(`${variable.name}: [PROVIDED]`);
      } else {
        this.addInfo(`${variable.name}: ${value}`);
      }
    });
  }

  validatePortNumber(port) {
    if (port) {
      const portNum = Number(port);
      if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
        this.addError(`Invalid port number: ${port}. Must be between 1024-65535`);
      }
    }
  }

  validateEnvironmentType(nodeEnv) {
    const validEnvironments = ['development', 'staging', 'production', 'test'];
    if (nodeEnv && !validEnvironments.includes(nodeEnv)) {
      this.addWarning(`Unknown NODE_ENV: ${nodeEnv}. Expected: ${validEnvironments.join(', ')}`);
    }
  }

  validateLogLevel(logLevel) {
    const validLevels = ['error', 'warn', 'info', 'debug'];
    if (logLevel && !validLevels.includes(logLevel)) {
      this.addWarning(`Unknown LOG_LEVEL: ${logLevel}. Expected: ${validLevels.join(', ')}`);
    }
  }

  validateAgentConfiguration(agentConfig) {
    if (agentConfig.defaultQualityMode) {
      const validModes = ['standard', 'pro'];
      if (!validModes.includes(agentConfig.defaultQualityMode)) {
        this.addError(`Invalid defaultQualityMode: ${agentConfig.defaultQualityMode}`);
      }
    }

    if (agentConfig.retryAttempts !== undefined) {
      if (agentConfig.retryAttempts < 0 || agentConfig.retryAttempts > 10) {
        this.addError('Agent retry attempts should be between 0-10');
      }
    }

    if (agentConfig.timeoutMs !== undefined) {
      if (agentConfig.timeoutMs < 1000 || agentConfig.timeoutMs > 300000) {
        this.addError('Agent timeout should be between 1s-300s');
      }
    }
  }

  validateLoggingConfiguration(loggingConfig) {
    if (loggingConfig.level) {
      this.validateLogLevel(loggingConfig.level);
    }

    if (loggingConfig.structuredFormat !== undefined && typeof loggingConfig.structuredFormat !== 'boolean') {
      this.addWarning('structuredFormat should be a boolean value');
    }
  }

  calculateValidationScore() {
    const totalChecks = this.validationResults.errors.length + 
                       this.validationResults.warnings.length + 
                       this.validationResults.info.length;

    if (totalChecks === 0) {
      this.validationResults.score = 100;
      return;
    }

    // Scoring: Errors = -10 points, Warnings = -2 points, Info = +1 point
    const errorPenalty = this.validationResults.errors.length * 10;
    const warningPenalty = this.validationResults.warnings.length * 2;
    const infoBonus = this.validationResults.info.length * 1;

    const rawScore = 100 - errorPenalty - warningPenalty + (infoBonus * 0.5);
    this.validationResults.score = Math.max(0, Math.min(100, rawScore));
  }

  logValidationSummary() {
    const { errors, warnings, info, score } = this.validationResults;
    
    this.logger.info('Configuration validation completed', {
      component: 'ConfigurationValidator',
      summary: {
        score: score.toFixed(1),
        errors: errors.length,
        warnings: warnings.length,
        info: info.length,
        status: this.getValidationStatus(score)
      }
    });

    // Log errors
    if (errors.length > 0) {
      this.logger.error('Configuration validation errors found', {
        component: 'ConfigurationValidator',
        errors
      });
    }

    // Log warnings
    if (warnings.length > 0) {
      this.logger.warn('Configuration validation warnings found', {
        component: 'ConfigurationValidator',
        warnings
      });
    }

    // Log detailed info in debug mode
    if (process.env.LOG_LEVEL === 'debug' && info.length > 0) {
      this.logger.debug('Configuration validation details', {
        component: 'ConfigurationValidator',
        details: info
      });
    }
  }

  getValidationStatus(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'acceptable';
    if (score >= 40) return 'needs_improvement';
    return 'critical_issues';
  }

  // Utility methods to add validation results
  addError(message) {
    this.validationResults.errors.push(message);
  }

  addWarning(message) {
    this.validationResults.warnings.push(message);
  }

  addInfo(message) {
    this.validationResults.info.push(message);
  }

  /**
   * Get validation results summary
   */
  getValidationSummary() {
    const { errors, warnings, info, score } = this.validationResults;
    
    return {
      score,
      status: this.getValidationStatus(score),
      summary: {
        errors: errors.length,
        warnings: warnings.length,
        info: info.length,
        ready: errors.length === 0 && warnings.length <= 2
      },
      details: {
        errors,
        warnings,
        info
      },
      timestamp: new Date()
    };
  }
}

export { ConfigurationValidator };