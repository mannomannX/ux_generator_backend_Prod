// ==========================================
// SERVICES/COGNITIVE-CORE/src/services/ai-request-queue.js
// ==========================================

import { EventEmitter } from 'events';

/**
 * AI Request Queue Manager for handling high-volume AI requests with priority and load balancing
 */
export class AIRequestQueue extends EventEmitter {
  constructor(logger, aiProviderFactory, config = {}) {
    super();
    this.logger = logger;
    this.aiProviderFactory = aiProviderFactory;
    
    this.config = {
      maxConcurrentRequests: config.maxConcurrentRequests || 50,
      maxQueueSize: config.maxQueueSize || 1000,
      requestTimeout: config.requestTimeout || 60000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      priorities: {
        critical: 0,
        high: 1,
        normal: 2,
        low: 3,
      },
      loadBalancing: {
        strategy: config.loadBalancingStrategy || 'least_connections', // round_robin, least_connections, weighted
        healthCheckInterval: config.healthCheckInterval || 30000,
        circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
        circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      },
    };

    // Queue state
    this.queue = [];
    this.activeRequests = new Map();
    this.completedRequests = 0;
    this.failedRequests = 0;
    this.totalRequestTime = 0;
    
    // Load balancing state
    this.providerConnections = new Map();
    this.circuitBreakers = new Map();
    this.lastUsedProviderIndex = new Map();
    
    // Processing state
    this.isProcessing = false;
    this.healthCheckTimer = null;
    
    // Metrics
    this.metrics = {
      queuedRequests: 0,
      processingRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      queueWaitTime: 0,
      throughputPerMinute: 0,
      errorRate: 0,
      providerHealth: {},
    };
    
    this.startMetricsCollection();
    this.startHealthChecking();
    
    this.logger.info('AI Request Queue Manager initialized', {
      maxConcurrentRequests: this.config.maxConcurrentRequests,
      maxQueueSize: this.config.maxQueueSize,
      loadBalancingStrategy: this.config.loadBalancing.strategy,
    });
  }

  /**
   * Add a request to the queue
   */
  async enqueue(request) {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Request queue is full');
    }

    const queuedRequest = {
      id: this.generateRequestId(),
      ...request,
      priority: request.priority || 'normal',
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: request.maxAttempts || this.config.retryAttempts,
    };

    // Validate request
    if (!queuedRequest.prompt || typeof queuedRequest.prompt !== 'string') {
      throw new Error('Request must include a valid prompt');
    }

    // Insert into queue based on priority
    const priorityValue = this.config.priorities[queuedRequest.priority] || 2;
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      const itemPriority = this.config.priorities[this.queue[i].priority] || 2;
      if (priorityValue < itemPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, queuedRequest);
    this.metrics.queuedRequests++;
    
    this.logger.debug('Request queued', {
      requestId: queuedRequest.id,
      priority: queuedRequest.priority,
      queueSize: this.queue.length,
      insertIndex,
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }

    return queuedRequest.id;
  }

  /**
   * Start processing the queue
   */
  async startProcessing() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.logger.info('Starting queue processing');

    while (this.queue.length > 0 && this.isProcessing) {
      // Check if we're under the concurrent limit
      if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
        await this.waitForSlot();
        continue;
      }

      // Get the next request
      const request = this.queue.shift();
      if (!request) continue;

      // Process the request concurrently
      this.processRequest(request).catch(error => {
        this.logger.error('Unhandled request processing error', error, {
          requestId: request.id,
        });
      });
    }

    this.isProcessing = false;
    this.logger.info('Queue processing stopped');
  }

  /**
   * Process an individual request
   */
  async processRequest(request) {
    const startTime = Date.now();
    request.processingStartTime = startTime;
    
    this.activeRequests.set(request.id, request);
    this.metrics.processingRequests++;
    this.metrics.queuedRequests--;

    try {
      // Select the best provider using load balancing
      const provider = this.selectProvider(request);
      
      this.logger.debug('Processing request', {
        requestId: request.id,
        provider: provider.name,
        attempts: request.attempts + 1,
        queueWaitTime: startTime - request.timestamp,
      });

      // Track connection
      this.trackConnection(provider, 'start');

      // Execute the request
      const result = await this.executeRequest(provider, request);
      
      // Success
      const processingTime = Date.now() - startTime;
      const queueWaitTime = request.processingStartTime - request.timestamp;
      
      this.trackConnection(provider, 'success');
      this.updateMetrics(true, processingTime, queueWaitTime);
      
      this.emit('requestCompleted', {
        requestId: request.id,
        result,
        processingTime,
        queueWaitTime,
        attempts: request.attempts + 1,
      });

      this.logger.debug('Request completed successfully', {
        requestId: request.id,
        processingTime,
        queueWaitTime,
        provider: provider.name,
      });

    } catch (error) {
      await this.handleRequestError(request, error, startTime);
    } finally {
      this.activeRequests.delete(request.id);
      this.metrics.processingRequests--;
    }
  }

  /**
   * Execute a request using the selected provider
   */
  async executeRequest(provider, request) {
    const timeout = request.timeout || this.config.requestTimeout;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      try {
        let result;
        
        if (request.streaming) {
          result = await provider.streamResponse(request.prompt, request.options);
        } else {
          result = await provider.generateResponse(request.prompt, request.options);
        }

        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle request errors and retries
   */
  async handleRequestError(request, error, startTime) {
    const processingTime = Date.now() - startTime;
    const queueWaitTime = request.processingStartTime - request.timestamp;
    
    request.attempts++;
    
    // Check if we should retry
    if (request.attempts < request.maxAttempts && this.shouldRetry(error)) {
      this.logger.warn('Request failed, retrying', {
        requestId: request.id,
        attempt: request.attempts,
        maxAttempts: request.maxAttempts,
        error: error.message,
      });

      // Add delay before retry
      await this.delay(this.config.retryDelay * request.attempts);
      
      // Re-queue the request
      this.queue.unshift(request);
      this.metrics.queuedRequests++;
      
    } else {
      // Final failure
      this.updateMetrics(false, processingTime, queueWaitTime);
      
      this.emit('requestFailed', {
        requestId: request.id,
        error: error.message,
        attempts: request.attempts,
        processingTime,
        queueWaitTime,
      });

      this.logger.error('Request failed permanently', error, {
        requestId: request.id,
        attempts: request.attempts,
        processingTime,
      });
    }
  }

  /**
   * Select the best provider based on load balancing strategy
   */
  selectProvider(request) {
    const availableProviders = this.getHealthyProviders(request.providerType);
    
    if (availableProviders.length === 0) {
      throw new Error('No healthy providers available');
    }

    switch (this.config.loadBalancing.strategy) {
      case 'round_robin':
        return this.selectRoundRobin(availableProviders, request.providerType);
        
      case 'least_connections':
        return this.selectLeastConnections(availableProviders);
        
      case 'weighted':
        return this.selectWeighted(availableProviders);
        
      case 'random':
        return availableProviders[Math.floor(Math.random() * availableProviders.length)];
        
      default:
        return this.selectLeastConnections(availableProviders);
    }
  }

  /**
   * Round robin provider selection
   */
  selectRoundRobin(providers, providerType) {
    const key = providerType || 'default';
    const lastIndex = this.lastUsedProviderIndex.get(key) || 0;
    const nextIndex = (lastIndex + 1) % providers.length;
    
    this.lastUsedProviderIndex.set(key, nextIndex);
    return providers[nextIndex];
  }

  /**
   * Least connections provider selection
   */
  selectLeastConnections(providers) {
    return providers.reduce((best, current) => {
      const bestConnections = this.providerConnections.get(best.name) || 0;
      const currentConnections = this.providerConnections.get(current.name) || 0;
      
      return currentConnections < bestConnections ? current : best;
    });
  }

  /**
   * Weighted provider selection (based on performance metrics)
   */
  selectWeighted(providers) {
    const weights = providers.map(provider => {
      const metrics = provider.getMetrics();
      const connections = this.providerConnections.get(provider.name) || 0;
      
      // Higher weight for better performance (lower error rate, lower latency, fewer connections)
      const errorWeight = 1 - Math.min(metrics.errorRate, 0.9); // Max 90% penalty for errors
      const latencyWeight = Math.max(0.1, 1 - (metrics.avgLatency / 10000)); // Normalize latency
      const connectionWeight = Math.max(0.1, 1 - (connections / 10)); // Fewer connections = higher weight
      
      return errorWeight * latencyWeight * connectionWeight;
    });
    
    // Select based on weighted random
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < providers.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return providers[i];
      }
    }
    
    return providers[providers.length - 1];
  }

  /**
   * Get healthy providers, excluding circuit-broken ones
   */
  getHealthyProviders(providerType) {
    const allProviders = this.aiProviderFactory.getAllProviders();
    
    return allProviders.filter(provider => {
      // Filter by type if specified
      if (providerType && !provider.name.includes(providerType)) {
        return false;
      }
      
      // Check if provider is healthy
      if (!provider.isHealthy) {
        return false;
      }
      
      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(provider.name);
      if (circuitBreaker && circuitBreaker.isOpen()) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Track connection count for load balancing
   */
  trackConnection(provider, action) {
    const currentCount = this.providerConnections.get(provider.name) || 0;
    
    switch (action) {
      case 'start':
        this.providerConnections.set(provider.name, currentCount + 1);
        break;
        
      case 'success':
      case 'error':
        this.providerConnections.set(provider.name, Math.max(0, currentCount - 1));
        break;
    }
  }

  /**
   * Check if an error should trigger a retry
   */
  shouldRetry(error) {
    const retryableErrors = [
      'timeout',
      'rate limit',
      'quota exceeded',
      'temporary',
      'server error',
      'network error',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(retryable => errorMessage.includes(retryable));
  }

  /**
   * Wait for an available slot in the concurrent requests limit
   */
  async waitForSlot() {
    return new Promise((resolve) => {
      const checkSlot = () => {
        if (this.activeRequests.size < this.config.maxConcurrentRequests) {
          resolve();
        } else {
          setTimeout(checkSlot, 100);
        }
      };
      checkSlot();
    });
  }

  /**
   * Update metrics
   */
  updateMetrics(success, processingTime, queueWaitTime) {
    if (success) {
      this.completedRequests++;
      this.metrics.completedRequests++;
    } else {
      this.failedRequests++;
      this.metrics.failedRequests++;
    }
    
    this.totalRequestTime += processingTime;
    this.metrics.averageResponseTime = this.totalRequestTime / (this.completedRequests + this.failedRequests);
    this.metrics.errorRate = this.failedRequests / (this.completedRequests + this.failedRequests);
    
    // Update queue wait time
    if (queueWaitTime) {
      this.metrics.queueWaitTime = (this.metrics.queueWaitTime + queueWaitTime) / 2;
    }
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      // Calculate throughput per minute
      const now = Date.now();
      if (!this.lastThroughputCalculation) {
        this.lastThroughputCalculation = now;
        this.lastCompletedRequests = this.completedRequests;
        return;
      }
      
      const timeDiff = now - this.lastThroughputCalculation;
      const requestDiff = this.completedRequests - this.lastCompletedRequests;
      
      this.metrics.throughputPerMinute = (requestDiff / timeDiff) * 60000;
      
      this.lastThroughputCalculation = now;
      this.lastCompletedRequests = this.completedRequests;
      
      this.emit('metricsUpdated', this.getMetrics());
    }, 60000); // Every minute
  }

  /**
   * Start health checking of providers
   */
  startHealthChecking() {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const healthResults = await this.aiProviderFactory.healthCheckAll();
        this.metrics.providerHealth = healthResults;
        
        // Update circuit breakers
        for (const [providerName, health] of Object.entries(healthResults)) {
          if (health.status !== 'healthy') {
            this.openCircuitBreaker(providerName);
          } else {
            this.closeCircuitBreaker(providerName);
          }
        }
        
      } catch (error) {
        this.logger.error('Health check failed', error);
      }
    }, this.config.loadBalancing.healthCheckInterval);
  }

  /**
   * Open circuit breaker for a provider
   */
  openCircuitBreaker(providerName) {
    if (!this.circuitBreakers.has(providerName)) {
      this.circuitBreakers.set(providerName, {
        isOpen: () => Date.now() - this.openTime < this.config.loadBalancing.circuitBreakerTimeout,
        openTime: Date.now(),
      });
      
      this.logger.warn('Circuit breaker opened', { provider: providerName });
    }
  }

  /**
   * Close circuit breaker for a provider
   */
  closeCircuitBreaker(providerName) {
    if (this.circuitBreakers.has(providerName)) {
      this.circuitBreakers.delete(providerName);
      this.logger.info('Circuit breaker closed', { provider: providerName });
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay utility
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size,
      totalRequests: this.completedRequests + this.failedRequests,
      providerConnections: Object.fromEntries(this.providerConnections),
      circuitBreakers: Array.from(this.circuitBreakers.keys()),
      timestamp: Date.now(),
    };
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queueSize: this.queue.length,
      activeRequests: this.activeRequests.size,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.isProcessing = false;
    this.logger.info('Queue processing paused');
  }

  /**
   * Resume queue processing
   */
  resume() {
    if (!this.isProcessing && this.queue.length > 0) {
      this.startProcessing();
    }
  }

  /**
   * Clear the queue
   */
  clear() {
    const clearedCount = this.queue.length;
    this.queue = [];
    this.metrics.queuedRequests = 0;
    
    this.logger.info('Queue cleared', { clearedRequests: clearedCount });
    return clearedCount;
  }

  /**
   * Shutdown the queue manager
   */
  async shutdown() {
    this.logger.info('Shutting down AI Request Queue Manager...');
    
    this.isProcessing = false;
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Wait for active requests to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeRequests.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await this.delay(100);
    }
    
    if (this.activeRequests.size > 0) {
      this.logger.warn('Shutdown timeout reached with active requests', {
        activeRequests: this.activeRequests.size,
      });
    }
    
    this.logger.info('AI Request Queue Manager shut down successfully');
  }
}

export default AIRequestQueue;