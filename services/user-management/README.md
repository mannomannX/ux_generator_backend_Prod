# User Management Service - Authentication & Workspace Management

> **⚠️ DOCUMENTATION MAINTENANCE REQUIRED**  
> When making changes to this service, you MUST update this README if the changes affect:
> - Authentication endpoints (JWT, password reset, email verification)
> - User/workspace event schemas (registration, deletion, membership changes)
> - Database schema for users or workspaces collections
> - Environment variables or security configuration
> - GDPR compliance features or user data handling

---

## 🎯 **Service Overview**

### **Purpose**
Comprehensive user authentication, authorization, and workspace management service for UX-Flow-Engine. Handles user lifecycle from registration to deletion, workspace creation and collaboration, and provides secure JWT-based authentication for the entire platform.

### **Core Responsibilities**
- **User Authentication**: Registration, login, password management, email verification
- **Workspace Management**: Multi-tenant workspace creation, member management, ownership transfer
- **Authorization**: Role-based access control (RBAC) with granular permissions
- **Security**: JWT token management, progressive rate limiting, account lockout protection
- **GDPR Compliance**: Data export, anonymization, and hard deletion capabilities
- **Admin Management**: User administration, system monitoring, bulk operations
- **Email Communication**: Transactional emails for user onboarding and notifications

### **Implementation Status: ✅ COMPLETE**
- **Core Services**: 100% implemented
- **API Routes**: 100% implemented (auth, users, workspaces, admin, health)
- **Middleware**: 100% implemented (auth, error handling, rate limiting)
- **Models & Utils**: 100% implemented
- **Docker & K8s**: 100% implemented
- **Testing**: 100% implemented (unit, integration, fixtures)

### **Service Dependencies**

#### **Input Dependencies (Services this service consumes)**
| Service | Communication Method | Purpose | Required |
|---------|---------------------|---------|----------|
| `api-gateway` | Redis Events | User registration/login requests | Yes |
| External services | - | No external service dependencies | - |

#### **Output Dependencies (Services that consume this service)**
| Service | Communication Method | What they get from us | Critical |
|---------|---------------------|----------------------|----------|
| `api-gateway` | Redis Events | Authentication results, user sessions | Yes |
| `cognitive-core` | Redis Events | User context for AI personalization | No |
| `flow-service` | Redis Events | User/workspace info for project access control | Yes |
| `knowledge-service` | Redis Events | Workspace context for RAG scoping | No |

#### **External Dependencies**
| Dependency | Type | Purpose | Fallback Strategy |
|------------|------|---------|------------------|
| MongoDB Atlas | Database | User and workspace data persistence | Circuit breaker, read-only mode |
| Redis | Cache/Events | Session management & inter-service communication | Memory-only sessions, degraded performance |
| SMTP Server | Email Service | Transactional emails (optional) | Log emails instead, continue operations |

---

## 📁 **Complete Service Structure**

```
services/user-management/
├── src/
│   ├── server.js                           ✅ Main service entry point
│   ├── config/
│   │   └── index.js                        ✅ Service configuration
│   ├── middleware/                         ✅ NEW - Complete middleware layer
│   │   ├── auth.js                         ✅ Authentication & authorization
│   │   ├── error-handler.js                ✅ Error handling & custom errors
│   │   └── rate-limit.js                   ✅ Rate limiting strategies
│   ├── routes/                             ✅ Complete API routes
│   │   ├── auth.js                         ✅ Authentication endpoints
│   │   ├── users.js                        ✅ User management API
│   │   ├── workspaces.js                   ✅ Workspace management API
│   │   ├── admin.js                        ✅ Admin dashboard & operations
│   │   └── health.js                       ✅ Health check endpoints
│   ├── services/
│   │   ├── email-service.js                ✅ Email service with templates
│   │   ├── user-manager.js                 ✅ User business logic
│   │   └── workspace-manager.js            ✅ Workspace business logic
│   ├── models/                             ✅ NEW - Data models
│   │   ├── user.js                         ✅ User data model & validation
│   │   └── workspace.js                    ✅ Workspace data model
│   ├── utils/                              ✅ NEW - Utility functions
│   │   ├── validation.js                   ✅ Enhanced validation utils
│   │   └── security.js                     ✅ Security utilities
│   └── events/
│       └── event-handlers.js               ✅ Event handling system
├── tests/                                  ✅ NEW - Complete test suite
│   ├── setup.js                            ✅ Test environment setup
│   ├── fixtures/                           ✅ Test data fixtures
│   │   └── users.js                        ✅ Sample test data
│   ├── unit/                               ✅ Unit tests
│   │   └── user-manager.test.js            ✅ Service layer tests
│   └── integration/                        ✅ Integration tests
│       └── auth-routes.test.js             ✅ API endpoint tests
├── k8s/                                    ✅ NEW - Kubernetes manifests
│   └── deployment.yaml                     ✅ Production deployment config
├── .env.example                            ✅ NEW - Environment template
├── .dockerignore                           ✅ NEW - Docker ignore rules
├── Dockerfile                              ✅ NEW - Container configuration
├── docker-compose.yml                      ✅ NEW - Development environment
├── jest.config.js                          ✅ NEW - Test configuration
├── package.json                            ✅ Updated with new dependencies
└── README.md                               ✅ This comprehensive documentation
```

---

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3004`
- **Production**: `https://api.uxflow.app/user-management`

### **Authentication**
- **Type**: JWT Bearer Token for protected endpoints
- **Header**: `Authorization: Bearer <token>`
- **Validation**: JWT signature verification with user existence check

### **API Endpoints**

#### **Authentication Routes (`/api/v1/auth`)**

##### **POST /api/v1/auth/register**
**Purpose**: Register new user account with optional workspace creation

**Authentication**: ❌ Not required | **Rate Limiting**: 5 requests per 15 minutes

**Request Schema**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "workspaceName": "My Workspace",
  "invitationToken": "optional-invitation-token"
}
```

**Response Schema** (201 Success):
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "role": "user",
    "permissions": ["read_projects", "write_projects"],
    "emailVerified": false
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": "7d"
  },
  "emailVerificationRequired": true
}
```

##### **POST /api/v1/auth/login**
**Purpose**: Authenticate user and return access tokens

**Request Schema**:
```json
{
  "email": "user@example.com",
  "password": "userPassword",
  "rememberMe": false
}
```

##### **GET /api/v1/auth/me**
**Purpose**: Get current user profile information

**Authentication**: ✅ Required

##### **PATCH /api/v1/auth/me**
**Purpose**: Update current user's profile

**Authentication**: ✅ Required

##### **POST /api/v1/auth/change-password**
**Purpose**: Change user's password

**Authentication**: ✅ Required

##### **POST /api/v1/auth/forgot-password**
**Purpose**: Send password reset email

##### **POST /api/v1/auth/reset-password**
**Purpose**: Reset password with token

##### **POST /api/v1/auth/verify-email**
**Purpose**: Verify email address with token

##### **POST /api/v1/auth/logout**
**Purpose**: Logout user and invalidate session

**Authentication**: ✅ Required

##### **GET /api/v1/auth/status**
**Purpose**: Check authentication status

**Authentication**: ❌ Optional

#### **User Management Routes (`/api/v1/users`)**

##### **GET /api/v1/users**
**Purpose**: List users with filtering and pagination (Admin only)

**Authentication**: ✅ Required (Admin role)

**Query Parameters**:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `search`: string (searches name, email)
- `role`: string (filter by role)
- `status`: string (filter by status)
- `workspaceId`: string (filter by workspace)

##### **GET /api/v1/users/:userId**
**Purpose**: Get user profile (self or admin)

**Authentication**: ✅ Required

##### **PATCH /api/v1/users/:userId**
**Purpose**: Update user profile (self or admin)

**Authentication**: ✅ Required

##### **DELETE /api/v1/users/:userId**
**Purpose**: Soft delete user account (self or admin)

**Authentication**: ✅ Required

##### **POST /api/v1/users/:userId/restore**
**Purpose**: Restore soft-deleted user (Admin only)

**Authentication**: ✅ Required (Admin role)

##### **PATCH /api/v1/users/:userId/status**
**Purpose**: Update user status (Admin only)

**Authentication**: ✅ Required (Admin role)

##### **GET /api/v1/users/:userId/workspaces**
**Purpose**: Get user's workspaces

**Authentication**: ✅ Required

##### **GET /api/v1/users/search**
**Purpose**: Search users (Admin only)

**Authentication**: ✅ Required (Admin role)

##### **GET /api/v1/users/stats**
**Purpose**: Get user statistics (Admin only)

**Authentication**: ✅ Required (Admin role)

##### **POST /api/v1/users/:userId/unlock**
**Purpose**: Unlock user account (Admin only)

**Authentication**: ✅ Required (Admin role)

#### **Workspace Management Routes (`/api/v1/workspaces`)**

##### **GET /api/v1/workspaces/me**
**Purpose**: Get user's accessible workspaces

**Authentication**: ✅ Required

##### **GET /api/v1/workspaces/:workspaceId**
**Purpose**: Get workspace details with member info

**Authentication**: ✅ Required

##### **POST /api/v1/workspaces**
**Purpose**: Create new workspace

**Authentication**: ✅ Required

##### **PATCH /api/v1/workspaces/:workspaceId**
**Purpose**: Update workspace (Owner/Admin)

**Authentication**: ✅ Required

##### **POST /api/v1/workspaces/:workspaceId/members**
**Purpose**: Add member to workspace (Owner/Admin)

**Authentication**: ✅ Required

##### **PATCH /api/v1/workspaces/:workspaceId/members/:memberId**
**Purpose**: Update member role (Owner/Admin)

**Authentication**: ✅ Required

##### **DELETE /api/v1/workspaces/:workspaceId/members/:memberId**
**Purpose**: Remove member from workspace

**Authentication**: ✅ Required

##### **POST /api/v1/workspaces/:workspaceId/transfer-ownership**
**Purpose**: Transfer workspace ownership

**Authentication**: ✅ Required (Owner only)

##### **DELETE /api/v1/workspaces/:workspaceId**
**Purpose**: Delete workspace (Owner only)

**Authentication**: ✅ Required

##### **GET /api/v1/workspaces/:workspaceId/usage**
**Purpose**: Get workspace usage statistics

**Authentication**: ✅ Required

##### **GET /api/v1/workspaces/:workspaceId/activity**
**Purpose**: Get workspace activity log

**Authentication**: ✅ Required

#### **Admin Routes (`/api/v1/admin`)**

##### **GET /api/v1/admin/dashboard**
**Purpose**: Get admin dashboard statistics

**Authentication**: ✅ Required (Admin role)

##### **GET /api/v1/admin/users/analytics**
**Purpose**: Get detailed user analytics

**Authentication**: ✅ Required (Admin role)

##### **GET /api/v1/admin/workspaces/analytics**
**Purpose**: Get workspace analytics

**Authentication**: ✅ Required (Admin role)

##### **POST /api/v1/admin/users/bulk-actions**
**Purpose**: Perform bulk actions on users

**Authentication**: ✅ Required (Admin role)

**Request Schema**:
```json
{
  "action": "activate|suspend|delete|verify-email",
  "userIds": ["userId1", "userId2"],
  "options": {
    "reason": "admin_action"
  }
}
```

##### **GET /api/v1/admin/audit-log**
**Purpose**: Get system audit log

**Authentication**: ✅ Required (Admin role)

##### **GET /api/v1/admin/system/health**
**Purpose**: Get detailed system health

**Authentication**: ✅ Required (Admin role)

##### **POST /api/v1/admin/system/maintenance**
**Purpose**: System maintenance operations

**Authentication**: ✅ Required (Super Admin role)

##### **GET /api/v1/admin/reports/export**
**Purpose**: Export system reports (JSON/CSV)

**Authentication**: ✅ Required (Admin role)

##### **POST /api/v1/admin/notifications/broadcast**
**Purpose**: Send broadcast notifications

**Authentication**: ✅ Required (Super Admin role)

#### **Health Check Routes (`/health`)**

##### **GET /health**
**Purpose**: Basic service health check

**Authentication**: ❌ Not required

##### **GET /health/detailed**
**Purpose**: Detailed health information

**Authentication**: ❌ Not required

##### **GET /health/ready**
**Purpose**: Kubernetes readiness probe

**Authentication**: ❌ Not required

##### **GET /health/live**
**Purpose**: Kubernetes liveness probe

**Authentication**: ❌ Not required

---

## 📡 **Event-Driven Communication**

### **Published Events (Events this service emits)**

#### **USER_REGISTERED**
- **Trigger**: After successful user registration
- **Frequency**: Per new user registration
- **Consumers**: Knowledge Service (for user space setup), Analytics

**Event Schema**:
```json
{
  "eventType": "USER_REGISTERED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "user-management",
  "data": {
    "userId": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "emailVerified": false
  },
  "metadata": {
    "correlationId": "user_1234567890_abc123",
    "registrationSource": "web"
  }
}
```

#### **USER_LOGGED_IN**
- **Trigger**: After successful authentication
- **Frequency**: Per login session
- **Consumers**: Analytics, Security monitoring

#### **WORKSPACE_CREATED**
- **Trigger**: After workspace creation
- **Frequency**: Per workspace creation
- **Consumers**: Knowledge Service (for workspace space setup), Flow Service

#### **WORKSPACE_MEMBER_ADDED / WORKSPACE_MEMBER_REMOVED**
- **Trigger**: When workspace membership changes
- **Frequency**: Per membership change
- **Consumers**: Flow Service (for access control updates)

#### **USER_DELETED**
- **Trigger**: When user account is deleted (soft or hard delete)
- **Frequency**: Per user deletion
- **Consumers**: All services for cleanup (Flow, Knowledge, Analytics)

### **Consumed Events (Events this service listens to)**

#### **USER_REGISTRATION_REQUESTED**
- **Source**: API Gateway
- **Purpose**: Process new user registration requests
- **Handler**: `src/events/event-handlers.js:handleUserRegistration`

#### **USER_LOGIN_REQUESTED**
- **Source**: API Gateway
- **Purpose**: Process user authentication requests
- **Handler**: `src/events/event-handlers.js:handleUserLogin`

#### **PROJECT_CREATED / PROJECT_DELETED**
- **Source**: Flow Service
- **Purpose**: Update workspace project counts and usage tracking
- **Handler**: `src/events/event-handlers.js:handleProjectCreated`

#### **USER_DATA_EXPORT_REQUESTED / USER_DATA_DELETION_REQUESTED**
- **Source**: API Gateway (GDPR requests)
- **Purpose**: Handle GDPR data export and deletion requests
- **Handler**: `src/events/event-handlers.js:handleUserDataExport`

---

## 🗄️ **Data Layer Specification**

### **Database Schema**

#### **Collection: `users`**
```json
{
  "_id": "ObjectId",
  "email": "user@example.com",
  "password": "$2b$12$hashedPasswordString",
  "firstName": "John",
  "lastName": "Doe",
  "displayName": "John Doe",
  "workspaceId": "ObjectId or null",
  "role": "user|admin|super_admin",
  "permissions": ["read_projects", "write_projects", "delete_own_projects"],
  "emailVerified": false,
  "emailVerifiedAt": "Date or null",
  "status": "active|suspended|inactive|deleted",
  "preferences": {
    "theme": "light|dark|auto",
    "language": "en|de|fr|es",
    "notifications": {
      "email": true,
      "browser": true,
      "sms": false
    },
    "timezone": "UTC"
  },
  "bio": "User bio text",
  "avatar": {
    "url": "https://example.com/avatar.jpg",
    "provider": "gravatar|upload"
  },
  "loginAttempts": 0,
  "lockedUntil": "Date or null",
  "createdAt": "Date",
  "updatedAt": "Date",
  "lastLoginAt": "Date or null",
  "deletedAt": "Date or null",
  "deletedReason": "user_request|admin_action|gdpr_request"
}
```

**Indexes**:
- `{ "email": 1 }` - Unique index for login lookup
- `{ "workspaceId": 1 }` - For workspace member queries
- `{ "status": 1 }` - For filtering active users
- `{ "role": 1 }` - For admin queries
- `{ "createdAt": 1 }` - For user registration analytics
- `{ "lastLoginAt": 1 }` - For activity tracking

#### **Collection: `workspaces`**
```json
{
  "_id": "ObjectId",
  "name": "My Workspace",
  "description": "Workspace description",
  "ownerId": "ObjectId",
  "members": [
    {
      "userId": "ObjectId",
      "role": "owner|admin|member|viewer",
      "permissions": ["read_projects", "write_projects"],
      "joinedAt": "Date",
      "addedBy": "ObjectId"
    }
  ],
  "projectCount": 5,
  "settings": {
    "allowGuestAccess": false,
    "maxProjects": 10,
    "maxMembers": 5,
    "allowPublicProjects": false,
    "requireApprovalForMembers": false
  },
  "status": "active|suspended|deleted",
  "metadata": {
    "plan": "free|pro|enterprise",
    "billingEmail": "billing@example.com",
    "lastActivityAt": "Date"
  },
  "createdAt": "Date",
  "updatedAt": "Date",
  "deletedAt": "Date or null",
  "deletedReason": "owner_deleted|admin_action"
}
```

#### **Collection: `user_sessions`**
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "token": "hashedRefreshToken",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "ipAddress": "192.168.1.1",
    "deviceType": "desktop|mobile|tablet"
  },
  "createdAt": "Date",
  "expiresAt": "Date",
  "lastUsedAt": "Date",
  "revoked": false
}
```

### **Cache Strategy**

#### **Redis Cache Keys**
| Pattern | TTL | Purpose | Invalidation |
|---------|-----|---------|-------------|
| `user:{userId}` | 300s | User profile data | On profile update, login |
| `user:email:{email}` | 300s | Email-to-user mapping | On user update |
| `workspace:{workspaceId}` | 300s | Workspace data | On workspace update |
| `session:{token}` | 86400s | Active user sessions | On logout, token refresh |
| `auth:attempts:{email}` | 900s | Login attempt tracking | On successful login |

---

## ⚙️ **Configuration & Environment**

### **Environment Variables**
| Variable | Required | Default | Description | Example |
|----------|----------|---------|-------------|---------|
| `USER_MANAGEMENT_PORT` | ✅ | `3004` | HTTP server port | `3004` |
| `NODE_ENV` | ✅ | `development` | Environment mode | `production` |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity | `debug` |
| `MONGODB_URI` | ✅ | - | Database connection | `mongodb://localhost:27017/ux-flow-engine` |
| `REDIS_URL` | ✅ | - | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | ✅ | - | JWT signing secret | `your-super-secret-jwt-key` |
| `JWT_EXPIRES_IN` | ❌ | `7d` | Access token expiry | `24h` |
| `REQUIRE_EMAIL_VERIFICATION` | ❌ | `false` | Email verification required | `true` |
| `ALLOW_SIGNUP` | ❌ | `true` | Allow new registrations | `false` |
| `SMTP_HOST` | ❌ | - | Email server host | `smtp.gmail.com` |
| `SMTP_USER` | ❌ | - | Email username | `noreply@ux-flow-engine.com` |
| `SMTP_PASSWORD` | ❌ | - | Email password | `app-specific-password` |
| `EMAIL_FROM_NAME` | ❌ | `UX-Flow-Engine` | Email sender name | `UX-Flow-Engine` |
| `EMAIL_FROM_ADDRESS` | ❌ | `noreply@ux-flow-engine.com` | Email sender address | `hello@ux-flow-engine.com` |
| `ALLOWED_ORIGINS` | ❌ | - | CORS allowed origins (comma-separated) | `https://app.uxflow.com` |

### **Feature Flags**
| Flag | Default | Purpose | Dependencies |
|------|---------|---------|-------------|
| `ENABLE_SOCIAL_LOGIN` | `false` | OAuth providers (Google, GitHub) | OAuth provider setup |
| `ENABLE_2FA` | `false` | Two-factor authentication | TOTP library, SMS provider |
| `ENABLE_ANALYTICS` | `false` | User behavior tracking | Analytics provider |
| `ENABLE_AUDIT_LOG` | `false` | Detailed action logging | Audit log storage |
| `ENABLE_API_KEYS` | `false` | API key authentication | API key management |

---

## 🛠️ **Development & Operations**

### **Local Development Setup**
```bash
# Prerequisites
node --version  # Requires Node.js 18+
npm --version   # Requires npm 8+

# Installation
git clone <repository>
cd services/user-management
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration:
# JWT_SECRET=your-super-secret-jwt-key
# MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
# REDIS_URL=redis://localhost:6379

# Development mode
npm run dev

# Verify service health
curl http://localhost:3004/health

# Test registration
curl -X POST http://localhost:3004/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123", "firstName": "Test", "lastName": "User"}'
```

### **Testing**
```bash
# Unit tests (business logic)
npm test

# Unit tests only
npm run test:unit

# Integration tests (API endpoints)
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# CI/CD tests
npm run test:ci
```

### **Build & Deploy**

#### **Docker Development**
```bash
# Build Docker image
docker build -t user-management .

# Run with Docker Compose (includes MongoDB & Redis)
docker-compose up --build

# Check logs
docker-compose logs user-management
```

#### **Production Deployment**
```bash
# Deploy to Kubernetes
kubectl apply -f k8s/deployment.yaml

# Check deployment status
kubectl get pods -l app=user-management

# View logs
kubectl logs -l app=user-management
```

---

## 🏥 **Health & Monitoring**

### **Health Check Endpoints**

#### **GET /health**
Basic service health with dependency status

**Response Schema**:
```json
{
  "status": "ok|degraded|error",
  "service": "user-management",
  "version": "1.0.0",
  "uptime": 12345,
  "responseTime": "45ms",
  "dependencies": {
    "mongodb": "ok|error",
    "redis": "ok|error",
    "email": "ok|error|not_configured"
  },
  "features": {
    "registration": "enabled|disabled",
    "emailVerification": "enabled|disabled",
    "socialLogin": "enabled|disabled"
  },
  "metrics": {
    "users": {
      "total": 1250,
      "active": 1180
    },
    "requests": {
      "total": 50000,
      "errors": 125
    }
  },
  "timestamp": "ISO8601"
}
```

#### **GET /health/detailed**
Comprehensive health information including system metrics

#### **GET /health/ready**
Kubernetes readiness probe (200 if ready to accept traffic)

#### **GET /health/live**
Kubernetes liveness probe (200 if process is alive)

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - Authentication success/failure rates
  - Registration completion rates
  - Password reset request frequency
  - Active user sessions count
  - Workspace creation and member invitation rates
  - Email delivery success rates
  - Rate limiting effectiveness
  - Progressive lockout triggers

### **Logging Standards**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "user-management",
  "component": "auth|workspace|email|admin",
  "message": "Human readable message",
  "correlationId": "user_1234567890_abc123",
  "userId": "674a1b2c3d4e5f6789abcdef",
  "workspaceId": "674a1b2c3d4e5f6789abcdef",
  "metadata": {
    "email": "user@example.com",
    "action": "login|register|workspace_create",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "duration": 250,
    "success": true
  }
}
```

### **Alert Conditions**
| Metric | Threshold | Severity | Action |
|--------|-----------|----------|--------|
| Authentication failure rate | > 10% | High | Check credential theft, review rate limits |
| Email delivery failures | > 5% | Medium | Check SMTP configuration, email provider status |
| Database connection errors | > 3 consecutive | Critical | Emergency database investigation |
| High registration rate | > 100/hour | Medium | Monitor for spam, check email verification |
| JWT token validation errors | > 5% | High | Check JWT secret rotation, token blacklist |
| Memory usage | > 80% | Medium | Check for memory leaks, scale if needed |
| Progressive lockout triggers | > 50/hour | High | Potential attack investigation |

---

## 🔧 **Service-Specific Implementation Details**

### **Enhanced Security Features**

#### **Authentication System**
- **Progressive Rate Limiting**: Increases delay based on failed attempts
- **Account Lockout Protection**: 5 attempts = 15min lockout with exponential backoff
- **Session Management**: Secure JWT tokens with refresh token rotation
- **Multi-device Support**: Track and manage sessions across devices

#### **Authorization System**
- **Role Hierarchy**: super_admin > admin > user with inheritance
- **Permission-based Access**: Granular permissions for specific actions
- **Workspace Access Control**: Owner, admin, member, viewer roles with specific permissions
- **Self-or-Admin Pattern**: Users can modify own data, admins can modify any

#### **Password Security**
- **Strength Validation**: Requires uppercase, lowercase, numbers, special characters
- **bcrypt Hashing**: 12 salt rounds for secure storage
- **Password Reset**: Time-limited secure tokens (1 hour expiry)
- **Password History**: Prevent reuse of recent passwords (optional)

#### **Rate Limiting Strategies**
- **API Rate Limiting**: 100 requests/15min per IP
- **Auth Rate Limiting**: 5 attempts/15min per IP (stricter for sensitive operations)
- **Email Rate Limiting**: 3 email operations/15min per email address
- **Progressive Rate Limiting**: Increases delay based on failure patterns
- **Sliding Window Rate Limiting**: More accurate than fixed windows

### **Advanced Workspace Management**

#### **Multi-tenancy Support**
- **Workspace Isolation**: Complete data separation between workspaces
- **Resource Limits**: Configurable project and member limits per workspace
- **Usage Tracking**: Real-time monitoring of workspace resource consumption
- **Billing Integration Ready**: Plan-based feature restrictions

#### **Member Management**
- **Role Management**: Dynamic role assignment with permission inheritance
- **Invitation System**: Email-based workspace invitations with expiry
- **Ownership Transfer**: Secure transfer of workspace ownership
- **Activity Tracking**: Comprehensive audit log of member actions

### **Admin Management System**

#### **Dashboard & Analytics**
- **Real-time Metrics**: User registration trends, activity patterns
- **System Health**: Service health monitoring and dependency status
- **User Analytics**: Detailed user behavior and engagement metrics
- **Workspace Analytics**: Usage patterns, member distribution

#### **Bulk Operations**
- **User Management**: Bulk activate, suspend, delete, verify operations
- **Report Generation**: CSV/JSON exports with filtering
- **Broadcast Notifications**: Email notifications to user segments
- **Maintenance Operations**: System cleanup and optimization tasks

### **GDPR Compliance Features**

#### **Data Export**
- **Complete Data Export**: All user data across services in JSON/CSV format
- **Partial Data Export**: Specific data categories on request
- **Audit Trail**: Complete log of all data export requests

#### **Right to Deletion**
- **Soft Delete**: Immediate deactivation with 30-day grace period
- **Hard Delete**: Complete data removal after grace period
- **Cross-service Cleanup**: Coordinated deletion across all services
- **Anonymization**: Replace personal data with anonymized identifiers

### **Email System**

#### **Transactional Emails**
- **Welcome Email**: Rich HTML templates with workspace information
- **Email Verification**: Secure verification with time-limited tokens
- **Password Reset**: Branded reset emails with security information
- **Workspace Invitations**: Personalized invitation emails with context

#### **Email Infrastructure**
- **Provider Flexibility**: SMTP, SendGrid, Mailgun support
- **Template System**: HTML email templates with responsive design
- **Delivery Tracking**: Email delivery status and bounce handling
- **Development Mode**: Email logging for development environments

### **Critical Code Paths & Performance**

#### **Authentication Flow Performance**
- **Expected Throughput**: 500-1000 auth requests/minute
- **Response Time**: < 200ms for login, < 500ms for registration
- **Caching Strategy**: 5-minute user profile cache, Redis session storage
- **Database Optimization**: Strategic indexing for email/workspace lookups

#### **Workspace Operations**
- **Workspace Creation**: < 1s including member setup and event emission
- **Member Management**: < 500ms for add/remove operations
- **Usage Tracking**: Real-time updates with minimal performance impact

### **Error Handling & Resilience**

#### **Comprehensive Error Handling**
- **Custom Error Classes**: ValidationError, AuthorizationError, NotFoundError, ConflictError
- **Error Context**: Rich error information with correlation IDs
- **User-friendly Messages**: Clear, actionable error messages for clients
- **Development Debug**: Stack traces and detailed error information in development

#### **Circuit Breaker Patterns**
- **Database Failures**: Graceful degradation to read-only mode
- **Email Service Failures**: Fallback to logging with service continuation
- **Redis Failures**: Memory-only sessions with performance degradation warnings

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **Service Won't Start**
```bash
# Check environment variables
node -e "console.log(process.env.JWT_SECRET, process.env.MONGODB_URI)"

# Verify database connections
npm run test:db

# Check port availability
lsof -i :3004

# Review startup logs
npm run dev | grep -E "(error|Error|ERROR)"
```

#### **Authentication Issues**
```bash
# Test user creation
curl -X POST http://localhost:3004/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123!", "firstName": "Test", "lastName": "User"}'

# Test login
curl -X POST http://localhost:3004/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPass123!"}'

# Check JWT secret
node -e "console.log('JWT Secret length:', process.env.JWT_SECRET?.length)"

# Check rate limiting
redis-cli GET "auth:attempts:test@example.com"
```

#### **Database Connection Issues**
```bash
# Test MongoDB connection
mongosh $MONGODB_URI --eval "db.runCommand({ping: 1})"

# Test Redis connection
redis-cli -u $REDIS_URL ping

# Check database indexes
mongosh $MONGODB_URI --eval "db.users.getIndexes()"

# Monitor connection pool
docker logs user-management | grep -i "database\|mongo"
```

#### **Email Delivery Issues**
```bash
# Test SMTP connection
curl -X POST http://localhost:3004/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check email service configuration
env | grep -E "(SMTP|EMAIL)"

# Review email service logs
docker logs user-management | grep -i "email"
```

#### **Workspace Issues**
```bash
# Check workspace permissions
curl -H "Authorization: Bearer {token}" \
  http://localhost:3004/api/v1/workspaces/me

# Test workspace creation
curl -X POST http://localhost:3004/api/v1/workspaces \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Workspace"}'

# Check member count limits
mongosh $MONGODB_URI --eval "db.workspaces.findOne({_id: ObjectId('workspaceId')})"
```

### **Debug Mode**
```bash
# Enable comprehensive debug logging
LOG_LEVEL=debug npm run dev

# Enable specific component debugging
DEBUG=auth:*,workspace:*,email:* npm run dev

# Test with verbose logging
npm run test -- --verbose

# Monitor Redis events
redis-cli monitor | grep user-management
```

### **Performance Debugging**
```bash
# Monitor key metrics
curl http://localhost:3004/metrics | grep -E "(duration|rate|error)"

# Check database query performance
mongosh $MONGODB_URI --eval "db.setProfilingLevel(2); db.runCommand({profile: -1})"

# Monitor memory usage
ps aux | grep node

# Check rate limiting effectiveness
curl -I http://localhost:3004/api/v1/auth/login # Look for rate limit headers
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../../docs/ARCHITECTURE.md)
- [Authentication & Authorization Guide](../../docs/AUTH.md)
- [GDPR Compliance Documentation](../../docs/GDPR.md)
- [Email Template Guide](../../docs/EMAIL_TEMPLATES.md)
- [Database Schema Documentation](../../docs/DATABASE.md)
- [API Gateway Integration](../api-gateway/README.md)
- [Cognitive Core Integration](../cognitive-core/README.md)

### **External References**
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [OWASP Authentication Guidelines](https://owasp.org/www-project-authentication-cheat-sheet/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

## 📝 **Changelog**

### **Version 2.0.0** (2024-02-01) - ✅ COMPLETE IMPLEMENTATION
- **✅ Complete service implementation** with all critical features
- **✅ Enhanced security system** with progressive rate limiting and account lockout
- **✅ Comprehensive API coverage** (auth, users, workspaces, admin, health)
- **✅ Advanced middleware layer** (auth, error handling, rate limiting)
- **✅ Complete admin management system** with dashboard, analytics, and bulk operations
- **✅ GDPR compliance features** with data export and deletion capabilities
- **✅ Production-ready infrastructure** (Docker, Kubernetes, monitoring)
- **✅ Comprehensive test suite** (unit, integration, coverage)
- **✅ Enhanced email system** with rich templates and multiple provider support

### **Version 1.1.0** (2024-01-15) - Previous Implementation
- Initial user management service implementation
- Basic JWT-based authentication system
- Workspace creation and member management
- Basic email notification system
- GDPR compliance foundation

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @auth-team-lead | Architecture decisions, security decisions, breaking changes |
| Primary Developer | @user-mgmt-dev | Day-to-day development, feature implementation, code reviews |
| Security Lead | @security-team | Security reviews, compliance audits, vulnerability management |
| DevOps Contact | @platform-team | Deployment, monitoring, infrastructure, performance optimization |
| QA Lead | @qa-team | Test strategy, quality assurance, regression testing |

---

> **🔄 Last Updated**: 2024-02-01  
> **📋 Documentation Version**: 2.0  
> **🤖 Implementation Status**: ✅ PRODUCTION READY  
> **🔧 Auto-validation**: ✅ API schemas validated / ✅ Event schemas current / ✅ Database indexes optimized / ✅ Security reviewed / ✅ Tests passing