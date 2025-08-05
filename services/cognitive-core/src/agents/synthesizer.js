// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/synthesizer.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { SYNTHESIZER_PROMPT } from '../prompts/synthesizer.prompt.js';

class SynthesizerAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Synthesizing response from multiple agent results`;
  }

  async executeTask(input, context = {}) {
    const {
      userMessage = '',
      plan = null,
      answer = null,
      error = null,
      qualityMode = 'standard'
    } = context;

    // Build context for synthesis
    let synthesisContext = `# ERGEBNISSE ZUR SYNTHESE\n`;
    
    if (plan) {
      synthesisContext += `## GENERIERTER PLAN\n${JSON.stringify(plan, null, 2)}\n\n`;
    }
    
    if (answer) {
      synthesisContext += `## ANTWORT AUF FRAGE\n${answer}\n\n`;
    }
    
    if (error) {
      synthesisContext += `## FEHLER\n${error}\n\n`;
    }

    synthesisContext += `## ORIGINAL NUTZERANFRAGE\n"${userMessage}"\n\n`;

    const prompt = `${SYNTHESIZER_PROMPT}\n\n${synthesisContext}# DEINE FORMULIERTE ANTWORT (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response
    if (!response.message || typeof response.message !== 'string') {
      throw new Error('Synthesizer must return a message field with string content');
    }

    this.logger.logAgentAction(this.agentName, 'Response synthesized', {
      hasPlan: !!plan,
      hasAnswer: !!answer,
      hasError: !!error,
      messageLength: response.message.length,
    });

    return response;
  }
}

export { SynthesizerAgent };