// ==========================================
// Redis Event Bus for Inter-Service Communication
// ==========================================

import { EventEmitter } from 'events';

export class RedisEventBus extends EventEmitter {
  constructor(redisClient, logger, serviceName) {
    super();
    this.publisher = redisClient;
    this.subscriber = null;
    this.logger = logger;
    this.serviceName = serviceName;
    this.subscriptions = new Map();
    this.isConnected = false;
  }

  async initialize() {
    try {
      // Create a duplicate connection for subscriber (Redis requires separate connections)
      this.subscriber = this.publisher.duplicate();
      await this.subscriber.connect();
      
      // Setup message handler
      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      // Setup error handlers
      this.subscriber.on('error', (error) => {
        this.logger.error('Redis subscriber error', error);
      });

      this.publisher.on('error', (error) => {
        this.logger.error('Redis publisher error', error);
      });

      this.isConnected = true;
      this.logger.info(`Redis Event Bus initialized for service: ${this.serviceName}`);
    } catch (error) {
      this.logger.error('Failed to initialize Redis Event Bus', error);
      throw error;
    }
  }

  handleMessage(channel, message) {
    try {
      const event = JSON.parse(message);
      
      // Don't process our own events (prevent loops)
      if (event.emittedBy === this.serviceName) {
        return;
      }

      this.logger.debug('Received event from Redis', {
        channel,
        eventType: event.type,
        emittedBy: event.emittedBy,
        eventId: event.eventId
      });

      // Emit locally for handlers
      super.emit(event.type, event.data);

      // Also emit on the channel for channel-specific handlers
      super.emit(channel, event);
    } catch (error) {
      this.logger.error('Failed to handle Redis message', error, { channel, message });
    }
  }

  async subscribe(channel) {
    if (!this.isConnected) {
      throw new Error('Redis Event Bus not initialized');
    }

    try {
      await this.subscriber.subscribe(channel);
      this.subscriptions.set(channel, true);
      this.logger.info(`Subscribed to Redis channel: ${channel}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to channel: ${channel}`, error);
      throw error;
    }
  }

  async unsubscribe(channel) {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.subscriber.unsubscribe(channel);
      this.subscriptions.delete(channel);
      this.logger.info(`Unsubscribed from Redis channel: ${channel}`);
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from channel: ${channel}`, error);
    }
  }

  async publish(channel, eventType, data) {
    if (!this.isConnected) {
      throw new Error('Redis Event Bus not initialized');
    }

    const event = {
      type: eventType,
      data,
      emittedBy: this.serviceName,
      emittedAt: new Date().toISOString(),
      eventId: this.generateEventId()
    };

    try {
      await this.publisher.publish(channel, JSON.stringify(event));
      
      this.logger.debug('Published event to Redis', {
        channel,
        eventType,
        eventId: event.eventId
      });

      return event.eventId;
    } catch (error) {
      this.logger.error('Failed to publish event', error, { channel, eventType });
      throw error;
    }
  }

  // Convenience method to publish to service-specific channels
  async publishToService(targetService, eventType, data) {
    const channel = `${targetService}:events`;
    return this.publish(channel, eventType, data);
  }

  // Subscribe to events for this service
  async subscribeToServiceEvents() {
    const channel = `${this.serviceName}:events`;
    await this.subscribe(channel);
    
    // Also subscribe to broadcast channel
    await this.subscribe('broadcast:events');
  }

  // Broadcast to all services
  async broadcast(eventType, data) {
    return this.publish('broadcast:events', eventType, data);
  }

  generateEventId() {
    return `${this.serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async disconnect() {
    try {
      // Unsubscribe from all channels
      for (const channel of this.subscriptions.keys()) {
        await this.unsubscribe(channel);
      }

      // Disconnect subscriber
      if (this.subscriber) {
        await this.subscriber.disconnect();
      }

      this.isConnected = false;
      this.logger.info('Redis Event Bus disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Redis Event Bus', error);
    }
  }

  // Get metrics
  getMetrics() {
    return {
      isConnected: this.isConnected,
      subscriptions: Array.from(this.subscriptions.keys()),
      serviceName: this.serviceName
    };
  }
}

// Service channels mapping
export const ServiceChannels = {
  API_GATEWAY: 'api-gateway:events',
  COGNITIVE_CORE: 'cognitive-core:events',
  FLOW_SERVICE: 'flow-service:events',
  KNOWLEDGE_SERVICE: 'knowledge-service:events',
  BILLING_SERVICE: 'billing-service:events',
  USER_MANAGEMENT: 'user-management:events',
  BROADCAST: 'broadcast:events'
};

// Enhanced event types for inter-service communication
export const InterServiceEvents = {
  // Request-Response patterns
  REQUEST_AI_PROCESSING: 'request.ai.processing',
  RESPONSE_AI_PROCESSING: 'response.ai.processing',
  
  REQUEST_FLOW_UPDATE: 'request.flow.update',
  RESPONSE_FLOW_UPDATE: 'response.flow.update',
  
  REQUEST_KNOWLEDGE_QUERY: 'request.knowledge.query',
  RESPONSE_KNOWLEDGE_QUERY: 'response.knowledge.query',
  
  REQUEST_USER_VALIDATION: 'request.user.validation',
  RESPONSE_USER_VALIDATION: 'response.user.validation',
  
  REQUEST_CREDIT_CHECK: 'request.credit.check',
  RESPONSE_CREDIT_CHECK: 'response.credit.check',
  
  // Notifications
  NOTIFY_PAYMENT_SUCCESS: 'notify.payment.success',
  NOTIFY_PAYMENT_FAILED: 'notify.payment.failed',
  NOTIFY_CREDITS_LOW: 'notify.credits.low',
  NOTIFY_FLOW_UPDATED: 'notify.flow.updated',
  NOTIFY_USER_REGISTERED: 'notify.user.registered'
};