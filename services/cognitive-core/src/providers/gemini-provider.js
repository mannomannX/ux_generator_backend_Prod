// ==========================================
// Google Gemini AI Provider Integration
// ==========================================

import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiProvider {
  constructor(apiKey, logger) {
    this.logger = logger;
    this.apiKey = apiKey;
    this.client = null;
    this.models = {
      'gemini-pro': null,
      'gemini-pro-vision': null,
      'gemini-1.5-pro': null,
      'gemini-1.5-flash': null
    };
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not provided');
      }

      this.client = new GoogleGenerativeAI(this.apiKey);
      
      // Initialize models
      this.models['gemini-pro'] = this.client.getGenerativeModel({ model: 'gemini-pro' });
      this.models['gemini-pro-vision'] = this.client.getGenerativeModel({ model: 'gemini-pro-vision' });
      this.models['gemini-1.5-pro'] = this.client.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
      this.models['gemini-1.5-flash'] = this.client.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

      this.initialized = true;
      this.logger.info('Gemini provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Gemini provider', error);
      throw error;
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const {
      model = 'gemini-1.5-flash',
      temperature = 0.7,
      maxTokens = 2048,
      topP = 0.9,
      topK = 40,
      stopSequences = [],
      systemPrompt = null
    } = options;

    try {
      const selectedModel = this.models[model];
      if (!selectedModel) {
        throw new Error(`Model ${model} not available`);
      }

      // Prepare the prompt with system prompt if provided
      let fullPrompt = prompt;
      if (systemPrompt) {
        fullPrompt = `System: ${systemPrompt}\n\nUser: ${prompt}`;
      }

      // Configure generation parameters
      const generationConfig = {
        temperature,
        topP,
        topK,
        maxOutputTokens: maxTokens,
        stopSequences
      };

      // Safety settings
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

      const startTime = Date.now();
      
      const result = await selectedModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig,
        safetySettings
      });

      const response = await result.response;
      const text = response.text();
      
      const duration = Date.now() - startTime;

      this.logger.info('Gemini text generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: text.length,
        duration
      });

      return {
        text,
        model,
        usage: {
          promptTokens: this.estimateTokens(fullPrompt),
          completionTokens: this.estimateTokens(text),
          totalTokens: this.estimateTokens(fullPrompt) + this.estimateTokens(text)
        },
        duration
      };

    } catch (error) {
      this.logger.error('Gemini text generation failed', error);
      throw error;
    }
  }

  async generateWithImage(prompt, imageData, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'gemini-pro-vision', ...otherOptions } = options;

    try {
      const selectedModel = this.models[model];
      if (!selectedModel) {
        throw new Error(`Model ${model} not available for vision tasks`);
      }

      // Convert base64 image to proper format
      const imagePart = {
        inlineData: {
          data: imageData.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: this.extractMimeType(imageData)
        }
      };

      const result = await selectedModel.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text();

      this.logger.info('Gemini vision generation completed', {
        model,
        promptLength: prompt.length,
        responseLength: text.length
      });

      return {
        text,
        model,
        usage: {
          promptTokens: this.estimateTokens(prompt) + 258, // Image tokens estimate
          completionTokens: this.estimateTokens(text),
          totalTokens: this.estimateTokens(prompt) + 258 + this.estimateTokens(text)
        }
      };

    } catch (error) {
      this.logger.error('Gemini vision generation failed', error);
      throw error;
    }
  }

  async generateChat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'gemini-1.5-pro', ...otherOptions } = options;

    try {
      const selectedModel = this.models[model];
      if (!selectedModel) {
        throw new Error(`Model ${model} not available`);
      }

      // Convert messages to Gemini format
      const history = messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const chat = selectedModel.startChat({
        history,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 2048
        }
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);
      const response = await result.response;
      const text = response.text();

      this.logger.info('Gemini chat generation completed', {
        model,
        messageCount: messages.length,
        responseLength: text.length
      });

      return {
        text,
        model,
        usage: {
          promptTokens: messages.reduce((acc, msg) => acc + this.estimateTokens(msg.content), 0),
          completionTokens: this.estimateTokens(text),
          totalTokens: messages.reduce((acc, msg) => acc + this.estimateTokens(msg.content), 0) + this.estimateTokens(text)
        }
      };

    } catch (error) {
      this.logger.error('Gemini chat generation failed', error);
      throw error;
    }
  }

  async generateEmbedding(text, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'embedding-001' } = options;

    try {
      const embeddingModel = this.client.getGenerativeModel({ model });
      
      const result = await embeddingModel.embedContent(text);
      const embedding = result.embedding;

      this.logger.info('Gemini embedding generation completed', {
        model,
        textLength: text.length,
        dimensions: embedding.values.length
      });

      return {
        embedding: embedding.values,
        model,
        dimensions: embedding.values.length
      };

    } catch (error) {
      this.logger.error('Gemini embedding generation failed', error);
      throw error;
    }
  }

  async streamGenerate(prompt, options = {}, onChunk) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { model = 'gemini-1.5-flash', ...otherOptions } = options;

    try {
      const selectedModel = this.models[model];
      if (!selectedModel) {
        throw new Error(`Model ${model} not available`);
      }

      const result = await selectedModel.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 2048
        }
      });

      let fullText = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullText += chunkText;
        if (onChunk) {
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
      this.logger.error('Gemini stream generation failed', error);
      throw error;
    }
  }

  // Utility methods
  estimateTokens(text) {
    // Rough estimation: 1 token per 4 characters
    return Math.ceil(text.length / 4);
  }

  extractMimeType(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }

  async checkHealth() {
    try {
      const result = await this.generateText('Hello', {
        model: 'gemini-1.5-flash',
        maxTokens: 10
      });
      return { status: 'healthy', model: 'gemini' };
    } catch (error) {
      return { status: 'unhealthy', model: 'gemini', error: error.message };
    }
  }

  getAvailableModels() {
    return Object.keys(this.models);
  }

  getModelCapabilities(model) {
    const capabilities = {
      'gemini-pro': {
        maxTokens: 32768,
        supportsVision: false,
        supportsStreaming: true,
        supportsFunctions: true
      },
      'gemini-pro-vision': {
        maxTokens: 16384,
        supportsVision: true,
        supportsStreaming: true,
        supportsFunctions: false
      },
      'gemini-1.5-pro': {
        maxTokens: 1048576,
        supportsVision: true,
        supportsStreaming: true,
        supportsFunctions: true
      },
      'gemini-1.5-flash': {
        maxTokens: 1048576,
        supportsVision: true,
        supportsStreaming: true,
        supportsFunctions: true
      }
    };

    return capabilities[model] || null;
  }
}