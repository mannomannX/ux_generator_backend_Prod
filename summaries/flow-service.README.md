# Flow Service - UX-Flow-Engine

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
The Flow Service is the core data management backbone of UX-Flow-Engine, responsible for persisting, validating, versioning, and managing the complete lifecycle of UX flow data in the proprietary .uxflow file format.

### **Core Responsibilities**
- **Flow Data Management**: Complete CRUD operations for .uxflow files with atomic transaction processing
- **Validation Engine**: Multi-level validation including structural, connectivity, and business logic validation
- **Version Control System**: Full versioning with snapshots, rollback capabilities, and diff comparison
- **Transaction Processing**: JSON-based transaction system for atomic flow modifications
- **Template Management**: Pre-built flow templates for rapid flow creation
- **Export/Import Functionality**: Flow data portability and backup systems

### **Service Dependencies**

#### **Input Dependencies (Services this service consumes)**
| Service | Communication Method | Purpose | Required |
|---------|---------------------|---------|----------|
| `cognitive-core` | Redis Events | Flow update requests from AI agents | Yes |
| `api-gateway` | Redis Events | Project flow initialization/deletion | Yes |
| `mongodb` | Direct Connection | Primary data persistence | Yes |
| `redis` | Direct Connection | Event bus and caching | Yes |

#### **Output Dependencies (Services that consume this service)**
| Service | Communication Method | What they get from us | Critical |
|---------|---------------------|----------------------|----------|
| `api-gateway` | Redis Events | Flow update notifications for WebSocket broadcast | Yes |
| `cognitive-core` | Redis Events | Flow validation results and current flow state | Yes |

#### **External Dependencies**
| Dependency | Type | Purpose | Fallback Strategy |
|------------|------|---------|------------------|
| MongoDB Atlas | Database | Flow and version data persistence | Local MongoDB with data sync |
| Redis Cloud | Cache/PubSub | Event system and flow caching | In-memory fallback for cache |

---

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3003`
- **Production**: `https://api.uxflow.app/flow-service`

### **Authentication**
- **Type**: JWT Bearer Token (passed through from API Gateway)
- **Header**: `x-user-id` (extracted user ID from API Gateway)
- **Validation**: User ID required for all modification operations

### **API Endpoints**

#### **GET /api/v1/flows/project/:projectId**
**Purpose**: Retrieve the flow associated with a specific project

**Authentication**: ✅ Required (via x-user-id header)

**Query Parameters**:
- `workspaceId` (required): Workspace identifier

**Response Schema** (200 Success):
```json
{
  "flow": {
    "id": "string",
    "metadata": {
      "flowName": "string",
      "version": "string",
      "projectId": "string",
      "workspaceId": "string",
      "createdBy": "string",
      "lastModifiedBy": "string",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601"
    },
    "nodes": [
      {
        "id": "string",
        "type": "Start|End|Screen|Popup|API Call|Decision|Component|Note",
        "position": { "x": "number", "y": "number" },
        "data": "object"
      }
    ],
    "edges": [
      {
        "id": "string",
        "source": "string",
        "target": "string",
        "data": { "trigger": "string" }
      }
    ]
  },
  "projectId": "string",
  "workspaceId": "string"
}
```

#### **PATCH /api/v1/flows/:flowId**
**Purpose**: Update a flow using JSON transactions for atomic modifications

**Authentication**: ✅ Required

**Request Schema**:
```json
{
  "transactions": [
    {
      "action": "ADD_NODE|UPDATE_NODE|DELETE_NODE|ADD_EDGE|UPDATE_EDGE|DELETE_EDGE",
      "payload": {
        "id": "string",
        "type": "string",
        "position": { "x": "number", "y": "number" },
        "data": "object"
      }
    }
  ],
  "projectId": "string"
}
```

**Response Schema** (200 Success):
```json
{
  "message": "Flow updated successfully",
  "flow": "FlowObject",
  "transactionCount": "number"
}
```

#### **POST /api/v1/flows/:flowId/validate**
**Purpose**: Validate a flow or set of transactions against business rules

**Request Schema**:
```json
{
  "flowData": "object (optional)",
  "transactions": "array (optional)"
}
```

**Response Schema**:
```json
{
  "validation": {
    "isValid": "boolean",
    "errors": [
      {
        "field": "string",
        "message": "string",
        "severity": "error|warning"
      }
    ],
    "warnings": ["string"],
    "summary": {
      "nodeCount": "number",
      "edgeCount": "number",
      "startNodeCount": "number",
      "endNodeCount": "number"
    }
  },
  "flowId": "string"
}
```

#### **GET /api/v1/versions/flow/:flowId**
**Purpose**: Retrieve version history for a flow

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `includeData`: Include full flow data (default: false)

**Response Schema**:
```json
{
  "versions": [
    {
      "id": "string",
      "versionNumber": "number",
      "description": "string",
      "createdBy": "string",
      "createdAt": "ISO8601",
      "size": "number",
      "metadata": {
        "nodeCount": "number",
        "edgeCount": "number",
        "flowVersion": "string"
      },
      "flowData": "object (if includeData=true)"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "totalCount": "number",
    "totalPages": "number",
    "hasNext": "boolean",
    "hasPrev": "boolean"
  }
}
```

#### **POST /api/v1/versions/flow/:flowId/restore/:versionNumber**
**Purpose**: Restore a flow to a specific version

**Response Schema**:
```json
{
  "message": "Flow restored successfully",
  "restoredToVersion": "number",
  "flow": "FlowObject"
}
```

**Error Responses**:
```json
// 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "message": "Transaction validation failed",
  "details": ["error descriptions"],
  "correlationId": "string"
}

// 404 Not Found
{
  "error": "FLOW_NOT_FOUND",
  "message": "Flow not found",
  "flowId": "string",
  "correlationId": "string"
}

// 500 Internal Server Error
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to update flow",
  "correlationId": "string"
}
```

---

## 📡 **Event-Driven Communication**

### **Published Events (Events this service emits)**

#### **FLOW_UPDATED**
- **Trigger**: When a flow is successfully updated via transactions
- **Frequency**: Per flow modification (low to medium volume)
- **Consumers**: `api-gateway` (for WebSocket broadcast), `cognitive-core` (for state updates)

**Event Schema**:
```json
{
  "eventType": "FLOW_UPDATED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "flow-service",
  "data": {
    "userId": "string",
    "projectId": "string",
    "workspaceId": "string",
    "flow": "FlowObject",
    "transactionCount": "number"
  },
  "metadata": {
    "correlationId": "string",
    "userId": "string",
    "projectId": "string"
  }
}
```

#### **FLOW_UPDATE_FAILED**
- **Trigger**: When a flow update operation fails
- **Frequency**: Error conditions only
- **Consumers**: `api-gateway` (for error notification)

#### **FLOW_VALIDATION_COMPLETED**
- **Trigger**: When flow validation is completed (success or failure)
- **Frequency**: Per validation request
- **Consumers**: `cognitive-core` (for validation results)

#### **PROJECT_FLOW_INITIALIZED**
- **Trigger**: When a new flow is created for a project
- **Frequency**: Per new project
- **Consumers**: `api-gateway` (for project setup confirmation)

### **Consumed Events (Events this service listens to)**

#### **FLOW_UPDATE_REQUESTED**
- **Source**: `cognitive-core`
- **Purpose**: Apply AI-generated transactions to update flows
- **Handler**: `src/events/event-handlers.js::handleFlowUpdateRequest`
- **Failure Strategy**: Retry 3x with exponential backoff, emit FLOW_UPDATE_FAILED

**Expected Schema**:
```json
{
  "eventType": "FLOW_UPDATE_REQUESTED",
  "data": {
    "userId": "string",
    "projectId": "string",
    "workspaceId": "string",
    "transactions": "array",
    "originalPlan": "object",
    "correlationId": "string"
  }
}
```

#### **FLOW_VALIDATION_REQUESTED**
- **Source**: `cognitive-core`
- **Purpose**: Validate flows or transactions before application
- **Handler**: `src/events/event-handlers.js::handleFlowValidationRequest`
- **Failure Strategy**: Return validation failure result

#### **PROJECT_FLOW_INIT_REQUESTED**
- **Source**: `api-gateway`
- **Purpose**: Initialize flow for new projects
- **Handler**: `src/events/event-handlers.js::handleProjectFlowInit`
- **Failure Strategy**: Emit PROJECT_FLOW_INIT_FAILED

---

## 🗄️ **Data Layer Specification**

### **Database Schema**

#### **Collection: `flows`**
```json
{
  "_id": "ObjectId",
  "metadata": {
    "flowName": "string",
    "version": "string",
    "description": "string",
    "projectId": "string",
    "workspaceId": "string",
    "createdBy": "string",
    "lastModifiedBy": "string",
    "createdAt": "Date",
    "updatedAt": "Date",
    "status": "active|deleted",
    "latestVersionId": "string",
    "versionCount": "number"
  },
  "nodes": [
    {
      "id": "string",
      "type": "Start|End|Screen|Popup|API Call|Decision|Component|Note",
      "position": { "x": "number", "y": "number" },
      "data": "object"
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "string",
      "target": "string",
      "data": { "trigger": "string" }
    }
  ]
}
```

**Indexes**:
- `{ "metadata.projectId": 1, "metadata.workspaceId": 1 }` - For project-based lookups
- `{ "metadata.status": 1 }` - For filtering active flows
- `{ "metadata.createdAt": 1 }` - For time-based queries
- `{ "metadata.workspaceId": 1 }` - For workspace operations

#### **Collection: `flow_versions`**
```json
{
  "_id": "ObjectId",
  "flowId": "string",
  "versionNumber": "number",
  "description": "string",
  "flowData": "object",
  "createdBy": "string",
  "createdAt": "Date",
  "size": "number",
  "metadata": {
    "nodeCount": "number",
    "edgeCount": "number",
    "flowVersion": "string"
  }
}
```

**Indexes**:
- `{ "flowId": 1, "versionNumber": -1 }` - For version queries
- `{ "flowId": 1, "createdAt": -1 }` - For chronological queries
- `{ "createdAt": 1 }` - For cleanup operations

**Relationships**:
- `flowId` references `flows._id`
- `metadata.latestVersionId` references `flow_versions._id`

### **Cache Strategy**

#### **Redis Cache Keys**
| Pattern | TTL | Purpose | Invalidation |
|---------|-----|---------|-------------|
| `flow:*` | 300s | Frequently accessed flow data | On flow update |
| `validation:*` | 60s | Validation results cache | On rule changes |

---

## ⚙️ **Configuration & Environment**

### **Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `FLOW_SERVICE_PORT` | ✅ | `3003` | HTTP server port | `3003` |
| `NODE_ENV` | ✅ | `development` | Environment mode | `production` |
| `MONGODB_URI` | ✅ | - | MongoDB connection string | `mongodb://localhost:27017/ux-flow-engine` |
| `REDIS_URL` | ✅ | - | Redis connection string | `redis://localhost:6379` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |
| `FLOW_MAX_SIZE` | ❌ | `52428800` | Max flow size in bytes (50MB) | `52428800` |
| `FLOW_MAX_VERSIONS_PER_FLOW` | ❌ | `100` | Version limit per flow | `100` |
| `FLOW_CACHE_EXPIRY_MINUTES` | ❌ | `5` | Cache TTL in minutes | `5` |
| `VALIDATION_STRICT_MODE` | ❌ | `true` | Strict validation in production | `true` |
| `VALIDATION_MAX_NODES` | ❌ | `1000` | Node limit per flow | `1000` |
| `VALIDATION_MAX_EDGES` | ❌ | `2000` | Edge limit per flow | `2000` |

### **Secrets (Managed via Secret Manager)**
| Secret Name | Purpose | Rotation | Access Level |
|-------------|---------|----------|--------------|
| `MONGODB_CONNECTION_STRING` | Database authentication | Monthly | Service account only |
| `REDIS_AUTH_TOKEN` | Redis authentication | Monthly | Service account only |

### **Feature Flags**
| Flag | Default | Purpose | Dependencies |
|------|---------|---------|-------------|
| `ENABLE_FLOW_CACHING` | `true` | Enable Redis flow caching | Redis connection |
| `ENABLE_AUTO_CLEANUP` | `true` | Auto-cleanup old versions | None |
| `ENABLE_EXPERIMENTAL_VALIDATION` | `false` | Enable experimental validation rules | Validation service |

---

## 🛠️ **Development & Operations**

### **Local Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+

# Installation
git clone <repository>
cd services/flow-service
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration:
# MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
# REDIS_URL=redis://localhost:6379
# GOOGLE_API_KEY=your-key (for integration tests)

# Development mode
npm run dev

# Verify service health
curl http://localhost:3003/health
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

# Specific test categories
npm test -- --testPathPattern=validation
npm test -- --testPathPattern=versioning
```

### **Build & Deploy**
```bash
# Build Docker image
docker build -t ux-flow-engine/flow-service .

# Run in Docker
docker run -p 3003:3003 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/ux-flow-engine \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  ux-flow-engine/flow-service

# Deploy to production
kubectl apply -f k8s/flow-service/
```

---

## 🏥 **Health & Monitoring**

### **Health Check Endpoint**
- **URL**: `GET /health`
- **Response Time**: < 200ms
- **Dependencies Checked**: 
  - MongoDB connection and query performance
  - Redis connection and operation latency
  - Validation service functionality
  - Flow cache status

**Response Schema**:
```json
{
  "status": "ok|degraded|error",
  "service": "flow-service",
  "version": "1.0.0",
  "uptime": "number (seconds)",
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "flow-validation": "ok|error"
  },
  "statistics": {
    "totalFlows": "number",
    "activeFlows": "number",
    "totalVersions": "number",
    "averageFlowSize": "number"
  },
  "timestamp": "ISO8601"
}
```

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - Flow operation latency (create, read, update: p50, p95, p99)
  - Transaction processing time per type
  - Validation execution time
  - Cache hit/miss ratio
  - Version creation rate
  - Database query performance

### **Logging Standards**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "flow-service",
  "message": "Human readable message",
  "correlationId": "string",
  "userId": "string (if applicable)",
  "metadata": {
    "flowId": "string",
    "projectId": "string",
    "operation": "string",
    "duration": "number",
    "transactionCount": "number"
  }
}
```

### **Alert Conditions**
| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Flow operation error rate | > 5% | High | Immediate investigation |
| Validation response time p95 | > 2s | Medium | Performance review |
| MongoDB connection failures | > 3 consecutive | Critical | Database team escalation |
| Cache miss rate | > 80% | Medium | Redis investigation |
| Version storage growth | > 10GB/day | Low | Cleanup review |

---

## 🔧 **Service-Specific Implementation Details**

### **Flow Transaction System**
The service implements an atomic transaction system for flow modifications:

**Transaction Types**:
- `ADD_NODE`: Add new node with validation
- `UPDATE_NODE`: Modify existing node properties
- `DELETE_NODE`: Remove node and connected edges
- `ADD_EDGE`: Create new connection with validation
- `UPDATE_EDGE`: Modify edge properties
- `DELETE_EDGE`: Remove connection

**Transaction Processing Pipeline**:
1. **Validation Phase**: Validate transaction format and business rules
2. **Simulation Phase**: Apply transactions to in-memory flow copy
3. **Integrity Check**: Validate resulting flow state
4. **Persistence Phase**: Atomically update database
5. **Versioning Phase**: Create new version snapshot
6. **Cache Update**: Refresh cached flow data
7. **Event Emission**: Notify other services

### **Multi-Level Validation Engine**
The validation system operates at multiple levels:

**Structural Validation**: Required fields, data types, unique constraints
**Connectivity Validation**: Node reachability, orphaned nodes, circular dependencies
**Business Logic Validation**: UX patterns, API Call → Decision flows, proper branching

### **Performance Considerations**
- Expected throughput: 100 flow operations/second
- Memory usage: ~512MB under normal load (with caching)
- CPU usage: ~20% under normal load
- Database query optimization via strategic indexing
- Redis caching reduces database load by ~60%

### **Security Considerations**
- Input validation for all transaction payloads
- User authorization via JWT token validation
- Flow data encryption at rest in MongoDB
- GDPR compliance for user flow data
- Audit trail via versioning system

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **Service won't start**
```bash
# Check MongoDB connection
mongosh $MONGODB_URI --eval "db.runCommand({ping: 1})"

# Check Redis connection
redis-cli -u $REDIS_URL ping

# Verify environment variables
env | grep -E "(MONGODB|REDIS|FLOW_)"

# Check port availability
lsof -i :3003
```

#### **Flow validation failures**
1. Check validation rules in ValidationService
2. Review flow structure for required fields
3. Verify node type validity
4. Check edge connectivity requirements
5. Validate business logic patterns

#### **Version creation errors**
1. Check MongoDB storage capacity
2. Verify version cleanup configuration
3. Review flow size limits
4. Check user permissions for versioning

#### **Performance degradation**
1. Monitor database query performance
2. Check Redis cache hit rates
3. Review flow complexity and size
4. Analyze validation execution times
5. Check for database index utilization

### **Debug Mode**
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable specific debug categories
DEBUG=flow:validation,flow:versioning npm run dev

# Test specific components
curl -X POST http://localhost:3003/api/v1/flows/test/validate \
  -H "Content-Type: application/json" \
  -d '{"flowData": {...}}'
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../docs/ARCHITECTURE.md)
- [UX Flow Format Specification](../docs/FLOW_FORMAT.md)
- [Cognitive Core Integration](../cognitive-core/README.md)
- [API Gateway Integration](../api-gateway/README.md)
- [Database Schema Documentation](../docs/DATABASE.md)

### **External References**
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-notes/)
- [Redis Pub/Sub Documentation](https://redis.io/topics/pubsub)
- [Flow Design Patterns](https://flowpatterns.uxflow.app)

---

## 📝 **Changelog**

### **Version 1.0.0** (2024-01-01)
- Initial service implementation with core CRUD operations
- Transaction-based flow modification system
- Multi-level validation engine
- Complete versioning system with diff comparison
- Redis-based event system integration
- Template system for rapid flow creation

### **Version 1.1.0** (2024-02-01)
- Enhanced validation rules for complex flow patterns
- Performance optimizations for large flows (1000+ nodes)
- Improved error handling and logging
- Cache optimization reducing database load by 60%
- Extended API for version comparison and statistics

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @flow-team-lead | Architecture decisions, breaking changes, validation rules |
| Primary Developer | @flow-dev | Day-to-day development, bug fixes, feature implementation |
| DevOps Contact | @platform-team | Deployment, infrastructure, monitoring, performance optimization |

---

> **🔄 Last Updated**: 2024-02-15  
> **📋 Documentation Version**: 1.1  
> **🤖 Auto-validation**: ✅ API schemas validated / ❌ Event schemas validated / ✅ Database indexes optimized