// ==========================================
// SERVICES/COGNITIVE-CORE/src/providers/ai-provider-factory.js
// ==========================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

/**
 * Base AI Provider Interface
 */
class BaseAIProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = 'base';
    this.requestCount = 0;
    this.errorCount = 0;
    this.totalLatency = 0;
    this.isHealthy = true;
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
  }

  async generateResponse(prompt, options = {}) {
    throw new Error('generateResponse must be implemented by provider');
  }

  async streamResponse(prompt, options = {}) {
    throw new Error('streamResponse must be implemented by provider');
  }

  async embedText(text) {
    throw new Error('embedText must be implemented by provider');
  }

  async healthCheck() {
    try {
      const start = Date.now();
      await this.generateResponse('Hello', { maxTokens: 5 });
      this.isHealthy = true;
      return {
        status: 'healthy',
        latency: Date.now() - start,
        requestCount: this.requestCount,
        errorRate: this.errorCount / Math.max(1, this.requestCount)
      };
    } catch (error) {
      this.isHealthy = false;
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  getCacheKey(prompt, options) {
    return `${this.name}:${JSON.stringify({ prompt: prompt.substring(0, 100), ...options })}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      this.logger.debug(`Cache hit for ${this.name}`);
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setInCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  trackMetrics(startTime, success = true) {
    this.requestCount++;
    if (!success) this.errorCount++;
    this.totalLatency += Date.now() - startTime;
  }

  getMetrics() {
    return {
      provider: this.name,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.errorCount / Math.max(1, this.requestCount),
      avgLatency: this.totalLatency / Math.max(1, this.requestCount),
      isHealthy: this.isHealthy
    };
  }
}

/**
 * Google Gemini Provider
 */
class GeminiProvider extends BaseAIProvider {
  constructor(config, logger) {
    super(config, logger);
    this.name = 'gemini';
    
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }
    
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.models = {
      flash: this.client.getGenerativeModel({ model: 'gemini-1.5-flash' }),
      pro: this.client.getGenerativeModel({ model: 'gemini-1.5-pro' }),
      embedding: this.client.getGenerativeModel({ model: 'embedding-001' })
    };
  }

  async generateResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check cache
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
      
      const model = options.model === 'pro' ? this.models.pro : this.models.flash;
      
      const generationConfig = {
        temperature: options.temperature || 0.7,
        topK: options.topK || 40,
        topP: options.topP || 0.95,
        maxOutputTokens: options.maxTokens || 2048,
        stopSequences: options.stopSequences || []
      };

      const safetySettings = [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH'
        }
      ];

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings
      });

      const response = await result.response;
      const text = response.text();
      
      const responseData = {
        content: text,
        model: model.model,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0
        },
        finishReason: response.candidates?.[0]?.finishReason || 'STOP'
      };
      
      // Cache the response
      this.setInCache(cacheKey, responseData);
      
      this.trackMetrics(startTime, true);
      return responseData;
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Gemini generation failed', error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }

  async streamResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const model = options.model === 'pro' ? this.models.pro : this.models.flash;
      
      const generationConfig = {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 2048
      };

      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });

      this.trackMetrics(startTime, true);
      
      // Return async generator for streaming
      return {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              yield { content: text, done: false };
            }
          }
          yield { content: '', done: true };
        }
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Gemini streaming failed', error);
      throw new Error(`Gemini streaming error: ${error.message}`);
    }
  }

  async embedText(text) {
    const startTime = Date.now();
    
    try {
      const model = this.models.embedding;
      const result = await model.embedContent(text);
      const embedding = result.embedding;
      
      this.trackMetrics(startTime, true);
      
      return {
        embedding: embedding.values,
        model: 'embedding-001',
        dimensions: embedding.values.length
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Gemini embedding failed', error);
      throw new Error(`Gemini embedding error: ${error.message}`);
    }
  }
}

/**
 * OpenAI GPT Provider
 */
class OpenAIProvider extends BaseAIProvider {
  constructor(config, logger) {
    super(config, logger);
    this.name = 'openai';
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 3,
      timeout: 30000
    });
  }

  async generateResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check cache
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
      
      const model = options.model || 'gpt-4-turbo-preview';
      
      const completion = await this.client.chat.completions.create({
        model,
        messages: [
          { 
            role: 'system', 
            content: options.systemPrompt || 'You are a helpful AI assistant specializing in UX design and flow creation.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        top_p: options.topP || 0.95,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
        stop: options.stopSequences
      });

      const responseData = {
        content: completion.choices[0].message.content,
        model: completion.model,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        },
        finishReason: completion.choices[0].finish_reason
      };
      
      // Cache the response
      this.setInCache(cacheKey, responseData);
      
      this.trackMetrics(startTime, true);
      return responseData;
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('OpenAI generation failed', error);
      throw new Error(`OpenAI error: ${error.message}`);
    }
  }

  async streamResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const model = options.model || 'gpt-4-turbo-preview';
      
      const stream = await this.client.chat.completions.create({
        model,
        messages: [
          { 
            role: 'system', 
            content: options.systemPrompt || 'You are a helpful AI assistant.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        stream: true
      });

      this.trackMetrics(startTime, true);
      
      // Return async generator for streaming
      return {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              yield { content, done: false };
            }
            if (chunk.choices[0]?.finish_reason) {
              yield { content: '', done: true, finishReason: chunk.choices[0].finish_reason };
            }
          }
        }
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('OpenAI streaming failed', error);
      throw new Error(`OpenAI streaming error: ${error.message}`);
    }
  }

  async embedText(text) {
    const startTime = Date.now();
    
    try {
      const embedding = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      });
      
      this.trackMetrics(startTime, true);
      
      return {
        embedding: embedding.data[0].embedding,
        model: embedding.model,
        dimensions: embedding.data[0].embedding.length
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('OpenAI embedding failed', error);
      throw new Error(`OpenAI embedding error: ${error.message}`);
    }
  }
}

/**
 * Anthropic Claude Provider
 */
class ClaudeProvider extends BaseAIProvider {
  constructor(config, logger) {
    super(config, logger);
    this.name = 'claude';
    
    if (!config.apiKey) {
      throw new Error('Claude API key is required');
    }
    
    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: 3
    });
  }

  async generateResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check cache
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
      
      const model = options.model || 'claude-3-sonnet-20240229';
      
      const message = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        system: options.systemPrompt || 'You are a helpful AI assistant specializing in UX design.',
        messages: [
          { role: 'user', content: prompt }
        ],
        stop_sequences: options.stopSequences
      });

      const responseData = {
        content: message.content[0].text,
        model: message.model,
        usage: {
          promptTokens: message.usage?.input_tokens || 0,
          completionTokens: message.usage?.output_tokens || 0,
          totalTokens: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0)
        },
        finishReason: message.stop_reason
      };
      
      // Cache the response
      this.setInCache(cacheKey, responseData);
      
      this.trackMetrics(startTime, true);
      return responseData;
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Claude generation failed', error);
      throw new Error(`Claude error: ${error.message}`);
    }
  }

  async streamResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const model = options.model || 'claude-3-sonnet-20240229';
      
      const stream = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        system: options.systemPrompt || 'You are a helpful AI assistant.',
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: true
      });

      this.trackMetrics(startTime, true);
      
      // Return async generator for streaming
      return {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta') {
              yield { content: chunk.delta.text, done: false };
            }
            if (chunk.type === 'message_stop') {
              yield { content: '', done: true };
            }
          }
        }
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Claude streaming failed', error);
      throw new Error(`Claude streaming error: ${error.message}`);
    }
  }

  async embedText(text) {
    // Claude doesn't have a native embedding model, use OpenAI for embeddings
    throw new Error('Claude does not support embeddings. Use OpenAI or Gemini for embeddings.');
  }
}

/**
 * Local Llama Provider
 */
class LlamaProvider extends BaseAIProvider {
  constructor(config, logger) {
    super(config, logger);
    this.name = 'llama';
    this.endpoint = config.endpoint || 'http://localhost:11434';
    this.model = config.model || 'llama2';
  }

  async generateResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check cache
      const cacheKey = this.getCacheKey(prompt, options);
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
      
      const response = await axios.post(`${this.endpoint}/api/generate`, {
        model: options.model || this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          top_k: options.topK || 40,
          top_p: options.topP || 0.95,
          num_predict: options.maxTokens || 2048,
          stop: options.stopSequences
        }
      }, {
        timeout: 60000
      });

      const responseData = {
        content: response.data.response,
        model: response.data.model,
        usage: {
          promptTokens: response.data.prompt_eval_count || 0,
          completionTokens: response.data.eval_count || 0,
          totalTokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
        },
        finishReason: response.data.done ? 'stop' : 'length'
      };
      
      // Cache the response
      this.setInCache(cacheKey, responseData);
      
      this.trackMetrics(startTime, true);
      return responseData;
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Llama generation failed', error);
      throw new Error(`Llama error: ${error.message}`);
    }
  }

  async streamResponse(prompt, options = {}) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.endpoint}/api/generate`, {
        model: options.model || this.model,
        prompt,
        stream: true,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 2048
        }
      }, {
        responseType: 'stream',
        timeout: 60000
      });

      this.trackMetrics(startTime, true);
      
      // Return async generator for streaming
      return {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of response.data) {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  yield { content: data.response, done: false };
                }
                if (data.done) {
                  yield { content: '', done: true };
                }
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Llama streaming failed', error);
      throw new Error(`Llama streaming error: ${error.message}`);
    }
  }

  async embedText(text) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(`${this.endpoint}/api/embeddings`, {
        model: this.model,
        prompt: text
      }, {
        timeout: 30000
      });
      
      this.trackMetrics(startTime, true);
      
      return {
        embedding: response.data.embedding,
        model: this.model,
        dimensions: response.data.embedding.length
      };
      
    } catch (error) {
      this.trackMetrics(startTime, false);
      this.logger.error('Llama embedding failed', error);
      throw new Error(`Llama embedding error: ${error.message}`);
    }
  }

  async healthCheck() {
    try {
      const response = await axios.get(`${this.endpoint}/api/tags`, { timeout: 5000 });
      this.isHealthy = true;
      return {
        status: 'healthy',
        models: response.data.models || []
      };
    } catch (error) {
      this.isHealthy = false;
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

/**
 * AI Provider Factory
 */
export class AIProviderFactory {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.providers = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Initialize Gemini providers
    if (this.config.gemini?.apiKeys?.length > 0) {
      this.config.gemini.apiKeys.forEach((apiKey, index) => {
        const provider = new GeminiProvider({ apiKey }, this.logger);
        this.providers.set(`gemini-${index}`, provider);
      });
    }

    // Initialize OpenAI providers
    if (this.config.openai?.apiKeys?.length > 0) {
      this.config.openai.apiKeys.forEach((apiKey, index) => {
        const provider = new OpenAIProvider({ apiKey }, this.logger);
        this.providers.set(`openai-${index}`, provider);
      });
    }

    // Initialize Claude providers
    if (this.config.claude?.apiKeys?.length > 0) {
      this.config.claude.apiKeys.forEach((apiKey, index) => {
        const provider = new ClaudeProvider({ apiKey }, this.logger);
        this.providers.set(`claude-${index}`, provider);
      });
    }

    // Initialize local Llama providers
    if (this.config.llama?.endpoints?.length > 0) {
      this.config.llama.endpoints.forEach((endpoint, index) => {
        const provider = new LlamaProvider({ 
          endpoint, 
          model: this.config.llama.model 
        }, this.logger);
        this.providers.set(`llama-${index}`, provider);
      });
    }

    if (this.providers.size === 0) {
      throw new Error('No AI providers configured. Please configure at least one provider.');
    }

    // Health check all providers
    await this.healthCheckAll();
    
    this.initialized = true;
    this.logger.info(`Initialized ${this.providers.size} AI providers`);
  }

  getProvider(type, index = 0) {
    const key = `${type}-${index}`;
    const provider = this.providers.get(key);
    
    if (!provider) {
      // Try to get any available provider of this type
      for (const [k, v] of this.providers) {
        if (k.startsWith(type) && v.isHealthy) {
          return v;
        }
      }
      
      // Return any healthy provider
      for (const [k, v] of this.providers) {
        if (v.isHealthy) {
          this.logger.warn(`Provider ${type} not found, using ${k} instead`);
          return v;
        }
      }
      
      throw new Error(`No healthy provider found for type: ${type}`);
    }
    
    return provider;
  }

  getHealthyProvider(type) {
    // Get all providers of this type
    const typeProviders = Array.from(this.providers.entries())
      .filter(([key]) => key.startsWith(type))
      .map(([, provider]) => provider)
      .filter(p => p.isHealthy);
    
    if (typeProviders.length === 0) {
      // Fallback to any healthy provider
      const anyHealthy = Array.from(this.providers.values()).find(p => p.isHealthy);
      if (anyHealthy) {
        return anyHealthy;
      }
      throw new Error(`No healthy providers available`);
    }
    
    // Return provider with lowest error rate
    return typeProviders.reduce((best, current) => {
      const bestMetrics = best.getMetrics();
      const currentMetrics = current.getMetrics();
      return currentMetrics.errorRate < bestMetrics.errorRate ? current : best;
    });
  }

  async rotateProvider(type) {
    const typeProviders = Array.from(this.providers.entries())
      .filter(([key]) => key.startsWith(type));
    
    if (typeProviders.length <= 1) {
      return this.getProvider(type);
    }
    
    // Simple round-robin rotation
    const currentIndex = this.lastUsedIndex[type] || 0;
    const nextIndex = (currentIndex + 1) % typeProviders.length;
    this.lastUsedIndex[type] = nextIndex;
    
    return this.getProvider(type, nextIndex);
  }

  async healthCheckAll() {
    const results = {};
    
    for (const [key, provider] of this.providers) {
      results[key] = await provider.healthCheck();
    }
    
    const healthyCount = Object.values(results).filter(r => r.status === 'healthy').length;
    
    this.logger.info(`Health check complete: ${healthyCount}/${this.providers.size} providers healthy`, results);
    
    return results;
  }

  getMetrics() {
    const metrics = {};
    
    for (const [key, provider] of this.providers) {
      metrics[key] = provider.getMetrics();
    }
    
    return metrics;
  }

  getAllProviders() {
    return Array.from(this.providers.values());
  }

  getProviderCount() {
    return this.providers.size;
  }

  getHealthyProviderCount() {
    return Array.from(this.providers.values()).filter(p => p.isHealthy).length;
  }
}

// Singleton instance
let factoryInstance = null;

export const createAIProviderFactory = (config, logger) => {
  if (!factoryInstance) {
    factoryInstance = new AIProviderFactory(config, logger);
  }
  return factoryInstance;
};

export default {
  AIProviderFactory,
  createAIProviderFactory,
  GeminiProvider,
  OpenAIProvider,
  ClaudeProvider,
  LlamaProvider,
  BaseAIProvider
};