# Troubleshooting Guide

## Common Issues and Solutions

### 🔴 Services Won't Start

#### MongoDB Connection Failed
```bash
Error: MongoNetworkError: failed to connect to server
```
**Solution:**
1. Verify MongoDB is running: `docker ps | grep mongo`
2. Check connection string in `.env`
3. Ensure MongoDB replica set is initialized:
   ```bash
   docker exec -it mongodb mongosh
   rs.initiate()
   ```

#### Redis Connection Refused
```bash
Error: Redis connection to localhost:6379 failed
```
**Solution:**
1. Start Redis: `docker run -d -p 6379:6379 redis`
2. Check Redis password in configuration
3. Test connection: `redis-cli ping`

#### Port Already in Use
```bash
Error: EADDRINUSE: address already in use :::3000
```
**Solution:**
1. Find process: `lsof -i :3000` (Linux/Mac) or `netstat -ano | findstr :3000` (Windows)
2. Kill process or change port in `.env`

### 🟡 Performance Issues

#### High Memory Usage
**Symptoms:** Services consuming >1GB RAM
**Solution:**
1. Check for memory leaks: `npm run test:memory`
2. Adjust Node.js heap size: `NODE_OPTIONS="--max-old-space-size=512"`
3. Enable memory limits in Docker:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
   ```

#### Slow AI Responses
**Symptoms:** AI requests taking >10 seconds
**Solution:**
1. Check AI provider API limits
2. Implement response caching
3. Enable request queuing
4. Monitor with: `kubectl top pods`

#### Database Query Timeouts
**Symptoms:** MongoDB operations timing out
**Solution:**
1. Add indexes: `db.collection.createIndex({field: 1})`
2. Increase connection pool size
3. Enable query profiling:
   ```javascript
   db.setProfilingLevel(1, { slowms: 100 })
   ```

### 🔵 Authentication Problems

#### JWT Token Invalid
```bash
Error: JsonWebTokenError: invalid signature
```
**Solution:**
1. Verify JWT secret matches across services
2. Check token expiration
3. Regenerate tokens: `npm run auth:refresh`

#### OAuth Login Fails
**Solution:**
1. Verify OAuth credentials in `.env`
2. Check redirect URLs match configuration
3. Ensure HTTPS in production

### 🟢 Deployment Issues

#### Kubernetes Pods Crashing
```bash
kubectl get pods
NAME                          READY   STATUS    RESTARTS   AGE
api-gateway-xxx              0/1     CrashLoopBackOff   5          10m
```
**Solution:**
1. Check logs: `kubectl logs pod-name`
2. Verify environment variables: `kubectl describe pod pod-name`
3. Check resource limits
4. Review health checks

#### Helm Installation Fails
```bash
Error: unable to build kubernetes objects
```
**Solution:**
1. Validate values: `helm lint ./helm/ux-flow-engine`
2. Dry run: `helm install --dry-run --debug`
3. Check namespace exists: `kubectl create namespace ux-flow-engine`

### 🟣 Data Issues

#### ChromaDB Not Returning Results
**Solution:**
1. Verify embeddings are created
2. Check collection exists: `chromadb.list_collections()`
3. Rebuild index: `npm run knowledge:reindex`

#### Missing User Data After Migration
**Solution:**
1. Check migration logs
2. Verify backup exists
3. Run data validation: `npm run validate:data`

### ⚡ Quick Diagnostics

#### Health Check All Services
```bash
npm run health:check
```

#### View Service Logs
```bash
# Docker
docker-compose logs -f service-name

# Kubernetes
kubectl logs -f deployment/service-name
```

#### Check Service Status
```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

#### Database Diagnostics
```bash
# MongoDB
mongosh --eval "db.adminCommand('ping')"

# Redis
redis-cli ping

# ChromaDB
curl http://localhost:8000/api/v1/heartbeat
```

### 📊 Monitoring Commands

#### Resource Usage
```bash
# Docker
docker stats

# Kubernetes
kubectl top nodes
kubectl top pods
```

#### Network Diagnostics
```bash
# Test internal connectivity
kubectl exec -it pod-name -- nslookup service-name
kubectl exec -it pod-name -- curl http://service-name:port/health
```

#### Log Aggregation
```bash
# View all logs
kubectl logs -l app=ux-flow-engine --all-containers=true

# Stream logs
kubectl logs -f deployment/api-gateway
```

### 🆘 Emergency Procedures

#### Service Recovery
1. **Restart services:**
   ```bash
   kubectl rollout restart deployment/api-gateway
   ```

2. **Scale down/up:**
   ```bash
   kubectl scale deployment/cognitive-core --replicas=0
   kubectl scale deployment/cognitive-core --replicas=2
   ```

3. **Emergency rollback:**
   ```bash
   helm rollback ux-flow-engine
   ```

#### Data Recovery
1. **Restore from backup:**
   ```bash
   npm run restore:backup --date=2024-12-01
   ```

2. **Export critical data:**
   ```bash
   npm run export:data --service=all
   ```

### 📞 Support Escalation

If issues persist:

1. **Level 1:** Check documentation and logs
2. **Level 2:** Post in #tech-support Slack channel
3. **Level 3:** Email: support@ux-flow-engine.com
4. **Emergency:** On-call engineer via PagerDuty

### 🔍 Debug Mode

Enable debug logging:
```bash
# Environment variable
export DEBUG=ux-flow:*

# In .env file
LOG_LEVEL=debug

# For specific service
DEBUG=ux-flow:cognitive-core npm start
```

### 📚 Additional Resources

- [System Architecture](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API_REFERENCE.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Performance Tuning](./PERFORMANCE_ESTIMATIONS.md)

---

*For issues not covered here, please check the [GitHub Issues](https://github.com/ux-flow-engine/backend/issues) or contact support.*