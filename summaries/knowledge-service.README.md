# Knowledge Service

> **⚠️ DOCUMENTATION MAINTENANCE REQUIRED**  
> When making changes to this service, you MUST update this README if the changes affect:
> - API endpoints (input/output schemas)
> - Event schemas (published/consumed events)
> - Database schema or collections
> - Environment variables or configuration
> - Service dependencies or integrations

---

## 🎯 **Service Overview**

### **Purpose**
The Knowledge Service manages the knowledge base and retrieval-augmented generation (RAG) system for UX-Flow-Engine. It provides contextual knowledge to AI agents, maintains hierarchical conversation memory, and enables semantic search across global UX principles, workspace-specific knowledge, and project context.

### **Core Responsibilities**
- **Vector Database Management**: ChromaDB operations for semantic search and knowledge retrieval
- **RAG System Implementation**: Context-aware knowledge retrieval for AI agent enhancement
- **Hierarchical Memory Management**: Multi-level conversation memory (short/mid/long-term)
- **Knowledge Isolation**: Workspace and project-specific knowledge spaces with global fallback
- **Document Processing**: Text chunking, embedding generation, and metadata management

### **Service Dependencies**

#### **Input Dependencies (Services this service consumes)**
| Service | Communication Method | Purpose | Required |
|---------|---------------------|---------|----------|
| `api-gateway` | Redis Events | Document upload events, workspace/project creation | Yes |
| `cognitive-core` | Redis Events | Knowledge query requests from AI agents | Yes |

#### **Output Dependencies (Services that consume this service)**
| Service | Communication Method | What they get from us | Critical |
|---------|---------------------|----------------------|----------|
| `cognitive-core` | Redis Events | Contextual knowledge responses, RAG context | Yes |
| `api-gateway` | Redis Events | Document indexing status, knowledge health | No |

#### **External Dependencies**
| Dependency | Type | Purpose | Fallback Strategy |
|------------|------|---------|------------------|
| ChromaDB | Vector Database | Semantic search and embeddings storage | Circuit breaker, graceful degradation |
| MongoDB Atlas | Document Database | Memory storage and document metadata | Retry with exponential backoff |
| Redis | Cache/Message Bus | Event communication and context caching | Failover to direct API calls |

---

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3002`
- **Production**: `https://api.uxflow.app/knowledge-service`

### **Authentication**
- **Type**: JWT Bearer Token via `x-user-id` header for user identification
- **Header**: `x-user-id: <userId>` (Required for document operations)
- **Validation**: User ID validation for access control and audit trails

### **API Endpoints**

#### **POST /api/v1/knowledge/query**
**Purpose**: Query knowledge base across multiple scopes with intelligent weighting

**Authentication**: ❌ Optional (but recommended for personalized results)

**Rate Limiting**: 100 requests per minute per user

**Request Schema**:
```json
{
  "query": "string (required)",
  "userId": "string",
  "workspaceId": "string",
  "projectId": "string", 
  "nResults": "number (default: 5, max: 50)",
  "includeGlobal": "boolean (default: true)"
}
```

**Response Schema** (200 Success):
```json
{
  "query": "string",
  "results": [
    {
      "content": "string",
      "metadata": "object",
      "relevanceScore": "number (0-1)",
      "source": "global|workspace|project"
    }
  ],
  "resultCount": "number",
  "sources": ["string"],
  "queryOptions": "object"
}
```

**Error Responses**:
```json
// 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "message": "Query is required",
  "correlationId": "string"
}

// 500 Internal Server Error
{
  "error": "KNOWLEDGE_QUERY_FAILED", 
  "message": "Vector search temporarily unavailable",
  "correlationId": "string"
}
```

#### **POST /api/v1/knowledge/search/:scope**
**Purpose**: Search within specific knowledge scope (global/workspace/project)

**Authentication**: ✅ Required for workspace/project scopes

**Request Schema**:
```json
{
  "query": "string (required)",
  "nResults": "number (default: 10, max: 50)",
  "workspaceId": "string (required for workspace scope)",
  "projectId": "string (required for project scope)"
}
```

**Response Schema**:
```json
{
  "scope": "global|workspace|project",
  "collectionName": "string",
  "query": "string",
  "results": [
    {
      "content": "string",
      "metadata": "object", 
      "relevanceScore": "number"
    }
  ],
  "resultCount": "number"
}
```

#### **POST /api/v1/knowledge/add/:scope**
**Purpose**: Add knowledge document to specific scope

**Authentication**: ✅ Required

**Request Schema**:
```json
{
  "content": "string (required, max: 10MB)",
  "metadata": {
    "title": "string",
    "description": "string",
    "category": "string",
    "tags": ["string"]
  },
  "userId": "string (required)",
  "workspaceId": "string (required for workspace scope)",
  "projectId": "string (required for project scope)"
}
```

**Response Schema**:
```json
{
  "message": "Knowledge added successfully",
  "docId": "string",
  "chunkCount": "number",
  "scope": "string",
  "addedBy": "string"
}
```

#### **GET /api/v1/documents**
**Purpose**: List documents with filtering and pagination

**Authentication**: ❌ Optional (filters by user access)

**Query Parameters**:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `search`: string (searches title, description, tags)
- `category`: string
- `scope`: global|workspace|project
- `workspaceId`: string
- `projectId`: string
- `sortBy`: addedAt|title|category (default: addedAt)
- `sortOrder`: asc|desc (default: desc)

**Response Schema**:
```json
{
  "documents": [
    {
      "id": "string",
      "documentId": "string", 
      "title": "string",
      "description": "string",
      "scope": "string",
      "category": "string",
      "tags": ["string"],
      "contentLength": "number",
      "addedBy": "string",
      "addedAt": "ISO8601",
      "updatedAt": "ISO8601"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number", 
    "totalCount": "number",
    "totalPages": "number",
    "hasNext": "boolean",
    "hasPrev": "boolean"
  },
  "filters": "object"
}
```

#### **GET /health**
**Purpose**: Service health check with dependency status

**Response Schema**:
```json
{
  "service": "knowledge-service",
  "status": "ok|degraded|error",
  "uptime": "number (seconds)",
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error", 
    "chromadb": "ok|error"
  },
  "knowledgeBase": {
    "collections": "number",
    "totalDocuments": "number",
    "globalDocuments": "number",
    "workspaceCollections": "number",
    "projectCollections": "number"
  },
  "memory": {
    "shortTermCacheSize": "number",
    "midTermEpisodes": "number", 
    "longTermFacts": "number",
    "processingQueue": "number"
  }
}
```

---

## 📡 **Event-Driven Communication**

### **Published Events (Events this service emits)**

#### **KNOWLEDGE_RESPONSE_READY**
- **Trigger**: After processing knowledge query from Cognitive Core
- **Frequency**: High volume (multiple per conversation)
- **Consumers**: cognitive-core service

**Event Schema**:
```json
{
  "eventType": "KNOWLEDGE_RESPONSE_READY",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "knowledge-service",
  "data": {
    "query": "string",
    "userId": "string",
    "workspaceId": "string", 
    "projectId": "string",
    "knowledgeContext": "string (formatted for AI consumption)",
    "resultCount": "number",
    "sources": ["string"],
    "error": "string (optional)"
  },
  "metadata": {
    "correlationId": "string",
    "processingTimeMs": "number"
  }
}
```

#### **KNOWLEDGE_INDEXED**
- **Trigger**: After successfully indexing a document
- **Frequency**: Medium volume (document uploads)
- **Consumers**: api-gateway service

**Event Schema**:
```json
{
  "eventType": "KNOWLEDGE_INDEXED",
  "eventId": "uuid", 
  "timestamp": "ISO8601",
  "emittedBy": "knowledge-service",
  "data": {
    "docId": "string",
    "scope": "global|workspace|project",
    "chunkCount": "number",
    "userId": "string",
    "workspaceId": "string",
    "projectId": "string"
  },
  "metadata": {
    "correlationId": "string"
  }
}
```

#### **KNOWLEDGE_INDEX_FAILED**
- **Trigger**: When document indexing fails
- **Frequency**: Low volume (error cases)
- **Consumers**: api-gateway service

**Event Schema**:
```json
{
  "eventType": "KNOWLEDGE_INDEX_FAILED",
  "eventId": "uuid",
  "timestamp": "ISO8601", 
  "emittedBy": "knowledge-service",
  "data": {
    "scope": "string",
    "userId": "string",
    "error": "string",
    "documentId": "string (optional)"
  },
  "metadata": {
    "correlationId": "string"
  }
}
```

### **Consumed Events (Events this service listens to)**

#### **KNOWLEDGE_QUERY_REQUESTED**
- **Source**: cognitive-core service
- **Purpose**: AI agents requesting contextual knowledge for responses
- **Handler**: `src/events/event-handlers.js` - `handleKnowledgeQuery()`
- **Failure Strategy**: Emit error response, continue operation

**Expected Schema**:
```json
{
  "eventType": "KNOWLEDGE_QUERY_REQUESTED",
  "data": {
    "query": "string",
    "userId": "string",
    "workspaceId": "string",
    "projectId": "string", 
    "nResults": "number (default: 5)",
    "includeGlobal": "boolean (default: true)",
    "context": "string (optional additional context)",
    "correlationId": "string"
  }
}
```

#### **PROJECT_CREATED**
- **Source**: api-gateway service  
- **Purpose**: Initialize project-specific knowledge collection
- **Handler**: `src/events/event-handlers.js` - `handleProjectCreated()`
- **Failure Strategy**: Log error, project continues without dedicated knowledge space

**Expected Schema**:
```json
{
  "eventType": "PROJECT_CREATED",
  "data": {
    "projectId": "string",
    "workspaceId": "string",
    "userId": "string",
    "projectName": "string"
  }
}
```

#### **WORKSPACE_CREATED**
- **Source**: api-gateway service
- **Purpose**: Initialize workspace-specific knowledge collection  
- **Handler**: `src/events/event-handlers.js` - `handleWorkspaceCreated()`
- **Failure Strategy**: Log error, workspace continues without dedicated knowledge space

**Expected Schema**:
```json
{
  "eventType": "WORKSPACE_CREATED", 
  "data": {
    "workspaceId": "string",
    "userId": "string",
    "workspaceName": "string",
    "settings": "object"
  }
}
```

#### **DOCUMENT_ADDED**
- **Source**: api-gateway service
- **Purpose**: Index uploaded documents into knowledge base
- **Handler**: `src/events/event-handlers.js` - `handleDocumentAdded()`
- **Failure Strategy**: Retry 3x, then emit INDEX_FAILED event

**Expected Schema**:
```json
{
  "eventType": "DOCUMENT_ADDED",
  "data": {
    "documentId": "string",
    "content": "string",
    "metadata": "object",
    "scope": "global|workspace|project",
    "userId": "string"
  }
}
```

---

## 🗄️ **Data Layer Specification**

### **Database Schema**

#### **Collection: `knowledge_documents`**
```json
{
  "_id": "ObjectId",
  "documentId": "string (unique)",
  "title": "string",
  "description": "string",
  "scope": "global|workspace|project",
  "workspaceId": "string (optional)",
  "projectId": "string (optional)", 
  "addedBy": "string (userId)",
  "addedAt": "Date",
  "updatedAt": "Date",
  "updatedBy": "string (optional)",
  "deletedAt": "Date (optional)",
  "deletedBy": "string (optional)",
  "contentLength": "number",
  "tags": ["string"],
  "category": "string",
  "status": "active|deleted",
  "chunkCount": "number"
}
```

**Indexes**:
- `{ "documentId": 1 }` - Unique document lookup
- `{ "scope": 1, "workspaceId": 1, "projectId": 1 }` - Scoped queries
- `{ "addedBy": 1, "addedAt": -1 }` - User document history
- `{ "status": 1, "category": 1 }` - Filtered listings
- `{ "title": "text", "description": "text", "tags": "text" }` - Full-text search

**Relationships**:
- `workspaceId` references external workspace system
- `projectId` references external project system
- `addedBy`/`updatedBy`/`deletedBy` reference user system

#### **Collection: `memory_episodes`**
```json
{
  "_id": "ObjectId",
  "projectId": "string",
  "userId": "string",
  "episodeNumber": "number",
  "summary": {
    "mainActions": ["string"],
    "description": "string",
    "outcome": "success|error|in_progress"
  },
  "keyDecisions": [
    {
      "type": "strategy_decision|approval_decision|user_approval",
      "content": "string", 
      "timestamp": "Date"
    }
  ],
  "agentActions": [
    {
      "type": "string",
      "timestamp": "Date",
      "agent": "string"
    }
  ],
  "messageCount": "number",
  "startTime": "Date",
  "endTime": "Date",
  "createdAt": "Date"
}
```

**Indexes**:
- `{ "projectId": 1, "userId": 1, "episodeNumber": 1 }` - Episode lookup
- `{ "projectId": 1, "userId": 1, "endTime": -1 }` - Chronological retrieval

#### **Collection: `memory_facts`**
```json
{
  "_id": "ObjectId",
  "projectId": "string",
  "userId": "string", 
  "processedMessageCount": "number",
  "entities": {
    "entityKey": {
      "type": "screen|button|component",
      "name": "string",
      "mentions": "number"
    }
  },
  "preferences": {
    "communication_style": "detailed|concise",
    "flow_complexity": "simple|moderate|complex", 
    "approval_pattern": "thorough|quick"
  },
  "patterns": {
    "peak_activity_hours": ["number"],
    "common_request_types": "object",
    "feedback_patterns": {
      "positive": "number",
      "negative": "number", 
      "ratio": "number"
    }
  },
  "flowEvolution": [
    {
      "timestamp": "Date",
      "action": "creation|modification",
      "description": "string"
    }
  ],
  "agentBehavior": {
    "agentName": {
      "actions": "number",
      "successes": "number",
      "errors": "number"
    }
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes**:
- `{ "projectId": 1, "userId": 1 }` - Unique user-project facts
- `{ "updatedAt": -1 }` - Recent facts first

### **ChromaDB Collections**

#### **Global Collections**
- `ux_global_knowledge`: Universal UX principles and best practices
- `design_patterns`: Common UI/UX patterns and components  
- `accessibility_guidelines`: WCAG standards and accessibility principles

#### **Dynamic Collections**
- `workspace_{workspaceId}`: Team-specific knowledge and guidelines
- `project_{projectId}`: Project-specific context and decisions

**Collection Metadata Schema**:
```json
{
  "scope": "global|workspace|project",
  "createdAt": "ISO8601",
  "workspaceId": "string (optional)",
  "projectId": "string (optional)",
  "type": "string"
}
```

### **Cache Strategy**

#### **Redis Cache Keys**
| Pattern | TTL | Purpose | Invalidation |
|---------|-----|---------|-------------|
| `context:{projectId}:{userId}` | 1800s | Hierarchical conversation context | On new messages |
| `collection_info:{collectionName}` | 3600s | Collection metadata and stats | On collection changes |
| `knowledge_stats:global` | 900s | Knowledge base statistics | On document changes |

---

## ⚙️ **Configuration & Environment**

### **Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `KNOWLEDGE_SERVICE_PORT` | ✅ | `3002` | HTTP server port | `3002` |
| `NODE_ENV` | ✅ | `development` | Environment mode | `production` |
| `MONGODB_URI` | ✅ | - | MongoDB connection string | `mongodb://localhost:27017/ux-flow-engine` |
| `REDIS_URL` | ✅ | - | Redis connection string | `redis://localhost:6379` |
| `CHROMADB_URL` | ✅ | - | ChromaDB server URL | `http://localhost:8000` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |
| `KNOWLEDGE_MAX_DOCUMENT_SIZE` | ❌ | `10485760` | Max document size (bytes) | `10485760` |
| `KNOWLEDGE_CHUNK_SIZE` | ❌ | `500` | Text chunk size (characters) | `500` |
| `KNOWLEDGE_CACHE_EXPIRY_MINUTES` | ❌ | `30` | Context cache TTL | `30` |
| `SEARCH_DEFAULT_RESULT_COUNT` | ❌ | `5` | Default search results | `5` |
| `SEARCH_GLOBAL_WEIGHT` | ❌ | `0.6` | Global knowledge weight | `0.6` |
| `MEMORY_SHORT_TERM_THRESHOLD` | ❌ | `5` | Short-term message count | `5` |

### **Secrets (Managed via Secret Manager)**
| Secret Name | Purpose | Rotation | Access Level |
|-------------|---------|----------|--------------|
| `MONGODB_CONNECTION_STRING` | Database authentication | Quarterly | Service account only |
| `REDIS_AUTH_TOKEN` | Cache authentication | Monthly | Service account only |

### **Feature Flags**
| Flag | Default | Purpose | Dependencies |
|------|---------|---------|-------------|
| `ENABLE_MEMORY_PROCESSING` | `true` | Enable hierarchical memory management | MongoDB |
| `ENABLE_ADVANCED_SEARCH` | `true` | Enable multi-collection search | ChromaDB |
| `ENABLE_KNOWLEDGE_CACHING` | `true` | Enable context caching | Redis |

---

## 🛠️ **Development & Operations**

### **Local Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+

# External dependencies
docker run -p 8000:8000 chromadb/chroma  # ChromaDB
mongod --port 27017                       # MongoDB
redis-server --port 6379                  # Redis

# Service setup
cd services/knowledge-service
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration:
# CHROMADB_URL=http://localhost:8000
# MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
# REDIS_URL=redis://localhost:6379

# Development mode
npm run dev

# Verify service health
curl http://localhost:3002/health | jq
```

### **Testing**
```bash
# Unit tests
npm test

# Integration tests  
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# Test specific functionality
npm test -- --testPathPattern=knowledge-manager.test.js
npm test -- --testPathPattern=memory-manager.test.js
```

### **Build & Deploy**
```bash
# Build Docker image
docker build -t knowledge-service .

# Run in Docker
docker run -p 3002:3002 \
  -e CHROMADB_URL=http://chromadb:8000 \
  -e MONGODB_URI=mongodb://mongo:27017/ux-flow-engine \
  -e REDIS_URL=redis://redis:6379 \
  knowledge-service

# Deploy to production
kubectl apply -f k8s/knowledge-service.yaml
```

---

## 🏥 **Health & Monitoring**

### **Health Check Endpoint**
- **URL**: `GET /health`
- **Response Time**: < 500ms
- **Dependencies Checked**: 
  - MongoDB connection and query
  - Redis connection and ping
  - ChromaDB heartbeat and collection access

**Response Schema**:
```json
{
  "status": "ok|degraded|error",
  "service": "knowledge-service",
  "version": "1.0.0",
  "uptime": "number (seconds)",
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "chromadb": "ok|error"
  },
  "knowledgeBase": {
    "collections": "number",
    "totalDocuments": "number",
    "globalDocuments": "number",
    "workspaceCollections": "number",
    "projectCollections": "number"
  },
  "memory": {
    "shortTermCacheSize": "number",
    "midTermEpisodes": "number",
    "longTermFacts": "number", 
    "processingQueue": "number"
  },
  "timestamp": "ISO8601"
}
```

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - Knowledge query latency (p50, p95, p99)
  - Document indexing rate (documents per minute)
  - Memory processing latency (milliseconds)
  - Cache hit/miss rates (percentage)
  - Vector search accuracy (relevance scores)

### **Logging Standards**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "knowledge-service", 
  "message": "Human readable message",
  "correlationId": "string",
  "userId": "string (if applicable)",
  "metadata": {
    "query": "string (truncated)",
    "resultCount": "number",
    "processingTimeMs": "number",
    "collection": "string"
  }
}
```

### **Alert Conditions**
| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| ChromaDB connection failures | > 3 consecutive | Critical | Restart service, check ChromaDB |
| Query response time p95 | > 2s | High | Check vector index performance |
| Memory processing backlog | > 100 items | Medium | Scale processing workers |
| Cache miss rate | > 80% | Medium | Check Redis connectivity |
| Document indexing failures | > 10% | High | Check ChromaDB capacity |

---

## 🔧 **Service-Specific Implementation Details**

### **Knowledge Retrieval Strategy**
The service implements a **hierarchical knowledge retrieval** system with intelligent scope weighting:

1. **Global Knowledge (60% weight)**: Universal UX principles, design patterns, accessibility guidelines
2. **Workspace Knowledge (30% weight)**: Team-specific guidelines, company standards, shared components  
3. **Project Knowledge (10% weight)**: Project-specific context, previous decisions, custom requirements

### **Memory Processing Pipeline**
```
Raw Conversation → Short-term Memory (last 5 messages)
                ↓
           Mid-term Episodes (10 messages each)
                ↓ 
         Long-term Facts (50+ message patterns)
```

### **Critical Code Paths**
- **Knowledge Query Processing**: `src/services/knowledge-manager.js` - `queryKnowledge()`
  - Performance: < 500ms for 95% of queries
  - Handles vector search across multiple collections with relevance ranking
  
- **Document Indexing**: `src/services/knowledge-manager.js` - `addDocument()`
  - Performance: < 2s for documents up to 10MB
  - Automatic text chunking and metadata extraction

- **Memory Context Building**: `src/services/memory-manager.js` - `buildHierarchicalContext()`
  - Performance: < 1s for context with 1000+ messages
  - Combines multiple memory layers into coherent context

### **Performance Considerations**
- **Expected Throughput**: 100 knowledge queries/second, 10 document uploads/minute
- **Memory Usage**: ~500MB base + 1MB per 10,000 documents
- **CPU Usage**: ~20% under normal load, spikes during bulk indexing
- **Storage**: Vector embeddings require ~1KB per text chunk

### **Security Considerations**
- **Access Control**: User-based document access via workspace/project membership
- **Data Isolation**: Separate ChromaDB collections for workspace/project boundaries
- **Input Validation**: Content sanitization and size limits for document uploads
- **Audit Logging**: Complete audit trail for document operations and access

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **ChromaDB Connection Failures**
```bash
# Check ChromaDB status
curl http://localhost:8000/api/v1/heartbeat

# Verify service can connect
docker logs knowledge-service | grep "ChromaDB"

# Restart ChromaDB if needed
docker restart chromadb
```

#### **Knowledge Query Timeouts**
1. Check ChromaDB collection sizes and indexing status
2. Verify query complexity (large nResults values)
3. Monitor ChromaDB resource usage
4. Consider collection reorganization for large datasets

#### **Memory Processing Delays**
1. Check MongoDB connection pool status
2. Review conversation message volume and processing queue
3. Monitor memory extraction pattern complexity
4. Scale processing if needed

#### **Document Indexing Failures**
```bash
# Check document processing logs
docker logs knowledge-service | grep "Failed to add document"

# Verify ChromaDB collection status
curl http://localhost:8000/api/v1/collections

# Test document chunking
npm run test -- --testPathPattern=chunking.test.js
```

### **Debug Mode**
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Debug specific components
DEBUG=knowledge-manager:* npm run dev
DEBUG=memory-manager:* npm run dev
DEBUG=vector-store:* npm run dev

# Debug Redis events
DEBUG=redis:* npm run dev
```

### **Performance Debugging**
```bash
# Monitor key metrics
curl http://localhost:3002/metrics | grep knowledge_query_duration
curl http://localhost:3002/metrics | grep memory_processing_duration

# Check ChromaDB performance
curl http://localhost:8000/api/v1/collections/ux_global_knowledge

# Monitor MongoDB queries
# Enable slow query logging in MongoDB
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../docs/ARCHITECTURE.md)
- [Cognitive Core Integration](../cognitive-core/README.md)
- [API Gateway Events](../api-gateway/README.md)
- [Memory Management Guide](../docs/MEMORY_ARCHITECTURE.md)

### **External References**
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Vector Search Best Practices](https://docs.trychroma.com/usage-guide)
- [RAG Implementation Patterns](https://python.langchain.com/docs/use_cases/question_answering)

---

## 📝 **Changelog**

### **Version 1.0.0** (2024-01-01)
- Initial Knowledge Service implementation
- ChromaDB integration with vector search
- Hierarchical memory management system
- Multi-scope knowledge retrieval (global/workspace/project)
- Document management API with CRUD operations

### **Version 1.1.0** (2024-01-15)
- Added bulk document operations
- Improved memory processing performance
- Enhanced search filtering capabilities
- Added document categorization and tagging

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @knowledge-team-lead | Architecture decisions, breaking changes |
| Primary Developer | @knowledge-dev | Day-to-day development, bug fixes |
| DevOps Contact | @platform-team | Deployment, infrastructure, monitoring |
| Vector DB Specialist | @ml-engineer | ChromaDB optimization, search tuning |

---

> **🔄 Last Updated**: 2024-01-15  
> **📋 Documentation Version**: 1.1  
> **🤖 Auto-validation**: ✅ API schemas validated / ✅ Event schemas current