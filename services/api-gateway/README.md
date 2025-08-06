# API Gateway Service

## 🎯 **Service Purpose**
Central entry point for all client requests. Handles HTTP/REST API endpoints, WebSocket connections, authentication, and routes requests to appropriate microservices.

## 🏗️ **Architecture**

### **Core Responsibilities**
- **Request Routing**: Single entry point for all client requests
- **Authentication & Authorization**: JWT validation and user session management
- **WebSocket Management**: Real-time communication for collaborative editing
- **Rate Limiting**: Request throttling and abuse prevention
- **CORS & Security**: Security headers and cross-origin resource sharing

### **Technology Stack**
- **Runtime**: Node.js 18+ with Express.js framework
- **WebSocket**: ws library for real-time communication
- **Authentication**: JWT tokens with @ux-flow/common utilities
- **Security**: Helmet.js, CORS, express-rate-limit
- **Validation**: Joi schemas for request validation

## 📡 **API Endpoints**

### **Public Endpoints**
```
GET  /                     # Service info and health
GET  /health              # Health check endpoint
POST /api/v1/auth/register # User registration
POST /api/v1/auth/login   # User authentication
POST /api/v1/auth/refresh # Token refresh
```

### **Protected Endpoints**
```
GET    /api/v1/auth/me                    # Get current user profile
PATCH  /api/v1/auth/me                    # Update user profile
POST   /api/v1/auth/change-password       # Change password
GET    /api/v1/projects                   # List user projects
POST   /api/v1/projects                   # Create new project
GET    /api/v1/projects/:id               # Get specific project
PATCH  /api/v1/projects/:id               # Update project
DELETE /api/v1/projects/:id               # Delete project
POST   /api/v1/projects/:id/members       # Add project member
DELETE /api/v1/projects/:id/members/:uid  # Remove project member
```

### **Admin Endpoints**
```
GET  /api/v1/admin/stats                 # System statistics
GET  /api/v1/admin/users                 # User management
POST /api/v1/admin/suggestions/:id/approve # Approve AI suggestions
```

## 🔌 **WebSocket Protocol**

### **Connection**
```
ws://localhost:3000/ws?token=JWT_TOKEN&projectId=ID&workspaceId=ID
```

### **Message Types**
```typescript
// Incoming Messages
{
  type: "user_message" | "plan_approved" | "plan_feedback" | "image_upload" | "cursor_position"
  message?: string
  projectId: string
  workspaceId: string
  // ... additional fields per type
}

// Outgoing Messages
{
  type: "assistant_response" | "flow_updated" | "connection_established" | "error"
  message?: string
  plan?: object
  flow?: object
  // ... additional fields per type
}
```

## 🔄 **Service Interactions**

### **Event Publishing**
```
USER_MESSAGE_RECEIVED     -> Cognitive Core Service
USER_PLAN_APPROVED        -> Cognitive Core Service
CLIENT_CONNECTED          -> System-wide notification
CLIENT_DISCONNECTED       -> System-wide notification
```

### **Event Subscriptions**
```
USER_RESPONSE_READY       <- Cognitive Core Service
FLOW_UPDATED              <- Flow Service
SERVICE_ERROR             <- All Services
```

## 🗄️ **Data Models**

### **WebSocket Client Info**
```typescript
{
  clientId: string
  userId: string
  projectId: string
  workspaceId: string
  connectedAt: Date
  lastSeen: Date
  isAlive: boolean
}
```

### **Request Context**
```typescript
{
  correlationId: string
  user: {
    userId: string
    email: string
    workspaceId: string
    role: string
    permissions: string[]
  }
}
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Service Configuration
NODE_ENV=production
PORT=3000
API_VERSION=v1

# Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100    # 100 requests per window

# Service URLs
COGNITIVE_CORE_URL=http://localhost:3001
KNOWLEDGE_SERVICE_URL=http://localhost:3002
FLOW_SERVICE_URL=http://localhost:3003

# Database
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379
```

### **Rate Limiting Strategies**
- **General API**: 100 requests per 15 minutes per IP/user
- **Authentication**: 5 attempts per 15 minutes per IP
- **WebSocket**: 10 connections per 5 minutes per IP
- **Heavy Operations**: 10 operations per hour per user

## 🔍 **Health Check Response**
```json
{
  "service": "api-gateway",
  "status": "ok|degraded|error",
  "uptime": 12345,
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "websocket": "ok|error"
  },
  "websocketConnections": {
    "totalConnections": 42,
    "activeConnections": 35,
    "connectionsByProject": {...}
  }
}
```

## 🧪 **Testing Strategy**

### **Unit Tests**
- Authentication middleware validation
- Rate limiting functionality
- CORS configuration
- Request validation schemas

### **Integration Tests**
- End-to-end API workflows
- WebSocket connection management
- Service communication via events
- Authentication flows

### **Load Tests**
- WebSocket connection stress testing
- Rate limiting validation
- Concurrent request handling

## 🚀 **Deployment**

### **Docker Configuration**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### **Health Check**
```bash
curl http://localhost:3000/health
```

### **Scaling Considerations**
- Stateless design enables horizontal scaling
- WebSocket connections managed via Redis for multi-instance support
- Rate limiting data shared across instances via Redis

## 📋 **Development Guidelines**

### **Adding New Endpoints**
1. Create route file in `src/routes/`
2. Add authentication middleware if needed
3. Implement request validation with Joi
4. Add integration tests
5. Update this README with new endpoints

### **WebSocket Message Types**
1. Define message schema in `src/websocket/message-handler.js`
2. Add validation logic
3. Implement handler function
4. Add event emission if needed
5. Update WebSocket protocol documentation

### **Monitoring & Debugging**
- All requests logged with correlation IDs
- WebSocket connections tracked with detailed metadata
- Health checks expose service and dependency status
- Metrics endpoint for Prometheus integration

---

## 🔄 **README Maintenance**
**⚠️ IMPORTANT**: When modifying this service, update the following sections:
- API Endpoints (if routes change)
- WebSocket Protocol (if message types change)
- Service Interactions (if events change)
- Configuration (if env vars change)
- Data Models (if schemas change)