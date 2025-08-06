# @ux-flow/common - Shared Utilities Package

> **⚠️ DOCUMENTATION MAINTENANCE REQUIRED**  
> When making changes to this package, you MUST update this README if the changes affect:
> - API interfaces (Logger, EventEmitter, Database clients)
> - Event type definitions or schemas
> - Authentication middleware or JWT utilities
> - Validation schemas or utilities
> - Database connection interfaces

---

## 🎯 **Package Overview**

### **Purpose**
Centralized shared utilities and infrastructure components for all UX-Flow-Engine microservices. Provides consistent logging, database connectivity, authentication, validation, and event handling across the entire system.

### **Core Responsibilities**
- **Structured Logging**: Consistent JSON logging with correlation IDs and service identification
- **Database Connectivity**: MongoDB and Redis client wrappers with health checking
- **Authentication & Authorization**: JWT utilities and Express middleware for auth
- **Event System**: Centralized event type definitions and enhanced EventEmitter
- **Validation**: Joi-based schema validation for all API inputs and data structures
- **Health Monitoring**: Health check utilities and dependency monitoring
- **Error Handling**: Retry utilities and standardized error patterns

### **Package Dependencies**

#### **Core Dependencies**
| Dependency | Version | Purpose | Critical |
|------------|---------|---------|----------|
| `winston` | `^3.13.0` | Structured logging framework | Yes |
| `redis` | `^4.6.13` | Redis client for caching and pub/sub | Yes |
| `mongodb` | `^6.5.0` | MongoDB driver for database operations | Yes |
| `jsonwebtoken` | `^9.0.2` | JWT token creation and verification | Yes |
| `joi` | `^17.12.3` | Schema validation and sanitization | Yes |
| `axios` | `^1.7.2` | HTTP client for external API calls | No |
| `lodash` | `^4.17.21` | Utility functions for data manipulation | No |

#### **Peer Dependencies**
| Dependency | Version | Purpose | When Required |
|------------|---------|---------|---------------|
| `express` | `^4.19.0` | Web framework for middleware | When using auth middleware |

---

## 🔌 **API Interface Specification**

### **Logger Interface**

#### **Logger Class**
```javascript
import { Logger } from '@ux-flow/common';

const logger = new Logger('service-name');

// Standard logging methods
logger.info('User created', { userId: '123', email: 'user@example.com' });
logger.error('Database connection failed', error, { retryAttempt: 3 });
logger.warn('Rate limit approaching', { requests: 95, limit: 100 });
logger.debug('Processing request', { requestId: 'req_123' });

// Agent-specific logging
logger.logAgentAction('planner', 'Plan generated', { stepCount: 5 });

// Express middleware
app.use(logger.requestLogger());
```

**Log Format Output**:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "service-name",
  "message": "User created",
  "userId": "123",
  "email": "user@example.com"
}
```

### **Database Clients**

#### **MongoClient Interface**
```javascript
import { MongoClient } from '@ux-flow/common';

const mongo = new MongoClient(logger);
await mongo.connect('mongodb://localhost:27017/ux-flow-engine');

// Basic operations
const result = await mongo.insertDocument('users', userData);
const user = await mongo.findDocument('users', { email: 'user@example.com' });
await mongo.updateDocument('users', { _id: userId }, { $set: { lastLogin: new Date() } });

// Health check
const health = await mongo.healthCheck();
// Returns: { status: 'ok', latency: 45 }

// Utilities
const objectId = MongoClient.createObjectId();
const isValid = MongoClient.isValidObjectId('507f1f77bcf86cd799439011');
```

#### **RedisClient Interface**
```javascript
import { RedisClient } from '@ux-flow/common';

const redis = new RedisClient(logger);
await redis.connect('redis://localhost:6379');

// Pub/Sub operations
await redis.publish('user-events', { userId: '123', action: 'login' });
await redis.subscribe('user-events', (message) => {
  console.log('Received:', message);
});

// Caching operations
await redis.set('user:123', userData, 3600); // 1 hour TTL
const cached = await redis.get('user:123');
await redis.del('user:123');

// Health check
const health = await redis.healthCheck();
// Returns: { status: 'ok', latency: 12 }
```

### **Authentication System**

#### **JWT Utilities**
```javascript
import { JWTUtils } from '@ux-flow/common';

// Create tokens
const token = JWTUtils.sign({
  userId: '123',
  email: 'user@example.com',
  workspaceId: 'ws_456',
  role: 'user',
  permissions: ['read_projects', 'write_projects']
});

// Verify tokens
const decoded = JWTUtils.verify(token);
// Returns: { userId: '123', email: '...', ... } or null if invalid

// Get token information
const tokenInfo = JWTUtils.getTokenInfo(token);
// Returns: { userId, email, isExpired, timeToExpiry, ... }

// Create specialized tokens
const workspaceToken = JWTUtils.createWorkspaceToken('user123', 'ws456', 'admin');
const serviceToken = JWTUtils.createServiceToken('cognitive-core', ['ai_processing']);
```

#### **Authentication Middleware**
```javascript
import { requireAuth, optionalAuth, requirePermission, requireRole } from '@ux-flow/common';

// Basic authentication
app.get('/protected', requireAuth, (req, res) => {
  console.log(req.user); // { userId, email, workspaceId, role, permissions }
});

// Optional authentication
app.get('/public', optionalAuth, (req, res) => {
  if (req.user) {
    // User is authenticated
  }
});

// Permission-based access
app.post('/admin', requirePermission('admin_access'), handler);
app.delete('/users/:id', requireRole('admin'), handler);

// Custom auth requirements
import { createAuthMiddleware } from '@ux-flow/common';
const customAuth = createAuthMiddleware({
  requiredPermissions: ['read_flows', 'write_flows'],
  requiredRole: 'editor',
  allowServiceTokens: true
});
```

### **Event System**

#### **Event Types (Constants)**
```javascript
import { EventTypes } from '@ux-flow/common';

// Available event types
EventTypes.USER_MESSAGE_RECEIVED     // 'user.message.received'
EventTypes.USER_PLAN_APPROVED        // 'user.plan.approved'
EventTypes.AGENT_TASK_STARTED        // 'agent.task.started'
EventTypes.FLOW_UPDATE_REQUESTED     // 'flow.update.requested'
EventTypes.KNOWLEDGE_QUERY_REQUESTED // 'knowledge.query.requested'
// ... see full list in source
```

#### **Enhanced EventEmitter**
```javascript
import { EventEmitter } from '@ux-flow/common';

const eventEmitter = new EventEmitter(logger, 'service-name');

// Emit events (auto-enriched with metadata)
eventEmitter.emit(EventTypes.USER_MESSAGE_RECEIVED, {
  userId: 'user_123',
  projectId: 'proj_456',
  message: 'Create a login flow'
});

// Listen to events
eventEmitter.on(EventTypes.FLOW_UPDATED, (data) => {
  console.log('Flow updated:', data.projectId);
  // data includes: emittedBy, emittedAt, eventId
});

// Convenience methods
eventEmitter.emitAgentTaskStarted('planner', 'task_123', 'Creating flow plan');
eventEmitter.emitFlowUpdateRequested('proj_456', 'user_123', transactions);
```

### **Validation System**

#### **Pre-defined Schemas**
```javascript
import { 
  validateSchema,
  userRegistrationSchema,
  userLoginSchema,
  projectCreateSchema,
  flowUpdateSchema,
  knowledgeQuerySchema,
  paginationSchema
} from '@ux-flow/common';

// Validate user registration
const validation = validateSchema(userRegistrationSchema, {
  email: 'user@example.com',
  password: 'securePassword123',
  firstName: 'John',
  lastName: 'Doe'
});

if (!validation.isValid) {
  console.log(validation.errors);
  // [{ field: 'email', message: '...', value: '...' }]
}

// Use validated data
const userData = validation.value;
```

#### **Validators Utility**
```javascript
import { Validators } from '@ux-flow/common';

// Email validation
const isValid = Validators.isValidEmail('user@example.com'); // true

// Password strength
const isStrong = Validators.isValidPassword('MySecure123'); // true

// MongoDB ObjectId
const isValidId = Validators.isValidObjectId('507f1f77bcf86cd799439011'); // true

// Sanitization
const clean = Validators.sanitizeHtml('<script>alert("xss")</script>');
// Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'

// File upload validation
const fileValidation = Validators.validateFileUpload(file, {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png'],
  allowedExtensions: ['.jpg', '.png']
});
```

### **Health Check System**

#### **HealthCheck Class**
```javascript
import { HealthCheck } from '@ux-flow/common';

const healthCheck = new HealthCheck('service-name', logger);

// Register dependencies
healthCheck.addDependency('mongodb', () => mongo.healthCheck());
healthCheck.addDependency('redis', () => redis.healthCheck());
healthCheck.addDependency('external-api', async () => {
  const response = await axios.get('https://api.external.com/health');
  return { status: response.status === 200 ? 'ok' : 'error' };
});

// Use as Express middleware
app.get('/health', healthCheck.middleware());

// Manual health check
const health = await healthCheck.checkHealth();
```

**Health Check Response Format**:
```json
{
  "service": "service-name",
  "status": "ok|degraded|error",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 12345,
  "dependencies": {
    "mongodb": "ok",
    "redis": "ok",
    "external-api": "error"
  }
}
```

### **Retry Utilities**

#### **RetryUtils Class**
```javascript
import { RetryUtils } from '@ux-flow/common';

// Generic retry
const result = await RetryUtils.withRetry(
  () => unstableOperation(),
  {
    maxRetries: 3,
    delay: 1000,
    backoffFactor: 2,
    shouldRetry: (error) => error.code !== 'INVALID_INPUT',
    logger: logger
  }
);

// API-specific retry (automatically retries on network/5xx errors)
const apiResult = await RetryUtils.retryApiCall(
  () => axios.get('https://api.external.com/data'),
  { maxRetries: 2, delay: 500 }
);
```

---

## 📋 **Complete Schema Definitions**

### **User & Authentication Schemas**
```javascript
// User Registration
userRegistrationSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  workspaceName: Joi.string().min(2).max(50).optional()
});

// User Login
userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Password Change
changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required()
});
```

### **Project & Flow Schemas**
```javascript
// Project Creation
projectCreateSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  visibility: Joi.string().valid('private', 'public', 'workspace').default('private'),
  template: Joi.string().valid('empty', 'basic', 'ecommerce').default('empty')
});

// Flow Node
flowNodeSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid(
    'Start', 'End', 'Screen', 'Popup', 'API Call', 
    'Decision', 'Component', 'Note'
  ).required(),
  position: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required()
  }).optional(),
  data: Joi.object().optional()
});

// Flow Transaction
transactionSchema = Joi.object({
  action: Joi.string().valid(
    'ADD_NODE', 'UPDATE_NODE', 'DELETE_NODE',
    'ADD_EDGE', 'UPDATE_EDGE', 'DELETE_EDGE'
  ).required(),
  payload: Joi.object().required()
});
```

### **Knowledge & Workspace Schemas**
```javascript
// Knowledge Query
knowledgeQuerySchema = Joi.object({
  query: Joi.string().min(1).max(1000).required(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  workspaceId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  nResults: Joi.number().integer().min(1).max(50).default(5),
  includeGlobal: Joi.boolean().default(true)
});

// Workspace Creation
workspaceCreateSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  description: Joi.string().max(500).optional(),
  settings: Joi.object({
    allowGuestAccess: Joi.boolean().default(false),
    maxProjects: Joi.number().integer().min(1).max(1000).default(10)
  }).optional()
});

// WebSocket Message
websocketMessageSchema = Joi.object({
  type: Joi.string().valid(
    'user_message', 'plan_approved', 'plan_feedback', 
    'image_upload', 'ping', 'join_project', 'leave_project'
  ).required(),
  message: Joi.string().when('type', {
    is: Joi.string().valid('user_message', 'plan_feedback'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  projectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  qualityMode: Joi.string().valid('standard', 'pro').default('standard')
});
```

---

## ⚙️ **Configuration & Environment**

### **Required Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `JWT_SECRET` | ✅ | - | JWT signing secret | `your-super-secret-jwt-key` |
| `JWT_EXPIRES_IN` | ❌ | `7d` | JWT token expiration | `24h` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |
| `NODE_ENV` | ❌ | `development` | Environment mode | `production` |
| `MONGODB_URI` | ❌ | - | MongoDB connection (if using MongoClient) | `mongodb://localhost:27017/db` |
| `REDIS_URL` | ❌ | - | Redis connection (if using RedisClient) | `redis://localhost:6379` |

### **Package Configuration**
```javascript
// package.json setup for consuming services
{
  "dependencies": {
    "@ux-flow/common": "^1.0.0"
  }
}

// Import patterns
import { Logger, EventEmitter, MongoClient } from '@ux-flow/common';

// Or specific imports
import { validateSchema, userRegistrationSchema } from '@ux-flow/common';
```

---

## 🛠️ **Development & Usage**

### **Package Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+

# Installation
cd packages/common
npm install

# Development mode (TypeScript compilation)
npm run dev

# Build package
npm run build

# Run tests
npm test

# Coverage report
npm run test:coverage

# Lint code
npm run lint:fix
```

### **Using in Services**
```bash
# Install in a service
cd services/your-service
npm install @ux-flow/common

# Use in service code
import { Logger, requireAuth, validateSchema } from '@ux-flow/common';
```

### **Package Structure**
```
packages/common/
├── src/
│   ├── auth/                   # JWT utilities and middleware
│   │   ├── jwt-utils.js
│   │   ├── auth-middleware.js
│   │   └── index.js
│   ├── database/               # Database clients
│   │   ├── mongo-client.js
│   │   ├── redis-client.js
│   │   └── index.js
│   ├── events/                 # Event system
│   │   └── index.js
│   ├── logger/                 # Logging utilities
│   │   └── index.js
│   ├── utils/                  # Health checks, retry logic
│   │   ├── health-check.js
│   │   ├── retry.js
│   │   └── index.js
│   ├── validation/             # Joi schemas and validators
│   │   ├── schemas.js
│   │   ├── validators.js
│   │   └── index.js
│   └── index.js               # Main exports
├── types/                      # TypeScript definitions
├── dist/                       # Compiled output
├── package.json
└── README.md
```

---

## 🧪 **Testing Guidelines**

### **Testing Common Utilities**
```javascript
// Example service test using common utilities
import { Logger, validateSchema, userRegistrationSchema } from '@ux-flow/common';

describe('User Registration', () => {
  let logger;
  
  beforeEach(() => {
    logger = new Logger('test-service');
  });
  
  it('should validate user registration data', () => {
    const userData = {
      email: 'test@example.com',
      password: 'SecurePass123',
      firstName: 'Test',
      lastName: 'User'
    };
    
    const validation = validateSchema(userRegistrationSchema, userData);
    
    expect(validation.isValid).toBe(true);
    expect(validation.value).toEqual(expect.objectContaining({
      email: 'test@example.com',
      firstName: 'Test'
    }));
  });
  
  it('should reject invalid email', () => {
    const userData = { email: 'invalid-email', password: 'SecurePass123' };
    const validation = validateSchema(userRegistrationSchema, userData);
    
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContainEqual(
      expect.objectContaining({
        field: 'email',
        message: expect.stringContaining('valid email')
      })
    );
  });
});
```

### **Mock Database Clients for Testing**
```javascript
// Mock MongoClient for service tests
jest.mock('@ux-flow/common', () => ({
  ...jest.requireActual('@ux-flow/common'),
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    getDb: jest.fn(() => ({
      collection: jest.fn(() => ({
        findOne: jest.fn(),
        insertOne: jest.fn(),
        updateOne: jest.fn()
      }))
    })),
    healthCheck: jest.fn(() => Promise.resolve({ status: 'ok' }))
  }))
}));
```

---

## 🔍 **Event Type Reference**

### **Complete Event Types List**
```javascript
export const EventTypes = {
  // User Interaction Events
  USER_MESSAGE_RECEIVED: 'user.message.received',
  USER_PLAN_APPROVED: 'user.plan.approved',
  USER_PLAN_REJECTED: 'user.plan.rejected',
  USER_FEEDBACK_RECEIVED: 'user.feedback.received',
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged.in',
  USER_LOGGED_OUT: 'user.logged.out',
  USER_DELETED: 'user.deleted',

  // Agent Processing Events
  AGENT_TASK_STARTED: 'agent.task.started',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  AGENT_TASK_FAILED: 'agent.task.failed',

  // Knowledge & RAG Events
  KNOWLEDGE_QUERY_REQUESTED: 'knowledge.query.requested',
  KNOWLEDGE_RESPONSE_READY: 'knowledge.response.ready',
  KNOWLEDGE_INDEX_UPDATED: 'knowledge.index.updated',

  // Flow Management Events
  FLOW_UPDATE_REQUESTED: 'flow.update.requested',
  FLOW_UPDATED: 'flow.updated',
  FLOW_VALIDATION_REQUESTED: 'flow.validation.requested',
  FLOW_VALIDATION_COMPLETED: 'flow.validation.completed',
  FLOW_CREATED: 'flow.created',
  FLOW_DELETED: 'flow.deleted',

  // Workspace Events
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_UPDATED: 'workspace.updated',
  WORKSPACE_DELETED: 'workspace.deleted',
  WORKSPACE_MEMBER_ADDED: 'workspace.member.added',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member.removed',

  // Project Events
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',

  // System & Infrastructure Events
  SERVICE_HEALTH_CHECK: 'system.health.check',
  SERVICE_READY: 'system.service.ready',
  SERVICE_ERROR: 'system.service.error',

  // WebSocket Events
  CLIENT_CONNECTED: 'websocket.client.connected',
  CLIENT_DISCONNECTED: 'websocket.client.disconnected',
  BROADCAST_TO_ROOM: 'websocket.broadcast.room'
};
```

---

## 🚨 **Common Integration Patterns**

### **Service Initialization Pattern**
```javascript
// Standard service setup using common utilities
import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';

class MyService {
  constructor() {
    this.logger = new Logger('my-service');
    this.eventEmitter = new EventEmitter(this.logger, 'my-service');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('my-service', this.logger);
  }

  async initialize() {
    // Connect to databases
    await this.mongoClient.connect();
    await this.redisClient.connect();

    // Setup health checks
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());

    // Setup event listeners
    this.setupEventListeners();

    this.logger.info('Service initialized successfully');
  }

  setupEventListeners() {
    this.eventEmitter.on(EventTypes.USER_MESSAGE_RECEIVED, this.handleUserMessage.bind(this));
  }
}
```

### **Express App Integration Pattern**
```javascript
import express from 'express';
import { requireAuth, validateSchema, userCreateSchema } from '@ux-flow/common';

const app = express();

// Authentication middleware
app.use('/api/protected', requireAuth);

// Validation middleware
const validateUserCreate = (req, res, next) => {
  const validation = validateSchema(userCreateSchema, req.body);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }
  req.validatedData = validation.value;
  next();
};

app.post('/api/users', validateUserCreate, (req, res) => {
  // req.validatedData contains clean, validated user data
  // req.user contains authenticated user info (from requireAuth)
});
```

### **Event-Driven Communication Pattern**
```javascript
// Publisher service
import { EventEmitter, EventTypes } from '@ux-flow/common';

const eventEmitter = new EventEmitter(logger, 'publisher-service');

// Emit with auto-enrichment
eventEmitter.emit(EventTypes.FLOW_UPDATE_REQUESTED, {
  projectId: 'proj_123',
  userId: 'user_456',
  transactions: [...]
});

// Consumer service
import { EventTypes } from '@ux-flow/common';

eventEmitter.on(EventTypes.FLOW_UPDATE_REQUESTED, async (data) => {
  logger.info('Received flow update request', {
    projectId: data.projectId,
    eventId: data.eventId,
    emittedBy: data.emittedBy
  });
  
  // Process the update
  await processFlowUpdate(data.transactions);
});
```

---

## 📚 **Best Practices**

### **Logging Best Practices**
```javascript
// ✅ Good: Structured logging with context
logger.info('User authentication successful', {
  userId: user.id,
  email: user.email,
  loginMethod: 'password',
  ipAddress: req.ip
});

// ❌ Bad: Unstructured logging
logger.info('User ' + user.email + ' logged in');

// ✅ Good: Error logging with full context
logger.error('Database query failed', error, {
  query: 'findUser',
  collection: 'users',
  userId: user.id,
  retryAttempt: 2
});
```

### **Validation Best Practices**
```javascript
// ✅ Good: Validate at service boundaries
app.post('/api/users', (req, res) => {
  const validation = validateSchema(userRegistrationSchema, req.body);
  if (!validation.isValid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }
  
  // Use validated data
  const userData = validation.value;
});

// ✅ Good: Sanitize user input
const cleanInput = Validators.cleanUserInput(req.body.description, {
  maxLength: 500,
  allowHtml: false,
  trimWhitespace: true
});
```

### **Authentication Best Practices**
```javascript
// ✅ Good: Use appropriate middleware for endpoints
app.get('/public-data', optionalAuth, handler);           // Optional auth
app.get('/user-profile', requireAuth, handler);           // Require auth
app.post('/admin-action', requireRole('admin'), handler); // Require role
app.delete('/sensitive', requirePermission('delete_all'), handler); // Require permission

// ✅ Good: Handle auth errors gracefully
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid token'
    });
  }
  next(err);
});
```

### **Event System Best Practices**
```javascript
// ✅ Good: Use constants for event types
eventEmitter.emit(EventTypes.USER_REGISTERED, userData);

// ❌ Bad: Magic strings
eventEmitter.emit('user-registered', userData);

// ✅ Good: Include correlation IDs
eventEmitter.emit(EventTypes.FLOW_UPDATE_REQUESTED, {
  ...updateData,
  correlationId: req.correlationId
});

// ✅ Good: Handle event errors
eventEmitter.on(EventTypes.USER_REGISTERED, async (data) => {
  try {
    await processUserRegistration(data);
  } catch (error) {
    logger.error('Failed to process user registration', error, {
      userId: data.userId,
      eventId: data.eventId
    });
  }
});
```

---

## 🔄 **Version Compatibility**

### **Current Version: 1.0.0**
- Initial release with core utilities
- MongoDB and Redis client wrappers
- JWT authentication system
- Joi validation schemas
- Winston logging integration

### **Breaking Changes Policy**
- **Major versions** (2.0.0): Breaking API changes
- **Minor versions** (1.1.0): New features, backward compatible
- **Patch versions** (1.0.1): Bug fixes, no API changes

### **Upgrade Guidelines**
When updating @ux-flow/common in services:
1. Check CHANGELOG.md for breaking changes
2. Update import statements if needed
3. Run tests to ensure compatibility
4. Update service-specific implementations

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Package Owner | @platform-team-lead | API design, breaking changes, architecture |
| Primary Developer | @common-utilities-dev | Feature development, bug fixes |
| Security Lead | @security-team | Auth utilities, validation, security reviews |

---

> **🔄 Last Updated**: 2024-02-01  
> **📋 Documentation Version**: 1.0  
> **🤖 Auto-validation**: ✅ All interfaces documented / ✅ Schemas current / ✅ Examples tested