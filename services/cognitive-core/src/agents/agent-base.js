// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/base-agent.js
// ==========================================
import { EventTypes, RetryUtils } from '@ux-flow/common';

class BaseAgent {
  constructor(context) {
    this.logger = context.logger;
    this.eventEmitter = context.eventEmitter;
    this.mongoClient = context.mongoClient;
    this.redisClient = context.redisClient;
    this.models = context.models;
    this.agentName = this.constructor.name.replace('Agent', '').toLowerCase();
  }

  async process(input, context = {}) {
    const taskId = this.generateTaskId();
    
    try {
      // Emit task started event
      this.eventEmitter.emitAgentTaskStarted(
        this.agentName,
        taskId,
        this.getTaskDescription(input, context)
      );

      // Process with retry logic
      const result = await RetryUtils.retryApiCall(
        () => this.executeTask(input, context),
        {
          maxRetries: 2,
          delay: 1000,
          logger: this.logger,
        }
      );

      // Emit task completed event
      this.eventEmitter.emitAgentTaskCompleted(this.agentName, taskId, result);

      return result;
    } catch (error) {
      // Emit task failed event
      this.eventEmitter.emit(EventTypes.AGENT_TASK_FAILED, {
        agentName: this.agentName,
        taskId,
        error: error.message,
      });

      this.logger.error(`${this.agentName} agent task failed`, error, {
        taskId,
        inputType: typeof input,
      });

      throw error;
    }
  }

  async executeTask(input, context) {
    throw new Error('executeTask must be implemented by subclass');
  }

  getTaskDescription(input, context) {
    return `Processing ${typeof input} input`;
  }

  generateTaskId() {
    return `${this.agentName}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  async callModel(prompt, qualityMode = 'standard', isVisionTask = false) {
    const model = isVisionTask ? this.models.pro : this.models[qualityMode] || this.models.standard;
    
    this.logger.debug(`Calling AI model`, {
      agent: this.agentName,
      qualityMode,
      isVisionTask,
      promptLength: prompt.length,
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    // Try to parse as JSON if it looks like JSON
    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        const sanitizedText = rawText.replace(/^```json\s*|```\s*$/g, '').trim();
        return JSON.parse(sanitizedText);
      } catch (e) {
        this.logger.warn('Failed to parse AI response as JSON, returning raw text', {
          agent: this.agentName,
          rawText: rawText.substring(0, 100),
        });
        return { rawResponse: rawText };
      }
    }

    return { rawResponse: rawText };
  }
}

export { BaseAgent };