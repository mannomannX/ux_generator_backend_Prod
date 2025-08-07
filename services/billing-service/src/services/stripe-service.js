// ==========================================
// SERVICES/BILLING-SERVICE/src/services/stripe-service.js
// ==========================================

import Stripe from 'stripe';
import crypto from 'crypto';

export class StripeService {
  constructor(logger, config) {
    this.logger = logger;
    
    // Validate configuration
    if (!config.secretKey) {
      throw new Error('Stripe secret key is required');
    }
    
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion || '2023-10-16',
      maxNetworkRetries: 3,
      timeout: 30000,
      telemetry: false
    });
    
    this.webhookSecret = config.webhookSecret;
    this.priceIds = config.priceIds || {};
    this.currency = config.currency || 'usd';
    
    // Cache for frequently accessed data
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  /**
   * Initialize and validate Stripe configuration
   */
  async initialize() {
    try {
      // Test Stripe connection
      const account = await this.stripe.accounts.retrieve();
      this.logger.info('Stripe service initialized', {
        accountId: account.id,
        country: account.country,
        currency: account.default_currency
      });
      
      // Validate price IDs exist
      await this.validatePriceIds();
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize Stripe service', error);
      throw new Error(`Stripe initialization failed: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature for security
   */
  async verifyWebhookSignature(payload, signature, secret) {
    try {
      // Stripe requires the raw body for signature verification
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        secret || this.config.webhookSecret
      );
      
      // Additional validation
      if (!event.id || !event.type) {
        throw new Error('Invalid webhook event structure');
      }
      
      // Check event timestamp to prevent replay attacks
      const tolerance = 300; // 5 minutes
      const timestamp = event.created || Math.floor(Date.now() / 1000);
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (Math.abs(currentTime - timestamp) > tolerance) {
        throw new Error('Webhook timestamp outside tolerance window');
      }
      
      return event;
    } catch (error) {
      this.logger.error('Webhook signature verification failed', error);
      throw error;
    }
  }

  /**
   * Validate that configured price IDs exist in Stripe
   */
  async validatePriceIds() {
    const invalidPrices = [];
    
    for (const [plan, priceId] of Object.entries(this.priceIds)) {
      try {
        await this.stripe.prices.retrieve(priceId);
      } catch (error) {
        invalidPrices.push({ plan, priceId, error: error.message });
      }
    }
    
    if (invalidPrices.length > 0) {
      this.logger.error('Invalid Stripe price IDs detected', { invalidPrices });
      throw new Error('Some Stripe price IDs are invalid');
    }
    
    this.logger.info('All Stripe price IDs validated successfully');
  }

  /**
   * Create or retrieve a Stripe customer
   */
  async createOrGetCustomer(workspaceId, email, name, metadata = {}) {
    try {
      // Check cache first
      const cacheKey = `customer:${email}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Check if customer already exists
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];
        
        // Update metadata if workspace changed
        if (customer.metadata.workspaceId !== workspaceId) {
          const updated = await this.stripe.customers.update(customer.id, {
            metadata: {
              ...customer.metadata,
              workspaceId,
              ...metadata
            }
          });
          
          this.setInCache(cacheKey, updated);
          return updated;
        }
        
        this.logger.info('Retrieved existing Stripe customer', { 
          customerId: customer.id,
          workspaceId
        });
        
        this.setInCache(cacheKey, customer);
        return customer;
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          workspaceId,
          createdAt: new Date().toISOString(),
          ...metadata
        },
        tax_exempt: 'none',
        promotion_code: metadata.promotionCode
      });

      this.logger.info('Created new Stripe customer', { 
        customerId: customer.id,
        workspaceId 
      });
      
      this.setInCache(cacheKey, customer);
      return customer;
      
    } catch (error) {
      this.logger.error('Failed to create/get Stripe customer', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a subscription with payment method
   */
  async createSubscription(customerId, priceId, options = {}) {
    try {
      const {
        trialDays = 0,
        paymentMethodId,
        couponId,
        metadata = {},
        quantity = 1
      } = options;

      // Set default payment method if provided
      if (paymentMethodId) {
        await this.attachPaymentMethod(customerId, paymentMethodId);
      }

      const subscriptionData = {
        customer: customerId,
        items: [{ 
          price: priceId,
          quantity
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: { 
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription'
        },
        expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        },
        proration_behavior: 'create_prorations'
      };

      // Add trial period if specified
      if (trialDays > 0) {
        subscriptionData.trial_period_days = trialDays;
        subscriptionData.trial_settings = {
          end_behavior: {
            missing_payment_method: 'pause'
          }
        };
      }

      // Add coupon if provided
      if (couponId) {
        subscriptionData.coupon = couponId;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      this.logger.info('Created Stripe subscription', { 
        subscriptionId: subscription.id,
        customerId,
        priceId,
        status: subscription.status
      });

      return subscription;
      
    } catch (error) {
      this.logger.error('Failed to create subscription', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId, updates) {
    try {
      // Handle plan changes
      if (updates.priceId) {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        
        // Update subscription items
        await this.stripe.subscriptions.update(subscriptionId, {
          items: [{
            id: subscription.items.data[0].id,
            price: updates.priceId
          }],
          proration_behavior: updates.prorationBehavior || 'create_prorations'
        });
        
        delete updates.priceId;
      }

      // Apply other updates
      if (Object.keys(updates).length > 0) {
        const subscription = await this.stripe.subscriptions.update(
          subscriptionId,
          updates
        );

        this.logger.info('Updated Stripe subscription', { 
          subscriptionId,
          updates 
        });

        return subscription;
      }
      
    } catch (error) {
      this.logger.error('Failed to update subscription', error);
      throw this.handleStripeError(error);
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
            cancel_at_period_end: true
          });

      this.logger.info('Cancelled Stripe subscription', { 
        subscriptionId,
        immediately,
        cancelAt: subscription.cancel_at
      });

      return subscription;
      
    } catch (error) {
      this.logger.error('Failed to cancel subscription', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Resume a cancelled subscription
   */
  async resumeSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });

      this.logger.info('Resumed Stripe subscription', { 
        subscriptionId
      });

      return subscription;
      
    } catch (error) {
      this.logger.error('Failed to resume subscription', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Attach a payment method to a customer
   */
  async attachPaymentMethod(customerId, paymentMethodId) {
    try {
      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      // Set as default payment method
      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      this.logger.info('Attached payment method to customer', {
        customerId,
        paymentMethodId
      });

      return true;
      
    } catch (error) {
      this.logger.error('Failed to attach payment method', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Detach a payment method from a customer
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(paymentMethodId);

      this.logger.info('Detached payment method', {
        paymentMethodId
      });

      return paymentMethod;
      
    } catch (error) {
      this.logger.error('Failed to detach payment method', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * List customer's payment methods
   */
  async listPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });

      return paymentMethods.data;
      
    } catch (error) {
      this.logger.error('Failed to list payment methods', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a setup intent for adding payment methods
   */
  async createSetupIntent(customerId) {
    try {
      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session'
      });

      this.logger.info('Created setup intent', {
        setupIntentId: setupIntent.id,
        customerId
      });

      return setupIntent;
      
    } catch (error) {
      this.logger.error('Failed to create setup intent', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a payment intent for one-time payments
   */
  async createPaymentIntent(amount, customerId, metadata = {}) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: this.currency,
        customer: customerId,
        payment_method_types: ['card'],
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        }
      });

      this.logger.info('Created payment intent', {
        paymentIntentId: paymentIntent.id,
        amount,
        customerId
      });

      return paymentIntent;
      
    } catch (error) {
      this.logger.error('Failed to create payment intent', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Retrieve customer's invoices
   */
  async listInvoices(customerId, limit = 100) {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
        expand: ['data.payment_intent']
      });

      return invoices.data;
      
    } catch (error) {
      this.logger.error('Failed to list invoices', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Download invoice PDF
   */
  async getInvoicePdf(invoiceId) {
    try {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      
      if (!invoice.invoice_pdf) {
        throw new Error('Invoice PDF not available');
      }

      return invoice.invoice_pdf;
      
    } catch (error) {
      this.logger.error('Failed to get invoice PDF', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a customer portal session
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });

      this.logger.info('Created customer portal session', {
        sessionId: session.id,
        customerId
      });

      return session;
      
    } catch (error) {
      this.logger.error('Failed to create portal session', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a checkout session
   */
  async createCheckoutSession(customerId, priceId, options = {}) {
    try {
      const {
        successUrl,
        cancelUrl,
        quantity = 1,
        allowPromotionCodes = true,
        trialDays = 0,
        metadata = {}
      } = options;

      const sessionData = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity
        }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: allowPromotionCodes,
        billing_address_collection: 'auto',
        customer_update: {
          address: 'auto',
          name: 'auto'
        },
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString()
        }
      };

      if (trialDays > 0) {
        sessionData.subscription_data = {
          trial_period_days: trialDays
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionData);

      this.logger.info('Created checkout session', {
        sessionId: session.id,
        customerId,
        priceId
      });

      return session;
      
    } catch (error) {
      this.logger.error('Failed to create checkout session', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Apply a coupon to a customer
   */
  async applyCoupon(customerId, couponId) {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        coupon: couponId
      });

      this.logger.info('Applied coupon to customer', {
        customerId,
        couponId
      });

      return customer;
      
    } catch (error) {
      this.logger.error('Failed to apply coupon', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a usage record for metered billing
   */
  async createUsageRecord(subscriptionItemId, quantity, timestamp = null) {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          action: 'increment'
        }
      );

      this.logger.info('Created usage record', {
        subscriptionItemId,
        quantity
      });

      return usageRecord;
      
    } catch (error) {
      this.logger.error('Failed to create usage record', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      if (!this.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      return event;
      
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice', 'customer', 'default_payment_method']
      });

      return subscription;
      
    } catch (error) {
      this.logger.error('Failed to get subscription', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * List all subscriptions for a customer
   */
  async listSubscriptions(customerId) {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.default_payment_method']
      });

      return subscriptions.data;
      
    } catch (error) {
      this.logger.error('Failed to list subscriptions', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Create a refund
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      const refundData = {
        payment_intent: paymentIntentId,
        reason
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      const refund = await this.stripe.refunds.create(refundData);

      this.logger.info('Created refund', {
        refundId: refund.id,
        paymentIntentId,
        amount: refund.amount / 100
      });

      return refund;
      
    } catch (error) {
      this.logger.error('Failed to create refund', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId, {
        expand: ['subscriptions', 'sources']
      });

      return customer;
      
    } catch (error) {
      this.logger.error('Failed to get customer', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(customerId, updates) {
    try {
      const customer = await this.stripe.customers.update(customerId, updates);

      this.logger.info('Updated customer', {
        customerId,
        updates
      });

      // Clear cache
      this.clearCache(`customer:*`);

      return customer;
      
    } catch (error) {
      this.logger.error('Failed to update customer', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Delete customer
   */
  async deleteCustomer(customerId) {
    try {
      const result = await this.stripe.customers.del(customerId);

      this.logger.info('Deleted customer', { customerId });

      // Clear cache
      this.clearCache(`customer:*`);

      return result;
      
    } catch (error) {
      this.logger.error('Failed to delete customer', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Get account balance
   */
  async getBalance() {
    try {
      const balance = await this.stripe.balance.retrieve();
      
      return {
        available: balance.available.map(b => ({
          amount: b.amount / 100,
          currency: b.currency
        })),
        pending: balance.pending.map(b => ({
          amount: b.amount / 100,
          currency: b.currency
        }))
      };
      
    } catch (error) {
      this.logger.error('Failed to get balance', error);
      throw this.handleStripeError(error);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.stripe.accounts.retrieve();
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  /**
   * Handle Stripe errors
   */
  handleStripeError(error) {
    const errorMap = {
      'card_declined': 'Your card was declined. Please try a different card.',
      'insufficient_funds': 'Your card has insufficient funds.',
      'invalid_payment_method': 'The payment method is invalid.',
      'expired_card': 'Your card has expired.',
      'processing_error': 'An error occurred while processing your card.',
      'authentication_required': 'Authentication is required to complete this payment.'
    };

    const message = errorMap[error.code] || error.message || 'Payment processing failed';

    return new Error(message);
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setInCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache(pattern = '*') {
    if (pattern === '*') {
      this.cache.clear();
    } else {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern.replace('*', ''))) {
          this.cache.delete(key);
        }
      }
    }
  }
}