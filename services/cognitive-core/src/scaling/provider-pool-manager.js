const EventEmitter = require('events');

/**
 * Provider Pool Manager
 * 
 * Manages multiple AI provider instances with:
 * - Load balancing across providers
 * - API key rotation
 * - Circuit breaker pattern
 * - Provider health monitoring
 * - Automatic failover
 */
class ProviderPoolManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxRetries: config.maxRetries || 3,
      healthCheckInterval: config.healthCheckInterval || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000,
      loadBalancingStrategy: config.loadBalancingStrategy || 'weighted-round-robin',
      ...config
    };

    // Provider instances
    this.providers = new Map();
    this.providerWeights = new Map();
    this.currentIndex = 0;

    // Circuit breaker state
    this.circuitBreakers = new Map();

    // Health monitoring
    this.healthStatus = new Map();
    this.healthCheckTimer = null;

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      byProvider: new Map()
    };

    this.initialize();
  }

  initialize() {
    // Initialize providers from config
    this.initializeProviders();

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Initialize provider instances
   */
  initializeProviders() {
    const providerConfigs = {
      gemini: {
        apiKeys: [
          process.env.GEMINI_API_KEY_1,
          process.env.GEMINI_API_KEY_2,
          process.env.GEMINI_API_KEY_3,
          process.env.GEMINI_API_KEY_4,
          process.env.GEMINI_API_KEY_5
        ].filter(Boolean),
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        rateLimit: 60,
        weight: 5
      },
      claude: {
        apiKeys: [
          process.env.CLAUDE_API_KEY_1,
          process.env.CLAUDE_API_KEY_2,
          process.env.CLAUDE_API_KEY_3
        ].filter(Boolean),
        endpoint: 'https://api.anthropic.com/v1',
        rateLimit: 50,
        weight: 2
      },
      gpt4: {
        apiKeys: [
          process.env.OPENAI_API_KEY_1,
          process.env.OPENAI_API_KEY_2,
          process.env.OPENAI_API_KEY_3
        ].filter(Boolean),
        endpoint: 'https://api.openai.com/v1',
        rateLimit: 500,
        weight: 1
      },
      llama: {
        endpoints: [
          process.env.LLAMA_ENDPOINT_1 || 'http://localhost:11434',
          process.env.LLAMA_ENDPOINT_2,
          process.env.LLAMA_ENDPOINT_3
        ].filter(Boolean),
        rateLimit: 1000,
        weight: 2
      }
    };

    // Create provider instances
    for (const [providerType, config] of Object.entries(providerConfigs)) {
      if (config.apiKeys?.length > 0 || config.endpoints?.length > 0) {
        const instances = this.createProviderInstances(providerType, config);
        instances.forEach(instance => {
          this.providers.set(instance.id, instance);
          this.initializeCircuitBreaker(instance.id);
          this.healthStatus.set(instance.id, { healthy: true, lastCheck: Date.now() });
        });
        this.providerWeights.set(providerType, config.weight);
      }
    }
  }

  /**
   * Create provider instances from config
   */
  createProviderInstances(type, config) {
    const instances = [];
    
    if (config.apiKeys) {
      config.apiKeys.forEach((apiKey, index) => {
        instances.push({
          id: `${type}_${index}`,
          type,
          apiKey,
          endpoint: config.endpoint,
          rateLimit: config.rateLimit,
          requestCount: 0,
          lastReset: Date.now()
        });
      });
    } else if (config.endpoints) {
      config.endpoints.forEach((endpoint, index) => {
        instances.push({
          id: `${type}_${index}`,
          type,
          endpoint,
          rateLimit: config.rateLimit,
          requestCount: 0,
          lastReset: Date.now()
        });
      });
    }
    
    return instances;
  }

  /**
   * Initialize circuit breaker for provider
   */
  initializeCircuitBreaker(providerId) {
    this.circuitBreakers.set(providerId, {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailure: null,
      successCount: 0
    });
  }

  /**
   * Select provider based on load balancing strategy
   */
  selectProvider(request) {
    const availableProviders = this.getAvailableProviders(request);
    
    if (availableProviders.length === 0) {
      throw new Error('No available providers');
    }

    let selected;
    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        selected = this.roundRobinSelect(availableProviders);
        break;
      case 'weighted-round-robin':
        selected = this.weightedRoundRobinSelect(availableProviders);
        break;
      case 'least-connections':
        selected = this.leastConnectionsSelect(availableProviders);
        break;
      case 'random':
        selected = this.randomSelect(availableProviders);
        break;
      default:
        selected = availableProviders[0];
    }

    return selected;
  }

  /**
   * Get available providers (healthy and not rate limited)
   */
  getAvailableProviders(request) {
    const providers = [];
    
    for (const [id, provider] of this.providers) {
      // Check if provider type matches request needs
      if (request?.preferredProvider && provider.type !== request.preferredProvider) {
        continue;
      }

      // Check circuit breaker
      const breaker = this.circuitBreakers.get(id);
      if (breaker.state === 'open') {
        // Check if we should try half-open
        if (Date.now() - breaker.lastFailure > this.config.circuitBreakerTimeout) {
          breaker.state = 'half-open';
        } else {
          continue;
        }
      }

      // Check health status
      const health = this.healthStatus.get(id);
      if (!health?.healthy) {
        continue;
      }

      // Check rate limit
      if (this.isRateLimited(provider)) {
        continue;
      }

      providers.push(provider);
    }

    return providers;
  }

  /**
   * Check if provider is rate limited
   */
  isRateLimited(provider) {
    const now = Date.now();
    const timeSinceReset = now - provider.lastReset;
    
    // Reset counter if minute has passed
    if (timeSinceReset >= 60000) {
      provider.requestCount = 0;
      provider.lastReset = now;
      return false;
    }
    
    return provider.requestCount >= provider.rateLimit;
  }

  /**
   * Round-robin selection
   */
  roundRobinSelect(providers) {
    const selected = providers[this.currentIndex % providers.length];
    this.currentIndex++;
    return selected;
  }

  /**
   * Weighted round-robin selection
   */
  weightedRoundRobinSelect(providers) {
    // Group by provider type
    const byType = new Map();
    providers.forEach(p => {
      if (!byType.has(p.type)) {
        byType.set(p.type, []);
      }
      byType.get(p.type).push(p);
    });

    // Calculate weighted selection
    const weightedList = [];
    for (const [type, typeProviders] of byType) {
      const weight = this.providerWeights.get(type) || 1;
      for (let i = 0; i < weight; i++) {
        weightedList.push(...typeProviders);
      }
    }

    return weightedList[this.currentIndex++ % weightedList.length];
  }

  /**
   * Least connections selection
   */
  leastConnectionsSelect(providers) {
    return providers.reduce((min, p) => 
      p.requestCount < min.requestCount ? p : min
    );
  }

  /**
   * Random selection
   */
  randomSelect(providers) {
    return providers[Math.floor(Math.random() * providers.length)];
  }

  /**
   * Execute request with provider
   */
  async executeRequest(providerId, request) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const breaker = this.circuitBreakers.get(providerId);
    
    try {
      // Increment request count
      provider.requestCount++;
      this.stats.totalRequests++;

      // Execute request (placeholder - would integrate with actual API)
      const result = await this.makeAPICall(provider, request);

      // Update circuit breaker on success
      this.handleSuccess(breaker);

      // Update stats
      this.stats.successfulRequests++;
      this.updateProviderStats(provider.type, 'success');

      return result;

    } catch (error) {
      // Update circuit breaker on failure
      this.handleFailure(breaker);

      // Update stats
      this.stats.failedRequests++;
      this.updateProviderStats(provider.type, 'failure');

      throw error;
    }
  }

  /**
   * Make actual API call (placeholder)
   */
  async makeAPICall(provider, request) {
    // This would make actual API calls to providers
    // For now, simulate API call
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate occasional failures
        if (Math.random() > 0.95) {
          reject(new Error(`Provider ${provider.type} API error`));
        } else {
          resolve({
            success: true,
            provider: provider.type,
            content: `Response from ${provider.type}`,
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200
            }
          });
        }
      }, Math.random() * 1000 + 500);
    });
  }

  /**
   * Handle successful request for circuit breaker
   */
  handleSuccess(breaker) {
    breaker.failures = 0;
    breaker.successCount++;
    
    if (breaker.state === 'half-open') {
      // Close circuit after successful half-open attempt
      breaker.state = 'closed';
      this.emit('circuit-closed', breaker);
    }
  }

  /**
   * Handle failed request for circuit breaker
   */
  handleFailure(breaker) {
    breaker.failures++;
    breaker.lastFailure = Date.now();
    breaker.successCount = 0;
    
    if (breaker.failures >= this.config.circuitBreakerThreshold) {
      breaker.state = 'open';
      this.emit('circuit-opened', breaker);
    }
  }

  /**
   * Update provider statistics
   */
  updateProviderStats(providerType, result) {
    if (!this.stats.byProvider.has(providerType)) {
      this.stats.byProvider.set(providerType, {
        requests: 0,
        successes: 0,
        failures: 0
      });
    }
    
    const stats = this.stats.byProvider.get(providerType);
    stats.requests++;
    if (result === 'success') {
      stats.successes++;
    } else {
      stats.failures++;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(() => {
      this.checkProviderHealth();
    }, this.config.healthCheckInterval);
  }

  /**
   * Check health of all providers
   */
  async checkProviderHealth() {
    const checks = [];
    
    for (const [id, provider] of this.providers) {
      checks.push(this.checkSingleProviderHealth(id, provider));
    }
    
    const results = await Promise.allSettled(checks);
    
    results.forEach((result, index) => {
      const providerId = Array.from(this.providers.keys())[index];
      const health = this.healthStatus.get(providerId);
      
      if (result.status === 'fulfilled' && result.value) {
        health.healthy = true;
        health.lastCheck = Date.now();
      } else {
        health.healthy = false;
        health.lastCheck = Date.now();
        health.error = result.reason?.message || 'Health check failed';
      }
    });
    
    this.emit('health-check-complete', this.getHealthSummary());
  }

  /**
   * Check single provider health
   */
  async checkSingleProviderHealth(id, provider) {
    // Simple health check - would ping actual endpoint
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate 99% healthy
        resolve(Math.random() > 0.01);
      }, 100);
    });
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    const summary = {
      total: this.providers.size,
      healthy: 0,
      unhealthy: 0,
      providers: {}
    };
    
    for (const [id, health] of this.healthStatus) {
      if (health.healthy) {
        summary.healthy++;
      } else {
        summary.unhealthy++;
      }
      
      const provider = this.providers.get(id);
      const type = provider?.type || 'unknown';
      
      if (!summary.providers[type]) {
        summary.providers[type] = { healthy: 0, unhealthy: 0 };
      }
      
      if (health.healthy) {
        summary.providers[type].healthy++;
      } else {
        summary.providers[type].unhealthy++;
      }
    }
    
    return summary;
  }

  /**
   * Get provider statistics
   */
  getStatistics() {
    return {
      overall: {
        totalRequests: this.stats.totalRequests,
        successfulRequests: this.stats.successfulRequests,
        failedRequests: this.stats.failedRequests,
        successRate: this.stats.totalRequests > 0 
          ? this.stats.successfulRequests / this.stats.totalRequests 
          : 0
      },
      byProvider: Object.fromEntries(this.stats.byProvider),
      health: this.getHealthSummary(),
      circuitBreakers: this.getCircuitBreakerStatus()
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    const status = {};
    
    for (const [id, breaker] of this.circuitBreakers) {
      const provider = this.providers.get(id);
      status[id] = {
        type: provider?.type,
        state: breaker.state,
        failures: breaker.failures,
        successCount: breaker.successCount
      };
    }
    
    return status;
  }

  /**
   * Add new provider dynamically
   */
  addProvider(type, config) {
    const instances = this.createProviderInstances(type, config);
    
    instances.forEach(instance => {
      this.providers.set(instance.id, instance);
      this.initializeCircuitBreaker(instance.id);
      this.healthStatus.set(instance.id, { healthy: true, lastCheck: Date.now() });
    });
    
    this.emit('provider-added', { type, count: instances.length });
  }

  /**
   * Remove provider
   */
  removeProvider(providerId) {
    this.providers.delete(providerId);
    this.circuitBreakers.delete(providerId);
    this.healthStatus.delete(providerId);
    
    this.emit('provider-removed', providerId);
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(providerId) {
    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.successCount = 0;
      breaker.lastFailure = null;
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Wait for any pending requests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.emit('shutdown-complete');
  }
}

module.exports = ProviderPoolManager;