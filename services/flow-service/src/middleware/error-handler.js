// ==========================================
// SERVICES/FLOW-SERVICE/src/middleware/error-handler.js
// ==========================================

/**
 * Async handler wrapper for express routes
 * Catches errors in async route handlers and passes them to next()
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log error
  if (req.app.locals.logger) {
    req.app.locals.logger.error('Request error', err, {
      correlationId: req.correlationId,
      path: req.originalUrl,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    });
  }

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  } else if (err.name === 'MongoError' && err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  }

  res.status(statusCode).json({
    error: message,
    correlationId: req.correlationId,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    }),
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    correlationId: req.correlationId,
  });
};

export default {
  asyncHandler,
  errorHandler,
  notFoundHandler,
};