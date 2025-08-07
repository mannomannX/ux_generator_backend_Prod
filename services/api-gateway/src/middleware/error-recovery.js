// ==========================================
// SERVICES/API-GATEWAY/src/middleware/error-recovery.js
// ==========================================

/**
 * Enhanced error handling and recovery system
 */
export class ErrorRecoverySystem {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.errorCounts = new Map();
    this.circuitBreakers = new Map();
    this.setupGlobalErrorHandlers();
  }

  setupGlobalErrorHandlers() {
    // Handle uncaught promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: reason.toString(),
        stack: reason.stack,
        promise: promise.toString(),
        timestamp: new Date().toISOString(),
        processId: process.pid
      });

      // Increment error count for monitoring
      this.incrementErrorCount('unhandled_rejection');

      // In production, we might want to restart the process after logging
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('Unhandled rejection in production - considering graceful shutdown');
        
        // Give time for logging and cleanup
        setTimeout(() => {
          process.exit(1);
        }, 5000);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', {
        error: error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString(),
        processId: process.pid
      });

      this.incrementErrorCount('uncaught_exception');

      // Uncaught exceptions are more serious - exit immediately after logging
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // Handle warning events
    process.on('warning', (warning) => {
      this.logger.warn('Process Warning', {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Handle SIGTERM gracefully
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, starting graceful shutdown');
      this.gracefulShutdown();
    });

    // Handle SIGINT gracefully (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, starting graceful shutdown');
      this.gracefulShutdown();
    });
  }

  /**
   * Wrap async functions with error handling
   */
  wrapAsyncFunction(fn, context = 'unknown') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.logger.error(`Async function error in ${context}`, {
          error: error.message,
          stack: error.stack,
          context,
          arguments: this.sanitizeArgs(args),
          timestamp: new Date().toISOString()
        });

        this.incrementErrorCount(context);
        throw error; // Re-throw to maintain expected behavior
      }
    };
  }

  /**
   * Enhanced asyncHandler with retry logic
   */
  asyncHandler(fn, options = {}) {
    const { 
      maxRetries = 0, 
      retryDelay = 1000, 
      context = 'request_handler',
      circuitBreaker = false 
    } = options;

    return async (req, res, next) => {
      const startTime = Date.now();
      let attempt = 0;

      const executeWithRetry = async () => {
        try {
          attempt++;
          
          // Check circuit breaker if enabled
          if (circuitBreaker && this.isCircuitOpen(context)) {
            throw new Error(`Circuit breaker is open for ${context}`);
          }

          const result = await fn(req, res, next);
          
          // Record success for circuit breaker
          if (circuitBreaker) {
            this.recordSuccess(context);
          }

          // Log successful requests in development
          if (process.env.NODE_ENV === 'development') {
            const duration = Date.now() - startTime;
            this.logger.debug(`Request completed`, {
              method: req.method,
              path: req.path,
              duration,
              attempt,
              correlationId: req.correlationId
            });
          }

          return result;
        } catch (error) {
          // Record failure for circuit breaker
          if (circuitBreaker) {
            this.recordFailure(context);
          }

          const duration = Date.now() - startTime;
          
          // Log the error with context
          this.logger.error(`Request handler error`, {
            error: error.message,
            stack: error.stack,
            method: req.method,
            path: req.path,
            duration,
            attempt,
            maxRetries,
            correlationId: req.correlationId,
            userId: req.user?.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });

          // Retry logic for certain errors
          if (attempt <= maxRetries && this.shouldRetry(error)) {
            this.logger.warn(`Retrying request (attempt ${attempt}/${maxRetries + 1})`, {
              correlationId: req.correlationId,
              error: error.message
            });

            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
            return executeWithRetry();
          }

          // Increment error count
          this.incrementErrorCount(context);

          // Pass to error handler middleware
          next(error);
        }
      };

      await executeWithRetry();
    };
  }

  /**
   * Database operation wrapper with connection recovery
   */
  wrapDatabaseOperation(operation, context = 'database_operation') {
    return async (...args) => {
      try {
        return await operation(...args);
      } catch (error) {
        this.logger.error(`Database operation failed: ${context}`, {
          error: error.message,
          stack: error.stack,
          context,
          timestamp: new Date().toISOString()
        });

        // Handle specific MongoDB errors
        if (error.name === 'MongoTimeoutError' || error.name === 'MongoNetworkError') {
          this.logger.warn('Database connection issue detected, implementing retry');
          
          // Wait a bit and retry once
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            return await operation(...args);
          } catch (retryError) {
            this.logger.error('Database retry failed', {
              originalError: error.message,
              retryError: retryError.message,
              context
            });
            throw retryError;
          }
        }

        throw error;
      }
    };
  }

  /**
   * Service call wrapper with timeout and retry
   */
  wrapServiceCall(serviceCall, serviceName, options = {}) {
    const { timeout = 30000, maxRetries = 2 } = options;

    return async (...args) => {
      let attempt = 0;
      
      while (attempt <= maxRetries) {
        attempt++;
        
        try {
          // Add timeout to service call
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Service call timeout: ${serviceName}`)), timeout);
          });

          const result = await Promise.race([
            serviceCall(...args),
            timeoutPromise
          ]);

          // Log successful service call
          this.logger.debug(`Service call successful: ${serviceName}`, {
            attempt,
            serviceName
          });

          return result;
        } catch (error) {
          this.logger.warn(`Service call failed: ${serviceName} (attempt ${attempt}/${maxRetries + 1})`, {
            error: error.message,
            serviceName,
            attempt
          });

          // Don't retry on authentication or client errors
          if (error.message.includes('authentication') || 
              error.message.includes('authorization') ||
              error.message.includes('400') ||
              error.message.includes('401') ||
              error.message.includes('403')) {
            throw error;
          }

          if (attempt > maxRetries) {
            this.incrementErrorCount(`service_call_${serviceName}`);
            throw error;
          }

          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    };
  }

  /**
   * Check if error should be retried
   */
  shouldRetry(error) {
    // Don't retry client errors
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return false;
    }

    // Don't retry validation errors
    if (error.name === 'ValidationError') {
      return false;
    }

    // Retry server errors and network issues
    return error.statusCode >= 500 || 
           error.code === 'ECONNREFUSED' || 
           error.code === 'ETIMEDOUT' ||
           error.name === 'MongoTimeoutError';
  }

  /**
   * Circuit breaker implementation
   */
  isCircuitOpen(context) {
    const breaker = this.circuitBreakers.get(context);
    if (!breaker) return false;

    const now = Date.now();
    
    // If in open state, check if we should try again
    if (breaker.state === 'open') {
      if (now - breaker.lastFailTime > breaker.timeout) {
        breaker.state = 'half-open';
        this.logger.info(`Circuit breaker half-open: ${context}`);
        return false;
      }
      return true;
    }

    return false;
  }

  recordSuccess(context) {
    const breaker = this.circuitBreakers.get(context) || {
      failureCount: 0,
      successCount: 0,
      state: 'closed',
      threshold: 5,
      timeout: 60000
    };

    breaker.successCount++;
    breaker.failureCount = 0;
    
    if (breaker.state === 'half-open' && breaker.successCount >= 2) {
      breaker.state = 'closed';
      this.logger.info(`Circuit breaker closed: ${context}`);
    }

    this.circuitBreakers.set(context, breaker);
  }

  recordFailure(context) {
    const breaker = this.circuitBreakers.get(context) || {
      failureCount: 0,
      successCount: 0,
      state: 'closed',
      threshold: 5,
      timeout: 60000
    };

    breaker.failureCount++;
    breaker.lastFailTime = Date.now();
    
    if (breaker.failureCount >= breaker.threshold) {
      breaker.state = 'open';
      this.logger.warn(`Circuit breaker opened: ${context}`);
    }

    this.circuitBreakers.set(context, breaker);
  }

  incrementErrorCount(type) {
    const count = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, count + 1);

    // Alert if error count is high
    if (count > 10) {
      this.logger.error(`High error count detected`, {
        errorType: type,
        count: count + 1,
        timestamp: new Date().toISOString()
      });
    }
  }

  sanitizeArgs(args) {
    // Remove sensitive data from logged arguments
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        const sanitized = { ...arg };
        ['password', 'token', 'apiKey', 'secret'].forEach(key => {
          if (sanitized[key]) {
            sanitized[key] = '[REDACTED]';
          }
        });
        return sanitized;
      }
      return arg;
    });
  }

  async gracefulShutdown() {
    this.logger.info('Starting graceful shutdown');
    
    // Stop accepting new connections
    // Close database connections
    // Clean up resources
    
    setTimeout(() => {
      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    }, 10000);
  }

  /**
   * Get error statistics for monitoring
   */
  getErrorStats() {
    return {
      errorCounts: Object.fromEntries(this.errorCounts),
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([key, value]) => [
          key,
          {
            state: value.state,
            failureCount: value.failureCount,
            successCount: value.successCount
          }
        ])
      ),
      timestamp: new Date().toISOString()
    };
  }
}