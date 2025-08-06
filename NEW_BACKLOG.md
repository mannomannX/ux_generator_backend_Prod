# 🚀 UX-Flow-Engine Production Backlog

> **Letztes Update**: Dezember 2024
> **Status**: Pre-Production - Implementation Phase
> **Ziel**: Production-Ready MVP mit Monetarisierung Q1 2025

## 📊 Aktueller Implementierungsstatus

### ✅ Bereits Implementiert
- **User Management**: Basis-Authentifizierung (JWT, Email/Password)
- **Workspace System**: Vollständige Workspace-Verwaltung mit Rollen
- **AI Agent System**: 9 spezialisierte Agents funktionsfähig
- **Security Layer**: Prompt Injection Detection, Encryption, GDPR-Ready
- **Event System**: Redis Pub/Sub für Service-Kommunikation
- **Flow Management**: CRUD, Versionierung, Export/Import

### ❌ Fehlt für Production
- **Payment Integration**: Keine Stripe-Integration
- **Credit System**: Kein Credit-Tracking oder -Management
- **Social Auth**: Keine Google/GitHub Login-Integration
- **Monitoring**: Keine Production-Monitoring-Tools
- **Rate Limiting**: Erweiterte API-Limits für Paid Plans

---

## 🎯 PHASE 1: MVP-KRITISCH (2 Wochen)

### Epic 1.1: Billing Service Implementation
**Ziel**: Stripe-Integration für Monetarisierung

#### User Story 1.1.1: Billing Service Grundstruktur
```javascript
// Neuer Service: services/billing-service/
// Port: 3005
// Dependencies: Stripe SDK, MongoDB, Redis

Implementierung:
1. Service-Struktur erstellen
   - package.json mit Stripe-Dependency
   - src/server.js mit Express-Setup
   - src/config/stripe.js für Stripe-Initialisierung
   
2. Stripe Configuration
   - Environment Variables:
     * STRIPE_SECRET_KEY
     * STRIPE_WEBHOOK_SECRET
     * STRIPE_PRICE_ID_PRO
     * STRIPE_PRICE_ID_TEAM
   
3. Health Check Endpoint
   - GET /health mit Stripe-Connection-Status
```

#### User Story 1.1.2: Subscription Management API
```javascript
// services/billing-service/src/routes/subscriptions.js

POST /subscriptions/create
- Input: { workspaceId, planType: 'pro'|'team', paymentMethodId }
- Prozess:
  1. Workspace validieren
  2. Stripe Customer erstellen/abrufen
  3. Subscription mit price_id erstellen
  4. Workspace mit subscription_id updaten
  5. Initial Credits vergeben
- Output: { subscriptionId, status, creditsGranted }

POST /subscriptions/cancel
- Input: { workspaceId }
- Prozess:
  1. Stripe Subscription canceln (end of period)
  2. Workspace status updaten
- Output: { cancelAt, remainingCredits }

GET /subscriptions/:workspaceId
- Output: { plan, status, currentPeriodEnd, creditsRemaining }
```

#### User Story 1.1.3: Webhook Handler
```javascript
// services/billing-service/src/webhooks/stripe.js

POST /webhooks/stripe
- Events zu handlen:
  * customer.subscription.created → Credits initial vergeben
  * customer.subscription.updated → Plan-Änderungen
  * invoice.payment_succeeded → Monatliche Credits refresh
  * customer.subscription.deleted → Downgrade zu Free
  
- Implementation:
  1. Webhook Signature verifizieren
  2. Event Type switch/case
  3. Workspace Update via Event Bus
  4. Credit Allocation Logic
```

---

### Epic 1.2: Credit System Implementation
**Ziel**: Usage-based Limiting für AI-Operationen

#### User Story 1.2.1: Database Schema Update
```javascript
// services/user-management/src/models/workspace.js
// ERWEITERUNG des bestehenden Schemas:

billing: {
  stripeCustomerId: String,
  subscriptionId: String,
  subscriptionStatus: {
    type: String,
    enum: ['trialing', 'active', 'canceled', 'past_due'],
    default: null
  },
  currentPlan: {
    type: String,
    enum: ['free', 'pro', 'team', 'enterprise'],
    default: 'free'
  },
  creditsRemaining: {
    type: Number,
    default: 10 // Free tier credits
  },
  creditsUsedThisMonth: {
    type: Number,
    default: 0
  },
  creditResetDate: Date,
  additionalCredits: {
    type: Number,
    default: 0
  }
}

// Credit Limits per Plan:
// free: 10/month
// pro: 500/month
// team: 2000/month
// enterprise: unlimited
```

#### User Story 1.2.2: Credit Consumption Middleware
```javascript
// packages/common/src/middleware/credit-check.js

export const requireCredits = (creditsRequired = 1) => {
  return async (req, res, next) => {
    const workspaceId = req.workspace?.id || req.body?.workspaceId;
    
    // 1. Workspace abrufen
    const workspace = await WorkspaceModel.findById(workspaceId);
    
    // 2. Credits prüfen
    const totalCredits = workspace.billing.creditsRemaining + 
                        workspace.billing.additionalCredits;
    
    if (totalCredits < creditsRequired) {
      return res.status(402).json({
        error: 'INSUFFICIENT_CREDITS',
        message: 'Nicht genügend Credits verfügbar',
        creditsRequired,
        creditsAvailable: totalCredits,
        upgradeUrl: `${FRONTEND_URL}/billing/upgrade`
      });
    }
    
    // 3. Credits für Request reservieren
    req.creditsToConsume = creditsRequired;
    next();
  };
};

// Credit Consumption nach erfolgreicher Operation:
export const consumeCredits = async (workspaceId, credits) => {
  await WorkspaceModel.findByIdAndUpdate(workspaceId, {
    $inc: {
      'billing.creditsRemaining': -credits,
      'billing.creditsUsedThisMonth': credits
    }
  });
  
  // Event publizieren
  eventBus.emit('CREDITS_CONSUMED', {
    workspaceId,
    credits,
    timestamp: new Date()
  });
};
```

#### User Story 1.2.3: AI Operation Credit Mapping
```javascript
// services/cognitive-core/src/config/credit-costs.js

export const CREDIT_COSTS = {
  // Manager Agent
  'manager:process': 1,
  
  // Planner Agent (teurer wegen Komplexität)
  'planner:createPlan': 3,
  'planner:refinePlan': 2,
  
  // Architect Agent
  'architect:generateFlow': 3,
  'architect:updateFlow': 2,
  
  // Validator Agent
  'validator:validate': 1,
  
  // UX Expert Agent
  'uxExpert:consultation': 2,
  
  // Visual Interpreter (teuer wegen Bild-Analyse)
  'visual:interpretImage': 5,
  
  // Synthesizer
  'synthesizer:generateResponse': 1,
  
  // Quality Modes
  'qualityMultiplier': {
    'standard': 1,
    'pro': 2  // Doppelte Credits für Pro-Qualität
  }
};

// Integration in agent-orchestrator.js:
async processUserMessage(userId, projectId, message, qualityMode) {
  const baseCost = CREDIT_COSTS['manager:process'];
  const multiplier = CREDIT_COSTS.qualityMultiplier[qualityMode];
  const totalCost = baseCost * multiplier;
  
  // Credit Check via API Gateway bereits erfolgt
  // Nach erfolgreicher Verarbeitung:
  await consumeCredits(workspaceId, totalCost);
}
```

---

### Epic 1.3: API Gateway Credit Integration
**Ziel**: Credit-Checks in alle AI-Endpoints

#### User Story 1.3.1: WebSocket Credit Validation
```javascript
// services/api-gateway/src/websocket/message-handler.js

async handleUserMessage(socket, data) {
  const { projectId, message, qualityMode = 'standard' } = data;
  
  // 1. Workspace von Project ermitteln
  const project = await getProject(projectId);
  const workspace = await getWorkspace(project.workspaceId);
  
  // 2. Credit-Kosten berechnen
  const creditCost = calculateCreditCost('user-message', qualityMode);
  
  // 3. Credits prüfen
  if (!hasEnoughCredits(workspace, creditCost)) {
    socket.emit('error', {
      type: 'INSUFFICIENT_CREDITS',
      message: 'Upgrade für weitere AI-Interaktionen erforderlich',
      upgradeUrl: '/billing/upgrade',
      creditsNeeded: creditCost,
      creditsAvailable: workspace.billing.creditsRemaining
    });
    return;
  }
  
  // 4. Request forwarden
  eventBus.emit('USER_MESSAGE_RECEIVED', {
    ...data,
    workspaceId: workspace._id,
    creditCost
  });
}
```

#### User Story 1.3.2: REST Endpoint Protection
```javascript
// services/api-gateway/src/routes/projects.js

router.post('/projects/:id/analyze',
  authenticate,
  requireWorkspaceMembership,
  requireCredits(5), // Bild-Analyse kostet 5 Credits
  async (req, res) => {
    // Process request...
    await consumeCredits(req.workspace.id, req.creditsToConsume);
  }
);
```

---

## 🎯 PHASE 2: ERWEITERTE FEATURES (1 Woche)

### Epic 2.1: Social Authentication
**Ziel**: Google & GitHub Login für bessere Conversion

#### User Story 2.1.1: OAuth2 Integration
```javascript
// services/user-management/src/auth/oauth.js

// Passport.js Strategies
- GoogleStrategy für Google OAuth2
- GitHubStrategy für GitHub OAuth

// Endpoints:
GET /auth/google
GET /auth/google/callback
GET /auth/github  
GET /auth/github/callback

// Nach erfolgreicher OAuth:
1. User in DB erstellen/updaten
2. Workspace automatisch erstellen (falls neu)
3. JWT Token generieren
4. Redirect zu Frontend mit Token
```

### Epic 2.2: Customer Portal
**Ziel**: Self-Service Billing Management

#### User Story 2.2.1: Stripe Customer Portal
```javascript
// services/billing-service/src/routes/portal.js

POST /portal/session
- Input: { workspaceId }
- Prozess:
  1. Stripe Customer ID abrufen
  2. Portal Session erstellen
  3. Return URL setzen
- Output: { portalUrl }

// Features im Portal:
- Zahlungsmethode ändern
- Rechnungen herunterladen
- Subscription canceln
- Plan upgraden/downgraden
```

### Epic 2.3: Credit Top-ups
**Ziel**: Zusätzliche Credits on-demand kaufen

#### User Story 2.3.1: One-time Credit Purchase
```javascript
// services/billing-service/src/routes/credits.js

POST /credits/purchase
- Input: { workspaceId, creditAmount: 100|500|1000 }
- Prozess:
  1. Stripe Checkout Session erstellen
  2. Nach Payment: Credits zu workspace.additionalCredits
- Output: { checkoutUrl }

// Credit Packages:
- 100 Credits: $10
- 500 Credits: $40 (20% Rabatt)
- 1000 Credits: $70 (30% Rabatt)
```

---

## 🎯 PHASE 3: PRODUCTION READINESS (1 Woche)

### Epic 3.1: Monitoring & Observability
**Ziel**: Production-grade Monitoring

#### User Story 3.1.1: Metrics Collection
```javascript
// packages/common/src/monitoring/metrics.js

// Prometheus Metrics:
- api_requests_total
- api_request_duration_seconds
- credits_consumed_total
- subscription_changes_total
- ai_agent_processing_time
- websocket_connections_active

// Integration mit Grafana für Dashboards
```

#### User Story 3.1.2: Error Tracking
```javascript
// Sentry Integration in allen Services
- Error Capturing
- Performance Monitoring
- User Context
- Release Tracking
```

### Epic 3.2: Rate Limiting per Plan
**Ziel**: Fair Usage & Schutz

#### User Story 3.2.1: Dynamic Rate Limits
```javascript
// packages/common/src/middleware/rate-limit.js

const RATE_LIMITS = {
  free: {
    requests_per_minute: 10,
    websocket_messages_per_minute: 20
  },
  pro: {
    requests_per_minute: 60,
    websocket_messages_per_minute: 100
  },
  team: {
    requests_per_minute: 200,
    websocket_messages_per_minute: 500
  }
};
```

### Epic 3.3: Deployment Configuration
**Ziel**: Production Deployment Ready

#### User Story 3.3.1: Docker & Kubernetes
```yaml
# deployment/kubernetes/services/billing-service.yaml
- Deployment Configuration
- Service Configuration
- ConfigMaps für Stripe Keys
- Secrets Management
- Auto-scaling Rules
```

#### User Story 3.3.2: Environment Configuration
```bash
# .env.production
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_PRO=price_xxx
STRIPE_PRICE_ID_TEAM=price_xxx
SENTRY_DSN=https://xxx
REDIS_CLUSTER_URL=redis://cluster
MONGODB_REPLICA_SET=mongodb://replica
```

---

## 📅 Zeitplan

### Woche 1-2: Phase 1 (MVP-Kritisch)
- [ ] Billing Service erstellen
- [ ] Stripe Integration
- [ ] Credit System in Workspace
- [ ] Credit Middleware
- [ ] API Gateway Integration

### Woche 3: Phase 2 (Erweiterte Features)
- [ ] Social Auth (Google, GitHub)
- [ ] Customer Portal
- [ ] Credit Top-ups

### Woche 4: Phase 3 (Production Readiness)
- [ ] Monitoring Setup
- [ ] Rate Limiting per Plan
- [ ] Deployment Configuration
- [ ] Load Testing
- [ ] Security Audit

---

## 🧪 Test-Checkliste

### Unit Tests
- [ ] Billing Service Tests
- [ ] Credit System Tests
- [ ] OAuth Integration Tests

### Integration Tests
- [ ] Full Payment Flow
- [ ] Credit Consumption Flow
- [ ] Webhook Processing

### E2E Tests
- [ ] User Registration → Workspace → Upgrade → AI Usage
- [ ] Credit Limit Enforcement
- [ ] Subscription Lifecycle

### Load Tests
- [ ] 1000 concurrent users
- [ ] Credit System Performance
- [ ] WebSocket Scaling

---

## 🚨 Kritische Pfade

1. **Stripe Webhook Reliability**
   - Webhook Retry Logic
   - Idempotency Keys
   - Event Deduplication

2. **Credit System Consistency**
   - Atomic Credit Operations
   - Race Condition Prevention
   - Audit Log für alle Credit-Transaktionen

3. **Security**
   - PCI Compliance (via Stripe)
   - Secure Token Storage
   - Rate Limiting gegen Abuse

---

## 📝 Deployment Checklist

- [ ] Stripe Account Setup
- [ ] Products & Prices in Stripe Dashboard
- [ ] Webhook Endpoints konfiguriert
- [ ] SSL Certificates
- [ ] Domain Setup
- [ ] CDN Configuration
- [ ] Backup Strategy
- [ ] Monitoring Alerts
- [ ] On-Call Rotation

---

## 🎯 Success Metrics

- **Conversion Rate**: Free → Paid > 5%
- **MRR Growth**: 20% Month-over-Month
- **Credit Usage**: 70% der Paid User nutzen >50% ihrer Credits
- **Churn Rate**: < 5% monthly
- **System Uptime**: 99.9%

---

**Nächster Schritt**: Mit Epic 1.1 (Billing Service) beginnen!