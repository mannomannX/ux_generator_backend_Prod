// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/state-manager.js
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * StateManager handles agent execution state, task coordination, and system state
 * Manages concurrent agent tasks, system resources, and workflow orchestration
 */
class StateManager {
  constructor(logger, eventEmitter, redisClient) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.redisClient = redisClient;
    
    // System state
    this.systemState = {
      status: 'idle', // idle, busy, degraded, error
      activeAgents: new Map(),
      taskQueue: [],
      processingTasks: new Map(),
      systemMetrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0
      }
    };
    
    // Agent capacity and throttling
    this.agentCapacity = {
      manager: { max: 5, current: 0 },
      planner: { max: 3, current: 0 },
      architect: { max: 3, current: 0 },
      validator: { max: 3, current: 0 },
      classifier: { max: 10, current: 0 },
      synthesizer: { max: 5, current: 0 },
      uxExpert: { max: 3, current: 0 },
      visualInterpreter: { max: 2, current: 0 },
      analyst: { max: 2, current: 0 }
    };
    
    // Task priorities
    this.TASK_PRIORITIES = {
      CRITICAL: 1,
      HIGH: 2,
      NORMAL: 3,
      LOW: 4
    };
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupCompletedTasks();
    }, 60000); // Every minute
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    try {
      // Load persisted state from Redis if available
      const persistedState = await this.redisClient.get('system:state');
      if (persistedState) {
        this.systemState.systemMetrics = {
          ...this.systemState.systemMetrics,
          ...persistedState.systemMetrics
        };
      }

      this.logger.info('StateManager initialized', {
        systemStatus: this.systemState.status,
        agentCapacities: Object.fromEntries(
          Object.entries(this.agentCapacity).map(([k, v]) => [k, v.max])
        )
      });
    } catch (error) {
      this.logger.error('Failed to initialize StateManager', error);
      throw error;
    }
  }

  /**
   * Create a new task
   */
  createTask(taskId, agentName, input, context = {}, priority = this.TASK_PRIORITIES.NORMAL) {
    const task = {
      taskId,
      agentName,
      input,
      context,
      priority,
      status: 'queued',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      metrics: {
        queueTime: 0,
        processingTime: 0,
        totalTime: 0
      }
    };

    this.systemState.taskQueue.push(task);
    this.systemState.systemMetrics.totalTasks++;
    
    // Sort queue by priority
    this.systemState.taskQueue.sort((a, b) => a.priority - b.priority);

    this.logger.debug('Task created', {
      taskId,
      agentName,
      priority,
      queueLength: this.systemState.taskQueue.length
    });

    return task;
  }

  /**
   * Process next available task
   */
  async processNextTask() {
    if (this.systemState.taskQueue.length === 0) {
      return null;
    }

    // Find next processable task based on agent availability
    let taskIndex = -1;
    let task = null;

    for (let i = 0; i < this.systemState.taskQueue.length; i++) {
      const queuedTask = this.systemState.taskQueue[i];
      if (this.isAgentAvailable(queuedTask.agentName)) {
        taskIndex = i;
        task = queuedTask;
        break;
      }
    }

    if (!task) {
      this.logger.debug('No tasks can be processed - all agents busy');
      return null;
    }

    // Remove from queue and move to processing
    this.systemState.taskQueue.splice(taskIndex, 1);
    task.status = 'processing';
    task.startedAt = new Date();
    task.metrics.queueTime = task.startedAt - task.createdAt;
    
    this.systemState.processingTasks.set(task.taskId, task);
    this.reserveAgent(task.agentName);

    this.logger.info('Task started processing', {
      taskId: task.taskId,
      agentName: task.agentName,
      queueTime: task.metrics.queueTime,
      queueLength: this.systemState.taskQueue.length
    });

    return task;
  }

  /**
   * Complete a task
   */
  async completeTask(taskId, result = null, error = null) {
    const task = this.systemState.processingTasks.get(taskId);
    
    if (!task) {
      this.logger.warn('Attempting to complete unknown task', { taskId });
      return false;
    }

    task.completedAt = new Date();
    task.metrics.processingTime = task.completedAt - task.startedAt;
    task.metrics.totalTime = task.completedAt - task.createdAt;
    
    if (error) {
      task.status = 'failed';
      task.error = error;
      this.systemState.systemMetrics.failedTasks++;
      
      this.logger.error('Task failed', error, {
        taskId,
        agentName: task.agentName,
        processingTime: task.metrics.processingTime
      });
    } else {
      task.status = 'completed';
      task.result = result;
      this.systemState.systemMetrics.completedTasks++;
      
      this.logger.info('Task completed successfully', {
        taskId,
        agentName: task.agentName,
        processingTime: task.metrics.processingTime
      });
    }

    // Update average processing time
    this.updateAverageProcessingTime(task.metrics.processingTime);
    
    // Release agent capacity
    this.releaseAgent(task.agentName);
    
    // Move to completed tasks (keep for a while for monitoring)
    this.systemState.processingTasks.delete(taskId);
    
    // Persist metrics
    await this.persistSystemMetrics();

    return true;
  }

  /**
   * Get system state
   */
  getSystemState() {
    return {
      status: this.systemState.status,
      queueLength: this.systemState.taskQueue.length,
      processingCount: this.systemState.processingTasks.size,
      agentUtilization: this.getAgentUtilization(),
      metrics: { ...this.systemState.systemMetrics },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date()
    };
  }

  /**
   * Get detailed task information
   */
  getTaskInfo(taskId) {
    // Check processing tasks
    const processingTask = this.systemState.processingTasks.get(taskId);
    if (processingTask) {
      return { ...processingTask };
    }

    // Check queue
    const queuedTask = this.systemState.taskQueue.find(t => t.taskId === taskId);
    if (queuedTask) {
      return { ...queuedTask };
    }

    return null;
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentName) {
    const capacity = this.agentCapacity[agentName];
    if (!capacity) {
      return null;
    }

    const queuedTasks = this.systemState.taskQueue.filter(t => t.agentName === agentName).length;
    const processingTasks = Array.from(this.systemState.processingTasks.values())
      .filter(t => t.agentName === agentName).length;

    return {
      agentName,
      capacity: capacity.max,
      current: capacity.current,
      available: capacity.max - capacity.current,
      queuedTasks,
      processingTasks,
      utilizationPercent: Math.round((capacity.current / capacity.max) * 100)
    };
  }

  /**
   * Handle system load and auto-scaling
   */
  async handleSystemLoad() {
    const queueLength = this.systemState.taskQueue.length;
    const processingCount = this.systemState.processingTasks.size;
    
    // Determine system status
    let newStatus = 'idle';
    
    if (queueLength > 20 || processingCount > 15) {
      newStatus = 'busy';
    } else if (queueLength > 50 || processingCount > 25) {
      newStatus = 'degraded';
    }
    
    // Check for system errors
    const errorRate = this.systemState.systemMetrics.failedTasks / 
      (this.systemState.systemMetrics.totalTasks || 1);
    
    if (errorRate > 0.1) { // More than 10% failure rate
      newStatus = 'degraded';
    }
    
    if (errorRate > 0.3) { // More than 30% failure rate
      newStatus = 'error';
    }

    if (newStatus !== this.systemState.status) {
      this.systemState.status = newStatus;
      
      this.logger.warn('System status changed', {
        newStatus,
        queueLength,
        processingCount,
        errorRate: Math.round(errorRate * 100) + '%'
      });

      // Emit system status change event
      this.eventEmitter.emit(EventTypes.SYSTEM_STATUS_CHANGED, {
        status: newStatus,
        queueLength,
        processingCount,
        errorRate,
        timestamp: new Date()
      });
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('StateManager shutting down...');
    
    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Wait for processing tasks to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.systemState.processingTasks.size > 0 && 
           (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.logger.info('Waiting for tasks to complete', {
        remaining: this.systemState.processingTasks.size
      });
    }
    
    // Persist final state
    await this.persistSystemMetrics();
    
    this.logger.info('StateManager shutdown completed', {
      completedTasks: this.systemState.systemMetrics.completedTasks,
      failedTasks: this.systemState.systemMetrics.failedTasks,
      remainingTasks: this.systemState.processingTasks.size
    });
  }

  /**
   * Private helper methods
   */

  isAgentAvailable(agentName) {
    const capacity = this.agentCapacity[agentName];
    return capacity && capacity.current < capacity.max;
  }

  reserveAgent(agentName) {
    const capacity = this.agentCapacity[agentName];
    if (capacity) {
      capacity.current++;
    }
  }

  releaseAgent(agentName) {
    const capacity = this.agentCapacity[agentName];
    if (capacity && capacity.current > 0) {
      capacity.current--;
    }
  }

  getAgentUtilization() {
    const utilization = {};
    
    for (const [agentName, capacity] of Object.entries(this.agentCapacity)) {
      utilization[agentName] = {
        used: capacity.current,
        total: capacity.max,
        percentage: Math.round((capacity.current / capacity.max) * 100)
      };
    }
    
    return utilization;
  }

  updateAverageProcessingTime(processingTime) {
    const completedTasks = this.systemState.systemMetrics.completedTasks;
    const currentAverage = this.systemState.systemMetrics.averageProcessingTime;
    
    this.systemState.systemMetrics.averageProcessingTime = 
      (currentAverage * (completedTasks - 1) + processingTime) / completedTasks;
  }

  cleanupCompletedTasks() {
    // This method would clean up old completed task records
    // Currently, completed tasks are not stored long-term in this implementation
    // but this could be extended to include a completed tasks store
    
    this.logger.debug('Cleanup completed tasks check', {
      queueLength: this.systemState.taskQueue.length,
      processingCount: this.systemState.processingTasks.size
    });
  }

  async persistSystemMetrics() {
    try {
      await this.redisClient.set('system:state', {
        systemMetrics: this.systemState.systemMetrics,
        timestamp: new Date()
      }, 3600); // 1 hour TTL
    } catch (error) {
      this.logger.error('Failed to persist system metrics', error);
    }
  }

  /**
   * Health check for state manager
   */
  healthCheck() {
    const queueHealth = this.systemState.taskQueue.length < 100; // Queue not too long
    const systemHealth = this.systemState.status !== 'error';
    const memoryHealth = process.memoryUsage().heapUsed < 1024 * 1024 * 1024; // < 1GB
    
    return {
      status: (queueHealth && systemHealth && memoryHealth) ? 'ok' : 'degraded',
      details: {
        queueLength: this.systemState.taskQueue.length,
        systemStatus: this.systemState.status,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        agentUtilization: this.getAgentUtilization()
      }
    };
  }
}

export { StateManager };