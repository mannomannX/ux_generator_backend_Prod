# Billing Service 💳

> Subscription management, usage tracking, and payment processing for UX Flow Engine

## Overview

The Billing Service handles all financial operations including subscription management, credit tracking, usage-based billing, and payment processing through Stripe integration. It ensures accurate billing, manages different subscription tiers, and provides detailed usage analytics.

### Service Status: Production Ready ✅
- Port: `3005`
- Dependencies: Stripe API, MongoDB, Redis
- Required: Stripe webhook configuration

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Billing Service                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │        Subscription Manager              │  │
│  │  • Tier Management (Free/Basic/Pro/Ent)  │  │
│  │  • Plan Changes & Upgrades               │  │
│  │  • Feature Access Control                │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │          Credit Manager                  │  │
│  │  • Usage Tracking                        │  │
│  │  • Credit Allocation                     │  │
│  │  • Overage Handling                      │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Payment Processing               │  │
│  │  • Stripe Integration                    │  │
│  │  • Invoice Generation                    │  │
│  │  • Webhook Processing                    │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 💰 Subscription Tiers

| Tier | Monthly Price | AI Requests | Projects | Features |
|------|--------------|-------------|----------|----------|
| **Free** | $0 | 100/month | 3 | Basic features, Standard AI |
| **Basic** | $29 | 1,000/month | 10 | All features, Standard AI |
| **Pro** | $99 | 10,000/month | 50 | All features, Premium AI |
| **Enterprise** | Custom | Unlimited | Unlimited | Custom features, Priority support |

## 🚀 Getting Started

### Prerequisites

```bash
# Required environment variables
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
MONGODB_URI=mongodb://localhost:27017/ux-flow-billing
REDIS_URL=redis://localhost:6379
BILLING_SERVICE_PORT=3005
```

### Installation

```bash
# Navigate to service
cd services/billing-service

# Install dependencies
npm install

# Start development server
npm run dev
```

### Stripe Webhook Setup

```bash
# For local development with Stripe CLI
stripe listen --forward-to localhost:3005/webhooks/stripe

# Copy the webhook signing secret to .env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 📡 API Endpoints

### Subscription Management

#### Get Current Subscription
```http
GET /api/billing/subscription
Authorization: Bearer <token>

Response:
{
  "subscription": {
    "id": "sub_123",
    "tier": "pro",
    "status": "active",
    "currentPeriodEnd": "2024-03-01T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "usage": {
    "aiRequests": 4532,
    "aiRequestsLimit": 10000,
    "projects": 12,
    "projectsLimit": 50
  },
  "customer": {
    "id": "cus_123",
    "email": "user@example.com",
    "paymentMethod": "•••• 4242"
  }
}
```

#### Change Subscription Plan
```http
POST /api/billing/subscription/change
Authorization: Bearer <token>
Content-Type: application/json

{
  "newTier": "pro",
  "paymentMethodId": "pm_123" // Optional for upgrades
}
```

#### Cancel Subscription
```http
POST /api/billing/subscription/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "immediately": false, // Cancel at period end by default
  "reason": "Too expensive"
}
```

### Credit & Usage Management

#### Get Credit Balance
```http
GET /api/billing/credits
Authorization: Bearer <token>

Response:
{
  "balance": {
    "aiRequests": 5468,
    "aiRequestsLimit": 10000,
    "resetDate": "2024-03-01T00:00:00Z"
  },
  "usage": {
    "today": 234,
    "thisWeek": 1567,
    "thisMonth": 5468
  },
  "history": [
    {
      "date": "2024-02-15T10:30:00Z",
      "type": "debit",
      "amount": 1,
      "description": "AI request - planner agent",
      "balance": 5468
    }
  ]
}
```

#### Purchase Additional Credits
```http
POST /api/billing/credits/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 1000,
  "paymentMethodId": "pm_123"
}
```

### Payment Methods

#### List Payment Methods
```http
GET /api/billing/payment-methods
Authorization: Bearer <token>
```

#### Add Payment Method
```http
POST /api/billing/payment-methods
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethodId": "pm_123", // From Stripe Elements
  "setAsDefault": true
}
```

#### Remove Payment Method
```http
DELETE /api/billing/payment-methods/:paymentMethodId
Authorization: Bearer <token>
```

### Invoices & Billing History

#### Get Invoices
```http
GET /api/billing/invoices
Authorization: Bearer <token>

Query Parameters:
- limit: number (default: 10)
- starting_after: string (cursor pagination)
```

#### Download Invoice
```http
GET /api/billing/invoices/:invoiceId/download
Authorization: Bearer <token>
```

### Webhooks

#### Stripe Webhook Endpoint
```http
POST /webhooks/stripe
Stripe-Signature: <stripe-signature-header>

// Handles events:
// - customer.subscription.created
// - customer.subscription.updated
// - customer.subscription.deleted
// - invoice.payment_succeeded
// - invoice.payment_failed
// - payment_method.attached
// - payment_method.detached
```

## 🗂️ Project Structure

```
billing-service/
├── src/
│   ├── config/              # Configuration
│   │   └── index.js         # Service configuration
│   │
│   ├── services/            # Business logic
│   │   ├── billing-manager.js       # Main billing orchestrator
│   │   ├── subscription-manager.js  # Subscription handling
│   │   ├── credit-manager.js        # Credit tracking
│   │   ├── stripe-service.js        # Stripe API wrapper
│   │   └── webhook-handler.js       # Webhook processing
│   │
│   ├── routes/              # API routes
│   │   ├── billing.js       # Main billing routes
│   │   ├── subscriptions.js # Subscription endpoints
│   │   └── credits.js       # Credit management
│   │
│   ├── middleware/          # Express middleware
│   │   └── auth.js          # Authentication
│   │
│   ├── events/              # Event handlers
│   │   └── index.js         # Redis event integration
│   │
│   └── server.js            # Express server
│
├── tests/                   # Test suites
├── package.json
└── README.md
```

## 🔒 Security

### PCI Compliance
- No credit card data stored locally
- All payment processing through Stripe
- Webhook signature verification
- HTTPS required in production

### API Security
```javascript
// Webhook signature verification
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

## 📊 Usage Tracking

### Credit Deduction Rules

| Action | Credit Cost | Notes |
|--------|------------|-------|
| AI Request (Standard) | 1 | Basic quality mode |
| AI Request (Pro) | 3 | Premium quality mode |
| Vision Processing | 5 | Image analysis |
| Batch Processing | 10 | Bulk operations |

### Usage Events

The service listens for these events to track usage:
- `AI_REQUEST_COMPLETED` - Deduct credits based on quality mode
- `VISION_PROCESSING_COMPLETED` - Deduct vision credits
- `BATCH_PROCESSING_COMPLETED` - Deduct batch credits

## 🧪 Testing

```bash
# Run all tests
npm test

# Test Stripe integration
npm run test:stripe

# Test with mock Stripe
STRIPE_SECRET_KEY=sk_test_mock npm test
```

### Testing Webhooks Locally
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3005/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.updated
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BILLING_SERVICE_PORT` | ❌ | `3005` | Service port |
| `STRIPE_SECRET_KEY` | ✅ | - | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | - | Webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | - | Public Stripe key |
| `MONGODB_URI` | ✅ | - | MongoDB connection |
| `REDIS_URL` | ✅ | - | Redis connection |
| `NODE_ENV` | ❌ | `development` | Environment |

### Stripe Products Configuration

Create these products in Stripe Dashboard:

```javascript
// Product IDs (configured in Stripe)
const PRODUCTS = {
  BASIC: 'prod_basic_tier',
  PRO: 'prod_pro_tier',
  ENTERPRISE: 'prod_enterprise_tier'
};

// Price IDs (configured in Stripe)
const PRICES = {
  BASIC_MONTHLY: 'price_basic_monthly',
  BASIC_YEARLY: 'price_basic_yearly',
  PRO_MONTHLY: 'price_pro_monthly',
  PRO_YEARLY: 'price_pro_yearly'
};
```

## 📈 Monitoring

### Key Metrics
- Subscription conversion rate
- Churn rate by tier
- Average revenue per user (ARPU)
- Credit usage patterns
- Payment failure rate

### Health Check
```http
GET /health

Response:
{
  "status": "healthy",
  "service": "billing-service",
  "stripe": "connected",
  "database": "connected",
  "timestamp": "2024-02-15T10:00:00Z"
}
```

## 🚨 Error Handling

### Payment Failures
```javascript
// Automatic retry with exponential backoff
const retryPayment = async (customerId, attempts = 3) => {
  for (let i = 0; i < attempts; i++) {
    try {
      return await stripe.paymentIntents.create({...});
    } catch (error) {
      if (i === attempts - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
};
```

### Webhook Failures
- Automatic retry from Stripe
- Dead letter queue for failed events
- Manual replay capability

## 🔗 Related Services

- **User Management**: User account data
- **API Gateway**: Request routing and auth
- **Cognitive Core**: Usage event generation
- **Flow Service**: Project limits enforcement

## 📝 Changelog

### Version 1.0.0 (2024-02-15)
- Initial implementation
- Stripe integration
- Subscription management
- Credit tracking system
- Usage-based billing
- Webhook processing

---

**Billing Service** - Managing subscriptions and payments for UX Flow Engine 💳