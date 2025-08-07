// ==========================================
// API GATEWAY - Gateway Manager Service
// ==========================================

import { Logger } from '@ux-flow/common';
import { CircuitBreaker } from '../utils/circuit-breaker.js';

export class GatewayManager {
  constructor(logger, redisClient, config) {
    this.logger = logger || new Logger('gateway-manager');
    this.redisClient = redisClient;
    this.config = config;
    
    // Service registry
    this.services = new Map();
    this.circuitBreakers = new Map();
    
    // Initialize services
    this.initializeServices();
  }

  initializeServices() {
    // Service definitions
    const services = [
      {
        name: 'user-management',
        url: process.env.USER_SERVICE_URL || 'http://localhost:3001',
        healthEndpoint: '/health',
        timeout: 5000
      },
      {
        name: 'cognitive-core',
        url: process.env.COGNITIVE_SERVICE_URL || 'http://localhost:3002',
        healthEndpoint: '/health',
        timeout: 30000 // Longer timeout for AI operations
      },
      {
        name: 'flow-service',
        url: process.env.FLOW_SERVICE_URL || 'http://localhost:3003',
        healthEndpoint: '/health',
        timeout: 5000
      },
      {
        name: 'billing-service',
        url: process.env.BILLING_SERVICE_URL || 'http://localhost:3005',
        healthEndpoint: '/health',
        timeout: 5000
      },
      {
        name: 'knowledge-service',
        url: process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3004',
        healthEndpoint: '/health',
        timeout: 10000
      }
    ];

    // Register services with circuit breakers
    for (const service of services) {
      this.registerService(service);
    }
  }

  registerService(serviceConfig) {
    const { name, url, healthEndpoint, timeout } = serviceConfig;
    
    // Store service configuration
    this.services.set(name, {
      ...serviceConfig,
      status: 'unknown',
      lastHealthCheck: null
    });

    // Create circuit breaker for service
    const circuitBreaker = new CircuitBreaker({
      name,
      timeout,
      errorThreshold: 0.5,
      resetTimeout: 30000,
      logger: this.logger
    });

    this.circuitBreakers.set(name, circuitBreaker);
    
    this.logger.info(`Service registered: ${name}`, { url, timeout });
  }

  async routeRequest(serviceName, path, options = {}) {
    const service = this.services.get(serviceName);
    
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }

    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    try {
      // Use circuit breaker for request
      const response = await circuitBreaker.execute(async () => {
        const url = `${service.url}${path}`;
        
        const requestOptions = {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          timeout: service.timeout,
          ...options
        };

        // Make request to service
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(url, requestOptions);
        
        if (!res.ok) {
          const error = new Error(`Service responded with ${res.status}`);
          error.status = res.status;
          throw error;
        }

        return res.json();
      });

      // Update service status
      this.updateServiceStatus(serviceName, 'healthy');
      
      return response;
    } catch (error) {
      // Update service status
      this.updateServiceStatus(serviceName, 'unhealthy');
      
      // Log error
      this.logger.error(`Request to ${serviceName} failed`, {
        error: error.message,
        path,
        circuitState: circuitBreaker.getState()
      });

      throw error;
    }
  }

  async healthCheck(serviceName = null) {
    if (serviceName) {
      return this.checkServiceHealth(serviceName);
    }

    // Check all services
    const healthStatuses = {};
    
    for (const [name] of this.services) {
      healthStatuses[name] = await this.checkServiceHealth(name);
    }

    return healthStatuses;
  }

  async checkServiceHealth(serviceName) {
    const service = this.services.get(serviceName);
    
    if (!service) {
      return { status: 'unknown', error: 'Service not registered' };
    }

    try {
      const fetch = (await import('node-fetch')).default;
      const url = `${service.url}${service.healthEndpoint}`;
      
      const response = await fetch(url, {
        timeout: 2000,
        method: 'GET'
      });

      const isHealthy = response.ok;
      
      this.updateServiceStatus(serviceName, isHealthy ? 'healthy' : 'unhealthy');
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      this.updateServiceStatus(serviceName, 'unreachable');
      
      return {
        status: 'unreachable',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  updateServiceStatus(serviceName, status) {
    const service = this.services.get(serviceName);
    
    if (service) {
      service.status = status;
      service.lastHealthCheck = new Date();
      
      // Store in Redis for distributed state
      if (this.redisClient) {
        const key = `service:status:${serviceName}`;
        const data = JSON.stringify({
          status,
          lastCheck: service.lastHealthCheck
        });
        
        this.redisClient.set(key, data, 'EX', 60).catch(err => {
          this.logger.error('Failed to update service status in Redis', err);
        });
      }
    }
  }

  getServiceStatus(serviceName) {
    const service = this.services.get(serviceName);
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!service) {
      return null;
    }

    return {
      name: serviceName,
      url: service.url,
      status: service.status,
      lastHealthCheck: service.lastHealthCheck,
      circuitState: circuitBreaker ? circuitBreaker.getState() : 'unknown'
    };
  }

  getAllServiceStatuses() {
    const statuses = {};
    
    for (const [name] of this.services) {
      statuses[name] = this.getServiceStatus(name);
    }

    return statuses;
  }

  async startHealthMonitoring(intervalMs = 30000) {
    // Initial health check
    await this.healthCheck();
    
    // Periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      await this.healthCheck();
    }, intervalMs);
    
    this.logger.info('Health monitoring started', { interval: intervalMs });
  }

  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health monitoring stopped');
    }
  }

  // Get metrics for monitoring
  getMetrics() {
    const metrics = {
      services: {},
      circuitBreakers: {}
    };

    // Service metrics
    for (const [name, service] of this.services) {
      metrics.services[name] = {
        status: service.status,
        lastHealthCheck: service.lastHealthCheck
      };
    }

    // Circuit breaker metrics
    for (const [name, cb] of this.circuitBreakers) {
      metrics.circuitBreakers[name] = cb.getMetrics();
    }

    return metrics;
  }

  // Graceful shutdown
  async shutdown() {
    this.stopHealthMonitoring();
    
    // Close circuit breakers
    for (const [name, cb] of this.circuitBreakers) {
      cb.reset();
    }
    
    this.logger.info('Gateway manager shut down');
  }
}

export default GatewayManager;