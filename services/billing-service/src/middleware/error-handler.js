// ==========================================
// BILLING SERVICE - Error Handler Middleware
// ==========================================

// Custom billing error classes
export class BillingError extends Error {
  constructor(message, statusCode = 500, code = 'BILLING_ERROR') {
    super(message);
    this.name = 'BillingError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class PaymentError extends BillingError {
  constructor(message, details = {}) {
    super(message, 402, 'PAYMENT_ERROR');
    this.name = 'PaymentError';
    this.details = details;
  }
}

export class SubscriptionError extends BillingError {
  constructor(message, details = {}) {
    super(message, 400, 'SUBSCRIPTION_ERROR');
    this.name = 'SubscriptionError';
    this.details = details;
  }
}

export class WebhookError extends BillingError {
  constructor(message, details = {}) {
    super(message, 400, 'WEBHOOK_ERROR');
    this.name = 'WebhookError';
    this.details = details;
  }
}

export class StripeError extends BillingError {
  constructor(stripeError) {
    const message = stripeError.message || 'Stripe API error';
    const statusCode = mapStripeErrorToStatus(stripeError.type);
    super(message, statusCode, 'STRIPE_ERROR');
    this.name = 'StripeError';
    this.stripeType = stripeError.type;
    this.stripeCode = stripeError.code;
    this.declineCode = stripeError.decline_code;
  }
}

// Map Stripe error types to HTTP status codes
function mapStripeErrorToStatus(stripeErrorType) {
  const errorMap = {
    'StripeCardError': 402,
    'StripeRateLimitError': 429,
    'StripeInvalidRequestError': 400,
    'StripeAPIError': 500,
    'StripeConnectionError': 503,
    'StripeAuthenticationError': 401,
    'StripePermissionError': 403,
    'StripeIdempotencyError': 409,
    'StripeInvalidGrantError': 400
  };
  
  return errorMap[stripeErrorType] || 500;
}

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  // Log the error
  req.logger?.error('Billing service error', {
    error: err.message,
    stack: err.stack,
    type: err.constructor.name,
    correlationId: req.correlationId,
    userId: req.user?.id,
    workspaceId: req.workspaceId || req.user?.workspaceId,
    path: req.path,
    method: req.method
  });

  // Handle Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    const stripeError = new StripeError(err);
    return res.status(stripeError.statusCode).json({
      error: stripeError.code,
      message: stripeError.message,
      stripeType: stripeError.stripeType,
      stripeCode: stripeError.stripeCode,
      declineCode: stripeError.declineCode,
      correlationId: req.correlationId
    });
  }

  // Handle custom billing errors
  if (err instanceof BillingError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
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

  // Handle MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'DUPLICATE_ERROR',
        message: 'Resource already exists',
        correlationId: req.correlationId
      });
    }
    
    return res.status(503).json({
      error: 'DATABASE_ERROR',
      message: 'Database operation failed',
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

// Webhook error handler (special handling for Stripe webhooks)
export const webhookErrorHandler = (err, req, res, next) => {
  // Log webhook errors with additional context
  req.logger?.error('Webhook processing error', {
    error: err.message,
    stack: err.stack,
    signature: req.headers['stripe-signature'],
    eventType: req.body?.type,
    eventId: req.body?.id,
    correlationId: req.correlationId
  });

  // Stripe expects specific status codes for webhook responses
  if (err instanceof WebhookError) {
    // Return 400 for webhook errors to trigger retry
    return res.status(400).json({
      error: 'WEBHOOK_ERROR',
      message: err.message,
      received: false
    });
  }

  // Return 200 even on error to prevent infinite retries
  // Log the error for manual investigation
  res.status(200).json({
    received: true,
    processed: false,
    error: err.message
  });
};

export default {
  BillingError,
  PaymentError,
  SubscriptionError,
  WebhookError,
  StripeError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  webhookErrorHandler
};