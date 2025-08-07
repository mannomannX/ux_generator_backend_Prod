// ==========================================
// SERVICES/BILLING-SERVICE/src/services/webhook-handler.js
// ==========================================

export class WebhookHandler {
  constructor(logger, stripeService, billingManager, subscriptionManager, creditManager, redisClient) {
    this.logger = logger;
    this.stripeService = stripeService;
    this.billingManager = billingManager;
    this.subscriptionManager = subscriptionManager;
    this.creditManager = creditManager;
    this.redisClient = redisClient;
    
    // SECURITY FIX: Idempotency tracking
    this.processedEvents = new Set();
    this.maxEventAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Event handlers mapping
    this.eventHandlers = {
      'customer.subscription.created': this.handleSubscriptionCreated.bind(this),
      'customer.subscription.updated': this.handleSubscriptionUpdated.bind(this),
      'customer.subscription.deleted': this.handleSubscriptionDeleted.bind(this),
      'invoice.payment_succeeded': this.handlePaymentSucceeded.bind(this),
      'invoice.payment_failed': this.handlePaymentFailed.bind(this),
      'customer.subscription.trial_will_end': this.handleTrialWillEnd.bind(this),
      'payment_intent.succeeded': this.handlePaymentIntentSucceeded.bind(this),
      'payment_intent.payment_failed': this.handlePaymentIntentFailed.bind(this),
      'checkout.session.completed': this.handleCheckoutCompleted.bind(this),
      'customer.created': this.handleCustomerCreated.bind(this),
      'customer.deleted': this.handleCustomerDeleted.bind(this),
    };
  }

  /**
   * SECURITY FIX: Enhanced webhook processing with idempotency
   */
  async processWebhook(rawBody, signature) {
    let event;
    try {
      // Verify webhook signature
      event = this.stripeService.verifyWebhookSignature(rawBody, signature);
      
      // SECURITY FIX: Check for duplicate/replay events
      const isDuplicate = await this.checkIdempotency(event.id);
      if (isDuplicate) {
        this.logger.info('Duplicate webhook event ignored', { 
          type: event.type, 
          id: event.id 
        });
        return { received: true, duplicate: true };
      }
      
      this.logger.info('Processing webhook event', { 
        type: event.type, 
        id: event.id 
      });

      // Check if we have a handler for this event
      const handler = this.eventHandlers[event.type];
      
      if (handler) {
        // SECURITY FIX: Process with distributed locking for critical events
        const isCriticalEvent = this.isCriticalEvent(event.type);
        
        if (isCriticalEvent) {
          await this.processWithLocking(event, handler);
        } else {
          await handler(event);
        }
        
        // Mark event as processed
        await this.markEventProcessed(event.id);
        
        this.logger.info('Webhook processed successfully', { 
          type: event.type,
          id: event.id 
        });
      } else {
        this.logger.info('No handler for webhook event', { 
          type: event.type 
        });
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Webhook processing failed', {
        error: error.message,
        eventId: event?.id,
        eventType: event?.type
      });
      throw error;
    }
  }

  /**
   * SECURITY FIX: Handle subscription created with atomic operations
   */
  async handleSubscriptionCreated(event) {
    const subscription = event.data.object;
    
    try {
      // Get workspace by customer ID
      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        subscription.customer
      );
      
      if (!workspace) {
        this.logger.warn('Workspace not found for customer', { 
          customerId: subscription.customer 
        });
        return;
      }
      
      const plan = this.getPlanFromPriceId(subscription.items.data[0].price.id);
      
      // SECURITY FIX: Perform atomic transaction for subscription + credits
      await this.executeAtomicOperation(async (session) => {
        // Update workspace with subscription info
        await this.billingManager.updateWorkspaceSubscription(workspace._id, {
          subscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          plan,
        }, session);

        // Grant initial credits if active
        if (subscription.status === 'active') {
          await this.creditManager.updateMonthlyCredits(workspace._id, plan, session);
        }
      });

      this.logger.info('Subscription created', { 
        workspaceId: workspace._id,
        subscriptionId: subscription.id,
        plan 
      });
    } catch (error) {
      this.logger.error('Failed to handle subscription created', error);
      throw error;
    }
  }

  /**
   * Handle subscription updated
   */
  async handleSubscriptionUpdated(event) {
    const subscription = event.data.object;
    const previousAttributes = event.data.previous_attributes;
    
    try {
      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        subscription.customer
      );
      
      if (!workspace) {
        return;
      }

      // Check if plan changed
      if (previousAttributes?.items) {
        const newPlan = this.getPlanFromPriceId(subscription.items.data[0].price.id);
        const oldPlan = workspace.billing?.plan;
        
        if (newPlan !== oldPlan) {
          // Update credit allocation for new plan
          await this.creditManager.updateMonthlyCredits(workspace._id, newPlan);
          
          this.logger.info('Plan changed', { 
            workspaceId: workspace._id,
            from: oldPlan,
            to: newPlan 
          });
        }
      }

      // Update subscription status
      await this.billingManager.updateWorkspaceSubscription(workspace._id, {
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });

    } catch (error) {
      this.logger.error('Failed to handle subscription updated', error);
      throw error;
    }
  }

  /**
   * Handle subscription deleted
   */
  async handleSubscriptionDeleted(event) {
    const subscription = event.data.object;
    
    try {
      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        subscription.customer
      );
      
      if (!workspace) {
        return;
      }

      // Downgrade to free plan
      await this.billingManager.updateWorkspaceSubscription(workspace._id, {
        subscriptionId: null,
        status: 'cancelled',
        plan: 'free',
      });

      // Reset to free plan credits
      await this.creditManager.updateMonthlyCredits(workspace._id, 'free');

      this.logger.info('Subscription cancelled', { 
        workspaceId: workspace._id,
        subscriptionId: subscription.id 
      });
    } catch (error) {
      this.logger.error('Failed to handle subscription deleted', error);
      throw error;
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSucceeded(event) {
    const invoice = event.data.object;
    
    try {
      // Skip if this is a $0 invoice (trial)
      if (invoice.amount_paid === 0) {
        return;
      }

      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        invoice.customer
      );
      
      if (!workspace) {
        return;
      }

      // Store invoice record
      await this.billingManager.createInvoiceRecord({
        workspaceId: workspace._id,
        stripeInvoiceId: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'paid',
        paidAt: new Date(invoice.status_transitions.paid_at * 1000),
        invoiceUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
      });

      // Check if this is a renewal (not first payment)
      const isRenewal = invoice.billing_reason === 'subscription_cycle';
      
      if (isRenewal) {
        // Refresh monthly credits on renewal
        await this.subscriptionManager.handleRenewal(invoice.subscription);
        
        this.logger.info('Subscription renewed', { 
          workspaceId: workspace._id,
          amount: invoice.amount_paid 
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle payment succeeded', error);
      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(event) {
    const invoice = event.data.object;
    
    try {
      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        invoice.customer
      );
      
      if (!workspace) {
        return;
      }

      // Update subscription status
      await this.billingManager.updateWorkspaceSubscription(workspace._id, {
        status: 'past_due',
      });

      // Send payment failed notification
      await this.billingManager.sendPaymentFailedNotification(workspace._id, {
        amount: invoice.amount_due,
        nextAttempt: invoice.next_payment_attempt 
          ? new Date(invoice.next_payment_attempt * 1000) 
          : null,
      });

      this.logger.warn('Payment failed', { 
        workspaceId: workspace._id,
        amount: invoice.amount_due 
      });
    } catch (error) {
      this.logger.error('Failed to handle payment failed', error);
      throw error;
    }
  }

  /**
   * Handle trial ending soon
   */
  async handleTrialWillEnd(event) {
    const subscription = event.data.object;
    
    try {
      const workspace = await this.billingManager.getWorkspaceByCustomerId(
        subscription.customer
      );
      
      if (!workspace) {
        return;
      }

      // Send trial ending notification
      await this.billingManager.sendTrialEndingNotification(workspace._id, {
        trialEnd: new Date(subscription.trial_end * 1000),
        plan: this.getPlanFromPriceId(subscription.items.data[0].price.id),
      });

      this.logger.info('Trial ending soon notification sent', { 
        workspaceId: workspace._id 
      });
    } catch (error) {
      this.logger.error('Failed to handle trial ending', error);
      throw error;
    }
  }

  /**
   * SECURITY FIX: Handle checkout session completed with race condition protection
   */
  async handleCheckoutCompleted(event) {
    const session = event.data.object;
    
    try {
      // Handle different checkout modes
      if (session.mode === 'subscription') {
        // Subscription checkout handled by subscription.created event
        this.logger.info('Subscription checkout completed', { 
          sessionId: session.id 
        });
      } else if (session.mode === 'payment') {
        // One-time payment (credit purchase)
        const metadata = session.metadata;
        
        if (metadata.type === 'credits') {
          const workspaceId = metadata.workspaceId;
          const creditAmount = parseInt(metadata.credits);
          
          // SECURITY FIX: Validate metadata
          if (!workspaceId || !creditAmount || creditAmount <= 0) {
            throw new Error('Invalid credit purchase metadata');
          }
          
          // SECURITY FIX: Use distributed locking for credit addition
          const lockKey = `credit_purchase_lock:${session.id}`;
          const lockToken = crypto.randomUUID();
          
          const lockAcquired = await this.creditManager.acquireLock(lockKey, lockToken, 10000);
          if (!lockAcquired) {
            throw new Error('Failed to acquire credit purchase lock');
          }
          
          try {
            // Add purchased credits atomically
            await this.creditManager.addCredits(
              workspaceId,
              creditAmount,
              'purchase',
              {
                sessionId: session.id,
                paymentIntentId: session.payment_intent,
                amount: session.amount_total,
                timestamp: new Date()
              }
            );

            this.logger.info('Credits purchased', { 
              workspaceId,
              credits: creditAmount,
              sessionId: session.id 
            });
          } finally {
            await this.creditManager.releaseLock(lockKey, lockToken);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to handle checkout completed', error);
      throw error;
    }
  }

  /**
   * Handle payment intent succeeded
   */
  async handlePaymentIntentSucceeded(event) {
    const paymentIntent = event.data.object;
    
    try {
      // Log successful payment
      this.logger.info('Payment intent succeeded', { 
        id: paymentIntent.id,
        amount: paymentIntent.amount 
      });
      
      // Additional handling if needed
    } catch (error) {
      this.logger.error('Failed to handle payment intent succeeded', error);
      throw error;
    }
  }

  /**
   * Handle payment intent failed
   */
  async handlePaymentIntentFailed(event) {
    const paymentIntent = event.data.object;
    
    try {
      this.logger.warn('Payment intent failed', { 
        id: paymentIntent.id,
        error: paymentIntent.last_payment_error 
      });
      
      // Additional handling if needed
    } catch (error) {
      this.logger.error('Failed to handle payment intent failed', error);
      throw error;
    }
  }

  /**
   * Handle customer created
   */
  async handleCustomerCreated(event) {
    const customer = event.data.object;
    
    try {
      this.logger.info('Stripe customer created', { 
        customerId: customer.id,
        email: customer.email 
      });
      
      // Additional handling if needed
    } catch (error) {
      this.logger.error('Failed to handle customer created', error);
      throw error;
    }
  }

  /**
   * Handle customer deleted
   */
  async handleCustomerDeleted(event) {
    const customer = event.data.object;
    
    try {
      this.logger.info('Stripe customer deleted', { 
        customerId: customer.id 
      });
      
      // Clean up workspace associations if needed
    } catch (error) {
      this.logger.error('Failed to handle customer deleted', error);
      throw error;
    }
  }

  /**
   * Get plan ID from Stripe price ID
   */
  getPlanFromPriceId(priceId) {
    const priceMapping = {
      [process.env.STRIPE_STARTER_PRICE_ID]: 'starter',
      [process.env.STRIPE_PRO_PRICE_ID]: 'professional',
      [process.env.STRIPE_ENTERPRISE_PRICE_ID]: 'enterprise',
    };
    
    return priceMapping[priceId] || 'free';
  }
  
  // SECURITY FIX: New security methods
  
  /**
   * Check if event has already been processed (idempotency)
   */
  async checkIdempotency(eventId) {\n    if (!this.redisClient) {\n      // Fallback to in-memory check\n      return this.processedEvents.has(eventId);\n    }\n    \n    try {\n      const exists = await this.redisClient.exists(`webhook_processed:${eventId}`);\n      return exists === 1;\n    } catch (error) {\n      this.logger.error('Idempotency check failed', error);\n      // Fallback to in-memory\n      return this.processedEvents.has(eventId);\n    }\n  }\n  \n  /**\n   * Mark event as processed\n   */\n  async markEventProcessed(eventId) {\n    if (!this.redisClient) {\n      // Fallback to in-memory tracking\n      this.processedEvents.add(eventId);\n      // Clean up old events periodically\n      if (this.processedEvents.size > 1000) {\n        this.processedEvents.clear();\n      }\n      return;\n    }\n    \n    try {\n      // Store in Redis with 24 hour expiry\n      await this.redisClient.setex(`webhook_processed:${eventId}`, 86400, Date.now());\n    } catch (error) {\n      this.logger.error('Failed to mark event as processed', error);\n      // Fallback to in-memory\n      this.processedEvents.add(eventId);\n    }\n  }\n  \n  /**\n   * Check if event type requires critical locking\n   */\n  isCriticalEvent(eventType) {\n    const criticalEvents = [\n      'customer.subscription.created',\n      'customer.subscription.updated',\n      'customer.subscription.deleted',\n      'invoice.payment_succeeded',\n      'checkout.session.completed'\n    ];\n    \n    return criticalEvents.includes(eventType);\n  }\n  \n  /**\n   * Process webhook with distributed locking\n   */\n  async processWithLocking(event, handler) {\n    const lockKey = `webhook_lock:${event.type}:${event.data.object.id || event.id}`;\n    const lockToken = crypto.randomUUID();\n    \n    // Try to acquire lock for 30 seconds\n    const lockAcquired = await this.acquireLock(lockKey, lockToken, 30000);\n    if (!lockAcquired) {\n      throw new Error(`Failed to acquire lock for webhook ${event.type}`);\n    }\n    \n    try {\n      await handler(event);\n    } finally {\n      await this.releaseLock(lockKey, lockToken);\n    }\n  }\n  \n  /**\n   * Acquire distributed lock\n   */\n  async acquireLock(key, token, ttlMs = 5000) {\n    if (!this.redisClient) return true; // Fallback if Redis not available\n    \n    try {\n      const result = await this.redisClient.set(\n        key,\n        token,\n        'PX', ttlMs,\n        'NX'\n      );\n      return result === 'OK';\n    } catch (error) {\n      this.logger.error('Failed to acquire lock', error);\n      return false;\n    }\n  }\n  \n  /**\n   * Release distributed lock\n   */\n  async releaseLock(key, token) {\n    if (!this.redisClient) return;\n    \n    try {\n      // Use Lua script for atomic check-and-delete\n      const script = `\n        if redis.call(\"get\", KEYS[1]) == ARGV[1] then\n          return redis.call(\"del\", KEYS[1])\n        else\n          return 0\n        end\n      `;\n      await this.redisClient.eval(script, 1, key, token);\n    } catch (error) {\n      this.logger.error('Failed to release lock', error);\n    }\n  }\n  \n  /**\n   * Execute operation within atomic MongoDB transaction\n   */\n  async executeAtomicOperation(operation) {\n    const session = this.billingManager.mongoClient.startSession();\n    \n    try {\n      session.startTransaction();\n      \n      await operation(session);\n      \n      await session.commitTransaction();\n    } catch (error) {\n      await session.abortTransaction();\n      throw error;\n    } finally {\n      session.endSession();\n    }\n  }\n}