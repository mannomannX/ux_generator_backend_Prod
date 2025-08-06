// ==========================================
// SERVICES/USER-MANAGEMENT/src/middleware/error-handler.js
// ==========================================

/**
 * Custom Error Classes for User Management Service
 */

export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = 403;
  }
}

export class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.status = 404;
    this.resource = resource;
  }
}

export class ConflictError extends Error {
  constructor(message, resource = null) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
    this.resource = resource;
  }
}

export class RateLimitError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

/**
 * Async Route Handler Wrapper
 * Catches async errors and passes them to error middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global Error Handler Middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  req.logger?.error('Request error occurred', err, {
    correlationId: req.correlationId,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.userId,
    ip: req.ip,
  });

  // Validation Error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Authorization Error
  if (err.name === 'AuthorizationError') {
    return res.status(403).json({
      error: {
        code: 'AUTHORIZATION_ERROR',
        message: err.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Not Found Error
  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: err.message,
        resource: err.resource,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Conflict Error
  if (err.name === 'ConflictError') {
    return res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: err.message,
        resource: err.resource,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Rate Limit Error
  if (err.name === 'RateLimitError') {
    return res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: err.message,
        retryAfter: err.retryAfter,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // MongoDB Errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    // Don't expose database errors to client
    return res.status(500).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Internal database error occurred',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Duplicate Key Error (MongoDB)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: `${field} already exists`,
        field,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // Default Internal Server Error
  res.status(err.status || 500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'An internal server error occurred',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Handler for undefined routes
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
      method: req.method,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    },
  });
};