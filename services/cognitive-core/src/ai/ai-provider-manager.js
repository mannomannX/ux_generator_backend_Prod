// ==========================================
// COGNITIVE CORE - AI Provider Manager
// Multi-provider integration with cost management
// ==========================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export class AIProviderManager {
  constructor(logger, mongoClient, redisClient, billingService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.billingService = billingService;
    
    // Provider configurations
    this.providers = {
      google: {
        client: new GoogleGenerativeAI(process.env.GOOGLE_API_KEY),
        models: {
          'gemini-1.5-flash': { 
            costPer1kTokens: 0.00015, // Input: $0.15/1M tokens
            mode: 'standard',
            maxTokens: 1048576,
            contextWindow: 1048576
          },
          'gemini-1.5-pro': { 
            costPer1kTokens: 0.0035, // Input: $3.50/1M tokens
            mode: 'pro',
            maxTokens: 2097152,
            contextWindow: 2097152
          }
        },
        available: true
      },
      anthropic: {
        client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
        models: {
          'claude-3-haiku-20240307': { 
            costPer1kTokens: 0.00025, // Input: $0.25/1M tokens
            mode: 'standard',
            maxTokens: 200000,
            contextWindow: 200000
          },
          'claude-3-opus-20240229': { 
            costPer1kTokens: 0.015, // Input: $15/1M tokens
            mode: 'pro',
            maxTokens: 200000,
            contextWindow: 200000
          }
        },
        available: !!process.env.ANTHROPIC_API_KEY
      },
      openai: {
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        models: {
          'gpt-4o-mini': { 
            costPer1kTokens: 0.00015, // Input: $0.15/1M tokens
            mode: 'standard',
            maxTokens: 128000,
            contextWindow: 128000
          },
          'gpt-4o': { 
            costPer1kTokens: 0.005, // Input: $5/1M tokens
            mode: 'pro',
            maxTokens: 128000,
            contextWindow: 128000
          }
        },
        available: !!process.env.OPENAI_API_KEY
      }
    };
    
    // Quality mode configurations
    this.qualityModes = {
      standard: {
        preferredProviders: ['google', 'openai', 'anthropic'],
        modelSelection: 'cost_optimized', // Prefer cheaper models
        maxCostPer1kTokens: 0.001
      },
      pro: {
        preferredProviders: ['anthropic', 'openai', 'google'],
        modelSelection: 'quality_optimized', // Prefer better models
        maxCostPer1kTokens: 0.02
      }
    };
    
    // Fallback chain based on cost and availability
    this.fallbackChain = [
      { provider: 'google', model: 'gemini-1.5-flash' },
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      { provider: 'google', model: 'gemini-1.5-pro' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'anthropic', model: 'claude-3-opus-20240229' }
    ];
    
    this.initialize();
  }

  /**
   * Initialize AI provider manager
   */
  async initialize() {
    try {
      // Test provider connectivity
      await this.testProviderConnectivity();
      
      // Load cached model performance data
      await this.loadModelPerformanceCache();
      
      this.logger.info('AI Provider Manager initialized', {
        availableProviders: this.getAvailableProviders(),
        totalModels: this.getTotalModelCount()
      });

    } catch (error) {
      this.logger.error('Failed to initialize AI Provider Manager', error);
    }
  }

  /**
   * Generate AI response with provider selection and fallback
   */
  async generateResponse(request) {
    const {
      prompt,
      agentType,
      qualityMode = 'standard',
      userId,
      workspaceId,
      maxTokens = null,
      context = {}
    } = request;

    // Check budget limits first
    const budgetCheck = await this.checkBudgetLimits(userId, workspaceId);
    if (!budgetCheck.allowed) {
      throw new Error(`Budget limit exceeded: ${budgetCheck.reason}`);
    }

    // Determine optimal provider and model
    const selection = await this.selectOptimalProvider(request);
    
    // Track start time for performance monitoring
    const startTime = Date.now();
    
    try {
      // Generate response using selected provider
      const response = await this.callProvider(selection, {
        prompt,
        agentType,
        maxTokens: maxTokens || selection.model.maxTokens,
        context
      });
      
      // Track usage and costs
      await this.trackUsage(userId, workspaceId, selection, response);
      
      // Cache response for semantic caching
      await this.cacheResponse(prompt, response, selection);
      
      const duration = Date.now() - startTime;
      
      this.logger.info('AI response generated', {
        provider: selection.provider,
        model: selection.modelName,
        agentType,
        qualityMode,
        duration,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cost: response.usage.cost
      });

      return {
        content: response.content,
        provider: selection.provider,
        model: selection.modelName,
        usage: response.usage,
        duration,
        cached: false
      };

    } catch (error) {
      this.logger.error('Provider call failed, trying fallback', error, {
        provider: selection.provider,
        model: selection.modelName
      });
      
      // Try fallback providers
      return await this.handleProviderFallback(request, selection, error);
    }
  }

  /**
   * Select optimal provider based on requirements
   */
  async selectOptimalProvider(request) {
    const { qualityMode = 'standard', prompt, agentType, complexity = 'medium' } = request;
    
    // Check semantic cache first
    const cachedResponse = await this.checkSemanticCache(prompt);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Determine complexity-based requirements
    const requirements = this.analyzeRequirements(prompt, agentType, complexity);
    
    // Get mode configuration
    const modeConfig = this.qualityModes[qualityMode];
    
    // Find best matching provider and model
    for (const providerName of modeConfig.preferredProviders) {
      const provider = this.providers[providerName];
      
      if (!provider.available) continue;
      
      // Find suitable model for this provider
      for (const [modelName, modelConfig] of Object.entries(provider.models)) {
        // Check if model matches quality mode
        if (qualityMode === 'pro' && modelConfig.mode !== 'pro') continue;
        if (qualityMode === 'standard' && modelConfig.costPer1kTokens > modeConfig.maxCostPer1kTokens) continue;
        
        // Check if model can handle requirements
        if (requirements.minContextWindow && modelConfig.contextWindow < requirements.minContextWindow) continue;
        
        return {
          provider: providerName,
          modelName,
          model: modelConfig,
          client: provider.client
        };
      }
    }
    
    // Fallback to first available model
    return this.getFirstAvailableModel();
  }

  /**
   * Analyze prompt requirements
   */
  analyzeRequirements(prompt, agentType, complexity) {
    const requirements = {
      minContextWindow: 4000,
      preferredMode: 'standard'
    };
    
    // Estimate context window needs
    const estimatedTokens = prompt.length * 1.3; // Rough estimation
    
    if (estimatedTokens > 8000) requirements.minContextWindow = 16000;
    if (estimatedTokens > 32000) requirements.minContextWindow = 64000;
    
    // Complex agents need pro mode
    if (['architect', 'planner', 'validator'].includes(agentType)) {
      requirements.preferredMode = 'pro';
    }
    
    // High complexity tasks need pro mode
    if (complexity === 'high') {
      requirements.preferredMode = 'pro';
    }
    
    return requirements;
  }

  /**
   * Call specific AI provider
   */
  async callProvider(selection, request) {
    const { provider, modelName, client } = selection;
    const { prompt, maxTokens, context } = request;
    
    switch (provider) {
      case 'google':
        return await this.callGoogleAI(client, modelName, prompt, maxTokens, context);
      
      case 'anthropic':
        return await this.callAnthropicAI(client, modelName, prompt, maxTokens, context);
      
      case 'openai':
        return await this.callOpenAI(client, modelName, prompt, maxTokens, context);
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call Google AI (Gemini)
   */
  async callGoogleAI(client, model, prompt, maxTokens, context) {
    const generativeModel = client.getGenerativeModel({ 
      model,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: context.temperature || 0.7
      }
    });

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    
    // Extract usage information
    const usage = {
      inputTokens: result.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: result.response.usageMetadata?.totalTokenCount || 0
    };
    
    // Calculate cost
    const modelConfig = this.providers.google.models[model];
    usage.cost = (usage.inputTokens / 1000) * modelConfig.costPer1kTokens;
    
    return {
      content: response.text(),
      usage,
      provider: 'google',
      model
    };
  }

  /**
   * Call Anthropic AI (Claude)
   */
  async callAnthropicAI(client, model, prompt, maxTokens, context) {
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: context.temperature || 0.7,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens
    };
    
    // Calculate cost
    const modelConfig = this.providers.anthropic.models[model];
    usage.cost = (usage.inputTokens / 1000) * modelConfig.costPer1kTokens;
    
    return {
      content: message.content[0].text,
      usage,
      provider: 'anthropic',
      model
    };
  }

  /**
   * Call OpenAI
   */
  async callOpenAI(client, model, prompt, maxTokens, context) {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: context.temperature || 0.7
    });

    const usage = {
      inputTokens: completion.usage.prompt_tokens,
      outputTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens
    };
    
    // Calculate cost
    const modelConfig = this.providers.openai.models[model];
    usage.cost = (usage.inputTokens / 1000) * modelConfig.costPer1kTokens;
    
    return {
      content: completion.choices[0].message.content,
      usage,
      provider: 'openai',
      model
    };
  }

  /**
   * Handle provider fallback on failure
   */
  async handleProviderFallback(request, failedSelection, error) {
    const { qualityMode } = request;
    
    // Mark provider as temporarily unavailable
    await this.markProviderUnavailable(failedSelection.provider, 300); // 5 minutes
    
    // Try fallback chain
    for (const fallback of this.fallbackChain) {
      if (fallback.provider === failedSelection.provider) continue; // Skip failed provider
      
      const provider = this.providers[fallback.provider];
      if (!provider.available) continue;
      
      const modelConfig = provider.models[fallback.model];
      if (!modelConfig) continue;
      
      // Check if fallback model matches quality requirements
      if (qualityMode === 'pro' && modelConfig.mode !== 'pro') continue;
      
      try {
        const fallbackSelection = {
          provider: fallback.provider,
          modelName: fallback.model,
          model: modelConfig,
          client: provider.client
        };
        
        const response = await this.callProvider(fallbackSelection, request);
        
        this.logger.info('Fallback provider succeeded', {
          originalProvider: failedSelection.provider,
          fallbackProvider: fallback.provider,
          model: fallback.model
        });
        
        // Track usage for fallback
        await this.trackUsage(request.userId, request.workspaceId, fallbackSelection, response);
        
        return {
          content: response.content,
          provider: fallback.provider,
          model: fallback.model,
          usage: response.usage,
          fallback: true
        };
        
      } catch (fallbackError) {
        this.logger.warn('Fallback provider also failed', fallbackError, {
          provider: fallback.provider,
          model: fallback.model
        });
        continue;
      }
    }
    
    // All providers failed
    throw new Error('All AI providers are currently unavailable');
  }

  /**
   * Check budget limits for user/workspace
   */
  async checkBudgetLimits(userId, workspaceId) {
    try {
      // Get user's current usage
      const usage = await this.billingService.getCurrentAIUsage(userId, workspaceId);
      
      // Get user's tier and limits
      const userTier = await this.billingService.getUserTier(userId);
      const limits = await this.getBudgetLimits(userTier);
      
      // Check daily limit
      if (usage.dailyCost >= limits.dailyLimit) {
        return {
          allowed: false,
          reason: `Daily AI budget limit (${limits.dailyLimit}) exceeded`
        };
      }
      
      // Check monthly limit
      if (usage.monthlyCost >= limits.monthlyLimit) {
        return {
          allowed: false,
          reason: `Monthly AI budget limit (${limits.monthlyLimit}) exceeded`
        };
      }
      
      return { allowed: true };
      
    } catch (error) {
      this.logger.error('Failed to check budget limits', error);
      // Allow on error to prevent service disruption
      return { allowed: true };
    }
  }

  /**
   * Get budget limits based on user tier
   */
  async getBudgetLimits(tier) {
    const limits = {
      free: {
        dailyLimit: 1.0, // $1 per day
        monthlyLimit: 10.0 // $10 per month
      },
      pro: {
        dailyLimit: 50.0, // $50 per day
        monthlyLimit: 500.0 // $500 per month
      },
      enterprise: {
        dailyLimit: parseFloat(process.env.ENTERPRISE_DAILY_AI_LIMIT) || 1000.0,
        monthlyLimit: parseFloat(process.env.ENTERPRISE_MONTHLY_AI_LIMIT) || 10000.0
      }
    };
    
    return limits[tier] || limits.free;
  }

  /**
   * Track AI usage and costs
   */
  async trackUsage(userId, workspaceId, selection, response) {
    try {
      const usage = {
        userId,
        workspaceId,
        provider: selection.provider,
        model: selection.modelName,
        agentType: response.agentType,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        cost: response.usage.cost,
        timestamp: new Date()
      };
      
      // Store detailed usage in database
      const db = this.mongoClient.getDb();
      await db.collection('ai_usage').insertOne(usage);
      
      // Update billing service
      await this.billingService.trackAIUsage(usage);
      
      // Cache current usage for quick access
      await this.cacheUsageData(userId, workspaceId, usage);
      
    } catch (error) {
      this.logger.error('Failed to track AI usage', error);
    }
  }

  /**
   * Check semantic cache for similar prompts
   */
  async checkSemanticCache(prompt) {
    try {
      // Create prompt hash
      const promptHash = this.createPromptHash(prompt);
      
      // Check exact match first
      const exactMatch = await this.redisClient.get(`ai_cache:exact:${promptHash}`);
      if (exactMatch) {
        const cached = JSON.parse(exactMatch);
        
        this.logger.debug('Exact cache hit', { promptHash: promptHash.substring(0, 8) });
        
        return {
          ...cached,
          cached: true
        };
      }
      
      // TODO: Implement semantic similarity checking
      // For now, only exact matches are cached
      
      return null;
      
    } catch (error) {
      this.logger.error('Failed to check semantic cache', error);
      return null;
    }
  }

  /**
   * Cache AI response for future use
   */
  async cacheResponse(prompt, response, selection) {
    try {
      const promptHash = this.createPromptHash(prompt);
      
      const cacheData = {
        content: response.content,
        provider: selection.provider,
        model: selection.modelName,
        usage: response.usage,
        timestamp: new Date(),
        ttl: 3600 // 1 hour
      };
      
      // Cache exact match
      await this.redisClient.setex(
        `ai_cache:exact:${promptHash}`,
        cacheData.ttl,
        JSON.stringify(cacheData)
      );
      
      // Cache semantic embeddings for similarity matching
      // TODO: Implement semantic caching with vector similarity
      
    } catch (error) {
      this.logger.error('Failed to cache AI response', error);
    }
  }

  /**
   * Create hash for prompt caching
   */
  createPromptHash(prompt) {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(prompt.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Cache usage data for quick access
   */
  async cacheUsageData(userId, workspaceId, usage) {
    try {
      // Update daily usage
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `usage:daily:${userId}:${today}`;
      
      await this.redisClient.hincrbyfloat(dailyKey, 'cost', usage.cost);
      await this.redisClient.hincrby(dailyKey, 'requests', 1);
      await this.redisClient.expire(dailyKey, 86400 * 31); // Keep for 31 days
      
      // Update monthly usage
      const month = new Date().toISOString().substring(0, 7); // YYYY-MM
      const monthlyKey = `usage:monthly:${userId}:${month}`;
      
      await this.redisClient.hincrbyfloat(monthlyKey, 'cost', usage.cost);
      await this.redisClient.hincrby(monthlyKey, 'requests', 1);
      await this.redisClient.expire(monthlyKey, 86400 * 365); // Keep for 1 year
      
    } catch (error) {
      this.logger.error('Failed to cache usage data', error);
    }
  }

  /**
   * Test provider connectivity
   */
  async testProviderConnectivity() {
    const testPrompt = "Hello, this is a connectivity test.";
    
    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (!provider.available) {
        this.logger.warn(`Provider ${providerName} not available (missing API key)`);
        continue;
      }
      
      try {
        // Test with cheapest model
        const cheapestModel = this.getCheapestModel(provider.models);
        const selection = {
          provider: providerName,
          modelName: cheapestModel.name,
          model: cheapestModel.config,
          client: provider.client
        };
        
        await this.callProvider(selection, {
          prompt: testPrompt,
          maxTokens: 10
        });
        
        this.logger.info(`Provider ${providerName} connectivity test passed`);
        
      } catch (error) {
        this.logger.error(`Provider ${providerName} connectivity test failed`, error);
        provider.available = false;
      }
    }
  }

  /**
   * Get cheapest model from provider
   */
  getCheapestModel(models) {
    let cheapest = null;
    let lowestCost = Infinity;
    
    for (const [name, config] of Object.entries(models)) {
      if (config.costPer1kTokens < lowestCost) {
        lowestCost = config.costPer1kTokens;
        cheapest = { name, config };
      }
    }
    
    return cheapest;
  }

  /**
   * Get first available model as fallback
   */
  getFirstAvailableModel() {
    for (const [providerName, provider] of Object.entries(this.providers)) {
      if (!provider.available) continue;
      
      for (const [modelName, modelConfig] of Object.entries(provider.models)) {
        return {
          provider: providerName,
          modelName,
          model: modelConfig,
          client: provider.client
        };
      }
    }
    
    throw new Error('No available AI providers');
  }

  /**
   * Mark provider as temporarily unavailable
   */
  async markProviderUnavailable(providerName, durationSeconds) {
    try {
      const key = `provider:unavailable:${providerName}`;
      await this.redisClient.setex(key, durationSeconds, 'true');
      
      // Update in-memory availability
      if (this.providers[providerName]) {
        this.providers[providerName].available = false;
      }
      
      // Set timer to restore availability
      setTimeout(() => {
        if (this.providers[providerName]) {
          this.providers[providerName].available = true;
        }
      }, durationSeconds * 1000);
      
    } catch (error) {
      this.logger.error('Failed to mark provider unavailable', error);
    }
  }

  /**
   * Load model performance cache
   */
  async loadModelPerformanceCache() {
    try {
      // Load cached performance metrics
      // This would include average response times, error rates, etc.
      // For now, we'll use default values
      
      this.logger.debug('Model performance cache loaded');
      
    } catch (error) {
      this.logger.error('Failed to load model performance cache', error);
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([, provider]) => provider.available)
      .map(([name]) => name);
  }

  /**
   * Get total model count
   */
  getTotalModelCount() {
    return Object.values(this.providers)
      .filter(provider => provider.available)
      .reduce((total, provider) => total + Object.keys(provider.models).length, 0);
  }

  /**
   * Get provider usage statistics
   */
  async getProviderStats() {
    try {
      const db = this.mongoClient.getDb();
      
      // Get usage stats for last 24 hours
      const stats = await db.collection('ai_usage').aggregate([
        {
          $match: {
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              provider: '$provider',
              model: '$model'
            },
            requests: { $sum: 1 },
            totalCost: { $sum: '$cost' },
            totalTokens: { $sum: '$totalTokens' },
            avgTokens: { $avg: '$totalTokens' }
          }
        }
      ]).toArray();

      return {
        period: '24h',
        stats,
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to get provider stats', error);
      return null;
    }
  }
}

export default AIProviderManager;