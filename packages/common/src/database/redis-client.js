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
      // Enhanced connection options for production
      const connectionOptions = {
        url,
        // Connection pool settings
        socket: {
          connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000,
          commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
          lazyConnect: false,
          keepAlive: true,
          noDelay: true,
        },
        // Retry strategy
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 300,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        // Connection pool
        maxLoadingTimeout: parseInt(process.env.REDIS_MAX_LOADING_TIMEOUT) || 2000,
      };

      // Main client for general operations
      this.client = createClient(connectionOptions);
      
      // Set up connection monitoring for main client
      this.setupConnectionMonitoring(this.client, 'main');
      
      await this.client.connect();

      // Separate clients for pub/sub with optimized settings
      const pubSubOptions = {
        ...connectionOptions,
        socket: {
          ...connectionOptions.socket,
          // Pub/Sub clients need longer timeouts for blocking operations
          commandTimeout: parseInt(process.env.REDIS_PUBSUB_TIMEOUT) || 30000,
        }
      };

      this.subscriber = createClient(pubSubOptions);
      this.publisher = createClient(pubSubOptions);
      
      this.setupConnectionMonitoring(this.subscriber, 'subscriber');
      this.setupConnectionMonitoring(this.publisher, 'publisher');
      
      await this.subscriber.connect();
      await this.publisher.connect();

      this.isConnected = true;
      this.logger.info('Redis connected successfully with enhanced connection pooling', {
        connectTimeout: connectionOptions.socket.connectTimeout,
        commandTimeout: connectionOptions.socket.commandTimeout,
        maxRetriesPerRequest: connectionOptions.maxRetriesPerRequest,
        pubSubTimeout: pubSubOptions.socket.commandTimeout,
      });

      return this.client;
    } catch (error) {
      this.logger.error('Redis connection failed', error);
      throw error;
    }
  }

  setupConnectionMonitoring(client, clientType) {
    if (!client) return;

    client.on('connect', () => {
      this.logger.debug(`Redis ${clientType} client connecting`);
    });

    client.on('ready', () => {
      this.logger.info(`Redis ${clientType} client ready`);
    });

    client.on('error', (error) => {
      this.logger.error(`Redis ${clientType} client error`, error);
    });

    client.on('end', () => {
      this.logger.warn(`Redis ${clientType} client connection ended`);
    });

    client.on('reconnecting', () => {
      this.logger.warn(`Redis ${clientType} client reconnecting`);
    });
  }

  async disconnect() {
    if (this.client) await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    this.isConnected = false;
    this.logger.info('Redis disconnected gracefully');
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

  // Enhanced health check with connection info
  async healthCheck() {
    try {
      const start = Date.now();
      const [pingResult, info] = await Promise.all([
        this.client.ping(),
        this.getConnectionInfo()
      ]);
      const latency = Date.now() - start;
      
      return { 
        status: 'ok', 
        latency,
        ping: pingResult,
        connections: {
          main: this.client?.isReady || false,
          subscriber: this.subscriber?.isReady || false,
          publisher: this.publisher?.isReady || false,
        },
        info
      };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return { status: 'error', error: error.message };
    }
  }

  // Get Redis connection and server information
  async getConnectionInfo() {
    try {
      if (!this.client?.isReady) {
        return { available: false };
      }

      const info = await this.client.info('server');
      const memory = await this.client.info('memory');
      const clients = await this.client.info('clients');
      
      // Parse info strings
      const serverInfo = this.parseRedisInfo(info);
      const memoryInfo = this.parseRedisInfo(memory);
      const clientsInfo = this.parseRedisInfo(clients);

      return {
        available: true,
        server: {
          version: serverInfo.redis_version,
          uptime: parseInt(serverInfo.uptime_in_seconds),
          mode: serverInfo.redis_mode,
        },
        memory: {
          used: parseInt(memoryInfo.used_memory),
          peak: parseInt(memoryInfo.used_memory_peak),
          fragmentation_ratio: parseFloat(memoryInfo.mem_fragmentation_ratio),
        },
        clients: {
          connected: parseInt(clientsInfo.connected_clients),
          blocked: parseInt(clientsInfo.blocked_clients),
          maxclients: parseInt(clientsInfo.maxclients),
        },
      };
    } catch (error) {
      this.logger.warn('Failed to get Redis connection info', error);
      return { available: false, error: error.message };
    }
  }

  // Parse Redis INFO command output
  parseRedisInfo(infoString) {
    const lines = infoString.split('\r\n');
    const info = {};
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          info[key] = value;
        }
      }
    }
    
    return info;
  }
}

export { RedisClient };