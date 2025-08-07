/**
 * Secure Error Handler Middleware
 * Prevents stack trace exposure in production
 */

import { Logger } from '@ux-flow/common';

const logger = new Logger('error-handler');

export class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * Async handler wrapper to catch errors in async routes
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Default to 500 if no status code
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // Log error
  if (req.app.locals.logger) {
    req.app.locals.logger.error('Request error', {
      error: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        stack: err.stack // Only log stack trace, don't send to client
      },
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent')
      },
      user: req.user?.userId,
      correlationId: req.correlationId
    });
  }

  // Prepare error response
  const response = {
    error: {
      code: err.code,
      message: err.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  };

  // In development, add more details (but never in production!)
  if (process.env.NODE_ENV === 'development') {
    response.error.details = {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method
    };
    
    // Only include stack trace in development
    if (!err.isOperational) {
      response.error.stack = err.stack;
    }
  } else {
    // Production: Sanitize error messages
    if (!err.isOperational) {
      // Generic message for unexpected errors
      response.error.message = 'An error occurred processing your request';
    }
    
    // Remove sensitive information
    if (err.message.includes('password') || 
        err.message.includes('token') || 
        err.message.includes('secret')) {
      response.error.message = 'Authentication error';
    }
  }

  // Send error response
  res.status(err.statusCode).json(response);
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Validation error formatter for express-validator
 */
export const validationErrorFormatter = (errors) => {
  const formattedErrors = errors.array().map(error => ({
    field: error.param,
    message: error.msg,
    value: process.env.NODE_ENV === 'development' ? error.value : undefined
  }));

  return new ValidationError(`Validation failed: ${formattedErrors.map(e => e.message).join(', ')}`);
};

/**
 * MongoDB error handler
 */
export const handleMongoError = (error) => {
  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyPattern)[0];
    return new ConflictError(`A record with this ${field} already exists`);
  }
  
  if (error.name === 'CastError') {
    return new ValidationError('Invalid ID format');
  }
  
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(e => e.message);
    return new ValidationError(messages.join(', '));
  }
  
  return new InternalError();
};

/**
 * Centralized error logger
 */
export class ErrorLogger {
  constructor(logger, elkService) {
    this.logger = logger;
    this.elkService = elkService;
  }

  logError(error, context = {}) {
    const errorData = {
      message: error.message,
      code: error.code || 'UNKNOWN',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Log to console/file
    this.logger.error('Application error', errorData);

    // Log to ELK if available
    if (this.elkService) {
      this.elkService.logEvent('error', error.message, errorData).catch(err => {
        this.logger.error('Failed to log to ELK', err);
      });
    }

    // In production, send critical errors to monitoring service
    if (process.env.NODE_ENV === 'production' && !error.isOperational) {
      this.sendToMonitoring(errorData);
    }
  }

  sendToMonitoring(errorData) {
    // Implement integration with monitoring service (Sentry, Datadog, etc.)
    // This is a placeholder
    logger.error('Critical error detected', { errorCode: errorData.code, statusCode: errorData.statusCode });
  }
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  validationErrorFormatter,
  handleMongoError,
  ErrorLogger
};