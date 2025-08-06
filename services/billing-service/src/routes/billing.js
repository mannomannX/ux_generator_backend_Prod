// ==========================================
// SERVICES/BILLING-SERVICE/src/routes/billing.js
// ==========================================

import express from 'express';
import { requireAuth } from '@ux-flow/common';

const router = express.Router();

// Get billing overview
router.get('/overview', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    
    // Get subscription details
    const subscription = await req.subscriptionManager.getSubscriptionDetails(workspaceId);
    
    // Get billing statistics
    const statistics = await req.billingManager.getBillingStatistics(workspaceId);
    
    // Get credit balance
    const credits = await req.creditManager.getBalance(workspaceId);
    
    res.json({
      subscription,
      statistics,
      credits: {
        balance: credits.balance,
        monthlyAllocation: credits.monthlyCredits,
        additionalCredits: credits.additionalCredits,
        resetDate: credits.resetDate,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get invoices
router.get('/invoices', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { limit = 50 } = req.query;
    
    const invoices = await req.billingManager.getWorkspaceInvoices(
      workspaceId, 
      parseInt(limit)
    );
    
    res.json({ invoices });
  } catch (error) {
    next(error);
  }
});

// Create customer portal session
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { returnUrl } = req.body;
    
    // Ensure Stripe customer exists
    const customerId = await req.billingManager.ensureStripeCustomer(
      workspaceId,
      req.user.email,
      req.user.name
    );
    
    // Create portal session
    const session = await req.stripeService.createPortalSession(
      customerId,
      returnUrl || `${process.env.FRONTEND_URL}/billing`
    );
    
    res.json({ 
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    next(error);
  }
});

// Get available plans
router.get('/plans', async (req, res, next) => {
  try {
    const plans = req.app.locals.config.plans;
    
    // Format plans for frontend
    const formattedPlans = Object.entries(plans).map(([id, plan]) => ({
      id,
      name: plan.name,
      price: plan.price || 0,
      credits: plan.credits,
      features: plan.features,
      recommended: id === 'professional',
    }));
    
    res.json({ plans: formattedPlans });
  } catch (error) {
    next(error);
  }
});

// Get payment methods
router.get('/payment-methods', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    
    // Ensure Stripe customer exists
    const customerId = await req.billingManager.ensureStripeCustomer(
      workspaceId,
      req.user.email,
      req.user.name
    );
    
    // Get payment methods
    const paymentMethods = await req.stripeService.listPaymentMethods(customerId);
    
    res.json({ 
      paymentMethods: paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        } : null,
        isDefault: pm.id === pm.customer?.invoice_settings?.default_payment_method,
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Add payment method
router.post('/payment-methods', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { paymentMethodId } = req.body;
    
    if (!paymentMethodId) {
      return res.status(400).json({ 
        error: 'Payment method ID is required' 
      });
    }
    
    // Ensure Stripe customer exists
    const customerId = await req.billingManager.ensureStripeCustomer(
      workspaceId,
      req.user.email,
      req.user.name
    );
    
    // Attach payment method
    const paymentMethod = await req.stripeService.attachPaymentMethod(
      paymentMethodId,
      customerId
    );
    
    res.json({ 
      success: true,
      paymentMethod: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        } : null,
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get usage statistics
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { period = 'month' } = req.query;
    
    const usage = await req.creditManager.getUsageStatistics(workspaceId, period);
    
    res.json({ usage });
  } catch (error) {
    next(error);
  }
});

// Get credit transaction history
router.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { 
      limit = 50, 
      offset = 0, 
      startDate, 
      endDate, 
      type 
    } = req.query;
    
    const transactions = await req.creditManager.getTransactionHistory(
      workspaceId,
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate,
        endDate,
        type,
      }
    );
    
    res.json(transactions);
  } catch (error) {
    next(error);
  }
});

export default router;