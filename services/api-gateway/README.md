# API Gateway Service

The API Gateway serves as the central entry point for the UX-Flow-Engine system, handling authentication, routing, rate limiting, and WebSocket connections for real-time collaboration.

## Current Status

⚠️ **SECURITY ALERT**: This service contains **CRITICAL SECURITY VULNERABILITIES** and is **NOT READY FOR PRODUCTION**

**Security Score**: 67/100  
**Critical Issues**: 3  
**Production Ready**: ❌ **NO**

## Core Functionality

### ✅ Implemented Features

- **Authentication & Authorization**
  - JWT token validation and refresh
  - Token blacklist/revocation system
  - Role-based access control (RBAC)
  - Permission-based authorization
  - Multi-factor authentication (MFA)
  - Service-to-service authentication

- **Rate Limiting**
  - Tier-based rate limiting (Free, Pro, Enterprise)
  - Redis-backed distributed rate limiting
  - WebSocket connection limits
  - API endpoint rate limiting

- **WebSocket Management**
  - Real-time collaboration support
  - Room-based message routing
  - Connection authentication
  - Message rate limiting

- **Security Middleware**
  - Input validation and sanitization
  - NoSQL injection prevention
  - XSS protection
  - CORS configuration
  - Security headers (HSTS, CSP, etc.)

- **Request Routing**
  - Service discovery and routing
  - Load balancing
  - Health check integration
  - Circuit breaker implementation

### ⚠️ Partially Implemented

- **OAuth Integration** (Configured but needs testing)
- **ELK Stack Logging** (Imported but not fully configured)
- **API Key Management** (Basic implementation)

### ❌ Missing Features

- **Complete MFA Implementation** (Backend ready, UI missing)
- **Advanced Circuit Breaker Patterns**
- **Comprehensive Monitoring Dashboard**

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Load Balancer │────│   API Gateway    │────│   Microservices │
│                 │    │                  │    │                 │
│                 │    │ • Authentication │    │ • Cognitive Core│
│                 │    │ • Rate Limiting  │    │ • Flow Service  │
│                 │    │ • WebSocket      │    │ • Knowledge     │
│                 │    │ • Routing        │    │ • Billing       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Security Implementation

### Current Security Measures

- **Multi-layer Authentication**: JWT + Service Auth + API Keys
- **Comprehensive Rate Limiting**: Redis-backed with tier-based limits
- **Input Validation**: DOMPurify + custom sanitization
- **Security Headers**: CSP, HSTS, anti-clickjacking
- **WebSocket Security**: Authentication required for all connections

### Critical Security Issues (❌ MUST FIX)

1. **JWT Validation Vulnerabilities**
   - Manual expiration checking bypasses library security
   - Algorithm validation missing

2. **Service Authentication Flaws**
   - Nonce replay protection has gaps
   - Body signature verification incomplete

3. **Input Validation Bypasses**
   - NoSQL injection patterns incomplete
   - File upload validation weak

## API Endpoints

### Authentication
- `POST /auth/login` - User authentication
- `POST /auth/logout` - Token revocation
- `POST /auth/refresh` - Token refresh
- `GET /auth/me` - Current user info

### Admin
- `GET /admin/users` - User management
- `POST /admin/users/:id/roles` - Role assignment
- `GET /admin/metrics` - System metrics

### Health & Monitoring
- `GET /health` - Service health check
- `GET /metrics` - Performance metrics

## Environment Configuration

### Required Environment Variables

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_EXPIRES_IN=24h

# Services
COGNITIVE_CORE_URL=http://localhost:3001
FLOW_SERVICE_URL=http://localhost:3003
KNOWLEDGE_SERVICE_URL=http://localhost:3002
BILLING_SERVICE_URL=http://localhost:3004
USER_MANAGEMENT_URL=http://localhost:3005

# External Services
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Security
CORS_ORIGIN=http://localhost:3000
ENCRYPTION_KEY=your-encryption-key-here
```

## Usage

### Development
```bash
npm install
npm run dev  # Starts with hot reload
```

### Production
```bash
npm install --production
npm start
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm run test:security      # Security tests only
```

## WebSocket Events

### Client → Server
- `join_project` - Join project collaboration
- `leave_project` - Leave project
- `cursor_position` - Share cursor position
- `flow_operation` - Flow editing operation
- `USER_MESSAGE_RECEIVED` - AI conversation

### Server → Client
- `connected` - Connection established
- `project_joined` - Successfully joined project
- `cursor_update` - Cursor position update
- `flow_updated` - Flow state changed
- `USER_RESPONSE_READY` - AI response ready

## Performance

### Current Metrics
- **Response Time**: ~50ms average
- **Throughput**: 1000+ requests/second
- **WebSocket Connections**: 500+ concurrent
- **Memory Usage**: ~150MB baseline

### Rate Limits (per user)
- **Free Tier**: 100 requests/hour
- **Pro Tier**: 1000 requests/hour  
- **Enterprise**: 10000 requests/hour

## Security Considerations

### ⚠️ CRITICAL ISSUES TO ADDRESS

Before production deployment, the following **MUST** be fixed:

1. **Fix JWT validation** - Use library validation instead of manual checks
2. **Enhance service authentication** - Implement proper nonce replay protection
3. **Complete NoSQL injection prevention** - Add missing operator patterns
4. **Standardize password security** - Unify bcrypt configurations

### Security Best Practices

- All API keys stored as environment variables
- JWT tokens have appropriate expiration times
- WebSocket connections require authentication
- Input validation on all endpoints
- Rate limiting prevents abuse
- CORS properly configured

## Monitoring & Logging

### Health Checks
- Database connectivity
- Redis connectivity
- External service availability
- Memory usage
- Response times

### Logging
- Request/response logging
- Security event logging
- Error tracking
- Performance metrics
- Audit trails

## Deployment

### Docker
```bash
docker build -t ux-flow/api-gateway .
docker run -p 3000:3000 ux-flow/api-gateway
```

### Kubernetes
See `/k8s/api-gateway-deployment.yaml` for Kubernetes deployment configuration.

## Troubleshooting

### Common Issues

1. **JWT Validation Errors**
   - Check JWT_SECRET environment variable
   - Verify token expiration settings

2. **Rate Limiting Issues**
   - Check Redis connectivity
   - Verify rate limit configurations

3. **WebSocket Connection Failures**
   - Ensure authentication token is valid
   - Check CORS settings

4. **Service Communication Errors**
   - Verify service URLs in environment
   - Check service authentication secrets

### Debug Mode
```bash
NODE_ENV=development npm start
# Enables detailed logging and error messages
```

## Contributing

1. All changes require security review
2. Add appropriate tests for new features
3. Update documentation
4. Follow existing code patterns
5. Ensure all security checks pass

## License

MIT License - See LICENSE file for details.