// ==========================================
// API GATEWAY - WebSocket Service
// ==========================================

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { Logger } from '@ux-flow/common';

export class WebSocketService {
  constructor(server, logger, eventEmitter, authService) {
    this.logger = logger || new Logger('websocket-service');
    this.eventEmitter = eventEmitter;
    this.authService = authService;
    
    // WebSocket server
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      perMessageDeflate: {
        zlibDeflateOptions: {
          chunkSize: 1024,
          memLevel: 7,
          level: 3
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
      }
    });
    
    // Connection management
    this.clients = new Map();
    this.rooms = new Map();
    this.userConnections = new Map();
    
    // Configuration
    this.maxConnectionsPerUser = 5;
    this.maxMessageSize = 512 * 1024; // 512KB
    this.heartbeatInterval = 30000; // 30 seconds
    
    // Rate limiting
    this.messageRateLimit = {
      windowMs: 1000,
      maxMessages: 10
    };
    this.clientMessageCounts = new Map();
    
    // Initialize
    this.initialize();
  }

  initialize() {
    // Handle new connections
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat
    this.startHeartbeat();
    
    // Setup event listeners
    this.setupEventListeners();
    
    this.logger.info('WebSocket service initialized');
  }

  async handleConnection(ws, req) {
    const clientId = this.generateClientId();
    
    try {
      // Authenticate connection
      const auth = await this.authenticateConnection(req);
      
      if (!auth.success) {
        ws.close(1008, 'Authentication failed');
        return;
      }

      // Check connection limit
      if (!this.checkConnectionLimit(auth.userId)) {
        ws.close(1008, 'Connection limit exceeded');
        return;
      }

      // Setup client
      const client = {
        id: clientId,
        ws,
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        role: auth.role,
        isAlive: true,
        connectedAt: new Date(),
        lastActivity: new Date()
      };

      // Store client
      this.clients.set(clientId, client);
      this.addUserConnection(auth.userId, clientId);

      // Setup event handlers
      this.setupClientHandlers(client);

      // Send connection confirmation
      this.sendToClient(clientId, {
        type: 'connection',
        status: 'connected',
        clientId,
        userId: auth.userId
      });

      // Emit connection event
      this.eventEmitter.emit('websocket.connected', {
        clientId,
        userId: auth.userId,
        workspaceId: auth.workspaceId
      });

      this.logger.info(`Client connected: ${clientId}`, {
        userId: auth.userId,
        workspaceId: auth.workspaceId
      });
    } catch (error) {
      this.logger.error('Connection handling failed', error);
      ws.close(1011, 'Server error');
    }
  }

  async authenticateConnection(req) {
    try {
      // Extract token from query string or headers
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token') || 
                   req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return { success: false, error: 'No token provided' };
      }

      // Verify token
      const result = await this.authService.verifyToken(token);
      
      if (!result.valid) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        userId: result.user.id,
        workspaceId: result.user.workspaceId,
        role: result.user.role
      };
    } catch (error) {
      this.logger.error('Authentication error', error);
      return { success: false, error: error.message };
    }
  }

  setupClientHandlers(client) {
    const { ws, id } = client;

    // Message handler
    ws.on('message', async (data) => {
      try {
        // Check message size
        if (data.length > this.maxMessageSize) {
          this.sendError(id, 'Message too large');
          return;
        }

        // Check rate limit
        if (this.isRateLimited(id)) {
          this.sendError(id, 'Rate limit exceeded');
          return;
        }

        // Parse message
        const message = JSON.parse(data.toString());
        
        // Update activity
        client.lastActivity = new Date();
        
        // Handle message
        await this.handleMessage(id, message);
      } catch (error) {
        this.logger.error('Message handling error', { clientId: id, error });
        this.sendError(id, 'Invalid message format');
      }
    });

    // Pong handler (for heartbeat)
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Close handler
    ws.on('close', (code, reason) => {
      this.handleDisconnection(id, code, reason.toString());
    });

    // Error handler
    ws.on('error', (error) => {
      this.logger.error('WebSocket error', { clientId: id, error });
    });
  }

  async handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }

    const { type, data, room } = message;

    switch (type) {
      case 'join':
        this.joinRoom(clientId, data.room);
        break;
        
      case 'leave':
        this.leaveRoom(clientId, data.room);
        break;
        
      case 'broadcast':
        this.broadcastToRoom(data.room, {
          type: 'message',
          from: client.userId,
          data: data.message
        }, clientId);
        break;
        
      case 'direct':
        this.sendToUser(data.userId, {
          type: 'direct',
          from: client.userId,
          data: data.message
        });
        break;
        
      case 'flow.update':
        // Forward to flow service
        this.eventEmitter.emit('flow.update', {
          clientId,
          userId: client.userId,
          flowId: data.flowId,
          changes: data.changes
        });
        break;
        
      case 'ping':
        this.sendToClient(clientId, { type: 'pong' });
        break;
        
      default:
        // Emit generic event
        this.eventEmitter.emit(`websocket.${type}`, {
          clientId,
          userId: client.userId,
          data
        });
    }

    // Track message for rate limiting
    this.trackMessage(clientId);
  }

  joinRoom(clientId, roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    
    this.rooms.get(roomName).add(clientId);
    
    const client = this.clients.get(clientId);
    if (client) {
      client.rooms = client.rooms || new Set();
      client.rooms.add(roomName);
    }

    // Notify room members
    this.broadcastToRoom(roomName, {
      type: 'room.joined',
      userId: client?.userId,
      room: roomName
    }, clientId);

    this.logger.debug(`Client ${clientId} joined room ${roomName}`);
  }

  leaveRoom(clientId, roomName) {
    const room = this.rooms.get(roomName);
    
    if (room) {
      room.delete(clientId);
      
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    const client = this.clients.get(clientId);
    if (client?.rooms) {
      client.rooms.delete(roomName);
    }

    // Notify room members
    this.broadcastToRoom(roomName, {
      type: 'room.left',
      userId: client?.userId,
      room: roomName
    }, clientId);

    this.logger.debug(`Client ${clientId} left room ${roomName}`);
  }

  broadcastToRoom(roomName, message, excludeClientId = null) {
    const room = this.rooms.get(roomName);
    
    if (!room) {
      return;
    }

    for (const clientId of room) {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  broadcastToWorkspace(workspaceId, message, excludeClientId = null) {
    for (const [clientId, client] of this.clients) {
      if (client.workspaceId === workspaceId && clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  sendToUser(userId, message) {
    const connections = this.userConnections.get(userId);
    
    if (connections) {
      for (const clientId of connections) {
        this.sendToClient(clientId, message);
      }
    }
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    
    if (client && client.ws.readyState === 1) { // OPEN
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        this.logger.error('Failed to send message', { clientId, error });
      }
    }
  }

  sendError(clientId, error) {
    this.sendToClient(clientId, {
      type: 'error',
      error,
      timestamp: new Date().toISOString()
    });
  }

  broadcast(message, excludeClientId = null) {
    for (const [clientId] of this.clients) {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);
    
    if (!client) {
      return;
    }

    // Remove from rooms
    if (client.rooms) {
      for (const roomName of client.rooms) {
        this.leaveRoom(clientId, roomName);
      }
    }

    // Remove from user connections
    this.removeUserConnection(client.userId, clientId);

    // Remove client
    this.clients.delete(clientId);

    // Emit disconnection event
    this.eventEmitter.emit('websocket.disconnected', {
      clientId,
      userId: client.userId,
      workspaceId: client.workspaceId,
      code,
      reason
    });

    this.logger.info(`Client disconnected: ${clientId}`, {
      userId: client.userId,
      code,
      reason
    });
  }

  checkConnectionLimit(userId) {
    const connections = this.userConnections.get(userId);
    return !connections || connections.size < this.maxConnectionsPerUser;
  }

  addUserConnection(userId, clientId) {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId).add(clientId);
  }

  removeUserConnection(userId, clientId) {
    const connections = this.userConnections.get(userId);
    
    if (connections) {
      connections.delete(clientId);
      
      if (connections.size === 0) {
        this.userConnections.delete(userId);
      }
    }
  }

  isRateLimited(clientId) {
    const now = Date.now();
    const count = this.clientMessageCounts.get(clientId);
    
    if (!count) {
      this.clientMessageCounts.set(clientId, {
        count: 1,
        resetTime: now + this.messageRateLimit.windowMs
      });
      return false;
    }

    if (now > count.resetTime) {
      count.count = 1;
      count.resetTime = now + this.messageRateLimit.windowMs;
      return false;
    }

    count.count++;
    return count.count > this.messageRateLimit.maxMessages;
  }

  trackMessage(clientId) {
    // Already tracked in isRateLimited
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          // Terminate dead connection
          client.ws.terminate();
          this.handleDisconnection(clientId, 1006, 'Connection lost');
        } else {
          // Send ping
          client.isAlive = false;
          client.ws.ping();
        }
      }
    }, this.heartbeatInterval);
  }

  setupEventListeners() {
    // Listen for service events to broadcast
    this.eventEmitter.on('broadcast.workspace', ({ workspaceId, message }) => {
      this.broadcastToWorkspace(workspaceId, message);
    });

    this.eventEmitter.on('broadcast.user', ({ userId, message }) => {
      this.sendToUser(userId, message);
    });

    this.eventEmitter.on('broadcast.all', ({ message }) => {
      this.broadcast(message);
    });
  }

  generateClientId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getMetrics() {
    return {
      totalConnections: this.clients.size,
      rooms: this.rooms.size,
      users: this.userConnections.size,
      connections: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        userId: client.userId,
        workspaceId: client.workspaceId,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity
      }))
    };
  }

  shutdown() {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Close all connections
    for (const [clientId, client] of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }

    // Close WebSocket server
    this.wss.close();

    this.logger.info('WebSocket service shut down');
  }
}

export default WebSocketService;