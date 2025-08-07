// ==========================================
// API GATEWAY - WebSocket Event Handler
// Based on OPEN_QUESTIONS_ANSWERS.md specifications
// ==========================================

import { EventEmitter } from 'events';
import jwt from 'jsonwebtoken';

export class WebSocketHandler extends EventEmitter {
  constructor(io, logger, redisClient, eventBus, rateLimiter) {
    super();
    this.io = io;
    this.logger = logger;
    this.redisClient = redisClient;
    this.eventBus = eventBus;
    this.rateLimiter = rateLimiter;
    
    // Track active connections
    this.connections = new Map();
    
    // Define expected events as per specification
    this.expectedEvents = {
      'USER_MESSAGE_RECEIVED': this.handleUserMessage.bind(this),
      'USER_PLAN_APPROVED': this.handlePlanApproval.bind(this),
      'IMAGE_UPLOAD_RECEIVED': this.handleImageUpload.bind(this),
      'cursor_position': this.handleCursorPosition.bind(this),
      'join_project': this.handleJoinProject.bind(this),
      'leave_project': this.handleLeaveProject.bind(this),
      'flow_operation': this.handleFlowOperation.bind(this),
      'selection_update': this.handleSelectionUpdate.bind(this)
    };
    
    this.initialize();
  }

  /**
   * Initialize WebSocket handling
   */
  initialize() {
    // Configure Socket.IO middleware
    this.io.use(async (socket, next) => {
      try {
        // Authenticate socket connection
        const token = socket.handshake.auth?.token || 
                     socket.handshake.headers?.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication required'));
        }
        
        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId || decoded.sub;
        socket.userTier = decoded.tier || 'free';
        socket.workspaceId = decoded.workspaceId;
        
        // Check WebSocket connection limit
        const limitCheck = await this.rateLimiter.checkWebSocketLimit(
          socket.userId, 
          socket.userTier
        );
        
        if (!limitCheck.allowed) {
          return next(new Error(limitCheck.reason));
        }
        
        next();
      } catch (error) {
        this.logger.error('WebSocket authentication failed', error);
        next(new Error('Authentication failed'));
      }
    });
    
    // Handle connections
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    // Subscribe to Redis events for cross-service communication
    this.subscribeToRedisEvents();
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket) {
    this.logger.info('WebSocket connection established', {
      socketId: socket.id,
      userId: socket.userId,
      tier: socket.userTier
    });
    
    // Track connection
    this.connections.set(socket.id, {
      userId: socket.userId,
      workspaceId: socket.workspaceId,
      tier: socket.userTier,
      joinedProjects: new Set(),
      connectedAt: Date.now()
    });
    
    // Track for rate limiting
    this.rateLimiter.trackWebSocketConnection(socket.userId, socket.id, true);
    
    // Register event handlers
    Object.entries(this.expectedEvents).forEach(([event, handler]) => {
      socket.on(event, async (data) => {
        try {
          // Check message rate limit
          const limitCheck = this.rateLimiter.checkWebSocketMessageLimit(
            socket.id, 
            socket.userTier
          );
          
          if (!limitCheck.allowed) {
            socket.emit('error', {
              type: 'RATE_LIMIT',
              message: limitCheck.reason
            });
            return;
          }
          
          // Handle the event
          await handler(socket, data);
          
        } catch (error) {
          this.logger.error(`Error handling ${event}`, error);
          socket.emit('error', {
            type: 'PROCESSING_ERROR',
            message: 'Failed to process request'
          });
        }
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
    
    // Send initial connection success
    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.userId,
      tier: socket.userTier
    });
  }

  /**
   * Handle user message for AI flow generation
   */
  async handleUserMessage(socket, data) {
    this.logger.info('User message received', {
      userId: socket.userId,
      projectId: data.projectId
    });
    
    // Validate data
    if (!data.message || !data.projectId) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Message and projectId required'
      });
      return;
    }
    
    // Emit to cognitive-core via Redis
    await this.eventBus.emit('USER_MESSAGE_RECEIVED', {
      userId: socket.userId,
      workspaceId: socket.workspaceId,
      projectId: data.projectId,
      message: data.message,
      context: data.context || {},
      socketId: socket.id,
      timestamp: Date.now()
    });
    
    // Acknowledge receipt
    socket.emit('message_acknowledged', {
      messageId: data.messageId,
      status: 'processing'
    });
  }

  /**
   * Handle plan approval from user
   */
  async handlePlanApproval(socket, data) {
    this.logger.info('Plan approval received', {
      userId: socket.userId,
      planId: data.planId
    });
    
    // Validate
    if (!data.planId || !data.projectId) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'PlanId and projectId required'
      });
      return;
    }
    
    // Emit to cognitive-core
    await this.eventBus.emit('USER_PLAN_APPROVED', {
      userId: socket.userId,
      workspaceId: socket.workspaceId,
      projectId: data.projectId,
      planId: data.planId,
      flowStructure: data.flowStructure,
      modifications: data.modifications || [],
      socketId: socket.id,
      timestamp: Date.now()
    });
    
    // Acknowledge
    socket.emit('plan_approval_acknowledged', {
      planId: data.planId,
      status: 'executing'
    });
  }

  /**
   * Handle image upload for AI analysis
   */
  async handleImageUpload(socket, data) {
    this.logger.info('Image upload received', {
      userId: socket.userId,
      imageSize: data.imageData?.length
    });
    
    // Validate
    if (!data.imageData || !data.projectId) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'Image data and projectId required'
      });
      return;
    }
    
    // Check image size limit (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (data.imageData.length > maxSize) {
      socket.emit('error', {
        type: 'SIZE_LIMIT',
        message: 'Image exceeds 10MB limit'
      });
      return;
    }
    
    // Emit to cognitive-core
    await this.eventBus.emit('IMAGE_UPLOAD_RECEIVED', {
      userId: socket.userId,
      workspaceId: socket.workspaceId,
      projectId: data.projectId,
      imageData: data.imageData,
      mimeType: data.mimeType || 'image/png',
      purpose: data.purpose || 'analysis',
      socketId: socket.id,
      timestamp: Date.now()
    });
    
    // Acknowledge
    socket.emit('image_upload_acknowledged', {
      uploadId: data.uploadId,
      status: 'analyzing'
    });
  }

  /**
   * Handle cursor position for real-time collaboration
   */
  async handleCursorPosition(socket, data) {
    // Validate
    if (!data.projectId || !data.position) {
      return;
    }
    
    const connection = this.connections.get(socket.id);
    if (!connection.joinedProjects.has(data.projectId)) {
      socket.emit('error', {
        type: 'NOT_IN_PROJECT',
        message: 'Must join project first'
      });
      return;
    }
    
    // Broadcast to other users in the project room
    socket.to(`project:${data.projectId}`).emit('cursor_update', {
      userId: socket.userId,
      position: data.position,
      timestamp: Date.now()
    });
    
    // Store in Redis for persistence
    await this.redisClient.setex(
      `cursor:${data.projectId}:${socket.userId}`,
      60, // 1 minute TTL
      JSON.stringify(data.position)
    );
  }

  /**
   * Handle joining a project room
   */
  async handleJoinProject(socket, data) {
    this.logger.info('User joining project', {
      userId: socket.userId,
      projectId: data.projectId
    });
    
    if (!data.projectId) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'ProjectId required'
      });
      return;
    }
    
    // Join Socket.IO room
    const roomName = `project:${data.projectId}`;
    await socket.join(roomName);
    
    // Track joined project
    const connection = this.connections.get(socket.id);
    connection.joinedProjects.add(data.projectId);
    
    // Get current users in room
    const sockets = await this.io.in(roomName).fetchSockets();
    const users = sockets.map(s => ({
      userId: s.userId,
      socketId: s.id
    }));
    
    // Notify others in room
    socket.to(roomName).emit('user_joined_project', {
      userId: socket.userId,
      projectId: data.projectId,
      timestamp: Date.now()
    });
    
    // Send current state to joining user
    socket.emit('joined_project', {
      projectId: data.projectId,
      users: users,
      timestamp: Date.now()
    });
    
    // Emit to flow-service for collaboration tracking
    await this.eventBus.emit('flow:collaboration:join', {
      flowId: data.projectId,
      userId: socket.userId,
      socketId: socket.id
    });
  }

  /**
   * Handle leaving a project room
   */
  async handleLeaveProject(socket, data) {
    if (!data.projectId) {
      return;
    }
    
    const roomName = `project:${data.projectId}`;
    await socket.leave(roomName);
    
    // Update tracking
    const connection = this.connections.get(socket.id);
    if (connection) {
      connection.joinedProjects.delete(data.projectId);
    }
    
    // Notify others
    socket.to(roomName).emit('user_left_project', {
      userId: socket.userId,
      projectId: data.projectId,
      timestamp: Date.now()
    });
    
    // Clear cursor from Redis
    await this.redisClient.del(`cursor:${data.projectId}:${socket.userId}`);
    
    // Emit to flow-service
    await this.eventBus.emit('flow:collaboration:leave', {
      flowId: data.projectId,
      userId: socket.userId
    });
  }

  /**
   * Handle flow operation (for real-time collaboration)
   */
  async handleFlowOperation(socket, data) {
    if (!data.projectId || !data.operation) {
      socket.emit('error', {
        type: 'VALIDATION_ERROR',
        message: 'ProjectId and operation required'
      });
      return;
    }
    
    const connection = this.connections.get(socket.id);
    if (!connection.joinedProjects.has(data.projectId)) {
      socket.emit('error', {
        type: 'NOT_IN_PROJECT',
        message: 'Must join project first'
      });
      return;
    }
    
    // Emit to flow-service for OT processing
    await this.eventBus.emit('flow:operation', {
      flowId: data.projectId,
      userId: socket.userId,
      operation: data.operation,
      socketId: socket.id,
      timestamp: Date.now()
    });
  }

  /**
   * Handle selection update for collaboration
   */
  async handleSelectionUpdate(socket, data) {
    if (!data.projectId || !data.selection) {
      return;
    }
    
    const connection = this.connections.get(socket.id);
    if (!connection.joinedProjects.has(data.projectId)) {
      return;
    }
    
    // Broadcast to others in project
    socket.to(`project:${data.projectId}`).emit('selection_update', {
      userId: socket.userId,
      selection: data.selection,
      timestamp: Date.now()
    });
  }

  /**
   * Handle socket disconnect
   */
  handleDisconnect(socket) {
    this.logger.info('WebSocket disconnected', {
      socketId: socket.id,
      userId: socket.userId
    });
    
    const connection = this.connections.get(socket.id);
    if (connection) {
      // Leave all project rooms
      connection.joinedProjects.forEach(projectId => {
        const roomName = `project:${projectId}`;
        socket.to(roomName).emit('user_left_project', {
          userId: socket.userId,
          projectId: projectId,
          timestamp: Date.now()
        });
        
        // Clear cursor
        this.redisClient.del(`cursor:${projectId}:${socket.userId}`);
      });
      
      // Update rate limiter
      this.rateLimiter.trackWebSocketConnection(socket.userId, socket.id, false);
      
      // Remove from tracking
      this.connections.delete(socket.id);
    }
  }

  /**
   * Subscribe to Redis events for cross-service communication
   */
  async subscribeToRedisEvents() {
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();
    
    // Subscribe to AI response events
    await subscriber.subscribe('ai:response:*', (message, channel) => {
      this.handleAIResponse(channel, message);
    });
    
    // Subscribe to flow update events
    await subscriber.subscribe('flow:update:*', (message, channel) => {
      this.handleFlowUpdate(channel, message);
    });
    
    // Subscribe to collaboration events
    await subscriber.subscribe('collaboration:*', (message, channel) => {
      this.handleCollaborationEvent(channel, message);
    });
  }

  /**
   * Handle AI response from cognitive-core
   */
  handleAIResponse(channel, message) {
    try {
      const data = JSON.parse(message);
      const socketId = data.socketId;
      
      if (socketId) {
        // Send directly to the requesting socket
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('ai_response', {
            type: data.type,
            content: data.content,
            metadata: data.metadata,
            timestamp: Date.now()
          });
        }
      } else if (data.projectId) {
        // Broadcast to project room
        this.io.to(`project:${data.projectId}`).emit('ai_response', data);
      }
    } catch (error) {
      this.logger.error('Failed to handle AI response', error);
    }
  }

  /**
   * Handle flow update events
   */
  handleFlowUpdate(channel, message) {
    try {
      const data = JSON.parse(message);
      const projectId = data.projectId || data.flowId;
      
      // Broadcast to all users in the project
      this.io.to(`project:${projectId}`).emit('flow_updated', {
        type: data.type,
        changes: data.changes,
        userId: data.userId,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.error('Failed to handle flow update', error);
    }
  }

  /**
   * Handle collaboration events
   */
  handleCollaborationEvent(channel, message) {
    try {
      const data = JSON.parse(message);
      const projectId = data.flowId || data.projectId;
      
      // Broadcast collaboration updates
      if (data.excludeUserId) {
        // Send to all except the originator
        this.io.to(`project:${projectId}`).emit('collaboration_event', data);
      } else {
        // Send to all in project
        this.io.to(`project:${projectId}`).emit('collaboration_event', data);
      }
    } catch (error) {
      this.logger.error('Failed to handle collaboration event', error);
    }
  }

  /**
   * Get WebSocket metrics
   */
  getMetrics() {
    const metrics = {
      totalConnections: this.connections.size,
      connectionsByTier: {},
      activeProjects: new Set(),
      averageProjectsPerUser: 0
    };
    
    let totalProjects = 0;
    
    for (const connection of this.connections.values()) {
      // Count by tier
      metrics.connectionsByTier[connection.tier] = 
        (metrics.connectionsByTier[connection.tier] || 0) + 1;
      
      // Track active projects
      connection.joinedProjects.forEach(p => metrics.activeProjects.add(p));
      totalProjects += connection.joinedProjects.size;
    }
    
    metrics.activeProjects = metrics.activeProjects.size;
    metrics.averageProjectsPerUser = 
      this.connections.size > 0 ? totalProjects / this.connections.size : 0;
    
    return metrics;
  }

  /**
   * Broadcast system message to all or specific users
   */
  broadcastSystemMessage(message, targetUsers = null) {
    if (targetUsers) {
      // Send to specific users
      targetUsers.forEach(userId => {
        for (const [socketId, connection] of this.connections) {
          if (connection.userId === userId) {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit('system_message', message);
            }
          }
        }
      });
    } else {
      // Broadcast to all
      this.io.emit('system_message', message);
    }
  }
}

export default WebSocketHandler;