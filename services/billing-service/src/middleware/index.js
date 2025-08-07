// ==========================================
// BILLING SERVICE - Middleware Index
// ==========================================

export {
  validateRequest,
  validateWebhookPayload,
  validateWorkspaceAccess,
  requireActiveSubscription,
  requireCredits,
  sanitizeBillingData
} from './validation.js';

export {
  BillingError,
  PaymentError,
  SubscriptionError,
  WebhookError,
  StripeError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  webhookErrorHandler
} from './error-handler.js';

export {
  trackBillingMetrics,
  recordPaymentAttempt,
  recordSubscriptionChange,
  recordCreditUsage,
  metricsMiddleware
} from './metrics.js';

export {
  auditBillingAction,
  auditPaymentEvent,
  auditSubscriptionEvent,
  auditCreditTransaction
} from './audit.js';

export {
  rateLimitByPlan,
  rateLimitWebhooks,
  rateLimitAPI
} from './rate-limiting.js';