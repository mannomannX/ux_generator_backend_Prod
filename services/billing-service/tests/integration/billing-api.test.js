// ==========================================
// BILLING SERVICE - Integration Tests
// ==========================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { MongoClient } from 'mongodb';
import Redis from 'redis';
import { 
  testUsers,
  testSubscriptions,
  testPlans,
  mockStripeResponses 
} from '../fixtures/test-data.js';

describe('Billing Service API Integration', () => {
  let app;
  let mongoClient;
  let redisClient;
  let server;
  let authToken;

  beforeAll(async () => {
    // Setup test database connections
    const mongoUri = process.env.MONGO_TEST_URI || 'mongodb://localhost:27017/billing_test';
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();

    // Setup Redis test connection
    redisClient = Redis.createClient({
      url: process.env.REDIS_TEST_URL || 'redis://localhost:6379'
    });
    await redisClient.connect();

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      if (req.headers.authorization) {
        req.user = testUsers.proUser;
      }
      next();
    });

    // Setup test routes
    const billingRoutes = await import('../../src/routes/billing.js');
    const subscriptionRoutes = await import('../../src/routes/subscriptions.js');
    const creditsRoutes = await import('../../src/routes/credits.js');

    app.use('/api/v1/billing', billingRoutes.default);
    app.use('/api/v1/subscriptions', subscriptionRoutes.default);
    app.use('/api/v1/credits', creditsRoutes.default);

    // Start server
    server = app.listen(0); // Random port
    authToken = 'Bearer test_token_123';
  });

  afterAll(async () => {
    // Cleanup
    await mongoClient.close();
    await redisClient.quit();
    server.close();
  });

  beforeEach(async () => {
    // Clear test collections
    const db = mongoClient.db();
    await db.collection('billing_customers').deleteMany({});
    await db.collection('subscriptions').deleteMany({});
    await db.collection('credit_balances').deleteMany({});
    await db.collection('transactions').deleteMany({});
    
    // Clear Redis cache
    await redisClient.flushAll();
  });

  describe('GET /api/v1/billing/overview', () => {
    it('should return billing overview for authenticated user', async () => {
      // Setup test data
      const db = mongoClient.db();
      await db.collection('subscriptions').insertOne(testSubscriptions.proSubscription);
      await db.collection('credit_balances').insertOne({
        workspaceId: testUsers.proUser.workspaceId,
        balance: 1500,
        monthlyCredits: 2000,
        additionalCredits: 500
      });

      const response = await request(app)
        .get('/api/v1/billing/overview')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        subscription: expect.objectContaining({
          planId: 'professional',
          status: 'active'
        }),
        credits: expect.objectContaining({
          balance: 1500
        })
      });
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/v1/billing/overview');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/billing/plans', () => {
    it('should return available plans', async () => {
      const response = await request(app)
        .get('/api/v1/billing/plans');

      expect(response.status).toBe(200);
      expect(response.body.plans).toBeInstanceOf(Array);
      expect(response.body.plans).toHaveLength(4);
      expect(response.body.plans[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        price: expect.any(Number),
        credits: expect.any(Number),
        features: expect.any(Array)
      });
    });
  });

  describe('POST /api/v1/billing/portal', () => {
    it('should create customer portal session', async () => {
      // Mock Stripe service
      app.locals.stripeService = {
        createPortalSession: jest.fn().mockResolvedValue(mockStripeResponses.createPortalSession)
      };

      const response = await request(app)
        .post('/api/v1/billing/portal')
        .set('Authorization', authToken)
        .send({
          returnUrl: 'https://app.example.com/billing'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        url: expect.stringContaining('billing.stripe.com'),
        sessionId: expect.any(String)
      });
    });
  });

  describe('GET /api/v1/billing/invoices', () => {
    it('should return paginated invoices', async () => {
      // Setup test invoices
      const db = mongoClient.db();
      await db.collection('invoices').insertMany([
        { workspaceId: testUsers.proUser.workspaceId, amount: 9900, status: 'paid' },
        { workspaceId: testUsers.proUser.workspaceId, amount: 9900, status: 'paid' }
      ]);

      const response = await request(app)
        .get('/api/v1/billing/invoices')
        .set('Authorization', authToken)
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.invoices).toBeInstanceOf(Array);
      expect(response.body.invoices).toHaveLength(2);
    });
  });

  describe('GET /api/v1/billing/payment-methods', () => {
    it('should return user payment methods', async () => {
      // Mock Stripe service
      app.locals.stripeService = {
        listPaymentMethods: jest.fn().mockResolvedValue(mockStripeResponses.listPaymentMethods)
      };

      const response = await request(app)
        .get('/api/v1/billing/payment-methods')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body.paymentMethods).toBeInstanceOf(Array);
      expect(response.body.paymentMethods[0]).toMatchObject({
        id: expect.any(String),
        type: 'card',
        card: expect.objectContaining({
          brand: expect.any(String),
          last4: expect.any(String)
        })
      });
    });
  });

  describe('POST /api/v1/billing/payment-methods', () => {
    it('should add new payment method', async () => {
      // Mock Stripe service
      app.locals.stripeService = {
        attachPaymentMethod: jest.fn().mockResolvedValue(mockStripeResponses.attachPaymentMethod)
      };

      const response = await request(app)
        .post('/api/v1/billing/payment-methods')
        .set('Authorization', authToken)
        .send({
          paymentMethodId: 'pm_test_123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        paymentMethod: expect.objectContaining({
          id: 'pm_test_123'
        })
      });
    });

    it('should return 400 for missing payment method ID', async () => {
      const response = await request(app)
        .post('/api/v1/billing/payment-methods')
        .set('Authorization', authToken)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Payment method ID is required');
    });
  });

  describe('GET /api/v1/billing/usage', () => {
    it('should return usage statistics', async () => {
      // Setup usage data
      const db = mongoClient.db();
      await db.collection('credit_transactions').insertMany([
        {
          workspaceId: testUsers.proUser.workspaceId,
          type: 'consumption',
          amount: -50,
          reason: 'AI generation',
          createdAt: new Date()
        },
        {
          workspaceId: testUsers.proUser.workspaceId,
          type: 'consumption',
          amount: -30,
          reason: 'Document processing',
          createdAt: new Date()
        }
      ]);

      const response = await request(app)
        .get('/api/v1/billing/usage')
        .set('Authorization', authToken)
        .query({ period: 'month' });

      expect(response.status).toBe(200);
      expect(response.body.usage).toMatchObject({
        period: 'month',
        totalConsumed: expect.any(Number)
      });
    });
  });

  describe('GET /api/v1/billing/transactions', () => {
    it('should return credit transaction history', async () => {
      // Setup transactions
      const db = mongoClient.db();
      await db.collection('credit_transactions').insertMany([
        {
          workspaceId: testUsers.proUser.workspaceId,
          type: 'purchase',
          amount: 1000,
          createdAt: new Date()
        },
        {
          workspaceId: testUsers.proUser.workspaceId,
          type: 'consumption',
          amount: -50,
          createdAt: new Date()
        }
      ]);

      const response = await request(app)
        .get('/api/v1/billing/transactions')
        .set('Authorization', authToken)
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.transactions).toBeInstanceOf(Array);
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body).toMatchObject({
        total: 2,
        limit: 10,
        offset: 0
      });
    });

    it('should filter transactions by date range', async () => {
      const response = await request(app)
        .get('/api/v1/billing/transactions')
        .set('Authorization', authToken)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

      expect(response.status).toBe(200);
      expect(response.body.transactions).toBeInstanceOf(Array);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on payment endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array(6).fill().map(() =>
        request(app)
          .post('/api/v1/billing/payment-methods')
          .set('Authorization', authToken)
          .send({ paymentMethodId: 'pm_test_123' })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body).toMatchObject({
        error: 'PAYMENT_RATE_LIMIT',
        message: expect.stringContaining('Too many payment attempts')
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Disconnect database to simulate error
      await mongoClient.close();

      const response = await request(app)
        .get('/api/v1/billing/overview')
        .set('Authorization', authToken);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        error: 'DATABASE_ERROR',
        message: 'Database operation failed'
      });

      // Reconnect for other tests
      await mongoClient.connect();
    });

    it('should handle Stripe API errors', async () => {
      app.locals.stripeService = {
        createCheckoutSession: jest.fn().mockRejectedValue({
          type: 'StripeCardError',
          message: 'Card declined'
        })
      };

      const response = await request(app)
        .post('/api/v1/subscriptions/checkout')
        .set('Authorization', authToken)
        .send({
          planId: 'professional',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel'
        });

      expect(response.status).toBe(402);
      expect(response.body).toMatchObject({
        error: 'STRIPE_ERROR',
        message: 'Card declined'
      });
    });
  });
});