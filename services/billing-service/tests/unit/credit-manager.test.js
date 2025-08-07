// ==========================================
// BILLING SERVICE - CreditManager Unit Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CreditManager } from '../../src/services/credit-manager.js';
import { 
  testUsers,
  testCreditTransactions 
} from '../fixtures/test-data.js';

describe('CreditManager', () => {
  let creditManager;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;
  let mockEventEmitter;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockCollection = {
      findOne: jest.fn(),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn()
          }))
        }))
      })),
      aggregate: jest.fn(() => ({
        toArray: jest.fn()
      }))
    };

    mockDb = {
      collection: jest.fn(() => mockCollection)
    };

    mockMongoClient = {
      getDb: jest.fn(() => mockDb)
    };

    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn(),
      expire: jest.fn()
    };

    mockEventEmitter = {
      emit: jest.fn(),
      emitToService: jest.fn()
    };

    creditManager = new CreditManager(
      mockLogger,
      mockMongoClient,
      mockRedisClient,
      mockEventEmitter
    );
  });

  describe('getBalance', () => {
    it('should return correct credit balance', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const mockBalance = {
        workspaceId,
        balance: 1500,
        monthlyCredits: 2000,
        additionalCredits: 500,
        consumedThisMonth: 1000,
        resetDate: new Date('2024-02-01')
      };

      mockCollection.findOne.mockResolvedValue(mockBalance);

      const balance = await creditManager.getBalance(workspaceId);

      expect(balance).toMatchObject({
        balance: 1500,
        monthlyCredits: 2000,
        additionalCredits: 500,
        total: 1500
      });
    });

    it('should initialize balance for new workspace', async () => {
      const workspaceId = testUsers.freeUser.workspaceId;
      
      mockCollection.findOne.mockResolvedValue(null);
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'balance_123' });

      const balance = await creditManager.getBalance(workspaceId);

      expect(balance.balance).toBe(100); // Free tier default
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          balance: 100,
          monthlyCredits: 100
        })
      );
    });

    it('should use cached balance when available', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const cachedBalance = JSON.stringify({ balance: 1500, total: 1500 });

      mockRedisClient.get.mockResolvedValue(cachedBalance);

      const balance = await creditManager.getBalance(workspaceId);

      expect(balance.balance).toBe(1500);
      expect(mockCollection.findOne).not.toHaveBeenCalled();
    });
  });

  describe('consumeCredits', () => {
    it('should consume credits successfully', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const amount = 50;
      const reason = 'AI generation';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 1500
      });

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'trans_123' });

      const result = await creditManager.consumeCredits(workspaceId, amount, reason);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1450);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { workspaceId },
        expect.objectContaining({
          $inc: { balance: -amount, consumedThisMonth: amount }
        })
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('credits.consumed', expect.any(Object));
    });

    it('should fail when insufficient credits', async () => {
      const workspaceId = testUsers.freeUser.workspaceId;
      const amount = 200;

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 50
      });

      const result = await creditManager.consumeCredits(workspaceId, amount, 'AI generation');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credits');
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('should emit low balance warning', async () => {
      const workspaceId = testUsers.starterUser.workspaceId;
      const amount = 450;

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 500
      });

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'trans_123' });

      await creditManager.consumeCredits(workspaceId, amount, 'Large operation');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('credits.low_balance', 
        expect.objectContaining({
          workspaceId,
          balance: 50
        })
      );
    });
  });

  describe('addCredits', () => {
    it('should add credits successfully', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const amount = 1000;
      const reason = 'Purchase';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 500
      });

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'trans_123' });

      const result = await creditManager.addCredits(workspaceId, amount, reason);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(1500);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { workspaceId },
        expect.objectContaining({
          $inc: { balance: amount, additionalCredits: amount }
        })
      );
    });

    it('should handle negative amounts as error', async () => {
      const workspaceId = testUsers.proUser.workspaceId;

      await expect(
        creditManager.addCredits(workspaceId, -100, 'Invalid')
      ).rejects.toThrow('Amount must be positive');
    });
  });

  describe('resetMonthlyCredits', () => {
    it('should reset monthly credits at period end', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const planCredits = 2000;

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 100,
        additionalCredits: 50,
        resetDate: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000) // 32 days ago
      });

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await creditManager.resetMonthlyCredits(workspaceId, planCredits);

      expect(result.success).toBe(true);
      expect(result.newBalance).toBe(2050); // 2000 monthly + 50 additional
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { workspaceId },
        expect.objectContaining({
          $set: expect.objectContaining({
            balance: 2050,
            monthlyCredits: 2000,
            consumedThisMonth: 0
          })
        })
      );
    });

    it('should not reset if not time yet', async () => {
      const workspaceId = testUsers.proUser.workspaceId;

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        balance: 1500,
        resetDate: new Date() // Today
      });

      const result = await creditManager.resetMonthlyCredits(workspaceId, 2000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Not time to reset');
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('getTransactionHistory', () => {
    it('should retrieve transaction history', async () => {
      const workspaceId = testUsers.proUser.workspaceId;

      mockCollection.find().sort().limit().toArray.mockResolvedValue([
        testCreditTransactions.creditConsumption,
        testCreditTransactions.creditPurchase
      ]);

      const history = await creditManager.getTransactionHistory(workspaceId, {
        limit: 10,
        offset: 0
      });

      expect(history.transactions).toHaveLength(2);
      expect(mockCollection.find).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId })
      );
    });

    it('should filter by date range', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      mockCollection.find().sort().limit().toArray.mockResolvedValue([]);

      await creditManager.getTransactionHistory(workspaceId, {
        startDate,
        endDate
      });

      expect(mockCollection.find).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        })
      );
    });
  });

  describe('getUsageStatistics', () => {
    it('should calculate usage statistics', async () => {
      const workspaceId = testUsers.proUser.workspaceId;

      mockCollection.aggregate().toArray.mockResolvedValue([
        {
          _id: 'AI generation',
          total: 500,
          count: 10,
          average: 50
        },
        {
          _id: 'Document processing',
          total: 300,
          count: 5,
          average: 60
        }
      ]);

      const stats = await creditManager.getUsageStatistics(workspaceId, 'month');

      expect(stats).toMatchObject({
        period: 'month',
        totalConsumed: 800,
        byCategory: expect.arrayContaining([
          expect.objectContaining({
            category: 'AI generation',
            total: 500
          })
        ])
      });
    });
  });

  describe('transferCredits', () => {
    it('should transfer credits between workspaces', async () => {
      const fromWorkspace = testUsers.proUser.workspaceId;
      const toWorkspace = testUsers.starterUser.workspaceId;
      const amount = 100;

      mockCollection.findOne
        .mockResolvedValueOnce({ workspaceId: fromWorkspace, balance: 500 })
        .mockResolvedValueOnce({ workspaceId: toWorkspace, balance: 200 });

      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'trans_123' });

      const result = await creditManager.transferCredits(
        fromWorkspace,
        toWorkspace,
        amount
      );

      expect(result.success).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('credits.transferred',
        expect.objectContaining({
          from: fromWorkspace,
          to: toWorkspace,
          amount
        })
      );
    });

    it('should fail transfer with insufficient balance', async () => {
      const fromWorkspace = testUsers.freeUser.workspaceId;
      const toWorkspace = testUsers.starterUser.workspaceId;

      mockCollection.findOne.mockResolvedValueOnce({
        workspaceId: fromWorkspace,
        balance: 50
      });

      const result = await creditManager.transferCredits(
        fromWorkspace,
        toWorkspace,
        100
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient credits');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});