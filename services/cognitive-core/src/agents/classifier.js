// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/classifier.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { CLASSIFIER_PROMPT } from '../prompts/classifier.prompt.js';

class ClassifierAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Classifying user message: "${input?.substring(0, 30)}..."`;
  }

  async executeTask(userMessage, context = {}) {
    const { qualityMode = 'standard' } = context;

    const prompt = `${CLASSIFIER_PROMPT}\n\n# NUTZERANWEISUNG\n"${userMessage}"\n\n# DEINE ANTWORT (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response structure
    const requiredFields = ['intent', 'sentiment', 'tasks', 'questions'];
    for (const field of requiredFields) {
      if (!(field in response)) {
        throw new Error(`Classifier response missing required field: ${field}`);
      }
    }

    // Validate field types
    if (!['build_request', 'question_about_flow', 'meta_question', 'general_conversation'].includes(response.intent)) {
      throw new Error(`Invalid intent: ${response.intent}`);
    }

    if (!['neutral', 'positive', 'corrective'].includes(response.sentiment)) {
      throw new Error(`Invalid sentiment: ${response.sentiment}`);
    }

    if (!Array.isArray(response.tasks) || !Array.isArray(response.questions)) {
      throw new Error('Tasks and questions must be arrays');
    }

    this.logger.logAgentAction(this.agentName, 'Message classified', {
      intent: response.intent,
      sentiment: response.sentiment,
      taskCount: response.tasks.length,
      questionCount: response.questions.length,
      messageLength: userMessage.length,
    });

    return response;
  }
}

export { ClassifierAgent };