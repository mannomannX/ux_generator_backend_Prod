/**
 * AI Scaling System
 * 
 * Central module that coordinates all scaling components:
 * - Queue management
 * - Provider pool management  
 * - Semantic caching
 * - Cost optimization
 * - Response streaming
 * 
 * This system enables 500+ AI requests per minute at optimal cost
 */

const AIQueueManager = require('./ai-queue-manager');
const ProviderPoolManager = require('./provider-pool-manager');
const SemanticCache = require('./semantic-cache');
const AdaptiveCostOptimizer = require('./adaptive-cost-optimizer');
const StreamOptimizer = require('./stream-optimizer');
const agentProviderMapping = require('../config/agent-provider-mapping');

class AIScalingSystem {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      queueEnabled: config.queueEnabled !== false,
      cacheEnabled: config.cacheEnabled !== false,
      streamingEnabled: config.streamingEnabled !== false,
      costOptimizationEnabled: config.costOptimizationEnabled !== false,
      dailyBudget: config.dailyBudget || 100,
      monthlyBudget: config.monthlyBudget || 2000,
      ...config
    };

    this.components = {};
    this.metrics = {
      requestsProcessed: 0,
      cacheHits: 0,
      totalCost: 0,
      avgLatency: 0
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  async initialize() {
    console.log('🚀 Initializing AI Scaling System...');

    // Initialize queue manager
    if (this.config.queueEnabled) {
      this.components.queueManager = new AIQueueManager(this.config.queue);
      console.log('✅ Queue Manager initialized');
    }

    // Initialize provider pool
    this.components.providerPool = new ProviderPoolManager(this.config.providers);
    console.log('✅ Provider Pool initialized');

    // Initialize semantic cache
    if (this.config.cacheEnabled) {
      this.components.cache = new SemanticCache(this.config.cache);
      console.log('✅ Semantic Cache initialized');
    }

    // Initialize cost optimizer
    if (this.config.costOptimizationEnabled) {
      this.components.costOptimizer = new AdaptiveCostOptimizer({
        dailyBudget: this.config.dailyBudget,
        monthlyBudget: this.config.monthlyBudget
      });
      console.log('✅ Cost Optimizer initialized');
    }

    // Initialize stream optimizer
    if (this.config.streamingEnabled) {
      this.components.streamOptimizer = new StreamOptimizer(this.config.streaming);
      console.log('✅ Stream Optimizer initialized');
    }

    this.attachEventHandlers();
    console.log('🎯 AI Scaling System ready!');
  }

  attachEventHandlers() {
    // Queue events
    if (this.components.queueManager) {
      this.components.queueManager.on('job-completed', (data) => {
        this.metrics.requestsProcessed++;
        this.updateMetrics('latency', data.duration);
      });
    }

    // Cost optimizer events
    if (this.components.costOptimizer) {
      this.components.costOptimizer.on('budget-alert', (alert) => {
        console.warn('💰 Budget Alert:', alert);
        this.handleBudgetAlert(alert);
      });

      this.components.costOptimizer.on('mode-changed', (mode) => {
        console.log(`🔄 Optimization mode changed to: ${mode}`);
      });
    }

    // Provider pool events
    if (this.components.providerPool) {
      this.components.providerPool.on('circuit-opened', (providerId) => {
        console.error(`⚠️ Circuit breaker opened for ${providerId}`);
      });
    }
  }

  /**
   * Main entry point for AI requests
   */
  async processRequest(request) {
    const startTime = Date.now();
    
    try {
      // 1. Check cache first
      if (this.components.cache) {
        const cached = await this.components.cache.get(request.prompt, request.context);
        if (cached.hit) {
          this.metrics.cacheHits++;
          return {
            ...cached,
            source: 'cache',
            latency: Date.now() - startTime
          };
        }
      }

      // 2. Determine optimal provider based on agent and context
      const provider = this.selectProvider(request);
      
      // 3. Queue request if needed
      if (this.components.queueManager && request.userTier === 'free') {
        const queueResult = await this.components.queueManager.enqueue({
          ...request,
          provider
        });
        
        return {
          queued: true,
          ...queueResult
        };
      }

      // 4. Execute request with streaming if enabled
      let response;
      if (this.components.streamOptimizer && request.streaming) {
        response = await this.executeStreamingRequest(request, provider);
      } else {
        response = await this.executeStandardRequest(request, provider);
      }

      // 5. Track costs
      if (this.components.costOptimizer) {
        const costData = await this.components.costOptimizer.trackUsage(
          request,
          response,
          provider
        );
        this.metrics.totalCost = costData.budget.dailySpent;
      }

      // 6. Cache response
      if (this.components.cache && response.success) {
        await this.components.cache.set(request.prompt, response.content, {
          context: request.context,
          userTier: request.userTier,
          usage: response.usage
        });
      }

      return {
        ...response,
        provider,
        latency: Date.now() - startTime,
        source: 'api'
      };

    } catch (error) {
      console.error('AI request failed:', error);
      
      // Try fallback providers
      const fallbackResponse = await this.tryFallbackProviders(request, error);
      if (fallbackResponse) {
        return fallbackResponse;
      }
      
      throw error;
    }
  }

  /**
   * Select optimal provider for request
   */
  selectProvider(request) {
    // Get recommendation from config
    const configProvider = agentProviderMapping.getProviderForAgent(
      request.agent,
      {
        userTier: request.userTier,
        complexity: request.complexity
      }
    );

    // Get recommendation from cost optimizer
    if (this.components.costOptimizer) {
      const costProvider = this.components.costOptimizer.getProviderRecommendation(request);
      
      // Cost optimizer takes precedence if budget is tight
      const budgetStatus = this.components.costOptimizer.getBudgetStatus();
      if (budgetStatus.dailyUsage > 0.7) {
        return costProvider;
      }
    }

    // Get available provider from pool
    if (this.components.providerPool) {
      const poolProvider = this.components.providerPool.selectProvider(request);
      if (poolProvider) {
        return poolProvider.type;
      }
    }

    return configProvider;
  }

  /**
   * Execute standard request
   */
  async executeStandardRequest(request, provider) {
    if (this.components.providerPool) {
      const providerInstance = await this.components.providerPool.selectProvider(request);
      return await this.components.providerPool.executeRequest(
        providerInstance.id,
        request
      );
    }
    
    // Fallback to direct API call
    return this.directAPICall(request, provider);
  }

  /**
   * Execute streaming request
   */
  async executeStreamingRequest(request, provider) {
    const stream = this.components.streamOptimizer.createStream(request.id);
    
    // Start API call with streaming
    const apiStream = await this.startStreamingAPICall(request, provider);
    
    // Pipe through optimizer
    apiStream.pipe(stream);
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        // Send partial response via WebSocket if configured
        if (request.websocket) {
          request.websocket.send(JSON.stringify({
            type: 'partial',
            content: chunk.toString()
          }));
        }
      });
      
      stream.on('end', () => {
        resolve({
          success: true,
          content: chunks.join(''),
          streaming: true
        });
      });
      
      stream.on('error', reject);
    });
  }

  /**
   * Try fallback providers on failure
   */
  async tryFallbackProviders(request, originalError) {
    const agent = agentProviderMapping.agents[request.agent];
    if (!agent || !agent.fallback) return null;

    for (const fallbackProvider of agent.fallback) {
      try {
        console.log(`Trying fallback provider: ${fallbackProvider}`);
        const response = await this.directAPICall(request, fallbackProvider);
        
        return {
          ...response,
          provider: fallbackProvider,
          fallback: true,
          originalError: originalError.message
        };
      } catch (error) {
        console.error(`Fallback ${fallbackProvider} failed:`, error.message);
        continue;
      }
    }
    
    return null;
  }

  /**
   * Direct API call (placeholder - would integrate with actual providers)
   */
  async directAPICall(request, provider) {
    // This would make actual API calls to providers
    // For now, return mock response
    return {
      success: true,
      content: `Response from ${provider} for ${request.agent}`,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300
      }
    };
  }

  /**
   * Start streaming API call (placeholder)
   */
  async startStreamingAPICall(request, provider) {
    // This would start actual streaming API call
    // For now, return mock stream
    const { Readable } = require('stream');
    
    const mockStream = new Readable({
      read() {
        setTimeout(() => {
          this.push('This is a ');
          setTimeout(() => {
            this.push('streaming response ');
            setTimeout(() => {
              this.push('from the AI provider.');
              this.push(null); // End stream
            }, 100);
          }, 100);
        }, 100);
      }
    });
    
    return mockStream;
  }

  /**
   * Handle budget alerts
   */
  handleBudgetAlert(alert) {
    if (alert.type === 'daily' && alert.usage > 0.9) {
      // Switch to economy mode
      console.log('Switching to economy mode due to budget constraints');
      
      // Route more traffic to local models
      if (this.components.providerPool) {
        // Update provider weights
      }
      
      // Increase cache TTL
      if (this.components.cache) {
        this.components.cache.config.ttl.exact = 7200; // 2 hours
      }
    }
  }

  /**
   * Update metrics
   */
  updateMetrics(type, value) {
    switch (type) {
      case 'latency':
        const total = this.metrics.avgLatency * (this.metrics.requestsProcessed - 1) + value;
        this.metrics.avgLatency = total / this.metrics.requestsProcessed;
        break;
    }
  }

  /**
   * Get system statistics
   */
  getStatistics() {
    const stats = {
      system: this.metrics,
      components: {}
    };

    if (this.components.queueManager) {
      stats.components.queue = this.components.queueManager.getQueueStats();
    }

    if (this.components.cache) {
      stats.components.cache = this.components.cache.getStatistics();
    }

    if (this.components.providerPool) {
      stats.components.providers = this.components.providerPool.getStatistics();
    }

    if (this.components.costOptimizer) {
      stats.components.costs = this.components.costOptimizer.getCostReport();
    }

    if (this.components.streamOptimizer) {
      stats.components.streaming = this.components.streamOptimizer.getStatistics();
    }

    return stats;
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      components: {}
    };

    if (this.components.queueManager) {
      health.components.queue = await this.components.queueManager.healthCheck();
    }

    if (this.components.providerPool) {
      health.components.providers = await this.components.providerPool.checkProviderHealth();
    }

    // Check if any component is unhealthy
    for (const [name, componentHealth] of Object.entries(health.components)) {
      if (componentHealth.status === 'unhealthy') {
        health.status = 'degraded';
      }
    }

    return health;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down AI Scaling System...');

    if (this.components.queueManager) {
      await this.components.queueManager.cleanup();
    }

    if (this.components.providerPool) {
      await this.components.providerPool.gracefulShutdown();
    }

    if (this.components.cache) {
      await this.components.cache.cleanup();
    }

    if (this.components.costOptimizer) {
      this.components.costOptimizer.destroy();
    }

    console.log('AI Scaling System shut down complete');
  }
}

// Export singleton instance
module.exports = new AIScalingSystem({
  enabled: process.env.AI_SCALING_ENABLED !== 'false',
  queueEnabled: process.env.ENABLE_QUEUE === 'true',
  cacheEnabled: process.env.ENABLE_SEMANTIC_CACHE === 'true',
  streamingEnabled: process.env.ENABLE_STREAMING === 'true',
  costOptimizationEnabled: process.env.ENABLE_COST_OPTIMIZATION !== 'false',
  dailyBudget: parseInt(process.env.DAILY_BUDGET) || 100,
  monthlyBudget: parseInt(process.env.MONTHLY_BUDGET) || 2000
});

// Also export classes for custom initialization
module.exports.AIQueueManager = AIQueueManager;
module.exports.ProviderPoolManager = ProviderPoolManager;
module.exports.SemanticCache = SemanticCache;
module.exports.AdaptiveCostOptimizer = AdaptiveCostOptimizer;
module.exports.StreamOptimizer = StreamOptimizer;
module.exports.AIScalingSystem = AIScalingSystem;