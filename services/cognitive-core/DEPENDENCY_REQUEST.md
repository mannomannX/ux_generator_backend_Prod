# Dependency Request for @ux-flow/common

> **📋 Request from**: Cognitive Core Service  
> **🎯 Priority**: Critical (Service cannot start without these)  
> **📅 Required by**: Immediate

---

## 🚨 **Critical Dependencies (Service won't start without these)**

### **1. Logger Interface**
```typescript
// packages/common/src/logger/index.js
export class Logger {
  constructor(serviceName: string);
  
  info(message: string, metadata?: object): void;
  error(message: string, error?: Error, metadata?: object): void;
  warn(message: string, metadata?: object): void;
  debug(message: string, metadata?: object): void;
  
  // Agent-specific logging
  logAgentAction(agentName: string, action: string, metadata?: object): void;
  
  // Express middleware
  requestLogger(): (req, res, next) => void;
}
```

**Usage in Cognitive Core**:
```javascript
import { Logger } from '@ux-flow/common';
const logger = new Logger('cognitive-core');
logger.info('Service initialized');
logger.logAgentAction('manager', 'Task started', { taskId: 'task_123' });
```

### **2. EventEmitter Interface** 
```typescript
// packages/common/src/events/index.js
export class EventEmitter {
  constructor(logger: Logger, serviceName: string);
  
  emit(eventType: string, data: object): void;
  on(eventType: string, handler: Function): void;
  
  // Convenience methods used by Cognitive Core
  emitAgentTaskStarted(agentName: string, taskId: string, description: string): void;
  emitAgentTaskCompleted(agentName: string, taskId: string, result: any): void;
}

// Event type constants
export const EventTypes = {
  USER_MESSAGE_RECEIVED: 'user.message.received',
  USER_PLAN_APPROVED: 'user.plan.approved', 
  USER_PLAN_REJECTED: 'user.plan.rejected',
  USER_RESPONSE_READY: 'user.response.ready',
  
  AGENT_TASK_STARTED: 'agent.task.started',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  AGENT_TASK_FAILED: 'agent.task.failed',
  
  KNOWLEDGE_QUERY_REQUESTED: 'knowledge.query.requested',
  KNOWLEDGE_RESPONSE_READY: 'knowledge.response.ready',
  
  FLOW_UPDATE_REQUESTED: 'flow.update.requested',
  FLOW_UPDATED: 'flow.updated',
  FLOW_VALIDATION_REQUESTED: 'flow.validation.requested',
  FLOW_VALIDATION_COMPLETED: 'flow.validation.completed',
  
  SERVICE_ERROR: 'system.service.error',
  CONVERSATION_STATE_CHANGED: 'conversation.state.changed',
  SYSTEM_STATUS_CHANGED: 'system.status.changed'
};
```

### **3. Database Clients**

#### **MongoClient Interface**
```typescript
// packages/common/src/database/mongo-client.js
export class MongoClient {
  constructor(logger: Logger);
  
  async connect(uri?: string): Promise<void>;
  async disconnect(): Promise<void>;
  async healthCheck(): Promise<{ status: string, latency?: number }>;
  
  // Document operations
  async insertDocument(collection: string, document: object): Promise<any>;
  async findDocument(collection: string, query: object): Promise<any>;
  async updateDocument(collection: string, query: object, update: object, options?: object): Promise<any>;
  async deleteDocument(collection: string, query: object): Promise<any>;
  
  // Utility methods
  static createObjectId(): string;
  static isValidObjectId(id: string): boolean;
}
```

#### **RedisClient Interface**
```typescript
// packages/common/src/database/redis-client.js  
export class RedisClient {
  constructor(logger: Logger);
  
  async connect(url?: string): Promise<void>;
  async disconnect(): Promise<void>;
  async healthCheck(): Promise<{ status: string, latency?: number }>;
  
  // Pub/Sub operations
  async publish(channel: string, message: object): Promise<number>;
  async subscribe(channel: string, handler: Function): Promise<void>;
  
  // Cache operations
  async set(key: string, value: any, ttl?: number): Promise<string>;
  async get(key: string): Promise<any>;
  async del(key: string): Promise<number>;
}
```

### **4. Health Check System**
```typescript
// packages/common/src/utils/health-check.js
export class HealthCheck {
  constructor(serviceName: string, logger: Logger);
  
  addDependency(name: string, checkFunction: () => Promise<any>): void;
  async checkHealth(): Promise<object>;
  middleware(): (req, res, next) => void;
}
```

### **5. Retry Utilities**
```typescript
// packages/common/src/utils/retry.js
export class RetryUtils {
  static async retryApiCall(
    fn: () => Promise<any>, 
    options?: { 
      maxRetries?: number, 
      delay?: number, 
      backoffFactor?: number,
      logger?: Logger,
      shouldRetry?: (error: Error) => boolean 
    }
  ): Promise<any>;

  static async withRetry(
    fn: () => Promise<any>,
    options?: { 
      maxRetries?: number, 
      delay?: number, 
      logger?: Logger 
    }
  ): Promise<any>;
}
```

---

## 📋 **Implementation Requirements**

### **Logger Requirements**
- **Format**: Structured JSON logging
- **Levels**: info, warn, error, debug
- **Metadata**: Support for additional context objects  
- **Agent Logging**: Special method for agent actions
- **Express Middleware**: Request logging with correlation IDs

### **EventEmitter Requirements** 
- **Redis Integration**: Must use Redis pub/sub under the hood
- **Event Enrichment**: Auto-add timestamp, eventId, emittedBy
- **Error Handling**: Graceful handling of subscription errors
- **Convenience Methods**: Helper methods for common agent events

### **Database Client Requirements**
- **Connection Pooling**: Efficient connection management
- **Error Handling**: Graceful degradation on connection failures
- **Health Checks**: Connectivity and latency monitoring
- **MongoDB Integration**: Support for MongoDB operations with proper ObjectId handling
- **Redis Integration**: Pub/Sub and caching operations

### **Health Check Requirements**
- **Dependency Monitoring**: Track multiple service dependencies
- **Express Middleware**: Ready-to-use health endpoint
- **Response Format**: Consistent health check response structure
- **Async Checks**: Support for async dependency checks

### **Retry Utilities Requirements**
- **Exponential Backoff**: Configurable backoff strategies
- **Selective Retry**: Configurable retry conditions
- **API-Specific**: Special handling for API calls
- **Logging Integration**: Log retry attempts

---

## 🔧 **Usage Examples in Cognitive Core**

### **Service Initialization**
```javascript
// services/cognitive-core/src/server.js
import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';

const logger = new Logger('cognitive-core');
const eventEmitter = new EventEmitter(logger, 'cognitive-core');  
const mongoClient = new MongoClient(logger);
const redisClient = new RedisClient(logger);
const healthCheck = new HealthCheck('cognitive-core', logger);

// Health check dependencies
healthCheck.addDependency('mongodb', () => mongoClient.healthCheck());
healthCheck.addDependency('redis', () => redisClient.healthCheck());

// Express route
app.get('/health', healthCheck.middleware());
```

### **Agent Base Class**
```javascript
// services/cognitive-core/src/agents/agent-base.js
import { EventTypes, RetryUtils } from '@ux-flow/common';

class BaseAgent {
  async process(input, context) {
    // Emit task started
    this.eventEmitter.emitAgentTaskStarted(this.agentName, taskId, description);
    
    // Process with retry
    const result = await RetryUtils.retryApiCall(
      () => this.executeTask(input, context),
      { maxRetries: 2, delay: 1000, logger: this.logger }
    );
    
    // Emit completed
    this.eventEmitter.emitAgentTaskCompleted(this.agentName, taskId, result);
  }
}
```

### **Event Handling** 
```javascript
// services/cognitive-core/src/orchestrator/event-handlers.js
import { EventTypes } from '@ux-flow/common';

// Listen for events
this.eventEmitter.on(EventTypes.USER_MESSAGE_RECEIVED, this.handleUserMessage.bind(this));

// Emit events  
this.eventEmitter.emit(EventTypes.USER_RESPONSE_READY, {
  userId, projectId, response, originalEventId
});
```

---

## ⚡ **Priority Implementation Order**

1. **🔥 Critical (Day 1)**: Logger, EventTypes constants
2. **🔥 Critical (Day 1)**: EventEmitter with basic pub/sub
3. **🔥 Critical (Day 2)**: MongoClient basic operations
4. **🔥 Critical (Day 2)**: RedisClient basic operations  
5. **⚠️ Important (Day 3)**: HealthCheck system
6. **⚠️ Important (Day 3)**: RetryUtils with exponential backoff

---

## 🧪 **Testing Requirements**

The @ux-flow/common package needs to be mockable for testing:

```javascript
// Should support mocking like this:
jest.mock('@ux-flow/common', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    logAgentAction: jest.fn()
  })),
  EventEmitter: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    emitAgentTaskStarted: jest.fn()
  }))
}));
```

---

**📝 Note**: Once these dependencies are implemented in @ux-flow/common, the Cognitive Core service will be fully functional and ready for production deployment.