// ==========================================
// SERVICES/COGNITIVE-CORE/src/integrations/google-gemini.js
// ==========================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { RetryUtils } from '@ux-flow/common';

/**
 * GoogleGeminiIntegration provides enhanced Google Gemini API integration
 * with retry logic, rate limiting, and model management
 */
class GoogleGeminiIntegration {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      apiKey: config.apiKey || process.env.GOOGLE_API_KEY,
      models: {
        standard: config.standardModel || 'gemini-1.5-flash-latest',
        pro: config.proModel || 'gemini-1.5-pro-latest'
      },
      retryConfig: {
        maxRetries: config.maxRetries || 3,
        delay: config.retryDelay || 1000,
        backoffFactor: config.backoffFactor || 2
      },
      rateLimiting: {
        requestsPerMinute: config.requestsPerMinute || 60,
        tokensPerMinute: config.tokensPerMinute || 1000000
      },
      timeout: config.timeout || 30000
    };

    if (!this.config.apiKey) {
      throw new Error('Google API key is required');
    }

    // Initialize Google Generative AI
    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    
    // Initialize models
    this.models = {
      standard: this.genAI.getGenerativeModel({ 
        model: this.config.models.standard,
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      }),
      pro: this.genAI.getGenerativeModel({ 
        model: this.config.models.pro,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    };

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

    this.logger.info('Google Gemini integration initialized', {
      standardModel: this.config.models.standard,
      proModel: this.config.models.pro,
      rateLimiting: this.config.rateLimiting
    });
  }

  /**
   * Generate content using specified model
   */
  async generateContent(prompt, qualityMode = 'standard', options = {}) {
    await this.checkRateLimit();
    
    const model = this.getModel(qualityMode);
    const startTime = Date.now();
    
    try {
      const result = await RetryUtils.retryApiCall(
        () => this.callModel(model, prompt, options),
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
        processingTime,
        promptLength: prompt.length,
        hasVision: options.includeImage || false
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.usage[qualityMode].errors++;
      
      this.logger.error('Content generation failed', error, {
        qualityMode,
        processingTime,
        promptLength: prompt.length,
        errorType: error.name
      });

      throw this.enhanceError(error, qualityMode);
    }
  }

  /**
   * Generate content with vision (images)
   */
  async generateContentWithVision(prompt, imageData, qualityMode = 'pro') {
    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: this.detectImageMimeType(imageData)
      }
    };

    return await this.generateContent([prompt, imagePart], qualityMode, {
      includeImage: true
    });
  }

  /**
   * Get model by quality mode
   */
  getModel(qualityMode) {
    const model = this.models[qualityMode];
    if (!model) {
      throw new Error(`Unknown quality mode: ${qualityMode}`);
    }
    return model;
  }

  /**
   * Call model with timeout and error handling
   */
  async callModel(model, prompt, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, options.timeout || this.config.timeout);

    try {
      const result = await model.generateContent(prompt, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return result;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
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
      
      this.logger.warn('Rate limit reached, waiting', {
        waitTime,
        requestCount: this.rateLimitingState.requestCount
      });
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      await this.checkRateLimit(); // Recursive check after waiting
    }

    this.rateLimitingState.requestCount++;
  }

  /**
   * Determine if error should trigger retry
   */
  shouldRetry(error) {
    // Retry on network errors, rate limits, and temporary server errors
    const retryableErrors = [
      'ECONNRESET',
      'ENOTFOUND', 
      'ETIMEDOUT',
      'ECONNREFUSED'
    ];

    const retryableHttpCodes = [429, 500, 502, 503, 504];

    return (
      retryableErrors.some(code => error.code === code) ||
      retryableHttpCodes.some(status => error.status === status) ||
      error.message?.includes('rate limit') ||
      error.message?.includes('quota exceeded')
    );
  }

  /**
   * Enhance error with context
   */
  enhanceError(error, qualityMode) {
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name || 'GeminiError';
    enhancedError.qualityMode = qualityMode;
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date();
    enhancedError.apiProvider = 'google-gemini';

    // Add specific error context
    if (error.status === 429) {
      enhancedError.type = 'RateLimitError';
      enhancedError.suggestion = 'Reduce request frequency or upgrade API quota';
    } else if (error.status === 401) {
      enhancedError.type = 'AuthenticationError';
      enhancedError.suggestion = 'Check API key validity';
    } else if (error.status >= 500) {
      enhancedError.type = 'ServerError';
      enhancedError.suggestion = 'Temporary service issue, will retry automatically';
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

    // Estimate token usage (rough approximation)
    try {
      const response = result.response || result;
      const text = response.text ? response.text() : '';
      const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate
      
      this.usage[qualityMode].tokens += estimatedTokens;
      this.rateLimitingState.tokenCount += estimatedTokens;
      
    } catch (error) {
      this.logger.debug('Could not estimate token usage', error);
    }
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
   * Get model capabilities
   */
  getModelCapabilities(qualityMode = 'standard') {
    const capabilities = {
      standard: {
        maxInputTokens: 1048576, // 1M tokens
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsJson: true,
        costPerToken: 0.00015, // Approximate
        averageLatency: 2000
      },
      pro: {
        maxInputTokens: 2097152, // 2M tokens  
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsJson: true,
        costPerToken: 0.00375, // Approximate
        averageLatency: 5000
      }
    };

    return capabilities[qualityMode];
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics() {
    const totalRequests = Object.values(this.usage).reduce((sum, stats) => sum + stats.requests, 0);
    const totalTokens = Object.values(this.usage).reduce((sum, stats) => sum + stats.tokens, 0);
    const totalErrors = Object.values(this.usage).reduce((sum, stats) => sum + stats.errors, 0);

    return {
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
    try {
      const testPrompt = 'Health check test - respond with {"status": "ok"}';
      const result = await this.generateContent(testPrompt, 'standard');
      
      const response = await result.response;
      const text = response.text();
      
      // Try to parse response
      JSON.parse(text);
      
      return {
        status: 'healthy',
        provider: 'google-gemini',
        models: Object.keys(this.models),
        lastCheck: new Date(),
        usage: this.getUsageStatistics().overall
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: 'google-gemini',
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

    this.logger.info('Usage statistics reset');
  }
}

export { GoogleGeminiIntegration };