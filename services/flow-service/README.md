# Flow Service 📊

> Enterprise-grade flow management with version control, real-time collaboration, and business rules engine

## Overview

The Flow Service is the core data management system for UX-Flow-Engine, handling all flow-related operations including creation, modification, versioning, collaboration, and export. It provides a robust foundation for managing complex UX flow diagrams with enterprise features like version control, real-time collaboration, and customizable business rules.

### Key Features
- **📐 Flow Management**: Complete CRUD operations for flow diagrams
- **🔄 Version Control**: Git-like versioning with branching and merging
- **👥 Real-time Collaboration**: Operational transformation for conflict-free editing
- **📋 Template System**: Reusable flow templates and patterns
- **🏭 Business Rules**: Sandboxed rule execution engine
- **📤 Import/Export**: Multiple format support (JSON, XML, SVG)
- **🔐 Access Control**: Granular permissions per flow

## Current Status

**Production Ready**: ✅ **YES** (v3.0)  
**Security Score**: 94/100  
**Performance Grade**: A

### Recent Security Enhancements (December 2024)
- ✅ Fixed code injection vulnerability with Worker threads
- ✅ Implemented sandboxed rule execution
- ✅ Added comprehensive input validation
- ✅ Enhanced access control mechanisms
- ✅ Implemented version integrity checks
- ✅ Added audit logging for all operations
- ✅ Secured template system against injection

## Architecture

```
┌─────────────────────────────────────────┐
│      Request from API Gateway            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│       Flow Service (Port 3003)           │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Flow Manager                 │   │
│  │  ┌──────────────────────────┐   │   │
│  │  │  CRUD Operations         │   │   │
│  │  │  Validation Engine       │   │   │
│  │  │  Access Control          │   │   │
│  │  └──────────────────────────┘   │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Version Control              │   │
│  │  - Snapshot Creation             │   │
│  │  - Diff Generation               │   │
│  │  - Merge Resolution              │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Collaboration Engine         │   │
│  │  - Operational Transform         │   │
│  │  - Conflict Resolution           │   │
│  │  - Real-time Sync                │   │
│  └─────────────────────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │     Business Rules Engine        │   │
│  │  - Worker Thread Sandbox         │   │
│  │  - Rule Validation               │   │
│  │  - Safe Execution                │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## Data Models

### Flow Structure
```javascript
{
  "_id": "flow_123",
  "workspaceId": "workspace_456",
  "projectId": "project_789",
  "name": "User Authentication Flow",
  "description": "Complete auth flow with 2FA",
  "metadata": {
    "version": "2.1.0",
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-02T00:00:00Z",
    "author": "user_123",
    "tags": ["authentication", "security"]
  },
  "nodes": [
    {
      "id": "node_1",
      "type": "start",
      "position": { "x": 100, "y": 100 },
      "data": { "label": "Start" }
    },
    {
      "id": "node_2",
      "type": "screen",
      "position": { "x": 300, "y": 100 },
      "data": {
        "label": "Login Screen",
        "components": ["email", "password", "submit"]
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "type": "default",
      "data": { "label": "Navigate" }
    }
  ],
  "versions": [
    {
      "version": "2.0.0",
      "timestamp": "2024-01-01T12:00:00Z",
      "changes": "Added 2FA support",
      "author": "user_123"
    }
  ]
}
```

## Security Features

### Access Control
- **Role-Based Permissions**: Owner, Editor, Viewer roles
- **Workspace Isolation**: Complete data segregation
- **Flow-Level Security**: Granular access per flow
- **Audit Trail**: Complete activity logging
- **Token Validation**: JWT-based authentication

### Business Rules Security
- **Worker Thread Isolation**: Sandboxed execution
- **Resource Limits**: CPU and memory constraints
- **Timeout Protection**: Automatic termination
- **Input Sanitization**: Comprehensive validation
- **Output Validation**: Result verification

### Data Protection
- **Encryption at Rest**: AES-256-GCM
- **Version Integrity**: Hash-based verification
- **Backup Strategy**: Automated snapshots
- **Recovery Points**: Point-in-time restoration
- **Export Security**: Sanitized outputs

## API Endpoints

### Flow Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/flows` | List flows with pagination |
| POST | `/flows` | Create new flow |
| GET | `/flows/:id` | Get flow details |
| PUT | `/flows/:id` | Update flow |
| DELETE | `/flows/:id` | Delete flow |
| POST | `/flows/:id/duplicate` | Duplicate flow |

### Version Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/flows/:id/versions` | List versions |
| GET | `/flows/:id/versions/:vid` | Get specific version |
| POST | `/flows/:id/versions` | Create version |
| POST | `/flows/:id/restore/:vid` | Restore version |
| GET | `/flows/:id/diff/:v1/:v2` | Compare versions |

### Collaboration
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/flows/:id/collaborate` | Join collaboration |
| POST | `/flows/:id/operations` | Apply operations |
| GET | `/flows/:id/collaborators` | List collaborators |
| POST | `/flows/:id/lock` | Lock for editing |
| DELETE | `/flows/:id/lock` | Release lock |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Create template |
| GET | `/templates/:id` | Get template |
| POST | `/flows/from-template/:id` | Create from template |

### Import/Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/flows/import` | Import flow |
| GET | `/flows/:id/export` | Export flow |
| GET | `/flows/:id/export/svg` | Export as SVG |
| GET | `/flows/:id/export/pdf` | Export as PDF |

## Configuration

### Environment Variables
```env
# Service Configuration
FLOW_SERVICE_PORT=3003
NODE_ENV=production

# Database
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379

# Security
ENCRYPTION_KEY=32-byte-encryption-key
JWT_SECRET=your-jwt-secret

# Business Rules
ENABLE_BUSINESS_RULES=true
RULE_TIMEOUT_MS=5000
RULE_MEMORY_LIMIT_MB=128
WORKER_THREADS=4

# Collaboration
ENABLE_COLLABORATION=true
OT_ALGORITHM=ot-json
COLLABORATION_TIMEOUT_MS=30000

# Versioning
MAX_VERSIONS_PER_FLOW=100
AUTO_VERSION_INTERVAL_MS=300000
VERSION_RETENTION_DAYS=90

# Export
ENABLE_PDF_EXPORT=true
ENABLE_SVG_EXPORT=true
MAX_EXPORT_SIZE_MB=50
```

## Version Control

### Versioning Strategy
- **Automatic Versioning**: Every significant change
- **Manual Checkpoints**: User-triggered saves
- **Branch Support**: Experimental features
- **Merge Capabilities**: Conflict resolution
- **Rollback**: Instant version restoration

### Version Operations
```javascript
// Create version
POST /flows/:id/versions
{
  "message": "Added payment flow",
  "tag": "v2.0.0"
}

// Compare versions
GET /flows/:id/diff/v1.0.0/v2.0.0

// Restore version
POST /flows/:id/restore/v1.0.0
```

## Collaboration Features

### Real-time Sync
- **WebSocket Connection**: Live updates
- **Operational Transform**: Conflict-free editing
- **Cursor Sharing**: See other users' positions
- **Selection Sharing**: Highlight active elements
- **Chat Integration**: In-flow communication

### Conflict Resolution
```javascript
{
  "operation": {
    "type": "insert",
    "path": "/nodes/3",
    "value": { /* node data */ },
    "version": 5,
    "userId": "user_123"
  }
}
```

## Business Rules Engine

### Rule Definition
```javascript
{
  "name": "ValidateAuthFlow",
  "description": "Ensures auth flows have required components",
  "trigger": "pre-save",
  "code": `
    // Sandboxed execution in Worker thread
    if (flow.type === 'authentication') {
      const hasLogin = flow.nodes.some(n => n.type === 'login');
      const has2FA = flow.nodes.some(n => n.type === '2fa');
      return {
        valid: hasLogin && has2FA,
        message: 'Auth flows require login and 2FA nodes'
      };
    }
    return { valid: true };
  `
}
```

### Security Measures
- Worker thread isolation
- Resource limits
- Timeout protection
- No file system access
- No network access
- Sanitized context

## Performance Metrics

### Operation Latency
| Operation | Average | P95 | P99 |
|-----------|---------|-----|-----|
| Flow Create | 50ms | 100ms | 200ms |
| Flow Update | 30ms | 60ms | 100ms |
| Version Create | 100ms | 200ms | 400ms |
| Template Apply | 150ms | 300ms | 500ms |
| Export PDF | 2s | 4s | 6s |

### Resource Usage
- **CPU**: 1-2 cores baseline
- **Memory**: 512MB-1GB typical
- **Storage**: ~1KB per flow version
- **Concurrent Users**: 100+ per flow

## Installation & Setup

### Prerequisites
- Node.js v20+
- MongoDB 7.0+
- Redis 7.0+

### Development Setup
```bash
# Navigate to service directory
cd services/flow-service

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
docker build -t flow-service .
docker run -p 3003:3003 flow-service
```

## Monitoring

### Health Check
```bash
curl http://localhost:3003/health
```

Response:
```json
{
  "status": "healthy",
  "service": "flow-service",
  "version": "3.0.0",
  "uptime": 3600,
  "stats": {
    "flows": 1234,
    "versions": 5678,
    "templates": 45,
    "active_collaborations": 12
  }
}
```

### Metrics
- Flow creation rate
- Version creation frequency
- Collaboration sessions
- Rule execution times
- Export generation speed
- Storage utilization

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

### Security Tests
```bash
npm run test:security
```

## Troubleshooting

### Common Issues

#### Version Conflicts
- Check version numbers
- Review merge strategy
- Validate operation order
- Test with clean state

#### Collaboration Issues
- Verify WebSocket connection
- Check network latency
- Review operation transforms
- Monitor sync status

#### Export Failures
- Check resource limits
- Verify template integrity
- Review error logs
- Test with smaller flows

### Debug Mode
```bash
DEBUG=flow-service:* npm run dev
```

## Best Practices

### Flow Design
1. Use meaningful node IDs
2. Add comprehensive metadata
3. Regular version checkpoints
4. Implement validation rules
5. Document complex flows

### Performance Optimization
1. Paginate large flow lists
2. Cache frequently accessed flows
3. Optimize version storage
4. Use batch operations
5. Implement lazy loading

### Security Guidelines
1. Validate all inputs
2. Sanitize export data
3. Regular access audits
4. Monitor rule execution
5. Implement rate limiting

## License

MIT License - See [LICENSE](../../LICENSE) for details

## Support

- **Documentation**: [Main README](../../README.md)
- **Architecture**: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Security**: [SECURITY.md](../../SECURITY.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/ux-flow-engine/issues)
- **Flow Team**: flow-team@uxflowengine.com

---

*Last Updated: December 2024*  
*Version: 3.0.0*