// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/planner.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { PLANNER_PROMPT } from '../prompts/planner.prompt.js';

class PlannerAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Creating detailed execution plan for task: ${input?.substring(0, 50)}...`;
  }

  async executeTask(task, context = {}) {
    const {
      currentFlow = { nodes: [], edges: [] },
      ragContext = '',
      qualityMode = 'standard'
    } = context;

    // Build the complete prompt
    let prompt = PLANNER_PROMPT;
    
    // Replace template variables
    prompt = prompt.replace('{{ragContext}}', ragContext);
    prompt = prompt.replace('{{currentFlowJson}}', JSON.stringify(currentFlow, null, 2));
    prompt = prompt.replace('{{task}}', task);

    const response = await this.callModel(prompt, qualityMode);

    // Validate that we got a plan array
    if (!Array.isArray(response)) {
      throw new Error('Planner agent must return an array of plan steps');
    }

    // Validate each step has required fields
    const validatedPlan = response.map((step, index) => {
      if (!step.task || !step.reasoning) {
        throw new Error(`Plan step ${index} missing required fields (task, reasoning)`);
      }
      return {
        task: step.task,
        reasoning: step.reasoning,
        stepNumber: index + 1,
      };
    });

    this.logger.logAgentAction(this.agentName, 'Plan created', {
      stepCount: validatedPlan.length,
      taskLength: task.length,
      hasRAGContext: !!ragContext,
      flowNodeCount: currentFlow.nodes?.length || 0,
    });

    return validatedPlan;
  }
}

export { PlannerAgent };