/**
 * Performance Optimization Utilities
 * Caching, memoization, debouncing, and other performance enhancements
 */

import crypto from 'crypto';

/**
 * LRU Cache implementation
 */
export class LRUCache {
  constructor(maxSize = 100, ttl = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }
    
    const item = this.cache.get(key);
    
    // Check TTL
    if (item.expiry && Date.now() > item.expiry) {
      this.delete(key);
      return null;
    }
    
    // Update access order
    this.accessOrder.delete(key);
    this.accessOrder.set(key, Date.now());
    
    return item.value;
  }

  set(key, value, customTtl = null) {
    // Remove oldest item if at capacity
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      const oldestKey = this.accessOrder.keys().next().value;
      this.delete(oldestKey);
    }
    
    const ttl = customTtl || this.ttl;
    const expiry = ttl ? Date.now() + ttl : null;
    
    this.cache.set(key, { value, expiry });
    this.accessOrder.set(key, Date.now());
  }

  delete(key) {
    this.cache.delete(key);
    this.accessOrder.delete(key);
  }

  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  size() {
    return this.cache.size;
  }
}

/**
 * Memoization decorator
 */
export function memoize(fn, options = {}) {
  const {
    maxSize = 100,
    ttl = 3600000,
    keyGenerator = (...args) => JSON.stringify(args)
  } = options;
  
  const cache = new LRUCache(maxSize, ttl);
  
  return async function(...args) {
    const key = keyGenerator(...args);
    
    let result = cache.get(key);
    if (result !== null) {
      return result;
    }
    
    result = await fn.apply(this, args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * Debounce function execution
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  let lastArgs;
  let lastThis;
  let lastCallTime;
  
  const debounced = function(...args) {
    lastArgs = args;
    lastThis = this;
    lastCallTime = Date.now();
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn.apply(lastThis, lastArgs);
      timeoutId = null;
    }, delay);
  };
  
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      fn.apply(lastThis, lastArgs);
      timeoutId = null;
    }
  };
  
  return debounced;
}

/**
 * Throttle function execution
 */
export function throttle(fn, limit = 100) {
  let inThrottle;
  let lastResult;
  
  return function(...args) {
    if (!inThrottle) {
      lastResult = fn.apply(this, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    
    return lastResult;
  };
}

/**
 * Batch operations for efficiency
 */
export class BatchProcessor {
  constructor(processFn, options = {}) {
    this.processFn = processFn;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 1000;
    this.batch = [];
    this.flushTimer = null;
  }

  add(item) {
    this.batch.push(item);
    
    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  async flush() {
    if (this.batch.length === 0) {
      return;
    }
    
    const items = this.batch.splice(0);
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    try {
      await this.processFn(items);
    } catch (error) {
      console.error('Batch processing failed:', error);
      // Re-add items to batch for retry
      this.batch.unshift(...items);
    }
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flush();
  }
}

/**
 * Connection pool for database connections
 */
export class ConnectionPool {
  constructor(createConnection, options = {}) {
    this.createConnection = createConnection;
    this.minSize = options.minSize || 2;
    this.maxSize = options.maxSize || 10;
    this.acquireTimeout = options.acquireTimeout || 30000;
    this.idleTimeout = options.idleTimeout || 60000;
    this.pool = [];
    this.activeConnections = new Set();
    this.waitingQueue = [];
    
    // Initialize minimum connections
    this.initialize();
  }

  async initialize() {
    const promises = [];
    for (let i = 0; i < this.minSize; i++) {
      promises.push(this.createNewConnection());
    }
    
    const connections = await Promise.all(promises);
    connections.forEach(conn => this.pool.push(conn));
  }

  async acquire() {
    // Try to get from pool
    while (this.pool.length > 0) {
      const connection = this.pool.pop();
      
      if (await this.validateConnection(connection)) {
        this.activeConnections.add(connection);
        return connection;
      }
    }
    
    // Create new connection if under limit
    if (this.activeConnections.size < this.maxSize) {
      const connection = await this.createNewConnection();
      this.activeConnections.add(connection);
      return connection;
    }
    
    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.indexOf(resolver);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection acquire timeout'));
      }, this.acquireTimeout);
      
      const resolver = (connection) => {
        clearTimeout(timeout);
        resolve(connection);
      };
      
      this.waitingQueue.push(resolver);
    });
  }

  release(connection) {
    this.activeConnections.delete(connection);
    
    // Give to waiting request or return to pool
    if (this.waitingQueue.length > 0) {
      const resolver = this.waitingQueue.shift();
      this.activeConnections.add(connection);
      resolver(connection);
    } else if (this.pool.length < this.maxSize) {
      this.pool.push(connection);
      
      // Set idle timeout
      setTimeout(() => {
        const index = this.pool.indexOf(connection);
        if (index > -1 && this.pool.length > this.minSize) {
          this.pool.splice(index, 1);
          this.closeConnection(connection);
        }
      }, this.idleTimeout);
    } else {
      this.closeConnection(connection);
    }
  }

  async createNewConnection() {
    return await this.createConnection();
  }

  async validateConnection(connection) {
    try {
      // Implement connection validation logic
      return connection && connection.isValid && await connection.ping();
    } catch {
      return false;
    }
  }

  async closeConnection(connection) {
    try {
      if (connection && connection.close) {
        await connection.close();
      }
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }

  async destroy() {
    // Close all connections
    const allConnections = [...this.pool, ...this.activeConnections];
    await Promise.all(allConnections.map(conn => this.closeConnection(conn)));
    
    this.pool = [];
    this.activeConnections.clear();
    this.waitingQueue = [];
  }
}

/**
 * Query result caching
 */
export class QueryCache {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.keyPrefix = options.keyPrefix || 'query:';
  }

  generateKey(query, params) {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ query, params }))
      .digest('hex');
    
    return `${this.keyPrefix}${hash}`;
  }

  async get(query, params) {
    const key = this.generateKey(query, params);
    const cached = await this.redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }

  async set(query, params, result, ttl = null) {
    const key = this.generateKey(query, params);
    const expiry = ttl || this.defaultTTL;
    
    await this.redis.setex(key, expiry, JSON.stringify(result));
  }

  async invalidate(pattern) {
    const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Lazy loading wrapper
 */
export function lazyLoad(loader) {
  let instance = null;
  let loading = null;
  
  return async function() {
    if (instance) {
      return instance;
    }
    
    if (loading) {
      return await loading;
    }
    
    loading = loader();
    instance = await loading;
    loading = null;
    
    return instance;
  };
}

/**
 * Parallel execution with concurrency limit
 */
export async function parallelLimit(tasks, limit = 5) {
  const results = [];
  const executing = [];
  
  for (const task of tasks) {
    const promise = Promise.resolve().then(() => task());
    results.push(promise);
    
    if (tasks.length >= limit) {
      executing.push(promise);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
        executing.splice(0, 1);
      }
    }
  }
  
  return Promise.all(results);
}

/**
 * Resource pooling for expensive objects
 */
export class ResourcePool {
  constructor(factory, validator, options = {}) {
    this.factory = factory;
    this.validator = validator;
    this.resources = [];
    this.maxSize = options.maxSize || 10;
    this.minSize = options.minSize || 2;
    this.acquireTimeout = options.acquireTimeout || 30000;
  }

  async acquire() {
    // Try to get valid resource from pool
    while (this.resources.length > 0) {
      const resource = this.resources.pop();
      
      if (await this.validator(resource)) {
        return resource;
      }
    }
    
    // Create new resource
    return await this.factory();
  }

  async release(resource) {
    if (this.resources.length < this.maxSize && await this.validator(resource)) {
      this.resources.push(resource);
    }
  }

  async drain() {
    this.resources = [];
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  constructor(logger) {
    this.logger = logger;
    this.metrics = new Map();
  }

  startTimer(operation) {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    this.metrics.set(id, {
      operation,
      startTime: process.hrtime.bigint()
    });
    
    return id;
  }

  endTimer(id, metadata = {}) {
    const metric = this.metrics.get(id);
    
    if (!metric) {
      return;
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - metric.startTime) / 1000000; // Convert to milliseconds
    
    this.metrics.delete(id);
    
    this.logger.debug('Performance metric', {
      operation: metric.operation,
      duration,
      ...metadata
    });
    
    return duration;
  }

  async measure(operation, fn) {
    const id = this.startTimer(operation);
    
    try {
      const result = await fn();
      this.endTimer(id, { status: 'success' });
      return result;
    } catch (error) {
      this.endTimer(id, { status: 'error', error: error.message });
      throw error;
    }
  }
}

export default {
  LRUCache,
  memoize,
  debounce,
  throttle,
  BatchProcessor,
  ConnectionPool,
  QueryCache,
  lazyLoad,
  parallelLimit,
  ResourcePool,
  PerformanceMonitor
};