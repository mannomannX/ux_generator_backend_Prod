// ==========================================
// SERVICES/BILLING-SERVICE/src/events/event-handlers.js
// ==========================================

import { EventEmitter } from 'events';

export class EventHandlers extends EventEmitter {
  constructor(logger, eventEmitter, billingManager, creditManager, subscriptionManager) {
    super();
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.billingManager = billingManager;
    this.creditManager = creditManager;
    this.subscriptionManager = subscriptionManager;
    
    // Track registered handlers
    this.handlers = new Map();
  }

  /**
   * Setup all event handlers
   */
  setupAllHandlers() {
    this.setupUserEvents();
    this.setupWorkspaceEvents();
    this.setupSubscriptionEvents();
    this.setupPaymentEvents();
    this.setupCreditEvents();
    this.setupWebhookEvents();
    this.setupSystemEvents();
    
    this.logger.info('All billing event handlers registered', {
      handlerCount: this.handlers.size
    });
  }

  /**
   * Register an event handler
   */
  registerHandler(event, handler, description) {
    const wrappedHandler = async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        this.logger.error(`Error in event handler for ${event}`, error);
        this.emit('handler.error', { event, error });
      }
    };
    
    this.eventEmitter.on(event, wrappedHandler);
    this.handlers.set(event, { handler: wrappedHandler, description });
    
    this.logger.debug(`Registered handler for ${event}`, { description });
  }

  /**
   * Setup user-related event handlers
   */
  setupUserEvents() {
    // User created - set up initial billing
    this.registerHandler('user.created', async (data) => {
      const { userId, email, name, workspaceId } = data;
      
      try {
        // Create Stripe customer
        const customerId = await this.billingManager.ensureStripeCustomer(
          workspaceId,
          email,
          name
        );
        
        // Initialize free tier credits
        await this.creditManager.initializeCredits(workspaceId, userId, 'free');
        
        // Send welcome email with billing info
        await this.billingManager.sendWelcomeEmail(workspaceId, {
          email,
          name,
          plan: 'free',
          credits: 100
        });
        
        this.logger.info('User billing initialized', {
          userId,
          workspaceId,
          customerId
        });
        
      } catch (error) {
        this.logger.error('Failed to initialize user billing', error);
        throw error;
      }
    }, 'Initialize billing for new user');

    // User deleted - clean up billing
    this.registerHandler('user.deleted', async (data) => {
      const { userId, workspaceId } = data;
      
      try {
        // Cancel any active subscriptions
        await this.subscriptionManager.cancelAllSubscriptions(workspaceId);
        
        // Clear remaining credits
        await this.creditManager.clearCredits(workspaceId);
        
        // Archive billing records
        await this.billingManager.archiveBillingData(workspaceId);
        
        this.logger.info('User billing cleaned up', {
          userId,
          workspaceId
        });
        
      } catch (error) {
        this.logger.error('Failed to clean up user billing', error);
      }
    }, 'Clean up billing for deleted user');

    // User upgraded plan
    this.registerHandler('user.plan.upgraded', async (data) => {
      const { userId, workspaceId, oldPlan, newPlan, priceId } = data;
      
      try {
        // Update subscription
        await this.subscriptionManager.upgradePlan(workspaceId, priceId);
        
        // Add bonus credits for upgrade
        const bonusCredits = this.calculateUpgradeBonus(oldPlan, newPlan);
        if (bonusCredits > 0) {
          await this.creditManager.addCredits(workspaceId, bonusCredits, {
            type: 'upgrade_bonus',
            description: `Upgrade from ${oldPlan} to ${newPlan}`
          });
        }
        
        // Send upgrade confirmation
        await this.billingManager.sendUpgradeConfirmation(workspaceId, {
          oldPlan,
          newPlan,
          bonusCredits
        });
        
        this.emit('subscription.upgraded', {
          workspaceId,
          userId,
          oldPlan,
          newPlan
        });
        
      } catch (error) {
        this.logger.error('Failed to upgrade user plan', error);
        throw error;
      }
    }, 'Handle user plan upgrade');
  }

  /**
   * Setup workspace-related event handlers
   */
  setupWorkspaceEvents() {
    // Workspace created
    this.registerHandler('workspace.created', async (data) => {
      const { workspaceId, ownerId, name, plan = 'free' } = data;
      
      try {
        // Initialize workspace billing
        await this.billingManager.initializeWorkspaceBilling(workspaceId, {
          ownerId,
          name,
          plan,
          createdAt: new Date()
        });
        
        // Set up initial credits based on plan
        const initialCredits = this.getInitialCredits(plan);
        await this.creditManager.initializeCredits(workspaceId, ownerId, plan, initialCredits);
        
        this.logger.info('Workspace billing initialized', {
          workspaceId,
          plan,
          initialCredits
        });
        
      } catch (error) {
        this.logger.error('Failed to initialize workspace billing', error);
      }
    }, 'Initialize billing for new workspace');

    // Workspace member added
    this.registerHandler('workspace.member.added', async (data) => {
      const { workspaceId, userId, role } = data;
      
      try {
        // Check if workspace has enough seats
        const canAddMember = await this.subscriptionManager.checkSeatAvailability(workspaceId);
        
        if (!canAddMember) {
          // Notify about seat limit
          await this.billingManager.sendSeatLimitNotification(workspaceId);
          
          this.emit('workspace.seat.limit.reached', {
            workspaceId,
            userId
          });
        }
        
        // Update seat count
        await this.subscriptionManager.updateSeatCount(workspaceId, 1);
        
      } catch (error) {
        this.logger.error('Failed to handle member addition', error);
      }
    }, 'Handle workspace member addition for billing');

    // Workspace member removed
    this.registerHandler('workspace.member.removed', async (data) => {
      const { workspaceId, userId } = data;
      
      try {
        // Update seat count
        await this.subscriptionManager.updateSeatCount(workspaceId, -1);
        
        // Remove user-specific credits
        await this.creditManager.removeUserCredits(workspaceId, userId);
        
      } catch (error) {
        this.logger.error('Failed to handle member removal', error);
      }
    }, 'Handle workspace member removal for billing');
  }

  /**
   * Setup subscription-related event handlers
   */
  setupSubscriptionEvents() {
    // Subscription created
    this.registerHandler('subscription.created', async (data) => {
      const { subscriptionId, workspaceId, plan, status } = data;
      
      try {
        // Update workspace billing status
        await this.billingManager.updateWorkspaceSubscription(workspaceId, {
          subscriptionId,
          plan,
          status,
          startedAt: new Date()
        });
        
        // Grant plan credits
        const credits = this.getPlanCredits(plan);
        await this.creditManager.addCredits(workspaceId, credits, {
          type: 'subscription',
          description: `${plan} plan subscription`
        });
        
        // Send confirmation email
        await this.billingManager.sendSubscriptionConfirmation(workspaceId, {
          plan,
          credits,
          status
        });
        
      } catch (error) {
        this.logger.error('Failed to handle subscription creation', error);
      }
    }, 'Handle new subscription creation');

    // Subscription updated
    this.registerHandler('subscription.updated', async (data) => {
      const { subscriptionId, workspaceId, changes } = data;
      
      try {
        // Update workspace billing
        await this.billingManager.updateWorkspaceSubscription(workspaceId, changes);
        
        // Handle plan changes
        if (changes.plan) {
          const creditDifference = this.calculateCreditDifference(
            changes.oldPlan,
            changes.plan
          );
          
          if (creditDifference !== 0) {
            await this.creditManager.adjustCredits(workspaceId, creditDifference, {
              type: 'plan_change',
              description: `Plan changed from ${changes.oldPlan} to ${changes.plan}`
            });
          }
        }
        
      } catch (error) {
        this.logger.error('Failed to handle subscription update', error);
      }
    }, 'Handle subscription updates');

    // Subscription cancelled
    this.registerHandler('subscription.cancelled', async (data) => {
      const { subscriptionId, workspaceId, cancelAt, immediately } = data;
      
      try {
        // Update workspace billing status
        await this.billingManager.updateWorkspaceSubscription(workspaceId, {
          status: immediately ? 'cancelled' : 'cancelling',
          cancelAt
        });
        
        if (immediately) {
          // Remove remaining credits
          await this.creditManager.expireCredits(workspaceId);
          
          // Downgrade to free plan
          await this.subscriptionManager.downgradeToFree(workspaceId);
        }
        
        // Send cancellation confirmation
        await this.billingManager.sendCancellationConfirmation(workspaceId, {
          cancelAt,
          immediately
        });
        
      } catch (error) {
        this.logger.error('Failed to handle subscription cancellation', error);
      }
    }, 'Handle subscription cancellation');

    // Trial ending
    this.registerHandler('subscription.trial.ending', async (data) => {
      const { workspaceId, trialEndsAt, daysRemaining } = data;
      
      try {
        // Send trial ending notification
        await this.billingManager.sendTrialEndingNotification(workspaceId, {
          trialEndsAt,
          daysRemaining
        });
        
        // Create special offer for conversion
        if (daysRemaining <= 3) {
          await this.subscriptionManager.createTrialConversionOffer(workspaceId);
        }
        
      } catch (error) {
        this.logger.error('Failed to handle trial ending', error);
      }
    }, 'Handle trial ending notifications');
  }

  /**
   * Setup payment-related event handlers
   */
  setupPaymentEvents() {
    // Payment succeeded
    this.registerHandler('payment.succeeded', async (data) => {
      const { paymentIntentId, workspaceId, amount, currency } = data;
      
      try {
        // Record payment
        await this.billingManager.recordPayment(workspaceId, {
          paymentIntentId,
          amount,
          currency,
          status: 'succeeded',
          paidAt: new Date()
        });
        
        // Add credits if it's a credit purchase
        if (data.metadata?.creditPurchase) {
          const credits = this.calculateCreditsFromAmount(amount);
          await this.creditManager.addCredits(workspaceId, credits, {
            type: 'purchase',
            description: `Purchased ${credits} credits`,
            paymentIntentId
          });
        }
        
        // Send payment receipt
        await this.billingManager.sendPaymentReceipt(workspaceId, {
          amount,
          currency,
          paymentIntentId
        });
        
      } catch (error) {
        this.logger.error('Failed to handle payment success', error);
      }
    }, 'Handle successful payment');

    // Payment failed
    this.registerHandler('payment.failed', async (data) => {
      const { paymentIntentId, workspaceId, error, attemptCount } = data;
      
      try {
        // Record failed payment
        await this.billingManager.recordPayment(workspaceId, {
          paymentIntentId,
          status: 'failed',
          error: error.message,
          failedAt: new Date()
        });
        
        // Send payment failed notification
        await this.billingManager.sendPaymentFailedNotification(workspaceId, {
          error: error.message,
          attemptCount
        });
        
        // Handle subscription suspension after multiple failures
        if (attemptCount >= 3) {
          await this.subscriptionManager.suspendSubscription(workspaceId);
          
          this.emit('subscription.suspended', {
            workspaceId,
            reason: 'payment_failure'
          });
        }
        
      } catch (error) {
        this.logger.error('Failed to handle payment failure', error);
      }
    }, 'Handle failed payment');

    // Refund processed
    this.registerHandler('payment.refunded', async (data) => {
      const { refundId, workspaceId, amount, reason } = data;
      
      try {
        // Record refund
        await this.billingManager.recordRefund(workspaceId, {
          refundId,
          amount,
          reason,
          refundedAt: new Date()
        });
        
        // Deduct credits if it was a credit purchase
        if (data.metadata?.creditPurchase) {
          const credits = this.calculateCreditsFromAmount(amount);
          await this.creditManager.deductCredits(workspaceId, credits, {
            type: 'refund',
            description: `Refunded ${credits} credits`,
            refundId
          });
        }
        
        // Send refund confirmation
        await this.billingManager.sendRefundConfirmation(workspaceId, {
          amount,
          reason
        });
        
      } catch (error) {
        this.logger.error('Failed to handle refund', error);
      }
    }, 'Handle payment refund');
  }

  /**
   * Setup credit-related event handlers
   */
  setupCreditEvents() {
    // Credits low
    this.registerHandler('credits.low', async (data) => {
      const { workspaceId, remaining, threshold } = data;
      
      try {
        // Send low credit warning
        await this.billingManager.sendLowCreditWarning(workspaceId, {
          remaining,
          threshold
        });
        
        // Create credit purchase offer
        await this.creditManager.createCreditOffer(workspaceId, {
          type: 'low_balance',
          discount: 10
        });
        
      } catch (error) {
        this.logger.error('Failed to handle low credits', error);
      }
    }, 'Handle low credit balance');

    // Credits exhausted
    this.registerHandler('credits.exhausted', async (data) => {
      const { workspaceId, userId } = data;
      
      try {
        // Send credits exhausted notification
        await this.billingManager.sendCreditsExhaustedNotification(workspaceId);
        
        // Restrict AI features
        this.emit('ai.features.restricted', {
          workspaceId,
          reason: 'credits_exhausted'
        });
        
        // Create urgent credit purchase offer
        await this.creditManager.createCreditOffer(workspaceId, {
          type: 'exhausted',
          discount: 15,
          urgent: true
        });
        
      } catch (error) {
        this.logger.error('Failed to handle exhausted credits', error);
      }
    }, 'Handle exhausted credit balance');

    // Credits expiring
    this.registerHandler('credits.expiring', async (data) => {
      const { workspaceId, expiringCredits, expiryDate } = data;
      
      try {
        // Send expiry warning
        await this.billingManager.sendCreditExpiryWarning(workspaceId, {
          expiringCredits,
          expiryDate
        });
        
      } catch (error) {
        this.logger.error('Failed to handle credit expiry', error);
      }
    }, 'Handle expiring credits');
  }

  /**
   * Setup webhook event handlers
   */
  setupWebhookEvents() {
    // Stripe webhook received
    this.registerHandler('webhook.stripe.received', async (data) => {
      const { event, raw } = data;
      
      try {
        // Process webhook based on event type
        switch (event.type) {
          case 'customer.subscription.created':
            await this.handleSubscriptionCreated(event.data.object);
            break;
            
          case 'customer.subscription.updated':
            await this.handleSubscriptionUpdated(event.data.object);
            break;
            
          case 'customer.subscription.deleted':
            await this.handleSubscriptionDeleted(event.data.object);
            break;
            
          case 'invoice.payment_succeeded':
            await this.handleInvoicePaymentSucceeded(event.data.object);
            break;
            
          case 'invoice.payment_failed':
            await this.handleInvoicePaymentFailed(event.data.object);
            break;
            
          case 'payment_intent.succeeded':
            await this.handlePaymentIntentSucceeded(event.data.object);
            break;
            
          case 'payment_intent.payment_failed':
            await this.handlePaymentIntentFailed(event.data.object);
            break;
            
          case 'charge.refunded':
            await this.handleChargeRefunded(event.data.object);
            break;
            
          default:
            this.logger.debug('Unhandled webhook event type', { type: event.type });
        }
        
        // Store webhook for audit
        await this.billingManager.storeWebhookEvent(event);
        
      } catch (error) {
        this.logger.error('Failed to process webhook', error);
        throw error; // Re-throw to send 500 to Stripe for retry
      }
    }, 'Process Stripe webhooks');
  }

  /**
   * Setup system event handlers
   */
  setupSystemEvents() {
    // Daily billing tasks
    this.registerHandler('system.billing.daily', async () => {
      try {
        // Check for expiring trials
        await this.subscriptionManager.checkExpiringTrials();
        
        // Check for expiring credits
        await this.creditManager.checkExpiringCredits();
        
        // Process usage-based billing
        await this.billingManager.processUsageBasedBilling();
        
        // Clean up old records
        await this.billingManager.cleanupOldRecords();
        
        this.logger.info('Daily billing tasks completed');
        
      } catch (error) {
        this.logger.error('Failed to run daily billing tasks', error);
      }
    }, 'Run daily billing tasks');

    // Monthly billing tasks
    this.registerHandler('system.billing.monthly', async () => {
      try {
        // Generate monthly reports
        await this.billingManager.generateMonthlyReports();
        
        // Process recurring charges
        await this.subscriptionManager.processRecurringCharges();
        
        // Update credit allocations
        await this.creditManager.allocateMonthlyCredits();
        
        this.logger.info('Monthly billing tasks completed');
        
      } catch (error) {
        this.logger.error('Failed to run monthly billing tasks', error);
      }
    }, 'Run monthly billing tasks');
  }

  /**
   * Webhook handler methods
   */
  async handleSubscriptionCreated(subscription) {
    const workspaceId = subscription.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('subscription.created', {
      subscriptionId: subscription.id,
      workspaceId,
      plan: subscription.items.data[0]?.price?.metadata?.plan || 'basic',
      status: subscription.status
    });
  }

  async handleSubscriptionUpdated(subscription) {
    const workspaceId = subscription.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('subscription.updated', {
      subscriptionId: subscription.id,
      workspaceId,
      changes: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      }
    });
  }

  async handleSubscriptionDeleted(subscription) {
    const workspaceId = subscription.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('subscription.cancelled', {
      subscriptionId: subscription.id,
      workspaceId,
      immediately: true
    });
  }

  async handleInvoicePaymentSucceeded(invoice) {
    const workspaceId = invoice.subscription_details?.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('payment.succeeded', {
      paymentIntentId: invoice.payment_intent,
      workspaceId,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency
    });
  }

  async handleInvoicePaymentFailed(invoice) {
    const workspaceId = invoice.subscription_details?.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('payment.failed', {
      paymentIntentId: invoice.payment_intent,
      workspaceId,
      error: { message: 'Invoice payment failed' },
      attemptCount: invoice.attempt_count
    });
  }

  async handlePaymentIntentSucceeded(paymentIntent) {
    const workspaceId = paymentIntent.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('payment.succeeded', {
      paymentIntentId: paymentIntent.id,
      workspaceId,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata
    });
  }

  async handlePaymentIntentFailed(paymentIntent) {
    const workspaceId = paymentIntent.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('payment.failed', {
      paymentIntentId: paymentIntent.id,
      workspaceId,
      error: paymentIntent.last_payment_error,
      attemptCount: 1
    });
  }

  async handleChargeRefunded(charge) {
    const workspaceId = charge.metadata?.workspaceId;
    if (!workspaceId) return;
    
    await this.emit('payment.refunded', {
      refundId: charge.refunds.data[0]?.id,
      workspaceId,
      amount: charge.amount_refunded / 100,
      reason: charge.refunds.data[0]?.reason,
      metadata: charge.metadata
    });
  }

  /**
   * Helper methods
   */
  calculateUpgradeBonus(oldPlan, newPlan) {
    const bonusMap = {
      'free-basic': 100,
      'free-pro': 500,
      'free-enterprise': 1000,
      'basic-pro': 250,
      'basic-enterprise': 750,
      'pro-enterprise': 500
    };
    
    return bonusMap[`${oldPlan}-${newPlan}`] || 0;
  }

  getInitialCredits(plan) {
    const creditMap = {
      free: 100,
      basic: 500,
      pro: 2000,
      enterprise: 10000
    };
    
    return creditMap[plan] || 100;
  }

  getPlanCredits(plan) {
    const creditMap = {
      free: 100,
      basic: 1000,
      pro: 5000,
      enterprise: 20000
    };
    
    return creditMap[plan] || 100;
  }

  calculateCreditDifference(oldPlan, newPlan) {
    return this.getPlanCredits(newPlan) - this.getPlanCredits(oldPlan);
  }

  calculateCreditsFromAmount(amount) {
    // $1 = 100 credits
    return Math.floor(amount * 100);
  }

  /**
   * Cleanup handlers
   */
  removeAllHandlers() {
    for (const [event, { handler }] of this.handlers) {
      this.eventEmitter.removeListener(event, handler);
    }
    
    this.handlers.clear();
    this.logger.info('All billing event handlers removed');
  }
}