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
- **Security**: JWT token management, rate limiting, account lockout protection
- **GDPR Compliance**: Data export, anonymization, and hard deletion capabilities
- **Email Communication**: Transactional emails for user onboarding and notifications

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

## 🔌 **API Contract Specification**

### **Base URL**
- **Development**: `http://localhost:3004`
- **Production**: `https://api.uxflow.app/user-management`

### **Authentication**
- **Type**: JWT Bearer Token for protected endpoints
- **Header**: `Authorization: Bearer <token>`
- **Validation**: JWT signature verification with user existence check

### **API Endpoints**

#### **POST /api/v1/auth/register**
**Purpose**: Register new user account with optional workspace creation

**Authentication**: ❌ Not required

**Rate Limiting**: 5 requests per 15 minutes

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

**Error Responses**:
```json
// 409 Conflict - User already exists
{
  "error": "User already exists",
  "message": "A user with this email address already exists",
  "correlationId": "user_1234567890_abc123"
}

// 400 Bad Request - Validation error
{
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  },
  "correlationId": "user_1234567890_abc123"
}
```

#### **POST /api/v1/auth/login**
**Purpose**: Authenticate user and return access tokens

**Authentication**: ❌ Not required

**Rate Limiting**: 5 requests per 15 minutes

**Request Schema**:
```json
{
  "email": "user@example.com",
  "password": "userPassword",
  "rememberMe": false
}
```

**Response Schema** (200 Success):
```json
{
  "message": "Login successful",
  "user": {
    "id": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "role": "user",
    "permissions": ["read_projects", "write_projects"],
    "emailVerified": true,
    "lastLoginAt": "2024-01-15T10:30:00Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "7d"
}
```

#### **GET /api/v1/auth/me**
**Purpose**: Get current user profile information

**Authentication**: ✅ Required

**Response Schema** (200 Success):
```json
{
  "user": {
    "id": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "displayName": "John Doe",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "role": "user",
    "permissions": ["read_projects", "write_projects"],
    "emailVerified": true,
    "status": "active",
    "createdAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-15T10:30:00Z",
    "preferences": {
      "theme": "dark",
      "language": "en"
    }
  }
}
```

#### **POST /api/v1/workspaces**
**Purpose**: Create new workspace (users can own max 1 workspace on free plan)

**Authentication**: ✅ Required

**Request Schema**:
```json
{
  "name": "My New Workspace",
  "description": "Workspace for my design team",
  "settings": {
    "allowGuestAccess": false,
    "maxProjects": 10,
    "maxMembers": 5
  }
}
```

**Response Schema** (201 Success):
```json
{
  "message": "Workspace created successfully",
  "workspace": {
    "id": "674a1b2c3d4e5f6789abcdef",
    "name": "My New Workspace",
    "description": "Workspace for my design team",
    "role": "owner",
    "isOwner": true,
    "projectCount": 0,
    "maxProjects": 10,
    "settings": {
      "allowGuestAccess": false,
      "maxProjects": 10,
      "maxMembers": 5
    },
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

#### **GET /api/v1/workspaces/me**
**Purpose**: Get all workspaces user has access to

**Authentication**: ✅ Required

**Response Schema** (200 Success):
```json
{
  "workspaces": [
    {
      "id": "674a1b2c3d4e5f6789abcdef",
      "name": "My Workspace",
      "role": "owner",
      "isOwner": true,
      "projectCount": 3,
      "maxProjects": 10,
      "memberCount": 2,
      "createdAt": "2024-01-01T00:00:00Z",
      "joinedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### **POST /api/v1/workspaces/:workspaceId/members**
**Purpose**: Add member to workspace

**Authentication**: ✅ Required (owner/admin role)

**Request Schema**:
```json
{
  "email": "newmember@example.com",
  "role": "member",
  "permissions": ["read_projects", "write_projects"]
}
```

**Response Schema** (201 Success):
```json
{
  "message": "Member added successfully",
  "member": {
    "userId": "674a1b2c3d4e5f6789abcdef",
    "email": "newmember@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "member",
    "joinedAt": "2024-01-15T10:30:00Z",
    "addedBy": "674a1b2c3d4e5f6789abcdef"
  }
}
```

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

**Event Schema**:
```json
{
  "eventType": "USER_LOGGED_IN",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "user-management",
  "data": {
    "userId": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "role": "user",
    "permissions": ["read_projects", "write_projects"],
    "sessionId": "sess_abc123"
  },
  "metadata": {
    "correlationId": "user_1234567890_abc123",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

#### **WORKSPACE_CREATED**
- **Trigger**: After workspace creation
- **Frequency**: Per workspace creation
- **Consumers**: Knowledge Service (for workspace space setup), Flow Service

**Event Schema**:
```json
{
  "eventType": "WORKSPACE_CREATED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "user-management",
  "data": {
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "name": "My Workspace",
    "ownerId": "674a1b2c3d4e5f6789abcdef",
    "settings": {
      "allowGuestAccess": false,
      "maxProjects": 10,
      "maxMembers": 5
    }
  },
  "metadata": {
    "correlationId": "user_1234567890_abc123"
  }
}
```

#### **WORKSPACE_MEMBER_ADDED / WORKSPACE_MEMBER_REMOVED**
- **Trigger**: When workspace membership changes
- **Frequency**: Per membership change
- **Consumers**: Flow Service (for access control updates)

**Event Schema**:
```json
{
  "eventType": "WORKSPACE_MEMBER_ADDED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "user-management",
  "data": {
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "userId": "674a1b2c3d4e5f6789abcdef",
    "role": "member",
    "addedBy": "674a1b2c3d4e5f6789abcdef"
  },
  "metadata": {
    "correlationId": "user_1234567890_abc123"
  }
}
```

#### **USER_DELETED**
- **Trigger**: When user account is deleted (soft or hard delete)
- **Frequency**: Per user deletion
- **Consumers**: All services for cleanup (Flow, Knowledge, Analytics)

**Event Schema**:
```json
{
  "eventType": "USER_DELETED",
  "eventId": "uuid",
  "timestamp": "ISO8601",
  "emittedBy": "user-management",
  "data": {
    "userId": "674a1b2c3d4e5f6789abcdef",
    "email": "user@example.com",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "reason": "user_request",
    "deletionType": "soft"
  },
  "metadata": {
    "correlationId": "user_1234567890_abc123",
    "gdprCompliance": true
  }
}
```

### **Consumed Events (Events this service listens to)**

#### **USER_REGISTRATION_REQUESTED**
- **Source**: API Gateway
- **Purpose**: Process new user registration requests
- **Handler**: `src/events/event-handlers.js:handleUserRegistration`
- **Failure Strategy**: Retry 2x with exponential backoff, emit failure event

**Expected Schema**:
```json
{
  "eventType": "USER_REGISTRATION_REQUESTED",
  "data": {
    "email": "user@example.com",
    "password": "hashedPassword",
    "firstName": "John",
    "lastName": "Doe",
    "workspaceName": "My Workspace",
    "invitationToken": "optional"
  }
}
```

#### **USER_LOGIN_REQUESTED**
- **Source**: API Gateway
- **Purpose**: Process user authentication requests
- **Handler**: `src/events/event-handlers.js:handleUserLogin`
- **Failure Strategy**: Retry 2x, emit login failure event

**Expected Schema**:
```json
{
  "eventType": "USER_LOGIN_REQUESTED",
  "data": {
    "email": "user@example.com",
    "password": "userPassword",
    "rememberMe": false
  }
}
```

#### **PROJECT_CREATED / PROJECT_DELETED**
- **Source**: Flow Service
- **Purpose**: Update workspace project counts and usage tracking
- **Handler**: `src/events/event-handlers.js:handleProjectCreated`
- **Failure Strategy**: Retry 3x, log warning on failure (non-critical)

**Expected Schema**:
```json
{
  "eventType": "PROJECT_CREATED",
  "data": {
    "projectId": "674a1b2c3d4e5f6789abcdef",
    "workspaceId": "674a1b2c3d4e5f6789abcdef",
    "userId": "674a1b2c3d4e5f6789abcdef",
    "projectName": "New Flow Design"
  }
}
```

#### **USER_DATA_EXPORT_REQUESTED / USER_DATA_DELETION_REQUESTED**
- **Source**: API Gateway (GDPR requests)
- **Purpose**: Handle GDPR data export and deletion requests
- **Handler**: `src/events/event-handlers.js:handleUserDataExport`
- **Failure Strategy**: No retry, immediate error notification (compliance critical)

**Expected Schema**:
```json
{
  "eventType": "USER_DATA_EXPORT_REQUESTED",
  "data": {
    "userId": "674a1b2c3d4e5f6789abcdef",
    "requestType": "export",
    "format": "json"
  }
}
```

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
    "language": "en|de|fr",
    "notifications": {
      "email": true,
      "browser": true
    }
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

**Indexes**:
- `{ "ownerId": 1 }` - For owner workspace queries
- `{ "members.userId": 1 }` - For member workspace lookups
- `{ "status": 1 }` - For filtering active workspaces
- `{ "createdAt": 1 }` - For workspace creation analytics

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

**Indexes**:
- `{ "userId": 1 }` - For user session management
- `{ "token": 1 }` - Unique index for token lookup
- `{ "expiresAt": 1 }` - TTL index for automatic cleanup

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

### **Secrets (Managed via Secret Manager)**
| Secret Name | Purpose | Rotation | Access Level |
|-------------|---------|----------|--------------|
| `JWT_SECRET` | JWT token signing and verification | Quarterly | Critical services only |
| `SMTP_PASSWORD` | Email service authentication | Monthly | Service account only |
| `MONGODB_CONNECTION_STRING` | Database access credentials | Quarterly | Database services only |

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

# Integration tests (API endpoints)
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# Test specific component
npm test -- --grep "UserManager"
```

### **Build & Deploy**
```bash
# Build Docker image
docker build -t user-management .

# Run in Docker
docker run -p 3004:3004 \
  -e JWT_SECRET=your-secret \
  -e MONGODB_URI=mongodb://mongo:27017/ux-flow-engine \
  -e REDIS_URL=redis://redis:6379 \
  user-management

# Deploy to production
kubectl apply -f k8s/
```

---

## 🏥 **Health & Monitoring**

### **Health Check Endpoint**
- **URL**: `GET /health`
- **Response Time**: < 200ms
- **Dependencies Checked**: 
  - MongoDB connection and basic query
  - Redis connection and pub/sub test
  - Email service connection (if configured)

**Response Schema**:
```json
{
  "status": "ok|degraded|error",
  "service": "user-management",
  "version": "1.0.0",
  "uptime": 12345,
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
  "timestamp": "ISO8601"
}
```

### **Metrics & Observability**
- **Metrics Endpoint**: `/metrics` (Prometheus format)
- **Key Performance Indicators**:
  - Authentication success/failure rates
  - Registration completion rates
  - Password reset request frequency
  - Active user sessions count
  - Workspace creation and member invitation rates
  - Email delivery success rates

### **Logging Standards**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error|debug",
  "service": "user-management",
  "component": "auth|workspace|email",
  "message": "Human readable message",
  "correlationId": "user_1234567890_abc123",
  "userId": "674a1b2c3d4e5f6789abcdef",
  "workspaceId": "674a1b2c3d4e5f6789abcdef",
  "metadata": {
    "email": "user@example.com",
    "action": "login|register|workspace_create",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
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

---

## 🔧 **Service-Specific Implementation Details**

### **Authentication Flow**
1. **Registration**: Email uniqueness check → Password hashing (bcrypt) → User creation → Optional workspace creation → JWT generation → Email verification (if enabled)
2. **Login**: Rate limiting → Credential validation → Account status check → JWT generation → Session creation → Login event emission
3. **Token Refresh**: Refresh token validation → New access token generation → Session update
4. **Logout**: Token revocation → Session cleanup → Logout event emission

### **Workspace Management**
- **Multi-tenancy**: Each workspace is isolated with separate member access controls
- **Role Hierarchy**: owner > admin > member > viewer (with inherited permissions)
- **Business Rules**: Free users limited to 1 owned workspace, project count tracking, member limits enforcement
- **Ownership Transfer**: Full validation and atomic role updates

### **Security Features**
- **Password Security**: bcrypt with 12 salt rounds, minimum complexity requirements
- **Account Lockout**: Progressive delays after failed login attempts (5 attempts = 15min lockout)
- **Rate Limiting**: Tiered rate limits (auth endpoints: 5/15min, API endpoints: 100/15min)
- **JWT Security**: Short-lived access tokens (7d default), secure refresh token rotation
- **Email Verification**: Optional but recommended, prevents spam registrations

### **GDPR Compliance**
- **Data Export**: Complete user data export in JSON/CSV format across all services
- **Right to Deletion**: Soft delete (immediate) + hard delete (after 30 days) with full cleanup
- **Data Minimization**: Only collect necessary fields, optional profile data
- **Consent Management**: Clear opt-ins for email communications

### **Email System**
- **Transactional Emails**: Welcome, email verification, password reset, workspace invitations
- **Template System**: HTML email templates with responsive design
- **Provider Flexibility**: SMTP, SendGrid, Mailgun support with fallback to logging
- **Delivery Tracking**: Email delivery status and bounce handling

### **Critical Code Paths**
- **User Registration**: Input validation → Uniqueness check → Password hashing → Database write → Event emission (high volume)
- **Authentication**: Rate limit check → Credential validation → JWT generation → Session management (very high volume)
- **Workspace Creation**: Authorization check → Business rule validation → Database transaction → Member setup (medium volume)

### **Performance Considerations**
- Expected throughput: 500-1000 auth requests/minute
- Memory usage: ~256MB base + 10MB per 1000 active sessions
- Database optimization: Strategic indexing for email lookups and workspace queries
- Cache strategy: 5-minute user profile cache, session data in Redis

### **Security Considerations**
- **Input Validation**: Joi schemas for all API inputs with sanitization
- **SQL Injection Prevention**: MongoDB parameterized queries, no dynamic query construction
- **XSS Prevention**: HTML email template escaping, user-generated content sanitization
- **Session Security**: HttpOnly cookies, secure flag in production, SameSite protection
- **Audit Trail**: All authentication events logged with IP and user agent

---

## 🚨 **Troubleshooting Guide**

### **Common Issues**

#### **Authentication Failures**
```bash
# Check user status and login attempts
curl http://localhost:3004/api/v1/users/{userId}/status

# Check rate limiting
redis-cli GET "auth:attempts:user@example.com"

# Review authentication logs
docker logs user-management | grep "authentication"

# Test JWT validation
node -e "console.log(require('jsonwebtoken').verify('token', 'secret'))"
```

#### **Email Delivery Issues**
```bash
# Test SMTP connection
curl -X POST http://localhost:3004/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check email service logs
docker logs user-management | grep "email"

# Verify SMTP configuration
env | grep SMTP
```

#### **Workspace Access Problems**
```bash
# Check workspace membership
curl -H "Authorization: Bearer {token}" \
  http://localhost:3004/api/v1/workspaces/{workspaceId}

# Verify user permissions
curl -H "Authorization: Bearer {token}" \
  http://localhost:3004/api/v1/auth/me

# Check workspace member count
mongo ux-flow-engine --eval "db.workspaces.findOne({_id: ObjectId('workspaceId')})"
```

#### **Database Connection Issues**
```bash
# Test MongoDB connection
mongosh $MONGODB_URI --eval "db.runCommand({ping: 1})"

# Check Redis connection
redis-cli -u $REDIS_URL ping

# Verify database indexes
mongo ux-flow-engine --eval "db.users.getIndexes()"

# Monitor connection pool
docker logs user-management | grep "database"
```

### **Debug Mode**
```bash
# Enable detailed logging
LOG_LEVEL=debug npm run dev

# Enable specific debug categories
DEBUG=auth:*,workspace:* npm run dev

# Test authentication flow
npm run test:auth -- --verbose

# Monitor Redis events
redis-cli monitor | grep user-management
```

---

## 📚 **Additional Resources**

### **Related Documentation**
- [System Architecture Overview](../docs/ARCHITECTURE.md)
- [Authentication & Authorization Guide](../docs/AUTH.md)
- [GDPR Compliance Documentation](../docs/GDPR.md)
- [Email Template Guide](../docs/EMAIL_TEMPLATES.md)
- [Database Schema Documentation](../docs/DATABASE.md)

### **External References**
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [OWASP Authentication Guidelines](https://owasp.org/www-project-authentication-cheat-sheet/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)

---

## 📝 **Changelog**

### **Version 1.0.0** (2024-01-15)
- Initial user management service implementation
- JWT-based authentication system
- Workspace creation and member management
- Basic email notification system
- GDPR compliance features

### **Version 1.1.0** (2024-02-01)
- Added password complexity requirements
- Implemented progressive account lockout
- Enhanced workspace usage tracking
- Added workspace transfer ownership
- Improved email template system

---

## 👥 **Maintainers**

| Role | Contact | Responsibilities |
|------|---------|-----------------|
| Service Owner | @auth-team-lead | Authentication architecture, security decisions |
| Primary Developer | @user-mgmt-dev | Day-to-day development, user features |
| Security Lead | @security-team | Security reviews, compliance, audit |
| DevOps Contact | @platform-team | Deployment, monitoring, database management |

---

> **🔄 Last Updated**: 2024-02-01  
> **📋 Documentation Version**: 1.1  
> **🤖 Auto-validation**: ✅ API schemas validated / ✅ Event schemas current / ✅ Database indexes optimized / ✅ Security reviewed