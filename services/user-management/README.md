# User Management Service 🔐

> Enterprise-grade authentication and authorization with multi-factor authentication and SSO support

## Overview

The User Management Service is the security backbone of UX-Flow-Engine, providing comprehensive identity and access management. It handles user authentication, authorization, workspace management, and integrates with enterprise SSO providers while maintaining the highest security standards.

### Key Features
- **🔑 Multi-Factor Authentication**: TOTP-based 2FA with backup codes
- **🌐 OAuth 2.0 Integration**: Google, GitHub, Microsoft providers
- **🏢 SAML 2.0 SSO**: Enterprise single sign-on support
- **👥 Workspace Management**: Multi-tenant workspace isolation
- **🛡️ Advanced Security**: Argon2id hashing, JWT with rotation
- **📊 RBAC System**: Role-based access control
- **🔄 Session Management**: Secure session handling with Redis
- **📧 Email Verification**: Secure account activation flow

## Current Status

**Production Ready**: ✅ **YES** (v3.0)  
**Security Score**: 97/100  
**Compliance**: GDPR Ready

### Recent Security Enhancements (December 2024)
- ✅ Separated JWT secrets for access/refresh tokens
- ✅ Fixed authentication bypass vulnerability
- ✅ Implemented OAuth state parameter validation
- ✅ Fixed SAML XXE vulnerability
- ✅ Enhanced session security with regeneration
- ✅ Added distributed locking for race conditions
- ✅ Implemented Argon2id password hashing

## Architecture

```
┌─────────────────────────────────────────┐
│      Request from API Gateway            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│    User Management Service (Port 3004)   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │   Authentication Engine          │   │
│  │  ┌──────────────────────────┐   │   │
│  │  │  Password Authentication │   │   │
│  │  │  OAuth 2.0 Providers     │   │   │
│  │  │  SAML 2.0 SSO            │   │   │
│  │  │  MFA/2FA System          │   │   │
│  │  └──────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │   Authorization System           │   │
│  │  - Role-Based Access Control     │   │
│  │  - Permission Management         │   │
│  │  - Workspace Isolation           │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │   Session Management             │   │
│  │  - Redis Session Store           │   │
│  │  - JWT Token Management          │   │
│  │  - Refresh Token Rotation        │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │   User Profile Management        │   │
│  │  - Profile CRUD                  │   │
│  │  - Email Verification            │   │
│  │  - Password Reset                │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Security Features

### Authentication Methods
- **Password-Based**: Argon2id hashing with salt
- **OAuth 2.0**: Multiple provider support with PKCE
- **SAML 2.0**: Enterprise SSO integration
- **API Keys**: Service-to-service authentication
- **Passwordless**: Magic link authentication

### Multi-Factor Authentication
- **TOTP**: Time-based one-time passwords
- **Backup Codes**: Recovery codes for lost devices
- **SMS OTP**: Optional SMS-based 2FA
- **Security Keys**: WebAuthn/FIDO2 support (planned)

### Password Security
```javascript
{
  "algorithm": "argon2id",
  "memoryCost": 65536,  // 64MB
  "timeCost": 3,
  "parallelism": 4,
  "saltLength": 32,
  "hashLength": 64,
  "minLength": 12,
  "complexity": {
    "uppercase": true,
    "lowercase": true,
    "numbers": true,
    "special": true
  }
}
```

### JWT Security
- **Access Token**: 15-minute expiry, HS256/RS256
- **Refresh Token**: 7-day expiry, separate secret
- **Token Rotation**: Automatic refresh on use
- **Blacklisting**: Redis-based revocation
- **JTI Tracking**: Unique token identifiers

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | User registration |
| POST | `/auth/login` | User login |
| POST | `/auth/logout` | User logout |
| POST | `/auth/refresh` | Token refresh |
| POST | `/auth/verify-email` | Email verification |
| POST | `/auth/resend-verification` | Resend verification |

### Password Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/change-password` | Change password |
| GET | `/auth/password-strength` | Check password strength |

### OAuth 2.0
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/oauth/google` | Google OAuth login |
| GET | `/auth/oauth/google/callback` | Google callback |
| GET | `/auth/oauth/github` | GitHub OAuth login |
| GET | `/auth/oauth/github/callback` | GitHub callback |
| POST | `/auth/oauth/unlink` | Unlink OAuth account |

### SAML 2.0
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/saml/metadata` | SAML metadata |
| POST | `/auth/saml/login` | SAML login |
| POST | `/auth/saml/acs` | Assertion consumer |
| GET | `/auth/saml/logout` | SAML logout |

### Multi-Factor Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/mfa/setup` | Setup 2FA |
| POST | `/auth/mfa/verify-setup` | Verify 2FA setup |
| POST | `/auth/mfa/verify` | Verify 2FA code |
| POST | `/auth/mfa/disable` | Disable 2FA |
| GET | `/auth/mfa/backup-codes` | Get backup codes |
| POST | `/auth/mfa/regenerate-codes` | New backup codes |

### User Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me` | Current user profile |
| PUT | `/users/me` | Update profile |
| DELETE | `/users/me` | Delete account |
| GET | `/users/:id` | Get user by ID |
| PUT | `/users/:id/role` | Update user role |

### Workspace Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workspaces` | List workspaces |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces/:id` | Get workspace |
| PUT | `/workspaces/:id` | Update workspace |
| DELETE | `/workspaces/:id` | Delete workspace |
| POST | `/workspaces/:id/invite` | Invite user |
| POST | `/workspaces/:id/leave` | Leave workspace |

## Configuration

### Environment Variables
```env
# Service Configuration
USER_MANAGEMENT_PORT=3004
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=64-character-minimum-secret-key
JWT_REFRESH_SECRET=different-64-character-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
JWT_ALGORITHM=HS256

# Password Security
PASSWORD_MIN_LENGTH=12
PASSWORD_HISTORY_COUNT=5
ACCOUNT_LOCKOUT_ATTEMPTS=5
ACCOUNT_LOCKOUT_DURATION=30m

# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# SAML Configuration
SAML_ENTRY_POINT=https://idp.example.com/sso
SAML_ISSUER=ux-flow-engine
SAML_CERT=base64-encoded-cert
SAML_PRIVATE_KEY=base64-encoded-key

# Email Service
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASS=smtp-password
EMAIL_FROM=UX Flow Engine <noreply@example.com>

# MFA Configuration
MFA_ISSUER=UX Flow Engine
MFA_BACKUP_CODES_COUNT=10
MFA_CODE_WINDOW=2

# Session Configuration
SESSION_SECRET=session-secret-key
SESSION_TIMEOUT=30m
MAX_SESSIONS_PER_USER=5
```

## Role-Based Access Control

### Default Roles
| Role | Permissions | Scope |
|------|-------------|-------|
| **Super Admin** | All permissions | System-wide |
| **Workspace Admin** | Manage workspace | Workspace |
| **Project Manager** | Manage projects | Projects |
| **Developer** | Read/Write flows | Projects |
| **Viewer** | Read-only access | Projects |
| **Guest** | Limited read | Specific flows |

### Permission Matrix
```javascript
{
  "super_admin": ["*"],
  "workspace_admin": [
    "workspace:*",
    "user:invite",
    "user:remove",
    "billing:manage"
  ],
  "project_manager": [
    "project:*",
    "flow:*",
    "user:read"
  ],
  "developer": [
    "project:read",
    "flow:*",
    "knowledge:*"
  ],
  "viewer": [
    "project:read",
    "flow:read"
  ]
}
```

## Session Management

### Session Security
- **Session Regeneration**: On privilege escalation
- **Session Timeout**: Configurable idle timeout
- **Concurrent Sessions**: Limited per user
- **Device Tracking**: Track login devices
- **Session Revocation**: Instant termination

### Redis Session Store
```javascript
{
  "sessionId": "sess_123",
  "userId": "user_456",
  "createdAt": "2024-01-01T00:00:00Z",
  "lastActivity": "2024-01-01T00:30:00Z",
  "device": {
    "userAgent": "Mozilla/5.0...",
    "ip": "192.168.1.1",
    "fingerprint": "device_hash"
  }
}
```

## Email Templates

### Available Templates
- Welcome email
- Email verification
- Password reset
- Login notification
- Security alert
- Workspace invitation
- Account deletion

### Template Customization
```html
<!-- email-verification.html -->
<h1>Verify Your Email</h1>
<p>Hi {{userName}},</p>
<p>Please verify your email by clicking the link below:</p>
<a href="{{verificationUrl}}">Verify Email</a>
<p>This link expires in {{expiryHours}} hours.</p>
```

## Performance Metrics

### Operation Latency
| Operation | Average | P95 | P99 |
|-----------|---------|-----|-----|
| Login | 200ms | 400ms | 600ms |
| Token Refresh | 50ms | 100ms | 150ms |
| OAuth Login | 500ms | 1s | 1.5s |
| MFA Verify | 100ms | 200ms | 300ms |
| Password Hash | 100ms | 150ms | 200ms |

### Resource Usage
- **CPU**: 1-2 cores baseline
- **Memory**: 256MB-512MB typical
- **Redis**: ~1KB per session
- **Concurrent Users**: 10,000+

## Installation & Setup

### Prerequisites
- Node.js v20+
- MongoDB 7.0+
- Redis 7.0+
- SMTP server (for emails)

### Development Setup
```bash
# Navigate to service directory
cd services/user-management

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

### Production Setup
```bash
# Build the service
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Or with Docker
docker build -t user-management .
docker run -p 3004:3004 user-management
```

## Monitoring

### Health Check
```bash
curl http://localhost:3004/health
```

Response:
```json
{
  "status": "healthy",
  "service": "user-management",
  "version": "3.0.0",
  "uptime": 3600,
  "stats": {
    "total_users": 5432,
    "active_sessions": 234,
    "workspaces": 89,
    "mfa_enabled": 1234
  }
}
```

### Metrics
- Registration rate
- Login success/failure ratio
- MFA adoption rate
- Password reset requests
- Session duration
- OAuth provider usage

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Security Tests
```bash
npm run test:security
```

### Load Tests
```bash
npm run test:load
```

## Troubleshooting

### Common Issues

#### Login Failures
- Check password requirements
- Verify account status
- Review lockout settings
- Check MFA configuration

#### OAuth Issues
- Verify redirect URLs
- Check client credentials
- Review provider settings
- Test callback URLs

#### Session Problems
- Check Redis connectivity
- Review session timeout
- Verify token expiry
- Monitor concurrent sessions

### Debug Mode
```bash
DEBUG=user-management:* npm run dev
```

## Security Best Practices

1. **Use strong JWT secrets** (64+ characters)
2. **Enable MFA** for all admin accounts
3. **Regular password rotation** policies
4. **Monitor failed login attempts**
5. **Implement rate limiting**
6. **Regular security audits**
7. **Keep dependencies updated**
8. **Use HTTPS only** in production
9. **Implement CSRF protection**
10. **Regular backup of user data**

## GDPR Compliance

### Data Protection
- User consent tracking
- Data export functionality
- Right to erasure
- Data minimization
- Privacy by design

### Audit Trail
- Login/logout events
- Permission changes
- Data access logs
- Security events
- Compliance reports

## License

MIT License - See [LICENSE](../../LICENSE) for details

## Support

- **Documentation**: [Main README](../../README.md)
- **Architecture**: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Security**: [SECURITY.md](../../SECURITY.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/ux-flow-engine/issues)
- **Identity Team**: identity@uxflowengine.com

---

*Last Updated: December 2024*  
*Version: 3.0.0*