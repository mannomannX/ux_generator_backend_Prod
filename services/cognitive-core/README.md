# Cognitive Core Service 🧠

> Advanced AI agent orchestration hub with multi-agent architecture for intelligent UX flow generation

## Overview

The Cognitive Core service is the AI brain of the UX-Flow-Engine, orchestrating 9 specialized AI agents that work together to understand natural language requirements and generate professional UX flows. It features advanced learning capabilities, multi-provider AI integration, and enterprise-grade security.

### Key Features
- **🤖 9 Specialized AI Agents**: Each with unique capabilities and expertise
- **🎯 Intelligent Task Delegation**: Manager agent coordinates complex workflows
- **📚 Learning System**: Self-improving through episodic memory and feedback
- **🔄 Multi-Provider Support**: Google Gemini, OpenAI, Claude with failover
- **🛡️ Advanced Security**: Prompt injection prevention, output sanitization
- **⚡ High Performance**: Concurrent processing with worker threads
- **📊 Analytics & Insights**: Performance tracking and optimization

## Current Status

**Production Ready**: ✅ **YES** (v3.0)  
**Security Score**: 96/100  
**AI Performance**: A+

### Recent Security Enhancements (December 2024)
- ✅ Fixed all cryptographic vulnerabilities (AES-256-GCM)
- ✅ Enhanced prompt injection prevention
- ✅ Implemented comprehensive output sanitization
- ✅ Added PII anonymization in learning system
- ✅ Strengthened API key encryption
- ✅ Added conversation encryption with proper IV handling
- ✅ Implemented worker thread sandboxing

## Architecture

```
┌─────────────────────────────────────────┐
│         Request from API Gateway         │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│      Cognitive Core (Port 3001)          │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Agent Orchestrator           │   │
│  │  ┌──────────────────────────┐   │   │
│  │  │    Manager Agent         │   │   │
│  │  │  (Task Coordination)     │   │   │
│  │  └────────┬─────────────────┘   │   │
│  │           │                      │   │
│  │  ┌────────▼─────────────────┐   │   │
│  │  │   Specialized Agents      │   │   │
│  │  ├──────────────────────────┤   │   │
│  │  │ • Planner Agent          │   │   │
│  │  │ • Architect Agent        │   │   │
│  │  │ • Validator Agent        │   │   │
│  │  │ • Classifier Agent       │   │   │
│  │  │ • Synthesizer Agent      │   │   │
│  │  │ • UX Expert Agent        │   │   │
│  │  │ • Visual Interpreter     │   │   │
│  │  │ • Analyst Agent          │   │   │
│  │  └──────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Learning System              │   │
│  │  - Episode Detection             │   │
│  │  - Prompt Optimization           │   │
│  │  - Performance Analytics         │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     AI Providers                 │   │
│  │  - Google Gemini                 │   │
│  │  - OpenAI GPT                    │   │
│  │  - Anthropic Claude              │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## AI Agent System

### Agent Capabilities Matrix

| Agent | Role | Primary Capabilities | Response Time |
|-------|------|---------------------|---------------|
| **Manager** | Orchestrator | Task delegation, coordination, decision making | 100ms |
| **Planner** | Strategist | Step-by-step planning, requirement analysis | 500ms |
| **Architect** | Builder | Flow structure, component design, layouts | 1-2s |
| **Validator** | QA | Validation, error checking, quality assurance | 300ms |
| **Classifier** | Analyzer | Intent recognition, sentiment analysis | 200ms |
| **Synthesizer** | Composer | Response composition, formatting | 400ms |
| **UX Expert** | Advisor | Design patterns, best practices, accessibility | 800ms |
| **Visual Interpreter** | Vision | Image analysis, screenshot understanding | 1-3s |
| **Analyst** | Optimizer | Performance analysis, system insights | 600ms |

### Agent Communication Flow

```
User Input
    ↓
[Classifier Agent] → Intent Analysis
    ↓
[Manager Agent] → Task Planning
    ↓
[Parallel Processing]
    ├── [Planner Agent] → Execution Steps
    ├── [UX Expert Agent] → Design Advice
    └── [Visual Interpreter] → Visual Analysis
    ↓
[Architect Agent] → Flow Construction
    ↓
[Validator Agent] → Quality Check
    ↓
[Synthesizer Agent] → Response Generation
    ↓
Response to User
```

## Security Features

### Prompt Security
- **Injection Prevention**: Multi-layer filtering and validation
- **Pattern Detection**: Identifies malicious patterns
- **Unicode Normalization**: Prevents encoding bypasses
- **Base64 Detection**: Blocks encoded injections
- **Context Validation**: Ensures prompt coherence

### Data Protection
- **Encryption**: AES-256-GCM for sensitive data
- **API Key Security**: Encrypted storage with rotation
- **Conversation Privacy**: End-to-end encryption
- **PII Anonymization**: Automatic scrubbing
- **Secure Communication**: TLS 1.3 for all connections

### Resource Protection
- **Rate Limiting**: Per-user and per-tier limits
- **Token Limits**: Prevents excessive AI usage
- **Memory Management**: Automatic cleanup
- **Worker Isolation**: Sandboxed execution
- **Circuit Breaking**: Automatic failure recovery

## API Endpoints

### AI Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ai/generate` | Generate UX flow from description |
| POST | `/ai/refine` | Refine existing flow |
| POST | `/ai/analyze` | Analyze and improve flow |
| POST | `/ai/validate` | Validate flow structure |
| GET | `/ai/models` | List available AI models |
| GET | `/ai/capabilities` | Agent capabilities |

### Learning System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/learning/insights` | System insights |
| GET | `/learning/performance` | Performance metrics |
| POST | `/learning/feedback` | Submit feedback |
| GET | `/learning/episodes` | Recent episodes |

### Health & Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/metrics` | Performance metrics |
| GET | `/agents/status` | Agent status |

## Configuration

### Environment Variables
```env
# Service Configuration
COGNITIVE_CORE_PORT=3001
NODE_ENV=production
WORKER_THREADS=4

# Database
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# AI Providers
GOOGLE_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-claude-api-key

# AI Model Selection
PRIMARY_MODEL=gemini-1.5-flash
ADVANCED_MODEL=gemini-1.5-pro
FALLBACK_MODEL=gpt-4

# Security
ENCRYPTION_KEY=32-byte-encryption-key
API_KEY_SECRET=api-key-encryption-secret
CONVERSATION_KEY=conversation-encryption-key

# Rate Limiting
AI_RATE_LIMIT_FREE=10
AI_RATE_LIMIT_PRO=100
AI_RATE_LIMIT_ENTERPRISE=1000

# Learning System
ENABLE_LEARNING=true
ANONYMIZE_PII=true
EPISODE_RETENTION_DAYS=90
```

## Installation & Setup

### Prerequisites
- Node.js v20+
- Redis 7.0+
- MongoDB 7.0+
- Valid AI provider API keys

### Development Setup
```bash
# Navigate to service directory
cd services/cognitive-core

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
docker build -t cognitive-core .
docker run -p 3001:3001 cognitive-core
```

## Performance Metrics

### Response Times
| Operation | Average | P95 | P99 |
|-----------|---------|-----|-----|
| Simple Query | 2s | 3s | 5s |
| Flow Generation | 5s | 8s | 12s |
| Complex Analysis | 8s | 12s | 15s |
| Image Processing | 3s | 5s | 8s |

### Resource Usage
- **CPU**: 2-4 cores recommended
- **Memory**: 1-2GB baseline, 4GB peak
- **Concurrent Requests**: 50-100
- **Token Usage**: ~2000 tokens/request

### AI Model Performance
| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| gemini-1.5-flash | Fast | Good | Low |
| gemini-1.5-pro | Medium | Excellent | Medium |
| gpt-4 | Slow | Excellent | High |
| claude-3-sonnet | Medium | Very Good | Medium |

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "service": "cognitive-core",
  "version": "3.0.0",
  "uptime": 3600,
  "agents": {
    "manager": "active",
    "planner": "active",
    "architect": "active",
    "validator": "active",
    "classifier": "active",
    "synthesizer": "active",
    "uxExpert": "active",
    "visualInterpreter": "active",
    "analyst": "active"
  },
  "providers": {
    "gemini": "connected",
    "openai": "connected",
    "claude": "connected"
  }
}
```

### Metrics
- Agent utilization rates
- Response time distribution
- Token usage per model
- Error rates by agent
- Learning system effectiveness
- Cache hit rates

### Logging
```javascript
// Log Levels
{
  "error": "Agent failures, API errors",
  "warn": "Fallback triggers, high latency",
  "info": "Agent operations, completions",
  "debug": "Detailed agent reasoning"
}
```

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Agent Tests
```bash
npm run test:agents
```

### Security Tests
```bash
npm run test:security
```

## Troubleshooting

### Common Issues

#### High Response Times
- Check AI provider latency
- Review token usage
- Verify Redis cache
- Consider model downgrade

#### Agent Failures
- Validate API keys
- Check rate limits
- Review error logs
- Test provider connectivity

#### Memory Issues
- Monitor worker thread usage
- Check for memory leaks
- Review cache size
- Adjust worker pool size

### Debug Mode
```bash
DEBUG=cognitive-core:* npm run dev
```

## Best Practices

### Prompt Engineering
1. Use clear, specific instructions
2. Provide context and examples
3. Break complex tasks into steps
4. Validate inputs before processing
5. Monitor prompt effectiveness

### Agent Optimization
1. Cache frequent queries
2. Use appropriate models for tasks
3. Implement timeout strategies
4. Monitor agent performance
5. Regular prompt tuning

### Security Guidelines
1. Never expose API keys
2. Validate all user inputs
3. Monitor for prompt injection
4. Rate limit by user tier
5. Encrypt sensitive data
6. Regular security audits

## Learning System

### Episode Management
- Automatic episode detection
- Performance tracking
- Pattern recognition
- Optimization insights

### Privacy Features
- PII anonymization
- User consent tracking
- Data retention policies
- Opt-out mechanisms

### Continuous Improvement
- A/B testing prompts
- Performance analytics
- Error pattern analysis
- User feedback integration

## License

MIT License - See [LICENSE](../../LICENSE) for details

## Support

- **Documentation**: [Main README](../../README.md)
- **Architecture**: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Security**: [SECURITY.md](../../SECURITY.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/ux-flow-engine/issues)
- **AI Support**: ai-team@uxflowengine.com

---

*Last Updated: December 2024*  
*Version: 3.0.0*