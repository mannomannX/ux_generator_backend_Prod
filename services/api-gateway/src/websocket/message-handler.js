// ==========================================
// SERVICES/API-GATEWAY/src/websocket/message-handler.js
// ==========================================
import { EventTypes } from '@ux-flow/common';

class MessageHandler {
  constructor(logger, eventEmitter, mongoClient, redisClient, roomManager) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.roomManager = roomManager;
    
    // Track active conversations to prevent duplicate processing
    this.activeConversations = new Map();
  }

  async handleMessage(message, clientInfo) {
    const { type, userId, projectId, workspaceId, clientId } = message;
    
    this.logger.info('Processing WebSocket message', {
      type,
      userId,
      projectId,
      workspaceId,
      clientId,
    });

    try {
      switch (type) {
        case 'user_message':
          await this.handleUserMessage(message, clientInfo);
          break;

        case 'plan_approved':
          await this.handlePlanApproval(message, clientInfo);
          break;

        case 'plan_feedback':
          await this.handlePlanFeedback(message, clientInfo);
          break;

        case 'image_upload':
          await this.handleImageUpload(message, clientInfo);
          break;

        case 'ping':
          await this.handlePing(message, clientInfo);
          break;

        case 'join_project':
          await this.handleJoinProject(message, clientInfo);
          break;

        case 'leave_project':
          await this.handleLeaveProject(message, clientInfo);
          break;

        case 'cursor_position':
          await this.handleCursorPosition(message, clientInfo);
          break;

        default:
          this.logger.warn('Unknown message type received', { type, userId, projectId });
          throw new Error(`Unknown message type: ${type}`);
      }

    } catch (error) {
      this.logger.error('Failed to handle WebSocket message', error, {
        type,
        userId,
        projectId,
        messageId: message.messageId,
      });

      // Send error back to client
      throw error; // This will be caught by the WebSocket manager
    }
  }

  async handleUserMessage(message, clientInfo) {
    const { userId, projectId, workspaceId, message: userMessage, qualityMode = 'standard' } = message;
    
    // Prevent duplicate processing of the same message
    const conversationKey = `${userId}-${projectId}`;
    if (this.activeConversations.has(conversationKey)) {
      this.logger.warn('Conversation already in progress, ignoring duplicate message', {
        userId,
        projectId,
        conversationKey,
      });
      return;
    }

    this.activeConversations.set(conversationKey, Date.now());

    try {
      // Store message in conversation history
      await this.storeMessage(projectId, userId, 'user', userMessage);

      // Emit event to Cognitive Core Service
      this.eventEmitter.emit(EventTypes.USER_MESSAGE_RECEIVED, {
        userId,
        projectId,
        workspaceId,
        message: userMessage,
        qualityMode,
        timestamp: new Date().toISOString(),
        clientId: clientInfo.clientId,
      });

      this.logger.info('User message forwarded to Cognitive Core', {
        userId,
        projectId,
        messageLength: userMessage.length,
        qualityMode,
      });

    } finally {
      // Remove from active conversations after a delay to prevent rapid duplicate requests
      setTimeout(() => {
        this.activeConversations.delete(conversationKey);
      }, 2000);
    }
  }

  async handlePlanApproval(message, clientInfo) {
    const { userId, projectId, approved, plan, currentFlow } = message;

    // Store approval decision
    await this.storeMessage(
      projectId, 
      userId, 
      'user', 
      approved ? 'Plan approved for execution' : 'Plan rejected'
    );

    // Emit event to Cognitive Core Service
    this.eventEmitter.emit(EventTypes.USER_PLAN_APPROVED, {
      userId,
      projectId,
      approved,
      plan,
      currentFlow,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Plan approval forwarded to Cognitive Core', {
      userId,
      projectId,
      approved,
      planSteps: plan?.length || 0,
    });
  }

  async handlePlanFeedback(message, clientInfo) {
    const { userId, projectId, feedback, originalPlan } = message;

    // Store feedback
    await this.storeMessage(projectId, userId, 'user', `Plan feedback: ${feedback}`);

    // Emit event to Cognitive Core Service
    this.eventEmitter.emit(EventTypes.USER_PLAN_FEEDBACK, {
      userId,
      projectId,
      feedback,
      originalPlan,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Plan feedback forwarded to Cognitive Core', {
      userId,
      projectId,
      feedbackLength: feedback.length,
    });
  }

  async handleImageUpload(message, clientInfo) {
    const { userId, projectId, imageData, mimeType = 'image/jpeg' } = message;

    // Emit event to Cognitive Core Service for visual interpretation
    this.eventEmitter.emit(EventTypes.IMAGE_UPLOAD_RECEIVED, {
      userId,
      projectId,
      imageData,
      mimeType,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Image upload forwarded to Cognitive Core', {
      userId,
      projectId,
      imageSize: imageData.length,
      mimeType,
    });
  }

  async handlePing(message, clientInfo) {
    // Simple ping-pong for connection testing
    // The WebSocket manager handles heartbeat automatically
    this.logger.debug('Ping received from client', {
      clientId: clientInfo.clientId,
      userId: clientInfo.userId,
    });
  }

  async handleJoinProject(message, clientInfo) {
    const { projectId: newProjectId } = message;
    const { userId, projectId: oldProjectId } = clientInfo;

    // Leave old project room
    if (oldProjectId && oldProjectId !== newProjectId) {
      await this.roomManager.leaveRoom(oldProjectId, clientInfo.clientId);
    }

    // Join new project room
    await this.roomManager.joinRoom(newProjectId, clientInfo.clientId, userId);

    // Update client info
    clientInfo.projectId = newProjectId;

    this.logger.info('Client switched projects', {
      userId,
      oldProjectId,
      newProjectId,
      clientId: clientInfo.clientId,
    });
  }

  async handleLeaveProject(message, clientInfo) {
    const { projectId } = clientInfo;

    await this.roomManager.leaveRoom(projectId, clientInfo.clientId);

    this.logger.info('Client left project', {
      userId: clientInfo.userId,
      projectId,
      clientId: clientInfo.clientId,
    });
  }

  async handleCursorPosition(message, clientInfo) {
    const { userId, projectId } = clientInfo;
    const { x, y, elementId } = message;

    // Broadcast cursor position to other users in the same project
    const cursorUpdate = {
      type: 'cursor_update',
      userId,
      userName: message.userName || userId, // Could be fetched from user profile
      position: { x, y },
      elementId,
      timestamp: new Date().toISOString(),
    };

    // Use room manager to broadcast to project members
    await this.roomManager.broadcastToRoom(projectId, cursorUpdate, clientInfo.clientId);

    // Don't log cursor movements as they're too frequent
  }

  async handleClientConnected(clientInfo) {
    const { userId, projectId, workspaceId } = clientInfo;

    // Emit connection event
    this.eventEmitter.emit(EventTypes.CLIENT_CONNECTED, {
      userId,
      projectId,
      workspaceId,
      clientId: clientInfo.clientId,
      timestamp: new Date().toISOString(),
    });

    // Get initial project state and send to client
    try {
      const projectState = await this.getProjectState(projectId, workspaceId, userId);
      
      // Send initial state via room manager (which will route back to this client)
      await this.roomManager.sendToClient(clientInfo.clientId, {
        type: 'initial_project_state',
        projectState,
      });

    } catch (error) {
      this.logger.error('Failed to send initial project state', error, {
        userId,
        projectId,
        clientId: clientInfo.clientId,
      });
    }

    this.logger.info('Client connection handled', {
      userId,
      projectId,
      workspaceId,
      clientId: clientInfo.clientId,
    });
  }

  async handleClientDisconnected(clientInfo) {
    const { userId, projectId, workspaceId, clientId } = clientInfo;

    // Emit disconnection event
    this.eventEmitter.emit(EventTypes.CLIENT_DISCONNECTED, {
      userId,
      projectId,
      workspaceId,
      clientId,
      timestamp: new Date().toISOString(),
    });

    this.logger.info('Client disconnection handled', {
      userId,
      projectId,
      clientId,
    });
  }

  // Helper methods

  async storeMessage(projectId, userId, role, content) {
    try {
      const db = this.mongoClient.getDb();
      const conversationsCollection = db.collection('conversations');

      await conversationsCollection.insertOne({
        projectId,
        userId,
        role,
        content,
        timestamp: new Date(),
        createdAt: new Date(),
      });

    } catch (error) {
      this.logger.error('Failed to store message in conversation history', error, {
        projectId,
        userId,
        role,
      });
      // Don't throw - message storage failure shouldn't break the flow
    }
  }

  async getProjectState(projectId, workspaceId, userId) {
    try {
      // This would typically fetch the current flow state from Flow Service
      // For now, return a basic structure
      return {
        projectId,
        workspaceId,
        flow: {
          metadata: { flowName: 'New Flow', version: '1.0.0' },
          nodes: [{ id: 'start', type: 'Start' }],
          edges: [],
        },
        lastUpdated: new Date().toISOString(),
        collaborators: [], // List of active users in this project
      };

    } catch (error) {
      this.logger.error('Failed to get project state', error, { projectId, userId });
      throw error;
    }
  }
}

export { MessageHandler };