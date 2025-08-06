// ==========================================
// SERVICES/BILLING-SERVICE/src/services/billing-manager.js
// ==========================================

export class BillingManager {
  constructor(logger, mongoClient, redisClient, stripeService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.stripeService = stripeService;
  }

  /**
   * Get workspace by Stripe customer ID
   */
  async getWorkspaceByCustomerId(stripeCustomerId) {
    try {
      const db = this.mongoClient.getDb();
      return await db.collection('workspaces').findOne({
        'billing.stripeCustomerId': stripeCustomerId,
      });
    } catch (error) {
      this.logger.error('Failed to get workspace by customer ID', error);
      throw error;
    }
  }

  /**
   * Update workspace subscription info
   */
  async updateWorkspaceSubscription(workspaceId, updates) {
    try {
      const db = this.mongoClient.getDb();
      
      const updateFields = {};
      Object.keys(updates).forEach(key => {
        updateFields[`billing.${key}`] = updates[key];
      });
      
      await db.collection('workspaces').updateOne(
        { _id: workspaceId },
        { 
          $set: {
            ...updateFields,
            'billing.updatedAt': new Date(),
          }
        }
      );
      
      // Clear cache
      await this.redisClient.del(`workspace:${workspaceId}`);
      
      this.logger.info('Updated workspace subscription', { 
        workspaceId, 
        updates 
      });
    } catch (error) {
      this.logger.error('Failed to update workspace subscription', error);
      throw error;
    }
  }

  /**
   * Create invoice record
   */
  async createInvoiceRecord(invoiceData) {
    try {
      const db = this.mongoClient.getDb();
      
      const invoice = {
        ...invoiceData,
        createdAt: new Date(),
      };
      
      await db.collection('invoices').insertOne(invoice);
      
      this.logger.info('Invoice record created', { 
        workspaceId: invoiceData.workspaceId,
        invoiceId: invoiceData.stripeInvoiceId 
      });
    } catch (error) {
      this.logger.error('Failed to create invoice record', error);
      throw error;
    }
  }

  /**
   * Get invoices for workspace
   */
  async getWorkspaceInvoices(workspaceId, limit = 50) {
    try {
      const db = this.mongoClient.getDb();
      
      return await db.collection('invoices')
        .find({ workspaceId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      this.logger.error('Failed to get workspace invoices', error);
      throw error;
    }
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedNotification(workspaceId, details) {
    try {
      // Emit event for notification service
      await this.redisClient.publish('notifications', JSON.stringify({
        type: 'payment_failed',
        workspaceId,
        details,
        timestamp: new Date(),
      }));
      
      this.logger.info('Payment failed notification sent', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to send payment failed notification', error);
      throw error;
    }
  }

  /**
   * Send trial ending notification
   */
  async sendTrialEndingNotification(workspaceId, details) {
    try {
      // Emit event for notification service
      await this.redisClient.publish('notifications', JSON.stringify({
        type: 'trial_ending',
        workspaceId,
        details,
        timestamp: new Date(),
      }));
      
      this.logger.info('Trial ending notification sent', { workspaceId });
    } catch (error) {
      this.logger.error('Failed to send trial ending notification', error);
      throw error;
    }
  }

  /**
   * Get billing statistics
   */
  async getBillingStatistics(workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      
      // Get workspace
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Get invoice statistics
      const invoices = await db.collection('invoices').aggregate([
        { $match: { workspaceId } },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$amount' },
            invoiceCount: { $sum: 1 },
            lastPayment: { $max: '$paidAt' },
          }
        }
      ]).toArray();

      // Get credit statistics
      const creditStats = await db.collection('credit_transactions').aggregate([
        { $match: { workspaceId } },
        {
          $group: {
            _id: '$type',
            total: { $sum: { $abs: '$amount' } },
            count: { $sum: 1 },
          }
        }
      ]).toArray();

      return {
        plan: workspace.billing?.plan || 'free',
        status: workspace.billing?.status || 'active',
        totalSpent: invoices[0]?.totalSpent || 0,
        invoiceCount: invoices[0]?.invoiceCount || 0,
        lastPayment: invoices[0]?.lastPayment,
        creditStats: creditStats.reduce((acc, stat) => {
          acc[stat._id] = {
            total: stat.total,
            count: stat.count,
          };
          return acc;
        }, {}),
      };
    } catch (error) {
      this.logger.error('Failed to get billing statistics', error);
      throw error;
    }
  }

  /**
   * Create or update Stripe customer
   */
  async ensureStripeCustomer(workspaceId, email, name) {
    try {
      const db = this.mongoClient.getDb();
      const workspace = await db.collection('workspaces').findOne({ _id: workspaceId });
      
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Check if customer already exists
      if (workspace.billing?.stripeCustomerId) {
        return workspace.billing.stripeCustomerId;
      }

      // Create new Stripe customer
      const customer = await this.stripeService.createOrGetCustomer(
        workspaceId,
        email || workspace.billingEmail || workspace.ownerEmail,
        name || workspace.name
      );

      // Update workspace with customer ID
      await this.updateWorkspaceSubscription(workspaceId, {
        stripeCustomerId: customer.id,
      });

      return customer.id;
    } catch (error) {
      this.logger.error('Failed to ensure Stripe customer', error);
      throw error;
    }
  }
}