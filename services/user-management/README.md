# User Management Service

User authentication, authorization, and identity management with multi-factor authentication support.

## Current Status

🚨 **CRITICAL AUTHENTICATION VULNERABILITIES**  
**Security Score**: 35/100  
**Critical Issues**: 5  
**Production Ready**: ❌ **ABSOLUTELY NOT**

## Core Functionality

### ✅ Implemented Features
- User registration and email verification
- JWT authentication with refresh tokens
- Multi-factor authentication (TOTP)
- OAuth integration (Google, GitHub, Microsoft)
- SAML SSO provider support
- Password reset and recovery
- Account lockout protection
- API key management
- GDPR compliance utilities

### 🚨 CRITICAL SECURITY VULNERABILITIES

1. **JWT Security Flaws** - Same secret for access/refresh tokens
2. **Authentication Bypass** - Password verification bypassed on hash upgrade
3. **OAuth Implementation Gaps** - Missing state parameter, insecure redirects
4. **SAML Security Issues** - XXE vulnerability, weak certificate validation
5. **Session Security Problems** - Session fixation, concurrent session abuse

## Quick Start

⚠️ **DO NOT USE IN PRODUCTION** - Critical auth vulnerabilities

```bash
npm install
npm run dev
```

## Environment Variables
- `JWT_SECRET` - Main JWT secret
- `JWT_REFRESH_SECRET` - Refresh token secret (⚠️ Currently same as main)
- `MONGODB_URI` - User database
- `REDIS_URL` - Session storage
- `GOOGLE_CLIENT_ID` - OAuth configuration
- `SAML_PRIVATE_KEY` - SAML signing key

## API Endpoints
- `POST /auth/register` - User registration
- `POST /auth/login` - Authentication
- `POST /auth/logout` - Session termination
- `POST /auth/reset-password` - Password reset
- `GET /auth/oauth/google` - OAuth login
- `POST /auth/mfa/setup` - Setup 2FA

## Critical Fixes Required

**Immediate (Block Production)**:
1. **Separate JWT secrets** for access and refresh tokens
2. **Fix authentication bypass** in password verification
3. **Implement proper OAuth state** parameter validation
4. **Fix SAML XXE vulnerability** in metadata parsing
5. **Implement proper session management** with regeneration

**Estimated Fix Time**: 4-6 weeks of focused security work

**CRITICAL RISK**: Authentication system compromise affects ALL users

See `code_and_security_review.md` for complete vulnerability details.