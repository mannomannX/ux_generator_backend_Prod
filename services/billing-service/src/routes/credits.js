// ==========================================
// SERVICES/BILLING-SERVICE/src/routes/credits.js
// ==========================================

import express from 'express';
import { requireAuth, requireCredits } from '@ux-flow/common';

const router = express.Router();

// Get current credit balance
router.get('/balance', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const balance = await req.creditManager.getBalance(workspaceId);
    
    res.json({
      balance: balance.balance,
      monthlyCredits: balance.monthlyCredits,
      additionalCredits: balance.additionalCredits,
      plan: balance.plan,
      resetDate: balance.resetDate,
      totalAvailable: balance.balance + balance.additionalCredits,
    });
  } catch (error) {
    next(error);
  }
});

// Get credit packages
router.get('/packages', async (req, res) => {
  const packages = req.app.locals.config.creditPricing;
  
  res.json({
    packages: Object.entries(packages).map(([id, pkg]) => ({
      id,
      credits: pkg.credits,
      price: pkg.price,
      pricePerCredit: (pkg.price / pkg.credits).toFixed(2),
      savings: id === 'small' ? 0 : 
               id === 'medium' ? 12.5 : 
               id === 'large' ? 25 : 0,
      popular: id === 'medium',
    })),
    currency: 'usd',
  });
});

// Purchase credits
router.post('/purchase', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { packageId, successUrl, cancelUrl } = req.body;
    
    if (!packageId) {
      return res.status(400).json({ 
        error: 'Package ID is required' 
      });
    }
    
    const creditPackage = req.app.locals.config.creditPricing[packageId];
    
    if (!creditPackage) {
      return res.status(400).json({ 
        error: 'Invalid package ID' 
      });
    }
    
    // Ensure Stripe customer exists
    const customerId = await req.billingManager.ensureStripeCustomer(
      workspaceId,
      req.user.email,
      req.user.name
    );
    
    // Create checkout session for one-time payment
    const session = await req.stripeService.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: creditPackage.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${process.env.FRONTEND_URL}/billing/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/billing/credits`,
      metadata: {
        type: 'credits',
        workspaceId,
        credits: creditPackage.credits,
        packageId,
      },
    });
    
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    next(error);
  }
});

// Check if operation is allowed based on credits
router.post('/check', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { operation, quality = 'standard' } = req.body;
    
    if (!operation) {
      return res.status(400).json({ 
        error: 'Operation is required' 
      });
    }
    
    const result = await req.creditManager.canPerformOperation(workspaceId, operation);
    
    res.json({
      allowed: result.allowed,
      cost: result.cost,
      balance: result.balance,
      shortage: result.shortage,
      suggestion: !result.allowed 
        ? 'Purchase additional credits or upgrade your plan' 
        : null,
    });
  } catch (error) {
    next(error);
  }
});

// Manual credit adjustment (admin only)
router.post('/adjust', requireAuth, async (req, res, next) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Admin access required' 
      });
    }
    
    const { workspaceId, amount, reason } = req.body;
    
    if (!workspaceId || !amount || !reason) {
      return res.status(400).json({ 
        error: 'Workspace ID, amount, and reason are required' 
      });
    }
    
    const result = await req.creditManager.addCredits(
      workspaceId,
      amount,
      'adjustment',
      {
        reason,
        adjustedBy: req.user.id,
        adjustedAt: new Date(),
      }
    );
    
    res.json({
      success: true,
      newBalance: result.newBalance,
      added: result.added,
    });
  } catch (error) {
    next(error);
  }
});

// Get credit usage report
router.get('/report', requireAuth, async (req, res, next) => {
  try {
    const workspaceId = req.user.workspaceId;
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const db = req.app.locals.mongoClient.getDb();
    
    // Build aggregation pipeline
    const pipeline = [
      { 
        $match: { 
          workspaceId,
          type: 'consumption',
          ...(startDate && { createdAt: { $gte: new Date(startDate) } }),
          ...(endDate && { createdAt: { $lte: new Date(endDate) } }),
        } 
      },
    ];
    
    // Group by period
    const grouping = {
      day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      week: { $week: '$createdAt' },
      month: { $month: '$createdAt' },
    };
    
    pipeline.push({
      $group: {
        _id: {
          period: grouping[groupBy] || grouping.day,
          operation: '$operation',
        },
        totalCredits: { $sum: { $abs: '$amount' } },
        count: { $sum: 1 },
      },
    });
    
    pipeline.push({
      $group: {
        _id: '$_id.period',
        operations: {
          $push: {
            operation: '$_id.operation',
            credits: '$totalCredits',
            count: '$count',
          },
        },
        totalCredits: { $sum: '$totalCredits' },
      },
    });
    
    pipeline.push({ $sort: { _id: 1 } });
    
    const report = await db.collection('credit_transactions')
      .aggregate(pipeline)
      .toArray();
    
    res.json({
      report,
      period: { startDate, endDate },
      groupBy,
    });
  } catch (error) {
    next(error);
  }
});

// Estimate credits for operation
router.post('/estimate', requireAuth, async (req, res, next) => {
  try {
    const { operations, quality = 'standard' } = req.body;
    
    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({ 
        error: 'Operations array is required' 
      });
    }
    
    const estimates = operations.map(op => {
      const cost = req.app.locals.CREDIT_COSTS[op] || 1;
      const multiplier = req.app.locals.CREDIT_COSTS.qualityMultiplier[quality] || 1;
      return {
        operation: op,
        baseCost: cost,
        quality,
        multiplier,
        totalCost: Math.ceil(cost * multiplier),
      };
    });
    
    const totalCost = estimates.reduce((sum, est) => sum + est.totalCost, 0);
    
    res.json({
      estimates,
      totalCost,
      quality,
    });
  } catch (error) {
    next(error);
  }
});

export default router;