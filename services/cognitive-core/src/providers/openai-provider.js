// ==========================================
// OpenAI GPT-4 Provider Integration
// ==========================================

import OpenAI from 'openai';

export class OpenAIProvider {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.client = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('OpenAI API key not provided');
      }

      this.client = new OpenAI({
        apiKey: this.apiKey
      });

      this.initialized = true;
      this.logger.info('OpenAI provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize OpenAI provider', error);
      throw error;
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      model = 'gpt-4-turbo-preview',
      temperature = 0.7,
      maxTokens = 2048,
      topP = 0.9,
      frequencyPenalty = 0,
      presencePenalty = 0,
      stopSequences = [],
      systemPrompt = 'You are a helpful AI assistant specialized in UX/UI design.'
    } = options;

    try {
      const startTime = Date.now();

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];

      const completion = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stop: stopSequences.length > 0 ? stopSequences : undefined
      });

      const duration = Date.now() - startTime;
      const response = completion.choices[0].message.content;

      this.logger.info('OpenAI text generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: response.length,
        duration,
        usage: completion.usage
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        },
        duration
      };

    } catch (error) {
      this.logger.error('OpenAI text generation failed', error);
      throw error;
    }
  }

  async generateWithImage(prompt, imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'gpt-4-vision-preview', ...otherOptions } = options;

    try {
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: {
                url: imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`
              }
            }
          ]
        }
      ];

      const completion = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: options.maxTokens || 2048
      });

      const response = completion.choices[0].message.content;

      this.logger.info('OpenAI vision generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: response.length
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        }
      };

    } catch (error) {
      this.logger.error('OpenAI vision generation failed', error);
      throw error;
    }
  }

  async generateChat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { 
      model = 'gpt-4-turbo-preview',
      ...otherOptions 
    } = options;

    try {
      // Ensure messages are in OpenAI format
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const completion = await this.client.chat.completions.create({
        model,
        messages: formattedMessages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        top_p: options.topP || 0.9
      });

      const response = completion.choices[0].message.content;

      this.logger.info('OpenAI chat generation completed', {
        model,
        messageCount: messages.length,
        responseLength: response.length
      });

      return {
        text: response,
        model,
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        }
      };

    } catch (error) {
      this.logger.error('OpenAI chat generation failed', error);
      throw error;
    }
  }

  async generateEmbedding(text, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'text-embedding-3-small' } = options;

    try {
      const response = await this.client.embeddings.create({
        model,
        input: text
      });

      const embedding = response.data[0].embedding;

      this.logger.info('OpenAI embedding generation completed', {
        model,
        textLength: text.length,
        dimensions: embedding.length
      });

      return {
        embedding,
        model,
        dimensions: embedding.length,
        usage: response.usage
      };

    } catch (error) {
      this.logger.error('OpenAI embedding generation failed', error);
      throw error;
    }
  }

  async streamGenerate(prompt, options = {}, onChunk) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      model = 'gpt-4-turbo-preview',
      systemPrompt = 'You are a helpful AI assistant specialized in UX/UI design.',
      ...otherOptions
    } = options;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ];

      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048,
        stream: true
      });

      let fullText = '';
      for await (const chunk of stream) {
        const chunkText = chunk.choices[0]?.delta?.content || '';
        fullText += chunkText;
        if (onChunk && chunkText) {
          onChunk(chunkText);
        }
      }

      return {
        text: fullText,
        model,
        usage: {
          promptTokens: this.estimateTokens(prompt),
          completionTokens: this.estimateTokens(fullText),
          totalTokens: this.estimateTokens(prompt) + this.estimateTokens(fullText)
        }
      };

    } catch (error) {
      this.logger.error('OpenAI stream generation failed', error);
      throw error;
    }
  }

  async generateWithFunctions(prompt, functions, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'gpt-4-turbo-preview', ...otherOptions } = options;

    try {
      const messages = [
        { role: 'user', content: prompt }
      ];

      const completion = await this.client.chat.completions.create({
        model,
        messages,
        functions,
        function_call: options.functionCall || 'auto',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2048
      });

      const response = completion.choices[0];

      if (response.function_call) {
        return {
          functionCall: {
            name: response.function_call.name,
            arguments: JSON.parse(response.function_call.arguments)
          },
          model,
          usage: {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens
          }
        };
      }

      return {
        text: response.message.content,
        model,
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        }
      };

    } catch (error) {
      this.logger.error('OpenAI function generation failed', error);
      throw error;
    }
  }

  // Utility methods
  estimateTokens(text) {
    // More accurate token estimation for GPT models
    // Roughly 1 token per 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  async checkHealth() {
    try {
      const result = await this.generateText('Hello', {
        model: 'gpt-3.5-turbo',
        maxTokens: 10
      });
      return { status: 'healthy', model: 'openai' };
    } catch (error) {
      return { status: 'unhealthy', model: 'openai', error: error.message };
    }
  }

  getAvailableModels() {
    return [
      'gpt-4-turbo-preview',
      'gpt-4',
      'gpt-4-32k',
      'gpt-4-vision-preview',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ];
  }

  getModelCapabilities(model) {
    const capabilities = {
      'gpt-4-turbo-preview': {
        maxTokens: 128000,
        supportsVision: false,
        supportsStreaming: true,
        supportsFunctions: true,
        costPer1kTokens: { input: 0.01, output: 0.03 }
      },
      'gpt-4': {
        maxTokens: 8192,
        supportsVision: false,
        supportsStreaming: true,
        supportsFunctions: true,
        costPer1kTokens: { input: 0.03, output: 0.06 }
      },
      'gpt-4-vision-preview': {
        maxTokens: 128000,
        supportsVision: true,
        supportsStreaming: true,
        supportsFunctions: false,
        costPer1kTokens: { input: 0.01, output: 0.03 }
      },
      'gpt-3.5-turbo': {
        maxTokens: 16385,
        supportsVision: false,
        supportsStreaming: true,
        supportsFunctions: true,
        costPer1kTokens: { input: 0.0005, output: 0.0015 }
      }
    };

    return capabilities[model] || null;
  }
}