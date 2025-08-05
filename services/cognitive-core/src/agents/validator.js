// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/validator.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { VALIDATOR_PROMPT } from '../prompts/validator.prompt.js';

class ValidatorAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Validating ${Array.isArray(input) ? input.length : 0} transactions`;
  }

  async executeTask(transactions, context = {}) {
    const {
      currentFlow = { nodes: [], edges: [] },
      qualityMode = 'standard'
    } = context;

    const prompt = `${VALIDATOR_PROMPT}\n\n# AKTUELLER FLOW-ZUSTAND\n${JSON.stringify(currentFlow, null, 2)}\n\n# ZU PRÜFENDE TRANSAKTIONEN\n${JSON.stringify(transactions, null, 2)}\n\n# DEINE VALIDIERUNG (NUR JSON):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate response structure
    if (!response.status || !['OK', 'ERROR'].includes(response.status)) {
      throw new Error('Validator must return status field with OK or ERROR');
    }

    if (!Array.isArray(response.issues)) {
      throw new Error('Validator must return issues array');
    }

    this.logger.logAgentAction(this.agentName, 'Validation completed', {
      status: response.status,
      issueCount: response.issues.length,
      transactionCount: Array.isArray(transactions) ? transactions.length : 0,
      issues: response.issues,
    });

    return response;
  }
}

export { ValidatorAgent };