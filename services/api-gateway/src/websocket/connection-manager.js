/**
 * Fixed WebSocket Connection Manager with Security Enhancements
 */

import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { JWTUtils } from '@ux-flow/common';
import { WebSocketRateLimiter } from '../middleware/rate-limiter-fixed.js';

class WebSocketManager {
  constructor(server, logger, messageHandler, roomManager, redisClient) {
    this.server = server;
    this.logger = logger;
    this.messageHandler = messageHandler;
    this.roomManager = roomManager;
    this.redisClient = redisClient;
    this.wss = null;
    this.clients = new Map(); // clientId -> clientInfo
    this.userConnections = new Map(); // userId -> Set of clientIds
    this.heartbeatInterval = null;
    this.rateLimiter = null;
    this.metricsInterval = null;
    this.maxMessageSize = 1024 * 64; // 64KB max message size
    this.maxConnectionsPerUser = 5;
    this.startTime = Date.now();
    
    this.initialize();
  }

  async initialize() {
    // Initialize rate limiter
    this.rateLimiter = new WebSocketRateLimiter(this.logger);
    await this.rateLimiter.initialize();

    // Configure WebSocket server
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws',
      maxPayload: this.maxMessageSize,
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
      },
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.setupHeartbeat();
    this.setupMetricsCollection();
    
    this.logger.info('WebSocket Manager initialized with security enhancements');
  }

  async verifyClient(info, cb) {
    try {
      const url = new URL(info.req.url, 'ws://localhost');
      const token = url.searchParams.get('token');
      const clientIp = info.req.socket.remoteAddress;
      
      if (!token) {
        this.logger.warn('WebSocket connection rejected: No token provided', { ip: clientIp });
        cb(false, 401, 'Unauthorized');
        return;
      }

      // Check if token is blacklisted
      const { getTokenBlacklist } = await import('../middleware/auth.js');
      const tokenBlacklist = getTokenBlacklist();
      if (tokenBlacklist && await tokenBlacklist.isBlacklisted(token)) {
        this.logger.warn('WebSocket connection rejected: Token blacklisted', { ip: clientIp });
        cb(false, 401, 'Token revoked');
        return;
      }

      // Verify JWT token
      const decoded = JWTUtils.verify(token);
      if (!decoded) {
        this.logger.warn('WebSocket connection rejected: Invalid token', { ip: clientIp });
        cb(false, 401, 'Invalid token');
        return;
      }

      // Check token expiry
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        this.logger.warn('WebSocket connection rejected: Token expired', { ip: clientIp });
        cb(false, 401, 'Token expired');
        return;
      }

      // Check connection rate limit
      const socketId = `${decoded.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const rateLimitCheck = await this.rateLimiter.checkConnection(socketId, decoded.userId);
      
      if (!rateLimitCheck.allowed) {
        this.logger.warn('WebSocket connection rejected: Rate limit exceeded', {
          userId: decoded.userId,
          reason: rateLimitCheck.reason,
          ip: clientIp
        });
        cb(false, 429, rateLimitCheck.reason);
        return;
      }

      // Check user connection limit
      const userConnectionCount = this.userConnections.get(decoded.userId)?.size || 0;
      if (userConnectionCount >= this.maxConnectionsPerUser) {
        this.logger.warn('WebSocket connection rejected: Too many connections', {
          userId: decoded.userId,
          currentConnections: userConnectionCount,
          ip: clientIp
        });
        cb(false, 429, 'Too many concurrent connections');
        return;
      }

      // Attach user info to request for later use
      info.req.user = decoded;
      info.req.socketId = socketId;
      info.req.clientIp = clientIp;
      cb(true);
    } catch (error) {
      this.logger.error('WebSocket verification failed', error);
      cb(false, 500, 'Internal error');
    }
  }

  async handleConnection(ws, request) {
    try {
      const url = new URL(request.url, 'ws://localhost');
      const projectId = url.searchParams.get('projectId');
      const workspaceId = url.searchParams.get('workspaceId');
      const userId = request.user.userId;
      const socketId = request.socketId;
      const clientIp = request.clientIp;
      
      // Validate required parameters
      if (!projectId || !workspaceId) {
        ws.close(1008, 'Missing required parameters: projectId, workspaceId');
        return;
      }

      // Validate projectId and workspaceId format (prevent NoSQL injection)
      if (!this.isValidId(projectId) || !this.isValidId(workspaceId)) {
        ws.close(1008, 'Invalid parameter format');
        return;
      }

      // Generate unique client ID
      const clientId = socketId;
      
      // Store client information
      const clientInfo = {
        ws,
        clientId,
        userId,
        projectId,
        workspaceId,
        clientIp,
        connectedAt: new Date(),
        lastSeen: new Date(),
        isAlive: true,
        messageCount: 0,
        bytesReceived: 0,
        bytesSent: 0
      };

      // Store in maps
      this.clients.set(clientId, clientInfo);
      
      // Track user connections
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId).add(clientId);
      
      ws.clientId = clientId;

      // Store in Redis for distributed tracking
      if (this.redisClient) {
        await this.storeConnectionInRedis(clientInfo);
      }

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
        serverTime: new Date().toISOString()
      });

      // Notify message handler about new connection
      await this.messageHandler.handleClientConnected(clientInfo);

      this.logger.info('WebSocket client connected', {
        clientId,
        userId,
        projectId,
        workspaceId,
        ip: clientIp,
        totalClients: this.clients.size,
        userConnections: this.userConnections.get(userId).size
      });

    } catch (error) {
      this.logger.error('Failed to handle WebSocket connection', error);
      ws.close(1011, 'Internal server error');
    }
  }

  setupClientHandlers(ws, clientInfo) {
    // Message handler with validation
    ws.on('message', async (data) => {
      try {
        clientInfo.lastSeen = new Date();
        clientInfo.isAlive = true;
        clientInfo.messageCount++;
        clientInfo.bytesReceived += data.length;

        // Check message rate limit
        const rateLimitCheck = await this.rateLimiter.checkMessage(
          clientInfo.clientId,
          clientInfo.userId
        );
        
        if (!rateLimitCheck.allowed) {
          this.sendToClient(clientInfo.clientId, {
            type: 'error',
            code: 'RATE_LIMIT',
            message: rateLimitCheck.reason,
            retryAfter: rateLimitCheck.retryAfter
          });
          return;
        }

        // Parse and validate message
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (parseError) {
          this.sendToClient(clientInfo.clientId, {
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Invalid JSON format'
          });
          return;
        }

        // Validate message structure
        if (!this.validateMessage(message)) {
          this.sendToClient(clientInfo.clientId, {
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Invalid message structure'
          });
          return;
        }

        // Add client context to message
        message.clientId = clientInfo.clientId;
        message.userId = clientInfo.userId;
        message.projectId = clientInfo.projectId;
        message.workspaceId = clientInfo.workspaceId;
        message.timestamp = new Date().toISOString();

        // Forward to message handler
        await this.messageHandler.handleMessage(message, clientInfo);

      } catch (error) {
        this.logger.error('Failed to handle WebSocket message', {
          error: error.message,
          clientId: clientInfo.clientId,
          userId: clientInfo.userId
        });

        this.sendToClient(clientInfo.clientId, {
          type: 'error',
          code: 'PROCESSING_ERROR',
          message: 'Failed to process message'
        });
      }
    });

    // Pong handler for heartbeat
    ws.on('pong', () => {
      clientInfo.isAlive = true;
      clientInfo.lastSeen = new Date();
    });

    // Close handler
    ws.on('close', async (code, reason) => {
      await this.handleClientDisconnect(clientInfo, code, reason?.toString());
    });

    // Error handler
    ws.on('error', (error) => {
      this.logger.error('WebSocket client error', {
        error: error.message,
        clientId: clientInfo.clientId,
        userId: clientInfo.userId
      });
    });
  }

  async handleClientDisconnect(clientInfo, code, reason) {
    try {
      const { clientId, userId, projectId } = clientInfo;

      // Remove from room
      await this.roomManager.leaveRoom(projectId, clientId);

      // Remove from rate limiter
      await this.rateLimiter.removeConnection(clientId);

      // Remove from Redis
      if (this.redisClient) {
        await this.removeConnectionFromRedis(clientId);
      }

      // Remove from user connections
      const userConns = this.userConnections.get(userId);
      if (userConns) {
        userConns.delete(clientId);
        if (userConns.size === 0) {
          this.userConnections.delete(userId);
        }
      }

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
        sessionDuration: Date.now() - clientInfo.connectedAt.getTime(),
        messagesReceived: clientInfo.messageCount,
        bytesReceived: clientInfo.bytesReceived,
        bytesSent: clientInfo.bytesSent,
        totalClients: this.clients.size
      });

    } catch (error) {
      this.logger.error('Failed to handle client disconnect', error);
    }
  }

  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds
      const toTerminate = [];

      this.clients.forEach((clientInfo, clientId) => {
        if (!clientInfo.isAlive) {
          toTerminate.push(clientInfo);
          return;
        }

        // Check if client is stale
        if (now - clientInfo.lastSeen.getTime() > timeout * 2) {
          toTerminate.push(clientInfo);
          return;
        }

        clientInfo.isAlive = false;
        try {
          clientInfo.ws.ping();
        } catch (error) {
          this.logger.error('Failed to ping client', { clientId, error: error.message });
          toTerminate.push(clientInfo);
        }
      });

      // Terminate stale connections
      for (const clientInfo of toTerminate) {
        this.logger.info('Terminating inactive WebSocket connection', {
          clientId: clientInfo.clientId,
          userId: clientInfo.userId
        });
        try {
          clientInfo.ws.terminate();
        } catch (error) {
          this.logger.error('Error terminating connection', {
            clientId: clientInfo.clientId,
            error: error.message
          });
        }
      }
    }, 30000);
  }

  setupMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getStats();
      this.logger.info('WebSocket metrics', metrics);
    }, 60000); // Every minute
  }

  // Message validation
  validateMessage(message) {
    // Check required fields
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.type || typeof message.type !== 'string') {
      return false;
    }

    // Validate message type length
    if (message.type.length > 100) {
      return false;
    }

    // Check for potential injection attacks
    if (this.containsSuspiciousContent(message)) {
      this.logger.warn('Suspicious message content detected', { message });
      return false;
    }

    return true;
  }

  containsSuspiciousContent(obj) {
    const suspicious = ['$where', '$regex', 'function', 'constructor', '__proto__'];
    const json = JSON.stringify(obj);
    return suspicious.some(pattern => json.includes(pattern));
  }

  isValidId(id) {
    // MongoDB ObjectId pattern or UUID pattern
    const objectIdPattern = /^[a-f\d]{24}$/i;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const simpleIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
    
    return objectIdPattern.test(id) || uuidPattern.test(id) || simpleIdPattern.test(id);
  }

  // Redis session management for scaling
  async storeConnectionInRedis(clientInfo) {
    if (!this.redisClient) return;
    
    try {
      const key = `ws:session:${clientInfo.clientId}`;
      const data = {
        userId: clientInfo.userId,
        projectId: clientInfo.projectId,
        workspaceId: clientInfo.workspaceId,
        connectedAt: clientInfo.connectedAt.toISOString(),
        serverId: process.env.SERVER_ID || 'default'
      };
      
      await this.redisClient.setex(key, 3600, JSON.stringify(data));
      
      // Add to user's session set
      const userKey = `ws:user:sessions:${clientInfo.userId}`;
      await this.redisClient.sadd(userKey, clientInfo.clientId);
      await this.redisClient.expire(userKey, 3600);
    } catch (error) {
      this.logger.error('Failed to store connection in Redis', error);
    }
  }

  async removeConnectionFromRedis(clientId) {
    if (!this.redisClient) return;
    
    try {
      const key = `ws:session:${clientId}`;
      const data = await this.redisClient.get(key);
      
      if (data) {
        const session = JSON.parse(data);
        const userKey = `ws:user:sessions:${session.userId}`;
        await this.redisClient.srem(userKey, clientId);
      }
      
      await this.redisClient.del(key);
    } catch (error) {
      this.logger.error('Failed to remove connection from Redis', error);
    }
  }

  // Public methods for sending messages
  sendToClient(clientId, message) {
    const clientInfo = this.clients.get(clientId);
    if (!clientInfo || clientInfo.ws.readyState !== clientInfo.ws.OPEN) {
      this.logger.warn('Cannot send message to client: not connected', { clientId });
      return false;
    }

    try {
      const messageStr = JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      });
      
      clientInfo.ws.send(messageStr);
      clientInfo.bytesSent += messageStr.length;
      return true;
    } catch (error) {
      this.logger.error('Failed to send message to client', { 
        clientId, 
        error: error.message 
      });
      return false;
    }
  }

  sendToUser(userId, projectId, message) {
    let sent = 0;
    const userConns = this.userConnections.get(userId);
    
    if (!userConns) {
      this.logger.warn('No connections found for user', { userId });
      return 0;
    }
    
    for (const clientId of userConns) {
      const clientInfo = this.clients.get(clientId);
      if (clientInfo && clientInfo.projectId === projectId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    }

    return sent;
  }

  broadcastToProject(projectId, message, excludeUserId = null) {
    let sent = 0;

    for (const [clientId, clientInfo] of this.clients) {
      if (clientInfo.projectId === projectId && 
          clientInfo.userId !== excludeUserId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    }

    this.logger.debug('Broadcast message to project', { 
      projectId, 
      recipientCount: sent,
      excludeUserId 
    });

    return sent;
  }

  // Health check and statistics
  healthCheck() {
    const totalClients = this.clients.size;
    const activeClients = Array.from(this.clients.values())
      .filter(client => client.isAlive).length;

    return {
      status: 'healthy',
      totalConnections: totalClients,
      activeConnections: activeClients,
      userCount: this.userConnections.size,
      uptime: Date.now() - this.startTime,
      memoryUsage: process.memoryUsage()
    };
  }

  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      activeConnections: 0,
      totalUsers: this.userConnections.size,
      connectionsByProject: {},
      connectionsByWorkspace: {},
      messageStats: {
        totalMessages: 0,
        totalBytesReceived: 0,
        totalBytesSent: 0
      }
    };

    for (const clientInfo of this.clients.values()) {
      if (clientInfo.isAlive) stats.activeConnections++;
      
      stats.connectionsByProject[clientInfo.projectId] = 
        (stats.connectionsByProject[clientInfo.projectId] || 0) + 1;
      
      stats.connectionsByWorkspace[clientInfo.workspaceId] = 
        (stats.connectionsByWorkspace[clientInfo.workspaceId] || 0) + 1;
      
      stats.messageStats.totalMessages += clientInfo.messageCount;
      stats.messageStats.totalBytesReceived += clientInfo.bytesReceived;
      stats.messageStats.totalBytesSent += clientInfo.bytesSent;
    }

    return stats;
  }

  async shutdown() {
    this.logger.info('Shutting down WebSocket Manager...');

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Destroy rate limiter
    if (this.rateLimiter) {
      this.rateLimiter.destroy();
    }

    // Close all client connections gracefully
    const closePromises = Array.from(this.clients.values()).map(clientInfo => {
      return new Promise((resolve) => {
        clientInfo.ws.close(1001, 'Server shutting down');
        clientInfo.ws.once('close', resolve);
        setTimeout(resolve, 1000); // Force resolve after 1 second
      });
    });

    await Promise.allSettled(closePromises);

    // Close WebSocket server
    if (this.wss) {
      await new Promise((resolve) => {
        this.wss.close(resolve);
      });
    }

    // Clear maps
    this.clients.clear();
    this.userConnections.clear();
    
    this.logger.info('WebSocket Manager shut down completed');
  }
}

export { WebSocketManager };