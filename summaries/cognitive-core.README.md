# Cognitive Core Service - AI Agent Orchestration

> **⚠️ DOCUMENTATION MAINTENANCE REQUIRED**  
> When making changes to this service, you MUST update this README if the changes affect:
> - Agent specifications (input/output schemas, prompts)
> - Event schemas (published/consumed events)
> - Agent orchestration workflows
> - Environment variables or AI model configuration
> - Inter-agent communication protocols

---

## 🎯 **Service Overview**

### **Purpose**
The AI brain of the UX-Flow-Engine that orchestrates 9 specialized AI agents to process user requests, create detailed execution plans, and manage intelligent conversation flow using Google Gemini models. Acts as the central cognitive hub for all AI-powered interactions.

### **Core Responsibilities**
- **Multi-Agent Orchestration**: Coordinates 9 specialized AI agents in complex workflows
- **Conversation Management**: Maintains conversation state and context across user sessions
- **Plan Generation & Execution**: Creates detailed execution plans for UX tasks and converts them to executable transactions
- **Response Synthesis**: Combines multiple agent outputs into coherent user responses
- **Quality Mode Management**: Handles standard vs pro AI model usage based on task complexity

### **Service Dependencies**

#### **Input Dependencies (Services this service consumes)**
| Service | Communication Method | Purpose | Required |
|---------|---------------------|---------|----------|
| `api-gateway` | Redis Events | Receives user messages and plan approvals | Yes |
| `knowledge-service` | Redis Events | Receives RAG context for informed responses | No |
| `flow-service` | Redis Events | Receives current flow state for plan generation | Yes |

#### **Output Dependencies (Services that consume this service)**
| Service | Communication Method | What they get from us | Critical |
|---------|---------------------|----------------------|----------|
| `api-gateway` | Redis Events | User responses and plan proposals | Yes |
| `knowledge-service` | Redis Events | Knowledge queries for RAG context | No |
| `flow-service` | Redis Events | Flow update transactions | Yes |

#### **External Dependencies**
| Dependency | Type | Purpose | Fallback Strategy |
|------------|------|---------|------------------|
| Google Gemini API | External AI API | AI model inference | Retry with exponential backoff, degraded responses |
| MongoDB Atlas | Database | Conversation persistence | Circuit breaker, memory-only mode |
| Redis | Cache/Events | State management & inter-service communication | Event queuing with retry |

---

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3001`
- **Production**: `https://api.uxflow.app/cognitive-core`

### **Authentication**
- **Type**: None (internal service)
- **Communication**: Redis event-based with other services

### **API Endpoints**

#### **GET /health**
**Purpose**: Service health check with dependency status

**Authentication**: ❌ Not required

**Response Schema** (200 Success):
```json
{
  "service": "cognitive-core",
  "status": "ok|degraded|error",
  "uptime": 12345,
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "google-gemini": "ok|error"
  },
  "agents": {
    "available": ["manager", "planner", "architect", "validator", "classifier", "synthesizer", "uxExpert", "visualInterpreter", "analyst"],
    "status": "active"
  },
  "timestamp": "ISO8601"
}
```

#### **GET /agents**
**Purpose**: List available agents and their status

**Response Schema** (200 Success):
```json
{
  "agents": ["manager", "planner", "architect", "validator", "classifier", "synthesizer", "uxExpert", "visualInterpreter", "analyst"],
  "status": "active"
}
```

#### **POST /agents/:agentName/invoke**
**Purpose**: Manual agent invocation for testing and debugging

**Request Schema**:
```json
{
  "prompt": "string|object",
  "context": {
    "qualityMode": "standard|pro",
    "currentFlow": "object",
    "ragContext": "string",
    "additionalContext": "object"
  }
}
```

**Response Schema** (200 Success):
```json
{
  "success": true,
  "result": "object|string - agent-specific response format"
}
```

**Error Responses**:
```json
// 404 Agent Not Found
{
  "success": false,
  "error": "Agent 'invalid-agent' not found"
}

// 500 Agent Execution Error
{
  "success": false,
  "error": "Agent execution failed: specific error message"
}
```

---

## 📡 **Event-Driven Communication**

### **Published Events (Events this service emits)**

#### **USER_RESPONSE_READY**
- **Trigger**: After processing user message through agent workflow
- **Frequency**: Per user interaction (variable volume)
- **Consumers**: API Gateway

**Event Schema**:
```json
{
  "eventType": "USER_RESPONSE_READY",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "cognitive-core",
  "data": {
    "userId": "string",
    "projectId": "string",
    "response": {
      "type": "plan_for_approval|answer|clarification_needed",
      "message": "string",
      "plan": "array - if type is plan_for_approval",
      "metadata": {
        "complexity": "simple|complex|very_complex",
        "agentsInvolved": ["agent", "names"],
        "question": "string - if clarification needed"
      }
    },
    "originalEventId": "string"
  },
  "metadata": {
    "correlationId": "string",
    "processingTimeMs": "number"
  }
}
```

#### **KNOWLEDGE_QUERY_REQUESTED**
- **Trigger**: When UX Expert agent needs RAG context
- **Frequency**: Subset of user interactions
- **Consumers**: Knowledge Service

**Event Schema**:
```json
{
  "eventType": "KNOWLEDGE_QUERY_REQUESTED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "cognitive-core",
  "data": {
    "userId": "string",
    "projectId": "string",
    "query": "string",
    "context": {
      "currentFlow": "object",
      "conversationHistory": "string"
    }
  },
  "metadata": {
    "correlationId": "string",
    "urgency": "normal|high"
  }
}
```

#### **FLOW_UPDATE_REQUESTED**
- **Trigger**: After plan approval and transaction generation
- **Frequency**: Per approved plan
- **Consumers**: Flow Service

**Event Schema**:
```json
{
  "eventType": "FLOW_UPDATE_REQUESTED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "cognitive-core",
  "data": {
    "userId": "string",
    "projectId": "string",
    "transactions": [
      {
        "action": "ADD_NODE|UPDATE_NODE|DELETE_NODE|ADD_EDGE|DELETE_EDGE",
        "payload": "object - action-specific data"
      }
    ],
    "originalPlan": "array - plan that generated these transactions",
    "validationStatus": {
      "status": "OK|ERROR",
      "issues": ["string array - if any validation issues"]
    }
  },
  "metadata": {
    "correlationId": "string",
    "priority": "normal|high"
  }
}
```

#### **AGENT_TASK_STARTED / AGENT_TASK_COMPLETED / AGENT_TASK_FAILED**
- **Trigger**: Agent lifecycle events
- **Frequency**: Multiple per user interaction
- **Consumers**: Monitoring, Analytics

**Event Schema**:
```json
{
  "eventType": "AGENT_TASK_STARTED|AGENT_TASK_COMPLETED|AGENT_TASK_FAILED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "cognitive-core",
  "data": {
    "agentName": "string",
    "taskId": "string",
    "taskDescription": "string",
    "result": "object - only for COMPLETED events",
    "error": "string - only for FAILED events"
  },
  "metadata": {
    "correlationId": "string",
    "executionTimeMs": "number - for completed/failed"
  }
}
```

### **Consumed Events (Events this service listens to)**

#### **USER_MESSAGE_RECEIVED**
- **Source**: API Gateway
- **Purpose**: Start AI processing workflow for user conversations
- **Handler**: `src/orchestrator/event-handlers.js:handleUserMessage`
- **Failure Strategy**: Retry 2x with exponential backoff, emit error event

**Expected Schema**:
```json
{
  "eventType": "USER_MESSAGE_RECEIVED",
  "data": {
    "userId": "string",
    "projectId": "string",
    "message": "string",
    "qualityMode": "standard|pro",
    "context": {
      "imageData": "base64 string - optional for visual interpretation",
      "sessionId": "string"
    }
  }
}
```

#### **USER_PLAN_APPROVED / USER_PLAN_REJECTED**
- **Source**: API Gateway
- **Purpose**: Handle user plan approval/rejection workflow
- **Handler**: `src/orchestrator/event-handlers.js:handlePlanApproval`
- **Failure Strategy**: Retry 3x, log error, notify user of system issue

**Expected Schema**:
```json
{
  "eventType": "USER_PLAN_APPROVED|USER_PLAN_REJECTED",
  "data": {
    "userId": "string",
    "projectId": "string",
    "plan": "array - the plan being approved/rejected",
    "approved": "boolean",
    "currentFlow": "object - flow state at time of approval",
    "feedback": "string - optional user feedback for rejection"
  }
}
```

#### **KNOWLEDGE_RESPONSE_READY**
- **Source**: Knowledge Service
- **Purpose**: Receive RAG context for informed agent responses
- **Handler**: `src/orchestrator/event-handlers.js:handleKnowledgeResponse`
- **Failure Strategy**: Continue without RAG context, log warning

**Expected Schema**:
```json
{
  "eventType": "KNOWLEDGE_RESPONSE_READY",
  "data": {
    "queryId": "string",
    "ragContext": "string",
    "relevantDocuments": ["array of document references"],
    "confidence": "number 0-1"
  }
}
```

#### **FLOW_UPDATED**
- **Source**: Flow Service
- **Purpose**: Confirm flow updates and sync conversation state
- **Handler**: `src/orchestrator/event-handlers.js:handleFlowUpdate`
- **Failure Strategy**: Log discrepancy, request flow state sync

**Expected Schema**:
```json
{
  "eventType": "FLOW_UPDATED",
  "data": {
    "userId": "string",
    "projectId": "string",
    "updatedFlow": "object",
    "appliedTransactions": "array",
    "success": "boolean",
    "errors": ["array - if any transaction failures"]
  }
}
```

---

## 🗄️ **Data Layer Specification**

### **Database Schema**

#### **Collection: `conversations`**
```json
{
  "_id": "ObjectId",
  "conversationId": "string - userId-projectId",
  "userId": "string",
  "projectId": "string",
  "lastMessage": "string",
  "lastResponse": {
    "type": "string",
    "message": "string",
    "metadata": "object"
  },
  "classification": {
    "intent": "string",
    "sentiment": "string",
    "tasks": ["array"],
    "questions": ["array"]
  },
  "context": {
    "fullContext": "string",
    "improvementSuggestion": "string",
    "currentFlow": "object",
    "knowledgeContext": "string"
  },
  "agentHistory": [
    {
      "agentName": "string",
      "taskId": "string",
      "input": "object",
      "output": "object",
      "executionTimeMs": "number",
      "timestamp": "Date"
    }
  ],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes**:
- `{ "conversationId": 1 }` - Primary lookup
- `{ "userId": 1, "projectId": 1 }` - User project conversations
- `{ "updatedAt": -1 }` - Recent conversations
- `{ "createdAt": 1 }` - TTL index for data retention

#### **Collection: `agent_performance`**
```json
{
  "_id": "ObjectId",
  "agentName": "string",
  "taskId": "string",
  "executionTimeMs": "number",
  "inputTokens": "number",
  "outputTokens": "number",
  "qualityMode": "string",
  "success": "boolean",
  "errorType": "string",
  "timestamp": "Date"
}
```

**Indexes**:
- `{ "agentName": 1, "timestamp": -1 }` - Agent performance analysis
- `{ "timestamp": -1 }` - Time-based queries
- `{ "success": 1, "agentName": 1 }` - Success rate analysis

### **Cache Strategy**

#### **Redis Cache Keys**
| Pattern | TTL | Purpose | Invalidation |
|---------|-----|---------|-------------|
| `conversation:{conversationId}` | 3600s | Conversation state | On new message |
| `agent:prompt:{agentName}:{hash}` | 86400s | Prompt template cache | On prompt update |
| `model:response:{hash}` | 1800s | AI model response cache | TTL expiry |
| `flow:state:{userId}:{projectId}` | 1800s | Flow state cache | On flow update |

---

## ⚙️ **Configuration & Environment**

### **Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `COGNITIVE_CORE_PORT` | ✅ | `3001` | HTTP server port | `3001` |
| `NODE_ENV` | ✅ | `development` | Environment mode | `production` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |
| `GOOGLE_API_KEY` | ✅ | - | Google Gemini API key | `AIza...` |
| `MONGODB_URI` | ✅ | - | Database connection | `mongodb://...` |
| `REDIS_URL` | ✅ | - | Redis connection | `redis://...` |
| `AGENT_DEFAULT_QUALITY_MODE` | ❌ | `standard` | Default AI model quality | `pro` |
| `AGENT_RETRY_ATTEMPTS` | ❌ | `2` | AI call retry count | `3` |
| `AGENT_TIMEOUT_MS` | ❌ | `30000` | AI call timeout | `60000` |

### **Secrets (Managed via Secret Manager)**
| Secret Name | Purpose | Rotation | Access Level |
|-------------|---------|----------|--------------|
| `GOOGLE_API_KEY` | Gemini API authentication | Monthly | Service account only |
| `MONGODB_CONNECTION_STRING` | Database access | Quarterly | Critical services only |

### **Feature Flags**
| Flag | Default | Purpose | Dependencies |
|------|---------|---------|-------------|
| `ENABLE_VISION_AGENT` | `true` | Enable visual interpretation | Requires pro model access |
| `ENABLE_CONVERSATION_PERSISTENCE` | `true` | Store conversation history | Requires MongoDB |
| `ENABLE_PERFORMANCE_ANALYTICS` | `false` | Detailed agent metrics | Requires monitoring setup |

---

## 🛠️ **Development & Operations**

### **Local Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+

# Installation
git clone <repository>
cd services/cognitive-core
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration:
# GOOGLE_API_KEY=your_gemini_api_key
# MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
# REDIS_URL=redis://localhost:6379

# Development mode
npm run dev

# Verify service health
curl http://localhost:3001/health

# Test agent invocation
curl -X POST http://localhost:3001/agents/classifier/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a login screen", "context": {"qualityMode": "standard"}}'
```

### **Testing**
```bash
# Unit tests (individual agents)
npm test

# Integration tests (agent workflows)
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# Test specific agent
npm test -- --grep "PlannerAgent"
```

### **Build & Deploy**
```bash
# Build Docker image
docker build -t cognitive-core .

# Run in Docker
docker run -p 3001:3001 \
  -e GOOGLE_API_KEY=your_key \
  -e MONGODB_URI=your_mongo_uri \
  -e REDIS_URL=your_redis_uri \
  cognitive-core

# Deploy to production
kubectl apply -f k8s/
```

---

## 🏥 **Health & Monitoring**

### **Health Check Response Details**
- **URL**: `GET /health`
- **Response Time**: < 500ms
- **Dependencies Checked**: 
  - MongoDB connection and query capability
  - Redis connection and pub/sub functionality
  - Google Gemini API availability and token usage

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - Agent processing time (p50, p95, p99) per agent type
  - AI model token usage and costs
  - Conversation completion rates
  - Agent success/failure rates
  - Event processing latency

### **Logging Standards**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "cognitive-core",
  "component": "agent|orchestrator|event-handler",
  "agentName": "string - if agent-related",
  "taskId": "string - if task-related",
  "message": "Human readable message",
  "correlationId": "string",
  "userId": "string",
  "projectId": "string",
  "metadata": {
    "executionTimeMs": "number",
    "tokenUsage": "object",
    "qualityMode": "string"
  }
}
```

### **Alert Conditions**
| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Agent failure rate | > 5% | High | Check AI API status, review prompts |
| AI API response time | > 10s | Medium | Monitor API quotas, consider quality mode |
| Conversation errors | > 3 consecutive | Critical | Emergency response, check dependencies |
| Memory usage | > 1GB | Medium | Investigate conversation state cleanup |

---

## 🔧 **Service-Specific Implementation Details**

### **AI Agent Architecture**
The service implements a sophisticated multi-agent system where each agent has a specific role:

**Core Agents**:
- **Classifier**: Intent recognition and task extraction
- **Manager**: Task coordination and complexity assessment
- **Planner**: Detailed execution plan creation
- **Architect**: Plan-to-transaction conversion
- **Validator**: Transaction validation and error detection
- **Synthesizer**: Response composition and user communication

**Specialized Agents**:
- **UX Expert**: Knowledge-based UX consultation
- **Visual Interpreter**: Image/sketch analysis using vision models
- **Analyst**: System improvement recommendations

### **Agent Orchestration Workflow**
```
User Message → Classifier → Manager → [Planner → Architect → Validator] OR [UX Expert] → Synthesizer → User Response
                     ↓
              Visual Interpreter (if image) → Context Integration
                     ↓
              Analyst (background) → System Improvement
```

### **Critical Code Paths**
- **Message Processing**: Classifier → Manager → Agent Pipeline → Synthesizer (95% of traffic)
- **Plan Execution**: Plan Approval → Architect → Validator → Flow Update (high business value)
- **Error Recovery**: Agent failure → Fallback responses → User notification (critical UX)

### **Performance Considerations**
- Expected throughput: 50-100 conversations/second
- Memory usage: ~512MB base + 50MB per concurrent conversation
- AI API latency: 2-8 seconds per agent call
- Token optimization: Prompt compression and response caching

### **Security Considerations**
- AI prompt injection prevention through input sanitization
- Conversation data encryption at rest
- API key rotation and secure storage
- User context isolation between projects
- Rate limiting on AI API calls

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **AI Agent Failures**
```bash
# Check agent status
curl http://localhost:3001/agents

# Test specific agent
curl -X POST http://localhost:3001/agents/manager/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test task", "context": {}}'

# Check AI API quotas
curl -H "Authorization: Bearer $GOOGLE_API_KEY" \
  https://generativelanguage.googleapis.com/v1/models

# Review agent logs
docker logs cognitive-core | grep "agent.*failed"
```

#### **High Response Times**
1. Check AI model response times in logs
2. Verify Redis connection latency
3. Monitor MongoDB query performance
4. Review conversation state size
5. Check for prompt optimization opportunities

#### **Conversation State Issues**
```bash
# Check conversation state
redis-cli GET "conversation:userId-projectId"

# Clear problematic conversation
redis-cli DEL "conversation:userId-projectId"

# Monitor conversation metrics
curl http://localhost:3001/metrics | grep conversation
```

#### **Event Processing Delays**
1. Check Redis pub/sub connection
2. Verify event handler processing times
3. Monitor event queue backlog
4. Review inter-service communication

### **Debug Mode**
```bash
# Enable detailed logging
LOG_LEVEL=debug npm run dev

# Enable specific agent debugging
DEBUG=agent:* npm run dev

# Test agent pipeline
npm run test:agents -- --verbose
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../docs/ARCHITECTURE.md)
- [AI Agent Design Patterns](../docs/AI_AGENTS.md)
- [Google Gemini Integration Guide](../docs/GEMINI_INTEGRATION.md)
- [Event System Documentation](../docs/EVENTS.md)
- [Flow Transaction Specification](../flow-service/TRANSACTIONS.md)

### **External References**
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [Node.js Express.js Framework](https://expressjs.com/en/guide/)
- [Redis Pub/Sub Documentation](https://redis.io/docs/manual/pubsub/)

---

## 📝 **Changelog**

### **Version 1.0.0** (2024-01-15)
- Initial multi-agent system implementation
- Core 9 agents with Google Gemini integration
- Event-driven communication with other services
- Conversation state management

### **Version 1.1.0** (2024-02-01)
- Added Visual Interpreter agent for image analysis
- Improved error handling and retry mechanisms
- Performance optimizations for high-throughput scenarios
- Enhanced logging and monitoring capabilities

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @ai-team-lead | Agent architecture, AI integration decisions |
| Primary Developer | @cognitive-dev | Agent implementation, prompt engineering |
| DevOps Contact | @platform-team | Deployment, monitoring, scaling |

---

> **🔄 Last Updated**: 2024-02-01  
> **📋 Documentation Version**: 1.1  
> **🤖 Auto-validation**: ✅ Agent schemas validated / ✅ Event schemas current / ✅ API contracts tested