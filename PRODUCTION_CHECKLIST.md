# 🚀 Production Deployment Checklist

## ✅ Pre-Deployment

### 1. Code Readiness
- [ ] All services build successfully
- [ ] All tests pass (unit + integration)
- [ ] No critical security vulnerabilities
- [ ] Code review completed
- [ ] Documentation updated

### 2. Dependencies
- [ ] Common package built and published
- [ ] All npm dependencies installed
- [ ] Production dependencies only (no dev dependencies)
- [ ] Security audit passed (`npm audit`)

### 3. Environment Configuration
- [ ] `.env.production` configured with real values
- [ ] All API keys set and tested
- [ ] Database credentials secured
- [ ] JWT secrets generated (minimum 32 characters)
- [ ] Stripe keys configured and tested

### 4. Database Setup
- [ ] MongoDB production instance ready
- [ ] Database indexes created
- [ ] Backup strategy configured
- [ ] Connection pooling configured
- [ ] Replica set configured (for high availability)

### 5. Infrastructure
- [ ] Redis instance ready
- [ ] ChromaDB instance ready
- [ ] SSL certificates installed
- [ ] Domain names configured
- [ ] Load balancer configured (if applicable)

## 🔧 Deployment Steps

### Step 1: Prepare Environment
```bash
# Clone repository
git clone https://github.com/your-org/ux-flow-engine.git
cd ux-flow-engine

# Copy production environment file
cp .env.production .env

# Edit .env with production values
nano .env
```

### Step 2: Build Common Package
```bash
# Install and build common package
cd packages/common
npm install
npm run build
cd ../..
```

### Step 3: Install Service Dependencies
```bash
# Install dependencies for all services
npm run services:install
```

### Step 4: Build Docker Images
```bash
# Build all service images
docker-compose build
```

### Step 5: Initialize Database
```bash
# Start only MongoDB first
docker-compose up -d mongodb

# Wait for MongoDB to be ready
sleep 10

# Run database migrations/initialization
docker-compose run --rm api-gateway node scripts/init-db.js
```

### Step 6: Start All Services
```bash
# Start all services
docker-compose up -d

# Check service health
npm run health:check
```

### Step 7: Configure Nginx (Optional)
```bash
# If using Nginx reverse proxy
sudo cp nginx/sites-available/ux-flow-engine /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/ux-flow-engine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8: Setup Monitoring
```bash
# Start monitoring stack (optional)
docker-compose -f docker-compose.monitoring.yml up -d
```

## 🔍 Post-Deployment Verification

### 1. Service Health Checks
```bash
# Check all service health endpoints
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
curl http://localhost:3005/health
```

### 2. Integration Tests
```bash
# Run production smoke tests
npm run test:production
```

### 3. Monitoring Setup
- [ ] Logs aggregation working
- [ ] Metrics collection active
- [ ] Alerts configured
- [ ] Dashboard accessible

### 4. Security Verification
- [ ] HTTPS working
- [ ] CORS configured correctly
- [ ] Rate limiting active
- [ ] Authentication working
- [ ] API keys secured

## 📊 Performance Optimization

### 1. Database
```bash
# Enable MongoDB profiling
docker exec -it ux-flow-mongodb mongosh
> use ux-flow-engine
> db.setProfilingLevel(1, { slowms: 100 })
```

### 2. Redis
```bash
# Configure Redis persistence
docker exec -it ux-flow-redis redis-cli
> CONFIG SET save "900 1 300 10 60 10000"
> CONFIG SET maxmemory 2gb
> CONFIG SET maxmemory-policy allkeys-lru
```

### 3. Application
- Enable compression
- Configure CDN for static assets
- Implement caching strategy
- Optimize database queries

## 🔐 Security Hardening

### 1. Network Security
```bash
# Configure firewall rules
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 2. MongoDB Security
```javascript
// Create application user with limited permissions
use ux-flow-engine
db.createUser({
  user: "app_user",
  pwd: "secure_password",
  roles: [
    { role: "readWrite", db: "ux-flow-engine" }
  ]
})
```

### 3. Environment Variables
```bash
# Secure environment file
chmod 600 .env
chown root:root .env
```

## 🔄 Backup Strategy

### 1. Database Backup
```bash
# Setup automated MongoDB backup
0 2 * * * docker exec ux-flow-mongodb mongodump --out /backup/$(date +\%Y\%m\%d)
```

### 2. Application Backup
```bash
# Backup application data
0 3 * * * tar -czf /backup/app-$(date +\%Y\%m\%d).tar.gz /app/data
```

## 📈 Scaling Considerations

### Horizontal Scaling
- [ ] Services are stateless
- [ ] Session storage in Redis
- [ ] Database connection pooling
- [ ] Load balancer configured

### Vertical Scaling
- [ ] Resource limits configured
- [ ] Memory optimization
- [ ] CPU allocation optimized

## 🚨 Monitoring & Alerts

### Key Metrics to Monitor
- Service uptime
- Response times
- Error rates
- Database performance
- Credit consumption
- Memory usage
- CPU usage

### Alert Thresholds
- Service down > 1 minute
- Response time > 2 seconds
- Error rate > 1%
- Database connection pool > 80%
- Memory usage > 90%
- Disk usage > 80%

## 📝 Maintenance Tasks

### Daily
- [ ] Check service health
- [ ] Review error logs
- [ ] Monitor credit usage

### Weekly
- [ ] Review performance metrics
- [ ] Check backup status
- [ ] Security scan

### Monthly
- [ ] Update dependencies
- [ ] Review and rotate logs
- [ ] Performance optimization
- [ ] Security audit

## 🔥 Rollback Plan

### If deployment fails:
1. Stop new deployment
```bash
docker-compose down
```

2. Restore previous version
```bash
git checkout previous-tag
docker-compose build
docker-compose up -d
```

3. Restore database if needed
```bash
docker exec -it ux-flow-mongodb mongorestore /backup/latest
```

## 📞 Support Contacts

- **DevOps Team**: devops@company.com
- **On-Call Engineer**: +1-xxx-xxx-xxxx
- **Escalation**: manager@company.com

## 📚 Documentation

- [API Documentation](/docs/api)
- [Architecture Overview](/docs/architecture)
- [Troubleshooting Guide](/docs/troubleshooting)
- [Security Guidelines](/docs/security)

---

**Last Updated**: December 2024
**Version**: 1.0.0