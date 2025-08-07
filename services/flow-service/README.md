# Flow Service

Flow data management, versioning, and business rules engine for UX flow diagrams.

## Current Status

⚠️ **CRITICAL CODE EXECUTION VULNERABILITY**  
**Security Score**: 30/100  
**Production Ready**: ❌ **BLOCKED** - Code injection vulnerability

## Core Functionality

### ✅ Implemented Features
- Flow CRUD operations
- Version control and history
- Collaboration system with operational transform
- Template management
- Batch operations
- Import/Export functionality

### 🚨 CRITICAL SECURITY ISSUE

**Code Injection in Business Rules Engine**:
```javascript
// DANGEROUS CODE - Allows arbitrary JavaScript execution
const ruleFunction = new Function('flow', rule.code);
```
- Complete system compromise possible
- Arbitrary file access and process manipulation
- **MUST FIX IMMEDIATELY**

## Quick Start

⚠️ **DO NOT USE IN PRODUCTION**

```bash
npm install
npm run dev
```

## API Endpoints
- `GET /flows` - List flows
- `POST /flows` - Create flow
- `PUT /flows/:id` - Update flow  
- `DELETE /flows/:id` - Delete flow
- `GET /flows/:id/versions` - Version history

**CRITICAL FIX REQUIRED**: Replace `new Function()` with Worker threads or proper sandboxing.

See `code_and_security_review.md` for complete details.