# API Gateway - Open Questions

## Frontend Integration
1. **WebSocket Protocol**: What WebSocket events does the frontend expect? Current implementation has room-based messaging but unclear if frontend uses all features.

2. **Authentication Flow**: Does frontend expect JWT in cookies, headers, or both? Currently supports both but which is primary?

3. **Error Format**: What error response format does frontend expect? Currently using custom error classes but format may need adjustment.

## Service Communication
1. **Flow Service Fallback**: When flow service is unavailable, should we:
   - Return cached data?
   - Return error immediately?
   - Queue request for retry?

2. **Service Discovery**: Currently using hardcoded service URLs. Should implement:
   - Consul/etcd for service discovery?
   - Kubernetes service mesh?
   - Continue with hardcoded config?

## Rate Limiting
1. **User Tiers**: Are there different rate limits for different user tiers (free/pro/enterprise)?

2. **WebSocket Limits**: Should WebSocket connections have different limits than HTTP requests?

## Session Management
1. **Session Storage**: Currently using JWT only. Should we add server-side sessions for:
   - Better revocation control?
   - Storing user preferences?
   - Tracking active devices?

## CORS Configuration
1. **Allowed Origins**: Which domains should be whitelisted? Currently allowing all in development.

2. **Credentials**: Should CORS allow credentials for all origins or specific ones only?

## Monitoring
1. **Metrics Collection**: Which metrics are most important for frontend dashboards?
   - Request latency?
   - Error rates?
   - Active users?
   - WebSocket connections?

2. **Log Aggregation**: Should logs be sent to:
   - ELK stack?
   - CloudWatch?
   - Custom solution?

## API Versioning
1. **Deprecation Strategy**: How should we handle API version deprecation?

2. **Version Header**: Should API version be in URL (/api/v1) or header (Accept: application/vnd.api+json;version=1)?

## Caching Strategy
1. **Cache Headers**: What cache-control headers does frontend expect?

2. **CDN Integration**: Will there be a CDN in front of API Gateway?

## Security
1. **CSP Headers**: What Content Security Policy does frontend need?

2. **Authentication Providers**: Besides Google/GitHub OAuth, what other providers are planned?

3. **API Keys**: Should we support API key authentication for programmatic access?

## Performance
1. **Response Compression**: Should responses be compressed (gzip/brotli)?

2. **Pagination Defaults**: What are appropriate page size limits?

## Deployment
1. **Environment Detection**: How should service detect environment (dev/staging/prod)?

2. **Health Check Requirements**: What health check format do load balancers expect?

---

*These questions need answers from frontend team and product requirements before full implementation.*