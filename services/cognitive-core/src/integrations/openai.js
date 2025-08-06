// ==========================================
// SERVICES/COGNITIVE-CORE/src/integrations/openai.js
// ==========================================

import { RetryUtils } from '@ux-flow/common';

/**
 * OpenAIIntegration provides OpenAI API integration as fallback provider
 * with retry logic, rate limiting, and model management
 */
class OpenAIIntegration {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseURL || 'https://api.openai.com/v1',
      models: {
        standard: config.standardModel || 'gpt-3.5-turbo',
        pro: config.proModel || 'gpt-4-turbo-preview'
      },
      retryConfig: {
        maxRetries: config.maxRetries || 3,
        delay: config.retryDelay || 1000,
        backoffFactor: config.backoffFactor || 2
      },
      rateLimiting: {
        requestsPerMinute: config.requestsPerMinute || 3500,
        tokensPerMinute: config.tokensPerMinute || 90000
      },
      timeout: config.timeout || 60000
    };

    if (!this.config.apiKey) {
      this.logger.warn('OpenAI API key not provided - OpenAI integration disabled');
      this.enabled = false;
      return;
    }

    this.enabled = true;

    // Rate limiting tracking
    this.rateLimitingState = {
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now()
    };

    // Model usage statistics
    this.usage = {
      standard: { requests: 0, tokens: 0, errors: 0 },
      pro: { requests: 0, tokens: 0, errors: 0 }
    };

    this.logger.info('OpenAI integration initialized', {
      standardModel: this.config.models.standard,
      proModel: this.config.models.pro,
      enabled: this.enabled
    });
  }

  /**
   * Generate content using OpenAI API
   */
  async generateContent(prompt, qualityMode = 'standard', options = {}) {
    if (!this.enabled) {
      throw new Error('OpenAI integration is not enabled - missing API key');
    }

    await this.checkRateLimit();
    
    const model = this.getModelName(qualityMode);
    const startTime = Date.now();
    
    try {
      const messages = this.formatPrompt(prompt);
      
      const result = await RetryUtils.retryApiCall(
        () => this.callOpenAI(model, messages, options),
        {
          ...this.config.retryConfig,
          logger: this.logger,
          shouldRetry: (error) => this.shouldRetry(error)
        }
      );

      const processingTime = Date.now() - startTime;
      
      // Update usage statistics
      this.updateUsageStats(qualityMode, processingTime, result);
      
      this.logger.debug('Content generated successfully', {
        qualityMode,
        model,
        processingTime,
        promptLength: typeof prompt === 'string' ? prompt.length : JSON.stringify(prompt).length
      });

      return this.formatResponse(result);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.usage[qualityMode].errors++;
      
      this.logger.error('OpenAI content generation failed', error, {
        qualityMode,
        model,
        processingTime,
        errorType: error.name
      });

      throw this.enhanceError(error, qualityMode);
    }
  }

  /**
   * Generate content with vision (GPT-4V)
   */
  async generateContentWithVision(prompt, imageData, qualityMode = 'pro') {
    if (!this.enabled) {
      throw new Error('OpenAI integration is not enabled');
    }

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageData}`,
            detail: 'high'
          }
        }
      ]
    }];

    return await this.callOpenAI('gpt-4-vision-preview', messages, {
      includeImage: true
    });
  }

  /**
   * Format prompt for OpenAI messages format
   */
  formatPrompt(prompt) {
    if (typeof prompt === 'string') {
      return [{
        role: 'user',
        content: prompt
      }];
    }

    if (Array.isArray(prompt)) {
      // Handle vision prompts or complex prompts
      return [{
        role: 'user',
        content: prompt
      }];
    }

    return [{
      role: 'user', 
      content: JSON.stringify(prompt)
    }];
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(model, messages, options = {}) {
    const requestBody = {
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature || 0.1,
      response_format: options.responseFormat || { type: 'json_object' }
    };

    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorData = await response.text();
      const error = new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.responseData = errorData;
      throw error;
    }

    const data = await response.json();
    return data;
  }

  /**
   * Format OpenAI response to match Gemini format
   */
  formatResponse(openaiResponse) {
    const choice = openaiResponse.choices?.[0];
    
    if (!choice) {
      throw new Error('No response choice from OpenAI');
    }

    return {
      response: {
        text: () => choice.message.content,
        candidates: openaiResponse.choices?.map(choice => ({
          content: {
            parts: [{ text: choice.message.content }]
          },
          finishReason: choice.finish_reason
        }))
      },
      usage: openaiResponse.usage
    };
  }

  /**
   * Get model name by quality mode
   */
  getModelName(qualityMode) {
    const model = this.config.models[qualityMode];
    if (!model) {
      throw new Error(`Unknown quality mode: ${qualityMode}`);
    }
    return model;
  }

  /**
   * Check and enforce rate limits
   */
  async checkRateLimit() {
    const now = Date.now();
    const windowDuration = 60000; // 1 minute

    // Reset window if needed
    if (now - this.rateLimitingState.windowStart > windowDuration) {
      this.rateLimitingState = {
        requestCount: 0,
        tokenCount: 0,
        windowStart: now
      };
    }

    // Check request rate limit
    if (this.rateLimitingState.requestCount >= this.config.rateLimiting.requestsPerMinute) {
      const waitTime = windowDuration - (now - this.rateLimitingState.windowStart);
      
      this.logger.warn('OpenAI rate limit reached, waiting', {
        waitTime,
        requestCount: this.rateLimitingState.requestCount
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      await this.checkRateLimit();
    }

    this.rateLimitingState.requestCount++;
  }

  /**
   * Determine if error should trigger retry
   */
  shouldRetry(error) {
    const retryableStatuses = [429, 500, 502, 503, 504];
    const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];

    return (
      retryableStatuses.includes(error.status) ||
      retryableErrors.some(code => error.code === code) ||
      error.name === 'AbortError' ||
      error.message?.includes('rate limit')
    );
  }

  /**
   * Enhance error with context
   */
  enhanceError(error, qualityMode) {
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name || 'OpenAIError';
    enhancedError.qualityMode = qualityMode;
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date();
    enhancedError.apiProvider = 'openai';

    // Add specific error context
    if (error.status === 429) {
      enhancedError.type = 'RateLimitError';
      enhancedError.suggestion = 'Reduce request frequency or upgrade API quota';
    } else if (error.status === 401) {
      enhancedError.type = 'AuthenticationError';
      enhancedError.suggestion = 'Check OpenAI API key validity';
    } else if (error.status >= 500) {
      enhancedError.type = 'ServerError';
      enhancedError.suggestion = 'Temporary OpenAI service issue, will retry automatically';
    } else {
      enhancedError.type = 'ClientError';
    }

    return enhancedError;
  }

  /**
   * Update usage statistics
   */
  updateUsageStats(qualityMode, processingTime, result) {
    if (!this.usage[qualityMode]) {
      return;
    }

    this.usage[qualityMode].requests++;

    // Use actual token usage from OpenAI response
    if (result.usage) {
      const tokens = result.usage.total_tokens || 0;
      this.usage[qualityMode].tokens += tokens;
      this.rateLimitingState.tokenCount += tokens;
    }
  }

  /**
   * Get model capabilities
   */
  getModelCapabilities(qualityMode = 'standard') {
    const capabilities = {
      standard: {
        maxInputTokens: 16385,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsJson: true,
        costPer1KTokens: 0.0005,
        averageLatency: 1500
      },
      pro: {
        maxInputTokens: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsJson: true,
        costPer1KTokens: 0.01,
        averageLatency: 3000
      }
    };

    return capabilities[qualityMode];
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics() {
    if (!this.enabled) {
      return {
        enabled: false,
        message: 'OpenAI integration disabled - no API key provided'
      };
    }

    const totalRequests = Object.values(this.usage).reduce((sum, stats) => sum + stats.requests, 0);
    const totalTokens = Object.values(this.usage).reduce((sum, stats) => sum + stats.tokens, 0);
    const totalErrors = Object.values(this.usage).reduce((sum, stats) => sum + stats.errors, 0);

    return {
      enabled: true,
      overall: {
        totalRequests,
        totalTokens,
        totalErrors,
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) : 0
      },
      byModel: { ...this.usage },
      rateLimiting: {
        currentWindow: {
          requests: this.rateLimitingState.requestCount,
          tokens: this.rateLimitingState.tokenCount,
          windowStart: new Date(this.rateLimitingState.windowStart)
        },
        limits: this.config.rateLimiting
      },
      timestamp: new Date()
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.enabled) {
      return {
        status: 'disabled',
        provider: 'openai',
        reason: 'API key not provided'
      };
    }

    try {
      const testMessages = [{
        role: 'user',
        content: 'Health check test - respond with {"status": "ok"}'
      }];

      const result = await this.callOpenAI(this.config.models.standard, testMessages, {
        maxTokens: 50
      });

      return {
        status: 'healthy',
        provider: 'openai',
        models: Object.values(this.config.models),
        lastCheck: new Date(),
        usage: this.getUsageStatistics().overall
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: 'openai',
        error: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Reset usage statistics
   */
  resetStatistics() {
    this.usage = {
      standard: { requests: 0, tokens: 0, errors: 0 },
      pro: { requests: 0, tokens: 0, errors: 0 }
    };
    
    this.rateLimitingState = {
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now()
    };

    this.logger.info('OpenAI usage statistics reset');
  }
}

export { OpenAIIntegration };