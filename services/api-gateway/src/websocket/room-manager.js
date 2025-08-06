// ==========================================
// SERVICES/API-GATEWAY/src/websocket/room-manager.js
// ==========================================

class RoomManager {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    
    // In-memory room management for this gateway instance
    this.rooms = new Map(); // roomId -> Set of clientIds
    this.clientToRooms = new Map(); // clientId -> Set of roomIds
    this.clientCallbacks = new Map(); // clientId -> callback function
    
    // Redis keys for cross-gateway synchronization
    this.ROOM_PREFIX = 'room:';
    this.USER_PREFIX = 'user:';
  }

  // Register a callback function for sending messages to specific clients
  registerClientCallback(clientId, callback) {
    this.clientCallbacks.set(clientId, callback);
  }

  unregisterClientCallback(clientId) {
    this.clientCallbacks.delete(clientId);
  }

  async joinRoom(roomId, clientId, userId) {
    try {
      // Add to local room
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId).add(clientId);

      // Track client rooms
      if (!this.clientToRooms.has(clientId)) {
        this.clientToRooms.set(clientId, new Set());
      }
      this.clientToRooms.get(clientId).add(roomId);

      // Update Redis for cross-gateway synchronization
      await this.redisClient.set(
        `${this.USER_PREFIX}${userId}:${clientId}`,
        {
          roomId,
          userId,
          gatewayId: process.env.GATEWAY_ID || 'gateway-1',
          joinedAt: new Date().toISOString(),
        },
        3600 // 1 hour TTL
      );

      // Add to Redis room set
      const redisRoomKey = `${this.ROOM_PREFIX}${roomId}`;
      await this.redisClient.client.sadd(redisRoomKey, `${userId}:${clientId}`);
      await this.redisClient.client.expire(redisRoomKey, 3600);

      this.logger.debug('Client joined room', {
        roomId,
        clientId,
        userId,
        roomSize: this.rooms.get(roomId).size,
      });

      // Notify other clients in the room about new member
      await this.broadcastToRoom(roomId, {
        type: 'room_member_joined',
        userId,
        roomId,
        memberCount: this.rooms.get(roomId).size,
      }, clientId);

    } catch (error) {
      this.logger.error('Failed to join room', error, { roomId, clientId, userId });
      throw error;
    }
  }

  async leaveRoom(roomId, clientId) {
    try {
      // Remove from local room
      if (this.rooms.has(roomId)) {
        this.rooms.get(roomId).delete(clientId);
        
        // Clean up empty rooms
        if (this.rooms.get(roomId).size === 0) {
          this.rooms.delete(roomId);
        }
      }

      // Remove from client tracking
      if (this.clientToRooms.has(clientId)) {
        this.clientToRooms.get(clientId).delete(roomId);
        
        // Clean up if client has no rooms
        if (this.clientToRooms.get(clientId).size === 0) {
          this.clientToRooms.delete(clientId);
        }
      }

      // Get user info for Redis cleanup
      const userInfo = await this.redisClient.get(`${this.USER_PREFIX}*:${clientId}`);
      if (userInfo && userInfo.userId) {
        // Remove from Redis
        await this.redisClient.del(`${this.USER_PREFIX}${userInfo.userId}:${clientId}`);
        
        // Remove from Redis room set
        const redisRoomKey = `${this.ROOM_PREFIX}${roomId}`;
        await this.redisClient.client.srem(redisRoomKey, `${userInfo.userId}:${clientId}`);
        
        this.logger.debug('Client left room', {
          roomId,
          clientId,
          userId: userInfo.userId,
          remainingInRoom: this.rooms.get(roomId)?.size || 0,
        });

        // Notify other clients about member leaving
        await this.broadcastToRoom(roomId, {
          type: 'room_member_left',
          userId: userInfo.userId,
          roomId,
          memberCount: this.rooms.get(roomId)?.size || 0,
        }, clientId);
      }

    } catch (error) {
      this.logger.error('Failed to leave room', error, { roomId, clientId });
      // Don't throw - leaving room failure shouldn't break disconnection
    }
  }

  async leaveAllRooms(clientId) {
    const clientRooms = this.clientToRooms.get(clientId);
    if (!clientRooms) return;

    const leavePromises = Array.from(clientRooms).map(roomId => 
      this.leaveRoom(roomId, clientId)
    );

    await Promise.allSettled(leavePromises);
    
    // Clean up client callback
    this.unregisterClientCallback(clientId);
  }

  async broadcastToRoom(roomId, message, excludeClientId = null) {
    const room = this.rooms.get(roomId);
    if (!room || room.size === 0) {
      this.logger.debug('No clients in room to broadcast to', { roomId });
      return 0;
    }

    let sentCount = 0;
    const failedClients = [];

    // Send to local clients
    for (const clientId of room) {
      if (clientId === excludeClientId) continue;

      const callback = this.clientCallbacks.get(clientId);
      if (callback) {
        try {
          const success = callback(message);
          if (success) {
            sentCount++;
          } else {
            failedClients.push(clientId);
          }
        } catch (error) {
          this.logger.error('Failed to send message to client', error, { clientId, roomId });
          failedClients.push(clientId);
        }
      } else {
        failedClients.push(clientId);
      }
    }

    // Clean up failed clients
    for (const clientId of failedClients) {
      await this.leaveRoom(roomId, clientId);
    }

    // Also broadcast to other gateway instances via Redis pub/sub
    await this.broadcastToOtherGateways(roomId, message, excludeClientId);

    this.logger.debug('Broadcast to room completed', {
      roomId,
      totalClients: room.size,
      sentCount,
      failedCount: failedClients.length,
      excludeClientId,
    });

    return sentCount;
  }

  async broadcastToOtherGateways(roomId, message, excludeClientId = null) {
    try {
      const crossGatewayMessage = {
        type: 'cross_gateway_broadcast',
        roomId,
        message,
        excludeClientId,
        fromGateway: process.env.GATEWAY_ID || 'gateway-1',
        timestamp: new Date().toISOString(),
      };

      await this.redisClient.publish('gateway_broadcast', crossGatewayMessage);
    } catch (error) {
      this.logger.error('Failed to broadcast to other gateways', error, { roomId });
    }
  }

  async sendToClient(clientId, message) {
    const callback = this.clientCallbacks.get(clientId);
    if (callback) {
      return callback(message);
    }

    this.logger.warn('No callback registered for client', { clientId });
    return false;
  }

  // Get room statistics
  getRoomStats(roomId) {
    const room = this.rooms.get(roomId);
    return {
      roomId,
      localMembers: room ? room.size : 0,
      members: room ? Array.from(room) : [],
    };
  }

  getAllRoomStats() {
    const stats = {
      totalRooms: this.rooms.size,
      totalClients: this.clientToRooms.size,
      rooms: {},
    };

    this.rooms.forEach((clients, roomId) => {
      stats.rooms[roomId] = {
        memberCount: clients.size,
        members: Array.from(clients),
      };
    });

    return stats;
  }

  // Redis cross-gateway event handlers
  async setupCrossGatewayHandlers() {
    // Subscribe to cross-gateway broadcasts
    await this.redisClient.subscribe('gateway_broadcast', (message) => {
      this.handleCrossGatewayBroadcast(message);
    });

    this.logger.info('Cross-gateway event handlers setup completed');
  }

  async handleCrossGatewayBroadcast(crossGatewayMessage) {
    try {
      const { roomId, message, excludeClientId, fromGateway } = crossGatewayMessage;

      // Don't process messages from our own gateway
      if (fromGateway === (process.env.GATEWAY_ID || 'gateway-1')) {
        return;
      }

      // Broadcast to local clients in the room
      await this.broadcastToRoom(roomId, message, excludeClientId);

    } catch (error) {
      this.logger.error('Failed to handle cross-gateway broadcast', error);
    }
  }

  // Health check
  healthCheck() {
    return {
      status: 'ok',
      rooms: this.rooms.size,
      clients: this.clientToRooms.size,
      totalConnections: Array.from(this.rooms.values())
        .reduce((sum, room) => sum + room.size, 0),
    };
  }

  // Cleanup
  async cleanup() {
    this.logger.info('Cleaning up room manager...');
    
    // Clear all local data
    this.rooms.clear();
    this.clientToRooms.clear();
    this.clientCallbacks.clear();

    this.logger.info('Room manager cleanup completed');
  }
}

export { RoomManager };