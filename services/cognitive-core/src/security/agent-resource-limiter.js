/**
 * Agent Resource Limiter
 * 
 * Enforces resource limits per agent to prevent resource exhaustion and ensure fair resource allocation.
 * Monitors memory usage, execution time, concurrent operations, and token usage.
 */

export class AgentResourceLimiter {
  constructor(logger, config = {}) {
    this.logger = logger;
    
    // Resource limit configuration per agent
    this.config = {
      // Default resource limits
      defaultLimits: {
        maxMemoryMB: 512,           // Max memory usage in MB
        maxExecutionTime: 30000,    // Max execution time in milliseconds
        maxConcurrentRequests: 5,   // Max concurrent requests per agent
        maxTokens: 4000,            // Max tokens per request
        maxPromptLength: 8000,      // Max prompt length in characters
        maxResponseLength: 16000,   // Max response length in characters
        maxRetries: 3               // Max retry attempts
      },
      
      // Agent-specific limits (can override defaults)
      agentLimits: {
        planner: {
          maxMemoryMB: 256,
          maxExecutionTime: 20000,
          maxConcurrentRequests: 3,
          maxTokens: 3000
        },
        architect: {
          maxMemoryMB: 512,
          maxExecutionTime: 25000,
          maxConcurrentRequests: 4,
          maxTokens: 4000
        },
        validator: {
          maxMemoryMB: 384,
          maxExecutionTime: 15000,
          maxConcurrentRequests: 6,
          maxTokens: 2500
        },
        analyst: {
          maxMemoryMB: 1024,         // Higher memory for analysis
          maxExecutionTime: 45000,    // Longer execution time for analysis
          maxConcurrentRequests: 2,   // Lower concurrency for heavy operations
          maxTokens: 6000
        }
      },
      
      // Global system limits
      systemLimits: {
        totalMaxMemoryMB: 4096,     // Total system memory limit
        totalMaxConcurrentRequests: 20, // Total concurrent requests across all agents
        emergencyShutdownThreshold: 0.95 // Emergency shutdown at 95% resource usage
      },
      
      // Monitoring intervals
      monitoringInterval: 5000,     // Monitor resources every 5 seconds
      cleanupInterval: 60000,       // Cleanup expired operations every minute
      
      ...config
    };
    
    // Active operations tracking
    this.activeOperations = new Map(); // operationId -> operation details
    this.agentOperations = new Map();  // agentName -> Set of operation IDs
    this.resourceUsage = new Map();    // agentName -> current resource usage
    
    // System-wide tracking
    this.systemResourceUsage = {
      totalMemoryMB: 0,
      totalConcurrentRequests: 0,
      startTime: Date.now()
    };
    
    // Metrics
    this.metrics = {
      totalOperations: 0,
      rejectedOperations: 0,
      timeoutOperations: 0,
      memoryLimitExceeded: 0,
      concurrencyLimitExceeded: 0,
      agentMetrics: new Map()
    };
    
    // Start monitoring
    this.startResourceMonitoring();
  }

  /**
   * Check if operation can proceed based on resource limits
   */
  async checkResourceLimits(agentName, operationId, context = {}) {
    const startTime = Date.now();
    
    try {
      const limits = this.getAgentLimits(agentName);
      const currentUsage = this.getAgentResourceUsage(agentName);
      
      // Check various resource limits
      const checks = [
        this.checkMemoryLimit(agentName, limits, currentUsage),
        this.checkConcurrencyLimit(agentName, limits, currentUsage),
        this.checkSystemLimits(),
        this.checkPromptLimits(context.prompt, limits)
      ];
      
      const results = await Promise.all(checks);
      const memoryCheck = results[0];
      const concurrencyCheck = results[1];
      const systemCheck = results[2];
      const promptCheck = results[3];
      
      // Determine if operation should be allowed
      const allowed = memoryCheck.allowed && 
                     concurrencyCheck.allowed && 
                     systemCheck.allowed && 
                     promptCheck.allowed;
      
      const result = {
        allowed,
        operationId,
        agentName,
        limits,
        currentUsage,
        checks: {
          memory: memoryCheck,
          concurrency: concurrencyCheck,
          system: systemCheck,
          prompt: promptCheck
        },
        checkDuration: Date.now() - startTime
      };
      
      if (!allowed) {
        // Find the primary reason for rejection
        result.reason = this.getPrimaryRejectionReason(results);
        this.metrics.rejectedOperations++;
        this.updateAgentMetrics(agentName, 'rejected');
        
        this.logger.warn('Operation rejected due to resource limits', {
          operationId,
          agentName,
          reason: result.reason,
          limits,
          currentUsage
        });
      } else {
        // Reserve resources for the operation
        await this.reserveResources(operationId, agentName, limits, context);
      }
      
      this.metrics.totalOperations++;
      return result;
      
    } catch (error) {
      this.logger.error('Resource limit check failed', error);
      // Fail closed - reject operation if check fails
      return {
        allowed: false,
        operationId,
        agentName,
        error: error.message,
        reason: 'Resource check failed'
      };
    }
  }

  /**
   * Reserve resources for an operation
   */
  async reserveResources(operationId, agentName, limits, context) {
    const operation = {
      operationId,
      agentName,
      startTime: Date.now(),
      limits,
      context: {
        userId: context.userId,
        promptLength: context.prompt?.length || 0,
        expectedTokens: context.maxTokens || limits.maxTokens
      },
      resourceUsage: {
        memoryMB: 0,
        executionTime: 0,
        tokens: 0
      },
      status: 'active'
    };
    
    // Track operation
    this.activeOperations.set(operationId, operation);
    
    // Update agent operations
    if (!this.agentOperations.has(agentName)) {
      this.agentOperations.set(agentName, new Set());
    }
    this.agentOperations.get(agentName).add(operationId);
    
    // Update resource usage
    this.updateResourceUsage(agentName);
    
    this.logger.debug('Resources reserved', {
      operationId,
      agentName,
      concurrentOperations: this.agentOperations.get(agentName).size
    });
    
    // Set timeout for operation
    setTimeout(() => {
      this.handleOperationTimeout(operationId);
    }, limits.maxExecutionTime);
  }

  /**
   * Release resources when operation completes
   */
  async releaseResources(operationId, result = {}) {
    const operation = this.activeOperations.get(operationId);
    
    if (!operation) {
      this.logger.warn('Attempted to release unknown operation', { operationId });
      return;
    }
    
    const { agentName } = operation;
    const executionTime = Date.now() - operation.startTime;
    
    // Update operation with final results
    operation.status = 'completed';
    operation.resourceUsage.executionTime = executionTime;
    operation.resourceUsage.tokens = result.tokens || 0;
    operation.result = result;
    
    // Remove from active operations
    this.activeOperations.delete(operationId);
    
    // Remove from agent operations
    if (this.agentOperations.has(agentName)) {
      this.agentOperations.get(agentName).delete(operationId);
    }
    
    // Update resource usage
    this.updateResourceUsage(agentName);
    this.updateAgentMetrics(agentName, 'completed', executionTime);
    
    this.logger.debug('Resources released', {
      operationId,
      agentName,
      executionTime,
      tokens: operation.resourceUsage.tokens
    });
  }

  /**
   * Handle operation timeout
   */
  handleOperationTimeout(operationId) {
    const operation = this.activeOperations.get(operationId);
    
    if (operation && operation.status === 'active') {
      operation.status = 'timeout';
      
      this.logger.warn('Operation timed out', {
        operationId,
        agentName: operation.agentName,
        executionTime: Date.now() - operation.startTime,
        limit: operation.limits.maxExecutionTime
      });
      
      this.metrics.timeoutOperations++;
      this.updateAgentMetrics(operation.agentName, 'timeout');
      
      // Release resources
      this.releaseResources(operationId, { timeout: true });
    }
  }

  /**
   * Check memory limit for agent
   */
  async checkMemoryLimit(agentName, limits, currentUsage) {
    const memoryUsage = currentUsage.memoryMB || 0;
    const allowed = memoryUsage < limits.maxMemoryMB;
    
    return {
      allowed,
      type: 'memory',
      current: memoryUsage,
      limit: limits.maxMemoryMB,
      usage: limits.maxMemoryMB > 0 ? (memoryUsage / limits.maxMemoryMB) * 100 : 0
    };
  }

  /**
   * Check concurrency limit for agent
   */
  async checkConcurrencyLimit(agentName, limits, currentUsage) {
    const concurrentOps = currentUsage.concurrentOperations || 0;
    const allowed = concurrentOps < limits.maxConcurrentRequests;
    
    return {
      allowed,
      type: 'concurrency',
      current: concurrentOps,
      limit: limits.maxConcurrentRequests,
      usage: limits.maxConcurrentRequests > 0 ? (concurrentOps / limits.maxConcurrentRequests) * 100 : 0
    };
  }

  /**
   * Check system-wide resource limits
   */
  async checkSystemLimits() {
    const systemUsage = this.systemResourceUsage;
    const limits = this.config.systemLimits;
    
    const memoryAllowed = systemUsage.totalMemoryMB < limits.totalMaxMemoryMB;
    const concurrencyAllowed = systemUsage.totalConcurrentRequests < limits.totalMaxConcurrentRequests;
    
    return {
      allowed: memoryAllowed && concurrencyAllowed,
      type: 'system',
      memory: {
        current: systemUsage.totalMemoryMB,
        limit: limits.totalMaxMemoryMB,
        allowed: memoryAllowed
      },
      concurrency: {
        current: systemUsage.totalConcurrentRequests,
        limit: limits.totalMaxConcurrentRequests,
        allowed: concurrencyAllowed
      }
    };
  }

  /**
   * Check prompt and token limits
   */
  async checkPromptLimits(prompt, limits) {
    if (!prompt) {
      return { allowed: true, type: 'prompt' };
    }
    
    const promptLength = prompt.length;
    const estimatedTokens = Math.ceil(promptLength / 4); // Rough estimation
    
    const promptAllowed = promptLength <= limits.maxPromptLength;
    const tokensAllowed = estimatedTokens <= limits.maxTokens;
    
    return {
      allowed: promptAllowed && tokensAllowed,
      type: 'prompt',
      promptLength: {
        current: promptLength,
        limit: limits.maxPromptLength,
        allowed: promptAllowed
      },
      tokens: {
        estimated: estimatedTokens,
        limit: limits.maxTokens,
        allowed: tokensAllowed
      }
    };
  }

  /**
   * Get current resource usage for an agent
   */
  getAgentResourceUsage(agentName) {
    const agentOps = this.agentOperations.get(agentName) || new Set();
    const concurrentOperations = agentOps.size;
    
    // Calculate memory usage from active operations
    let memoryMB = 0;
    for (const opId of agentOps) {
      const operation = this.activeOperations.get(opId);
      if (operation) {
        // Estimate memory usage based on operation type and duration
        const duration = Date.now() - operation.startTime;
        const baseMemory = 50; // Base memory per operation in MB
        const durationMultiplier = Math.min(duration / 1000 / 60, 2); // Max 2x multiplier
        memoryMB += baseMemory * (1 + durationMultiplier);
      }
    }
    
    return {
      concurrentOperations,
      memoryMB,
      agentName,
      lastUpdated: Date.now()
    };
  }

  /**
   * Update system resource usage
   */
  updateResourceUsage(agentName) {
    // Update agent-specific usage
    const usage = this.getAgentResourceUsage(agentName);
    this.resourceUsage.set(agentName, usage);
    
    // Update system-wide usage
    this.systemResourceUsage.totalConcurrentRequests = this.activeOperations.size;
    this.systemResourceUsage.totalMemoryMB = Array.from(this.resourceUsage.values())
      .reduce((total, usage) => total + usage.memoryMB, 0);
  }

  /**
   * Get resource limits for specific agent
   */
  getAgentLimits(agentName) {
    const agentSpecific = this.config.agentLimits[agentName] || {};
    const defaults = this.config.defaultLimits;
    
    return {
      ...defaults,
      ...agentSpecific
    };
  }

  /**
   * Get primary reason for operation rejection
   */
  getPrimaryRejectionReason(checkResults) {
    const [memoryCheck, concurrencyCheck, systemCheck, promptCheck] = checkResults;
    
    if (!systemCheck.allowed) {
      return `System resource limit exceeded: ${!systemCheck.memory.allowed ? 'memory' : 'concurrency'}`;
    }
    if (!memoryCheck.allowed) {
      return `Agent memory limit exceeded: ${memoryCheck.current}MB > ${memoryCheck.limit}MB`;
    }
    if (!concurrencyCheck.allowed) {
      return `Agent concurrency limit exceeded: ${concurrencyCheck.current} > ${concurrencyCheck.limit}`;
    }
    if (!promptCheck.allowed) {
      if (!promptCheck.promptLength.allowed) {
        return `Prompt too long: ${promptCheck.promptLength.current} > ${promptCheck.promptLength.limit} chars`;
      }
      if (!promptCheck.tokens.allowed) {
        return `Too many tokens: ${promptCheck.tokens.estimated} > ${promptCheck.tokens.limit}`;
      }
    }
    
    return 'Resource limit exceeded';
  }

  /**
   * Update agent-specific metrics
   */
  updateAgentMetrics(agentName, status, executionTime = 0) {
    if (!this.metrics.agentMetrics.has(agentName)) {
      this.metrics.agentMetrics.set(agentName, {
        totalOperations: 0,
        completedOperations: 0,
        rejectedOperations: 0,
        timeoutOperations: 0,
        averageExecutionTime: 0,
        lastActivity: null
      });
    }
    
    const metrics = this.metrics.agentMetrics.get(agentName);
    metrics.totalOperations++;
    metrics.lastActivity = Date.now();
    
    switch (status) {
      case 'completed':
        metrics.completedOperations++;
        // Update average execution time
        const count = metrics.completedOperations;
        metrics.averageExecutionTime = 
          (metrics.averageExecutionTime * (count - 1) + executionTime) / count;
        break;
      case 'rejected':
        metrics.rejectedOperations++;
        break;
      case 'timeout':
        metrics.timeoutOperations++;
        break;
    }
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    // Monitor resources periodically
    this.monitoringTimer = setInterval(() => {
      this.monitorResources();
    }, this.config.monitoringInterval);
    
    // Cleanup expired operations
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredOperations();
    }, this.config.cleanupInterval);
    
    this.logger.info('Resource monitoring started');
  }

  /**
   * Monitor current resource usage
   */
  monitorResources() {
    // Update all agent resource usage
    for (const agentName of this.agentOperations.keys()) {
      this.updateResourceUsage(agentName);
    }
    
    // Check for emergency shutdown conditions
    const systemUsage = this.systemResourceUsage;
    const limits = this.config.systemLimits;
    
    const memoryUsagePercent = systemUsage.totalMemoryMB / limits.totalMaxMemoryMB;
    const concurrencyUsagePercent = systemUsage.totalConcurrentRequests / limits.totalMaxConcurrentRequests;
    
    if (memoryUsagePercent > limits.emergencyShutdownThreshold || 
        concurrencyUsagePercent > limits.emergencyShutdownThreshold) {
      
      this.logger.error('Emergency resource threshold exceeded', {
        memoryUsage: memoryUsagePercent,
        concurrencyUsage: concurrencyUsagePercent,
        threshold: limits.emergencyShutdownThreshold
      });
      
      // Emergency cleanup of oldest operations
      this.emergencyCleanup();
    }
  }

  /**
   * Cleanup expired operations
   */
  cleanupExpiredOperations() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    let cleanedCount = 0;
    
    for (const [operationId, operation] of this.activeOperations.entries()) {
      if (now - operation.startTime > maxAge) {
        this.logger.warn('Cleaning up stale operation', {
          operationId,
          agentName: operation.agentName,
          age: now - operation.startTime
        });
        
        this.releaseResources(operationId, { cleanup: true });
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} stale operations`);
    }
  }

  /**
   * Emergency cleanup when resources are critically low
   */
  emergencyCleanup() {
    // Sort operations by age (oldest first)
    const operations = Array.from(this.activeOperations.entries())
      .sort(([,a], [,b]) => a.startTime - b.startTime);
    
    // Cancel the oldest 25% of operations
    const countToCancel = Math.ceil(operations.length * 0.25);
    
    for (let i = 0; i < countToCancel; i++) {
      const [operationId, operation] = operations[i];
      
      this.logger.warn('Emergency cleanup: canceling operation', {
        operationId,
        agentName: operation.agentName,
        age: Date.now() - operation.startTime
      });
      
      this.releaseResources(operationId, { emergencyCleanup: true });
    }
  }

  /**
   * Get current resource statistics
   */
  getResourceStatistics() {
    return {
      system: {
        ...this.systemResourceUsage,
        uptime: Date.now() - this.systemResourceUsage.startTime
      },
      agents: Object.fromEntries(
        Array.from(this.resourceUsage.entries())
      ),
      operations: {
        active: this.activeOperations.size,
        total: this.metrics.totalOperations,
        rejected: this.metrics.rejectedOperations,
        timeouts: this.metrics.timeoutOperations
      },
      agentMetrics: Object.fromEntries(this.metrics.agentMetrics),
      configuration: {
        defaultLimits: this.config.defaultLimits,
        systemLimits: this.config.systemLimits,
        agentSpecificLimits: Object.keys(this.config.agentLimits).length
      }
    };
  }

  /**
   * Health check for resource limiter
   */
  async healthCheck() {
    const stats = this.getResourceStatistics();
    const systemLimits = this.config.systemLimits;
    
    const memoryUsage = stats.system.totalMemoryMB / systemLimits.totalMaxMemoryMB;
    const concurrencyUsage = stats.system.totalConcurrentRequests / systemLimits.totalMaxConcurrentRequests;
    
    let status = 'healthy';
    const issues = [];
    
    if (memoryUsage > 0.8) {
      status = 'degraded';
      issues.push(`High memory usage: ${Math.round(memoryUsage * 100)}%`);
    }
    
    if (concurrencyUsage > 0.8) {
      status = 'degraded';
      issues.push(`High concurrency usage: ${Math.round(concurrencyUsage * 100)}%`);
    }
    
    if (memoryUsage > 0.95 || concurrencyUsage > 0.95) {
      status = 'critical';
    }
    
    return {
      status,
      issues,
      resourceUsage: {
        memory: Math.round(memoryUsage * 100),
        concurrency: Math.round(concurrencyUsage * 100)
      },
      statistics: stats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Shutdown resource limiter
   */
  shutdown() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Cancel all active operations
    for (const operationId of this.activeOperations.keys()) {
      this.releaseResources(operationId, { shutdown: true });
    }
    
    this.logger.info('Resource limiter shutdown completed', {
      operationsCleared: this.activeOperations.size
    });
  }
}