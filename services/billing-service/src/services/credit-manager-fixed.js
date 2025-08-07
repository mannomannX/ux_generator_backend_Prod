// ==========================================
// SERVICES/BILLING-SERVICE/src/services/credit-manager-fixed.js
// Fixed version with race condition prevention and idempotency
// ==========================================

import config from '../config/index.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

export class CreditManager {
  constructor(logger, mongoClient, redisClient, eventEmitter) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.eventEmitter = eventEmitter;
    this.creditCosts = config.creditCosts;
  }
  
  /**
   * Acquire distributed lock for atomic operations
   */
  async acquireLock(key, token, ttlMs = 5000) {
    if (!this.redisClient) return true; // Fallback if Redis not available
    
    try {
      const result = await this.redisClient.set(
        key,
        token,
        'PX', ttlMs,
        'NX'
      );
      return result === 'OK';
    } catch (error) {
      this.logger.error('Failed to acquire lock', error);
      return false;
    }
  }
  
  /**
   * Release distributed lock
   */
  async releaseLock(key, token) {
    if (!this.redisClient) return;
    
    try {
      // Use Lua script for atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redisClient.eval(script, 1, key, token);
    } catch (error) {
      this.logger.error('Failed to release lock', error);
    }
  }

  /**
   * Get current credit balance for a workspace
   */
  async getBalance(workspaceId) {
    try {
      // Check cache first
      const cached = await this.redisClient?.get(`credits:${workspaceId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      const db = this.mongoClient.getDb();
      const credits = await db.collection('credits').findOne({ workspaceId });

      if (!credits) {
        // Initialize credits if not found
        const initialCredits = {
          workspaceId,
          balance: 0,
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await db.collection('credits').insertOne(initialCredits);
        return initialCredits;
      }

      // Cache for 5 minutes
      await this.redisClient?.setex(
        `credits:${workspaceId}`,
        300,
        JSON.stringify(credits)
      );

      return credits;
    } catch (error) {
      this.logger.error('Failed to get credit balance', error);
      throw error;
    }
  }

  /**
   * Get credits (alias for getBalance)
   */
  async getCredits(workspaceId) {
    return this.getBalance(workspaceId);
  }

  /**
   * Add credits to a workspace account with idempotency
   */
  async addCredits(workspaceId, amount, source, metadata = {}) {
    const idempotencyKey = metadata.idempotencyKey || 
      crypto.randomBytes(16).toString('hex');
    
    const lockKey = `credits:lock:${workspaceId}`;
    const lockToken = crypto.randomBytes(16).toString('hex');
    const lockAcquired = await this.acquireLock(lockKey, lockToken, 5000);
    
    if (!lockAcquired) {
      throw new Error('Could not acquire lock for credit operation');
    }
    
    const db = this.mongoClient.getDb();
    const session = this.mongoClient.client.startSession();
    
    try {
      let result;
      
      await session.withTransaction(async () => {
        // Check for duplicate transaction
        const existingTx = await db.collection('credit_transactions').findOne(
          { idempotencyKey },
          { session }
        );
        
        if (existingTx) {
          this.logger.info('Duplicate credit addition detected', { idempotencyKey });
          result = { duplicate: true, transaction: existingTx };
          return;
        }
        
        // Get current balance
        const credits = await db.collection('credits').findOne(
          { workspaceId },
          { session }
        );
        
        if (!credits) {
          // Initialize if not exists
          const initialCredits = {
            workspaceId,
            balance: amount,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          await db.collection('credits').insertOne(initialCredits, { session });
          
          const transaction = {
            _id: new ObjectId(),
            idempotencyKey,
            workspaceId,
            type: 'addition',
            source,
            amount,
            balanceBefore: 0,
            balanceAfter: amount,
            metadata,
            createdAt: new Date(),
          };
          
          await db.collection('credit_transactions').insertOne(transaction, { session });
          
          result = {
            success: true,
            newBalance: amount,
            transaction
          };
          return;
        }
        
        // Update balance with version check
        const updateResult = await db.collection('credits').updateOne(
          { 
            workspaceId,
            version: credits.version || 0
          },
          { 
            $inc: { balance: amount, version: 1 },
            $set: { updatedAt: new Date() }
          },
          { session }
        );
        
        if (updateResult.matchedCount === 0) {
          throw new Error('Concurrent modification detected');
        }
        
        // Record transaction
        const transaction = {
          _id: new ObjectId(),
          idempotencyKey,
          workspaceId,
          type: 'addition',
          source,
          amount,
          balanceBefore: credits.balance,
          balanceAfter: credits.balance + amount,
          metadata,
          createdAt: new Date(),
        };
        
        await db.collection('credit_transactions').insertOne(transaction, { session });
        
        result = {
          success: true,
          newBalance: credits.balance + amount,
          transaction
        };
      });
      
      // Invalidate cache
      await this.redisClient?.del(`credits:${workspaceId}`);
      
      // Emit event
      if (this.eventEmitter && !result.duplicate) {
        await this.eventEmitter.emit('credits.added', {
          workspaceId,
          amount,
          source,
          newBalance: result.newBalance,
        });
      }
      
      return result.duplicate ? result.transaction : result;
      
    } finally {
      await session.endSession();
      await this.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Consume credits with idempotency and race condition prevention
   */
  async consumeCredits(workspaceId, userId, operation, metadata = {}) {
    const idempotencyKey = metadata.idempotencyKey || 
      crypto.randomBytes(16).toString('hex');
    
    const lockKey = `credits:lock:${workspaceId}`;
    const lockToken = crypto.randomBytes(16).toString('hex');
    const lockAcquired = await this.acquireLock(lockKey, lockToken, 5000);
    
    if (!lockAcquired) {
      throw new Error('Could not acquire lock for credit operation');
    }
    
    const db = this.mongoClient.getDb();
    const session = this.mongoClient.client.startSession();
    
    try {
      let result;
      
      await session.withTransaction(async () => {
        // Check for duplicate transaction
        const existingTx = await db.collection('credit_transactions').findOne(
          { idempotencyKey },
          { session }
        );
        
        if (existingTx) {
          this.logger.info('Duplicate credit consumption detected', { idempotencyKey });
          result = { duplicate: true, transaction: existingTx };
          return;
        }
        
        // Get current balance
        const credits = await db.collection('credits').findOne(
          { workspaceId },
          { session }
        );
        
        if (!credits) {
          throw new Error('Credits record not found');
        }
        
        const cost = this.calculateCost(operation);
        
        if (credits.balance < cost) {
          throw new Error('Insufficient credits');
        }
        
        // Update balance with version check
        const updateResult = await db.collection('credits').updateOne(
          { 
            workspaceId,
            balance: { $gte: cost },
            version: credits.version || 0
          },
          { 
            $inc: { balance: -cost, version: 1 },
            $set: { updatedAt: new Date() }
          },
          { session }
        );
        
        if (updateResult.matchedCount === 0) {
          throw new Error('Concurrent modification or insufficient balance');
        }
        
        // Record transaction
        const transaction = {
          _id: new ObjectId(),
          idempotencyKey,
          workspaceId,
          userId,
          type: 'consumption',
          operation,
          amount: -cost,
          balanceBefore: credits.balance,
          balanceAfter: credits.balance - cost,
          metadata,
          createdAt: new Date(),
        };
        
        await db.collection('credit_transactions').insertOne(transaction, { session });
        
        result = {
          success: true,
          newBalance: credits.balance - cost,
          transaction
        };
      });
      
      // Invalidate cache
      await this.redisClient?.del(`credits:${workspaceId}`);
      
      // Emit event
      if (this.eventEmitter && !result.duplicate) {
        await this.eventEmitter.emit('credits.consumed', {
          workspaceId,
          userId,
          operation,
          cost: this.calculateCost(operation),
          newBalance: result.newBalance,
        });
      }
      
      return result.duplicate ? result.transaction : result;
      
    } finally {
      await session.endSession();
      await this.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Calculate credit cost for an operation
   */
  calculateCost(operation) {
    return this.creditCosts[operation] || this.creditCosts.default || 1;
  }

  /**
   * Get credit transaction history
   */
  async getTransactionHistory(workspaceId, options = {}) {
    try {
      const db = this.mongoClient.getDb();
      const { limit = 50, offset = 0, startDate, endDate } = options;

      const query = { workspaceId };
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const transactions = await db.collection('credit_transactions')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      return transactions;
    } catch (error) {
      this.logger.error('Failed to get transaction history', error);
      throw error;
    }
  }

  /**
   * Check if workspace has sufficient credits
   */
  async hasCredits(workspaceId, operation) {
    try {
      const credits = await this.getCredits(workspaceId);
      const cost = this.calculateCost(operation);
      return credits.balance >= cost;
    } catch (error) {
      this.logger.error('Failed to check credits', error);
      return false;
    }
  }

  /**
   * Initialize credits for a new workspace
   */
  async initializeCredits(workspaceId, initialBalance = 0) {
    try {
      const db = this.mongoClient.getDb();
      
      // Check if already exists
      const existing = await db.collection('credits').findOne({ workspaceId });
      if (existing) {
        return existing;
      }
      
      const credits = {
        workspaceId,
        balance: initialBalance,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await db.collection('credits').insertOne(credits);
      
      if (initialBalance > 0) {
        // Record initial credit grant
        await db.collection('credit_transactions').insertOne({
          _id: new ObjectId(),
          idempotencyKey: `initial_${workspaceId}`,
          workspaceId,
          type: 'grant',
          source: 'initial',
          amount: initialBalance,
          balanceBefore: 0,
          balanceAfter: initialBalance,
          metadata: { reason: 'Workspace initialization' },
          createdAt: new Date(),
        });
      }
      
      return credits;
    } catch (error) {
      this.logger.error('Failed to initialize credits', error);
      throw error;
    }
  }
}

export default CreditManager;