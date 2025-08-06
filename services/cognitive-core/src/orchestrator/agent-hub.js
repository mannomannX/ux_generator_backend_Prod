// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/agent-hub.js
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * AgentHub manages agent registration, discovery, and inter-agent communication
 * Provides centralized agent registry and routing capabilities
 */
class AgentHub {
  constructor(logger, eventEmitter, stateManager) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.stateManager = stateManager;
    
    // Agent registry
    this.agents = new Map();
    this.agentMetadata = new Map();
    this.agentDependencies = new Map();
    
    // Agent communication patterns
    this.workflowPatterns = {
      'user_message_processing': [
        'classifier',
        'manager',
        ['planner', 'uxExpert'], // Parallel options
        'architect',
        'validator', 
        'synthesizer'
      ],
      'plan_execution': [
        'architect',
        'validator'
      ],
      'visual_interpretation': [
        'visualInterpreter',
        'synthesizer'
      ],
      'system_analysis': [
        'analyst'
      ]
    };
    
    // Agent performance tracking
    this.performanceMetrics = new Map();
    
    this.logger.info('AgentHub initialized');
  }

  /**
   * Register an agent with the hub
   */
  registerAgent(name, agent, metadata = {}) {
    if (this.agents.has(name)) {
      throw new Error(`Agent '${name}' is already registered`);
    }

    this.agents.set(name, agent);
    
    const agentMetadata = {
      name,
      registeredAt: new Date(),
      capabilities: metadata.capabilities || [],
      inputTypes: metadata.inputTypes || ['string'],
      outputTypes: metadata.outputTypes || ['object'],
      qualityModes: metadata.qualityModes || ['standard'],
      maxConcurrency: metadata.maxConcurrency || 1,
      averageProcessingTime: metadata.averageProcessingTime || 5000,
      dependencies: metadata.dependencies || [],
      description: metadata.description || '',
      version: metadata.version || '1.0.0'
    };

    this.agentMetadata.set(name, agentMetadata);
    
    // Initialize performance tracking
    this.performanceMetrics.set(name, {
      totalInvocations: 0,
      successfulInvocations: 0,
      failedInvocations: 0,
      averageResponseTime: 0,
      lastInvocation: null,
      errorRate: 0
    });

    this.logger.info('Agent registered', {
      name,
      capabilities: agentMetadata.capabilities,
      inputTypes: agentMetadata.inputTypes,
      outputTypes: agentMetadata.outputTypes
    });

    // Emit agent registration event
    this.eventEmitter.emit(EventTypes.AGENT_REGISTERED, {
      agentName: name,
      metadata: agentMetadata,
      timestamp: new Date()
    });

    return agentMetadata;
  }

  /**
   * Get agent by name
   */
  getAgent(name) {
    return this.agents.get(name);
  }

  /**
   * Get all registered agents
   */
  getAllAgents() {
    return Array.from(this.agents.keys());
  }

  /**
   * Get agent metadata
   */
  getAgentMetadata(name) {
    return this.agentMetadata.get(name);
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(capability) {
    const matchingAgents = [];
    
    for (const [name, metadata] of this.agentMetadata.entries()) {
      if (metadata.capabilities.includes(capability)) {
        matchingAgents.push({
          name,
          metadata,
          agent: this.agents.get(name)
        });
      }
    }
    
    return matchingAgents;
  }

  /**
   * Route task to appropriate agent
   */
  async routeTask(taskType, input, context = {}) {
    const workflow = this.workflowPatterns[taskType];
    
    if (!workflow) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    this.logger.info('Routing task through workflow', {
      taskType,
      workflow,
      inputType: typeof input
    });

    return await this.executeWorkflow(workflow, input, context);
  }

  /**
   * Execute a workflow pattern
   */
  async executeWorkflow(workflow, initialInput, context = {}) {
    let currentInput = initialInput;
    const workflowResults = [];
    
    for (const step of workflow) {
      if (Array.isArray(step)) {
        // Parallel execution options - choose best agent
        const agent = await this.selectBestAgentFromOptions(step, currentInput, context);
        const result = await this.invokeAgent(agent, currentInput, context);
        workflowResults.push({ agent, result });
        currentInput = result;
      } else {
        // Sequential execution
        const result = await this.invokeAgent(step, currentInput, context);
        workflowResults.push({ agent: step, result });
        currentInput = result;
      }
    }
    
    return {
      finalResult: currentInput,
      workflowResults,
      executedAgents: workflowResults.map(wr => wr.agent)
    };
  }

  /**
   * Select best agent from parallel options
   */
  async selectBestAgentFromOptions(agentOptions, input, context) {
    // Selection criteria: availability, performance, context compatibility
    let bestAgent = null;
    let bestScore = -1;
    
    for (const agentName of agentOptions) {
      const agent = this.agents.get(agentName);
      const metadata = this.agentMetadata.get(agentName);
      const performance = this.performanceMetrics.get(agentName);
      
      if (!agent || !metadata || !performance) {
        continue;
      }
      
      // Check availability
      const agentStatus = this.stateManager.getAgentStatus(agentName);
      if (!agentStatus || agentStatus.available <= 0) {
        continue; // Agent not available
      }
      
      // Calculate selection score
      let score = 0;
      
      // Performance score (lower error rate and response time is better)
      score += (1 - performance.errorRate) * 40;
      score += Math.max(0, 100 - performance.averageResponseTime / 100) * 30;
      
      // Availability score
      score += (agentStatus.available / agentStatus.capacity) * 20;
      
      // Context compatibility score
      if (this.isAgentCompatibleWithContext(agentName, context)) {
        score += 10;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agentName;
      }
    }
    
    if (!bestAgent) {
      // Fallback to first available agent
      bestAgent = agentOptions.find(name => {
        const status = this.stateManager.getAgentStatus(name);
        return status && status.available > 0;
      }) || agentOptions[0];
    }
    
    this.logger.debug('Selected agent from options', {
      options: agentOptions,
      selected: bestAgent,
      score: bestScore
    });
    
    return bestAgent;
  }

  /**
   * Invoke agent through state manager
   */
  async invokeAgent(agentName, input, context = {}) {
    const agent = this.agents.get(agentName);
    
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    const taskId = this.generateTaskId(agentName);
    const startTime = Date.now();
    
    try {
      // Create task in state manager
      this.stateManager.createTask(taskId, agentName, input, context);
      
      // Process task
      await this.stateManager.processNextTask();
      
      // Invoke agent
      const result = await agent.process(input, context);
      
      // Complete task
      const processingTime = Date.now() - startTime;
      await this.stateManager.completeTask(taskId, result);
      
      // Update performance metrics
      this.updatePerformanceMetrics(agentName, processingTime, true);
      
      return result;
      
    } catch (error) {
      // Handle error
      const processingTime = Date.now() - startTime;
      await this.stateManager.completeTask(taskId, null, error);
      
      // Update performance metrics
      this.updatePerformanceMetrics(agentName, processingTime, false);
      
      throw error;
    }
  }

  /**
   * Get agent performance metrics
   */
  getAgentPerformanceMetrics(agentName) {
    return this.performanceMetrics.get(agentName);
  }

  /**
   * Get all agent performance metrics
   */
  getAllAgentPerformanceMetrics() {
    const metrics = {};
    
    for (const [agentName, agentMetrics] of this.performanceMetrics.entries()) {
      metrics[agentName] = { ...agentMetrics };
    }
    
    return metrics;
  }

  /**
   * Health check for specific agent
   */
  async checkAgentHealth(agentName) {
    const agent = this.agents.get(agentName);
    const metadata = this.agentMetadata.get(agentName);
    const performance = this.performanceMetrics.get(agentName);
    
    if (!agent || !metadata || !performance) {
      return {
        status: 'not_found',
        agentName
      };
    }
    
    try {
      // Simple health check with test input
      const testResult = await agent.process('health-check', { 
        healthCheck: true,
        timeout: 5000
      });
      
      return {
        status: 'healthy',
        agentName,
        lastCheck: new Date(),
        performance: { ...performance },
        metadata: { ...metadata }
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        agentName,
        error: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Health check for all agents
   */
  async checkAllAgentsHealth() {
    const healthResults = {};
    
    for (const agentName of this.agents.keys()) {
      healthResults[agentName] = await this.checkAgentHealth(agentName);
    }
    
    return healthResults;
  }

  /**
   * Get hub statistics
   */
  getHubStatistics() {
    const totalAgents = this.agents.size;
    const totalInvocations = Array.from(this.performanceMetrics.values())
      .reduce((sum, metrics) => sum + metrics.totalInvocations, 0);
    const totalSuccessful = Array.from(this.performanceMetrics.values())
      .reduce((sum, metrics) => sum + metrics.successfulInvocations, 0);
    
    return {
      totalAgents,
      totalInvocations,
      successRate: totalInvocations > 0 ? (totalSuccessful / totalInvocations) : 1,
      registeredAgents: this.getAllAgents(),
      averageResponseTime: this.calculateOverallAverageResponseTime(),
      workflowPatterns: Object.keys(this.workflowPatterns),
      timestamp: new Date()
    };
  }

  /**
   * Private helper methods
   */

  updatePerformanceMetrics(agentName, processingTime, success) {
    const metrics = this.performanceMetrics.get(agentName);
    
    if (!metrics) {
      return;
    }
    
    metrics.totalInvocations++;
    metrics.lastInvocation = new Date();
    
    if (success) {
      metrics.successfulInvocations++;
    } else {
      metrics.failedInvocations++;
    }
    
    // Update average response time
    const totalSuccessful = metrics.successfulInvocations;
    if (success && totalSuccessful > 0) {
      metrics.averageResponseTime = 
        (metrics.averageResponseTime * (totalSuccessful - 1) + processingTime) / totalSuccessful;
    }
    
    // Update error rate
    metrics.errorRate = metrics.failedInvocations / metrics.totalInvocations;
  }

  isAgentCompatibleWithContext(agentName, context) {
    const metadata = this.agentMetadata.get(agentName);
    
    if (!metadata) {
      return false;
    }
    
    // Check quality mode compatibility
    if (context.qualityMode && !metadata.qualityModes.includes(context.qualityMode)) {
      return false;
    }
    
    // Additional context compatibility checks could be added here
    return true;
  }

  calculateOverallAverageResponseTime() {
    const metrics = Array.from(this.performanceMetrics.values());
    
    if (metrics.length === 0) {
      return 0;
    }
    
    const totalWeightedTime = metrics.reduce((sum, metric) => 
      sum + (metric.averageResponseTime * metric.successfulInvocations), 0
    );
    
    const totalSuccessful = metrics.reduce((sum, metric) => 
      sum + metric.successfulInvocations, 0
    );
    
    return totalSuccessful > 0 ? totalWeightedTime / totalSuccessful : 0;
  }

  generateTaskId(agentName) {
    return `${agentName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}

export { AgentHub };