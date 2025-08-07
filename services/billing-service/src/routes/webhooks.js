// ==========================================
// BILLING SERVICE - Stripe Webhooks Routes
// ==========================================

import express from 'express';
import { WebhookHandler } from '../services/webhook-handler.js';

const router = express.Router();

// Stripe webhook endpoint
// Note: This needs to be before any JSON body parsing middleware
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    req.app.locals.logger?.error('Stripe webhook secret not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    req.app.locals.logger?.error('Webhook signature verification failed', {
      error: err.message,
      signature: sig
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Initialize webhook handler
  const webhookHandler = new WebhookHandler({
    logger: req.app.locals.logger,
    mongoClient: req.app.locals.mongoClient,
    redisClient: req.app.locals.redisClient,
    eventBus: req.app.locals.eventBus
  });

  try {
    await webhookHandler.handleEvent(event);
    
    req.app.locals.logger?.info('Stripe webhook processed successfully', {
      eventId: event.id,
      eventType: event.type,
      timestamp: new Date().toISOString()
    });

    res.json({ received: true });
  } catch (error) {
    req.app.locals.logger?.error('Webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error: error.message,
      stack: error.stack
    });

    // Return appropriate status based on error type
    // Critical errors should trigger Stripe retry
    if (error.name === 'SystemError' || error.name === 'DatabaseError' || error.critical) {
      res.status(500).json({ 
        error: 'System error processing webhook',
        received: false 
      });
    } else {
      // Non-critical errors shouldn't trigger retry
      res.status(200).json({ 
        received: true, 
        warning: 'Processed with warnings',
        // Don't expose internal error details
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// Health check for webhook endpoint
router.get('/stripe/health', (req, res) => {
  res.json({
    endpoint: 'webhooks/stripe',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    configuration: {
      webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
      stripe_key_configured: !!process.env.STRIPE_SECRET_KEY
    }
  });
});

// Manual webhook reprocessing (admin only)
router.post('/stripe/reprocess/:eventId', async (req, res) => {
  const { eventId } = req.params;

  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = await stripe.events.retrieve(eventId);

    const webhookHandler = new WebhookHandler({
      logger: req.app.locals.logger,
      mongoClient: req.app.locals.mongoClient,
      redisClient: req.app.locals.redisClient,
      eventBus: req.app.locals.eventBus
    });

    await webhookHandler.handleEvent(event);

    req.app.locals.logger?.info('Stripe webhook reprocessed manually', {
      eventId,
      eventType: event.type,
      adminUserId: req.user.userId,
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Webhook reprocessed successfully',
      eventId,
      eventType: event.type
    });
  } catch (error) {
    req.app.locals.logger?.error('Manual webhook reprocessing failed', {
      eventId,
      error: error.message,
      adminUserId: req.user.userId
    });

    res.status(500).json({ 
      success: false, 
      error: 'Reprocessing failed',
      message: error.message 
    });
  }
});

// Get webhook processing logs (admin only)
router.get('/logs', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { page = 1, limit = 50, eventType, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const db = req.app.locals.mongoClient.getDb();
    const logsCollection = db.collection('webhook_logs');

    const query = {};
    if (eventType) query.eventType = eventType;
    if (status) query.status = status;

    const [logs, totalCount] = await Promise.all([
      logsCollection
        .find(query)
        .sort({ processedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      logsCollection.countDocuments(query)
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    req.app.locals.logger?.error('Failed to retrieve webhook logs', {
      error: error.message,
      adminUserId: req.user.userId
    });

    res.status(500).json({ 
      error: 'Failed to retrieve logs',
      message: error.message 
    });
  }
});

export default router;