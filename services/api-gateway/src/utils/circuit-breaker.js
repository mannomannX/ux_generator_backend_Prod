// ==========================================
// SERVICES/API-GATEWAY/src/middleware/circuit-breaker.js
// ==========================================

import CircuitBreaker from 'opossum';
import axios from 'axios';
import config from '../config/index.js';

// Circuit breaker states
const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

// Store circuit breakers for each service
const circuitBreakers = new Map();

// Default circuit breaker options
const defaultOptions = {
  timeout: config.circuitBreaker.timeout || 3000,
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage || 50,
  resetTimeout: config.circuitBreaker.resetTimeout || 30000,
  volumeThreshold: config.circuitBreaker.volumeThreshold || 10,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  name: 'default',
  enabled: config.circuitBreaker.enabled !== false
};

// Create or get circuit breaker for a service
export const getCircuitBreaker = (serviceName, options = {}) => {
  if (circuitBreakers.has(serviceName)) {
    return circuitBreakers.get(serviceName);
  }

  const breakerOptions = {
    ...defaultOptions,
    ...options,
    name: serviceName
  };

  // Create the circuit breaker function
  const serviceCall = async (requestOptions) => {
    try {
      const response = await axios({
        ...requestOptions,
        timeout: breakerOptions.timeout,
        validateStatus: (status) => status < 500 // Don't trip on client errors
      });
      return response;
    } catch (error) {
      // Enhance error with service context
      error.service = serviceName;
      error.timestamp = new Date().toISOString();
      throw error;
    }
  };

  // Create circuit breaker
  const breaker = new CircuitBreaker(serviceCall, breakerOptions);

  // Add event listeners
  setupEventListeners(breaker, serviceName);

  // Add statistics tracking
  breaker.stats = {
    requests: 0,
    failures: 0,
    successes: 0,
    timeouts: 0,
    fallbacks: 0,
    cacheHits: 0,
    semaphoreRejections: 0,
    percentileLatency: {},
    state: STATES.CLOSED,
    lastStateChange: new Date()
  };

  // Store the circuit breaker
  circuitBreakers.set(serviceName, breaker);

  return breaker;
};

// Setup event listeners for monitoring
const setupEventListeners = (breaker, serviceName) => {
  // Circuit opened
  breaker.on('open', () => {
    console.error(`[Circuit Breaker] ${serviceName} circuit opened`);
    breaker.stats.state = STATES.OPEN;
    breaker.stats.lastStateChange = new Date();
    
    // Send alert
    sendAlert({
      level: 'error',
      service: serviceName,
      message: `Circuit breaker opened for ${serviceName}`,
      state: STATES.OPEN,
      stats: breaker.stats
    });
  });

  // Circuit half-opened
  breaker.on('halfOpen', () => {
    console.warn(`[Circuit Breaker] ${serviceName} circuit half-opened`);
    breaker.stats.state = STATES.HALF_OPEN;
    breaker.stats.lastStateChange = new Date();
  });

  // Circuit closed
  breaker.on('close', () => {
    console.info(`[Circuit Breaker] ${serviceName} circuit closed`);
    breaker.stats.state = STATES.CLOSED;
    breaker.stats.lastStateChange = new Date();
  });

  // Request success
  breaker.on('success', (result, latency) => {
    breaker.stats.requests++;
    breaker.stats.successes++;
    updateLatencyPercentiles(breaker.stats, latency);
  });

  // Request failure
  breaker.on('failure', (error, latency) => {
    breaker.stats.requests++;
    breaker.stats.failures++;
    updateLatencyPercentiles(breaker.stats, latency);
    
    console.error(`[Circuit Breaker] ${serviceName} request failed:`, error.message);
  });

  // Request timeout
  breaker.on('timeout', (error, latency) => {
    breaker.stats.requests++;
    breaker.stats.timeouts++;
    
    console.error(`[Circuit Breaker] ${serviceName} request timeout after ${latency}ms`);
  });

  // Fallback executed
  breaker.on('fallback', (result) => {
    breaker.stats.fallbacks++;
  });

  // Request rejected due to circuit open
  breaker.on('reject', () => {
    breaker.stats.semaphoreRejections++;
  });

  // Health check performed
  breaker.on('healthCheckFailed', (error) => {
    console.error(`[Circuit Breaker] ${serviceName} health check failed:`, error.message);
  });
};

// Update latency percentiles
const updateLatencyPercentiles = (stats, latency) => {
  if (!stats.latencies) {
    stats.latencies = [];
  }
  
  stats.latencies.push(latency);
  
  // Keep only last 1000 latencies
  if (stats.latencies.length > 1000) {
    stats.latencies.shift();
  }
  
  // Calculate percentiles
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  stats.percentileLatency = {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
};

// Circuit breaker middleware factory
export const circuitBreakerMiddleware = (serviceName, serviceUrl) => {
  const breaker = getCircuitBreaker(serviceName);

  // Set fallback function
  breaker.fallback((error, args) => {
    // Return cached response if available
    const cacheKey = `${serviceName}:${JSON.stringify(args)}`;
    const cachedResponse = getFromCache(cacheKey);
    
    if (cachedResponse) {
      breaker.stats.cacheHits++;
      return cachedResponse;
    }

    // Return degraded response
    return {
      data: {
        error: 'Service temporarily unavailable',
        service: serviceName,
        fallback: true,
        message: 'Using fallback response due to service issues'
      },
      status: 503,
      headers: {
        'X-Circuit-Breaker': 'open',
        'X-Fallback-Response': 'true'
      }
    };
  });

  return async (req, res, next) => {
    try {
      // Build request options
      const requestOptions = {
        method: req.method,
        url: `${serviceUrl}${req.path}`,
        headers: {
          ...req.headers,
          'X-Circuit-Breaker': breaker.stats.state,
          'X-Forwarded-For': req.ip,
          'X-Original-Host': req.hostname
        },
        params: req.query,
        data: req.body,
        responseType: 'json'
      };

      // Make request through circuit breaker
      const response = await breaker.fire(requestOptions);

      // Cache successful responses
      if (response.status === 200) {
        const cacheKey = `${serviceName}:${JSON.stringify(requestOptions)}`;
        setInCache(cacheKey, response, 60000); // Cache for 1 minute
      }

      // Forward response
      res.status(response.status);
      Object.entries(response.headers || {}).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.json(response.data);

    } catch (error) {
      // Circuit breaker opened or request failed
      if (error.message === 'Breaker is open') {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: `${serviceName} is temporarily unavailable`,
          service: serviceName,
          circuitState: 'OPEN',
          retryAfter: Math.ceil(breaker.options.resetTimeout / 1000)
        });
      }

      // Timeout error
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        return res.status(504).json({
          error: 'Gateway Timeout',
          message: `Request to ${serviceName} timed out`,
          service: serviceName,
          timeout: breaker.options.timeout
        });
      }

      // Other errors
      console.error(`[Circuit Breaker] Error calling ${serviceName}:`, error);
      
      return res.status(error.response?.status || 500).json({
        error: 'Service Error',
        message: error.message,
        service: serviceName,
        details: error.response?.data
      });
    }
  };
};

// Service health monitoring
class ServiceMonitor {
  constructor() {
    this.services = new Map();
    this.healthCheckInterval = config.monitoring.healthCheckInterval || 30000;
    this.startMonitoring();
  }

  registerService(name, url, healthEndpoint = '/health') {
    this.services.set(name, {
      name,
      url,
      healthEndpoint,
      status: 'unknown',
      lastCheck: null,
      consecutiveFailures: 0,
      uptime: 0,
      downtime: 0,
      lastStatusChange: new Date()
    });
  }

  async checkHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return;

    try {
      const response = await axios.get(`${service.url}${service.healthEndpoint}`, {
        timeout: 5000,
        validateStatus: (status) => status === 200
      });

      // Service is healthy
      if (service.status !== 'healthy') {
        service.lastStatusChange = new Date();
      }
      service.status = 'healthy';
      service.consecutiveFailures = 0;
      service.lastCheck = new Date();
      service.uptime += this.healthCheckInterval;

      // Check if circuit breaker needs to be reset
      const breaker = circuitBreakers.get(serviceName);
      if (breaker && breaker.stats.state === STATES.OPEN) {
        breaker.close();
      }

      return { status: 'healthy', service: serviceName };

    } catch (error) {
      // Service is unhealthy
      service.consecutiveFailures++;
      service.lastCheck = new Date();
      service.downtime += this.healthCheckInterval;

      if (service.consecutiveFailures >= 3) {
        if (service.status !== 'unhealthy') {
          service.lastStatusChange = new Date();
        }
        service.status = 'unhealthy';

        // Open circuit breaker if too many failures
        const breaker = circuitBreakers.get(serviceName);
        if (breaker && breaker.stats.state === STATES.CLOSED) {
          breaker.open();
        }
      }

      return { 
        status: 'unhealthy', 
        service: serviceName, 
        error: error.message,
        consecutiveFailures: service.consecutiveFailures
      };
    }
  }

  async checkAllServices() {
    const results = await Promise.all(
      Array.from(this.services.keys()).map(name => this.checkHealth(name))
    );
    
    return results;
  }

  startMonitoring() {
    setInterval(() => {
      this.checkAllServices();
    }, this.healthCheckInterval);
  }

  getStatus() {
    const status = {};
    
    for (const [name, service] of this.services) {
      const breaker = circuitBreakers.get(name);
      
      status[name] = {
        ...service,
        circuitBreaker: breaker ? {
          state: breaker.stats.state,
          stats: {
            requests: breaker.stats.requests,
            failures: breaker.stats.failures,
            successRate: breaker.stats.requests > 0 
              ? ((breaker.stats.successes / breaker.stats.requests) * 100).toFixed(2) + '%'
              : 'N/A',
            latency: breaker.stats.percentileLatency
          }
        } : null
      };
    }
    
    return status;
  }
}

// Create service monitor instance
export const serviceMonitor = new ServiceMonitor();

// Register known services
Object.entries(config.services).forEach(([name, url]) => {
  if (name !== 'timeout' && name !== 'retries') {
    serviceMonitor.registerService(name, url);
  }
});

// Simple in-memory cache (replace with Redis in production)
const cache = new Map();

const getFromCache = (key) => {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

const setInCache = (key, data, ttl) => {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl
  });
  
  // Limit cache size
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
};

// Alert sending function (integrate with your alerting system)
const sendAlert = async (alert) => {
  // Log the alert
  console.error('[ALERT]', alert);
  
  // In production, integrate with:
  // - PagerDuty
  // - Slack
  // - Email
  // - SMS
  // - etc.
};

// Graceful shutdown
export const shutdownCircuitBreakers = async () => {
  for (const [name, breaker] of circuitBreakers) {
    console.log(`Shutting down circuit breaker for ${name}`);
    breaker.shutdown();
  }
  circuitBreakers.clear();
};

// API endpoint to get circuit breaker status
export const getCircuitBreakerStatus = () => {
  const status = {};
  
  for (const [name, breaker] of circuitBreakers) {
    status[name] = {
      state: breaker.stats.state,
      enabled: breaker.enabled,
      requests: breaker.stats.requests,
      failures: breaker.stats.failures,
      successes: breaker.stats.successes,
      timeouts: breaker.stats.timeouts,
      fallbacks: breaker.stats.fallbacks,
      cacheHits: breaker.stats.cacheHits,
      successRate: breaker.stats.requests > 0 
        ? ((breaker.stats.successes / breaker.stats.requests) * 100).toFixed(2) + '%'
        : 'N/A',
      latency: breaker.stats.percentileLatency,
      lastStateChange: breaker.stats.lastStateChange,
      options: {
        timeout: breaker.options.timeout,
        errorThresholdPercentage: breaker.options.errorThresholdPercentage,
        resetTimeout: breaker.options.resetTimeout,
        volumeThreshold: breaker.options.volumeThreshold
      }
    };
  }
  
  return status;
};

// Manual circuit breaker control (for admin use)
export const manualCircuitControl = {
  open: (serviceName) => {
    const breaker = circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.open();
      return true;
    }
    return false;
  },
  
  close: (serviceName) => {
    const breaker = circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.close();
      return true;
    }
    return false;
  },
  
  disable: (serviceName) => {
    const breaker = circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.disable();
      return true;
    }
    return false;
  },
  
  enable: (serviceName) => {
    const breaker = circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.enable();
      return true;
    }
    return false;
  }
};

export default {
  getCircuitBreaker,
  circuitBreakerMiddleware,
  serviceMonitor,
  getCircuitBreakerStatus,
  manualCircuitControl,
  shutdownCircuitBreakers
};