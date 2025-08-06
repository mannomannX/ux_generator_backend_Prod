// ==========================================
// SERVICES/API-GATEWAY/src/websocket/connection-manager.js
// ==========================================
import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { JWTUtils } from '@ux-flow/common';

class WebSocketManager {
  constructor(server, logger, messageHandler, roomManager) {
    this.server = server;
    this.logger = logger;
    this.messageHandler = messageHandler;
    this.roomManager = roomManager;
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws, userId, projectId, workspaceId }
    this.heartbeatInterval = null;
    
    this.initialize();
  }

  initialize() {
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.setupHeartbeat();
    
    this.logger.info('WebSocket Manager initialized');
  }

  verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'ws://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const decoded = JWTUtils.verify(token);
      if (!decoded) {
        this.logger.warn('WebSocket connection rejected: Invalid token');
        return false;
      }

      // Attach user info to request for later use
      info.req.user = decoded;
      return true;
    } catch (error) {
      this.logger.error('WebSocket verification failed', error);
      return false;
    }
  }

  async handleConnection(ws, request) {
    try {
      const url = new URL(request.url, 'ws://localhost');
      const projectId = url.searchParams.get('projectId');
      const workspaceId = url.searchParams.get('workspaceId');
      const userId = request.user.userId;
      
      if (!projectId || !workspaceId) {
        ws.close(1008, 'Missing required parameters: projectId, workspaceId');
        return;
      }

      // Generate unique client ID
      const clientId = `${userId}_${projectId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      // Store client information
      const clientInfo = {
        ws,
        clientId,
        userId,
        projectId,
        workspaceId,
        connectedAt: new Date(),
        lastSeen: new Date(),
        isAlive: true,
      };

      this.clients.set(clientId, clientInfo);
      ws.clientId = clientId;

      // Join project room
      await this.roomManager.joinRoom(projectId, clientId, userId);

      // Setup WebSocket event handlers
      this.setupClientHandlers(ws, clientInfo);

      // Send initial connection confirmation
      this.sendToClient(clientId, {
        type: 'connection_established',
        clientId,
        projectId,
        workspaceId,
        connectedAt: clientInfo.connectedAt,
      });

      // Notify message handler about new connection
      await this.messageHandler.handleClientConnected(clientInfo);

      this.logger.info('WebSocket client connected', {
        clientId,
        userId,
        projectId,
        workspaceId,
        totalClients: this.clients.size,
      });

    } catch (error) {
      this.logger.error('Failed to handle WebSocket connection', error);
      ws.close(1011, 'Internal server error');
    }
  }

  setupClientHandlers(ws, clientInfo) {
    ws.on('message', async (data) => {
      try {
        clientInfo.lastSeen = new Date();
        clientInfo.isAlive = true;

        const message = JSON.parse(data.toString());
        
        // Add client context to message
        message.clientId = clientInfo.clientId;
        message.userId = clientInfo.userId;
        message.projectId = clientInfo.projectId;
        message.workspaceId = clientInfo.workspaceId;

        // Forward to message handler
        await this.messageHandler.handleMessage(message, clientInfo);

      } catch (error) {
        this.logger.error('Failed to handle WebSocket message', error, {
          clientId: clientInfo.clientId,
          userId: clientInfo.userId,
        });

        this.sendToClient(clientInfo.clientId, {
          type: 'error',
          message: 'Failed to process message',
          error: error.message,
        });
      }
    });

    ws.on('pong', () => {
      clientInfo.isAlive = true;
      clientInfo.lastSeen = new Date();
    });

    ws.on('close', async (code, reason) => {
      await this.handleClientDisconnect(clientInfo, code, reason?.toString());
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket client error', error, {
        clientId: clientInfo.clientId,
        userId: clientInfo.userId,
      });
    });
  }

  async handleClientDisconnect(clientInfo, code, reason) {
    try {
      const { clientId, userId, projectId } = clientInfo;

      // Remove from room
      await this.roomManager.leaveRoom(projectId, clientId);

      // Remove from clients map
      this.clients.delete(clientId);

      // Notify message handler
      await this.messageHandler.handleClientDisconnected(clientInfo);

      this.logger.info('WebSocket client disconnected', {
        clientId,
        userId,
        projectId,
        code,
        reason,
        totalClients: this.clients.size,
      });

    } catch (error) {
      this.logger.error('Failed to handle client disconnect', error);
    }
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      this.clients.forEach((clientInfo, clientId) => {
        if (!clientInfo.isAlive) {
          this.logger.info('Terminating inactive WebSocket connection', { clientId });
          clientInfo.ws.terminate();
          return;
        }

        // Check if client is stale (no activity for longer than timeout)
        if (now - clientInfo.lastSeen.getTime() > timeout * 2) {
          this.logger.info('Terminating stale WebSocket connection', { clientId });
          clientInfo.ws.terminate();
          return;
        }

        clientInfo.isAlive = false;
        clientInfo.ws.ping();
      });
    }, 30000);
  }

  // Public methods for sending messages

  sendToClient(clientId, message) {
    const clientInfo = this.clients.get(clientId);
    if (!clientInfo || clientInfo.ws.readyState !== clientInfo.ws.OPEN) {
      this.logger.warn('Cannot send message to client: not connected', { clientId });
      return false;
    }

    try {
      clientInfo.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
      }));
      return true;
    } catch (error) {
      this.logger.error('Failed to send message to client', error, { clientId });
      return false;
    }
  }

  sendToUser(userId, projectId, message) {
    let sent = 0;
    
    this.clients.forEach((clientInfo, clientId) => {
      if (clientInfo.userId === userId && clientInfo.projectId === projectId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    });

    if (sent === 0) {
      this.logger.warn('No active connections found for user', { userId, projectId });
    }

    return sent;
  }

  broadcastToProject(projectId, message, excludeUserId = null) {
    let sent = 0;

    this.clients.forEach((clientInfo, clientId) => {
      if (clientInfo.projectId === projectId && 
          clientInfo.userId !== excludeUserId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    });

    this.logger.debug('Broadcast message to project', { 
      projectId, 
      recipientCount: sent,
      excludeUserId 
    });

    return sent;
  }

  broadcastToWorkspace(workspaceId, message, excludeUserId = null) {
    let sent = 0;

    this.clients.forEach((clientInfo, clientId) => {
      if (clientInfo.workspaceId === workspaceId && 
          clientInfo.userId !== excludeUserId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    });

    return sent;
  }

  // Health check and statistics

  healthCheck() {
    const totalClients = this.clients.size;
    const activeClients = Array.from(this.clients.values())
      .filter(client => client.isAlive).length;

    return {
      status: 'ok',
      totalConnections: totalClients,
      activeConnections: activeClients,
      uptime: Date.now() - (this.startTime || Date.now()),
    };
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      activeConnections: 0,
      connectionsByProject: {},
      connectionsByWorkspace: {},
    };

    this.clients.forEach((clientInfo) => {
      if (clientInfo.isAlive) stats.activeConnections++;
      
      stats.connectionsByProject[clientInfo.projectId] = 
        (stats.connectionsByProject[clientInfo.projectId] || 0) + 1;
      
      stats.connectionsByWorkspace[clientInfo.workspaceId] = 
        (stats.connectionsByWorkspace[clientInfo.workspaceId] || 0) + 1;
    });

    return stats;
  }

  async shutdown() {
    this.logger.info('Shutting down WebSocket Manager...');

    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all client connections
    const closePromises = Array.from(this.clients.values()).map(clientInfo => {
      return new Promise((resolve) => {
        clientInfo.ws.close(1001, 'Server shutting down');
        clientInfo.ws.on('close', resolve);
        setTimeout(resolve, 1000); // Force resolve after 1 second
      });
    });

    await Promise.all(closePromises);

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    this.clients.clear();
    this.logger.info('WebSocket Manager shut down completed');
  }
}

export { WebSocketManager };