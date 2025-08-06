// ==========================================
// SERVICES/COGNITIVE-CORE/src/integrations/claude.js
// ==========================================

import { RetryUtils } from '@ux-flow/common';

/**
 * ClaudeIntegration provides Anthropic Claude API integration as alternative provider
 * with retry logic, rate limiting, and model management
 */
class ClaudeIntegration {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      apiKey: config.apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseURL || 'https://api.anthropic.com/v1',
      models: {
        standard: config.standardModel || 'claude-3-haiku-20240307',
        pro: config.proModel || 'claude-3-opus-20240229'
      },
      retryConfig: {
        maxRetries: config.maxRetries || 3,
        delay: config.retryDelay || 1000,
        backoffFactor: config.backoffFactor || 2
      },
      rateLimiting: {
        requestsPerMinute: config.requestsPerMinute || 1000,
        tokensPerMinute: config.tokensPerMinute || 100000
      },
      timeout: config.timeout || 60000,
      version: '2023-06-01'
    };

    if (!this.config.apiKey) {
      this.logger.warn('Claude API key not provided - Claude integration disabled');
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

    this.logger.info('Claude integration initialized', {
      standardModel: this.config.models.standard,
      proModel: this.config.models.pro,
      enabled: this.enabled
    });
  }

  /**
   * Generate content using Claude API
   */
  async generateContent(prompt, qualityMode = 'standard', options = {}) {
    if (!this.enabled) {
      throw new Error('Claude integration is not enabled - missing API key');
    }

    await this.checkRateLimit();
    
    const model = this.getModelName(qualityMode);
    const startTime = Date.now();
    
    try {
      const messages = this.formatPrompt(prompt);
      
      const result = await RetryUtils.retryApiCall(
        () => this.callClaude(model, messages, options),
        {
          ...this.config.retryConfig,
          logger: this.logger,
          shouldRetry: (error) => this.shouldRetry(error)
        }
      );

      const processingTime = Date.now() - startTime;
      
      // Update usage statistics
      this.updateUsageStats(qualityMode, processingTime, result);
      
      this.logger.debug('Content generated successfully with Claude', {
        qualityMode,
        model,
        processingTime,
        promptLength: typeof prompt === 'string' ? prompt.length : JSON.stringify(prompt).length
      });

      return this.formatResponse(result);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.usage[qualityMode].errors++;
      
      this.logger.error('Claude content generation failed', error, {
        qualityMode,
        model,
        processingTime,
        errorType: error.name
      });

      throw this.enhanceError(error, qualityMode);
    }
  }

  /**
   * Generate content with vision (Claude 3 models support vision)
   */
  async generateContentWithVision(prompt, imageData, qualityMode = 'pro') {
    if (!this.enabled) {
      throw new Error('Claude integration is not enabled');
    }

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: this.detectImageMimeType(imageData),
            data: imageData
          }
        }
      ]
    }];

    return await this.callClaude(this.config.models.pro, messages, {
      includeImage: true
    });
  }

  /**
   * Format prompt for Claude messages format
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
      const textContent = prompt.find(p => typeof p === 'string');
      const imageContent = prompt.find(p => typeof p === 'object' && p.inlineData);
      
      if (imageContent) {
        return [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: textContent || 'Please analyze this image.'
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageContent.inlineData.mimeType,
                data: imageContent.inlineData.data
              }
            }
          ]
        }];
      }
      
      return [{
        role: 'user',
        content: JSON.stringify(prompt)
      }];
    }

    return [{
      role: 'user',
      content: JSON.stringify(prompt)
    }];
  }

  /**
   * Call Claude API
   */
  async callClaude(model, messages, options = {}) {
    const requestBody = {
      model,
      max_tokens: options.maxTokens || 4096,
      messages,
      temperature: options.temperature || 0.1
    };

    // Add system prompt if JSON response is expected
    if (!options.includeImage) {
      requestBody.system = 'You are a helpful assistant that responds with valid JSON. Always format your response as valid JSON.';
    }

    const response = await fetch(`${this.config.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.version,
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.timeout)
    });

    if (!response.ok) {
      const errorData = await response.text();
      const error = new Error(`Claude API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.responseData = errorData;
      throw error;
    }

    const data = await response.json();
    return data;
  }

  /**
   * Format Claude response to match Gemini format
   */
  formatResponse(claudeResponse) {
    const content = claudeResponse.content?.[0];
    
    if (!content || content.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    return {
      response: {
        text: () => content.text,
        candidates: claudeResponse.content?.map(content => ({
          content: {
            parts: [{ text: content.text }]
          },
          finishReason: claudeResponse.stop_reason
        }))
      },
      usage: {
        input_tokens: claudeResponse.usage?.input_tokens || 0,
        output_tokens: claudeResponse.usage?.output_tokens || 0,
        total_tokens: (claudeResponse.usage?.input_tokens || 0) + (claudeResponse.usage?.output_tokens || 0)
      }
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
   * Detect image MIME type from base64 data
   */
  detectImageMimeType(base64Data) {
    const signatures = {
      '/9j/': 'image/jpeg',
      'iVBORw0KGgo': 'image/png',
      'R0lGOD': 'image/gif',
      'UklGR': 'image/webp'
    };

    for (const [signature, mimeType] of Object.entries(signatures)) {
      if (base64Data.startsWith(signature)) {
        return mimeType;
      }
    }

    return 'image/jpeg'; // Default fallback
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
      
      this.logger.warn('Claude rate limit reached, waiting', {
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
    enhancedError.name = error.name || 'ClaudeError';
    enhancedError.qualityMode = qualityMode;
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date();
    enhancedError.apiProvider = 'claude';

    // Add specific error context
    if (error.status === 429) {
      enhancedError.type = 'RateLimitError';
      enhancedError.suggestion = 'Reduce request frequency or upgrade API quota';
    } else if (error.status === 401) {
      enhancedError.type = 'AuthenticationError';
      enhancedError.suggestion = 'Check Claude API key validity';
    } else if (error.status >= 500) {
      enhancedError.type = 'ServerError';
      enhancedError.suggestion = 'Temporary Claude service issue, will retry automatically';
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

    // Use actual token usage from Claude response
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
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsJson: true,
        costPer1KTokens: 0.00025,
        averageLatency: 2000
      },
      pro: {
        maxInputTokens: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsJson: true,
        costPer1KTokens: 0.015,
        averageLatency: 4000
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
        message: 'Claude integration disabled - no API key provided'
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
        provider: 'claude',
        reason: 'API key not provided'
      };
    }

    try {
      const testMessages = [{
        role: 'user',
        content: 'Health check test - respond with {"status": "ok"}'
      }];

      const result = await this.callClaude(this.config.models.standard, testMessages, {
        maxTokens: 50
      });

      return {
        status: 'healthy',
        provider: 'claude',
        models: Object.values(this.config.models),
        lastCheck: new Date(),
        usage: this.getUsageStatistics().overall
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: 'claude',
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

    this.logger.info('Claude usage statistics reset');
  }
}

export { ClaudeIntegration };