// ==========================================
// BILLING SERVICE - Test Fixtures
// ==========================================

export const testUsers = {
  freeUser: {
    id: 'user_free_123',
    email: 'free@example.com',
    name: 'Free User',
    workspaceId: 'workspace_free_123',
    planId: 'free',
    role: 'user'
  },
  starterUser: {
    id: 'user_starter_123',
    email: 'starter@example.com',
    name: 'Starter User',
    workspaceId: 'workspace_starter_123',
    planId: 'starter',
    role: 'user'
  },
  proUser: {
    id: 'user_pro_123',
    email: 'pro@example.com',
    name: 'Pro User',
    workspaceId: 'workspace_pro_123',
    planId: 'professional',
    role: 'admin'
  },
  enterpriseUser: {
    id: 'user_enterprise_123',
    email: 'enterprise@example.com',
    name: 'Enterprise User',
    workspaceId: 'workspace_enterprise_123',
    planId: 'enterprise',
    role: 'admin'
  }
};

export const testSubscriptions = {
  freeSubscription: {
    id: 'sub_free_123',
    workspaceId: 'workspace_free_123',
    planId: 'free',
    status: 'active',
    credits: 100,
    features: ['basic_flows', 'basic_ai'],
    createdAt: new Date('2024-01-01')
  },
  starterSubscription: {
    id: 'sub_starter_123',
    workspaceId: 'workspace_starter_123',
    stripeSubscriptionId: 'stripe_sub_starter_123',
    planId: 'starter',
    status: 'active',
    credits: 500,
    price: 29,
    features: ['unlimited_flows', 'advanced_ai', 'analytics'],
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    createdAt: new Date('2024-01-01')
  },
  proSubscription: {
    id: 'sub_pro_123',
    workspaceId: 'workspace_pro_123',
    stripeSubscriptionId: 'stripe_sub_pro_123',
    planId: 'professional',
    status: 'active',
    credits: 2000,
    price: 99,
    features: ['unlimited_flows', 'advanced_ai', 'analytics', 'priority_support', 'custom_branding'],
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    createdAt: new Date('2024-01-01')
  },
  cancelledSubscription: {
    id: 'sub_cancelled_123',
    workspaceId: 'workspace_cancelled_123',
    stripeSubscriptionId: 'stripe_sub_cancelled_123',
    planId: 'professional',
    status: 'cancelled',
    cancelledAt: new Date('2024-01-15'),
    cancelReason: 'Too expensive',
    createdAt: new Date('2023-12-01')
  }
};

export const testPaymentMethods = {
  validCard: {
    id: 'pm_valid_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      exp_month: 12,
      exp_year: 2025
    }
  },
  expiredCard: {
    id: 'pm_expired_123',
    type: 'card',
    card: {
      brand: 'mastercard',
      last4: '5555',
      exp_month: 1,
      exp_year: 2020
    }
  },
  declinedCard: {
    id: 'pm_declined_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '0002',
      exp_month: 12,
      exp_year: 2025
    }
  }
};

export const testInvoices = {
  paidInvoice: {
    id: 'inv_paid_123',
    workspaceId: 'workspace_pro_123',
    stripeInvoiceId: 'stripe_inv_paid_123',
    amount: 9900, // $99.00 in cents
    currency: 'usd',
    status: 'paid',
    description: 'Professional Plan - January 2024',
    paidAt: new Date('2024-01-01'),
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/inv_paid_123',
    invoicePdf: 'https://invoice.stripe.com/i/inv_paid_123/pdf'
  },
  pendingInvoice: {
    id: 'inv_pending_123',
    workspaceId: 'workspace_starter_123',
    stripeInvoiceId: 'stripe_inv_pending_123',
    amount: 2900, // $29.00 in cents
    currency: 'usd',
    status: 'open',
    description: 'Starter Plan - February 2024',
    dueDate: new Date('2024-02-01')
  },
  failedInvoice: {
    id: 'inv_failed_123',
    workspaceId: 'workspace_pro_123',
    stripeInvoiceId: 'stripe_inv_failed_123',
    amount: 9900,
    currency: 'usd',
    status: 'uncollectible',
    description: 'Professional Plan - December 2023',
    attemptCount: 3,
    nextPaymentAttempt: null
  }
};

export const testCreditTransactions = {
  creditPurchase: {
    id: 'trans_purchase_123',
    workspaceId: 'workspace_pro_123',
    type: 'purchase',
    amount: 1000,
    price: 10.00,
    status: 'completed',
    createdAt: new Date('2024-01-15')
  },
  creditConsumption: {
    id: 'trans_consume_123',
    workspaceId: 'workspace_pro_123',
    type: 'consumption',
    amount: -50,
    reason: 'AI generation',
    metadata: {
      service: 'cognitive-core',
      model: 'gpt-4',
      requestId: 'req_123'
    },
    createdAt: new Date('2024-01-16')
  },
  creditGrant: {
    id: 'trans_grant_123',
    workspaceId: 'workspace_free_123',
    type: 'grant',
    amount: 100,
    reason: 'Monthly allocation',
    createdAt: new Date('2024-01-01')
  },
  creditRefund: {
    id: 'trans_refund_123',
    workspaceId: 'workspace_pro_123',
    type: 'refund',
    amount: 500,
    reason: 'Service issue compensation',
    createdAt: new Date('2024-01-20')
  }
};

export const testWebhookEvents = {
  paymentSucceeded: {
    id: 'evt_payment_success_123',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_success_123',
        amount: 9900,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          workspaceId: 'workspace_pro_123',
          planId: 'professional'
        }
      }
    }
  },
  paymentFailed: {
    id: 'evt_payment_failed_123',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: 'pi_failed_123',
        amount: 2900,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined'
        },
        metadata: {
          workspaceId: 'workspace_starter_123',
          planId: 'starter'
        }
      }
    }
  },
  subscriptionCreated: {
    id: 'evt_sub_created_123',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_created_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [{
            price: {
              id: 'price_professional',
              product: 'prod_professional'
            }
          }]
        },
        metadata: {
          workspaceId: 'workspace_new_123'
        }
      }
    }
  },
  subscriptionDeleted: {
    id: 'evt_sub_deleted_123',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_deleted_123',
        customer: 'cus_456',
        status: 'canceled',
        metadata: {
          workspaceId: 'workspace_cancelled_123'
        }
      }
    }
  },
  invoicePaid: {
    id: 'evt_invoice_paid_123',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_paid_123',
        customer: 'cus_789',
        amount_paid: 9900,
        currency: 'usd',
        subscription: 'sub_pro_123',
        metadata: {
          workspaceId: 'workspace_pro_123'
        }
      }
    }
  }
};

export const testPlans = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 100,
    features: ['basic_flows', 'basic_ai', 'community_support']
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 29,
    stripePriceId: 'price_starter_123',
    credits: 500,
    features: ['unlimited_flows', 'advanced_ai', 'analytics', 'email_support']
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 99,
    stripePriceId: 'price_professional_123',
    credits: 2000,
    features: ['unlimited_flows', 'advanced_ai', 'analytics', 'priority_support', 'custom_branding', 'api_access']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'custom',
    stripePriceId: 'price_enterprise_123',
    credits: 'unlimited',
    features: ['everything', 'dedicated_support', 'sla', 'custom_integration', 'on_premise']
  }
};

export const mockStripeResponses = {
  createCheckoutSession: {
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/pay/cs_test_123',
    payment_status: 'unpaid',
    status: 'open'
  },
  createPortalSession: {
    id: 'bps_test_123',
    url: 'https://billing.stripe.com/session/bps_test_123'
  },
  createPaymentIntent: {
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret',
    status: 'requires_payment_method'
  },
  attachPaymentMethod: {
    id: 'pm_test_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242'
    }
  },
  listPaymentMethods: {
    data: [testPaymentMethods.validCard]
  },
  retrieveSubscription: {
    id: 'sub_test_123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  },
  listInvoices: {
    data: [testInvoices.paidInvoice]
  }
};

export default {
  testUsers,
  testSubscriptions,
  testPaymentMethods,
  testInvoices,
  testCreditTransactions,
  testWebhookEvents,
  testPlans,
  mockStripeResponses
};