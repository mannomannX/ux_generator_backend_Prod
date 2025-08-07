/**
 * Centralized Error Handling Classes
 * Consistent error handling across the knowledge service
 */

import { CONFIG } from '../config/constants.js';

/**
 * Base error class for all knowledge service errors
 */
export class KnowledgeServiceError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Vector-related errors
 */
export class VectorError extends KnowledgeServiceError {
  constructor(message, details = {}) {
    super(message, 'VECTOR_ERROR', 400, details);
  }
}

export class VectorDimensionError extends VectorError {
  constructor(expected, received) {
    super(CONFIG.ERRORS.VECTOR.DIMENSION_MISMATCH, {
      expected,
      received
    });
    this.code = 'VECTOR_DIMENSION_MISMATCH';
  }
}

export class InvalidVectorError extends VectorError {
  constructor(reason) {
    super(CONFIG.ERRORS.VECTOR.INVALID_VALUES, { reason });
    this.code = 'INVALID_VECTOR';
  }
}

/**
 * Embedding-related errors
 */
export class EmbeddingError extends KnowledgeServiceError {
  constructor(message, details = {}) {
    super(message, 'EMBEDDING_ERROR', 500, details);
  }
}

export class EmbeddingGenerationError extends EmbeddingError {
  constructor(provider, reason) {
    super(CONFIG.ERRORS.EMBEDDING.GENERATION_FAILED, {
      provider,
      reason
    });
    this.code = 'EMBEDDING_GENERATION_FAILED';
  }
}

export class EmbeddingProviderError extends EmbeddingError {
  constructor(provider, reason) {
    super(CONFIG.ERRORS.EMBEDDING.PROVIDER_UNAVAILABLE, {
      provider,
      reason
    });
    this.code = 'EMBEDDING_PROVIDER_UNAVAILABLE';
  }
}

export class EmbeddingRateLimitError extends EmbeddingError {
  constructor(provider, retryAfter) {
    super(CONFIG.ERRORS.EMBEDDING.RATE_LIMIT_EXCEEDED, {
      provider,
      retryAfter
    });
    this.code = 'EMBEDDING_RATE_LIMIT';
    this.statusCode = 429;
  }
}

/**
 * Search-related errors
 */
export class SearchError extends KnowledgeServiceError {
  constructor(message, details = {}) {
    super(message, 'SEARCH_ERROR', 400, details);
  }
}

export class SearchQueryError extends SearchError {
  constructor(queryLength, maxLength) {
    super(CONFIG.ERRORS.SEARCH.QUERY_TOO_LONG, {
      queryLength,
      maxLength
    });
    this.code = 'SEARCH_QUERY_TOO_LONG';
  }
}

export class SearchTimeoutError extends SearchError {
  constructor(timeout) {
    super(CONFIG.ERRORS.SEARCH.TIMEOUT, { timeout });
    this.code = 'SEARCH_TIMEOUT';
    this.statusCode = 504;
  }
}

export class NoResultsError extends SearchError {
  constructor(query) {
    super(CONFIG.ERRORS.SEARCH.NO_RESULTS, { query });
    this.code = 'NO_SEARCH_RESULTS';
    this.statusCode = 404;
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends KnowledgeServiceError {
  constructor(message, details = {}) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(database, reason) {
    super(CONFIG.ERRORS.DATABASE.CONNECTION_FAILED, {
      database,
      reason
    });
    this.code = 'DATABASE_CONNECTION_FAILED';
  }
}

export class DatabaseOperationError extends DatabaseError {
  constructor(operation, reason) {
    super(CONFIG.ERRORS.DATABASE.OPERATION_FAILED, {
      operation,
      reason
    });
    this.code = 'DATABASE_OPERATION_FAILED';
  }
}

export class DatabaseTransactionError extends DatabaseError {
  constructor(reason) {
    super(CONFIG.ERRORS.DATABASE.TRANSACTION_FAILED, { reason });
    this.code = 'DATABASE_TRANSACTION_FAILED';
  }
}

/**
 * Validation errors
 */
export class ValidationError extends KnowledgeServiceError {
  constructor(field, value, constraint) {
    super(`Validation failed for field: ${field}`, 'VALIDATION_ERROR', 400, {
      field,
      value,
      constraint
    });
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends KnowledgeServiceError {
  constructor(message, details = {}) {
    super(message, 'AUTH_ERROR', 401, details);
  }
}

export class UnauthorizedError extends AuthError {
  constructor(resource) {
    super('Unauthorized access to resource', { resource });
    this.code = 'UNAUTHORIZED';
  }
}

export class ForbiddenError extends AuthError {
  constructor(resource, permission) {
    super('Insufficient permissions', { resource, permission });
    this.code = 'FORBIDDEN';
    this.statusCode = 403;
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends KnowledgeServiceError {
  constructor(limit, window, retryAfter) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429, {
      limit,
      window,
      retryAfter
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends KnowledgeServiceError {
  constructor(setting, reason) {
    super(`Configuration error for ${setting}`, 'CONFIGURATION_ERROR', 500, {
      setting,
      reason
    });
  }
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Handle and log error consistently
   */
  handle(error, context = {}) {
    // Enhance error with context
    if (error instanceof KnowledgeServiceError) {
      error.details = { ...error.details, ...context };
    }

    // Log error with appropriate level
    if (error.statusCode >= 500) {
      this.logger.error(error.message, {
        error: error.toJSON ? error.toJSON() : error,
        context,
        stack: error.stack
      });
    } else if (error.statusCode >= 400) {
      this.logger.warn(error.message, {
        error: error.toJSON ? error.toJSON() : error,
        context
      });
    } else {
      this.logger.info(error.message, {
        error: error.toJSON ? error.toJSON() : error,
        context
      });
    }

    return error;
  }

  /**
   * Convert unknown errors to KnowledgeServiceError
   */
  normalize(error, defaultMessage = 'An unexpected error occurred') {
    if (error instanceof KnowledgeServiceError) {
      return error;
    }

    if (error instanceof Error) {
      return new KnowledgeServiceError(
        error.message || defaultMessage,
        'INTERNAL_ERROR',
        500,
        { originalError: error.name }
      );
    }

    return new KnowledgeServiceError(
      defaultMessage,
      'UNKNOWN_ERROR',
      500,
      { error: String(error) }
    );
  }

  /**
   * Express middleware error handler
   */
  middleware() {
    return (error, req, res, next) => {
      const normalizedError = this.normalize(error);
      this.handle(normalizedError, {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: req.user?.id
      });

      res.status(normalizedError.statusCode).json({
        error: {
          message: normalizedError.message,
          code: normalizedError.code,
          details: process.env.NODE_ENV === 'production' 
            ? undefined 
            : normalizedError.details
        }
      });
    };
  }
}

/**
 * Async error wrapper for Express routes
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error factory for common scenarios
 */
export const ErrorFactory = {
  vectorDimension: (expected, received) => new VectorDimensionError(expected, received),
  invalidVector: (reason) => new InvalidVectorError(reason),
  embeddingGeneration: (provider, reason) => new EmbeddingGenerationError(provider, reason),
  embeddingProvider: (provider, reason) => new EmbeddingProviderError(provider, reason),
  embeddingRateLimit: (provider, retryAfter) => new EmbeddingRateLimitError(provider, retryAfter),
  searchQuery: (queryLength, maxLength) => new SearchQueryError(queryLength, maxLength),
  searchTimeout: (timeout) => new SearchTimeoutError(timeout),
  noResults: (query) => new NoResultsError(query),
  databaseConnection: (database, reason) => new DatabaseConnectionError(database, reason),
  databaseOperation: (operation, reason) => new DatabaseOperationError(operation, reason),
  databaseTransaction: (reason) => new DatabaseTransactionError(reason),
  validation: (field, value, constraint) => new ValidationError(field, value, constraint),
  unauthorized: (resource) => new UnauthorizedError(resource),
  forbidden: (resource, permission) => new ForbiddenError(resource, permission),
  rateLimit: (limit, window, retryAfter) => new RateLimitError(limit, window, retryAfter),
  configuration: (setting, reason) => new ConfigurationError(setting, reason)
};

export default {
  KnowledgeServiceError,
  VectorError,
  VectorDimensionError,
  InvalidVectorError,
  EmbeddingError,
  EmbeddingGenerationError,
  EmbeddingProviderError,
  EmbeddingRateLimitError,
  SearchError,
  SearchQueryError,
  SearchTimeoutError,
  NoResultsError,
  DatabaseError,
  DatabaseConnectionError,
  DatabaseOperationError,
  DatabaseTransactionError,
  ValidationError,
  AuthError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  ConfigurationError,
  ErrorHandler,
  ErrorFactory,
  asyncHandler
};