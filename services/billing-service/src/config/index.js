// ==========================================
// SERVICES/BILLING-SERVICE/src/config/index.js
// ==========================================

export default {
  port: process.env.BILLING_SERVICE_PORT || 3005,
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: '2023-10-16',
  },
  
  plans: {
    free: {
      id: 'free',
      name: 'Free Plan',
      credits: 100,
      creditRefresh: 'monthly',
      features: [
        'Basic AI agents',
        '100 credits per month',
        '1 project',
        'Community support',
      ],
    },
    starter: {
      id: 'starter',
      stripeProductId: process.env.STRIPE_STARTER_PRODUCT_ID,
      stripePriceId: process.env.STRIPE_STARTER_PRICE_ID,
      name: 'Starter Plan',
      price: 29,
      credits: 1000,
      creditRefresh: 'monthly',
      features: [
        'All AI agents',
        '1,000 credits per month',
        '5 projects',
        'Email support',
        'Export flows',
      ],
    },
    professional: {
      id: 'professional',
      stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID,
      stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
      name: 'Professional Plan',
      price: 99,
      credits: 5000,
      creditRefresh: 'monthly',
      features: [
        'All AI agents',
        '5,000 credits per month',
        'Unlimited projects',
        'Priority support',
        'Advanced analytics',
        'Custom integrations',
      ],
    },
    enterprise: {
      id: 'enterprise',
      stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID,
      stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
      name: 'Enterprise Plan',
      price: 499,
      credits: 25000,
      creditRefresh: 'monthly',
      features: [
        'All AI agents',
        '25,000 credits per month',
        'Unlimited projects',
        'Dedicated support',
        'Custom AI models',
        'SLA guarantee',
        'On-premise option',
      ],
    },
  },
  
  creditPricing: {
    // Additional credit packages
    small: {
      credits: 500,
      price: 10,
      stripePriceId: process.env.STRIPE_CREDITS_SMALL_PRICE_ID,
    },
    medium: {
      credits: 2000,
      price: 35,
      stripePriceId: process.env.STRIPE_CREDITS_MEDIUM_PRICE_ID,
    },
    large: {
      credits: 5000,
      price: 75,
      stripePriceId: process.env.STRIPE_CREDITS_LARGE_PRICE_ID,
    },
  },
  
  creditCosts: {
    // Credits consumed per operation
    'ai.generate': 10,
    'ai.refine': 5,
    'ai.analyze': 8,
    'ai.suggest': 3,
    'flow.export': 1,
    'flow.import': 1,
    'knowledge.query': 2,
    'knowledge.embed': 5,
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: {
      session: 86400, // 24 hours
      cache: 3600, // 1 hour
      creditBalance: 300, // 5 minutes
    },
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    },
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};