// ==========================================
// FLOW SERVICE - Real-time Collaboration Service
// Implements Operational Transformation (OT) as specified
// ==========================================

import { EventEmitter } from 'events';

export class CollaborationService extends EventEmitter {
  constructor(logger, redisClient, mongoClient) {
    super();
    this.logger = logger;
    this.redisClient = redisClient;
    this.mongoClient = mongoClient;
    
    // Active collaboration sessions with TTL
    this.sessions = new Map();
    
    // Operation history for OT (with size limits)
    this.operationHistory = new Map();
    this.maxHistorySize = 1000; // Keep last 1000 operations per flow
    
    // User presence tracking with TTL
    this.userPresence = new Map();
    this.presenceTTL = 5 * 60 * 1000; // 5 minutes
    
    // Session cleanup intervals
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes of inactivity
    this.cleanupInterval = null;
    
    // Initialize Redis pub/sub for real-time sync
    this.initializeRedisPubSub();
    
    // Start cleanup job
    this.startCleanupJob();
  }

  /**
   * Initialize Redis pub/sub for real-time collaboration
   */
  async initializeRedisPubSub() {
    try {
      // Subscribe to collaboration channels
      this.redisSubscriber = this.redisClient.duplicate();
      await this.redisSubscriber.connect();
      
      // Subscribe to flow collaboration events
      await this.redisSubscriber.subscribe('flow:collaboration:*', (message, channel) => {
        this.handleCollaborationMessage(channel, message);
      });
      
      this.logger.info('Collaboration service initialized with Redis pub/sub');
    } catch (error) {
      this.logger.error('Failed to initialize collaboration service', error);
    }
  }

  /**
   * Join a collaboration session
   */
  async joinSession(flowId, userId, userInfo) {
    try {
      const sessionKey = `session:${flowId}`;
      
      // Create session if it doesn't exist
      if (!this.sessions.has(sessionKey)) {
        this.sessions.set(sessionKey, {
          flowId,
          users: new Map(),
          operationSequence: 0,
          lastActivity: Date.now()
        });
      }
      
      const session = this.sessions.get(sessionKey);
      
      // Add user to session
      const userPresenceData = {
        userId,
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar,
        color: this.generateUserColor(userId),
        cursor: null,
        selection: null,
        joinedAt: Date.now(),
        lastActivity: Date.now(),
        flowId
      };
      
      session.users.set(userId, userPresenceData);
      session.lastActivity = Date.now();
      
      // Store in local presence map for cleanup tracking
      const presenceKey = `${flowId}:${userId}`;
      this.userPresence.set(presenceKey, userPresenceData);
      
      // Store presence in Redis for distributed systems
      await this.redisClient.setex(
        `presence:${flowId}:${userId}`,
        300, // 5 minute TTL
        JSON.stringify({
          ...userInfo,
          status: 'online',
          flowId,
          timestamp: Date.now()
        })
      );
      
      // Broadcast user joined event
      await this.broadcastToFlow(flowId, {
        type: 'user_joined',
        userId,
        userInfo: session.users.get(userId),
        timestamp: Date.now()
      });
      
      // Return session info with current users
      return {
        sessionId: sessionKey,
        flowId,
        users: Array.from(session.users.values()),
        operationSequence: session.operationSequence
      };
      
    } catch (error) {
      this.logger.error('Failed to join collaboration session', error);
      throw error;
    }
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(flowId, userId) {
    try {
      const sessionKey = `session:${flowId}`;
      const session = this.sessions.get(sessionKey);
      
      if (!session) {
        return;
      }
      
      // Remove user from session
      const userInfo = session.users.get(userId);
      session.users.delete(userId);
      
      // Remove presence from Redis
      await this.redisClient.del(`presence:${flowId}:${userId}`);
      
      // Broadcast user left event
      await this.broadcastToFlow(flowId, {
        type: 'user_left',
        userId,
        userInfo,
        timestamp: Date.now()
      });
      
      // Clean up empty sessions
      if (session.users.size === 0) {
        this.sessions.delete(sessionKey);
        await this.cleanupSessionData(flowId);
      }
      
    } catch (error) {
      this.logger.error('Failed to leave collaboration session', error);
    }
  }

  /**
   * Apply an operation using Operational Transformation
   */
  async applyOperation(flowId, userId, operation) {
    try {
      const sessionKey = `session:${flowId}`;
      const session = this.sessions.get(sessionKey);
      
      if (!session) {
        throw new Error('No active collaboration session');
      }
      
      // Increment operation sequence
      const sequenceNumber = ++session.operationSequence;
      
      // Transform operation against concurrent operations
      const transformedOp = await this.transformOperation(
        flowId,
        operation,
        sequenceNumber
      );
      
      // Store operation in history with size limit
      if (!this.operationHistory.has(flowId)) {
        this.operationHistory.set(flowId, []);
      }
      
      const history = this.operationHistory.get(flowId);
      history.push({
        sequence: sequenceNumber,
        userId,
        operation: transformedOp,
        timestamp: Date.now()
      });
      
      // Trim history if it exceeds maximum size
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize);
      }
      
      // Apply operation to flow (delegate to flow-manager)
      const result = await this.applyOperationToFlow(flowId, transformedOp);
      
      // Broadcast operation to other users
      await this.broadcastToFlow(flowId, {
        type: 'operation',
        sequence: sequenceNumber,
        userId,
        operation: transformedOp,
        timestamp: Date.now()
      }, userId); // Exclude sender
      
      // Update user activity
      if (session.users.has(userId)) {
        session.users.get(userId).lastActivity = Date.now();
      }
      
      return {
        success: true,
        sequence: sequenceNumber,
        transformed: transformedOp !== operation
      };
      
    } catch (error) {
      this.logger.error('Failed to apply operation', error);
      throw error;
    }
  }

  /**
   * Transform operation for Operational Transformation
   * This ensures operations can be applied in any order
   */
  async transformOperation(flowId, operation, targetSequence) {
    const history = this.operationHistory.get(flowId) || [];
    let transformed = operation;
    
    // Get operations that happened after the client's last known sequence
    const concurrentOps = history.filter(op => 
      op.sequence > (operation.baseSequence || 0) &&
      op.sequence < targetSequence
    );
    
    // Transform against each concurrent operation
    for (const concurrentOp of concurrentOps) {
      transformed = this.transformPair(transformed, concurrentOp.operation);
    }
    
    return transformed;
  }

  /**
   * Transform a pair of operations
   * Core OT algorithm
   */
  transformPair(op1, op2) {
    // Handle different operation types
    switch (op1.type) {
      case 'add_node':
        return this.transformAddNode(op1, op2);
      case 'update_node':
        return this.transformUpdateNode(op1, op2);
      case 'delete_node':
        return this.transformDeleteNode(op1, op2);
      case 'add_edge':
        return this.transformAddEdge(op1, op2);
      case 'update_edge':
        return this.transformUpdateEdge(op1, op2);
      case 'delete_edge':
        return this.transformDeleteEdge(op1, op2);
      default:
        return op1;
    }
  }

  /**
   * Transform add node operation
   */
  transformAddNode(op1, op2) {
    if (op2.type === 'add_node' && op1.data.id === op2.data.id) {
      // Same node being added - use deterministic resolution
      // Keep the one with lower userId (arbitrary but consistent)
      if (op1.userId < op2.userId) {
        return op1;
      } else {
        // Generate new ID to avoid conflict
        return {
          ...op1,
          data: {
            ...op1.data,
            id: `${op1.data.id}_transformed_${Date.now()}`
          }
        };
      }
    }
    return op1;
  }

  /**
   * Transform update node operation
   */
  transformUpdateNode(op1, op2) {
    if (op2.type === 'update_node' && op1.nodeId === op2.nodeId) {
      // Same node being updated - merge changes
      return {
        ...op1,
        data: {
          ...op2.data, // Apply op2 first
          ...op1.data  // Then apply op1 (op1 wins conflicts)
        }
      };
    }
    
    if (op2.type === 'delete_node' && op1.nodeId === op2.nodeId) {
      // Node was deleted - convert to add operation
      return {
        type: 'add_node',
        data: {
          id: op1.nodeId,
          ...op1.data
        }
      };
    }
    
    return op1;
  }

  /**
   * Transform delete node operation
   */
  transformDeleteNode(op1, op2) {
    if (op2.type === 'delete_node' && op1.nodeId === op2.nodeId) {
      // Already deleted - make this a no-op
      return { type: 'noop', originalOp: op1 };
    }
    
    if (op2.type === 'update_node' && op1.nodeId === op2.nodeId) {
      // Node was updated - still delete it
      return op1;
    }
    
    return op1;
  }

  /**
   * Transform add edge operation
   */
  transformAddEdge(op1, op2) {
    if (op2.type === 'delete_node') {
      // Check if edge references deleted node
      if (op1.data.source === op2.nodeId || op1.data.target === op2.nodeId) {
        // Cancel edge addition
        return { type: 'noop', originalOp: op1 };
      }
    }
    
    if (op2.type === 'add_edge' && op1.data.id === op2.data.id) {
      // Same edge - resolve conflict
      if (op1.userId < op2.userId) {
        return op1;
      } else {
        return {
          ...op1,
          data: {
            ...op1.data,
            id: `${op1.data.id}_transformed_${Date.now()}`
          }
        };
      }
    }
    
    return op1;
  }

  /**
   * Transform update edge operation
   */
  transformUpdateEdge(op1, op2) {
    if (op2.type === 'update_edge' && op1.edgeId === op2.edgeId) {
      // Merge updates
      return {
        ...op1,
        data: {
          ...op2.data,
          ...op1.data
        }
      };
    }
    
    if (op2.type === 'delete_edge' && op1.edgeId === op2.edgeId) {
      // Edge was deleted - convert to add
      return {
        type: 'add_edge',
        data: {
          id: op1.edgeId,
          ...op1.data
        }
      };
    }
    
    return op1;
  }

  /**
   * Transform delete edge operation
   */
  transformDeleteEdge(op1, op2) {
    if (op2.type === 'delete_edge' && op1.edgeId === op2.edgeId) {
      // Already deleted
      return { type: 'noop', originalOp: op1 };
    }
    
    return op1;
  }

  /**
   * Update user cursor position
   */
  async updateCursor(flowId, userId, cursor) {
    try {
      const sessionKey = `session:${flowId}`;
      const session = this.sessions.get(sessionKey);
      
      if (!session || !session.users.has(userId)) {
        return;
      }
      
      // Update cursor position
      session.users.get(userId).cursor = cursor;
      session.users.get(userId).lastActivity = Date.now();
      
      // Broadcast cursor update
      await this.broadcastToFlow(flowId, {
        type: 'cursor_update',
        userId,
        cursor,
        timestamp: Date.now()
      }, userId);
      
    } catch (error) {
      this.logger.error('Failed to update cursor', error);
    }
  }

  /**
   * Update user selection
   */
  async updateSelection(flowId, userId, selection) {
    try {
      const sessionKey = `session:${flowId}`;
      const session = this.sessions.get(sessionKey);
      
      if (!session || !session.users.has(userId)) {
        return;
      }
      
      // Update selection
      session.users.get(userId).selection = selection;
      session.users.get(userId).lastActivity = Date.now();
      
      // Broadcast selection update
      await this.broadcastToFlow(flowId, {
        type: 'selection_update',
        userId,
        selection,
        timestamp: Date.now()
      }, userId);
      
    } catch (error) {
      this.logger.error('Failed to update selection', error);
    }
  }

  /**
   * Get active users in a flow
   */
  async getActiveUsers(flowId) {
    const sessionKey = `session:${flowId}`;
    const session = this.sessions.get(sessionKey);
    
    if (!session) {
      return [];
    }
    
    return Array.from(session.users.values()).map(user => ({
      ...user,
      isActive: Date.now() - user.lastActivity < 60000 // Active in last minute
    }));
  }

  /**
   * Broadcast message to all users in a flow
   */
  async broadcastToFlow(flowId, message, excludeUserId = null) {
    try {
      const channel = `flow:collaboration:${flowId}`;
      const payload = {
        ...message,
        excludeUserId
      };
      
      await this.redisClient.publish(channel, JSON.stringify(payload));
      
    } catch (error) {
      this.logger.error('Failed to broadcast message', error);
    }
  }

  /**
   * Handle incoming collaboration messages
   */
  handleCollaborationMessage(channel, message) {
    try {
      const flowId = channel.split(':')[2];
      const data = JSON.parse(message);
      
      // Emit to local listeners (WebSocket handlers)
      this.emit('collaboration_message', {
        flowId,
        ...data
      });
      
    } catch (error) {
      this.logger.error('Failed to handle collaboration message', error);
    }
  }

  /**
   * Apply operation to flow (delegate to flow-manager)
   */
  async applyOperationToFlow(flowId, operation) {
    // This would integrate with flow-manager to actually apply the operation
    // For now, we just validate and return success
    this.logger.debug('Applying operation to flow', { flowId, operation });
    return { success: true };
  }

  /**
   * Clean up session data
   */
  async cleanupSessionData(flowId) {
    try {
      // Remove operation history
      this.operationHistory.delete(flowId);
      
      // Clean up Redis keys
      const keys = await this.redisClient.keys(`presence:${flowId}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
      
    } catch (error) {
      this.logger.error('Failed to cleanup session data', error);
    }
  }

  /**
   * Generate a unique color for user
   */
  generateUserColor(userId) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FECA57', '#DA77F2', '#4C6EF5', '#15AABF'
    ];
    
    // Use userId hash to consistently assign same color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get operation history for a flow
   */
  async getOperationHistory(flowId, limit = 100) {
    const history = this.operationHistory.get(flowId) || [];
    return history.slice(-limit);
  }

  /**
   * Start periodic cleanup job
   */
  startCleanupJob() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
      this.cleanupOperationHistory();
      this.cleanupUserPresence();
    }, 5 * 60 * 1000);
    
    this.logger.info('Collaboration cleanup job started');
  }

  /**
   * Stop cleanup job
   */
  stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('Collaboration cleanup job stopped');
    }
  }

  /**
   * Periodic cleanup of inactive sessions
   */
  async cleanupInactiveSessions() {
    const now = Date.now();
    const sessionsToDelete = [];
    
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.sessionTimeout) {
        sessionsToDelete.push(key);
      }
    }
    
    for (const key of sessionsToDelete) {
      const session = this.sessions.get(key);
      this.logger.info('Cleaning up inactive session', { 
        flowId: session.flowId,
        userCount: session.users.size,
        inactiveFor: Math.round((now - session.lastActivity) / 1000 / 60) + ' minutes'
      });
      
      // Notify remaining users (if any)
      if (session.users.size > 0) {
        await this.broadcastToFlow(session.flowId, {
          type: 'session_timeout',
          message: 'Session timed out due to inactivity',
          timestamp: now
        });
      }
      
      this.sessions.delete(key);
      await this.cleanupSessionData(session.flowId);
    }
    
    if (sessionsToDelete.length > 0) {
      this.logger.info(`Cleaned up ${sessionsToDelete.length} inactive sessions`);
    }
  }

  /**
   * Clean up operation history to prevent unbounded growth
   */
  cleanupOperationHistory() {
    let totalCleaned = 0;
    
    for (const [flowId, history] of this.operationHistory.entries()) {
      if (Array.isArray(history) && history.length > this.maxHistorySize) {
        // Keep only the most recent operations
        const trimmed = history.slice(-this.maxHistorySize);
        const cleaned = history.length - trimmed.length;
        this.operationHistory.set(flowId, trimmed);
        totalCleaned += cleaned;
        
        this.logger.debug(`Trimmed ${cleaned} old operations for flow ${flowId}`);
      }
      
      // Remove history for flows with no active sessions
      const sessionKey = `session:${flowId}`;
      if (!this.sessions.has(sessionKey)) {
        this.operationHistory.delete(flowId);
        this.logger.debug(`Removed operation history for inactive flow ${flowId}`);
      }
    }
    
    if (totalCleaned > 0) {
      this.logger.info(`Cleaned up ${totalCleaned} old operations from history`);
    }
  }

  /**
   * Clean up user presence data
   */
  async cleanupUserPresence() {
    const now = Date.now();
    const presenceToDelete = [];
    
    for (const [key, presence] of this.userPresence.entries()) {
      if (now - presence.lastActivity > this.presenceTTL) {
        presenceToDelete.push(key);
      }
    }
    
    for (const key of presenceToDelete) {
      const presence = this.userPresence.get(key);
      this.userPresence.delete(key);
      
      // Also remove from Redis
      if (presence) {
        const redisKey = `presence:${presence.flowId}:${presence.userId}`;
        await this.redisClient.del(redisKey);
      }
    }
    
    if (presenceToDelete.length > 0) {
      this.logger.debug(`Cleaned up ${presenceToDelete.length} stale presence entries`);
    }
  }

  /**
   * Clean up all session-related data for a flow
   */
  async cleanupSessionData(flowId) {
    // Remove operation history
    this.operationHistory.delete(flowId);
    
    // Remove user presence for this flow
    const presenceKeysToDelete = [];
    for (const [key, presence] of this.userPresence.entries()) {
      if (presence.flowId === flowId) {
        presenceKeysToDelete.push(key);
      }
    }
    
    for (const key of presenceKeysToDelete) {
      this.userPresence.delete(key);
    }
    
    // Clean up Redis presence data using SCAN instead of KEYS
    const pattern = `presence:${flowId}:*`;
    const stream = this.redisClient.scanStream({
      match: pattern,
      count: 100
    });
    
    const keysToDelete = [];
    for await (const keys of stream) {
      keysToDelete.push(...keys);
    }
    
    if (keysToDelete.length > 0) {
      await this.redisClient.del(...keysToDelete);
    }
    
    this.logger.debug(`Cleaned up all session data for flow ${flowId}`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.stopCleanupJob();
    
    // Close all active sessions
    for (const [key, session] of this.sessions.entries()) {
      await this.broadcastToFlow(session.flowId, {
        type: 'service_shutdown',
        message: 'Collaboration service shutting down',
        timestamp: Date.now()
      });
    }
    
    // Clear all in-memory data
    this.sessions.clear();
    this.operationHistory.clear();
    this.userPresence.clear();
    
    // Close Redis subscriber
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
    }
    
    this.logger.info('Collaboration service shut down gracefully');
  }
}

export default CollaborationService;