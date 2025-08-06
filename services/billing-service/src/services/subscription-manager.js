// ==========================================
// SERVICES/BILLING-SERVICE/src/services/subscription-manager.js
// ==========================================

import config from '../config/index.js';

export class SubscriptionManager {
  constructor(logger, mongoClient, stripeService, creditManager) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.stripeService = stripeService;
    this.creditManager = creditManager;
    this.plans = config.plans;
  }

  /**
   * Create a new subscription
   */
  async createSubscription(workspaceId, planId, paymentMethodId = null) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const plan = this.plans[planId];
      if (!plan) {
        throw new Error(`Invalid plan: ${planId}`);
      }

      // Create or get Stripe customer
      let stripeCustomerId = workspace.billing?.stripeCustomerId;
      
      if (!stripeCustomerId) {
        const customer = await this.stripeService.createOrGetCustomer(
          workspaceId,
          workspace.billingEmail || workspace.ownerEmail,
          workspace.name
        );
        stripeCustomerId = customer.id;
        
        // Update workspace with Stripe customer ID
        await db.collection('workspaces').updateOne(
          { _id: workspaceId },
          { $set: { 'billing.stripeCustomerId': stripeCustomerId } }
        );
      }

      // Attach payment method if provided
      if (paymentMethodId) {
        await this.stripeService.attachPaymentMethod(paymentMethodId, stripeCustomerId);
      }

      // Create Stripe subscription
      const subscription = await this.stripeService.createSubscription(
        stripeCustomerId,
        plan.stripePriceId,
        planId === 'starter' ? 7 : 0 // 7-day trial for starter plan
      );

      // Update workspace with subscription info
      await db.collection('workspaces').updateOne(
        { _id: workspaceId },
        {
          $set: {
            'billing.plan': planId,
            'billing.stripeSubscriptionId': subscription.id,
            'billing.status': subscription.status,
            'billing.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
            'billing.cancelAtPeriodEnd': subscription.cancel_at_period_end,
          }
        }
      );

      // Update credit allocation
      await this.creditManager.updateMonthlyCredits(workspaceId, planId);

      // Store subscription in database
      await db.collection('subscriptions').insertOne({
        workspaceId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId,
        plan: planId,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.logger.info('Created subscription', { 
        workspaceId, 
        planId, 
        subscriptionId: subscription.id 
      });

      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
        plan: planId,
        credits: plan.credits,
      };
    } catch (error) {
      this.logger.error('Failed to create subscription', error, { workspaceId, planId });
      throw error;
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscription(workspaceId, newPlanId) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace?.billing?.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      const newPlan = this.plans[newPlanId];
      if (!newPlan) {
        throw new Error(`Invalid plan: ${newPlanId}`);
      }

      // Get current subscription
      const subscription = await this.stripeService.getSubscription(
        workspace.billing.stripeSubscriptionId
      );

      // Update subscription in Stripe
      const updatedSubscription = await this.stripeService.updateSubscription(
        subscription.id,
        {
          items: [{
            id: subscription.items.data[0].id,
            price: newPlan.stripePriceId,
          }],
          proration_behavior: 'create_prorations',
        }
      );

      // Update workspace
      await db.collection('workspaces').updateOne(
        { _id: workspaceId },
        {
          $set: {
            'billing.plan': newPlanId,
            'billing.status': updatedSubscription.status,
            'billing.currentPeriodEnd': new Date(updatedSubscription.current_period_end * 1000),
          }
        }
      );

      // Update subscription record
      await db.collection('subscriptions').updateOne(
        { workspaceId },
        {
          $set: {
            plan: newPlanId,
            status: updatedSubscription.status,
            updatedAt: new Date(),
          }
        }
      );

      // Update credit allocation
      await this.creditManager.updateMonthlyCredits(workspaceId, newPlanId);

      this.logger.info('Updated subscription', { 
        workspaceId, 
        oldPlan: workspace.billing.plan,
        newPlan: newPlanId 
      });

      return {
        subscriptionId: updatedSubscription.id,
        plan: newPlanId,
        credits: newPlan.credits,
      };
    } catch (error) {
      this.logger.error('Failed to update subscription', error, { workspaceId, newPlanId });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(workspaceId, immediately = false) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace?.billing?.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      // Cancel in Stripe
      const cancelledSubscription = await this.stripeService.cancelSubscription(
        workspace.billing.stripeSubscriptionId,
        immediately
      );

      // Update workspace
      const updates = immediately
        ? {
            'billing.plan': 'free',
            'billing.status': 'cancelled',
            'billing.stripeSubscriptionId': null,
            'billing.cancelledAt': new Date(),
          }
        : {
            'billing.cancelAtPeriodEnd': true,
            'billing.status': cancelledSubscription.status,
          };

      await db.collection('workspaces').updateOne(
        { _id: workspaceId },
        { $set: updates }
      );

      // Update subscription record
      await db.collection('subscriptions').updateOne(
        { workspaceId },
        {
          $set: {
            status: cancelledSubscription.status,
            cancelAtPeriodEnd: cancelledSubscription.cancel_at_period_end,
            cancelledAt: immediately ? new Date() : null,
            updatedAt: new Date(),
          }
        }
      );

      // If immediate cancellation, reset to free plan credits
      if (immediately) {
        await this.creditManager.updateMonthlyCredits(workspaceId, 'free');
      }

      this.logger.info('Cancelled subscription', { 
        workspaceId, 
        immediately 
      });

      return {
        status: 'cancelled',
        cancelAt: cancelledSubscription.cancel_at 
          ? new Date(cancelledSubscription.cancel_at * 1000) 
          : null,
      };
    } catch (error) {
      this.logger.error('Failed to cancel subscription', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Reactivate a cancelled subscription
   */
  async reactivateSubscription(workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace?.billing?.stripeSubscriptionId) {
        throw new Error('No subscription found');
      }

      // Reactivate in Stripe
      const subscription = await this.stripeService.updateSubscription(
        workspace.billing.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );

      // Update workspace
      await db.collection('workspaces').updateOne(
        { _id: workspaceId },
        {
          $set: {
            'billing.cancelAtPeriodEnd': false,
            'billing.status': subscription.status,
          }
        }
      );

      // Update subscription record
      await db.collection('subscriptions').updateOne(
        { workspaceId },
        {
          $set: {
            cancelAtPeriodEnd: false,
            status: subscription.status,
            updatedAt: new Date(),
          }
        }
      );

      this.logger.info('Reactivated subscription', { workspaceId });

      return {
        status: subscription.status,
        plan: workspace.billing.plan,
      };
    } catch (error) {
      this.logger.error('Failed to reactivate subscription', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  async getSubscriptionDetails(workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const billing = workspace.billing || {};
      
      // If no subscription, return free plan details
      if (!billing.stripeSubscriptionId) {
        return {
          plan: 'free',
          status: 'active',
          credits: this.plans.free.credits,
          features: this.plans.free.features,
        };
      }

      // Get Stripe subscription details
      const subscription = await this.stripeService.getSubscription(
        billing.stripeSubscriptionId
      );

      // Get credit balance
      const creditBalance = await this.creditManager.getBalance(workspaceId);

      return {
        plan: billing.plan,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        credits: creditBalance.balance,
        monthlyCredits: creditBalance.monthlyCredits,
        additionalCredits: creditBalance.additionalCredits,
        features: this.plans[billing.plan]?.features || [],
      };
    } catch (error) {
      this.logger.error('Failed to get subscription details', error, { workspaceId });
      throw error;
    }
  }

  /**
   * Handle subscription renewal
   */
  async handleRenewal(subscriptionId) {
    try {
      const db = this.mongoClient.getDb();
      const subscription = await db.collection('subscriptions').findOne({ 
        stripeSubscriptionId: subscriptionId 
      });
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Reset monthly credits
      await this.creditManager.updateMonthlyCredits(
        subscription.workspaceId, 
        subscription.plan
      );

      // Update subscription period
      const stripeSubscription = await this.stripeService.getSubscription(subscriptionId);
      
      await db.collection('subscriptions').updateOne(
        { stripeSubscriptionId: subscriptionId },
        {
          $set: {
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            updatedAt: new Date(),
          }
        }
      );

      this.logger.info('Handled subscription renewal', { 
        subscriptionId,
        workspaceId: subscription.workspaceId 
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to handle renewal', error, { subscriptionId });
      throw error;
    }
  }
}