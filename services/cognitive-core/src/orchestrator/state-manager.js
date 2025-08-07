// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/state-manager.js
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * StateManager handles agent execution state, task coordination, and system state
 * Manages concurrent agent tasks, system resources, and workflow orchestration
 * Enhanced with distributed state management across multiple service instances
 */
class StateManager {
  constructor(logger, eventEmitter, redisClient) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.redisClient = redisClient;
    
    // Instance identification for distributed operation
    this.instanceId = `cognitive-core-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    this.nodeId = process.env.NODE_ID || this.instanceId;
    
    // Distributed state configuration
    this.distributedConfig = {
      enabled: process.env.DISTRIBUTED_STATE_ENABLED === 'true',
      heartbeatInterval: 10000, // 10 seconds
      nodeTimeout: 30000, // 30 seconds
      stateSync: {
        enabled: process.env.STATE_SYNC_ENABLED !== 'false',
        interval: 5000, // 5 seconds
        channels: {
          heartbeat: 'distributed:heartbeat',
          stateSync: 'distributed:state-sync',
          taskCoordination: 'distributed:task-coordination',
          nodeEvents: 'distributed:node-events'
        }
      },
      loadBalancing: {
        enabled: process.env.LOAD_BALANCING_ENABLED === 'true',
        strategy: process.env.LOAD_BALANCE_STRATEGY || 'least_loaded', // least_loaded, round_robin, consistent_hash
        rebalanceInterval: 30000 // 30 seconds
      }
    };
    
    // Cluster state tracking
    this.clusterState = {
      nodes: new Map(), // nodeId -> node info
      lastHeartbeat: new Date(),
      isLeader: false,
      leaderNode: null,
      distributedTasks: new Map(), // taskId -> nodeId (which node is processing)
      globalMetrics: {
        totalNodes: 0,
        totalCapacity: 0,
        totalLoad: 0,
        healthyNodes: 0
      }
    };
    
    // Timers for distributed operations
    this.heartbeatTimer = null;
    this.stateSyncTimer = null;
    this.leaderElectionTimer = null;
    this.loadBalanceTimer = null;
    
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

      // Initialize distributed state management if enabled
      if (this.distributedConfig.enabled) {
        await this.initializeDistributedState();
      }

      this.logger.info('StateManager initialized', {
        nodeId: this.nodeId,
        systemStatus: this.systemState.status,
        distributedEnabled: this.distributedConfig.enabled,
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
   * Initialize distributed state management
   */
  async initializeDistributedState() {
    try {
      // Register this node in the cluster
      await this.registerNode();
      
      // Set up Redis pub/sub for distributed coordination
      await this.setupDistributedCommunication();
      
      // Start distributed timers
      this.startDistributedTimers();
      
      // Attempt leader election
      setTimeout(() => this.attemptLeaderElection(), 2000);
      
      this.logger.info('Distributed state management initialized', {
        nodeId: this.nodeId,
        channels: this.distributedConfig.stateSync.channels
      });
    } catch (error) {
      this.logger.error('Failed to initialize distributed state', error);
      throw error;
    }
  }

  /**
   * Register this node in the cluster
   */
  async registerNode() {
    const nodeInfo = {
      nodeId: this.nodeId,
      instanceId: this.instanceId,
      host: process.env.HOST || 'localhost',
      port: process.env.PORT || 3001,
      capacities: { ...this.agentCapacity },
      status: 'healthy',
      lastHeartbeat: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      startedAt: new Date()
    };
    
    // Store node info in Redis
    await this.redisClient.hset(
      'distributed:nodes', 
      this.nodeId, 
      JSON.stringify(nodeInfo)
    );
    
    // Set expiration for node registration
    await this.redisClient.expire(`distributed:nodes:${this.nodeId}`, 60);
    
    this.clusterState.nodes.set(this.nodeId, nodeInfo);
    
    this.logger.info('Node registered in cluster', {
      nodeId: this.nodeId,
      nodeInfo
    });
  }

  /**
   * Setup Redis pub/sub for distributed coordination
   */
  async setupDistributedCommunication() {
    const channels = this.distributedConfig.stateSync.channels;
    
    // Subscribe to cluster communication channels
    await Promise.all([
      this.redisClient.subscribe(channels.heartbeat),
      this.redisClient.subscribe(channels.stateSync), 
      this.redisClient.subscribe(channels.taskCoordination),
      this.redisClient.subscribe(channels.nodeEvents)
    ]);
    
    // Set up message handlers
    this.redisClient.on('message', (channel, message) => {
      this.handleDistributedMessage(channel, message);
    });
  }

  /**
   * Handle distributed messages
   */
  handleDistributedMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      const { channels } = this.distributedConfig.stateSync;
      
      // Ignore messages from this node
      if (data.nodeId === this.nodeId) return;
      
      switch (channel) {
        case channels.heartbeat:
          this.handleHeartbeatMessage(data);
          break;
        case channels.stateSync:
          this.handleStateSyncMessage(data);
          break;
        case channels.taskCoordination:
          this.handleTaskCoordinationMessage(data);
          break;
        case channels.nodeEvents:
          this.handleNodeEventMessage(data);
          break;
      }
    } catch (error) {
      this.logger.error('Failed to handle distributed message', error, {
        channel,
        message: message.substring(0, 200)
      });
    }
  }

  /**
   * Handle heartbeat messages from other nodes
   */
  handleHeartbeatMessage(data) {
    const { nodeId, status, load, capacities } = data;
    
    this.clusterState.nodes.set(nodeId, {
      ...this.clusterState.nodes.get(nodeId),
      nodeId,
      status,
      load,
      capacities,
      lastHeartbeat: new Date(data.timestamp),
      lastSeen: new Date()
    });
    
    this.logger.debug('Received heartbeat', { nodeId, status, load });
  }

  /**
   * Handle state synchronization messages
   */
  handleStateSyncMessage(data) {
    const { nodeId, systemState, metrics } = data;
    
    // Update cluster metrics
    this.updateClusterMetrics(nodeId, systemState, metrics);
    
    this.logger.debug('Received state sync', { nodeId, metrics });
  }

  /**
   * Handle task coordination messages
   */
  handleTaskCoordinationMessage(data) {
    const { type, taskId, nodeId, agentName } = data;
    
    switch (type) {
      case 'task_assigned':
        this.clusterState.distributedTasks.set(taskId, nodeId);
        break;
      case 'task_completed':
        this.clusterState.distributedTasks.delete(taskId);
        break;
      case 'task_failed':
        this.clusterState.distributedTasks.delete(taskId);
        break;
      case 'load_balance_request':
        this.handleLoadBalanceRequest(data);
        break;
    }
    
    this.logger.debug('Received task coordination message', { type, taskId, nodeId });
  }

  /**
   * Handle node event messages  
   */
  handleNodeEventMessage(data) {
    const { type, nodeId } = data;
    
    switch (type) {
      case 'node_joining':
        this.logger.info('Node joining cluster', { nodeId });
        break;
      case 'node_leaving':
        this.handleNodeLeaving(nodeId);
        break;
      case 'leader_election':
        this.handleLeaderElection(data);
        break;
    }
  }

  /**
   * Start distributed timers
   */
  startDistributedTimers() {
    // Heartbeat timer
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.distributedConfig.heartbeatInterval
    );
    
    // State sync timer
    if (this.distributedConfig.stateSync.enabled) {
      this.stateSyncTimer = setInterval(
        () => this.syncState(),
        this.distributedConfig.stateSync.interval
      );
    }
    
    // Load balancing timer
    if (this.distributedConfig.loadBalancing.enabled) {
      this.loadBalanceTimer = setInterval(
        () => this.performLoadBalancing(),
        this.distributedConfig.loadBalancing.rebalanceInterval
      );
    }
    
    this.logger.debug('Distributed timers started');
  }

  /**
   * Send heartbeat to cluster
   */
  async sendHeartbeat() {
    try {
      const heartbeatData = {
        nodeId: this.nodeId,
        status: this.systemState.status,
        load: this.calculateNodeLoad(),
        capacities: this.getAgentUtilization(),
        timestamp: new Date().toISOString(),
        isLeader: this.clusterState.isLeader
      };
      
      await this.redisClient.publish(
        this.distributedConfig.stateSync.channels.heartbeat,
        JSON.stringify(heartbeatData)
      );
      
      // Update node registration TTL
      await this.redisClient.expire(`distributed:nodes:${this.nodeId}`, 60);
      
      this.clusterState.lastHeartbeat = new Date();
      
    } catch (error) {
      this.logger.error('Failed to send heartbeat', error);
    }
  }

  /**
   * Sync state with cluster
   */
  async syncState() {
    try {
      const stateSyncData = {
        nodeId: this.nodeId,
        systemState: {
          status: this.systemState.status,
          queueLength: this.systemState.taskQueue.length,
          processingCount: this.systemState.processingTasks.size
        },
        metrics: this.systemState.systemMetrics,
        agentUtilization: this.getAgentUtilization(),
        timestamp: new Date().toISOString()
      };
      
      await this.redisClient.publish(
        this.distributedConfig.stateSync.channels.stateSync,
        JSON.stringify(stateSyncData)
      );
      
    } catch (error) {
      this.logger.error('Failed to sync state', error);
    }
  }

  /**
   * Calculate current node load
   */
  calculateNodeLoad() {
    const totalCapacity = Object.values(this.agentCapacity).reduce((sum, cap) => sum + cap.max, 0);
    const currentLoad = Object.values(this.agentCapacity).reduce((sum, cap) => sum + cap.current, 0);
    
    return totalCapacity > 0 ? currentLoad / totalCapacity : 0;
  }

  /**
   * Update cluster metrics based on received data
   */
  updateClusterMetrics(nodeId, systemState, metrics) {
    const nodeInfo = this.clusterState.nodes.get(nodeId) || {};
    
    this.clusterState.nodes.set(nodeId, {
      ...nodeInfo,
      systemState,
      metrics,
      lastUpdate: new Date()
    });
    
    // Recalculate global metrics
    this.calculateGlobalMetrics();
  }

  /**
   * Calculate global cluster metrics
   */
  calculateGlobalMetrics() {
    const nodes = Array.from(this.clusterState.nodes.values());
    const healthyNodes = nodes.filter(n => n.status === 'healthy').length;
    
    this.clusterState.globalMetrics = {
      totalNodes: nodes.length,
      healthyNodes,
      totalCapacity: nodes.reduce((sum, n) => {
        if (n.capacities) {
          return sum + Object.values(n.capacities).reduce((cs, cap) => cs + (cap.max || 0), 0);
        }
        return sum;
      }, 0),
      totalLoad: nodes.reduce((sum, n) => {
        if (n.capacities) {
          return sum + Object.values(n.capacities).reduce((cs, cap) => cs + (cap.current || 0), 0);
        }
        return sum;
      }, 0)
    };
  }

  /**
   * Attempt leader election
   */
  async attemptLeaderElection() {
    if (!this.distributedConfig.enabled) return;
    
    try {
      // Try to acquire leader lock
      const lockKey = 'distributed:leader:lock';
      const lockValue = this.nodeId;
      const lockTTL = 30; // 30 seconds
      
      const acquired = await this.redisClient.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
      
      if (acquired === 'OK') {
        this.clusterState.isLeader = true;
        this.clusterState.leaderNode = this.nodeId;
        
        this.logger.info('Became cluster leader', { nodeId: this.nodeId });
        
        // Announce leadership
        await this.redisClient.publish(
          this.distributedConfig.stateSync.channels.nodeEvents,
          JSON.stringify({
            type: 'leader_election',
            nodeId: this.nodeId,
            isLeader: true,
            timestamp: new Date().toISOString()
          })
        );
        
        // Set up leader renewal
        this.leaderElectionTimer = setInterval(
          () => this.renewLeadership(),
          15000 // Renew every 15 seconds
        );
        
      } else {
        // Check who is the current leader
        const currentLeader = await this.redisClient.get(lockKey);
        this.clusterState.leaderNode = currentLeader;
        this.clusterState.isLeader = false;
        
        this.logger.debug('Leader election failed', { 
          nodeId: this.nodeId, 
          currentLeader 
        });
      }
      
    } catch (error) {
      this.logger.error('Leader election failed', error);
    }
  }

  /**
   * Renew leadership
   */
  async renewLeadership() {
    if (!this.clusterState.isLeader) return;
    
    try {
      const lockKey = 'distributed:leader:lock';
      const renewed = await this.redisClient.set(lockKey, this.nodeId, 'EX', 30);
      
      if (renewed !== 'OK') {
        this.clusterState.isLeader = false;
        this.clusterState.leaderNode = null;
        
        if (this.leaderElectionTimer) {
          clearInterval(this.leaderElectionTimer);
          this.leaderElectionTimer = null;
        }
        
        this.logger.warn('Lost leadership', { nodeId: this.nodeId });
        
        // Attempt to regain leadership after delay
        setTimeout(() => this.attemptLeaderElection(), 5000);
      }
      
    } catch (error) {
      this.logger.error('Failed to renew leadership', error);
    }
  }

  /**
   * Handle leader election messages
   */
  handleLeaderElection(data) {
    const { nodeId, isLeader } = data;
    
    if (isLeader) {
      this.clusterState.leaderNode = nodeId;
      if (this.nodeId !== nodeId) {
        this.clusterState.isLeader = false;
      }
    }
  }

  /**
   * Handle node leaving cluster
   */
  handleNodeLeaving(nodeId) {
    this.clusterState.nodes.delete(nodeId);
    
    // If the leaving node was processing tasks, they need reassignment
    const orphanedTasks = [];
    for (const [taskId, processingNodeId] of this.clusterState.distributedTasks.entries()) {
      if (processingNodeId === nodeId) {
        orphanedTasks.push(taskId);
      }
    }
    
    if (orphanedTasks.length > 0) {
      this.logger.warn('Node left with orphaned tasks', { 
        nodeId, 
        orphanedTasks: orphanedTasks.length 
      });
      
      // If this is the leader, reassign tasks
      if (this.clusterState.isLeader) {
        this.reassignOrphanedTasks(orphanedTasks);
      }
    }
    
    this.logger.info('Node left cluster', { nodeId });
  }

  /**
   * Perform load balancing across cluster
   */
  async performLoadBalancing() {
    if (!this.clusterState.isLeader || !this.distributedConfig.loadBalancing.enabled) {
      return;
    }
    
    try {
      const nodes = Array.from(this.clusterState.nodes.values())
        .filter(n => n.status === 'healthy');
        
      if (nodes.length < 2) return; // Need at least 2 nodes for balancing
      
      // Calculate load distribution
      const loadMap = nodes.map(node => ({
        nodeId: node.nodeId,
        load: this.calculateNodeLoadFromInfo(node),
        capacity: this.calculateNodeCapacityFromInfo(node)
      })).sort((a, b) => a.load - b.load);
      
      const leastLoaded = loadMap[0];
      const mostLoaded = loadMap[loadMap.length - 1];
      
      // If load difference is significant, suggest rebalancing
      if (mostLoaded.load - leastLoaded.load > 0.3) { // 30% difference
        this.logger.info('Load imbalance detected', {
          leastLoaded: { nodeId: leastLoaded.nodeId, load: leastLoaded.load },
          mostLoaded: { nodeId: mostLoaded.nodeId, load: mostLoaded.load }
        });
        
        // Send load balance suggestion
        await this.redisClient.publish(
          this.distributedConfig.stateSync.channels.taskCoordination,
          JSON.stringify({
            type: 'load_balance_request',
            from: mostLoaded.nodeId,
            to: leastLoaded.nodeId,
            reason: 'load_imbalance',
            timestamp: new Date().toISOString()
          })
        );
      }
      
    } catch (error) {
      this.logger.error('Load balancing failed', error);
    }
  }

  /**
   * Calculate node load from node info
   */
  calculateNodeLoadFromInfo(nodeInfo) {
    if (!nodeInfo.capacities) return 0;
    
    const totalCapacity = Object.values(nodeInfo.capacities).reduce((sum, cap) => sum + (cap.total || cap.max || 0), 0);
    const currentLoad = Object.values(nodeInfo.capacities).reduce((sum, cap) => sum + (cap.used || cap.current || 0), 0);
    
    return totalCapacity > 0 ? currentLoad / totalCapacity : 0;
  }

  /**
   * Calculate node capacity from node info
   */
  calculateNodeCapacityFromInfo(nodeInfo) {
    if (!nodeInfo.capacities) return 0;
    
    return Object.values(nodeInfo.capacities).reduce((sum, cap) => sum + (cap.total || cap.max || 0), 0);
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
   * Handle load balance requests
   */
  handleLoadBalanceRequest(data) {
    const { from, to, reason } = data;
    
    // If this node is the target for load balancing
    if (to === this.nodeId && this.systemState.taskQueue.length < 5) {
      this.logger.info('Accepting load balance request', { from, reason });
      
      // Could implement task migration logic here
      // For now, just log the request
    }
  }

  /**
   * Reassign orphaned tasks to available nodes
   */
  async reassignOrphanedTasks(orphanedTasks) {
    const availableNodes = Array.from(this.clusterState.nodes.values())
      .filter(n => n.status === 'healthy' && n.nodeId !== this.nodeId)
      .sort((a, b) => this.calculateNodeLoadFromInfo(a) - this.calculateNodeLoadFromInfo(b));
    
    if (availableNodes.length === 0) {
      this.logger.warn('No available nodes for task reassignment');
      return;
    }
    
    for (const taskId of orphanedTasks) {
      const targetNode = availableNodes[0]; // Assign to least loaded node
      
      // Notify cluster about task reassignment
      await this.redisClient.publish(
        this.distributedConfig.stateSync.channels.taskCoordination,
        JSON.stringify({
          type: 'task_assigned',
          taskId,
          nodeId: targetNode.nodeId,
          reason: 'node_failure_recovery',
          timestamp: new Date().toISOString()
        })
      );
      
      this.clusterState.distributedTasks.set(taskId, targetNode.nodeId);
    }
    
    this.logger.info('Reassigned orphaned tasks', {
      taskCount: orphanedTasks.length,
      targetNodes: availableNodes.slice(0, 3).map(n => n.nodeId)
    });
  }

  /**
   * Get distributed system state
   */
  getDistributedSystemState() {
    return {
      local: this.getSystemState(),
      cluster: {
        nodeId: this.nodeId,
        isLeader: this.clusterState.isLeader,
        leaderNode: this.clusterState.leaderNode,
        nodes: Array.from(this.clusterState.nodes.values()).map(node => ({
          nodeId: node.nodeId,
          status: node.status,
          load: this.calculateNodeLoadFromInfo(node),
          lastHeartbeat: node.lastHeartbeat,
          isHealthy: node.status === 'healthy' && 
                     (new Date() - new Date(node.lastHeartbeat)) < this.distributedConfig.nodeTimeout
        })),
        globalMetrics: this.clusterState.globalMetrics,
        distributedTasks: this.clusterState.distributedTasks.size,
        config: {
          enabled: this.distributedConfig.enabled,
          loadBalancing: this.distributedConfig.loadBalancing.enabled,
          stateSync: this.distributedConfig.stateSync.enabled
        }
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('StateManager shutting down...');
    
    // Announce node leaving if distributed mode is enabled
    if (this.distributedConfig.enabled) {
      try {
        await this.redisClient.publish(
          this.distributedConfig.stateSync.channels.nodeEvents,
          JSON.stringify({
            type: 'node_leaving',
            nodeId: this.nodeId,
            timestamp: new Date().toISOString()
          })
        );
        
        // Remove node from cluster registry
        await this.redisClient.hdel('distributed:nodes', this.nodeId);
        
        // If this was the leader, release leadership
        if (this.clusterState.isLeader) {
          await this.redisClient.del('distributed:leader:lock');
        }
        
      } catch (error) {
        this.logger.error('Failed to announce node leaving', error);
      }
    }
    
    // Clear distributed timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer);
      this.stateSyncTimer = null;
    }
    
    if (this.leaderElectionTimer) {
      clearInterval(this.leaderElectionTimer);
      this.leaderElectionTimer = null;
    }
    
    if (this.loadBalanceTimer) {
      clearInterval(this.loadBalanceTimer);
      this.loadBalanceTimer = null;
    }
    
    // Clear cleanup interval
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
      nodeId: this.nodeId,
      distributedEnabled: this.distributedConfig.enabled,
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