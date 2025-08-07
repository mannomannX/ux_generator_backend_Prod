// ==========================================
// BILLING SERVICE - Validation Middleware
// ==========================================

import Joi from 'joi';

// Validation schemas
const schemas = {
  createCheckoutSession: Joi.object({
    planId: Joi.string().valid('free', 'starter', 'professional', 'enterprise').required(),
    successUrl: Joi.string().uri().required(),
    cancelUrl: Joi.string().uri().required(),
    quantity: Joi.number().integer().min(1).max(100).default(1),
    customerId: Joi.string().optional(),
    metadata: Joi.object().optional()
  }),

  purchaseCredits: Joi.object({
    amount: Joi.number().valid(10, 25, 50, 100, 250, 500).required(),
    successUrl: Joi.string().uri().required(),
    cancelUrl: Joi.string().uri().required()
  }),

  createPortalSession: Joi.object({
    returnUrl: Joi.string().uri().required()
  }),

  addPaymentMethod: Joi.object({
    paymentMethodId: Joi.string().required()
  }),

  updatePaymentMethod: Joi.object({
    paymentMethodId: Joi.string().required(),
    setAsDefault: Joi.boolean().optional()
  }),

  cancelSubscription: Joi.object({
    reason: Joi.string().max(500).optional(),
    feedback: Joi.string().max(1000).optional(),
    immediately: Joi.boolean().default(false)
  }),

  updateSubscription: Joi.object({
    planId: Joi.string().valid('free', 'starter', 'professional', 'enterprise').required(),
    quantity: Joi.number().integer().min(1).max(100).optional()
  }),

  processRefund: Joi.object({
    chargeId: Joi.string().required(),
    amount: Joi.number().positive().optional(),
    reason: Joi.string().valid('duplicate', 'fraudulent', 'requested_by_customer').optional()
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    type: Joi.string().optional(),
    status: Joi.string().optional()
  }),

  webhookMetadata: Joi.object({
    workspaceId: Joi.string().required(),
    userId: Joi.string().required(),
    environment: Joi.string().valid('development', 'staging', 'production').required()
  })
};

// Validation middleware factory
export const validateRequest = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Invalid validation schema'
      });
    }

    // Determine what to validate
    const toValidate = req.method === 'GET' ? req.query : req.body;
    
    const { error, value } = schema.validate(toValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        errors,
        correlationId: req.correlationId
      });
    }

    // Replace with validated values
    if (req.method === 'GET') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Validate Stripe webhook payload
export const validateWebhookPayload = (req, res, next) => {
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({
      error: 'Invalid webhook payload',
      message: 'Webhook payload must be a raw string'
    });
  }

  if (!req.headers['stripe-signature']) {
    return res.status(401).json({
      error: 'Missing signature',
      message: 'Stripe signature header is required'
    });
  }

  next();
};

// Validate workspace access
export const validateWorkspaceAccess = async (req, res, next) => {
  try {
    const workspaceId = req.user?.workspaceId || req.params.workspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({
        error: 'Workspace ID required',
        correlationId: req.correlationId
      });
    }

    // Check if user has access to this workspace
    const hasAccess = await req.billingManager.checkWorkspaceAccess(
      req.user.id,
      workspaceId
    );

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this workspace',
        correlationId: req.correlationId
      });
    }

    req.workspaceId = workspaceId;
    next();
  } catch (error) {
    req.logger.error('Workspace validation error', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate subscription status
export const requireActiveSubscription = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    
    const subscription = await req.subscriptionManager.getSubscriptionDetails(workspaceId);
    
    if (!subscription || subscription.status !== 'active') {
      return res.status(402).json({
        error: 'Payment required',
        message: 'Active subscription required for this action',
        correlationId: req.correlationId
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    req.logger.error('Subscription validation error', error);
    res.status(500).json({
      error: 'Internal server error',
      correlationId: req.correlationId
    });
  }
};

// Validate credit balance
export const requireCredits = (minimumCredits = 1) => {
  return async (req, res, next) => {
    try {
      const workspaceId = req.workspaceId || req.user?.workspaceId;
      
      const balance = await req.creditManager.getBalance(workspaceId);
      
      if (balance.total < minimumCredits) {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: `This action requires at least ${minimumCredits} credits`,
          currentBalance: balance.total,
          required: minimumCredits,
          correlationId: req.correlationId
        });
      }

      req.creditBalance = balance;
      next();
    } catch (error) {
      req.logger.error('Credit validation error', error);
      res.status(500).json({
        error: 'Internal server error',
        correlationId: req.correlationId
      });
    }
  };
};

// Sanitize billing data
export const sanitizeBillingData = (req, res, next) => {
  // Remove sensitive fields from responses
  const originalJson = res.json;
  
  res.json = function(data) {
    if (data && typeof data === 'object') {
      // Remove sensitive Stripe fields
      const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
        const sensitiveFields = [
          'client_secret',
          'payment_intent_client_secret',
          'ephemeral_key',
          'api_key',
          'webhook_secret',
          'signing_secret'
        ];
        
        if (sensitiveFields.includes(key)) {
          return undefined;
        }
        
        // Mask card numbers except last 4 digits
        if (key === 'card_number' && typeof value === 'string') {
          return `****${value.slice(-4)}`;
        }
        
        return value;
      }));
      
      return originalJson.call(this, sanitized);
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

export default {
  validateRequest,
  validateWebhookPayload,
  validateWorkspaceAccess,
  requireActiveSubscription,
  requireCredits,
  sanitizeBillingData
};