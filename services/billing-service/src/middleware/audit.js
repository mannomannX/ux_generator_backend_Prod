// ==========================================
// BILLING SERVICE - Audit Middleware
// ==========================================

import { AuditLogger } from '@ux-flow/common';

// Audit billing actions
export const auditBillingAction = (action) => {
  return async (req, res, next) => {
    const auditEntry = {
      action,
      service: 'billing-service',
      userId: req.user?.id,
      workspaceId: req.workspaceId || req.user?.workspaceId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
      requestBody: sanitizeRequestBody(req.body),
      queryParams: req.query
    };
    
    // Log audit entry
    req.logger?.info('Billing audit', auditEntry);
    
    // Store in audit log
    if (req.app.locals.auditLogger) {
      await req.app.locals.auditLogger.log(auditEntry);
    }
    
    // Track response
    const originalJson = res.json;
    res.json = function(data) {
      auditEntry.responseStatus = res.statusCode;
      auditEntry.responseTime = new Date().toISOString();
      auditEntry.success = res.statusCode < 400;
      
      // Log completion
      if (req.app.locals.auditLogger) {
        req.app.locals.auditLogger.update(auditEntry).catch(err => {
          req.logger?.error('Failed to update audit log', err);
        });
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

// Audit payment events
export const auditPaymentEvent = async (req, res, next) => {
  if (!req.path.includes('payment') && !req.path.includes('checkout')) {
    return next();
  }
  
  const paymentAudit = {
    type: 'payment_event',
    service: 'billing-service',
    userId: req.user?.id,
    workspaceId: req.workspaceId || req.user?.workspaceId,
    action: determinePaymentAction(req),
    amount: req.body?.amount,
    currency: req.body?.currency || 'usd',
    paymentMethod: req.body?.paymentMethodId ? 'card' : undefined,
    metadata: req.body?.metadata,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  };
  
  // Log payment audit
  req.logger?.info('Payment audit', paymentAudit);
  
  // Store sensitive payment audit
  if (req.app.locals.auditLogger) {
    await req.app.locals.auditLogger.logPayment(paymentAudit);
  }
  
  next();
};

// Audit subscription events
export const auditSubscriptionEvent = async (req, res, next) => {
  if (!req.path.includes('subscription')) {
    return next();
  }
  
  const subscriptionAudit = {
    type: 'subscription_event',
    service: 'billing-service',
    userId: req.user?.id,
    workspaceId: req.workspaceId || req.user?.workspaceId,
    action: determineSubscriptionAction(req),
    planId: req.body?.planId,
    previousPlan: req.subscription?.planId,
    quantity: req.body?.quantity,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  };
  
  // Log subscription audit
  req.logger?.info('Subscription audit', subscriptionAudit);
  
  // Track subscription changes
  const originalJson = res.json;
  res.json = function(data) {
    if (res.statusCode < 400 && req.method !== 'GET') {
      subscriptionAudit.success = true;
      subscriptionAudit.newStatus = data?.status;
      
      // Store in audit log
      if (req.app.locals.auditLogger) {
        req.app.locals.auditLogger.logSubscription(subscriptionAudit).catch(err => {
          req.logger?.error('Failed to log subscription audit', err);
        });
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Audit credit transactions
export const auditCreditTransaction = async (req, res, next) => {
  if (!req.path.includes('credit')) {
    return next();
  }
  
  const creditAudit = {
    type: 'credit_transaction',
    service: 'billing-service',
    userId: req.user?.id,
    workspaceId: req.workspaceId || req.user?.workspaceId,
    action: determineCreditAction(req),
    amount: req.body?.amount || req.body?.credits,
    reason: req.body?.reason,
    metadata: req.body?.metadata,
    balanceBefore: req.creditBalance?.total,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    correlationId: req.correlationId
  };
  
  // Track credit changes
  const originalJson = res.json;
  res.json = function(data) {
    if (res.statusCode < 400 && req.method !== 'GET') {
      creditAudit.success = true;
      creditAudit.balanceAfter = data?.balance?.total;
      creditAudit.change = creditAudit.balanceAfter - (creditAudit.balanceBefore || 0);
      
      // Log credit audit
      req.logger?.info('Credit audit', creditAudit);
      
      // Store in audit log
      if (req.app.locals.auditLogger) {
        req.app.locals.auditLogger.logCredit(creditAudit).catch(err => {
          req.logger?.error('Failed to log credit audit', err);
        });
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

// Helper functions
function sanitizeRequestBody(body) {
  if (!body) return undefined;
  
  const sensitiveFields = [
    'password',
    'card_number',
    'cvv',
    'cvc',
    'card',
    'payment_method',
    'client_secret',
    'api_key',
    'secret',
    'token'
  ];
  
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function determinePaymentAction(req) {
  if (req.path.includes('checkout')) return 'checkout';
  if (req.path.includes('refund')) return 'refund';
  if (req.path.includes('method')) {
    if (req.method === 'POST') return 'add_payment_method';
    if (req.method === 'DELETE') return 'remove_payment_method';
    if (req.method === 'PUT' || req.method === 'PATCH') return 'update_payment_method';
  }
  if (req.path.includes('invoice')) return 'invoice';
  return 'payment';
}

function determineSubscriptionAction(req) {
  if (req.method === 'POST') return 'create_subscription';
  if (req.method === 'DELETE') return 'cancel_subscription';
  if (req.method === 'PUT' || req.method === 'PATCH') return 'update_subscription';
  if (req.path.includes('resume')) return 'resume_subscription';
  if (req.path.includes('pause')) return 'pause_subscription';
  return 'view_subscription';
}

function determineCreditAction(req) {
  if (req.path.includes('purchase')) return 'purchase_credits';
  if (req.path.includes('consume')) return 'consume_credits';
  if (req.path.includes('refund')) return 'refund_credits';
  if (req.path.includes('transfer')) return 'transfer_credits';
  if (req.path.includes('grant')) return 'grant_credits';
  if (req.method === 'GET') return 'view_balance';
  return 'credit_transaction';
}

export default {
  auditBillingAction,
  auditPaymentEvent,
  auditSubscriptionEvent,
  auditCreditTransaction
};