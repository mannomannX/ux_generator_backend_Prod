// ==========================================
// SERVICES/COGNITIVE-CORE/src/middleware/service-mesh.js
// ==========================================

import crypto from 'crypto';

/**
 * ServiceMesh manages inter-service communication with service discovery,
 * load balancing, circuit breaking, and distributed tracing
 */
class ServiceMesh {
  constructor(logger, redisClient, config = {}) {
    this.logger = logger;
    this.redisClient = redisClient;
    
    this.config = {
      serviceName: config.serviceName || 'cognitive-core',
      serviceVersion: config.serviceVersion || '2.0.0',
      servicePort: config.servicePort || 3001,
      healthCheckInterval: config.healthCheckInterval || 30000, // 30s
      serviceTimeout: config.serviceTimeout || 10000, // 10s
      maxRetries: config.maxRetries || 3,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000, // 1min
      loadBalancingStrategy: config.loadBalancingStrategy || 'round_robin',
      enableTracing: config.enableTracing !== false,
      enableMetrics: config.enableMetrics !== false
    };

    // Service registry cache
    this.serviceRegistry = new Map();
    
    // Circuit breakers for each service
    this.circuitBreakers = new Map();
    
    // Load balancer state
    this.loadBalancerState = new Map();
    
    // Request tracing
    this.activeTraces = new Map();
    
    // Metrics collection
    this.metrics = {
      requestsSent: 0,
      requestsReceived: 0,
      requestsSuccessful: 0,
      requestsFailed: 0,
      averageLatency: 0,
      circuitBreakerTrips: 0
    };

    // Start service registration and health checks
    this.startServiceRegistration();
    this.startHealthChecking();

    this.logger.info('ServiceMesh initialized', {
      serviceName: this.config.serviceName,
      serviceVersion: this.config.serviceVersion,
      loadBalancing: this.config.loadBalancingStrategy,
      tracingEnabled: this.config.enableTracing
    });
  }

  /**
   * Register this service in the service registry
   */
  async registerService() {
    const serviceInfo = {
      name: this.config.serviceName,
      version: this.config.serviceVersion,
      port: this.config.servicePort,
      host: process.env.SERVICE_HOST || 'localhost',
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      status: 'healthy',
      capabilities: [
        'ai-orchestration',
        'multi-agent-processing',
        'conversation-management',
        'multi-provider-ai'
      ],
      endpoints: [
        '/health',
        '/agents',
        '/providers',
        '/metrics'
      ],
      metadata: {
        nodeId: process.env.HOSTNAME || crypto.randomBytes(8).toString('hex'),
        processId: process.pid,
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage()
      }
    };

    const serviceKey = `service:${this.config.serviceName}:${serviceInfo.metadata.nodeId}`;
    
    try {
      await this.redisClient.set(
        serviceKey,
        serviceInfo,
        120 // 2 minutes TTL
      );

      // Add to service list
      await this.redisClient.sadd(
        `services:${this.config.serviceName}`,
        serviceInfo.metadata.nodeId
      );

      this.logger.debug('Service registered', {
        serviceKey,
        nodeId: serviceInfo.metadata.nodeId
      });

    } catch (error) {
      this.logger.error('Failed to register service', error);
    }
  }

  /**
   * Discover available instances of a service
   */
  async discoverService(serviceName) {
    try {
      // Get list of service instances
      const instances = await this.redisClient.smembers(`services:${serviceName}`);
      
      if (instances.length === 0) {
        throw new Error(`No instances found for service: ${serviceName}`);
      }

      // Get details for each instance
      const serviceInstances = [];
      for (const nodeId of instances) {
        const serviceKey = `service:${serviceName}:${nodeId}`;
        const serviceInfo = await this.redisClient.get(serviceKey);
        
        if (serviceInfo && serviceInfo.status === 'healthy') {
          serviceInstances.push(serviceInfo);
        }
      }

      // Cache the discovery result
      this.serviceRegistry.set(serviceName, {
        instances: serviceInstances,
        lastDiscovered: new Date(),
        ttl: 60000 // 1 minute
      });

      this.logger.debug('Service discovered', {
        serviceName,
        instanceCount: serviceInstances.length
      });

      return serviceInstances;

    } catch (error) {
      this.logger.error('Service discovery failed', error, {
        serviceName
      });

      // Return cached result if available
      const cached = this.serviceRegistry.get(serviceName);
      if (cached && Date.now() - cached.lastDiscovered < cached.ttl) {
        return cached.instances;
      }

      throw error;
    }
  }

  /**
   * Make request to another service with circuit breaking and retries
   */
  async callService(serviceName, endpoint, options = {}) {
    const traceId = crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();

    try {
      // Start distributed trace
      if (this.config.enableTracing) {
        this.startTrace(traceId, serviceName, endpoint, options);
      }

      // Check circuit breaker
      if (this.isCircuitBreakerOpen(serviceName)) {
        throw new Error(`Circuit breaker open for service: ${serviceName}`);
      }

      // Discover service instances
      const instances = await this.discoverService(serviceName);
      if (instances.length === 0) {
        throw new Error(`No healthy instances found for service: ${serviceName}`);
      }

      // Select instance using load balancing
      const selectedInstance = this.selectInstance(serviceName, instances);
      
      // Make the actual request
      const response = await this.makeRequest(selectedInstance, endpoint, options);
      
      // Update metrics
      this.updateMetrics('success', Date.now() - startTime);
      
      // Record successful request for circuit breaker
      this.recordCircuitBreakerSuccess(serviceName);
      
      // Complete trace
      if (this.config.enableTracing) {
        this.completeTrace(traceId, 'success', response);
      }

      this.logger.debug('Service call successful', {
        serviceName,
        endpoint,
        traceId,
        duration: Date.now() - startTime,
        instance: selectedInstance.metadata.nodeId
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics('failure', duration);
      
      // Record failure for circuit breaker
      this.recordCircuitBreakerFailure(serviceName);
      
      // Complete trace with error
      if (this.config.enableTracing) {
        this.completeTrace(traceId, 'error', error);
      }

      this.logger.error('Service call failed', error, {
        serviceName,
        endpoint,
        traceId,
        duration,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Make HTTP request to service instance
   */
  async makeRequest(instance, endpoint, options = {}) {
    const url = `http://${instance.host}:${instance.port}${endpoint}`;
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': this.config.serviceName,
        'X-Service-Version': this.config.serviceVersion,
        'X-Correlation-ID': options.correlationId || crypto.randomBytes(8).toString('hex'),
        ...options.headers
      },
      timeout: this.config.serviceTimeout,
      ...options
    };

    if (options.data) {
      requestOptions.body = JSON.stringify(options.data);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.serviceTimeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }

      return await response.text();

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * Select service instance using load balancing strategy
   */
  selectInstance(serviceName, instances) {
    if (instances.length === 1) {
      return instances[0];
    }

    let state = this.loadBalancerState.get(serviceName);
    if (!state) {
      state = { roundRobinIndex: 0, requestCounts: new Map() };
      this.loadBalancerState.set(serviceName, state);
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round_robin':
        const index = state.roundRobinIndex % instances.length;
        state.roundRobinIndex++;
        return instances[index];

      case 'least_connections':
        // Find instance with least requests
        let selectedInstance = instances[0];
        let minRequests = state.requestCounts.get(selectedInstance.metadata.nodeId) || 0;
        
        for (const instance of instances) {
          const requests = state.requestCounts.get(instance.metadata.nodeId) || 0;
          if (requests < minRequests) {
            minRequests = requests;
            selectedInstance = instance;
          }
        }
        
        // Increment request count
        state.requestCounts.set(
          selectedInstance.metadata.nodeId,
          (state.requestCounts.get(selectedInstance.metadata.nodeId) || 0) + 1
        );
        
        return selectedInstance;

      case 'random':
        return instances[Math.floor(Math.random() * instances.length)];

      default:
        return instances[0];
    }
  }

  /**
   * Check if circuit breaker is open for a service
   */
  isCircuitBreakerOpen(serviceName) {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!circuitBreaker) {
      return false;
    }

    if (circuitBreaker.state === 'open') {
      // Check if timeout has passed to try half-open state
      if (Date.now() - circuitBreaker.lastFailure > this.config.circuitBreakerTimeout) {
        circuitBreaker.state = 'half_open';
        this.logger.info('Circuit breaker moved to half-open', { serviceName });
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record successful request for circuit breaker
   */
  recordCircuitBreakerSuccess(serviceName) {
    let circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailure: null
      };
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    circuitBreaker.successCount++;
    
    if (circuitBreaker.state === 'half_open' && circuitBreaker.successCount >= 3) {
      circuitBreaker.state = 'closed';
      circuitBreaker.failureCount = 0;
      this.logger.info('Circuit breaker closed', { serviceName });
    }
  }

  /**
   * Record failed request for circuit breaker
   */
  recordCircuitBreakerFailure(serviceName) {
    let circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailure: null
      };
      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    circuitBreaker.failureCount++;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
      circuitBreaker.state = 'open';
      this.metrics.circuitBreakerTrips++;
      this.logger.warn('Circuit breaker opened', {
        serviceName,
        failureCount: circuitBreaker.failureCount
      });
    }
  }

  /**
   * Start distributed trace
   */
  startTrace(traceId, serviceName, endpoint, options) {
    const trace = {
      traceId,
      serviceName,
      endpoint,
      startTime: new Date(),
      options: {
        method: options.method || 'GET',
        correlationId: options.correlationId
      }
    };

    this.activeTraces.set(traceId, trace);
  }

  /**
   * Complete distributed trace
   */
  completeTrace(traceId, status, result) {
    const trace = this.activeTraces.get(traceId);
    
    if (trace) {
      trace.endTime = new Date();
      trace.duration = trace.endTime - trace.startTime;
      trace.status = status;
      trace.resultSize = JSON.stringify(result).length;

      // Log trace completion
      this.logger.debug('Trace completed', {
        traceId,
        serviceName: trace.serviceName,
        endpoint: trace.endpoint,
        duration: trace.duration,
        status
      });

      this.activeTraces.delete(traceId);
    }
  }

  /**
   * Update service mesh metrics
   */
  updateMetrics(type, latency) {
    if (type === 'success') {
      this.metrics.requestsSuccessful++;
    } else {
      this.metrics.requestsFailed++;
    }

    this.metrics.requestsSent++;
    
    // Update average latency (exponential moving average)
    this.metrics.averageLatency = this.metrics.averageLatency * 0.9 + latency * 0.1;
  }

  /**
   * Get service mesh health status
   */
  getHealthStatus() {
    const totalRequests = this.metrics.requestsSent;
    const successRate = totalRequests > 0 
      ? (this.metrics.requestsSuccessful / totalRequests) 
      : 1;

    return {
      status: successRate > 0.95 ? 'healthy' : 'degraded',
      metrics: {
        ...this.metrics,
        successRate: Math.round(successRate * 10000) / 100, // Percentage with 2 decimals
        averageLatency: Math.round(this.metrics.averageLatency)
      },
      serviceRegistry: {
        registeredServices: this.serviceRegistry.size,
        services: Array.from(this.serviceRegistry.keys())
      },
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([service, cb]) => ({
        service,
        state: cb.state,
        failures: cb.failureCount
      })),
      activeTraces: this.activeTraces.size,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Start service registration process
   */
  startServiceRegistration() {
    // Register immediately
    this.registerService();

    // Re-register periodically to maintain TTL
    this.registrationInterval = setInterval(() => {
      this.registerService();
    }, this.config.healthCheckInterval);
  }

  /**
   * Start health checking process
   */
  startHealthChecking() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        // Clean up stale service instances
        await this.cleanupStaleServices();
        
        // Reset circuit breaker metrics periodically
        this.resetCircuitBreakerMetrics();
        
      } catch (error) {
        this.logger.error('Health check process failed', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Clean up stale service instances from registry
   */
  async cleanupStaleServices() {
    for (const [serviceName, registry] of this.serviceRegistry.entries()) {
      // If cached data is old, refresh from Redis
      if (Date.now() - registry.lastDiscovered > registry.ttl) {
        try {
          await this.discoverService(serviceName);
        } catch (error) {
          // Remove from cache if discovery fails
          this.serviceRegistry.delete(serviceName);
        }
      }
    }
  }

  /**
   * Reset circuit breaker metrics to prevent permanent failures
   */
  resetCircuitBreakerMetrics() {
    for (const [serviceName, circuitBreaker] of this.circuitBreakers.entries()) {
      // Reset failure counts for closed circuits periodically
      if (circuitBreaker.state === 'closed' && circuitBreaker.successCount > 10) {
        circuitBreaker.failureCount = Math.max(0, circuitBreaker.failureCount - 1);
        circuitBreaker.successCount = 0;
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('ServiceMesh shutting down...');

    // Clear intervals
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Deregister service
    try {
      const nodeId = process.env.HOSTNAME || 'unknown';
      await this.redisClient.srem(`services:${this.config.serviceName}`, nodeId);
      await this.redisClient.del(`service:${this.config.serviceName}:${nodeId}`);
    } catch (error) {
      this.logger.warn('Failed to deregister service', error);
    }

    this.logger.info('ServiceMesh shutdown completed', {
      totalRequestsSent: this.metrics.requestsSent,
      successRate: this.metrics.requestsSuccessful / (this.metrics.requestsSent || 1)
    });
  }
}

export { ServiceMesh };