// ==========================================
// PACKAGES/COMMON/src/database/redis-client.js
// ==========================================
import { createClient } from 'redis';

class RedisClient {
  constructor(logger) {
    this.logger = logger;
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
  }

  async connect(url = process.env.REDIS_URL) {
    try {
      // Main client for general operations
      this.client = createClient({ url });
      await this.client.connect();

      // Separate clients for pub/sub
      this.subscriber = createClient({ url });
      this.publisher = createClient({ url });
      
      await this.subscriber.connect();
      await this.publisher.connect();

      this.isConnected = true;
      this.logger.info('Redis connected successfully');

      // Error handling
      this.client.on('error', (error) => {
        this.logger.error('Redis client error', error);
      });

      return this.client;
    } catch (error) {
      this.logger.error('Redis connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    this.isConnected = false;
    this.logger.info('Redis disconnected');
  }

  // Pub/Sub operations
  async publish(channel, message) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    const result = await this.publisher.publish(channel, messageStr);
    
    this.logger.debug('Message published', {
      channel,
      subscribers: result,
      messageSize: messageStr.length,
    });
    
    return result;
  }

  async subscribe(channel, callback) {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        this.logger.debug('Message received', {
          channel,
          messageType: typeof parsedMessage,
        });
        callback(parsedMessage);
      } catch (error) {
        this.logger.error('Failed to parse received message', error, {
          channel,
          rawMessage: message,
        });
        callback(message); // Fallback to raw message
      }
    });

    this.logger.info('Subscribed to channel', { channel });
  }

  // Caching operations
  async get(key) {
    const value = await this.client.get(key);
    this.logger.debug('Cache get', { key, found: !!value });
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, ttl = 3600) {
    const valueStr = JSON.stringify(value);
    await this.client.setEx(key, ttl, valueStr);
    this.logger.debug('Cache set', { key, ttl, size: valueStr.length });
  }

  async del(key) {
    const result = await this.client.del(key);
    this.logger.debug('Cache delete', { key, deleted: result });
    return result;
  }

  // Health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;
      return { status: 'ok', latency };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return { status: 'error', error: error.message };
    }
  }
}

export { RedisClient };