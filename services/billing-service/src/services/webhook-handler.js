// ==========================================
// SERVICES/BILLING-SERVICE/src/services/webhook-handler.js
// ==========================================

export class WebhookHandler {
  constructor(logger, stripeService, billingManager, subscriptionManager, creditManager) {
    this.logger = logger;
    this.stripeService = stripeService;
    this.billingManager = billingManager;
    this.subscriptionManager = subscriptionManager;
    this.creditManager = creditManager;
    
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
   * Process incoming webhook
   */
  async processWebhook(rawBody, signature) {
    try {
      // Verify webhook signature
      const event = this.stripeService.verifyWebhookSignature(rawBody, signature);
      
      this.logger.info('Processing webhook event', { 
        type: event.type, 
        id: event.id 
      });

      // Check if we have a handler for this event
      const handler = this.eventHandlers[event.type];
      
      if (handler) {
        await handler(event);
        this.logger.info('Webhook processed successfully', { 
          type: event.type 
        });
      } else {
        this.logger.info('No handler for webhook event', { 
          type: event.type 
        });
      }

      return { received: true };
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      throw error;
    }
  }

  /**
   * Handle subscription created
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

      // Update workspace with subscription info
      await this.billingManager.updateWorkspaceSubscription(workspace._id, {
        subscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        plan: this.getPlanFromPriceId(subscription.items.data[0].price.id),
      });

      // Grant initial credits if active
      if (subscription.status === 'active') {
        const plan = this.getPlanFromPriceId(subscription.items.data[0].price.id);
        await this.creditManager.updateMonthlyCredits(workspace._id, plan);
      }

      this.logger.info('Subscription created', { 
        workspaceId: workspace._id,
        subscriptionId: subscription.id 
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
   * Handle checkout session completed
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
          
          // Add purchased credits
          await this.creditManager.addCredits(
            workspaceId,
            creditAmount,
            'purchase',
            {
              sessionId: session.id,
              paymentIntentId: session.payment_intent,
              amount: session.amount_total,
            }
          );

          this.logger.info('Credits purchased', { 
            workspaceId,
            credits: creditAmount 
          });
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
}