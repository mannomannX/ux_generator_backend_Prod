# Cognitive Core Service

AI-powered agent orchestration hub for UX flow generation using specialized multi-agent architecture.

## Current Status

🚨 **CRITICAL SECURITY ALERT**: Contains **CRITICAL CRYPTOGRAPHIC VULNERABILITIES**  
**Security Score**: 45/100  
**Critical Issues**: 4  
**Production Ready**: ❌ **ABSOLUTELY NOT** - Immediate security fixes required

## Core Functionality

### ✅ AI Agent System (9 Specialized Agents)
- **Manager Agent**: Task coordination and delegation
- **Planner Agent**: Step-by-step execution planning  
- **Architect Agent**: Flow structure implementation
- **Validator Agent**: Quality assurance and validation
- **Classifier Agent**: Intent and sentiment analysis
- **Synthesizer Agent**: Response composition
- **UX Expert Agent**: Design principles and advice
- **Visual Interpreter Agent**: Image analysis
- **Analyst Agent**: System insights and improvements

### ✅ Learning System
- Episode detection and analysis
- Prompt optimization through feedback
- Self-improving conversation flows
- Performance analytics and insights

### ✅ AI Provider Integration
- Google Gemini (gemini-1.5-flash, gemini-1.5-pro)
- OpenAI GPT models
- Anthropic Claude integration
- Provider failover and load balancing

### ✅ Security Features (⚠️ FLAWED)
- Prompt injection detection
- AI response sanitization  
- Rate limiting per user tier
- Resource usage monitoring
- **CRITICAL**: Encryption implementations are BROKEN

## 🚨 CRITICAL SECURITY VULNERABILITIES

### 1. **DEPRECATED CRYPTO METHODS** (CRITICAL)
```javascript
// DANGEROUS CODE in api-key-manager.js & conversation-encryption.js
const cipher = crypto.createCipher('aes-256-gcm', key); // VULNERABLE
```
- Uses deprecated crypto methods vulnerable to attacks
- All API keys and conversations at risk of decryption

### 2. **PROMPT INJECTION BYPASS VULNERABILITIES** (HIGH)
- Base64 detection incomplete
- Unicode escape sequences can bypass filters
- Context-based bypasses possible

### 3. **LEARNING SYSTEM PRIVACY VIOLATIONS** (HIGH)
- Insufficient PII anonymization
- User hash collision risks
- Opt-out mechanism incomplete

## Quick Start

```bash
# Development
npm install
npm run dev

# Production (⚠️ DO NOT USE - Security vulnerabilities)
npm start
```

**Environment Variables Required:**
- `GOOGLE_API_KEY` - Gemini API access
- `MONGODB_URI` - Database connection
- `REDIS_URL` - Event bus and caching
- `JWT_SECRET` - Authentication
- `ENCRYPTION_KEY` - Data encryption (⚠️ Implementation broken)

## API Endpoints

- `POST /ai/generate` - Generate UX flow from description
- `POST /ai/refine` - Refine existing flow
- `GET /ai/models` - Available AI models
- `GET /health` - Service health

## Performance
- **Response Time**: 2-15 seconds (AI operations)
- **Concurrent Users**: 50+ (with rate limiting)
- **Memory Usage**: 512MB-2GB (varies by model)

## ⚠️ PRODUCTION DEPLOYMENT BLOCKED

**MUST FIX BEFORE PRODUCTION:**
1. Replace all deprecated crypto.createCipher/createDecipher calls
2. Implement proper API key encryption with secure methods
3. Fix conversation encryption with proper IV handling
4. Add comprehensive AI output sanitization

**Estimated Fix Time**: 2-4 weeks of focused security work

See `code_and_security_review.md` for complete vulnerability details.