# Knowledge Service

## 🎯 **Service Purpose**
Manages knowledge base and retrieval-augmented generation (RAG) system using ChromaDB. Provides contextual knowledge to AI agents and maintains conversation memory across multiple hierarchical levels.

## 🏗️ **Architecture**

### **Core Responsibilities**
- **Knowledge Management**: Vector database operations with ChromaDB
- **RAG System**: Semantic search and context retrieval
- **Memory Management**: Multi-level conversation memory (short/mid/long-term)
- **Knowledge Isolation**: Workspace and project-specific knowledge spaces
- **Document Processing**: Text chunking and embedding management

### **Technology Stack**
- **Runtime**: Node.js 18+ with Express.js framework
- **Vector Database**: ChromaDB for embeddings and semantic search
- **Memory Storage**: MongoDB for structured memory and metadata
- **Cache Layer**: Redis for query caching and performance
- **Text Processing**: Custom chunking and preprocessing algorithms

## 🧠 **Memory Architecture**

### **Hierarchical Memory System**
```
Long-term Memory (Facts & Patterns)
    ↑ Summarizes from
Mid-term Memory (Episodes & Decisions)
    ↑ Summarizes from  
Short-term Memory (Recent Messages)
    ↑ Builds from
Raw Conversation Data
```

### **Memory Levels**

#### **Short-term Memory**
- **Scope**: Last 5 messages per conversation
- **Purpose**: Immediate context for current interaction
- **Storage**: In-memory with Redis caching
- **TTL**: 30 minutes

#### **Mid-term Memory**
- **Scope**: Episodes of 10 messages each
- **Purpose**: Session-level context and decision tracking
- **Storage**: MongoDB `memory_episodes` collection
- **Processing**: Automatic summarization of message groups

#### **Long-term Memory**
- **Scope**: Extracted facts, patterns, and preferences
- **Purpose**: User behavior patterns and persistent knowledge
- **Storage**: MongoDB `memory_facts` collection
- **Processing**: Periodic analysis of 50+ message batches

## 📚 **Knowledge Base Structure**

### **Collection Hierarchy**
```
Global Knowledge
├── ux_global_knowledge (Universal UX principles)
├── design_patterns (Common UI/UX patterns)
└── accessibility_guidelines (WCAG standards)

Workspace Knowledge
├── workspace_{workspaceId} (Team-specific knowledge)
└── company_guidelines (Organization standards)

Project Knowledge
├── project_{projectId} (Project-specific context)
└── flow_history (Previous design decisions)
```

### **Document Types**
- **UX Principles**: Nielsen heuristics, design guidelines
- **Design Patterns**: UI components, interaction patterns
- **Project Context**: Requirements, constraints, decisions
- **Conversation History**: Processed dialogue summaries
- **User Preferences**: Extracted behavioral patterns

## 📡 **API Endpoints**

### **Knowledge Queries**
```
POST /api/v1/knowledge/query           # Multi-scope knowledge search
POST /api/v1/knowledge/search/:scope   # Scoped search (global/workspace/project)
GET  /api/v1/knowledge/stats           # Knowledge base statistics
```

### **Knowledge Management**
```
POST /api/v1/knowledge/add/:scope      # Add knowledge to specific scope
DELETE /api/v1/knowledge/:scope/:docId # Delete knowledge document
POST /api/v1/knowledge/bulk/add        # Bulk knowledge addition
```

### **Document Management**
```
GET  /api/v1/documents                 # List documents with metadata
POST /api/v1/documents                 # Upload and index document
GET  /api/v1/documents/:id             # Get document details
DELETE /api/v1/documents/:id           # Delete document and index
```

### **Health & Diagnostics**
```
GET /health                            # Service health check
GET /api/v1/knowledge/health          # Knowledge base health
```

## 🔄 **Service Interactions**

### **Event Subscriptions**
```
KNOWLEDGE_QUERY_REQUESTED     <- Cognitive Core Service
KNOWLEDGE_INDEX_REQUESTED     <- API Gateway (document uploads)
PROJECT_CREATED               <- API Gateway
WORKSPACE_CREATED             <- API Gateway
DOCUMENT_ADDED                <- API Gateway
DOCUMENT_DELETED              <- API Gateway
```

### **Event Publishing**
```
KNOWLEDGE_RESPONSE_READY      -> Cognitive Core Service
KNOWLEDGE_INDEXED             -> API Gateway
KNOWLEDGE_INDEX_FAILED        -> API Gateway
```

## 🔍 **Knowledge Query Processing**

### **Query Flow**
```
1. Receive query with scope parameters (user/workspace/project)
2. Determine relevant collections based on scope
3. Execute semantic search across collections
4. Weight and rank results by relevance and scope
5. Format knowledge context for AI consumption
6. Cache results for performance
7. Emit response to requesting service
```

### **Scope-based Weighting**
- **Global Knowledge**: 60% weight (universal principles)
- **Workspace Knowledge**: 30% weight (team-specific)
- **Project Knowledge**: 10% weight (current context)

### **Result Formatting**
```typescript
{
  query: string
  results: Array<{
    content: string
    metadata: object
    relevanceScore: number
    source: "global" | "workspace" | "project"
  }>
  knowledgeContext: string  // Formatted for AI consumption
  resultCount: number
  sources: string[]
}
```

## 🧪 **Memory Processing**

### **Episode Creation**
```typescript
{
  projectId: string
  userId: string
  episodeNumber: number
  summary: {
    mainActions: string[]
    description: string
    outcome: "success" | "error" | "in_progress"
  }
  keyDecisions: Array<{
    type: "strategy_decision" | "approval_decision" | "user_approval"
    content: string
    timestamp: Date
  }>
  agentActions: Array<{
    type: string
    timestamp: Date
    agent: string
  }>
  messageCount: number
  startTime: Date
  endTime: Date
}
```

### **Long-term Fact Extraction**
```typescript
{
  projectId: string
  userId: string
  processedMessageCount: number
  entities: Record<string, {
    type: "screen" | "button" | "component"
    name: string
    mentions: number
  }>
  preferences: {
    communication_style: "detailed" | "concise"
    flow_complexity: "simple" | "moderate" | "complex"
    approval_pattern: "thorough" | "quick"
  }
  patterns: {
    peak_activity_hours: number[]
    common_request_types: Record<string, number>
    feedback_patterns: {
      positive: number
      negative: number
      ratio: number
    }
  }
  flowEvolution: Array<{
    timestamp: Date
    action: "creation" | "modification"
    description: string
  }>
  agentBehavior: Record<string, {
    actions: number
    successes: number
    errors: number
  }>
}
```

## 🗄️ **Data Models**

### **Knowledge Document**
```typescript
{
  documentId: string
  title: string
  description: string
  scope: "global" | "workspace" | "project"
  workspaceId?: string
  projectId?: string
  addedBy: string
  addedAt: Date
  contentLength: number
  tags: string[]
  category: string
  chunkCount: number
}
```

### **ChromaDB Collection Metadata**
```typescript
{
  scope: "global" | "workspace" | "project"
  createdAt: string
  workspaceId?: string
  projectId?: string
  type: string
}
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Service Configuration
KNOWLEDGE_SERVICE_PORT=3002
NODE_ENV=production
LOG_LEVEL=info

# ChromaDB Configuration
CHROMADB_URL=http://localhost:8000
CHROMADB_TIMEOUT=30000
CHROMADB_RETRY_ATTEMPTS=3

# Database Connections
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# Knowledge Configuration
KNOWLEDGE_MAX_DOCUMENT_SIZE=10485760  # 10MB
KNOWLEDGE_CHUNK_SIZE=500              # Characters per chunk
KNOWLEDGE_MAX_CHUNKS_PER_DOC=1000
KNOWLEDGE_CACHE_EXPIRY_MINUTES=30

# Search Configuration
SEARCH_DEFAULT_RESULT_COUNT=5
SEARCH_MAX_RESULT_COUNT=50
SEARCH_RELEVANCE_THRESHOLD=0.1
SEARCH_GLOBAL_WEIGHT=0.6
SEARCH_WORKSPACE_WEIGHT=0.3
SEARCH_PROJECT_WEIGHT=0.1

# Memory Configuration
MEMORY_SHORT_TERM_THRESHOLD=5
MEMORY_MID_TERM_EPISODE_SIZE=10
MEMORY_LONG_TERM_FACT_THRESHOLD=50
MEMORY_MAX_MID_TERM_EPISODES=20
MEMORY_CACHE_EXPIRY_MINUTES=30
```

## 🔍 **Health Check Response**
```json
{
  "service": "knowledge-service",
  "status": "ok|degraded|error",
  "uptime": 12345,
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "chromadb": "ok|error"
  },
  "knowledgeBase": {
    "collections": 5,
    "totalDocuments": 1250,
    "globalDocuments": 100,
    "workspaceCollections": 3,
    "projectCollections": 15
  },
  "memory": {
    "shortTermCacheSize": 42,
    "midTermEpisodes": 156,
    "longTermFacts": 23,
    "processingQueue": 0
  }
}
```

## 🧪 **Testing Strategy**

### **Unit Tests**
- Text chunking and preprocessing
- Memory level transitions and summarization
- Knowledge retrieval and ranking
- Collection management operations

### **Integration Tests**
- End-to-end knowledge query workflows
- Memory building from conversation data
- Document indexing and retrieval
- Cross-service event communication

### **Performance Tests**
- Large document processing
- Concurrent query handling
- Memory processing under load
- ChromaDB connection stability

## 📊 **Monitoring & Metrics**

### **Knowledge Metrics**
- Query response times
- Search result relevance scores
- Document indexing rates
- Collection growth patterns

### **Memory Metrics**
- Memory processing latency
- Episode creation frequency
- Fact extraction accuracy
- Cache hit rates

## 🚀 **Deployment**

### **Docker Configuration**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3002
CMD ["node", "src/server.js"]
```

### **External Dependencies**
- **ChromaDB**: Requires running ChromaDB instance
- **Pre-seeded Knowledge**: Global UX principles and patterns
- **Collection Initialization**: Automatic workspace/project setup

## 📋 **Development Guidelines**

### **Adding Knowledge Sources**
1. Create markdown files in `src/knowledge_base/`
2. Organize by category (ux_principles, design_patterns, etc.)
3. Use consistent formatting for better chunking
4. Add metadata tags for improved searchability
5. Update global knowledge initialization

### **Memory Processing Extensions**
1. Add new memory types in `src/services/memory-manager.js`
2. Implement extraction logic for new patterns
3. Add corresponding database schema
4. Update context building logic
5. Test with various conversation patterns

### **Collection Management**
1. Define collection naming conventions
2. Set appropriate metadata for filtering
3. Implement cleanup procedures for deleted entities
4. Monitor collection size and performance
5. Add collection-specific indexing strategies

---

## 🔄 **README Maintenance**
**⚠️ IMPORTANT**: When modifying this service, update the following sections:
- Memory Architecture (if memory levels change)
- Knowledge Base Structure (if collections change)
- API Endpoints (if routes change)
- Service Interactions (if events change)
- Data Models (if schemas change)
- Configuration (if env vars change)