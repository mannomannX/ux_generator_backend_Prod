// ==========================================
// AI Provider Manager - Unified Interface
// ==========================================

import { GeminiProvider } from './gemini-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';

export class AIProviderManager {
  constructor(config, logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.config = config;
    this.providers = {};
    this.qualityConfig = {};
    this.usageMetrics = new Map();
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize Gemini
      if (this.config.gemini?.apiKey) {
        this.providers.gemini = new GeminiProvider(
          this.config.gemini.apiKey,
          this.logger
        );
        await this.providers.gemini.initialize();
      }

      // Initialize OpenAI
      if (this.config.openai?.apiKey) {
        this.providers.openai = new OpenAIProvider(
          this.config.openai.apiKey,
          this.logger
        );
        await this.providers.openai.initialize();
      }

      // Initialize Anthropic
      if (this.config.anthropic?.apiKey) {
        this.providers.anthropic = new AnthropicProvider(
          this.config.anthropic.apiKey,
          this.logger
        );
        await this.providers.anthropic.initialize();
      }

      // Load quality configurations from Redis
      await this.loadQualityConfig();

      this.initialized = true;
      this.logger.info('AI Provider Manager initialized', {
        providers: Object.keys(this.providers)
      });
    } catch (error) {
      this.logger.error('Failed to initialize AI Provider Manager', error);
      throw error;
    }
  }

  async loadQualityConfig() {
    try {
      const configStr = await this.redisClient.get('ai:quality:config');
      if (configStr) {
        this.qualityConfig = JSON.parse(configStr);
      } else {
        // Default quality configuration
        this.qualityConfig = {
          agents: {
            planner: {
              normal: { provider: 'gemini', model: 'gemini-1.5-flash' },
              pro: { provider: 'openai', model: 'gpt-4-turbo-preview' }
            },
            architect: {
              normal: { provider: 'gemini', model: 'gemini-1.5-pro' },
              pro: { provider: 'anthropic', model: 'claude-3-opus-20240229' }
            },
            validator: {
              normal: { provider: 'gemini', model: 'gemini-1.5-flash' },
              pro: { provider: 'openai', model: 'gpt-4' }
            },
            learner: {
              normal: { provider: 'openai', model: 'gpt-3.5-turbo' },
              pro: { provider: 'anthropic', model: 'claude-3-sonnet-20240229' }
            },
            critic: {
              normal: { provider: 'gemini', model: 'gemini-pro' },
              pro: { provider: 'anthropic', model: 'claude-3-opus-20240229' }
            }
          },
          defaults: {
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            temperature: 0.7,
            maxTokens: 2048
          }
        };
        
        // Save default config
        await this.saveQualityConfig();
      }
    } catch (error) {
      this.logger.error('Failed to load quality config', error);
    }
  }

  async saveQualityConfig() {
    try {
      await this.redisClient.set(
        'ai:quality:config',
        JSON.stringify(this.qualityConfig),
        'EX',
        86400 // 24 hours
      );
    } catch (error) {
      this.logger.error('Failed to save quality config', error);
    }
  }

  async updateQualityConfig(agentName, qualityMode, providerConfig) {
    if (!this.qualityConfig.agents[agentName]) {
      this.qualityConfig.agents[agentName] = {};
    }
    
    this.qualityConfig.agents[agentName][qualityMode] = providerConfig;
    await this.saveQualityConfig();
    
    this.logger.info('Updated quality config', {
      agentName,
      qualityMode,
      providerConfig
    });
  }

  getProviderForAgent(agentName, qualityMode = 'normal') {
    const agentConfig = this.qualityConfig.agents[agentName];
    
    if (!agentConfig) {
      return this.qualityConfig.defaults;
    }
    
    return agentConfig[qualityMode] || agentConfig.normal || this.qualityConfig.defaults;
  }

  async generate(prompt, options = {}) {
    const {
      provider: providerName,
      model,
      agentName,
      qualityMode = 'normal',
      ...genOptions
    } = options;

    // Determine provider and model based on agent and quality mode
    let selectedProvider, selectedModel;
    
    if (agentName) {
      const config = this.getProviderForAgent(agentName, qualityMode);
      selectedProvider = config.provider;
      selectedModel = config.model;
    } else {
      selectedProvider = providerName || this.qualityConfig.defaults.provider;
      selectedModel = model || this.qualityConfig.defaults.model;
    }

    // Get the provider instance
    const provider = this.providers[selectedProvider];
    
    if (!provider) {
      throw new Error(`Provider ${selectedProvider} not available`);
    }

    // Track start time for metrics
    const startTime = Date.now();

    try {
      // Generate response
      const result = await provider.generateText(prompt, {
        model: selectedModel,
        ...genOptions
      });

      // Track usage metrics
      await this.trackUsage(selectedProvider, selectedModel, result.usage, Date.now() - startTime);

      // Add provider info to result
      result.provider = selectedProvider;
      result.agentName = agentName;
      result.qualityMode = qualityMode;

      return result;

    } catch (error) {
      this.logger.error('Generation failed', error, {
        provider: selectedProvider,
        model: selectedModel,
        agentName
      });
      
      // Try fallback provider if available
      if (selectedProvider !== 'gemini' && this.providers.gemini) {
        this.logger.info('Falling back to Gemini provider');
        return this.providers.gemini.generateText(prompt, genOptions);
      }
      
      throw error;
    }
  }

  async generateWithImage(prompt, imageData, options = {}) {
    const {
      provider: providerName,
      model,
      agentName,
      qualityMode = 'normal',
      ...genOptions
    } = options;

    // Vision-capable models
    const visionProviders = {
      gemini: 'gemini-pro-vision',
      openai: 'gpt-4-vision-preview',
      anthropic: 'claude-3-opus-20240229'
    };

    const selectedProvider = providerName || 'gemini';
    const selectedModel = model || visionProviders[selectedProvider];

    const provider = this.providers[selectedProvider];
    
    if (!provider) {
      throw new Error(`Provider ${selectedProvider} not available`);
    }

    try {
      const result = await provider.generateWithImage(prompt, imageData, {
        model: selectedModel,
        ...genOptions
      });

      await this.trackUsage(selectedProvider, selectedModel, result.usage);

      result.provider = selectedProvider;
      return result;

    } catch (error) {
      this.logger.error('Vision generation failed', error);
      throw error;
    }
  }

  async generateChat(messages, options = {}) {
    const {
      provider: providerName,
      model,
      agentName,
      qualityMode = 'normal',
      ...genOptions
    } = options;

    let selectedProvider, selectedModel;
    
    if (agentName) {
      const config = this.getProviderForAgent(agentName, qualityMode);
      selectedProvider = config.provider;
      selectedModel = config.model;
    } else {
      selectedProvider = providerName || this.qualityConfig.defaults.provider;
      selectedModel = model || this.qualityConfig.defaults.model;
    }

    const provider = this.providers[selectedProvider];
    
    if (!provider) {
      throw new Error(`Provider ${selectedProvider} not available`);
    }

    try {
      const result = await provider.generateChat(messages, {
        model: selectedModel,
        ...genOptions
      });

      await this.trackUsage(selectedProvider, selectedModel, result.usage);

      result.provider = selectedProvider;
      return result;

    } catch (error) {
      this.logger.error('Chat generation failed', error);
      throw error;
    }
  }

  async generateEmbedding(text, options = {}) {
    // Default to OpenAI for embeddings as it's most cost-effective
    const provider = this.providers.openai || this.providers.gemini;
    
    if (!provider) {
      throw new Error('No embedding-capable provider available');
    }

    try {
      return await provider.generateEmbedding(text, options);
    } catch (error) {
      this.logger.error('Embedding generation failed', error);
      throw error;
    }
  }

  async streamGenerate(prompt, options = {}, onChunk) {
    const {
      provider: providerName,
      model,
      agentName,
      qualityMode = 'normal',
      ...genOptions
    } = options;

    let selectedProvider, selectedModel;
    
    if (agentName) {
      const config = this.getProviderForAgent(agentName, qualityMode);
      selectedProvider = config.provider;
      selectedModel = config.model;
    } else {
      selectedProvider = providerName || this.qualityConfig.defaults.provider;
      selectedModel = model || this.qualityConfig.defaults.model;
    }

    const provider = this.providers[selectedProvider];
    
    if (!provider) {
      throw new Error(`Provider ${selectedProvider} not available`);
    }

    try {
      const result = await provider.streamGenerate(prompt, {
        model: selectedModel,
        ...genOptions
      }, onChunk);

      await this.trackUsage(selectedProvider, selectedModel, result.usage);

      result.provider = selectedProvider;
      return result;

    } catch (error) {
      this.logger.error('Stream generation failed', error);
      throw error;
    }
  }

  async trackUsage(provider, model, usage, duration) {
    try {
      const key = `${provider}:${model}`;
      
      if (!this.usageMetrics.has(key)) {
        this.usageMetrics.set(key, {
          totalRequests: 0,
          totalTokens: 0,
          totalDuration: 0,
          errors: 0
        });
      }

      const metrics = this.usageMetrics.get(key);
      metrics.totalRequests++;
      metrics.totalTokens += usage.totalTokens || 0;
      metrics.totalDuration += duration || 0;

      // Store in Redis for persistence
      await this.redisClient.hincrby('ai:usage:requests', key, 1);
      await this.redisClient.hincrby('ai:usage:tokens', key, usage.totalTokens || 0);

      // Emit metrics event
      if (metrics.totalRequests % 100 === 0) {
        this.logger.info('AI usage milestone', {
          provider,
          model,
          metrics
        });
      }

    } catch (error) {
      this.logger.error('Failed to track usage', error);
    }
  }

  async checkHealth() {
    const healthStatus = {};

    for (const [name, provider] of Object.entries(this.providers)) {
      try {
        healthStatus[name] = await provider.checkHealth();
      } catch (error) {
        healthStatus[name] = {
          status: 'error',
          error: error.message
        };
      }
    }

    return healthStatus;
  }

  getAvailableProviders() {
    return Object.keys(this.providers);
  }

  getProviderCapabilities(providerName) {
    const provider = this.providers[providerName];
    
    if (!provider) {
      return null;
    }

    return {
      models: provider.getAvailableModels(),
      capabilities: provider.getAvailableModels().map(model => ({
        model,
        ...provider.getModelCapabilities(model)
      }))
    };
  }

  async getUsageStatistics() {
    const stats = {};

    for (const [key, metrics] of this.usageMetrics.entries()) {
      const [provider, model] = key.split(':');
      
      if (!stats[provider]) {
        stats[provider] = {};
      }

      stats[provider][model] = {
        ...metrics,
        averageTokensPerRequest: metrics.totalTokens / metrics.totalRequests,
        averageDuration: metrics.totalDuration / metrics.totalRequests
      };
    }

    return stats;
  }

  async resetUsageStatistics() {
    this.usageMetrics.clear();
    await this.redisClient.del('ai:usage:requests');
    await this.redisClient.del('ai:usage:tokens');
    this.logger.info('Usage statistics reset');
  }
}