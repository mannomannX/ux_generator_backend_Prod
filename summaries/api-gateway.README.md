# API Gateway Service

> **⚠️ DOCUMENTATION MAINTENANCE REQUIRED**  
> When making changes to this service, you MUST update this README if the changes affect:
> - API endpoints (input/output schemas)
> - Event schemas (published/consumed events)
> - WebSocket protocol (message types/schemas)
> - Environment variables or configuration
> - Service dependencies or integrations

---

## 🎯 **Service Overview**

### **Purpose**
Central entry point for all client requests, handling HTTP REST API endpoints, WebSocket connections for real-time collaboration, authentication/authorization, and routing requests to appropriate microservices in the UX-Flow-Engine ecosystem.

### **Core Responsibilities**
- **Request Routing**: Single entry point routing HTTP requests to downstream services
- **Authentication & Authorization**: JWT token validation, user session management, and permission enforcement
- **WebSocket Management**: Real-time bidirectional communication for collaborative flow editing
- **Rate Limiting & Security**: Request throttling, CORS, security headers, and abuse prevention
- **Client Connection Management**: WebSocket room management and cross-service event coordination

### **Service Dependencies**

#### **Input Dependencies (Services this service consumes)**
| Service | Communication Method | Purpose | Required |
|---------|---------------------|---------|----------|
| `cognitive-core` | Events (Redis Pub/Sub) | AI agent responses and conversation handling | Yes |
| `flow-service` | Events (Redis Pub/Sub) | Flow data updates and persistence | Yes |
| `knowledge-service` | Events (Redis Pub/Sub) | Knowledge retrieval and RAG responses | No |
| MongoDB | Direct connection | User, project, conversation data persistence | Yes |
| Redis | Direct connection | Event bus, caching, session storage | Yes |

#### **Output Dependencies (Services that consume this service)**
| Service | Communication Method | What they get from us | Critical |
|---------|---------------------|----------------------|----------|
| `cognitive-core` | Events (Redis Pub/Sub) | User messages, plan approvals, image uploads | Yes |
| `flow-service` | Events (Redis Pub/Sub) | Flow update requests, project lifecycle events | Yes |
| Frontend Client | HTTP REST + WebSocket | API responses, real-time updates | Yes |

#### **External Dependencies**
| Dependency | Type | Purpose | Fallback Strategy |
|------------|------|---------|------------------|
| MongoDB Atlas | Database | User/project data persistence | Connection retry with exponential backoff |
| Redis Cloud | Cache/PubSub | Event bus and session storage | Memory fallback for session, event buffering |

---

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3000`
- **Production**: `https://api.uxflow.app`

### **Authentication**
- **Type**: JWT Bearer Token
- **Header**: `Authorization: Bearer <token>`
- **Validation**: JWT signature verification with user context injection

### **API Endpoints**

#### **POST /api/v1/auth/register**
**Purpose**: Register new user account with optional workspace creation

**Authentication**: ❌ Public endpoint

**Rate Limiting**: 5 requests per 15 minutes per IP

**Request Schema**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe",
  "workspaceName": "My Workspace"
}
```

**Response Schema** (201 Success):
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceId": "507f1f77bcf86cd799439012",
    "role": "user",
    "emailVerified": false
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

#### **POST /api/v1/auth/login**
**Purpose**: Authenticate user and return JWT token

**Authentication**: ❌ Public endpoint

**Request Schema**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response Schema** (200 Success):
```json
{
  "message": "Login successful",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceId": "507f1f77bcf86cd799439012",
    "role": "user",
    "emailVerified": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

#### **GET /api/v1/projects**
**Purpose**: List user's accessible projects with pagination

**Authentication**: ✅ Required

**Rate Limiting**: 1000 requests per 15 minutes

**Query Parameters**:
```javascript
{
  "page": 1,           // Page number (default: 1)
  "limit": 20,         // Items per page (default: 20, max: 100)
  "search": "string",  // Search in name/description
  "status": "active|inactive|deleted"
}
```

**Response Schema** (200 Success):
```json
{
  "projects": [
    {
      "id": "507f1f77bcf86cd799439013",
      "name": "Login Flow Design",
      "description": "User authentication flow",
      "ownerId": "507f1f77bcf86cd799439011",
      "status": "active",
      "visibility": "private",
      "flowMetadata": {
        "nodeCount": 5,
        "edgeCount": 4,
        "lastModifiedBy": "507f1f77bcf86cd799439011",
        "version": "1.2.0"
      },
      "createdAt": "2024-01-01T10:00:00Z",
      "updatedAt": "2024-01-15T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### **POST /api/v1/projects**
**Purpose**: Create new project with optional template initialization

**Authentication**: ✅ Required (write_projects permission)

**Request Schema**:
```json
{
  "name": "New Flow Project",
  "description": "Description of the project",
  "visibility": "private|public|workspace",
  "template": "login_flow|signup_flow|null"
}
```

**Response Schema** (201 Success):
```json
{
  "message": "Project created successfully",
  "project": {
    "id": "507f1f77bcf86cd799439014",
    "name": "New Flow Project",
    "description": "Description of the project",
    "ownerId": "507f1f77bcf86cd799439011",
    "workspaceId": "507f1f77bcf86cd799439012",
    "status": "active",
    "visibility": "private",
    "flowMetadata": {
      "nodeCount": 1,
      "edgeCount": 0,
      "lastModifiedBy": "507f1f77bcf86cd799439011",
      "version": "1.0.0"
    },
    "createdAt": "2024-01-20T09:15:00Z",
    "updatedAt": "2024-01-20T09:15:00Z"
  }
}
```

**Error Responses**:
```json
// 400 Bad Request
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "name",
        "message": "Project name is required",
        "value": ""
      }
    ],
    "correlationId": "req_1642680900_abc123",
    "timestamp": "2024-01-20T09:15:00Z"
  }
}

// 401 Unauthorized
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid or expired token",
    "correlationId": "req_1642680900_abc123",
    "timestamp": "2024-01-20T09:15:00Z"
  }
}

// 409 Conflict
{
  "error": {
    "code": "CONFLICT",
    "message": "A project with this name already exists in your workspace",
    "correlationId": "req_1642680900_abc123",
    "timestamp": "2024-01-20T09:15:00Z"
  }
}
```

---

## 📡 **Event-Driven Communication**

### **Published Events (Events this service emits)**

#### **USER_MESSAGE_RECEIVED**
- **Trigger**: When user sends message via WebSocket
- **Frequency**: High volume during active conversations
- **Consumers**: cognitive-core service

**Event Schema**:
```json
{
  "eventType": "USER_MESSAGE_RECEIVED",
  "eventId": "evt_1642680900_abc123",
  "timestamp": "2024-01-20T10:00:00Z",
  "emittedBy": "api-gateway",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "projectId": "507f1f77bcf86cd799439013",
    "workspaceId": "507f1f77bcf86cd799439012",
    "message": "Add a login screen with email and password fields",
    "qualityMode": "standard|detailed|creative",
    "clientId": "client_507f1f77bcf86cd799439011_1642680900_abc123"
  },
  "metadata": {
    "correlationId": "req_1642680900_abc123",
    "sessionId": "sess_1642680900_def456"
  }
}
```

#### **USER_PLAN_APPROVED**
- **Trigger**: When user approves/rejects AI-generated plan
- **Frequency**: Medium volume during plan approval flows
- **Consumers**: cognitive-core service

**Event Schema**:
```json
{
  "eventType": "USER_PLAN_APPROVED",
  "eventId": "evt_1642680900_def456",
  "timestamp": "2024-01-20T10:05:00Z",
  "emittedBy": "api-gateway",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "projectId": "507f1f77bcf86cd799439013",
    "approved": true,
    "plan": [
      {
        "step": 1,
        "action": "Create login screen node",
        "description": "Add new screen node with login form"
      }
    ],
    "currentFlow": {
      "nodes": [...],
      "edges": [...]
    }
  },
  "metadata": {
    "correlationId": "req_1642680900_abc123"
  }
}
```

#### **CLIENT_CONNECTED / CLIENT_DISCONNECTED**
- **Trigger**: WebSocket connection lifecycle events
- **Frequency**: Medium volume based on user activity
- **Consumers**: All services (for connection tracking)

**Event Schema**:
```json
{
  "eventType": "CLIENT_CONNECTED",
  "eventId": "evt_1642680900_ghi789",
  "timestamp": "2024-01-20T09:30:00Z",
  "emittedBy": "api-gateway",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "projectId": "507f1f77bcf86cd799439013",
    "workspaceId": "507f1f77bcf86cd799439012",
    "clientId": "client_507f1f77bcf86cd799439011_1642680900_abc123"
  },
  "metadata": {
    "gatewayId": "gateway-1",
    "connectionType": "websocket"
  }
}
```

### **Consumed Events (Events this service listens to)**

#### **USER_RESPONSE_READY**
- **Source**: cognitive-core service
- **Purpose**: Receive AI assistant responses to forward to WebSocket clients
- **Handler**: WebSocket message forwarding
- **Failure Strategy**: Log error, send generic error message to client

**Expected Schema**:
```json
{
  "eventType": "USER_RESPONSE_READY",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "projectId": "507f1f77bcf86cd799439013",
    "originalEventId": "evt_1642680900_abc123",
    "response": {
      "type": "message|plan_for_approval|confirmation",
      "message": "I'll help you add a login screen...",
      "plan": [...],
      "metadata": {
        "processingTime": 2.3,
        "agentsUsed": ["manager", "planner", "architect"]
      }
    }
  }
}
```

#### **FLOW_UPDATED**
- **Source**: flow-service
- **Purpose**: Broadcast flow changes to connected WebSocket clients
- **Handler**: WebSocket broadcast to project members
- **Failure Strategy**: Log error, client will request full refresh

**Expected Schema**:
```json
{
  "eventType": "FLOW_UPDATED",
  "data": {
    "projectId": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439011",
    "flow": {
      "metadata": {...},
      "nodes": [...],
      "edges": [...]
    },
    "changeType": "node_added|node_updated|edge_added|full_update",
    "changes": [...]
  }
}
```

---

## 🌐 **WebSocket Protocol**

### **Connection Endpoint**
```
ws://localhost:3000/ws?token=JWT_TOKEN&projectId=PROJECT_ID&workspaceId=WORKSPACE_ID
```

### **Connection Verification**
- JWT token validation before WebSocket upgrade
- Project access permission verification
- Rate limiting (10 connections per 5 minutes per IP)

### **Incoming Message Types**

#### **user_message**
```json
{
  "type": "user_message",
  "message": "Add a forgot password link to the login form",
  "qualityMode": "standard|detailed|creative",
  "messageId": "msg_1642680900_abc123"
}
```

#### **plan_approved**
```json
{
  "type": "plan_approved",
  "approved": true,
  "plan": [...],
  "currentFlow": {...},
  "feedback": "Optional feedback if approved=false"
}
```

#### **image_upload**
```json
{
  "type": "image_upload",
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...",
  "mimeType": "image/jpeg",
  "description": "Optional description of the image"
}
```

#### **cursor_position**
```json
{
  "type": "cursor_position",
  "x": 250,
  "y": 180,
  "elementId": "node_login_screen",
  "userName": "John Doe"
}
```

### **Outgoing Message Types**

#### **connection_established**
```json
{
  "type": "connection_established",
  "clientId": "client_507f1f77bcf86cd799439011_1642680900_abc123",
  "projectId": "507f1f77bcf86cd799439013",
  "workspaceId": "507f1f77bcf86cd799439012",
  "connectedAt": "2024-01-20T09:30:00Z",
  "timestamp": "2024-01-20T09:30:00Z"
}
```

#### **assistant_response**
```json
{
  "type": "assistant_response",
  "message": "I'll help you add a login screen. Here's my plan:",
  "responseType": "message|plan_for_approval|confirmation",
  "plan": [
    {
      "step": 1,
      "action": "Create login screen node",
      "description": "Add new screen node with login form components"
    }
  ],
  "correlationId": "evt_1642680900_abc123",
  "timestamp": "2024-01-20T10:00:00Z"
}
```

#### **flow_updated**
```json
{
  "type": "flow_updated",
  "flow": {
    "metadata": {
      "flowName": "User Authentication Flow",
      "version": "1.2.0"
    },
    "nodes": [...],
    "edges": [...]
  },
  "updatedBy": "507f1f77bcf86cd799439011",
  "changeType": "node_added",
  "timestamp": "2024-01-20T10:02:00Z"
}
```

#### **error**
```json
{
  "type": "error",
  "message": "Failed to process message",
  "error": "ValidationError: Message content is required",
  "code": "VALIDATION_ERROR",
  "correlationId": "evt_1642680900_abc123",
  "timestamp": "2024-01-20T10:00:00Z"
}
```

---

## 🗄️ **Data Layer Specification**

### **Database Schema**

#### **Collection: `users`**
```json
{
  "_id": "ObjectId",
  "email": "string (unique)",
  "password": "string (bcrypt hashed)",
  "firstName": "string",
  "lastName": "string",
  "workspaceId": "string",
  "role": "user|admin|moderator",
  "permissions": ["read_projects", "write_projects", "delete_own_projects"],
  "emailVerified": "boolean",
  "lastLoginAt": "Date",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes**:
- `{ "email": 1 }` - Unique index for login
- `{ "workspaceId": 1 }` - For workspace member queries
- `{ "createdAt": 1 }` - For user statistics

#### **Collection: `projects`**
```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "ownerId": "string",
  "workspaceId": "string",
  "members": [
    {
      "userId": "string",
      "role": "owner|editor|viewer",
      "permissions": ["read", "write", "admin"],
      "joinedAt": "Date"
    }
  ],
  "status": "active|inactive|deleted",
  "visibility": "private|public|workspace",
  "flowMetadata": {
    "nodeCount": "number",
    "edgeCount": "number",
    "lastModifiedBy": "string",
    "version": "string"
  },
  "settings": {
    "allowComments": "boolean",
    "allowGuestView": "boolean",
    "autoSave": "boolean"
  },
  "createdAt": "Date",
  "updatedAt": "Date",
  "deletedAt": "Date",
  "deletedBy": "string"
}
```

**Indexes**:
- `{ "workspaceId": 1, "status": 1 }` - For workspace project queries
- `{ "ownerId": 1 }` - For user's owned projects
- `{ "members.userId": 1 }` - For user's shared projects
- `{ "name": "text", "description": "text" }` - For search functionality

#### **Collection: `conversations`**
```json
{
  "_id": "ObjectId",
  "projectId": "string",
  "userId": "string",
  "role": "user|assistant",
  "content": "string",
  "metadata": {
    "messageType": "text|plan|approval|image",
    "processingTime": "number",
    "agentsUsed": ["string"]
  },
  "timestamp": "Date",
  "createdAt": "Date"
}
```

**Indexes**:
- `{ "projectId": 1, "timestamp": 1 }` - For conversation history
- `{ "userId": 1, "createdAt": 1 }` - For user activity tracking

### **Cache Strategy**

#### **Redis Cache Keys**
| Pattern | TTL | Purpose | Invalidation |
|---------|-----|---------|-------------|
| `session:user:{userId}` | 3600s | User session data | On logout/token refresh |
| `project:members:{projectId}` | 300s | Project member list | On member add/remove |
| `user:profile:{userId}` | 1800s | User profile cache | On profile update |
| `rate_limit:{ip}:{endpoint}` | 900s | Rate limiting counters | TTL expiry |

---

## ⚙️ **Configuration & Environment**

### **Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `API_GATEWAY_PORT` | ❌ | `3000` | HTTP server port | `3000` |
| `NODE_ENV` | ✅ | `development` | Environment mode | `production` |
| `MONGODB_URI` | ✅ | - | MongoDB connection string | `mongodb://localhost:27017/ux-flow-engine` |
| `REDIS_URL` | ✅ | - | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | ✅ | - | JWT signing secret key | `your-super-secret-jwt-key` |
| `JWT_EXPIRES_IN` | ❌ | `7d` | JWT token expiration | `7d` |
| `RATE_LIMIT_WINDOW_MS` | ❌ | `900000` | Rate limit window (15 min) | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | ❌ | `100` | Max requests per window | `100` |
| `ALLOWED_ORIGINS` | ❌ | - | CORS allowed origins (comma-separated) | `https://app.uxflow.com,https://staging.uxflow.com` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |

### **Secrets (Managed via Secret Manager)**
| Secret Name | Purpose | Rotation | Access Level |
|-------------|---------|----------|--------------|
| `JWT_SECRET` | Token signing/verification | Quarterly | Service account only |
| `MONGODB_URI` | Database authentication | Monthly | Database admin only |
| `REDIS_URL` | Cache authentication | Monthly | Cache admin only |

### **Feature Flags**
| Flag | Default | Purpose | Dependencies |
|------|---------|---------|-------------|
| `ENABLE_WEBSOCKET_COMPRESSION` | `true` | Enable WebSocket message compression | None |
| `ENABLE_CROSS_ORIGIN_WEBSOCKETS` | `false` | Allow WebSocket connections from different origins | Security review |
| `ENABLE_DETAILED_ERROR_RESPONSES` | `false` | Include stack traces in error responses | Development only |

---

## 🛠️ **Development & Operations**

### **Local Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+
mongod --version # Requires MongoDB 5.0+
redis-server --version # Requires Redis 6.0+

# Installation
git clone <repository>
cd services/api-gateway
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration:
# - Add MongoDB connection string
# - Add Redis connection string  
# - Add JWT secret key
# - Configure CORS origins

# Development mode (with hot reload)
npm run dev

# Verify service health
curl http://localhost:3000/health
```

### **Testing**
```bash
# Unit tests
npm test

# Integration tests (requires running MongoDB/Redis)
npm run test:integration

# WebSocket tests
npm run test:websocket

# Coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### **Build & Deploy**
```bash
# Build Docker image
docker build -t ux-flow/api-gateway .

# Run in Docker with dependencies
docker-compose up --build

# Deploy to production (Kubernetes)
kubectl apply -f k8s/api-gateway.yaml
```

---

## 🏥 **Health & Monitoring**

### **Health Check Endpoint**
- **URL**: `GET /health`
- **Response Time**: < 200ms
- **Dependencies Checked**: 
  - MongoDB connection status
  - Redis connection status
  - WebSocket server status

**Response Schema**:
```json
{
  "service": "api-gateway",
  "status": "ok|degraded|error",
  "version": "2.0.0",
  "environment": "production",
  "uptime": 86400,
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error", 
    "websocket": "ok|error"
  },
  "websocketConnections": {
    "totalConnections": 42,
    "activeConnections": 35,
    "connectionsByProject": {
      "507f1f77bcf86cd799439013": 12,
      "507f1f77bcf86cd799439014": 23
    }
  },
  "timestamp": "2024-01-20T10:00:00Z"
}
```

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - HTTP request latency (p50, p95, p99)
  - HTTP request rate (requests per second)
  - HTTP error rate (percentage)
  - WebSocket connection count (active/total)
  - WebSocket message rate (messages per second)
  - Authentication success/failure rate
  - Rate limiting trigger rate

### **Logging Standards**
```json
{
  "timestamp": "2024-01-20T10:00:00Z",
  "level": "info|warn|error|debug",
  "service": "api-gateway",
  "message": "User authenticated successfully",
  "correlationId": "req_1642680900_abc123",
  "userId": "507f1f77bcf86cd799439011",
  "metadata": {
    "endpoint": "/api/v1/auth/login",
    "method": "POST",
    "responseTime": 250,
    "userAgent": "Mozilla/5.0...",
    "ip": "192.168.1.100"
  }
}
```

### **Alert Conditions**
| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| HTTP error rate | > 5% | High | Immediate investigation |
| Response time p95 | > 2s | Medium | Performance review |
| WebSocket connection failures | > 10% | Medium | WebSocket infrastructure check |
| Authentication failure rate | > 20% | High | Security incident investigation |
| Health check failures | > 3 consecutive | Critical | Auto-scaling trigger |
| Memory usage | > 85% | Medium | Memory leak investigation |

---

## 🔧 **Service-Specific Implementation Details**

### **Business Logic Overview**
API Gateway implements a multi-layered architecture with request routing, authentication middleware, rate limiting, and WebSocket connection management. The service handles both synchronous HTTP requests and asynchronous real-time communication through WebSocket connections organized into project-based rooms.

### **Critical Code Paths**
- **Authentication Flow**: JWT validation → User context injection → Permission checking
- **WebSocket Connection**: Token verification → Room assignment → Message routing → Event emission
- **Request Processing**: Rate limiting → CORS validation → Route matching → Authentication → Business logic

### **Performance Considerations**
- Expected throughput: 1000 HTTP requests/second, 500 concurrent WebSocket connections
- Memory usage: ~200 MB under normal load (scales with concurrent connections)
- CPU usage: ~15% under normal load (spikes during authentication bursts)
- WebSocket message broadcasting optimized with Redis pub/sub for horizontal scaling

### **Security Considerations**
- JWT tokens with 7-day expiration and secure signing algorithm (HS256)
- Rate limiting with sliding window implementation
- CORS configuration with strict origin validation
- Input validation using Joi schemas for all endpoints
- WebSocket connections authenticated before upgrade
- SQL injection prevention through MongoDB ODM
- XSS protection via Helmet.js security headers

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **Service won't start**
```bash
# Check logs for startup errors
docker logs api-gateway-container

# Verify environment variables
env | grep -E "(MONGODB|REDIS|JWT)"

# Test database connectivity
npm run test:db

# Check port availability
lsof -i :3000
```

#### **WebSocket connections failing**
1. Verify JWT token validity and expiration
2. Check CORS configuration for WebSocket origin
3. Confirm Redis connectivity for room management
4. Review rate limiting settings for WebSocket connections
5. Check MongoDB connectivity for user/project validation

#### **High authentication failure rate**
1. Check JWT secret key configuration
2. Verify MongoDB user collection accessibility
3. Review rate limiting settings for auth endpoints
4. Check bcrypt password comparison performance
5. Analyze login attempt patterns for attacks

#### **Performance degradation**
1. Monitor MongoDB query performance (add indexes if needed)
2. Check Redis connection pool utilization
3. Review WebSocket connection count and memory usage
4. Analyze rate limiting effectiveness
5. Check for memory leaks in WebSocket connection management

### **Debug Mode**
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable specific debug categories
DEBUG=api-gateway:* npm run dev

# Enable WebSocket debug logging
DEBUG=websocket:* npm run dev

# Enable authentication debug logging
DEBUG=auth:* npm run dev
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../docs/ARCHITECTURE.md)
- [Cognitive Core Service Integration](../cognitive-core/README.md)
- [Flow Service Integration](../flow-service/README.md)
- [WebSocket Protocol Specification](../docs/WEBSOCKET_PROTOCOL.md)
- [Authentication & Authorization Guide](../docs/AUTH.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)

### **External References**
- [Express.js Documentation](https://expressjs.com/en/api.html)
- [WebSocket API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [JWT Specification (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [MongoDB Node.js Driver](https://docs.mongodb.com/drivers/node/)
- [Redis Node.js Client](https://github.com/redis/node-redis)

---

## 📝 **Changelog**

### **Version 2.0.0** (2024-01-01)
- Initial microservice implementation
- WebSocket real-time communication
- Multi-agent event system integration
- JWT authentication system
- Project-based collaboration features

### **Version 2.0.1** (2024-01-15)
- Enhanced WebSocket room management
- Improved rate limiting strategies
- Cross-gateway WebSocket synchronization
- Better error handling and logging

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @api-gateway-team | Architecture decisions, breaking changes, security |
| Lead Developer | @john-doe | Day-to-day development, code reviews, bug fixes |
| DevOps Contact | @devops-team | Deployment, infrastructure, monitoring, scaling |
| Security Contact | @security-team | Authentication, authorization, vulnerability management |

---

> **🔄 Last Updated**: 2024-01-20  
> **📋 Documentation Version**: 2.0  
> **🤖 Auto-validation**: ✅ API schemas validated | ✅ Event schemas validated | ✅ WebSocket protocol documented