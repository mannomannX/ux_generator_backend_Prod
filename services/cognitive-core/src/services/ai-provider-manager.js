// ==========================================
// SERVICES/COGNITIVE-CORE/src/services/ai-provider-manager.js
// ==========================================

import { GoogleGeminiIntegration } from '../integrations/google-gemini.js';
import { OpenAIIntegration } from '../integrations/openai.js';
import { ClaudeIntegration } from '../integrations/claude.js';

/**
 * AIProviderManager manages multiple AI providers with failover, load balancing,
 * and intelligent routing based on task requirements
 */
class AIProviderManager {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      primaryProvider: config.primaryProvider || 'google-gemini',
      enableFailover: config.enableFailover !== false,
      enableLoadBalancing: config.enableLoadBalancing || false,
      providers: config.providers || {}
    };

    // Initialize providers
    this.providers = new Map();
    this.providerHealth = new Map();
    this.providerMetrics = new Map();
    
    this.initializeProviders();
    
    // Health check interval
    this.healthCheckInterval = setInterval(() => {
      this.checkAllProvidersHealth();
    }, 60000); // Every minute

    this.logger.info('AI Provider Manager initialized', {
      primaryProvider: this.config.primaryProvider,
      availableProviders: Array.from(this.providers.keys()),
      enableFailover: this.config.enableFailover
    });
  }

  /**
   * Initialize all available providers
   */
  initializeProviders() {
    // Initialize Google Gemini (Primary)
    try {
      const gemini = new GoogleGeminiIntegration(this.logger, this.config.providers.gemini);
      this.providers.set('google-gemini', gemini);
      this.providerHealth.set('google-gemini', { status: 'unknown', lastCheck: null });
      this.initializeMetrics('google-gemini');
      this.logger.info('Google Gemini provider initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Google Gemini provider', error);
    }

    // Initialize OpenAI (Fallback)
    try {
      const openai = new OpenAIIntegration(this.logger, this.config.providers.openai);
      if (openai.enabled) {
        this.providers.set('openai', openai);
        this.providerHealth.set('openai', { status: 'unknown', lastCheck: null });
        this.initializeMetrics('openai');
        this.logger.info('OpenAI provider initialized');
      }
    } catch (error) {
      this.logger.warn('OpenAI provider not available', error);
    }

    // Initialize Claude (Alternative)
    try {
      const claude = new ClaudeIntegration(this.logger, this.config.providers.claude);
      if (claude.enabled) {
        this.providers.set('claude', claude);
        this.providerHealth.set('claude', { status: 'unknown', lastCheck: null });
        this.initializeMetrics('claude');
        this.logger.info('Claude provider initialized');
      }
    } catch (error) {
      this.logger.warn('Claude provider not available', error);
    }

    if (this.providers.size === 0) {
      throw new Error('No AI providers available - check API keys and configuration');
    }
  }

  /**
   * Generate content with automatic provider selection and failover
   */
  async generateContent(prompt, qualityMode = 'standard', options = {}) {
    const providers = this.selectProvidersForTask(qualityMode, options);
    
    for (const providerName of providers) {
      try {
        const startTime = Date.now();
        const provider = this.providers.get(providerName);
        
        if (!provider) {
          continue;
        }

        this.logger.debug('Attempting content generation', {
          provider: providerName,
          qualityMode,
          isVision: options.includeImage || false
        });

        let result;
        if (options.includeImage && options.imageData) {
          result = await provider.generateContentWithVision(
            prompt, 
            options.imageData, 
            qualityMode
          );
        } else {
          result = await provider.generateContent(prompt, qualityMode, options);
        }

        // Update metrics on success
        const processingTime = Date.now() - startTime;
        this.updateProviderMetrics(providerName, processingTime, true);
        this.updateProviderHealth(providerName, 'healthy');

        this.logger.info('Content generated successfully', {
          provider: providerName,
          qualityMode,
          processingTime,
          fallbackUsed: providerName !== this.config.primaryProvider
        });

        return {
          ...result,
          metadata: {
            provider: providerName,
            processingTime,
            qualityMode,
            fallbackUsed: providerName !== this.config.primaryProvider
          }
        };

      } catch (error) {
        const processingTime = Date.now() - Date.now();
        this.updateProviderMetrics(providerName, processingTime, false);
        this.updateProviderHealth(providerName, 'unhealthy', error.message);

        this.logger.warn('Provider failed, trying next', error, {
          provider: providerName,
          qualityMode,
          remainingProviders: providers.length - providers.indexOf(providerName) - 1
        });

        // If this was the last provider, throw the error
        if (providers.indexOf(providerName) === providers.length - 1) {
          throw new Error(`All AI providers failed. Last error: ${error.message}`);
        }
      }
    }

    throw new Error('No available AI providers');
  }

  /**
   * Select providers for a task based on requirements and health
   */
  selectProvidersForTask(qualityMode, options = {}) {
    const availableProviders = Array.from(this.providers.keys());
    const healthyProviders = availableProviders.filter(name => 
      this.isProviderHealthy(name)
    );

    // If no healthy providers known, use all available
    const candidateProviders = healthyProviders.length > 0 ? healthyProviders : availableProviders;

    // Filter by capabilities
    const capableProviders = candidateProviders.filter(name => {
      const provider = this.providers.get(name);
      const capabilities = provider.getModelCapabilities?.(qualityMode);
      
      if (!capabilities) return true; // Assume capable if no capability info
      
      // Check vision support if needed
      if (options.includeImage && !capabilities.supportsVision) {
        return false;
      }
      
      return true;
    });

    if (capableProviders.length === 0) {
      this.logger.warn('No capable providers found for task requirements', {
        qualityMode,
        includeImage: options.includeImage,
        availableProviders
      });
      return availableProviders; // Fallback to all providers
    }

    // Sort by preference and performance
    const sortedProviders = this.sortProvidersByPreference(capableProviders, qualityMode);
    
    return sortedProviders;
  }

  /**
   * Sort providers by preference and performance metrics
   */
  sortProvidersByPreference(providers, qualityMode) {
    return providers.sort((a, b) => {
      // Primary provider gets highest priority
      if (a === this.config.primaryProvider) return -1;
      if (b === this.config.primaryProvider) return 1;

      // Then sort by performance metrics
      const metricsA = this.providerMetrics.get(a);
      const metricsB = this.providerMetrics.get(b);

      if (!metricsA || !metricsB) return 0;

      // Lower error rate is better
      const errorRateA = metricsA.failures / (metricsA.requests || 1);
      const errorRateB = metricsB.failures / (metricsB.requests || 1);
      
      if (errorRateA !== errorRateB) {
        return errorRateA - errorRateB;
      }

      // Lower average response time is better
      return metricsA.averageResponseTime - metricsB.averageResponseTime;
    });
  }

  /**
   * Check if provider is healthy
   */
  isProviderHealthy(providerName) {
    const health = this.providerHealth.get(providerName);
    
    if (!health) return false;
    
    // Consider healthy if last check was healthy and recent (< 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    return (
      health.status === 'healthy' && 
      health.lastCheck && 
      health.lastCheck > fiveMinutesAgo
    );
  }

  /**
   * Update provider health status
   */
  updateProviderHealth(providerName, status, error = null) {
    this.providerHealth.set(providerName, {
      status,
      lastCheck: new Date(),
      error,
      consecutive: this.getConsecutiveFailures(providerName, status === 'unhealthy')
    });
  }

  /**
   * Update provider performance metrics
   */
  updateProviderMetrics(providerName, processingTime, success) {
    const metrics = this.providerMetrics.get(providerName);
    
    metrics.requests++;
    
    if (success) {
      metrics.successes++;
      // Update average response time
      const totalSuccesses = metrics.successes;
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * (totalSuccesses - 1) + processingTime) / totalSuccesses;
    } else {
      metrics.failures++;
    }
    
    metrics.lastUsed = new Date();
  }

  /**
   * Initialize metrics for a provider
   */
  initializeMetrics(providerName) {
    this.providerMetrics.set(providerName, {
      requests: 0,
      successes: 0,
      failures: 0,
      averageResponseTime: 0,
      lastUsed: null
    });
  }

  /**
   * Get consecutive failures for provider
   */
  getConsecutiveFailures(providerName, isFailure) {
    const health = this.providerHealth.get(providerName);
    
    if (!health) return isFailure ? 1 : 0;
    
    if (isFailure) {
      return (health.consecutive || 0) + 1;
    } else {
      return 0; // Reset on success
    }
  }

  /**
   * Check health of all providers
   */
  async checkAllProvidersHealth() {
    const healthChecks = Array.from(this.providers.entries()).map(async ([name, provider]) => {
      try {
        const health = await provider.healthCheck();
        this.updateProviderHealth(name, health.status === 'healthy' ? 'healthy' : 'unhealthy');
        return { name, health };
      } catch (error) {
        this.updateProviderHealth(name, 'unhealthy', error.message);
        return { name, health: { status: 'unhealthy', error: error.message } };
      }
    });

    const results = await Promise.allSettled(healthChecks);
    
    const healthyProviders = results
      .filter(result => result.status === 'fulfilled' && result.value.health.status === 'healthy')
      .map(result => result.value.name);

    this.logger.debug('Provider health check completed', {
      totalProviders: this.providers.size,
      healthyProviders: healthyProviders.length,
      healthyProviderNames: healthyProviders
    });
  }

  /**
   * Get comprehensive statistics for all providers
   */
  getProviderStatistics() {
    const stats = {
      totalProviders: this.providers.size,
      primaryProvider: this.config.primaryProvider,
      healthStatus: {},
      metrics: {},
      capabilities: {},
      overall: {
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        averageResponseTime: 0
      }
    };

    for (const [name, provider] of this.providers.entries()) {
      // Health status
      stats.healthStatus[name] = this.providerHealth.get(name);
      
      // Performance metrics
      stats.metrics[name] = this.providerMetrics.get(name);
      
      // Capabilities
      try {
        stats.capabilities[name] = {
          standard: provider.getModelCapabilities?.('standard'),
          pro: provider.getModelCapabilities?.('pro')
        };
      } catch (error) {
        stats.capabilities[name] = { error: error.message };
      }
      
      // Aggregate overall stats
      const metrics = this.providerMetrics.get(name);
      if (metrics) {
        stats.overall.totalRequests += metrics.requests;
        stats.overall.totalSuccesses += metrics.successes;
        stats.overall.totalFailures += metrics.failures;
      }
    }

    // Calculate overall average response time
    if (stats.overall.totalSuccesses > 0) {
      let totalWeightedTime = 0;
      
      for (const metrics of this.providerMetrics.values()) {
        totalWeightedTime += metrics.averageResponseTime * metrics.successes;
      }
      
      stats.overall.averageResponseTime = totalWeightedTime / stats.overall.totalSuccesses;
    }

    stats.timestamp = new Date();
    return stats;
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus() {
    const health = {
      status: 'healthy',
      providers: {},
      availableProviders: 0,
      totalProviders: this.providers.size
    };

    for (const [name, providerHealth] of this.providerHealth.entries()) {
      health.providers[name] = providerHealth;
      
      if (providerHealth.status === 'healthy') {
        health.availableProviders++;
      }
    }

    // Overall health based on available providers
    if (health.availableProviders === 0) {
      health.status = 'critical';
    } else if (health.availableProviders < health.totalProviders) {
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Shutdown provider manager
   */
  async shutdown() {
    this.logger.info('Shutting down AI Provider Manager...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Log final statistics
    const stats = this.getProviderStatistics();
    this.logger.info('AI Provider Manager shutdown', {
      totalRequests: stats.overall.totalRequests,
      successRate: stats.overall.totalRequests > 0 ? 
        (stats.overall.totalSuccesses / stats.overall.totalRequests) : 0,
      averageResponseTime: Math.round(stats.overall.averageResponseTime)
    });
  }
}

export { AIProviderManager };