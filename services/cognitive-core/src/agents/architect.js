// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/architect.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { ARCHITECT_PROMPT } from '../prompts/architect.prompt.js';

class ArchitectAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Converting plan to executable transactions`;
  }

  async executeTask(plan, context = {}) {
    const {
      currentFlow = { nodes: [], edges: [] },
      qualityMode = 'standard'
    } = context;

    const prompt = `${ARCHITECT_PROMPT}\n\n# AKTUELLER FLOW-ZUSTAND\n${JSON.stringify(currentFlow, null, 2)}\n\n# VOM PLANNER ERSTELLTER GESAMTPLAN\n${JSON.stringify(plan, null, 2)}\n\n# DEINE TRANSAKTIONEN (NUR JSON-ARRAY):`;
    
    const response = await this.callModel(prompt, qualityMode);

    // Validate that we got an array of transactions
    if (!Array.isArray(response)) {
      throw new Error('Architect must return an array of transactions');
    }

    // Validate each transaction
    const validatedTransactions = response.map((transaction, index) => {
      if (!transaction.action || !transaction.payload) {
        throw new Error(`Transaction ${index} missing required fields (action, payload)`);
      }

      const validActions = ['ADD_NODE', 'UPDATE_NODE', 'ADD_EDGE', 'DELETE_NODE', 'DELETE_EDGE'];
      if (!validActions.includes(transaction.action)) {
        throw new Error(`Invalid transaction action: ${transaction.action}`);
      }

      return transaction;
    });

    this.logger.logAgentAction(this.agentName, 'Transactions generated', {
      transactionCount: validatedTransactions.length,
      planStepCount: Array.isArray(plan) ? plan.length : 0,
      flowNodeCount: currentFlow.nodes?.length || 0,
      actions: validatedTransactions.map(t => t.action),
    });

    return validatedTransactions;
  }
}

export { ArchitectAgent };