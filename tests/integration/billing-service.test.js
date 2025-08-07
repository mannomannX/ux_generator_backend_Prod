// ==========================================
// TESTS/INTEGRATION/billing-service.test.js
// ==========================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { MongoClient } from 'mongodb';
import Redis from 'redis';
import Stripe from 'stripe';
import app from '../../services/billing-service/src/server.js';

// Mock Stripe
jest.mock('stripe');

describe('Billing Service Integration Tests', () => {
  let mongoClient;
  let redisClient;
  let stripeMock;
  let authToken;
  let testWorkspaceId;
  let testUserId;

  beforeAll(async () => {
    // Setup test database connections
    mongoClient = new MongoClient(process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/test_billing');
    await mongoClient.connect();
    
    redisClient = Redis.createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1'
    });
    await redisClient.connect();

    // Setup Stripe mock
    stripeMock = {
      customers: {
        create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
        list: jest.fn().mockResolvedValue({ data: [] }),
        update: jest.fn().mockResolvedValue({ id: 'cus_test123' })
      },
      subscriptions: {
        create: jest.fn().mockResolvedValue({ 
          id: 'sub_test123',
          status: 'active',
          items: { data: [{ id: 'si_test123' }] }
        }),
        retrieve: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
        update: jest.fn().mockResolvedValue({ id: 'sub_test123' }),
        cancel: jest.fn().mockResolvedValue({ id: 'sub_test123' })
      },
      paymentMethods: {
        attach: jest.fn().mockResolvedValue({ id: 'pm_test123' }),
        detach: jest.fn().mockResolvedValue({ id: 'pm_test123' }),
        list: jest.fn().mockResolvedValue({ data: [] })
      },
      webhooks: {
        constructEvent: jest.fn()
      }
    };
    
    Stripe.mockImplementation(() => stripeMock);

    // Create test user and workspace
    testUserId = 'test_user_123';
    testWorkspaceId = 'test_workspace_123';
    authToken = 'Bearer test_token_123';
  });

  afterAll(async () => {
    // Cleanup
    await mongoClient.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clear test data
    const db = mongoClient.db();
    await db.collection('billing').deleteMany({});
    await db.collection('subscriptions').deleteMany({});
    await db.collection('credits').deleteMany({});
    await db.collection('invoices').deleteMany({});
  });

  describe('Subscription Management', () => {
    it('should create a new subscription', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          priceId: 'price_basic_monthly',
          paymentMethodId: 'pm_test123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('subscription');
      expect(response.body.subscription).toHaveProperty('id');
      expect(stripeMock.subscriptions.create).toHaveBeenCalled();
    });

    it('should update an existing subscription', async () => {
      const response = await request(app)
        .put('/api/v1/subscriptions/sub_test123')
        .set('Authorization', authToken)
        .send({
          priceId: 'price_pro_monthly'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subscription');
      expect(stripeMock.subscriptions.update).toHaveBeenCalled();
    });

    it('should cancel a subscription', async () => {
      const response = await request(app)
        .delete('/api/v1/subscriptions/sub_test123')
        .set('Authorization', authToken)
        .send({
          immediately: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Subscription cancelled');
      expect(stripeMock.subscriptions.cancel).toHaveBeenCalled();
    });

    it('should list workspace subscriptions', async () => {
      const response = await request(app)
        .get(`/api/v1/subscriptions?workspaceId=${testWorkspaceId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subscriptions');
      expect(Array.isArray(response.body.subscriptions)).toBe(true);
    });
  });

  describe('Credit Management', () => {
    it('should add credits to workspace', async () => {
      const response = await request(app)
        .post('/api/v1/credits/add')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          amount: 1000,
          description: 'Credit purchase'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('credits');
      expect(response.body.credits).toBeGreaterThanOrEqual(1000);
    });

    it('should deduct credits from workspace', async () => {
      // First add credits
      await request(app)
        .post('/api/v1/credits/add')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          amount: 1000
        });

      // Then deduct
      const response = await request(app)
        .post('/api/v1/credits/deduct')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          amount: 100,
          description: 'AI usage'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('credits');
      expect(response.body.credits).toBe(900);
    });

    it('should get credit balance', async () => {
      const response = await request(app)
        .get(`/api/v1/credits/balance?workspaceId=${testWorkspaceId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('balance');
      expect(typeof response.body.balance).toBe('number');
    });

    it('should fail to deduct more credits than available', async () => {
      const response = await request(app)
        .post('/api/v1/credits/deduct')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          amount: 10000
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Insufficient credits');
    });
  });

  describe('Payment Methods', () => {
    it('should add a payment method', async () => {
      const response = await request(app)
        .post('/api/v1/payment-methods')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          paymentMethodId: 'pm_test123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('paymentMethod');
      expect(stripeMock.paymentMethods.attach).toHaveBeenCalled();
    });

    it('should list payment methods', async () => {
      const response = await request(app)
        .get(`/api/v1/payment-methods?workspaceId=${testWorkspaceId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('paymentMethods');
      expect(Array.isArray(response.body.paymentMethods)).toBe(true);
    });

    it('should remove a payment method', async () => {
      const response = await request(app)
        .delete('/api/v1/payment-methods/pm_test123')
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Payment method removed');
      expect(stripeMock.paymentMethods.detach).toHaveBeenCalled();
    });
  });

  describe('Webhooks', () => {
    it('should handle subscription created webhook', async () => {
      const webhookPayload = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            metadata: { workspaceId: testWorkspaceId }
          }
        }
      };

      stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('Stripe-Signature', 'test_signature')
        .send(webhookPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received', true);
    });

    it('should handle payment succeeded webhook', async () => {
      const webhookPayload = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test123',
            customer: 'cus_test123',
            amount_paid: 2900,
            subscription: 'sub_test123'
          }
        }
      };

      stripeMock.webhooks.constructEvent.mockReturnValue(webhookPayload);

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('Stripe-Signature', 'test_signature')
        .send(webhookPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received', true);
    });

    it('should reject webhook with invalid signature', async () => {
      stripeMock.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/webhooks/stripe')
        .set('Stripe-Signature', 'invalid_signature')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid webhook signature');
    });
  });

  describe('Billing Statistics', () => {
    it('should get billing statistics', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/statistics?workspaceId=${testWorkspaceId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('statistics');
      expect(response.body.statistics).toHaveProperty('plan');
      expect(response.body.statistics).toHaveProperty('totalSpent');
      expect(response.body.statistics).toHaveProperty('creditStats');
    });

    it('should get invoice history', async () => {
      const response = await request(app)
        .get(`/api/v1/billing/invoices?workspaceId=${testWorkspaceId}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('invoices');
      expect(Array.isArray(response.body.invoices)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Make 101 requests (limit is 100 per minute)
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app)
            .get(`/api/v1/credits/balance?workspaceId=${testWorkspaceId}`)
            .set('Authorization', authToken)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);
      
      expect(rateLimited.length).toBeGreaterThan(0);
      expect(rateLimited[0].body).toHaveProperty('error', 'Too many requests');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authentication', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    it('should handle invalid workspace ID', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions?workspaceId=invalid')
        .set('Authorization', authToken);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid workspace ID');
    });

    it('should handle Stripe API errors', async () => {
      stripeMock.subscriptions.create.mockRejectedValue(new Error('Stripe API error'));

      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set('Authorization', authToken)
        .send({
          workspaceId: testWorkspaceId,
          priceId: 'price_basic_monthly'
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body.dependencies).toHaveProperty('mongodb');
      expect(response.body.dependencies).toHaveProperty('redis');
      expect(response.body.dependencies).toHaveProperty('stripe');
    });
  });
});