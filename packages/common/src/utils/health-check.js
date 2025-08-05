// ==========================================
// PACKAGES/COMMON/src/utils/health-check.js
// ==========================================
class HealthCheck {
  constructor(serviceName, logger) {
    this.serviceName = serviceName;
    this.logger = logger;
    this.dependencies = new Map();
    this.startTime = Date.now();
  }

  // Register a dependency with health check function
  addDependency(name, healthCheckFn) {
    this.dependencies.set(name, healthCheckFn);
  }

  // Check health of all dependencies
  async checkHealth() {
    const results = {
      service: this.serviceName,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      dependencies: {},
    };

    for (const [name, checkFn] of this.dependencies) {
      try {
        const depHealth = await checkFn();
        results.dependencies[name] = depHealth.status || 'ok';
        
        if (depHealth.status === 'error') {
          results.status = 'degraded';
        }
      } catch (error) {
        this.logger.error(`Health check failed for dependency: ${name}`, error);
        results.dependencies[name] = 'error';
        results.status = 'degraded';
      }
    }

    return results;
  }

  // Express middleware for health endpoint
  middleware() {
    return async (req, res) => {
      try {
        const health = await this.checkHealth();
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        this.logger.error('Health check endpoint failed', error);
        res.status(500).json({
          service: this.serviceName,
          status: 'error',
          error: error.message,
        });
      }
    };
  }
}

export { HealthCheck };