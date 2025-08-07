// ==========================================
// KNOWLEDGE SERVICE - Error Handler Middleware
// ==========================================

// Custom error classes
export class KnowledgeError extends Error {
  constructor(message, statusCode = 500, code = 'KNOWLEDGE_ERROR') {
    super(message);
    this.name = 'KnowledgeError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class EmbeddingError extends KnowledgeError {
  constructor(message, details = {}) {
    super(message, 500, 'EMBEDDING_ERROR');
    this.name = 'EmbeddingError';
    this.details = details;
  }
}

export class SearchError extends KnowledgeError {
  constructor(message, details = {}) {
    super(message, 400, 'SEARCH_ERROR');
    this.name = 'SearchError';
    this.details = details;
  }
}

export class RAGError extends KnowledgeError {
  constructor(message, details = {}) {
    super(message, 500, 'RAG_ERROR');
    this.name = 'RAGError';
    this.details = details;
  }
}

export class VectorDBError extends KnowledgeError {
  constructor(message, details = {}) {
    super(message, 503, 'VECTOR_DB_ERROR');
    this.name = 'VectorDBError';
    this.details = details;
  }
}

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  // Log the error
  req.logger?.error('Knowledge service error', {
    error: err.message,
    stack: err.stack,
    type: err.constructor.name,
    correlationId: req.correlationId,
    userId: req.user?.id,
    path: req.path,
    method: req.method
  });

  // Handle custom knowledge errors
  if (err instanceof KnowledgeError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
      correlationId: req.correlationId
    });
  }

  // Handle ChromaDB errors
  if (err.name === 'ChromaError' || err.message?.includes('Chroma')) {
    return res.status(503).json({
      error: 'VECTOR_DATABASE_ERROR',
      message: 'Vector database operation failed',
      correlationId: req.correlationId
    });
  }

  // Handle MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'DUPLICATE_ERROR',
        message: 'Knowledge already exists',
        correlationId: req.correlationId
      });
    }
    
    return res.status(503).json({
      error: 'DATABASE_ERROR',
      message: 'Database operation failed',
      correlationId: req.correlationId
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: err.details || err.message,
      correlationId: req.correlationId
    });
  }

  // Handle embedding API errors
  if (err.message?.includes('embedding') || err.message?.includes('OpenAI') || err.message?.includes('Gemini')) {
    return res.status(503).json({
      error: 'EMBEDDING_SERVICE_ERROR',
      message: 'Embedding generation failed',
      correlationId: req.correlationId
    });
  }

  // Handle rate limit errors
  if (err.statusCode === 429) {
    return res.status(429).json({
      error: 'RATE_LIMIT_ERROR',
      message: 'Too many requests. Please try again later.',
      retryAfter: err.retryAfter,
      correlationId: req.correlationId
    });
  }

  // Handle authentication errors
  if (err.statusCode === 401 || err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication required',
      correlationId: req.correlationId
    });
  }

  // Handle authorization errors
  if (err.statusCode === 403 || err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'AUTHORIZATION_ERROR',
      message: 'Access denied',
      correlationId: req.correlationId
    });
  }

  // Handle timeout errors
  if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
    return res.status(504).json({
      error: 'TIMEOUT_ERROR',
      message: 'Operation timed out',
      correlationId: req.correlationId
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'An error occurred processing your request'
    : err.message;

  res.status(statusCode).json({
    error: 'INTERNAL_ERROR',
    message,
    correlationId: req.correlationId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Async error wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Endpoint not found',
    path: req.originalUrl,
    correlationId: req.correlationId
  });
};

// Handle vector database connection errors
export const handleVectorDBError = (error, req, res, next) => {
  if (error.code === 'ECONNREFUSED' && error.message?.includes('chroma')) {
    return res.status(503).json({
      error: 'VECTOR_DB_UNAVAILABLE',
      message: 'Vector database is currently unavailable',
      correlationId: req.correlationId
    });
  }
  next(error);
};

// Handle knowledge quality errors
export const handleQualityError = (error, req, res, next) => {
  if (error.type === 'quality') {
    return res.status(400).json({
      error: 'QUALITY_ERROR',
      message: error.message,
      suggestions: error.suggestions,
      correlationId: req.correlationId
    });
  }
  next(error);
};

export default {
  KnowledgeError,
  EmbeddingError,
  SearchError,
  RAGError,
  VectorDBError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  handleVectorDBError,
  handleQualityError
};