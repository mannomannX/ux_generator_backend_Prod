// ==========================================
// BILLING SERVICE - BillingManager Unit Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BillingManager } from '../../src/services/billing-manager.js';
import { 
  testUsers, 
  testSubscriptions, 
  testInvoices,
  mockStripeResponses 
} from '../fixtures/test-data.js';

describe('BillingManager', () => {
  let billingManager;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;
  let mockStripeService;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    // Setup mock collection
    mockCollection = {
      findOne: jest.fn(),
      insertOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn()
          }))
        })),
        toArray: jest.fn()
      })),
      countDocuments: jest.fn(),
      aggregate: jest.fn(() => ({
        toArray: jest.fn()
      }))
    };

    // Setup mock database
    mockDb = {
      collection: jest.fn(() => mockCollection)
    };

    // Setup mock MongoClient
    mockMongoClient = {
      getDb: jest.fn(() => mockDb),
      healthCheck: jest.fn(() => true)
    };

    // Setup mock RedisClient
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
      healthCheck: jest.fn(() => true)
    };

    // Setup mock StripeService
    mockStripeService = {
      createCustomer: jest.fn(),
      updateCustomer: jest.fn(),
      retrieveCustomer: jest.fn(),
      createSubscription: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      listInvoices: jest.fn(),
      retrieveInvoice: jest.fn(),
      createCheckoutSession: jest.fn(),
      createPortalSession: jest.fn(),
      healthCheck: jest.fn(() => true)
    };

    billingManager = new BillingManager(
      mockLogger,
      mockMongoClient,
      mockRedisClient,
      mockStripeService
    );
  });

  describe('ensureStripeCustomer', () => {
    it('should create a new Stripe customer if none exists', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const email = testUsers.proUser.email;
      const name = testUsers.proUser.name;

      mockCollection.findOne.mockResolvedValue(null);
      mockStripeService.createCustomer.mockResolvedValue({
        id: 'cus_new_123',
        email,
        name
      });
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'billing_123' });

      const customerId = await billingManager.ensureStripeCustomer(workspaceId, email, name);

      expect(customerId).toBe('cus_new_123');
      expect(mockStripeService.createCustomer).toHaveBeenCalledWith({
        email,
        name,
        metadata: { workspaceId }
      });
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });

    it('should return existing Stripe customer ID', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const existingCustomerId = 'cus_existing_123';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        stripeCustomerId: existingCustomerId
      });

      const customerId = await billingManager.ensureStripeCustomer(
        workspaceId,
        testUsers.proUser.email,
        testUsers.proUser.name
      );

      expect(customerId).toBe(existingCustomerId);
      expect(mockStripeService.createCustomer).not.toHaveBeenCalled();
    });

    it('should handle Stripe API errors gracefully', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      
      mockCollection.findOne.mockResolvedValue(null);
      mockStripeService.createCustomer.mockRejectedValue(new Error('Stripe API error'));

      await expect(
        billingManager.ensureStripeCustomer(workspaceId, testUsers.proUser.email)
      ).rejects.toThrow('Stripe API error');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session for subscription', async () => {
      const workspaceId = testUsers.starterUser.workspaceId;
      const planId = 'professional';
      const successUrl = 'https://app.example.com/success';
      const cancelUrl = 'https://app.example.com/cancel';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        stripeCustomerId: 'cus_123'
      });

      mockStripeService.createCheckoutSession.mockResolvedValue(
        mockStripeResponses.createCheckoutSession
      );

      const session = await billingManager.createCheckoutSession(
        workspaceId,
        planId,
        successUrl,
        cancelUrl
      );

      expect(session).toEqual(mockStripeResponses.createCheckoutSession);
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          success_url: successUrl,
          cancel_url: cancelUrl
        })
      );
    });

    it('should create checkout session for credit purchase', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const creditAmount = 1000;
      const successUrl = 'https://app.example.com/success';
      const cancelUrl = 'https://app.example.com/cancel';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        stripeCustomerId: 'cus_456'
      });

      mockStripeService.createCheckoutSession.mockResolvedValue(
        mockStripeResponses.createCheckoutSession
      );

      const session = await billingManager.purchaseCredits(
        workspaceId,
        creditAmount,
        successUrl,
        cancelUrl
      );

      expect(session).toEqual(mockStripeResponses.createCheckoutSession);
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({
              quantity: creditAmount
            })
          ])
        })
      );
    });
  });

  describe('getWorkspaceInvoices', () => {
    it('should retrieve and cache workspace invoices', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const stripeCustomerId = 'cus_789';

      mockCollection.findOne.mockResolvedValue({
        workspaceId,
        stripeCustomerId
      });

      mockRedisClient.get.mockResolvedValue(null);
      mockStripeService.listInvoices.mockResolvedValue({
        data: [testInvoices.paidInvoice]
      });

      const invoices = await billingManager.getWorkspaceInvoices(workspaceId, 10);

      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        amount: testInvoices.paidInvoice.amount,
        status: testInvoices.paidInvoice.status
      });
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should return cached invoices if available', async () => {
      const workspaceId = testUsers.proUser.workspaceId;
      const cachedInvoices = JSON.stringify([testInvoices.paidInvoice]);

      mockRedisClient.get.mockResolvedValue(cachedInvoices);

      const invoices = await billingManager.getWorkspaceInvoices(workspaceId);

      expect(invoices).toHaveLength(1);
      expect(mockStripeService.listInvoices).not.toHaveBeenCalled();
    });
  });

  describe('getBillingStatistics', () => {
    it('should calculate billing statistics correctly', async () => {
      const workspaceId = testUsers.proUser.workspaceId;

      // Mock aggregation results
      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: null,
            totalSpent: 12800,
            transactionCount: 3,
            averageTransaction: 4266.67
          }
        ])
      });

      // Mock current subscription
      mockCollection.findOne
        .mockResolvedValueOnce({
          workspaceId,
          planId: 'professional',
          status: 'active',
          credits: { balance: 1500 }
        })
        .mockResolvedValueOnce({
          workspaceId,
          stripeCustomerId: 'cus_123'
        });

      const stats = await billingManager.getBillingStatistics(workspaceId);

      expect(stats).toMatchObject({
        currentPlan: 'professional',
        totalSpent: 12800,
        creditBalance: 1500
      });
    });
  });

  describe('checkWorkspaceAccess', () => {
    it('should return true for users with workspace access', async () => {
      const userId = testUsers.proUser.id;
      const workspaceId = testUsers.proUser.workspaceId;

      mockCollection.findOne.mockResolvedValue({
        userId,
        workspaceId,
        role: 'admin'
      });

      const hasAccess = await billingManager.checkWorkspaceAccess(userId, workspaceId);

      expect(hasAccess).toBe(true);
    });

    it('should return false for users without workspace access', async () => {
      const userId = testUsers.freeUser.id;
      const workspaceId = testUsers.proUser.workspaceId;

      mockCollection.findOne.mockResolvedValue(null);

      const hasAccess = await billingManager.checkWorkspaceAccess(userId, workspaceId);

      expect(hasAccess).toBe(false);
    });
  });

  describe('recordPaymentMetric', () => {
    it('should record payment metrics to database', async () => {
      const metric = {
        type: 'payment_attempt',
        success: true,
        amount: 9900,
        currency: 'usd',
        workspaceId: testUsers.proUser.workspaceId
      };

      mockCollection.insertOne.mockResolvedValue({ insertedId: 'metric_123' });

      await billingManager.recordPaymentMetric(metric);

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          ...metric,
          createdAt: expect.any(Date)
        })
      );
    });
  });

  describe('calculateRevenueImpact', () => {
    it('should calculate revenue impact for subscription changes', async () => {
      const change = {
        type: 'subscription_change',
        action: 'update',
        planId: 'professional',
        previousPlan: 'starter',
        workspaceId: testUsers.starterUser.workspaceId
      };

      mockCollection.insertOne.mockResolvedValue({ insertedId: 'impact_123' });

      await billingManager.calculateRevenueImpact(change);

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyImpact: 70, // $99 - $29
          type: 'revenue_impact'
        })
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});