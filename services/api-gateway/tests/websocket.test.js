// ==========================================
// API GATEWAY - WebSocket Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketServer } from 'ws';
import { WebSocketManager } from '../src/websocket/websocket-manager.js';
import jwt from 'jsonwebtoken';

describe('WebSocket Manager', () => {
  let wsManager;
  let mockServer;
  let mockLogger;
  let mockEventEmitter;
  let mockClient;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockEventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    };

    mockServer = {
      on: jest.fn(),
      clients: new Set(),
      handleUpgrade: jest.fn()
    };

    mockClient = {
      id: 'client_123',
      userId: 'user_123',
      workspaceId: 'workspace_123',
      send: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      readyState: 1, // OPEN
      isAlive: true
    };

    wsManager = new WebSocketManager(mockLogger, mockEventEmitter);
    wsManager.wss = mockServer;
  });

  describe('Connection Management', () => {
    it('should handle new WebSocket connection', async () => {
      const token = jwt.sign(
        { id: 'user_123', workspaceId: 'workspace_123' },
        'test-secret'
      );

      await wsManager.handleConnection(mockClient, { token });

      expect(wsManager.clients.has('client_123')).toBe(true);
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'connection',
          status: 'connected',
          clientId: 'client_123'
        })
      );
    });

    it('should reject connection with invalid token', async () => {
      await wsManager.handleConnection(mockClient, { token: 'invalid' });

      expect(mockClient.close).toHaveBeenCalledWith(1008, 'Invalid authentication');
      expect(wsManager.clients.has('client_123')).toBe(false);
    });

    it('should handle client disconnection', () => {
      wsManager.clients.set('client_123', mockClient);
      wsManager.userConnections.set('user_123', new Set(['client_123']));

      wsManager.handleDisconnection('client_123');

      expect(wsManager.clients.has('client_123')).toBe(false);
      expect(wsManager.userConnections.get('user_123').has('client_123')).toBe(false);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('websocket.disconnected', {
        clientId: 'client_123',
        userId: 'user_123'
      });
    });

    it('should enforce connection limits per user', async () => {
      const MAX_CONNECTIONS = 5;
      wsManager.maxConnectionsPerUser = MAX_CONNECTIONS;

      // Add max connections
      for (let i = 0; i < MAX_CONNECTIONS; i++) {
        const client = { ...mockClient, id: `client_${i}` };
        wsManager.clients.set(`client_${i}`, client);
        wsManager.addUserConnection('user_123', `client_${i}`);
      }

      // Try to add one more
      const newClient = { ...mockClient, id: 'client_new', close: jest.fn() };
      await wsManager.handleConnection(newClient, { userId: 'user_123' });

      expect(newClient.close).toHaveBeenCalledWith(1008, 'Connection limit exceeded');
    });
  });

  describe('Message Handling', () => {
    it('should route messages to appropriate handlers', async () => {
      const message = {
        type: 'flow.update',
        data: { flowId: 'flow_123', changes: {} }
      };

      wsManager.messageHandlers.set('flow.update', jest.fn());
      await wsManager.handleMessage('client_123', JSON.stringify(message));

      expect(wsManager.messageHandlers.get('flow.update')).toHaveBeenCalledWith(
        'client_123',
        message.data
      );
    });

    it('should handle broadcast messages', () => {
      const clients = [
        { ...mockClient, id: 'client_1', workspaceId: 'workspace_123' },
        { ...mockClient, id: 'client_2', workspaceId: 'workspace_123' },
        { ...mockClient, id: 'client_3', workspaceId: 'workspace_456' }
      ];

      clients.forEach(c => wsManager.clients.set(c.id, c));

      wsManager.broadcastToWorkspace('workspace_123', {
        type: 'notification',
        data: { message: 'Test broadcast' }
      });

      expect(clients[0].send).toHaveBeenCalled();
      expect(clients[1].send).toHaveBeenCalled();
      expect(clients[2].send).not.toHaveBeenCalled();
    });

    it('should handle direct messages to user', () => {
      wsManager.clients.set('client_123', mockClient);
      wsManager.userConnections.set('user_123', new Set(['client_123']));

      wsManager.sendToUser('user_123', {
        type: 'direct',
        data: { message: 'Direct message' }
      });

      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'direct',
          data: { message: 'Direct message' }
        })
      );
    });

    it('should validate message size', async () => {
      const largeMessage = { data: 'x'.repeat(1024 * 1024) }; // 1MB
      wsManager.maxMessageSize = 512 * 1024; // 512KB

      const result = await wsManager.handleMessage(
        'client_123',
        JSON.stringify(largeMessage)
      );

      expect(result).toMatchObject({
        error: 'Message too large'
      });
    });
  });

  describe('Room Management', () => {
    it('should allow clients to join rooms', () => {
      wsManager.joinRoom('client_123', 'room_flow_123');

      expect(wsManager.rooms.has('room_flow_123')).toBe(true);
      expect(wsManager.rooms.get('room_flow_123').has('client_123')).toBe(true);
    });

    it('should allow clients to leave rooms', () => {
      wsManager.rooms.set('room_flow_123', new Set(['client_123', 'client_456']));
      
      wsManager.leaveRoom('client_123', 'room_flow_123');

      expect(wsManager.rooms.get('room_flow_123').has('client_123')).toBe(false);
      expect(wsManager.rooms.get('room_flow_123').size).toBe(1);
    });

    it('should broadcast to room members', () => {
      const roomClients = [
        { ...mockClient, id: 'client_1' },
        { ...mockClient, id: 'client_2' }
      ];

      roomClients.forEach(c => {
        wsManager.clients.set(c.id, c);
        wsManager.joinRoom(c.id, 'room_flow_123');
      });

      wsManager.broadcastToRoom('room_flow_123', {
        type: 'room.update',
        data: { update: 'test' }
      });

      roomClients.forEach(c => {
        expect(c.send).toHaveBeenCalled();
      });
    });

    it('should clean up empty rooms', () => {
      wsManager.rooms.set('room_empty', new Set());
      wsManager.rooms.set('room_active', new Set(['client_123']));

      wsManager.cleanupEmptyRooms();

      expect(wsManager.rooms.has('room_empty')).toBe(false);
      expect(wsManager.rooms.has('room_active')).toBe(true);
    });
  });

  describe('Heartbeat & Health', () => {
    it('should send ping to all clients', () => {
      const clients = [
        { ...mockClient, id: 'client_1', ping: jest.fn() },
        { ...mockClient, id: 'client_2', ping: jest.fn() }
      ];

      clients.forEach(c => wsManager.clients.set(c.id, c));

      wsManager.sendHeartbeat();

      clients.forEach(c => {
        expect(c.ping).toHaveBeenCalled();
      });
    });

    it('should terminate dead connections', () => {
      const deadClient = {
        ...mockClient,
        id: 'client_dead',
        isAlive: false,
        terminate: jest.fn()
      };

      wsManager.clients.set('client_dead', deadClient);

      wsManager.checkClientHealth();

      expect(deadClient.terminate).toHaveBeenCalled();
      expect(wsManager.clients.has('client_dead')).toBe(false);
    });

    it('should handle pong responses', () => {
      mockClient.isAlive = false;
      wsManager.clients.set('client_123', mockClient);

      wsManager.handlePong('client_123');

      expect(wsManager.clients.get('client_123').isAlive).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce message rate limits', async () => {
      wsManager.messageRateLimit = {
        windowMs: 1000,
        maxMessages: 5
      };

      // Send messages up to limit
      for (let i = 0; i < 5; i++) {
        await wsManager.handleMessage('client_123', JSON.stringify({ type: 'test' }));
      }

      // Exceed limit
      const result = await wsManager.handleMessage('client_123', JSON.stringify({ type: 'test' }));

      expect(result).toMatchObject({
        error: 'Rate limit exceeded'
      });
    });

    it('should track rate limit per client', () => {
      wsManager.clientMessageCounts.set('client_123', {
        count: 10,
        resetTime: Date.now() + 1000
      });

      wsManager.clientMessageCounts.set('client_456', {
        count: 2,
        resetTime: Date.now() + 1000
      });

      expect(wsManager.isRateLimited('client_123')).toBe(true);
      expect(wsManager.isRateLimited('client_456')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON messages', async () => {
      const result = await wsManager.handleMessage('client_123', 'not valid json');

      expect(result).toMatchObject({
        error: 'Invalid message format'
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle client errors', () => {
      const error = new Error('WebSocket error');
      wsManager.clients.set('client_123', mockClient);

      wsManager.handleClientError('client_123', error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket client error',
        expect.objectContaining({
          clientId: 'client_123',
          error: error.message
        })
      );
    });

    it('should recover from broadcast failures', () => {
      const failingClient = {
        ...mockClient,
        id: 'client_fail',
        send: jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        })
      };

      const workingClient = { ...mockClient, id: 'client_work' };

      wsManager.clients.set('client_fail', failingClient);
      wsManager.clients.set('client_work', workingClient);

      wsManager.broadcast({ type: 'test' });

      expect(workingClient.send).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Metrics & Monitoring', () => {
    it('should track connection metrics', () => {
      wsManager.metrics = {
        totalConnections: 0,
        activeConnections: 0,
        messagesReceived: 0,
        messagesSent: 0
      };

      wsManager.updateMetrics('connection');
      wsManager.updateMetrics('message.received');
      wsManager.updateMetrics('message.sent');

      expect(wsManager.metrics.totalConnections).toBe(1);
      expect(wsManager.metrics.messagesReceived).toBe(1);
      expect(wsManager.metrics.messagesSent).toBe(1);
    });

    it('should provide health status', () => {
      wsManager.clients.set('client_1', mockClient);
      wsManager.clients.set('client_2', mockClient);

      const health = wsManager.getHealthStatus();

      expect(health).toMatchObject({
        status: 'healthy',
        activeConnections: 2,
        rooms: 0,
        uptime: expect.any(Number)
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    wsManager.cleanup();
  });
});