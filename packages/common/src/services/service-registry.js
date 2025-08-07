// ==========================================
// Service Registry - Service Discovery and Health Monitoring
// ==========================================

import axios from 'axios';

export class ServiceRegistry {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.services = new Map();
    this.healthCheckInterval = null;
    this.registryKey = 'service:registry';
    this.healthKey = 'service:health';
  }

  async initialize() {
    try {
      // Load existing service registrations from Redis
      await this.loadFromRedis();
      
      // Start health check monitoring
      this.startHealthMonitoring();
      
      this.logger.info('Service Registry initialized', {
        services: Array.from(this.services.keys())
      });
    } catch (error) {
      this.logger.error('Failed to initialize Service Registry', error);
      throw error;
    }
  }

  async register(serviceConfig) {
    const {
      name,
      host = 'localhost',
      port,
      version = '1.0.0',
      endpoints = [],
      metadata = {},
      healthEndpoint = '/health'
    } = serviceConfig;

    const serviceId = `${name}-${host}-${port}`;
    const baseUrl = `http://${host}:${port}`;

    const service = {
      id: serviceId,
      name,
      host,
      port,
      baseUrl,
      version,
      endpoints,
      metadata,
      healthEndpoint,
      status: 'unknown',
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    };

    // Store in memory
    this.services.set(serviceId, service);

    // Store in Redis for persistence
    await this.saveToRedis(serviceId, service);

    // Perform initial health check
    await this.checkServiceHealth(serviceId);

    this.logger.info('Service registered', {
      serviceId,
      name,
      baseUrl
    });

    return service;
  }

  async deregister(serviceId) {
    try {
      this.services.delete(serviceId);
      await this.redisClient.hdel(this.registryKey, serviceId);
      
      this.logger.info('Service deregistered', { serviceId });
      return true;
    } catch (error) {
      this.logger.error('Failed to deregister service', error);
      throw error;
    }
  }

  async discover(serviceName, options = {}) {
    const {
      requireHealthy = true,
      preferredVersion = null,
      loadBalance = 'round-robin'
    } = options;

    const availableServices = [];

    for (const [id, service] of this.services) {
      if (service.name === serviceName) {
        if (requireHealthy && service.status !== 'healthy') {
          continue;
        }
        
        if (preferredVersion && service.version !== preferredVersion) {
          continue;
        }

        availableServices.push(service);
      }
    }

    if (availableServices.length === 0) {
      throw new Error(`No available services found for: ${serviceName}`);
    }

    // Apply load balancing strategy
    return this.selectService(availableServices, loadBalance);
  }

  selectService(services, strategy) {
    switch (strategy) {
      case 'random':
        return services[Math.floor(Math.random() * services.length)];
      
      case 'round-robin':
        // Simple round-robin using timestamp
        const index = Date.now() % services.length;
        return services[index];
      
      case 'first':
      default:
        return services[0];
    }
  }

  async callService(serviceName, endpoint, options = {}) {
    try {
      const service = await this.discover(serviceName);
      
      const {
        method = 'GET',
        data = null,
        headers = {},
        timeout = 30000,
        retries = 3
      } = options;

      const url = `${service.baseUrl}${endpoint}`;

      const config = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': serviceName,
          'X-Request-ID': this.generateRequestId(),
          ...headers
        },
        timeout,
        ...(data && { data })
      };

      let lastError;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await axios(config);
          
          // Update service metrics
          await this.updateServiceMetrics(service.id, {
            requestCount: 1,
            successCount: 1,
            lastRequestAt: new Date().toISOString()
          });

          return response.data;
        } catch (error) {
          lastError = error;
          
          if (attempt < retries) {
            this.logger.warn(`Service call failed, retrying...`, {
              serviceName,
              endpoint,
              attempt,
              error: error.message
            });
            
            // Exponential backoff
            await new Promise(resolve => 
              setTimeout(resolve, Math.pow(2, attempt) * 1000)
            );
          }
        }
      }

      // Update failure metrics
      await this.updateServiceMetrics(service.id, {
        requestCount: 1,
        errorCount: 1,
        lastErrorAt: new Date().toISOString()
      });

      throw lastError;
    } catch (error) {
      this.logger.error('Service call failed', error, {
        serviceName,
        endpoint
      });
      throw error;
    }
  }

  async checkServiceHealth(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return false;

    try {
      const response = await axios.get(
        `${service.baseUrl}${service.healthEndpoint}`,
        { timeout: 5000 }
      );

      const isHealthy = response.status === 200 && 
                       response.data?.status === 'healthy';

      service.status = isHealthy ? 'healthy' : 'unhealthy';
      service.lastHeartbeat = new Date().toISOString();
      service.healthDetails = response.data;

      // Update in Redis
      await this.saveToRedis(serviceId, service);

      return isHealthy;
    } catch (error) {
      service.status = 'unhealthy';
      service.lastError = error.message;
      service.lastErrorAt = new Date().toISOString();

      await this.saveToRedis(serviceId, service);

      this.logger.warn('Service health check failed', {
        serviceId,
        error: error.message
      });

      return false;
    }
  }

  startHealthMonitoring(intervalMs = 30000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const serviceId of this.services.keys()) {
        await this.checkServiceHealth(serviceId);
      }
    }, intervalMs);

    this.logger.info('Health monitoring started', {
      interval: intervalMs,
      services: this.services.size
    });
  }

  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Health monitoring stopped');
    }
  }

  async loadFromRedis() {
    try {
      const data = await this.redisClient.hgetall(this.registryKey);
      
      for (const [serviceId, serviceData] of Object.entries(data)) {
        try {
          const service = JSON.parse(serviceData);
          this.services.set(serviceId, service);
        } catch (error) {
          this.logger.error('Failed to parse service data', error, {
            serviceId
          });
        }
      }

      this.logger.info('Loaded services from Redis', {
        count: this.services.size
      });
    } catch (error) {
      this.logger.error('Failed to load services from Redis', error);
    }
  }

  async saveToRedis(serviceId, service) {
    try {
      await this.redisClient.hset(
        this.registryKey,
        serviceId,
        JSON.stringify(service)
      );
    } catch (error) {
      this.logger.error('Failed to save service to Redis', error);
    }
  }

  async updateServiceMetrics(serviceId, metrics) {
    try {
      const key = `service:metrics:${serviceId}`;
      
      for (const [metric, value] of Object.entries(metrics)) {
        if (typeof value === 'number') {
          await this.redisClient.hincrby(key, metric, value);
        } else {
          await this.redisClient.hset(key, metric, value);
        }
      }

      // Expire metrics after 24 hours
      await this.redisClient.expire(key, 86400);
    } catch (error) {
      this.logger.error('Failed to update service metrics', error);
    }
  }

  async getServiceMetrics(serviceId) {
    try {
      const key = `service:metrics:${serviceId}`;
      return await this.redisClient.hgetall(key);
    } catch (error) {
      this.logger.error('Failed to get service metrics', error);
      return {};
    }
  }

  getService(serviceId) {
    return this.services.get(serviceId);
  }

  getServicesByName(serviceName) {
    const services = [];
    for (const [id, service] of this.services) {
      if (service.name === serviceName) {
        services.push(service);
      }
    }
    return services;
  }

  getAllServices() {
    return Array.from(this.services.values());
  }

  getHealthyServices() {
    return this.getAllServices().filter(s => s.status === 'healthy');
  }

  getServiceStatus() {
    const status = {
      total: this.services.size,
      healthy: 0,
      unhealthy: 0,
      unknown: 0
    };

    for (const service of this.services.values()) {
      status[service.status]++;
    }

    return status;
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cleanup() {
    this.stopHealthMonitoring();
    
    // Mark all services as offline
    for (const [serviceId, service] of this.services) {
      service.status = 'offline';
      await this.saveToRedis(serviceId, service);
    }

    this.services.clear();
    this.logger.info('Service Registry cleaned up');
  }
}

// Service configuration constants
export const ServiceNames = {
  API_GATEWAY: 'api-gateway',
  COGNITIVE_CORE: 'cognitive-core',
  FLOW_SERVICE: 'flow-service',
  KNOWLEDGE_SERVICE: 'knowledge-service',
  BILLING_SERVICE: 'billing-service',
  USER_MANAGEMENT: 'user-management'
};

export const ServicePorts = {
  [ServiceNames.API_GATEWAY]: 3000,
  [ServiceNames.COGNITIVE_CORE]: 3001,
  [ServiceNames.FLOW_SERVICE]: 3002,
  [ServiceNames.BILLING_SERVICE]: 3003,
  [ServiceNames.USER_MANAGEMENT]: 3004,
  [ServiceNames.KNOWLEDGE_SERVICE]: 3005
};

// Helper function to create service configuration
export function createServiceConfig(name, options = {}) {
  return {
    name,
    host: options.host || process.env.SERVICE_HOST || 'localhost',
    port: options.port || ServicePorts[name] || 3000,
    version: options.version || process.env.SERVICE_VERSION || '1.0.0',
    healthEndpoint: options.healthEndpoint || '/health',
    endpoints: options.endpoints || [],
    metadata: {
      environment: process.env.NODE_ENV || 'development',
      startedAt: new Date().toISOString(),
      ...options.metadata
    }
  };
}