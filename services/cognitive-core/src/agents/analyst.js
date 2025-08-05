// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/analyst.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { ANALYST_PROMPT } from '../prompts/analyst.prompt.js';

class AnalystAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Analyzing system logs for improvement opportunities`;
  }

  async executeTask(logData, context = {}) {
    const { qualityMode = 'pro' } = context; // Use pro model for analysis

    // Prepare log data for analysis
    const logText = Array.isArray(logData) ? logData.join('\n') : logData;

    const prompt = `${ANALYST_PROMPT}\n\n# LOG-DATEN ZUR ANALYSE\n${logText}\n\n# DEINE ANALYSE (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response
    if (!response.recommendation || typeof response.recommendation !== 'string') {
      throw new Error('Analyst must return a recommendation field with string content');
    }

    this.logger.logAgentAction(this.agentName, 'Log analysis completed', {
      logDataLength: logText.length,
      recommendationLength: response.recommendation.length,
      hasSourceAgent: !!response.sourceAgent,
    });

    return response;
  }
}

export { AnalystAgent };