// ==========================================
// Anthropic Claude Provider Integration
// ==========================================

import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('Anthropic API key not provided');
      }

      this.client = new Anthropic({
        apiKey: this.apiKey
      });

      this.initialized = true;
      this.logger.info('Anthropic provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Anthropic provider', error);
      throw error;
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      model = 'claude-3-opus-20240229',
      temperature = 0.7,
      maxTokens = 2048,
      topP = 0.9,
      topK = 0,
      systemPrompt = 'You are Claude, an AI assistant specialized in UX/UI design and user experience optimization.'
    } = options;

    try {
      const startTime = Date.now();

      const message = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        top_k: topK,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const duration = Date.now() - startTime;
      const response = message.content[0].text;

      this.logger.info('Anthropic text generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: response.length,
        duration,
        usage: message.usage
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens
        },
        duration
      };

    } catch (error) {
      this.logger.error('Anthropic text generation failed', error);
      throw error;
    }
  }

  async generateWithImage(prompt, imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'claude-3-opus-20240229', ...otherOptions } = options;

    try {
      // Extract base64 data and mime type
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      const mimeType = this.extractMimeType(imageData);

      const message = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });

      const response = message.content[0].text;

      this.logger.info('Anthropic vision generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: response.length
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens
        }
      };

    } catch (error) {
      this.logger.error('Anthropic vision generation failed', error);
      throw error;
    }
  }

  async generateChat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { 
      model = 'claude-3-opus-20240229',
      systemPrompt = 'You are Claude, an AI assistant specialized in UX/UI design.',
      ...otherOptions 
    } = options;

    try {
      // Convert messages to Anthropic format
      const formattedMessages = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      const message = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        system: systemPrompt,
        messages: formattedMessages
      });

      const response = message.content[0].text;

      this.logger.info('Anthropic chat generation completed', {
        model,
        messageCount: messages.length,
        responseLength: response.length
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens
        }
      };

    } catch (error) {
      this.logger.error('Anthropic chat generation failed', error);
      throw error;
    }
  }

  async streamGenerate(prompt, options = {}, onChunk) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      model = 'claude-3-opus-20240229',
      systemPrompt = 'You are Claude, an AI assistant specialized in UX/UI design.',
      ...otherOptions
    } = options;

    try {
      const stream = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature || 0.7,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: true
      });

      let fullText = '';
      let usage = null;

      for await (const messageStreamEvent of stream) {
        if (messageStreamEvent.type === 'content_block_delta') {
          const chunkText = messageStreamEvent.delta.text;
          fullText += chunkText;
          if (onChunk && chunkText) {
            onChunk(chunkText);
          }
        } else if (messageStreamEvent.type === 'message_stop') {
          usage = messageStreamEvent.message?.usage;
        }
      }

      return {
        text: fullText,
        model,
        usage: usage ? {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens
        } : {
          promptTokens: this.estimateTokens(prompt),
          completionTokens: this.estimateTokens(fullText),
          totalTokens: this.estimateTokens(prompt) + this.estimateTokens(fullText)
        }
      };

    } catch (error) {
      this.logger.error('Anthropic stream generation failed', error);
      throw error;
    }
  }

  async generateWithTools(prompt, tools, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'claude-3-opus-20240229', ...otherOptions } = options;

    try {
      const message = await this.client.messages.create({
        model,
        max_tokens: options.maxTokens || 2048,
        tools,
        messages: [
          { role: 'user', content: prompt }
        ]
      });

      const response = message.content[0];

      if (response.type === 'tool_use') {
        return {
          toolUse: {
            id: response.id,
            name: response.name,
            input: response.input
          },
          model,
          usage: {
            promptTokens: message.usage.input_tokens,
            completionTokens: message.usage.output_tokens,
            totalTokens: message.usage.input_tokens + message.usage.output_tokens
          }
        };
      }

      return {
        text: response.text,
        model,
        usage: {
          promptTokens: message.usage.input_tokens,
          completionTokens: message.usage.output_tokens,
          totalTokens: message.usage.input_tokens + message.usage.output_tokens
        }
      };

    } catch (error) {
      this.logger.error('Anthropic tool generation failed', error);
      throw error;
    }
  }

  // Utility methods
  estimateTokens(text) {
    // Claude uses a similar tokenization to GPT models
    // Roughly 1 token per 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  extractMimeType(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }

  async checkHealth() {
    try {
      const result = await this.generateText('Hello', {
        model: 'claude-3-haiku-20240307',
        maxTokens: 10
      });
      return { status: 'healthy', model: 'anthropic' };
    } catch (error) {
      return { status: 'unhealthy', model: 'anthropic', error: error.message };
    }
  }

  getAvailableModels() {
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ];
  }

  getModelCapabilities(model) {
    const capabilities = {
      'claude-3-opus-20240229': {
        maxTokens: 200000,
        supportsVision: true,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: { input: 0.015, output: 0.075 }
      },
      'claude-3-sonnet-20240229': {
        maxTokens: 200000,
        supportsVision: true,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: { input: 0.003, output: 0.015 }
      },
      'claude-3-haiku-20240307': {
        maxTokens: 200000,
        supportsVision: true,
        supportsStreaming: true,
        supportsTools: true,
        costPer1kTokens: { input: 0.00025, output: 0.00125 }
      },
      'claude-2.1': {
        maxTokens: 200000,
        supportsVision: false,
        supportsStreaming: true,
        supportsTools: false,
        costPer1kTokens: { input: 0.008, output: 0.024 }
      },
      'claude-instant-1.2': {
        maxTokens: 100000,
        supportsVision: false,
        supportsStreaming: true,
        supportsTools: false,
        costPer1kTokens: { input: 0.0008, output: 0.0024 }
      }
    };

    return capabilities[model] || null;
  }
}