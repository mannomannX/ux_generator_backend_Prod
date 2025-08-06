# Cognitive Core Service

## 🎯 **Service Purpose**
The AI brain of the UX-Flow-Engine. Orchestrates 9 specialized AI agents to process user requests, create plans, and manage intelligent conversation flow using Google Gemini models.

## 🏗️ **Architecture**

### **Core Responsibilities**
- **Multi-Agent Orchestration**: Coordinates 9 specialized AI agents
- **Conversation Management**: Maintains conversation state and context
- **Plan Generation**: Creates detailed execution plans for UX tasks
- **Response Synthesis**: Combines multiple agent outputs into coherent responses
- **Quality Mode Management**: Handles standard vs pro AI model usage

### **Technology Stack**
- **Runtime**: Node.js 18+ with Express.js framework
- **AI Integration**: Google Gemini API (@google/generative-ai)
- **State Management**: Redis for conversation state and caching
- **Event System**: Redis Pub/Sub for inter-service communication
- **Retry Logic**: Built-in retry mechanisms for AI model calls

## 🤖 **AI Agent System**

### **Agent Hierarchy**
```
User Input
    ↓
Classifier Agent (Intent Analysis)
    ↓
Manager Agent (Task Coordination)
    ↓
┌─── Planner Agent (Plan Creation)
│    ↓
│    Architect Agent (JSON Transactions)
│    ↓
│    Validator Agent (Quality Assurance)
└─── UX Expert Agent (Knowledge Queries)
     ↓
Visual Interpreter Agent (Image Analysis)
     ↓
Analyst Agent (System Improvement)
     ↓
Synthesizer Agent (Response Composition)
```

### **Agent Specifications**

#### **Classifier Agent**
- **Input**: Raw user message
- **Output**: Intent, sentiment, tasks array, questions array
- **Purpose**: Categorizes user input for appropriate routing
- **Model**: Standard (gemini-1.5-flash-latest)

#### **Manager Agent**
- **Input**: User message + full conversation context
- **Output**: Task definition or clarification question
- **Purpose**: Analyzes request complexity and determines approach
- **Model**: Standard (gemini-1.5-flash-latest)

#### **Planner Agent**
- **Input**: Task description + current flow + RAG context
- **Output**: Array of step-by-step plan objects
- **Purpose**: Creates detailed execution plans for UX tasks
- **Model**: Standard/Pro (configurable)

#### **Architect Agent**
- **Input**: Plan + current flow state
- **Output**: Array of JSON transactions (ADD_NODE, UPDATE_NODE, etc.)
- **Purpose**: Converts plans into executable flow modifications
- **Model**: Standard (gemini-1.5-flash-latest)

#### **Validator Agent**
- **Input**: Transactions + current flow state
- **Output**: Validation status with issues array
- **Purpose**: Validates transactions for logical consistency
- **Model**: Standard (gemini-1.5-flash-latest)

#### **Synthesizer Agent**
- **Input**: Multiple agent results + user message
- **Output**: Coherent user response message
- **Purpose**: Combines outputs into natural language response
- **Model**: Standard (gemini-1.5-flash-latest)

#### **UX Expert Agent**
- **Input**: UX question + current flow + RAG context
- **Output**: Expert UX advice and recommendations
- **Purpose**: Answers UX-related questions using knowledge base
- **Model**: Standard (gemini-1.5-flash-latest)

#### **Visual Interpreter Agent**
- **Input**: Base64 image data
- **Output**: Structured description of flow elements
- **Purpose**: Analyzes uploaded sketches and wireframes
- **Model**: Pro (gemini-1.5-pro-latest) - vision capabilities

#### **Analyst Agent**
- **Input**: System logs and performance data
- **Output**: Improvement recommendations
- **Purpose**: Analyzes system behavior for optimization
- **Model**: Pro (gemini-1.5-pro-latest)

## 📡 **API Endpoints**

### **Health & Info**
```
GET /health              # Service health check
GET /agents              # List available agents and status
```

### **Development/Testing**
```
POST /agents/:agentName/invoke  # Manual agent invocation
```

## 🔄 **Service Interactions**

### **Event Subscriptions**
```
USER_MESSAGE_RECEIVED     <- API Gateway
USER_PLAN_APPROVED        <- API Gateway
USER_PLAN_REJECTED        <- API Gateway
KNOWLEDGE_RESPONSE_READY  <- Knowledge Service
FLOW_UPDATED              <- Flow Service
```

### **Event Publishing**
```
USER_RESPONSE_READY       -> API Gateway
KNOWLEDGE_QUERY_REQUESTED -> Knowledge Service
FLOW_UPDATE_REQUESTED     -> Flow Service
AGENT_TASK_STARTED        -> System-wide
AGENT_TASK_COMPLETED      -> System-wide
AGENT_TASK_FAILED         -> System-wide
```

## 🔀 **Processing Workflows**

### **User Message Processing**
```
1. Classifier Agent analyzes intent and sentiment
2. Manager Agent determines task complexity and approach
3. Based on intent:
   - build_request: Planner → Architect → Validator → Synthesizer
   - question_about_flow: UX Expert → Synthesizer
   - meta_question: Direct response via Synthesizer
4. Context stored and response sent via events
```

### **Plan Execution Flow**
```
1. User approves plan via WebSocket
2. Architect Agent converts plan to transactions
3. Validator Agent checks transaction validity
4. If valid: transactions sent to Flow Service
5. If invalid: error response with issues
6. Flow Service confirms update via events
```

## 🗄️ **Data Models**

### **Agent Response Format**
```typescript
{
  type: "planner_task" | "clarification_question"
  task?: string
  question?: string
  complexity?: "simple" | "complex" | "very_complex"
  plan?: Array<{
    task: string
    reasoning: string
    stepNumber: number
  }>
  transactions?: Array<{
    action: "ADD_NODE" | "UPDATE_NODE" | "DELETE_NODE" | "ADD_EDGE" | "DELETE_EDGE"
    payload: object
  }>
}
```

### **Conversation State**
```typescript
{
  conversationId: string  // userId-projectId
  lastMessage: string
  lastResponse: object
  classification: object
  timestamp: Date
  context: {
    fullContext: string
    improvementSuggestion: string | null
    currentFlow: object
    knowledgeContext: string
  }
}
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Service Configuration
COGNITIVE_CORE_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Google Gemini API
GOOGLE_API_KEY=your-gemini-api-key

# Database Connections
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# Agent Configuration
AGENT_DEFAULT_QUALITY_MODE=standard
AGENT_RETRY_ATTEMPTS=2
AGENT_TIMEOUT_MS=30000
```

### **Model Configuration**
```javascript
{
  standard: "gemini-1.5-flash-latest",  // Fast, cost-effective
  pro: "gemini-1.5-pro-latest"         // Advanced reasoning, vision
}
```

## 🔍 **Health Check Response**
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
    "available": ["manager", "planner", "architect", ...],
    "status": "active"
  }
}
```

## 🧪 **Testing Strategy**

### **Unit Tests**
- Individual agent logic and response parsing
- Event handling and state management
- Error handling and retry mechanisms
- Context building and conversation management

### **Integration Tests**
- End-to-end conversation workflows
- Multi-agent orchestration scenarios
- Service communication via events
- Error recovery and fallback mechanisms

### **AI Model Tests**
- Prompt engineering validation
- Response format consistency
- Quality mode behavior differences
- Vision capabilities (Visual Interpreter)

## 📊 **Monitoring & Metrics**

### **Agent Performance Metrics**
- Processing time per agent
- Success/failure rates
- Token usage and costs
- Quality mode distribution

### **Conversation Metrics**
- Average conversation length
- Plan approval rates
- Error types and frequencies
- User satisfaction indicators

## 🚀 **Deployment**

### **Docker Configuration**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["node", "src/server.js"]
```

### **Scaling Considerations**
- Stateless agent processing enables horizontal scaling
- Conversation state managed via Redis for multi-instance support
- Google Gemini API rate limiting handled via retries
- Memory usage monitoring for large context processing

## 📋 **Development Guidelines**

### **Adding New Agents**
1. Create agent class extending `BaseAgent` in `src/agents/`
2. Implement `executeTask()` and `getTaskDescription()` methods
3. Add prompt file in `src/prompts/`
4. Register agent in `AgentOrchestrator`
5. Add agent to orchestration workflows
6. Update this README with agent specifications

### **Modifying Prompts**
1. Update prompt files in `src/prompts/`
2. Test with various input scenarios
3. Validate output format consistency
4. Monitor token usage changes
5. Update documentation if output format changes

### **Event Handling**
1. Define new events in `@ux-flow/common` EventTypes
2. Add handlers in `src/orchestrator/event-handlers.js`
3. Implement error handling and retries
4. Update service interaction documentation

---

## 🔄 **README Maintenance**
**⚠️ IMPORTANT**: When modifying this service, update the following sections:
- AI Agent System (if agents added/modified)
- Service Interactions (if events change)
- Data Models (if response formats change)
- Configuration (if env vars or models change)
- Processing Workflows (if orchestration changes)