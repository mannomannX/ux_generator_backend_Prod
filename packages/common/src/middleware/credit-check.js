// ==========================================
// PACKAGES/COMMON/src/middleware/credit-check.js
// ==========================================

/**
 * Middleware to check if workspace has enough credits for an operation
 */
export const requireCredits = (creditsRequired = 1) => {
  return async (req, res, next) => {
    try {
      const workspaceId = req.workspace?.id || 
                          req.body?.workspaceId || 
                          req.headers['x-workspace-id'];
      
      if (!workspaceId) {
        return res.status(400).json({
          error: 'WORKSPACE_REQUIRED',
          message: 'Workspace ID is required for this operation',
        });
      }

      // Get workspace from database
      const db = req.app.locals.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ 
        _id: workspaceId 
      });
      
      if (!workspace) {
        return res.status(404).json({
          error: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace not found',
        });
      }

      // Calculate total available credits
      const billing = workspace.billing || {};
      const totalCredits = (billing.credits?.balance || 0) + 
                          (billing.credits?.additionalCredits || 0);
      
      // Check if enough credits
      if (totalCredits < creditsRequired) {
        const plan = billing.plan || 'free';
        
        return res.status(402).json({
          error: 'INSUFFICIENT_CREDITS',
          message: 'Not enough credits for this operation',
          creditsRequired,
          creditsAvailable: totalCredits,
          currentPlan: plan,
          upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/upgrade`,
          suggestion: plan === 'free' 
            ? 'Upgrade to a paid plan for more credits' 
            : 'Purchase additional credits or wait for monthly renewal',
        });
      }
      
      // Attach credits info to request for later consumption
      req.creditsToConsume = creditsRequired;
      req.workspaceId = workspaceId;
      req.creditBalance = totalCredits;
      
      next();
    } catch (error) {
      console.error('Credit check middleware error:', error);
      res.status(500).json({
        error: 'CREDIT_CHECK_FAILED',
        message: 'Failed to verify credit balance',
      });
    }
  };
};

/**
 * Consume credits after successful operation
 */
export const consumeCredits = async (mongoClient, workspaceId, credits, operation = 'unknown') => {
  try {
    const db = mongoClient.getDb();
    
    // Deduct credits from balance
    const result = await db.collection('workspaces').findOneAndUpdate(
      { 
        _id: workspaceId,
        $or: [
          { 'billing.credits.balance': { $gte: credits } },
          { 'billing.credits.additionalCredits': { $gte: credits } }
        ]
      },
      {
        $inc: {
          'billing.credits.balance': -Math.min(credits, workspace.billing.credits.balance || 0),
          'billing.credits.additionalCredits': -Math.max(0, credits - (workspace.billing.credits.balance || 0)),
          'billing.creditsUsedThisMonth': credits,
        },
        $set: {
          'billing.lastCreditUsage': new Date(),
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new Error('Failed to consume credits - insufficient balance');
    }

    // Log credit transaction
    await db.collection('credit_transactions').insertOne({
      workspaceId,
      type: 'consumption',
      operation,
      amount: -credits,
      balanceAfter: result.billing.credits.balance + result.billing.credits.additionalCredits,
      timestamp: new Date(),
    });

    return {
      success: true,
      consumed: credits,
      remainingBalance: result.billing.credits.balance + result.billing.credits.additionalCredits,
    };
  } catch (error) {
    console.error('Failed to consume credits:', error);
    throw error;
  }
};

/**
 * Credit costs for different operations
 */
export const CREDIT_COSTS = {
  // AI Agent operations
  'ai.generate': 10,
  'ai.refine': 5,
  'ai.analyze': 8,
  'ai.suggest': 3,
  'ai.validate': 2,
  
  // Manager Agent
  'manager.process': 1,
  
  // Planner Agent
  'planner.createPlan': 3,
  'planner.refinePlan': 2,
  
  // Architect Agent  
  'architect.generateFlow': 3,
  'architect.updateFlow': 2,
  
  // Validator Agent
  'validator.validate': 1,
  
  // UX Expert Agent
  'uxExpert.consultation': 2,
  'uxExpert.review': 1,
  
  // Visual Interpreter
  'visual.interpretImage': 5,
  'visual.analyzeScreenshot': 4,
  
  // Synthesizer
  'synthesizer.generateResponse': 1,
  
  // Refinement Specialist
  'refinement.improve': 2,
  'refinement.optimize': 3,
  
  // Documentation Expert
  'documentation.generate': 2,
  'documentation.update': 1,
  
  // Flow operations
  'flow.export': 1,
  'flow.import': 1,
  'flow.validate': 1,
  
  // Knowledge operations
  'knowledge.query': 2,
  'knowledge.embed': 5,
  'knowledge.update': 3,
  
  // Quality multipliers
  qualityMultiplier: {
    'standard': 1,
    'pro': 2, // Double credits for pro quality
    'max': 3, // Triple credits for maximum quality
  },
};

/**
 * Calculate credit cost for an operation
 */
export const calculateCreditCost = (operation, quality = 'standard') => {
  const baseCost = CREDIT_COSTS[operation] || 1;
  const multiplier = CREDIT_COSTS.qualityMultiplier[quality] || 1;
  return Math.ceil(baseCost * multiplier);
};

/**
 * Middleware to consume credits after successful response
 */
export const consumeCreditsAfterSuccess = () => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Only consume credits if response is successful
      if (res.statusCode >= 200 && res.statusCode < 300 && req.creditsToConsume) {
        // Consume credits asynchronously
        consumeCredits(
          req.app.locals.mongoClient,
          req.workspaceId,
          req.creditsToConsume,
          req.route?.path || 'unknown'
        ).catch(error => {
          console.error('Failed to consume credits after success:', error);
        });
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

export default {
  requireCredits,
  consumeCredits,
  calculateCreditCost,
  consumeCreditsAfterSuccess,
  CREDIT_COSTS,
};