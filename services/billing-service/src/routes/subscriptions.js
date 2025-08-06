// ==========================================
// SERVICES/BILLING-SERVICE/src/routes/subscriptions.js
// ==========================================

import express from 'express';
import { requireAuth } from '@ux-flow/common';

const router = express.Router();

// Get current subscription
router.get('/current', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const subscription = await req.subscriptionManager.getSubscriptionDetails(workspaceId);
    
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

// Create subscription
router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { planId, paymentMethodId } = req.body;
    
    if (!planId) {
      return res.status(400).json({ 
        error: 'Plan ID is required' 
      });
    }
    
    const result = await req.subscriptionManager.createSubscription(
      workspaceId,
      planId,
      paymentMethodId
    );
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Update subscription
router.put('/update', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { planId } = req.body;
    
    if (!planId) {
      return res.status(400).json({ 
        error: 'Plan ID is required' 
      });
    }
    
    const result = await req.subscriptionManager.updateSubscription(
      workspaceId,
      planId
    );
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Cancel subscription
router.post('/cancel', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { immediately = false, feedback } = req.body;
    
    const result = await req.subscriptionManager.cancelSubscription(
      workspaceId,
      immediately
    );
    
    // Store cancellation feedback if provided
    if (feedback) {
      const db = req.app.locals.mongoClient.getDb();
      await db.collection('cancellation_feedback').insertOne({
        workspaceId,
        feedback,
        immediately,
        cancelledAt: new Date(),
      });
    }
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Reactivate subscription
router.post('/reactivate', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const result = await req.subscriptionManager.reactivateSubscription(workspaceId);
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Preview proration for plan change
router.post('/preview-change', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { planId } = req.body;
    
    if (!planId) {
      return res.status(400).json({ 
        error: 'Plan ID is required' 
      });
    }
    
    // Get current subscription
    const db = req.app.locals.mongoClient.getDb();
    const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
    
    if (!workspace?.billing?.stripeSubscriptionId) {
      return res.status(404).json({ 
        error: 'No active subscription found' 
      });
    }
    
    // Get proration preview from Stripe
    const subscription = await req.stripeService.getSubscription(
      workspace.billing.stripeSubscriptionId
    );
    
    const newPlan = req.app.locals.config.plans[planId];
    if (!newPlan) {
      return res.status(400).json({ 
        error: 'Invalid plan ID' 
      });
    }
    
    // Calculate proration
    const currentPlan = req.app.locals.config.plans[workspace.billing.plan];
    const currentPrice = currentPlan.price || 0;
    const newPrice = newPlan.price || 0;
    
    const daysRemaining = Math.ceil(
      (new Date(subscription.current_period_end * 1000) - new Date()) / (1000 * 60 * 60 * 24)
    );
    
    const proration = {
      currentPlan: workspace.billing.plan,
      newPlan: planId,
      currentPrice,
      newPrice,
      daysRemaining,
      creditAmount: currentPrice > newPrice 
        ? Math.round((currentPrice - newPrice) * (daysRemaining / 30) * 100) / 100 
        : 0,
      chargeAmount: newPrice > currentPrice 
        ? Math.round((newPrice - currentPrice) * (daysRemaining / 30) * 100) / 100 
        : 0,
      immediateCharge: newPrice > currentPrice,
    };
    
    res.json(proration);
  } catch (error) {
    next(error);
  }
});

// Get subscription history
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { limit = 50 } = req.query;
    
    const db = req.app.locals.mongoClient.getDb();
    const history = await db.collection('subscription_changes')
      .find({ workspaceId })
      .sort({ changedAt: -1 })
      .limit(parseInt(limit))
      .toArray();
    
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

export default router;