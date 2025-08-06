# Flow Service

## 🎯 **Service Purpose**
Manages UX flow data persistence, validation, versioning, and transaction processing. Handles the core .uxflow file format and provides comprehensive flow lifecycle management.

## 🏗️ **Architecture**

### **Core Responsibilities**
- **Flow Data Management**: CRUD operations for .uxflow files
- **Transaction Processing**: Atomic flow modifications via JSON transactions
- **Validation Engine**: Comprehensive flow and transaction validation
- **Version Control**: Complete versioning system with snapshots and rollback
- **Template Management**: Pre-built flow templates for quick starts
- **Export/Import**: Flow data portability and backup functionality

### **Technology Stack**
- **Runtime**: Node.js 18+ with Express.js framework
- **Database**: MongoDB for flow data and metadata persistence
- **Validation**: Custom validation engine with business rule checking
- **Caching**: Redis for flow data caching and performance optimization
- **Transactions**: Atomic operation processing with rollback support

## 📊 **Flow Data Format**

### **.uxflow File Structure**
```typescript
{
  metadata: {
    flowName: string
    version: string           // Semantic versioning (1.0.0)
    description?: string
    projectId: string
    workspaceId: string
    createdBy: string
    lastModifiedBy: string
    createdAt: Date
    updatedAt: Date
  }
  nodes: Array<{
    id: string
    type: "Start" | "End" | "Screen" | "Popup" | "API Call" | "Decision" | "Component" | "Note"
    position: { x: number, y: number }
    data: object             // Type-specific data
  }>
  edges: Array<{
    id: string
    source: string           // Source node ID
    target: string           // Target node ID  
    data: {
      trigger?: string       // onLoad, onClick(elementId), onSubmit, etc.
    }
  }>
}
```

### **Node Type Specifications**

#### **Screen/Popup Nodes**
```typescript
{
  id: string
  type: "Screen" | "Popup"
  data: {
    title: string
    elements: Array<{
      type: "input" | "button" | "text" | "image" | "list"
      id: string
      label?: string
      validation?: string
      properties?: object
    }>
  }
}
```

#### **Decision Nodes**
```typescript
{
  id: string
  type: "Decision"
  data: {
    condition: string        // JavaScript-like condition
    description?: string
  }
}
```

#### **API Call Nodes**
```typescript
{
  id: string
  type: "API Call"
  data: {
    url: string
    method: "GET" | "POST" | "PUT" | "DELETE"
    headers?: object
    body?: object
    responseMapping?: object
  }
}
```

## 🔧 **Transaction System**

### **Transaction Types**
```typescript
{
  action: "ADD_NODE" | "UPDATE_NODE" | "DELETE_NODE" | "ADD_EDGE" | "UPDATE_EDGE" | "DELETE_EDGE"
  payload: object
}
```

### **Transaction Examples**

#### **Add Node Transaction**
```json
{
  "action": "ADD_NODE",
  "payload": {
    "id": "n_login_screen",
    "type": "Screen",
    "position": { "x": 250, "y": 200 },
    "data": {
      "title": "Login Screen",
      "elements": [
        { "type": "input", "id": "email", "label": "Email" },
        { "type": "input", "id": "password", "label": "Password" },
        { "type": "button", "id": "login_btn", "label": "Login" }
      ]
    }
  }
}
```

#### **Add Edge Transaction**
```json
{
  "action": "ADD_EDGE", 
  "payload": {
    "id": "e_start_login",
    "source": "start",
    "target": "n_login_screen",
    "data": { "trigger": "onLoad" }
  }
}
```

### **Transaction Processing**
1. **Validation**: Verify transaction format and business rules
2. **Simulation**: Apply transactions to in-memory flow copy
3. **Validation**: Validate resulting flow state
4. **Persistence**: Atomically update database
5. **Versioning**: Create new version snapshot
6. **Cache Update**: Refresh cached flow data
7. **Event Emission**: Notify other services of changes

## 📡 **API Endpoints**

### **Flow Management**
```
GET    /api/v1/flows/project/:projectId    # Get flow by project
GET    /api/v1/flows/:flowId               # Get flow by ID
POST   /api/v1/flows                       # Create new flow
PATCH  /api/v1/flows/:flowId               # Update flow with transactions
DELETE /api/v1/flows/:flowId               # Delete flow
```

### **Validation**
```
POST /api/v1/flows/:flowId/validate        # Validate flow or transactions
```

### **Import/Export**
```
GET  /api/v1/flows/:flowId/export          # Export flow as JSON
POST /api/v1/flows/import                  # Import flow from JSON
```

### **Statistics**
```
GET /api/v1/flows/:flowId/stats            # Flow statistics and metrics
```

### **Versioning**
```
GET    /api/v1/versions/flow/:flowId                    # List versions
GET    /api/v1/versions/flow/:flowId/version/:number    # Get specific version
POST   /api/v1/versions/flow/:flowId/snapshot          # Create manual snapshot
POST   /api/v1/versions/flow/:flowId/restore/:number   # Restore to version
GET    /api/v1/versions/flow/:flowId/compare/:a/:b     # Compare versions
DELETE /api/v1/versions/flow/:flowId/cleanup           # Delete old versions
```

## 🔄 **Service Interactions**

### **Event Subscriptions**
```
FLOW_UPDATE_REQUESTED        <- Cognitive Core Service
FLOW_VALIDATION_REQUESTED    <- Cognitive Core Service
PROJECT_FLOW_INIT_REQUESTED  <- API Gateway
PROJECT_FLOW_DELETE_REQUESTED <- API Gateway
```

### **Event Publishing**
```
FLOW_UPDATED                 -> API Gateway (WebSocket broadcast)
FLOW_UPDATE_FAILED           -> API Gateway
FLOW_VALIDATION_COMPLETED    -> Cognitive Core Service
PROJECT_FLOW_INITIALIZED     -> API Gateway
PROJECT_FLOW_DELETED         -> API Gateway
```

## ✅ **Validation Engine**

### **Validation Levels**

#### **Structural Validation**
- Required fields presence (id, type for nodes)
- Data type correctness
- Unique ID constraints
- Valid node and edge types

#### **Connectivity Validation**
- Orphaned node detection
- Unreachable path identification
- Start/End node requirements
- Edge source/target existence

#### **Business Logic Validation**
- API Call → Decision pattern enforcement
- Decision node branching requirements (if_true/if_false)
- Flow completeness checks
- Circular dependency detection

### **Validation Response**
```typescript
{
  isValid: boolean
  errors: Array<{
    field: string
    message: string
    severity: "error" | "warning"
  }>
  warnings: string[]
  summary: {
    nodeCount: number
    edgeCount: number
    startNodeCount: number
    endNodeCount: number
  }
}
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Service Configuration
FLOW_SERVICE_PORT=3003
NODE_ENV=production
LOG_LEVEL=info

# Database Connections
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# Flow Configuration
FLOW_MAX_SIZE=52428800                # 50MB max flow size
FLOW_MAX_VERSIONS_PER_FLOW=100       # Version limit
FLOW_CACHE_EXPIRY_MINUTES=5          # Cache TTL
FLOW_AUTO_CLEANUP_VERSIONS=true      # Auto-delete old versions
FLOW_KEEP_VERSIONS=10                # Versions to retain

# Validation Configuration
VALIDATION_STRICT_MODE=true          # Strict validation in production
VALIDATION_MAX_NODES=1000            # Node limit per flow
VALIDATION_MAX_EDGES=2000            # Edge limit per flow
VALIDATION_ALLOW_EXPERIMENTAL=false  # Experimental node types
```

### **Template Configuration**
- **Empty Template**: Single start node
- **Basic Template**: Start → Screen → End linear flow
- **E-commerce Template**: Multi-screen shopping flow with decisions

## 🗄️ **Data Models**

### **Flow Document (MongoDB)**
```typescript
{
  _id: ObjectId
  metadata: FlowMetadata
  nodes: FlowNode[]
  edges: FlowEdge[]
  status: "active" | "deleted"
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
  deletedBy?: string
}
```

### **Version Document (MongoDB)**
```typescript
{
  _id: ObjectId
  flowId: string
  versionNumber: number
  description: string
  flowData: object        // Complete flow snapshot
  createdBy: string
  createdAt: Date
  size: number           // Serialized size in bytes
  metadata: {
    nodeCount: number
    edgeCount: number
    flowVersion: string
  }
}
```

## 🔍 **Health Check Response**
```json
{
  "service": "flow-service",
  "status": "ok|degraded|error", 
  "uptime": 12345,
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "flow-validation": "ok|error"
  },
  "statistics": {
    "totalFlows": 156,
    "activeFlows": 142,
    "totalVersions": 1847,
    "averageFlowSize": 2048
  }
}
```

## 🧪 **Testing Strategy**

### **Unit Tests**
- Transaction application logic
- Validation engine rules
- Template generation
- Version comparison algorithms

### **Integration Tests**
- End-to-end flow creation and modification
- Transaction processing workflows
- Version control operations
- Service event communication

### **Validation Tests**
- Valid and invalid flow scenarios
- Edge cases and boundary conditions
- Performance with large flows
- Concurrent modification handling

## 📊 **Monitoring & Metrics**

### **Flow Metrics**
- Flow creation/modification rates
- Average flow complexity (nodes/edges)
- Validation success/failure rates
- Cache hit/miss ratios

### **Version Metrics**
- Version creation frequency
- Rollback operation frequency
- Storage usage by versions
- Cleanup operation effectiveness

### **Performance Metrics**
- Transaction processing times
- Validation execution times
- Database query performance
- Cache operation latency

## 🚀 **Deployment**

### **Docker Configuration**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3003
CMD ["node", "src/server.js"]
```

### **Scaling Considerations**
- Flow data caching for read performance
- Database indexing on projectId and workspaceId
- Version cleanup automation
- Horizontal scaling via stateless design

## 📋 **Development Guidelines**

### **Adding New Node Types**
1. Add type to validation engine allowed types
2. Create validation rules for node-specific data
3. Update transaction processing logic
4. Add to template examples if applicable
5. Update flow format documentation

### **Extending Validation Rules**
1. Add rule to `ValidationService` class
2. Include in appropriate validation level
3. Add comprehensive test cases
4. Document new validation behavior
5. Consider backward compatibility

### **Transaction Types**
1. Define transaction payload structure
2. Implement processing logic in `FlowManager`
3. Add validation for transaction format
4. Test with various flow states
5. Update transaction documentation

---

## 🔄 **README Maintenance**
**⚠️ IMPORTANT**: When modifying this service, update the following sections:
- Flow Data Format (if .uxflow structure changes)
- Transaction System (if transaction types change)
- API Endpoints (if routes change)
- Validation Engine (if validation rules change)
- Service Interactions (if events change)
- Data Models (if database schemas change)