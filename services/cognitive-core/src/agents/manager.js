// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/manager.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { MANAGER_PROMPT } from '../prompts/manager.prompt.js';

class ManagerAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Analyzing user request and determining task approach`;
  }

  async executeTask(userMessage, context = {}) {
    const { 
      context: fullContext = '',
      improvementSuggestion = null,
      qualityMode = 'standard' 
    } = context;

    // Build the complete prompt
    let prompt = MANAGER_PROMPT;
    
    // Replace template variables
    prompt = prompt.replace('{{longTermMemory}}', this.extractLongTermMemory(fullContext));
    prompt = prompt.replace('{{midTermMemory}}', this.extractMidTermMemory(fullContext));
    prompt = prompt.replace('{{shortTermMemory}}', this.extractShortTermMemory(fullContext));
    prompt = prompt.replace('{{improvementSuggestion}}', improvementSuggestion || 'None');

    // Add the user message at the end
    prompt += `\n\n# NUTZERANWEISUNG\n"${userMessage}"\n\n# DEINE ANTWORT (NUR JSON):`;

    const response = await this.callModel(prompt, qualityMode);

    // Validate response structure
    if (!response.type || !['clarification_question', 'planner_task'].includes(response.type)) {
      throw new Error('Manager agent returned invalid response format');
    }

    this.logger.logAgentAction(this.agentName, 'Task analysis completed', {
      responseType: response.type,
      hasComplexity: !!response.complexity,
      userMessageLength: userMessage.length,
    });

    return response;
  }

  extractLongTermMemory(fullContext) {
    // Extract long-term facts from context
    const match = fullContext.match(/--- Langzeit-Fakten ---\n(.*?)\n\n--- /s);
    return match ? match[1] : 'No long-term memory available';
  }

  extractMidTermMemory(fullContext) {
    // Extract mid-term summary from context
    const match = fullContext.match(/--- Mittelfristige Zusammenfassung ---\n(.*?)\n\n--- /s);
    return match ? match[1] : 'No mid-term memory available';
  }

  extractShortTermMemory(fullContext) {
    // Extract short-term memory from context
    const match = fullContext.match(/--- Kurzzeitgedächtnis.*? ---\n(.*?)$/s);
    return match ? match[1] : 'No short-term memory available';
  }
}

export { ManagerAgent };