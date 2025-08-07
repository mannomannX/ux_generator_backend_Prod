// ==========================================
// COGNITIVE CORE - Agent Manager Service
// ==========================================

import { Logger } from '@ux-flow/common';
import { ManagerAgent } from '../agents/manager.js';
import { PlannerAgent } from '../agents/planner.js';
import { ClassifierAgent } from '../agents/classifier.js';
import { SynthesizerAgent } from '../agents/synthesizer.js';
import { ValidatorAgent } from '../agents/validator.js';
import { ArchitectAgent } from '../agents/architect.js';
import { UXExpertAgent } from '../agents/ux-expert.js';
import { AnalystAgent } from '../agents/analyst.js';
import { VisualInterpreterAgent } from '../agents/visual-interpreter.js';
import { PromptOptimizerAgent } from '../agents/prompt-optimizer.js';

export class AgentManager {
  constructor(logger, config, aiProviderManager) {
    this.logger = logger || new Logger('agent-manager');
    this.config = config;
    this.aiProviderManager = aiProviderManager;
    
    // Agent registry
    this.agents = new Map();
    this.agentStats = new Map();
    
    // Initialize agents
    this.initializeAgents();
  }

  initializeAgents() {
    // Core agents
    this.registerAgent('manager', ManagerAgent);
    this.registerAgent('planner', PlannerAgent);
    this.registerAgent('classifier', ClassifierAgent);
    this.registerAgent('synthesizer', SynthesizerAgent);
    this.registerAgent('validator', ValidatorAgent);
    
    // Specialized agents
    this.registerAgent('architect', ArchitectAgent);
    this.registerAgent('ux-expert', UXExpertAgent);
    this.registerAgent('analyst', AnalystAgent);
    this.registerAgent('visual-interpreter', VisualInterpreterAgent);
    this.registerAgent('prompt-optimizer', PromptOptimizerAgent);
    
    this.logger.info('All agents initialized', {
      agentCount: this.agents.size,
      agents: Array.from(this.agents.keys())
    });
  }

  registerAgent(name, AgentClass) {
    try {
      const agent = new AgentClass({
        logger: this.logger,
        config: this.config,
        aiProvider: this.aiProviderManager
      });
      
      this.agents.set(name, agent);
      this.agentStats.set(name, {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalDuration: 0,
        averageDuration: 0,
        lastExecution: null
      });
      
      this.logger.debug(`Agent registered: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to register agent: ${name}`, error);
    }
  }

  async executeAgent(agentName, task, context = {}) {
    const agent = this.agents.get(agentName);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    const startTime = Date.now();
    const stats = this.agentStats.get(agentName);
    
    try {
      this.logger.info(`Executing agent: ${agentName}`, {
        task: typeof task === 'string' ? task.substring(0, 100) : 'complex task',
        contextKeys: Object.keys(context)
      });

      // Execute agent task
      const result = await agent.executeTask(task, context);
      
      // Update statistics
      const duration = Date.now() - startTime;
      stats.totalExecutions++;
      stats.successfulExecutions++;
      stats.totalDuration += duration;
      stats.averageDuration = stats.totalDuration / stats.totalExecutions;
      stats.lastExecution = new Date();
      
      this.logger.info(`Agent execution completed: ${agentName}`, {
        duration,
        success: true
      });

      return {
        success: true,
        agent: agentName,
        result,
        duration,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      // Update error statistics
      const duration = Date.now() - startTime;
      stats.totalExecutions++;
      stats.failedExecutions++;
      stats.lastExecution = new Date();
      
      this.logger.error(`Agent execution failed: ${agentName}`, {
        error: error.message,
        duration
      });

      throw error;
    }
  }

  async executeAgentChain(agentChain, initialInput, context = {}) {
    const results = [];
    let currentInput = initialInput;
    
    for (const agentConfig of agentChain) {
      const { agent, transform } = agentConfig;
      
      try {
        const result = await this.executeAgent(agent, currentInput, context);
        results.push(result);
        
        // Transform output for next agent if provided
        if (transform && typeof transform === 'function') {
          currentInput = transform(result.result);
        } else {
          currentInput = result.result;
        }
      } catch (error) {
        this.logger.error(`Agent chain failed at: ${agent}`, error);
        
        return {
          success: false,
          failedAt: agent,
          completedAgents: results.map(r => r.agent),
          results,
          error: error.message
        };
      }
    }
    
    return {
      success: true,
      chain: agentChain.map(a => a.agent),
      results,
      finalOutput: currentInput
    };
  }

  async determineAgentForTask(task, context = {}) {
    // Use classifier agent to determine best agent
    try {
      const classification = await this.executeAgent('classifier', task, context);
      
      if (classification.result && classification.result.suggestedAgent) {
        return classification.result.suggestedAgent;
      }
      
      // Default to manager agent
      return 'manager';
    } catch (error) {
      this.logger.error('Failed to classify task', error);
      return 'manager';
    }
  }

  getAgent(name) {
    return this.agents.get(name);
  }

  getAllAgents() {
    return Array.from(this.agents.keys()).map(name => ({
      name,
      agent: this.agents.get(name),
      stats: this.agentStats.get(name)
    }));
  }

  getAgentStats(agentName) {
    if (agentName) {
      return this.agentStats.get(agentName);
    }
    
    // Return all stats
    const allStats = {};
    for (const [name, stats] of this.agentStats) {
      allStats[name] = stats;
    }
    return allStats;
  }

  async healthCheck() {
    const health = {
      healthy: true,
      agents: {}
    };
    
    for (const [name, agent] of this.agents) {
      try {
        // Simple health check - verify agent can be called
        if (agent && typeof agent.executeTask === 'function') {
          health.agents[name] = {
            status: 'healthy',
            stats: this.agentStats.get(name)
          };
        } else {
          health.agents[name] = {
            status: 'unhealthy',
            error: 'Agent not properly initialized'
          };
          health.healthy = false;
        }
      } catch (error) {
        health.agents[name] = {
          status: 'error',
          error: error.message
        };
        health.healthy = false;
      }
    }
    
    return health;
  }

  // Reset statistics
  resetStats(agentName = null) {
    if (agentName) {
      const stats = this.agentStats.get(agentName);
      if (stats) {
        stats.totalExecutions = 0;
        stats.successfulExecutions = 0;
        stats.failedExecutions = 0;
        stats.totalDuration = 0;
        stats.averageDuration = 0;
        stats.lastExecution = null;
      }
    } else {
      // Reset all stats
      for (const stats of this.agentStats.values()) {
        stats.totalExecutions = 0;
        stats.successfulExecutions = 0;
        stats.failedExecutions = 0;
        stats.totalDuration = 0;
        stats.averageDuration = 0;
        stats.lastExecution = null;
      }
    }
  }
}

export default AgentManager;