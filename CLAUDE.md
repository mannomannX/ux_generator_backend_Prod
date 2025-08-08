# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UX-Flow-Engine is an enterprise-grade AI-powered UX flow design platform with multi-agent architecture. It transforms natural language descriptions into professional UX flow diagrams using 9 specialized AI agents.

**Version**: 3.0.0 (December 2024)  
**Status**: Production Ready  
**Security Score**: 98/100

**Core Architecture:**
- Microservice-based architecture with event-driven communication
- Services communicate via Redis Pub/Sub with inter-service authentication
- MongoDB for data persistence with encryption at rest
- Google Gemini API as primary AI provider (Claude/OpenAI as fallbacks)
- WebSocket for real-time collaboration with security enhancements
- Preparing for mono-repo structure with frontend applications

## Key Commands

### Development
```bash
# Install all dependencies
npm run install:all

# Start all services in development mode (hot reload)
npm run dev

# Start specific services
npm run dev:api-gateway       # API Gateway (port 3000)
npm run dev:cognitive-core    # AI Agents (port 3001)
npm run dev:knowledge-service # Knowledge/RAG (port 3002)
npm run dev:flow-service      # Flow Management (port 3003)
```

### Testing
```bash
# Run all tests
npm test

# Service-specific tests
cd services/cognitive-core && npm test
cd services/api-gateway && npm test

# Integration tests
npm run test:integration

# Test coverage
npm run test:coverage

# Watch mode for development
npm test -- --watch
```

### Code Quality
```bash
# Lint all code
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

### Monitoring & Health
```bash
# Check all services health
npm run health:check

# Monitor real-time logs
npm run logs:tail

# Service-specific health check
curl http://localhost:3001/health
```

### Utilities
```bash
# Generate new service
npm run generate:service -- --name=service-name --port=3004

# Generate new AI agent
npm run generate:agent -- --name=AgentName

# Database migration
npm run migrate:data
```

## High-Level Architecture

### Service Structure
```
services/
├── api-gateway/        # Entry point, WebSocket management, auth (Port 3000)
├── cognitive-core/     # AI agent orchestration hub (Port 3001)
├── knowledge-service/  # RAG, vector DB, knowledge management (Port 3002)
├── flow-service/      # Flow data CRUD, versioning (Port 3003)
├── user-management/   # User auth, workspaces, permissions (Port 3004)
└── billing-service/   # Payments, subscriptions, credits (Port 3005)
```

### AI Agent System

The cognitive-core service contains 9 specialized agents that extend `BaseAgent`:

1. **Manager Agent**: Task coordination and delegation
2. **Planner Agent**: Step-by-step execution planning
3. **Architect Agent**: Flow structure implementation
4. **Validator Agent**: Quality assurance and validation
5. **Classifier Agent**: Intent and sentiment analysis
6. **Synthesizer Agent**: Response composition
7. **UX Expert Agent**: Design principles and advice
8. **Visual Interpreter Agent**: Image analysis
9. **Analyst Agent**: System insights and improvements

Agent communication flow:
```
User Input → Classifier → Manager → (Planner/UXExpert) → Architect → Validator → Synthesizer → Response
```

### Event-Driven Communication

Services communicate via Redis events. Key event types:
- `USER_MESSAGE_RECEIVED`
- `AGENT_TASK_STARTED/COMPLETED/FAILED`
- `FLOW_UPDATE_REQUESTED/UPDATED`
- `KNOWLEDGE_QUERY_REQUESTED/RESPONSE_READY`

Event publishing pattern:
```javascript
eventEmitter.emit(EventTypes.FLOW_UPDATE_REQUESTED, {
  projectId: 'proj_123',
  userId: 'user_456',
  transactions: [...]
});
```

### Flow Data Structure

Flows are stored as JSON with nodes and edges:
```javascript
{
  "metadata": { "flowName": "Login Flow", "version": "1.0.0" },
  "nodes": [
    { "id": "start", "type": "Start" },
    { "id": "login", "type": "Screen", "data": {...} }
  ],
  "edges": [
    { "id": "e1", "source": "start", "target": "login" }
  ]
}
```

## Working with Services

### Adding New Features

1. For new agents: Extend `BaseAgent` in `services/cognitive-core/src/agents/`
2. For new API endpoints: Add routes in `services/api-gateway/src/routes/`
3. For new events: Define in `packages/common/src/events/event-types.js`

### Database Operations

MongoDB operations use the common client:
```javascript
import { MongoClient } from '@ux-flow/common';
await mongo.insertDocument('flows', flowData);
const flow = await mongo.findDocument('flows', { projectId });
```

### Testing Patterns

Tests follow Jest conventions:
```javascript
describe('ComponentName', () => {
  it('should perform expected behavior', async () => {
    // Test implementation
  });
});
```

## Environment Configuration

### Essential Environment Variables
Create `.env` from `.env.example` with these critical settings:

**Core Services:**
- `MONGODB_URI` - MongoDB connection (default: mongodb://localhost:27017/ux-flow-engine)
- `REDIS_URL` - Redis connection (default: redis://localhost:6379)

**AI Providers (at least one required):**
- `GOOGLE_API_KEY` - Google Gemini API (primary)
- `ANTHROPIC_API_KEY` - Claude API (fallback)
- `OPENAI_API_KEY` - OpenAI GPT (optional)

**Security (use strong values):**
- `JWT_SECRET` - Main authentication secret (64+ chars)
- `JWT_REFRESH_SECRET` - Refresh token secret (different 64+ chars)
- `ENCRYPTION_KEY` - Data encryption key (32 bytes)

**Billing (if using payment features):**
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Webhook verification

## Common Patterns

### Error Handling
All services use structured error handling with the common Logger:
```javascript
import { Logger } from '@ux-flow/common';
logger.error('Operation failed', error, { context });
```

### Health Checks
Every service exposes `/health` endpoint returning:
```json
{ "status": "healthy", "timestamp": "...", "service": "service-name" }
```

### State Management
Conversation states are managed in cognitive-core using Map structures for active sessions.

## Important Notes

### Architecture Decisions
- Services are independently deployable but share common utilities from `packages/common`
- AI providers: Google Gemini (primary), Claude/OpenAI (fallbacks) with automatic failover
- WebSocket connections are managed exclusively by api-gateway with enhanced security
- Flow versioning uses snapshot-based approach with integrity checks in flow-service
- Redis is used for event bus, caching, distributed locking, and session management

### Security Enhancements (v3.0)
- All critical vulnerabilities fixed (December 2024)
- NoSQL injection prevention with 50+ operator blocks
- Enhanced cryptography (AES-256-GCM, Argon2id)
- Distributed locking for race condition prevention
- Comprehensive input validation and sanitization
- Worker thread sandboxing for code execution

### Upcoming: Mono-Repo Structure
Preparing to transition to mono-repo with:
- `apps/` - Frontend applications (web, admin, figma-plugin)
- `services/` - Backend microservices
- `packages/` - Shared code and components
- `infrastructure/` - Deployment and DevOps

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete details.