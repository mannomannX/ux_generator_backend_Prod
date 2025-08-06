// ==========================================
// COGNITIVE CORE SERVICE - Advanced Error Handling Middleware
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * Custom Error Classes for different error types
 */
export class AIProviderError extends Error {
  constructor(message, provider, originalError) {
    super(message);
    this.name = 'AIProviderError';
    this.provider = provider;
    this.originalError = originalError;
    this.statusCode = 503;
    this.retryable = true;
    this.timestamp = new Date();
  }
}

export class AgentExecutionError extends Error {
  constructor(message, agentName, taskId, originalError) {
    super(message);
    this.name = 'AgentExecutionError';
    this.agentName = agentName;
    this.taskId = taskId;
    this.originalError = originalError;
    this.statusCode = 500;
    this.retryable = false;
    this.timestamp = new Date();
  }
}

export class ValidationError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.statusCode = 400;
    this.retryable = false;
    this.timestamp = new Date();
  }
}

export class RateLimitError extends Error {
  constructor(message, provider, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfter = retryAfter;
    this.statusCode = 429;
    this.retryable = true;
    this.timestamp = new Date();
  }
}

export class ConversationStateError extends Error {
  constructor(message, conversationId, currentState, attemptedState) {
    super(message);
    this.name = 'ConversationStateError';
    this.conversationId = conversationId;
    this.currentState = currentState;
    this.attemptedState = attemptedState;
    this.statusCode = 409;
    this.retryable = false;
    this.timestamp = new Date();
  }
}

/**
 * Error Handler Class with advanced error processing
 */
export class ErrorHandler {
  constructor(logger, eventEmitter) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.errorCounts = new Map();
    this.lastErrors = new Map();
  }

  /**
   * Main error handling middleware for Express
   */
  middleware() {
    return (error, req, res, next) => {
      try {
        // Generate correlation ID if not exists
        const correlationId = req.correlationId || this.generateCorrelationId();
        
        // Process and categorize error
        const processedError = this.processError(error, req, correlationId);
        
        // Log error with context
        this.logError(processedError, req, correlationId);
        
        // Track error for monitoring
        this.trackError(processedError);
        
        // Emit error event for system-wide handling
        this.emitErrorEvent(processedError, correlationId);
        
        // Send response to client
        this.sendErrorResponse(res, processedError, correlationId);
        
      } catch (handlerError) {
        // Fallback error handling
        this.logger.error('Error handler itself failed', handlerError, {
          correlationId: req.correlationId,
          originalError: error.message
        });
        
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          correlationId: req.correlationId || 'unknown'
        });
      }
    };
  }

  /**
   * Process and categorize error
   */
  processError(error, req, correlationId) {
    const processedError = {
      ...error,
      correlationId,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };

    // Add specific error context based on error type
    if (error instanceof AIProviderError) {
      processedError.category = 'ai_provider';
      processedError.provider = error.provider;
      processedError.retryable = error.retryable;
    } else if (error instanceof AgentExecutionError) {
      processedError.category = 'agent_execution';
      processedError.agentName = error.agentName;
      processedError.taskId = error.taskId;
    } else if (error instanceof ValidationError) {
      processedError.category = 'validation';
      processedError.field = error.field;
      processedError.value = error.value;
    } else if (error instanceof RateLimitError) {
      processedError.category = 'rate_limit';
      processedError.provider = error.provider;
      processedError.retryAfter = error.retryAfter;
    } else if (error instanceof ConversationStateError) {
      processedError.category = 'conversation_state';
      processedError.conversationId = error.conversationId;
    } else {
      processedError.category = 'unknown';
      processedError.statusCode = error.statusCode || 500;
    }

    return processedError;
  }

  /**
   * Log error with appropriate level and context
   */
  logError(processedError, req, correlationId) {
    const logContext = {
      correlationId,
      errorName: processedError.name,
      errorCategory: processedError.category,
      statusCode: processedError.statusCode,
      url: processedError.url,
      method: processedError.method,
      ip: processedError.ip,
      userAgent: processedError.userAgent,
      stack: processedError.stack
    };

    // Add specific context based on error category
    switch (processedError.category) {
      case 'ai_provider':
        logContext.provider = processedError.provider;
        logContext.retryable = processedError.retryable;
        break;
      case 'agent_execution':
        logContext.agentName = processedError.agentName;
        logContext.taskId = processedError.taskId;
        break;
      case 'validation':
        logContext.field = processedError.field;
        logContext.invalidValue = processedError.value;
        break;
      case 'conversation_state':
        logContext.conversationId = processedError.conversationId;
        logContext.currentState = processedError.currentState;
        logContext.attemptedState = processedError.attemptedState;
        break;
    }

    // Log with appropriate level
    if (processedError.statusCode >= 500) {
      this.logger.error(processedError.message, processedError, logContext);
    } else if (processedError.statusCode >= 400) {
      this.logger.warn(processedError.message, logContext);
    } else {
      this.logger.info(processedError.message, logContext);
    }
  }

  /**
   * Track error for monitoring and alerting
   */
  trackError(processedError) {
    const errorKey = `${processedError.category}_${processedError.name}`;
    
    // Update error count
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);
    
    // Store last occurrence
    this.lastErrors.set(errorKey, {
      timestamp: processedError.timestamp,
      message: processedError.message,
      statusCode: processedError.statusCode
    });

    // Check for error rate spikes
    this.checkErrorRateSpike(errorKey, currentCount + 1);
  }

  /**
   * Check for error rate spikes and emit alerts
   */
  checkErrorRateSpike(errorKey, count) {
    const thresholds = {
      ai_provider: 5,      // 5 AI provider errors
      agent_execution: 3,   // 3 agent execution errors
      validation: 10,       // 10 validation errors
      unknown: 5            // 5 unknown errors
    };

    const category = errorKey.split('_')[0];
    const threshold = thresholds[category] || 5;

    if (count >= threshold) {
      this.logger.warn('Error rate spike detected', {
        errorType: errorKey,
        count,
        threshold,
        timeWindow: '5 minutes'
      });

      // Emit system alert
      this.eventEmitter.emit(EventTypes.SYSTEM_ALERT, {
        type: 'error_rate_spike',
        errorType: errorKey,
        count,
        threshold,
        severity: 'high'
      });
    }
  }

  /**
   * Emit error event for system-wide handling
   */
  emitErrorEvent(processedError, correlationId) {
    this.eventEmitter.emit(EventTypes.SERVICE_ERROR, {
      service: 'cognitive-core',
      error: {
        name: processedError.name,
        message: processedError.message,
        category: processedError.category,
        statusCode: processedError.statusCode,
        retryable: processedError.retryable
      },
      context: {
        correlationId,
        url: processedError.url,
        method: processedError.method,
        timestamp: processedError.timestamp
      }
    });
  }

  /**
   * Send error response to client
   */
  sendErrorResponse(res, processedError, correlationId) {
    const statusCode = processedError.statusCode || 500;
    
    // Base error response
    const errorResponse = {
      error: this.getErrorCode(processedError),
      message: this.getUserFriendlyMessage(processedError),
      correlationId,
      timestamp: processedError.timestamp.toISOString()
    };

    // Add specific fields based on error type
    if (processedError instanceof ValidationError) {
      errorResponse.field = processedError.field;
    }

    if (processedError instanceof RateLimitError && processedError.retryAfter) {
      res.set('Retry-After', processedError.retryAfter);
      errorResponse.retryAfter = processedError.retryAfter;
    }

    if (processedError.retryable) {
      errorResponse.retryable = true;
    }

    // Add debug info in development
    if (process.env.NODE_ENV === 'development' && processedError.stack) {
      errorResponse.stack = processedError.stack;
      errorResponse.originalError = processedError.originalError?.message;
    }

    res.status(statusCode).json(errorResponse);
  }

  /**
   * Get error code for API response
   */
  getErrorCode(error) {
    const errorCodeMap = {
      AIProviderError: 'AI_PROVIDER_ERROR',
      AgentExecutionError: 'AGENT_EXECUTION_ERROR',
      ValidationError: 'VALIDATION_ERROR',
      RateLimitError: 'RATE_LIMIT_EXCEEDED',
      ConversationStateError: 'CONVERSATION_STATE_ERROR',
      MongoError: 'DATABASE_ERROR',
      RedisError: 'CACHE_ERROR'
    };

    return errorCodeMap[error.name] || 'INTERNAL_ERROR';
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(error) {
    const friendlyMessages = {
      AIProviderError: 'AI service is temporarily unavailable. Please try again.',
      AgentExecutionError: 'Failed to process your request. Please try again.',
      ValidationError: error.message, // Validation messages are already user-friendly
      RateLimitError: 'Too many requests. Please wait before trying again.',
      ConversationStateError: 'Invalid conversation state. Please refresh and try again.',
      MongoError: 'Database service is temporarily unavailable.',
      RedisError: 'Cache service is temporarily unavailable.'
    };

    return friendlyMessages[error.name] || 'An unexpected error occurred. Please try again.';
  }

  /**
   * Generate correlation ID for error tracking
   */
  generateCorrelationId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStatistics() {
    const stats = {
      totalErrors: 0,
      errorsByCategory: {},
      errorsByType: {},
      recentErrors: []
    };

    // Calculate totals and categorize
    for (const [errorKey, count] of this.errorCounts.entries()) {
      stats.totalErrors += count;
      
      const [category] = errorKey.split('_');
      stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + count;
      stats.errorsByType[errorKey] = count;
    }

    // Get recent errors (last 10)
    const recentEntries = Array.from(this.lastErrors.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, 10);

    stats.recentErrors = recentEntries.map(([errorKey, errorData]) => ({
      type: errorKey,
      message: errorData.message,
      timestamp: errorData.timestamp,
      statusCode: errorData.statusCode
    }));

    return stats;
  }

  /**
   * Reset error statistics (useful for testing)
   */
  resetStatistics() {
    this.errorCounts.clear();
    this.lastErrors.clear();
    this.logger.info('Error statistics reset');
  }

  /**
   * Create agent-specific error handler
   */
  createAgentErrorHandler(agentName) {
    return (error, taskId) => {
      if (error.name === 'AIProviderError') {
        // Already a structured error, just add agent context
        throw new AgentExecutionError(
          `Agent ${agentName} failed: ${error.message}`,
          agentName,
          taskId,
          error
        );
      } else {
        // Wrap generic error
        throw new AgentExecutionError(
          `Agent ${agentName} execution failed: ${error.message}`,
          agentName,
          taskId,
          error
        );
      }
    };
  }

  /**
   * Handle unhandled promise rejections
   */
  setupGlobalErrorHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled promise rejection', reason, {
        promise: promise.toString(),
        stack: reason?.stack
      });

      // Emit critical system error
      this.eventEmitter.emit(EventTypes.SYSTEM_ALERT, {
        type: 'unhandled_rejection',
        reason: reason?.message || reason,
        severity: 'critical'
      });
    });

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception - shutting down', error, {
        stack: error.stack
      });

      // Emit critical system error
      this.eventEmitter.emit(EventTypes.SYSTEM_ALERT, {
        type: 'uncaught_exception',
        error: error.message,
        severity: 'critical'
      });

      // Graceful shutdown
      process.exit(1);
    });
  }
}

/**
 * Factory function to create error handler instance
 */
export function createErrorHandler(logger, eventEmitter) {
  const errorHandler = new ErrorHandler(logger, eventEmitter);
  
  // Setup global error handlers
  errorHandler.setupGlobalErrorHandlers();
  
  return errorHandler;
}