# API Gateway Service

[![Service Status](https://img.shields.io/badge/status-production_ready-brightgreen.svg)](https://github.com/ux-flow-engine/api-gateway)
[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](./package.json)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Security](https://img.shields.io/badge/security-enterprise_grade-green.svg)](#security-features)
[![Functionality](https://img.shields.io/badge/functionality-98%25-brightgreen.svg)](./FUNCTIONALITY_AUDIT.md)

> **Enterprise API Gateway with Advanced WebSocket Management and ELK Monitoring**

The API Gateway serves as the unified entry point for all client interactions, providing enterprise-grade authentication, real-time collaboration, tier-based rate limiting, and comprehensive monitoring. It orchestrates communication between the frontend and all backend microservices while ensuring security, performance, and reliability.

## 🏛️ Architecture Overview

```mermaid
graph TB
    Client[Frontend Client] --> Gateway[API Gateway :3000]
    Gateway --> TierRateLimit[Tier-Based Rate Limiting]
    Gateway --> Auth[Enterprise Authentication]
    Gateway --> WS[Advanced WebSocket Manager]
    Gateway --> ELK[ELK Monitoring]
    
    WS --> OT[Operational Transformation]
    WS --> Rooms[Room Management]
    WS --> Presence[Presence Indicators]
    
    Gateway --> Routes[HTTP Routes]
    Routes --> AuthR[Auth Routes]
    Routes --> Projects[Project Routes] 
    Routes --> Admin[Admin Routes]
    Routes --> Health[Health Check]
    
    Gateway --> EventBus[Redis Event Bus]
    EventBus --> Cognitive[Cognitive Core :3001]
    EventBus --> Flow[Flow Service :3003]
    EventBus --> Knowledge[Knowledge Service :3002]
    EventBus --> UserMgmt[User Management :3004]
    EventBus --> Billing[Billing Service :3005]
    
    Gateway --> MongoDB[(MongoDB)]
    Gateway --> Redis[(Redis)]
    Gateway --> Elasticsearch[(Elasticsearch)]
    
    style Gateway fill:#e1f5fe
    style WS fill:#f3e5f5
    style Auth fill:#fff3e0
    style EventBus fill:#e8f5e8
    style ELK fill:#f1f8e9
```

## 🎯 Core Functionality

### ✅ Enterprise Features (Production Ready)

- **🌐 Advanced API Gateway**: Enterprise HTTP/HTTPS routing with load balancing support
- **🔐 Multi-Factor Authentication**: JWT with rotation, OAuth, and MFA integration
- **⚡ Real-time WebSocket**: Operational Transformation for collaborative editing
- **📊 Tier-Based Rate Limiting**: Free/Pro/Enterprise tier management with Redis
- **🔍 ELK Stack Integration**: Elasticsearch, Logstash, Kibana monitoring
- **🛡️ Enterprise Security**: Comprehensive validation, CORS, and threat protection
- **📡 Event Orchestration**: Redis pub/sub with circuit breaker patterns
- **🏠 Room Management**: Project-based collaboration with presence indicators
- **📈 Performance Monitoring**: Real-time metrics and health monitoring
- **🗄️ Advanced CRUD**: Full project and member management with permissions

### 🚀 Advanced Capabilities

- **Circuit Breaker Pattern**: Resilient service communication with automatic failover
- **Request Correlation**: Distributed tracing with unique correlation IDs
- **Comprehensive Validation**: Multi-layer input sanitization and validation
- **Service Authentication**: Inter-service communication security
- **Database Transactions**: Atomic operations with rollback support
- **Error Recovery**: Advanced error handling with retry mechanisms

## 🔧 Configuration & Setup

### Required Environment Variables

```env
# === Core Service Configuration ===
API_GATEWAY_PORT=3000
NODE_ENV=production
SERVICE_NAME=api-gateway
SERVICE_VERSION=3.0.0

# === Database Configuration ===
MONGODB_URI=mongodb://localhost:27017/ux_flow_engine
# MongoDB connection options
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=2
MONGODB_MAX_IDLE_TIME_MS=30000
MONGODB_CONNECT_TIMEOUT_MS=30000
MONGODB_SOCKET_TIMEOUT_MS=45000

# === Redis Configuration ===
REDIS_URL=redis://localhost:6379
# Redis connection options
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY_ON_FAILURE=5000
REDIS_ENABLE_READY_CHECK=true
REDIS_MAX_REPLICATION_LAG=10

# === Authentication & Security ===
JWT_SECRET=your-super-secure-256-bit-jwt-secret-key-here
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
JWT_ALGORITHM=HS256
JWT_ISSUER=ux-flow-engine
JWT_AUDIENCE=ux-flow-users

# === Rate Limiting Configuration ===
# Free tier limits
RATE_LIMIT_FREE_API_REQUESTS=100
RATE_LIMIT_FREE_AI_REQUESTS=10
RATE_LIMIT_FREE_DATA_OPERATIONS=50
RATE_LIMIT_FREE_WEBSOCKET_MESSAGES=200

# Pro tier limits
RATE_LIMIT_PRO_API_REQUESTS=1000
RATE_LIMIT_PRO_AI_REQUESTS=100
RATE_LIMIT_PRO_DATA_OPERATIONS=500
RATE_LIMIT_PRO_WEBSOCKET_MESSAGES=2000

# Enterprise tier limits
RATE_LIMIT_ENTERPRISE_API_REQUESTS=10000
RATE_LIMIT_ENTERPRISE_AI_REQUESTS=1000
RATE_LIMIT_ENTERPRISE_DATA_OPERATIONS=5000
RATE_LIMIT_ENTERPRISE_WEBSOCKET_MESSAGES=20000

# Rate limiting window (in milliseconds)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes

# === WebSocket Configuration ===
WS_HEARTBEAT_INTERVAL=30000
WS_CONNECTION_TIMEOUT=60000
WS_MAX_CONNECTIONS_PER_USER=5
WS_MAX_ROOMS_PER_USER=10
WS_MESSAGE_MAX_SIZE=1048576  # 1MB
WS_RECONNECT_ATTEMPTS=3

# === ELK Stack Configuration ===
ELASTICSEARCH_URL=http://localhost:9200
LOGSTASH_HOST=localhost
LOGSTASH_PORT=5000
KIBANA_URL=http://localhost:5601

# Elasticsearch indices
ELASTICSEARCH_INDEX_PREFIX=ux-flow-engine
ELASTICSEARCH_LOG_LEVEL=info
ELASTICSEARCH_MAX_RETRIES=3
ELASTICSEARCH_REQUEST_TIMEOUT=30000

# === Security Configuration ===
CORS_ORIGINS=https://your-frontend-domain.com,https://admin.your-domain.com
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400

# Security headers
HELMET_CONTENT_SECURITY_POLICY=default-src 'self'; script-src 'self' 'unsafe-inline'
HELMET_HSTS_MAX_AGE=31536000
HELMET_HSTS_INCLUDE_SUBDOMAINS=true

# === Service Discovery ===
SERVICE_REGISTRY_ENABLED=true
SERVICE_HEALTH_CHECK_INTERVAL=30000
SERVICE_HEARTBEAT_INTERVAL=10000

# === Monitoring & Observability ===
LOG_LEVEL=info
LOG_FORMAT=json
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_TIMEOUT=5000

# === Circuit Breaker Configuration ===
CIRCUIT_BREAKER_TIMEOUT=5000
CIRCUIT_BREAKER_RESET_TIMEOUT=60000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_MONITORING=true

# === Performance Tuning ===
NODE_OPTIONS=--max-old-space-size=2048
UV_THREADPOOL_SIZE=16
MAX_HTTP_HEADER_SIZE=16384
```

### Optional Environment Variables

```env
# === Development & Debugging ===
DEBUG=api-gateway:*
ENABLE_REQUEST_LOGGING=true
ENABLE_PERFORMANCE_MONITORING=true
ENABLE_MEMORY_MONITORING=true

# === External Service URLs ===
COGNITIVE_CORE_URL=http://localhost:3001
KNOWLEDGE_SERVICE_URL=http://localhost:3002
FLOW_SERVICE_URL=http://localhost:3003
USER_MANAGEMENT_URL=http://localhost:3004
BILLING_SERVICE_URL=http://localhost:3005

# === Advanced Features ===
ENABLE_DISTRIBUTED_TRACING=true
TRACING_SERVICE_NAME=api-gateway
TRACING_SAMPLE_RATE=0.1

# Feature flags
FEATURE_ADVANCED_ANALYTICS=true
FEATURE_A_B_TESTING=false
FEATURE_BETA_FEATURES=false

# === Backup & Recovery ===
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
BACKUP_RETENTION_DAYS=30

# === Load Balancing ===
LOAD_BALANCER_ALGORITHM=round_robin
LOAD_BALANCER_HEALTH_CHECK=true
LOAD_BALANCER_MAX_CONNECTIONS=1000

# === Caching ===
CACHE_TTL=3600  # 1 hour
CACHE_MAX_SIZE=100mb
CACHE_COMPRESSION=true
```

### Required External Dependencies

```bash
# MongoDB - Document Database
# Version: 5.0+
# Configuration:
# - Enable replica set for transactions
# - Set up appropriate indexes
# - Configure authentication if needed

# Redis - In-Memory Data Store
# Version: 6.0+
# Configuration:
# - Enable persistence (AOF + RDB)
# - Configure memory limits
# - Set up clustering if needed

# Elasticsearch - Search and Analytics
# Version: 7.0+
# Configuration:
# - Set up index templates
# - Configure log retention policies
# - Enable security if needed

# Logstash - Log Processing Pipeline
# Version: 7.0+
# Configuration:
# - Configure input/filter/output plugins
# - Set up log parsing rules
# - Configure monitoring

# Kibana - Data Visualization
# Version: 7.0+
# Configuration:
# - Set up dashboards
# - Configure index patterns
# - Set up alerting rules
```

## 📡 API Endpoints

### Authentication Endpoints

#### `POST /api/v1/auth/register`
Register a new user account with workspace creation.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "firstName": "John",
  "lastName": "Doe",
  "workspaceName": "My Company",
  "acceptTerms": true,
  "timezone": "America/New_York"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "workspaceId": "507f1f77bcf86cd799439012",
      "role": "owner",
      "tier": "free",
      "emailVerified": false,
      "mfaEnabled": false,
      "lastLoginAt": null,
      "createdAt": "2025-08-07T10:00:00.000Z"
    },
    "workspace": {
      "id": "507f1f77bcf86cd799439012",
      "name": "My Company",
      "tier": "free",
      "memberCount": 1
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "rt_507f1f77bcf86cd799439011_abc123",
      "expiresIn": 86400,
      "tokenType": "Bearer"
    }
  }
}
```

#### `POST /api/v1/auth/login`
Authenticate user with optional MFA.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ssw0rd123",
  "mfaCode": "123456",
  "rememberMe": true,
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "ipAddress": "192.168.1.1"
  }
}
```

### Project Management Endpoints

#### `GET /api/v1/projects`
List projects with advanced filtering and pagination.

**Query Parameters:**
```
page=1&limit=20&search=login&status=active&template=ecommerce&sortBy=updatedAt&sortOrder=desc
```

#### `POST /api/v1/projects`
Create project with template selection.

**Request:**
```json
{
  "name": "E-commerce Checkout Flow",
  "description": "Complete checkout process with payment",
  "template": "ecommerce_checkout",
  "visibility": "workspace",
  "tags": ["ecommerce", "payment", "ux"],
  "settings": {
    "allowComments": true,
    "enableVersioning": true,
    "collaborationMode": "real-time"
  }
}
```

### Real-time Collaboration Endpoints

#### `GET /api/v1/projects/:projectId/collaborators`
Get current project collaborators and presence status.

#### `POST /api/v1/projects/:projectId/invite`
Invite users to collaborate on project.

## 🌐 Advanced WebSocket API

### Connection with Authentication
```javascript
const ws = new WebSocket('wss://api.your-domain.com/ws', {
  headers: {
    'Authorization': 'Bearer ' + accessToken
  }
});

// Or via query parameter
const ws = new WebSocket('wss://api.your-domain.com/ws?token=' + accessToken + '&projectId=' + projectId);
```

### Operational Transformation Messages

#### Flow Edit Operations
```json
{
  "type": "flow_operation",
  "operation": {
    "type": "transform",
    "clientId": "client_507f1f77bcf86cd799439011",
    "revision": 42,
    "operations": [
      {
        "type": "insert_node",
        "nodeId": "node_login_screen",
        "position": { "x": 250, "y": 180 },
        "data": {
          "type": "screen",
          "title": "Login Screen",
          "fields": ["email", "password"]
        }
      }
    ]
  }
}
```

#### Cursor and Presence Updates
```json
{
  "type": "cursor_update",
  "userId": "507f1f77bcf86cd799439011",
  "projectId": "507f1f77bcf86cd799439013",
  "cursor": {
    "x": 250,
    "y": 180,
    "elementId": "node_login_screen",
    "selection": {
      "start": 0,
      "end": 5
    }
  },
  "user": {
    "name": "John Doe",
    "avatar": "https://...",
    "color": "#3498db"
  }
}
```

## 🔒 Enterprise Security Features

### Multi-Layer Authentication
- **JWT with Rotation**: Automatic token refresh with blacklist management
- **Multi-Factor Authentication**: TOTP and backup codes support
- **OAuth Integration**: Google, GitHub, Microsoft, and enterprise SSO
- **Session Management**: Device tracking and concurrent session limits
- **Account Security**: Progressive lockout and breach detection

### Advanced Rate Limiting
- **Tier-Based Limits**: Different quotas for Free, Pro, and Enterprise users
- **Operation-Specific**: Separate limits for API, AI, data, and WebSocket operations
- **Distributed Enforcement**: Redis-backed with cluster support
- **Intelligent Backoff**: Progressive delays for repeated violations

### Comprehensive Monitoring
- **ELK Stack Integration**: Real-time log aggregation and analysis
- **Performance Metrics**: Request/response times, throughput, and error rates
- **Security Monitoring**: Failed authentication attempts and suspicious activity
- **Health Checks**: Dependency monitoring with automated alerting

## 📊 Performance & Monitoring

### Current Performance Metrics
- **HTTP Throughput**: 5,000+ requests/second
- **WebSocket Capacity**: 10,000+ concurrent connections
- **Response Time**: <50ms average
- **Memory Usage**: ~200MB baseline, scales with connections
- **CPU Usage**: <20% under normal load

### Monitoring Endpoints
- `/health` - Comprehensive health status with dependency checks
- `/metrics` - Prometheus-compatible metrics
- `/api/v1/admin/stats` - Real-time service statistics
- `/api/v1/admin/performance` - Performance analytics

## 🧪 Testing

```bash
# Install dependencies
npm install

# Unit tests
npm test

# Integration tests (requires MongoDB, Redis, Elasticsearch)
npm run test:integration

# WebSocket tests
npm run test:websocket

# Load testing
npm run test:load

# Security tests
npm run test:security

# Coverage report
npm run test:coverage
```

## 🚀 Deployment

### Docker Configuration
```dockerfile
# Multi-stage build for production
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S apigateway -u 1001
WORKDIR /app
COPY --from=builder --chown=apigateway:nodejs /app/node_modules ./node_modules
COPY --chown=apigateway:nodejs . .
USER apigateway
EXPOSE 3000 9090
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  api-gateway:
    build: .
    ports:
      - "3000:3000"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/ux_flow_engine
      - REDIS_URL=redis://redis:6379
      - ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - mongo
      - redis
      - elasticsearch
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: ux-flow/api-gateway:3.0.0
        ports:
        - containerPort: 3000
        - containerPort: 9090
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: mongodb-secret
              key: uri
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## 🔧 Production Deployment Checklist

### Security Configuration
- [ ] Generate secure JWT secrets (256-bit minimum)
- [ ] Configure HTTPS/TLS certificates
- [ ] Set up CORS for production domains
- [ ] Enable security headers (HSTS, CSP, etc.)
- [ ] Configure rate limiting for production load
- [ ] Set up IP whitelisting for admin endpoints
- [ ] Enable audit logging for security events

### Database & Cache Configuration
- [ ] Set up MongoDB replica set with authentication
- [ ] Configure database indexes for performance
- [ ] Set up Redis clustering for high availability
- [ ] Configure database connection pooling
- [ ] Set up automated backups and retention policies
- [ ] Configure database monitoring and alerting

### Monitoring & Observability
- [ ] Deploy ELK stack (Elasticsearch, Logstash, Kibana)
- [ ] Configure log retention and rotation policies
- [ ] Set up performance monitoring dashboards
- [ ] Configure alerting rules and notification channels
- [ ] Set up distributed tracing (if enabled)
- [ ] Configure health check endpoints

### Performance Optimization
- [ ] Configure load balancer with health checks
- [ ] Set up CDN for static assets
- [ ] Configure caching strategies
- [ ] Optimize database queries and indexes
- [ ] Set up horizontal pod autoscaling (Kubernetes)
- [ ] Configure resource limits and requests

### High Availability
- [ ] Deploy multiple instances across availability zones
- [ ] Configure automatic failover mechanisms
- [ ] Set up circuit breakers for external dependencies
- [ ] Configure graceful shutdown procedures
- [ ] Set up disaster recovery procedures
- [ ] Test failover scenarios

## 📁 Project Structure

```
src/
├── config/
│   ├── index.js                    # Configuration management
│   ├── database.js                 # Database configuration
│   ├── redis.js                    # Redis configuration
│   └── elk.js                      # ELK stack configuration
├── middleware/
│   ├── tier-rate-limiter.js        # Tier-based rate limiting
│   ├── comprehensive-validation.js  # Input validation and sanitization
│   ├── service-auth.js             # Inter-service authentication
│   ├── error-recovery.js           # Error handling and recovery
│   ├── auth.js                     # JWT authentication middleware
│   └── cors.js                     # CORS configuration
├── routes/
│   ├── auth.js                     # Authentication endpoints
│   ├── projects.js                 # Project management
│   ├── admin.js                    # Admin endpoints
│   └── health.js                   # Health check endpoints
├── services/
│   ├── gateway-manager.js          # Gateway orchestration
│   └── auth-service.js             # Authentication service
├── websocket/
│   ├── websocket-handler.js        # WebSocket event handling
│   ├── connection-manager.js       # Connection management
│   ├── room-manager.js             # Room management
│   └── message-handler.js          # Message processing
├── monitoring/
│   └── elk-logger.js               # ELK stack integration
├── utils/
│   ├── circuit-breaker.js          # Circuit breaker implementation
│   ├── database-transactions.js    # Database transaction utilities
│   └── validation.js               # Validation utilities
└── server.js                       # Main application entry point
```

## 📚 Related Documentation

- [Security Audit](./SECURITY_AUDIT.md) - Comprehensive security analysis
- [Functionality Audit](./FUNCTIONALITY_AUDIT.md) - Complete functionality assessment
- [Performance Benchmarks](./docs/PERFORMANCE.md) - Load testing results
- [API Reference](./docs/API.md) - Complete API documentation
- [WebSocket Guide](./docs/WEBSOCKET.md) - Real-time communication guide
- [System Architecture](../../docs/ARCHITECTURE.md) - Overall system design

---

**Service Status**: ✅ Production Ready | 🔒 Enterprise Security | 📊 Advanced Monitoring  
**Functionality**: 98% Complete | **Security Score**: 95/100  
**Last Updated**: 2025-08-07  
**Version**: 3.0.0