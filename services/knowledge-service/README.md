# Knowledge Service

RAG-powered knowledge management with vector database and document processing capabilities.

## Current Status

🚨 **CRITICAL SECURITY ALERT**: Multiple critical vulnerabilities found  
**Security Score**: 31/100 (EXTREMELY VULNERABLE)  
**Critical Issues**: 6  
**Production Ready**: ❌ **ABSOLUTELY NOT**

## Core Functionality

### ✅ Implemented Features
- Document processing and embedding generation
- Vector similarity search (ChromaDB)
- RAG (Retrieval-Augmented Generation) system
- Knowledge base management
- Multi-provider embedding support (OpenAI, Google)

### 🚨 CRITICAL SECURITY ISSUES

1. **Vector Database Injection** - Complete database compromise possible
2. **Cross-Tenant Data Leakage** - Users can access other workspaces
3. **RAG Prompt Injection** - System manipulation through queries  
4. **Embedding Poisoning** - Knowledge base corruption attacks
5. **NoSQL Injection** - Database DoS and unauthorized access
6. **API Key Exposure** - Financial abuse and service disruption

## Quick Start

⚠️ **DO NOT USE IN PRODUCTION** - Critical security vulnerabilities present

```bash
npm install
npm run dev  # Development only
```

## Environment Variables
- `MONGODB_URI` - Database connection
- `REDIS_URL` - Caching layer  
- `GOOGLE_API_KEY` - Embedding generation
- `OPENAI_API_KEY` - Alternative embeddings
- `CHROMA_HOST` - Vector database host

## API Endpoints
- `POST /documents` - Upload documents
- `GET /documents` - List documents
- `POST /query` - Knowledge query
- `GET /health` - Health check

## Critical Fixes Required

**Immediate (Block Production)**:
1. Implement vector database access controls
2. Fix cross-tenant data isolation
3. Add comprehensive query sanitization
4. Implement embedding authenticity validation

**Estimated Fix Time**: 6-8 weeks of security-focused development

See `code_and_security_review.md` for complete vulnerability assessment.