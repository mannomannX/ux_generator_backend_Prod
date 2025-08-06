// ==========================================
// SERVICES/BILLING-SERVICE/src/services/stripe-service.js
// ==========================================

import Stripe from 'stripe';

export class StripeService {
  constructor(logger, config) {
    this.logger = logger;
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion || '2023-10-16',
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create or retrieve a Stripe customer
   */
  async createOrGetCustomer(workspaceId, email, name) {
    try {
      // Check if customer already exists
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        this.logger.info('Retrieved existing Stripe customer', { 
          customerId: existingCustomers.data[0].id 
        });
        return existingCustomers.data[0];
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          workspaceId,
        },
      });

      this.logger.info('Created new Stripe customer', { 
        customerId: customer.id,
        workspaceId 
      });

      return customer;
    } catch (error) {
      this.logger.error('Failed to create/get Stripe customer', error);
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(customerId, priceId, trialDays = 0) {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { 
          save_default_payment_method: 'on_subscription' 
        },
        expand: ['latest_invoice.payment_intent'],
        trial_period_days: trialDays,
      });

      this.logger.info('Created Stripe subscription', { 
        subscriptionId: subscription.id,
        customerId 
      });

      return subscription;
    } catch (error) {
      this.logger.error('Failed to create subscription', error);
      throw error;
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId, updates) {
    try {
      const subscription = await this.stripe.subscriptions.update(
        subscriptionId,
        updates
      );

      this.logger.info('Updated Stripe subscription', { 
        subscriptionId,
        updates 
      });

      return subscription;
    } catch (error) {
      this.logger.error('Failed to update subscription', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const subscription = immediately
        ? await this.stripe.subscriptions.cancel(subscriptionId)
        : await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });

      this.logger.info('Cancelled Stripe subscription', { 
        subscriptionId,
        immediately 
      });

      return subscription;
    } catch (error) {
      this.logger.error('Failed to cancel subscription', error);
      throw error;
    }
  }

  /**
   * Create a checkout session
   */
  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl, metadata = {}) {
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      });

      this.logger.info('Created checkout session', { 
        sessionId: session.id,
        customerId 
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create checkout session', error);
      throw error;
    }
  }

  /**
   * Create a billing portal session
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      this.logger.info('Created portal session', { 
        sessionId: session.id,
        customerId 
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create portal session', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for one-time payments
   */
  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        metadata,
      });

      this.logger.info('Created payment intent', { 
        paymentIntentId: paymentIntent.id,
        amount 
      });

      return paymentIntent;
    } catch (error) {
      this.logger.error('Failed to create payment intent', error);
      throw error;
    }
  }

  /**
   * Retrieve a subscription
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      this.logger.error('Failed to retrieve subscription', error);
      throw error;
    }
  }

  /**
   * List customer subscriptions
   */
  async listCustomerSubscriptions(customerId) {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
      });
      return subscriptions.data;
    } catch (error) {
      this.logger.error('Failed to list customer subscriptions', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
      return event;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', error);
      throw error;
    }
  }

  /**
   * Add payment method to customer
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customerId }
      );

      // Set as default payment method
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      this.logger.info('Attached payment method to customer', { 
        paymentMethodId,
        customerId 
      });

      return paymentMethod;
    } catch (error) {
      this.logger.error('Failed to attach payment method', error);
      throw error;
    }
  }

  /**
   * List customer payment methods
   */
  async listPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      return paymentMethods.data;
    } catch (error) {
      this.logger.error('Failed to list payment methods', error);
      throw error;
    }
  }

  /**
   * Create a usage record for metered billing
   */
  async reportUsage(subscriptionItemId, quantity, timestamp = Math.floor(Date.now() / 1000)) {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp,
        }
      );

      this.logger.info('Reported usage', { 
        subscriptionItemId,
        quantity 
      });

      return usageRecord;
    } catch (error) {
      this.logger.error('Failed to report usage', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Try to retrieve account info
      await this.stripe.balance.retrieve();
      return { status: 'healthy', message: 'Stripe connection successful' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }
}