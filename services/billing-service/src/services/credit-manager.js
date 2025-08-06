// ==========================================
// SERVICES/BILLING-SERVICE/src/services/credit-manager.js
// ==========================================

import config from '../config/index.js';

export class CreditManager {
  constructor(logger, mongoClient, redisClient, eventEmitter) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.eventEmitter = eventEmitter;
    this.creditCosts = config.creditCosts;
  }

  /**
   * Get current credit balance for a workspace
   */
  async getBalance(workspaceId) {
    try {
      // Check cache first
      const cached = await this.redisClient.get(`credits:${workspaceId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const db = this.mongoClient.getDb();
      const credits = await db.collection('credits').findOne({ workspaceId });

      if (!credits) {
        // Initialize credits for new workspace
        const initialCredits = {
          workspaceId,
          balance: config.plans.free.credits,
          monthlyCredits: config.plans.free.credits,
          additionalCredits: 0,
          plan: 'free',
          resetDate: this.getNextResetDate(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection('credits').insertOne(initialCredits);
        
        // Cache the balance
        await this.cacheBalance(workspaceId, initialCredits);
        
        return initialCredits;
      }

      // Check if credits need to be reset
      if (new Date() > new Date(credits.resetDate)) {
        credits.balance = credits.monthlyCredits;
        credits.resetDate = this.getNextResetDate();
        credits.updatedAt = new Date();
        
        await db.collection('credits').updateOne(
          { workspaceId },
          { $set: credits }
        );
      }

      // Cache the balance
      await this.cacheBalance(workspaceId, credits);

      return credits;
    } catch (error) {
      this.logger.error('Failed to get credit balance', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Consume credits for an operation
   */
  async consumeCredits(workspaceId, userId, operation, metadata = {}) {
    try {
      const cost = this.creditCosts[operation] || 1;
      
      // Get current balance
      const credits = await this.getBalance(workspaceId);
      
      if (credits.balance < cost) {
        // Emit event for insufficient credits
        await this.eventEmitter.emit('credits.insufficient', {
          workspaceId,
          userId,
          operation,
          required: cost,
          available: credits.balance,
        });
        
        throw new Error('Insufficient credits');
      }

      // Deduct credits
      const db = this.mongoClient.getDb();
      const result = await db.collection('credits').findOneAndUpdate(
        { workspaceId, balance: { $gte: cost } },
        { 
          $inc: { balance: -cost },
          $set: { updatedAt: new Date() }
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new Error('Failed to consume credits - concurrent modification');
      }

      // Record transaction
      await db.collection('credit_transactions').insertOne({
        workspaceId,
        userId,
        type: 'consumption',
        operation,
        amount: -cost,
        balanceBefore: credits.balance,
        balanceAfter: result.balance,
        metadata,
        createdAt: new Date(),
      });

      // Update cache
      await this.cacheBalance(workspaceId, result);

      // Emit event
      await this.eventEmitter.emit('credits.consumed', {
        workspaceId,
        userId,
        operation,
        cost,
        remainingBalance: result.balance,
      });

      // Check for low balance warning
      if (result.balance < credits.monthlyCredits * 0.2) {
        await this.eventEmitter.emit('credits.low_balance', {
          workspaceId,
          balance: result.balance,
          percentage: (result.balance / credits.monthlyCredits) * 100,
        });
      }

      return {
        success: true,
        consumed: cost,
        remainingBalance: result.balance,
      };
    } catch (error) {
      this.logger.error('Failed to consume credits', error, { 
        workspaceId, 
        userId, 
        operation 
      });
      throw error;
    }
  }

  /**
   * Add credits to a workspace
   */
  async addCredits(workspaceId, amount, type = 'purchase', metadata = {}) {
    try {
      const db = this.mongoClient.getDb();
      
      // Update balance
      const result = await db.collection('credits').findOneAndUpdate(
        { workspaceId },
        { 
          $inc: { 
            balance: amount,
            ...(type === 'purchase' && { additionalCredits: amount })
          },
          $set: { updatedAt: new Date() }
        },
        { returnDocument: 'after', upsert: true }
      );

      // Record transaction
      await db.collection('credit_transactions').insertOne({
        workspaceId,
        type: 'addition',
        subType: type,
        amount,
        balanceBefore: (result.balance - amount),
        balanceAfter: result.balance,
        metadata,
        createdAt: new Date(),
      });

      // Update cache
      await this.cacheBalance(workspaceId, result);

      // Emit event
      await this.eventEmitter.emit('credits.added', {
        workspaceId,
        amount,
        type,
        newBalance: result.balance,
      });

      return {
        success: true,
        added: amount,
        newBalance: result.balance,
      };
    } catch (error) {
      this.logger.error('Failed to add credits', error, { 
        workspaceId, 
        amount, 
        type 
      });
      throw error;
    }
  }

  /**
   * Update monthly credit allocation (when plan changes)
   */
  async updateMonthlyCredits(workspaceId, plan) {
    try {
      const planConfig = config.plans[plan];
      if (!planConfig) {
        throw new Error(`Invalid plan: ${plan}`);
      }

      const db = this.mongoClient.getDb();
      
      const result = await db.collection('credits').findOneAndUpdate(
        { workspaceId },
        { 
          $set: { 
            monthlyCredits: planConfig.credits,
            plan,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after', upsert: true }
      );

      // Clear cache
      await this.redisClient.del(`credits:${workspaceId}`);

      this.logger.info('Updated monthly credits', { 
        workspaceId, 
        plan, 
        credits: planConfig.credits 
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to update monthly credits', error, { 
        workspaceId, 
        plan 
      });
      throw error;
    }
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(workspaceId, options = {}) {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        startDate, 
        endDate, 
        type 
      } = options;

      const db = this.mongoClient.getDb();
      
      const query = { workspaceId };
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      if (type) {
        query.type = type;
      }

      const transactions = await db.collection('credit_transactions')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      const total = await db.collection('credit_transactions').countDocuments(query);

      return {
        transactions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + transactions.length < total,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get transaction history', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get credit usage statistics
   */
  async getUsageStatistics(workspaceId, period = 'month') {
    try {
      const db = this.mongoClient.getDb();
      
      const startDate = this.getStartDateForPeriod(period);
      
      const stats = await db.collection('credit_transactions').aggregate([
        {
          $match: {
            workspaceId,
            createdAt: { $gte: startDate },
            type: 'consumption',
          },
        },
        {
          $group: {
            _id: '$operation',
            count: { $sum: 1 },
            totalCredits: { $sum: { $abs: '$amount' } },
          },
        },
        {
          $sort: { totalCredits: -1 },
        },
      ]).toArray();

      const totalConsumed = stats.reduce((sum, stat) => sum + stat.totalCredits, 0);

      return {
        period,
        startDate,
        totalConsumed,
        byOperation: stats,
      };
    } catch (error) {
      this.logger.error('Failed to get usage statistics', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Cache credit balance
   */
  async cacheBalance(workspaceId, credits) {
    await this.redisClient.set(
      `credits:${workspaceId}`,
      JSON.stringify(credits),
      config.redis.ttl.creditBalance
    );
  }

  /**
   * Get next credit reset date
   */
  getNextResetDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  /**
   * Get start date for period
   */
  getStartDateForPeriod(period) {
    const now = new Date();
    
    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return weekAgo;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'year':
        return new Date(now.getFullYear(), 0, 1);
      default:
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  /**
   * Check if operation is allowed based on credits
   */
  async canPerformOperation(workspaceId, operation) {
    try {
      const cost = this.creditCosts[operation] || 1;
      const credits = await this.getBalance(workspaceId);
      
      return {
        allowed: credits.balance >= cost,
        cost,
        balance: credits.balance,
        shortage: Math.max(0, cost - credits.balance),
      };
    } catch (error) {
      this.logger.error('Failed to check operation allowance', error, { 
        workspaceId, 
        operation 
      });
      return {
        allowed: false,
        error: error.message,
      };
    }
  }
}