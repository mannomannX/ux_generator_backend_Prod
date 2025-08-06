// ==========================================
// SERVICES/API-GATEWAY/src/middleware/error-handler.js
// ==========================================

class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes operational vs programming errors
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Pre-defined error types
export class ValidationError extends ApiError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends ApiError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends ApiError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(service = 'Service') {
    super(`${service} temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

// Main error handler middleware
export const errorHandler = (logger) => {
  return (error, req, res, next) => {
    // Log the error
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method,
      correlationId: req.correlationId,
      userId: req.user?.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    };

    if (error.isOperational) {
      logger.warn('Operational error occurred', errorInfo);
    } else {
      logger.error('Unexpected error occurred', error, errorInfo);
    }

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    let statusCode = error.statusCode || 500;
    let code = error.code || 'INTERNAL_ERROR';
    let message = error.message || 'Internal server error';
    let details = error.details || null;

    // Handle specific error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = error.errors || error.details;
    } else if (error.name === 'CastError') {
      statusCode = 400;
      code = 'INVALID_ID';
      message = 'Invalid ID format';
    } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      statusCode = 500;
      code = 'DATABASE_ERROR';
      message = isDevelopment ? error.message : 'Database operation failed';
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      code = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      code = 'TOKEN_EXPIRED';
      message = 'Authentication token has expired';
    } else if (error.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      code = 'FILE_TOO_LARGE';
      message = 'File size exceeds limit';
    } else if (error.type === 'entity.parse.failed') {
      statusCode = 400;
      code = 'INVALID_JSON';
      message = 'Invalid JSON format';
    }

    // Build error response
    const errorResponse = {
      error: {
        code,
        message,
        ...(details && { details }),
        correlationId: req.correlationId,
        timestamp: new Date().toISOString(),
      },
    };

    // Add stack trace in development
    if (isDevelopment && !error.isOperational) {
      errorResponse.error.stack = error.stack;
    }

    // Add request info in development
    if (isDevelopment) {
      errorResponse.error.request = {
        method: req.method,
        url: req.originalUrl,
        params: req.params,
        query: req.query,
        // Don't include body as it might contain sensitive data
      };
    }

    res.status(statusCode).json(errorResponse);
  };
};

// Async error wrapper for route handlers
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation helper
export const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false, // Report all validation errors
      stripUnknown: true, // Remove unknown properties
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw new ValidationError('Request validation failed', details);
    }

    next();
  };
};

// Not found handler (should be used as the last route handler)
export const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.method} ${req.originalUrl}`);
  next(error);
};

// Graceful shutdown error handler
export const shutdownHandler = (logger) => {
  return (error) => {
    logger.error('Unhandled error during shutdown', error);
    process.exit(1);
  };
};

// Export the base ApiError class for use in other modules
export { ApiError };