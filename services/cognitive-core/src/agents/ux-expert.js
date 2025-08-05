// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/ux-expert.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { UX_EXPERT_PROMPT } from '../prompts/ux-expert.prompt.js';

class UxExpertAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Answering UX question: "${input?.substring(0, 50)}..."`;
  }

  async executeTask(question, context = {}) {
    const {
      currentFlow = { nodes: [], edges: [] },
      ragContext = '',
      qualityMode = 'standard'
    } = context;

    const prompt = `${UX_EXPERT_PROMPT}\n\n# WISSENS-KONTEXT\n${ragContext}\n\n# AKTUELLER FLOW\n${JSON.stringify(currentFlow, null, 2)}\n\n# NUTZERFRAGE\n"${question}"\n\n# DEINE ANTWORT (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response
    if (!response.answer || typeof response.answer !== 'string') {
      throw new Error('UX Expert must return an answer field with string content');
    }

    this.logger.logAgentAction(this.agentName, 'UX question answered', {
      questionLength: question.length,
      answerLength: response.answer.length,
      hasRAGContext: !!ragContext,
      flowNodeCount: currentFlow.nodes?.length || 0,
    });

    return response;
  }
}

export { UxExpertAgent };