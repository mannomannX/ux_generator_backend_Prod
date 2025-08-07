/**
 * Memory Manager for Knowledge Service
 * Monitors and manages memory usage to prevent OOM errors
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../config/constants.js';
import { ErrorFactory } from './errors.js';

/**
 * Memory manager to monitor and control memory usage
 */
export class MemoryManager extends EventEmitter {
  constructor(logger, options = {}) {
    super();
    this.logger = logger;
    
    // Configuration
    this.config = {
      maxHeapUsage: options.maxHeapUsage || CONFIG.PERFORMANCE.LIMITS.MAX_MEMORY_USAGE,
      checkInterval: options.checkInterval || 5000, // Check every 5 seconds
      gcThreshold: options.gcThreshold || 0.8, // Trigger GC at 80% usage
      alertThreshold: options.alertThreshold || 0.9, // Alert at 90% usage
      criticalThreshold: options.criticalThreshold || 0.95, // Critical at 95% usage
      ...options
    };
    
    // State
    this.isMonitoring = false;
    this.checkTimer = null;
    this.stats = {
      checks: 0,
      gcTriggered: 0,
      alerts: 0,
      criticalEvents: 0,
      maxHeapUsed: 0,
      avgHeapUsed: 0
    };
    
    // Cache management
    this.caches = new Map();
    this.cachePriorities = new Map();
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    this.checkTimer = setInterval(() => this.checkMemory(), this.config.checkInterval);
    
    this.logger.info('Memory monitoring started', {
      maxHeapUsage: this.formatBytes(this.config.maxHeapUsage),
      checkInterval: this.config.checkInterval
    });
    
    this.emit('monitoring-started');
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    
    this.logger.info('Memory monitoring stopped');
    this.emit('monitoring-stopped');
  }

  /**
   * Check current memory usage
   */
  checkMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;
    
    // Update statistics
    this.stats.checks++;
    this.stats.maxHeapUsed = Math.max(this.stats.maxHeapUsed, memUsage.heapUsed);
    this.stats.avgHeapUsed = 
      (this.stats.avgHeapUsed * (this.stats.checks - 1) + memUsage.heapUsed) / 
      this.stats.checks;
    
    // Check against thresholds
    if (memUsage.heapUsed > this.config.maxHeapUsage * this.config.criticalThreshold) {
      this.handleCriticalMemory(memUsage);
    } else if (memUsage.heapUsed > this.config.maxHeapUsage * this.config.alertThreshold) {
      this.handleHighMemory(memUsage);
    } else if (heapUsedPercent > this.config.gcThreshold) {
      this.triggerGarbageCollection();
    }
    
    // Emit memory status
    this.emit('memory-check', {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedPercent,
      heapUsedMB: this.formatBytes(memUsage.heapUsed)
    });
  }

  /**
   * Handle critical memory situation
   */
  handleCriticalMemory(memUsage) {
    this.stats.criticalEvents++;
    
    this.logger.error('Critical memory usage detected', {
      heapUsed: this.formatBytes(memUsage.heapUsed),
      heapTotal: this.formatBytes(memUsage.heapTotal),
      threshold: this.formatBytes(this.config.maxHeapUsage * this.config.criticalThreshold)
    });
    
    // Emergency memory cleanup
    this.emergencyCleanup();
    
    // Force garbage collection
    this.forceGarbageCollection();
    
    this.emit('memory-critical', memUsage);
  }

  /**
   * Handle high memory situation
   */
  handleHighMemory(memUsage) {
    this.stats.alerts++;
    
    this.logger.warn('High memory usage detected', {
      heapUsed: this.formatBytes(memUsage.heapUsed),
      heapTotal: this.formatBytes(memUsage.heapTotal),
      threshold: this.formatBytes(this.config.maxHeapUsage * this.config.alertThreshold)
    });
    
    // Clear low-priority caches
    this.clearLowPriorityCaches();
    
    // Trigger garbage collection
    this.triggerGarbageCollection();
    
    this.emit('memory-high', memUsage);
  }

  /**
   * Trigger garbage collection if available
   */
  triggerGarbageCollection() {
    if (global.gc) {
      this.stats.gcTriggered++;
      
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      
      const freed = before - after;
      if (freed > 0) {
        this.logger.debug('Garbage collection freed memory', {
          freed: this.formatBytes(freed),
          beforeMB: this.formatBytes(before),
          afterMB: this.formatBytes(after)
        });
      }
      
      this.emit('gc-triggered', { before, after, freed });
    }
  }

  /**
   * Force garbage collection (more aggressive)
   */
  forceGarbageCollection() {
    if (global.gc) {
      // Multiple GC passes for thorough cleanup
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
      
      this.logger.info('Forced garbage collection completed');
    }
  }

  /**
   * Register a cache for management
   */
  registerCache(name, cache, priority = 5) {
    this.caches.set(name, cache);
    this.cachePriorities.set(name, priority);
    
    this.logger.debug('Cache registered', { name, priority });
  }

  /**
   * Clear low-priority caches
   */
  clearLowPriorityCaches(threshold = 5) {
    let clearedCount = 0;
    
    for (const [name, cache] of this.caches.entries()) {
      const priority = this.cachePriorities.get(name);
      
      if (priority <= threshold) {
        this.clearCache(name, cache);
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      this.logger.info('Cleared low-priority caches', { count: clearedCount, threshold });
    }
  }

  /**
   * Clear a specific cache
   */
  clearCache(name, cache) {
    try {
      if (cache instanceof Map) {
        cache.clear();
      } else if (cache instanceof Set) {
        cache.clear();
      } else if (Array.isArray(cache)) {
        cache.length = 0;
      } else if (typeof cache.clear === 'function') {
        cache.clear();
      } else if (typeof cache.reset === 'function') {
        cache.reset();
      }
      
      this.logger.debug('Cache cleared', { name });
      this.emit('cache-cleared', { name });
    } catch (error) {
      this.logger.error('Failed to clear cache', { name, error: error.message });
    }
  }

  /**
   * Emergency cleanup - clear all caches
   */
  emergencyCleanup() {
    this.logger.warn('Emergency memory cleanup initiated');
    
    // Clear all registered caches
    for (const [name, cache] of this.caches.entries()) {
      this.clearCache(name, cache);
    }
    
    // Clear any global caches
    if (global.__cache) {
      global.__cache = {};
    }
    
    // Force cleanup of any large objects
    this.emit('emergency-cleanup');
    
    this.logger.info('Emergency cleanup completed');
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const current = process.memoryUsage();
    
    return {
      current: {
        heapUsed: this.formatBytes(current.heapUsed),
        heapTotal: this.formatBytes(current.heapTotal),
        external: this.formatBytes(current.external),
        rss: this.formatBytes(current.rss),
        heapUsedPercent: ((current.heapUsed / current.heapTotal) * 100).toFixed(2) + '%'
      },
      limits: {
        maxHeapUsage: this.formatBytes(this.config.maxHeapUsage),
        gcThreshold: (this.config.gcThreshold * 100).toFixed(0) + '%',
        alertThreshold: (this.config.alertThreshold * 100).toFixed(0) + '%',
        criticalThreshold: (this.config.criticalThreshold * 100).toFixed(0) + '%'
      },
      statistics: {
        ...this.stats,
        maxHeapUsedMB: this.formatBytes(this.stats.maxHeapUsed),
        avgHeapUsedMB: this.formatBytes(this.stats.avgHeapUsed)
      },
      caches: {
        registered: this.caches.size,
        names: Array.from(this.caches.keys())
      }
    };
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  }

  /**
   * Check if memory is available for operation
   */
  canAllocate(estimatedBytes) {
    const current = process.memoryUsage();
    const afterAllocation = current.heapUsed + estimatedBytes;
    
    return afterAllocation < this.config.maxHeapUsage * this.config.alertThreshold;
  }

  /**
   * Memory-safe array processing
   */
  async processArraySafely(array, processor, options = {}) {
    const chunkSize = options.chunkSize || 100;
    const results = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      // Check memory before processing chunk
      if (!this.canAllocate(chunkSize * 1024 * 10)) { // Estimate 10KB per item
        this.triggerGarbageCollection();
        await this.sleep(100); // Give GC time to run
      }
      
      const chunk = array.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(processor));
      results.push(...chunkResults);
      
      // Periodic cleanup
      if (i % (chunkSize * 10) === 0) {
        await this.sleep(0); // Yield to event loop
      }
    }
    
    return results;
  }

  /**
   * Create memory-limited Map
   */
  createLimitedMap(maxSize = 1000) {
    const map = new Map();
    const originalSet = map.set.bind(map);
    
    map.set = (key, value) => {
      if (map.size >= maxSize) {
        // Remove oldest entry (first one)
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
      }
      return originalSet(key, value);
    };
    
    return map;
  }

  /**
   * Create memory-limited cache with TTL
   */
  createTTLCache(maxSize = 1000, ttl = 3600000) {
    const cache = this.createLimitedMap(maxSize);
    const timestamps = new Map();
    
    const originalSet = cache.set.bind(cache);
    const originalGet = cache.get.bind(cache);
    
    cache.set = (key, value) => {
      timestamps.set(key, Date.now());
      return originalSet(key, value);
    };
    
    cache.get = (key) => {
      const timestamp = timestamps.get(key);
      if (timestamp && Date.now() - timestamp > ttl) {
        cache.delete(key);
        timestamps.delete(key);
        return undefined;
      }
      return originalGet(key);
    };
    
    // Periodic cleanup of expired entries
    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamp] of timestamps.entries()) {
        if (now - timestamp > ttl) {
          cache.delete(key);
          timestamps.delete(key);
        }
      }
    }, ttl / 10);
    
    return cache;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Memory pool for reusable objects
 */
export class MemoryPool {
  constructor(factory, options = {}) {
    this.factory = factory;
    this.pool = [];
    this.inUse = new Set();
    this.maxSize = options.maxSize || 100;
    this.minSize = options.minSize || 10;
    
    // Pre-populate pool
    for (let i = 0; i < this.minSize; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Acquire object from pool
   */
  acquire() {
    let obj;
    
    if (this.pool.length > 0) {
      obj = this.pool.pop();
    } else if (this.inUse.size < this.maxSize) {
      obj = this.factory();
    } else {
      throw new Error('Memory pool exhausted');
    }
    
    this.inUse.add(obj);
    return obj;
  }

  /**
   * Release object back to pool
   */
  release(obj) {
    if (!this.inUse.has(obj)) {
      return;
    }
    
    this.inUse.delete(obj);
    
    // Reset object if it has a reset method
    if (typeof obj.reset === 'function') {
      obj.reset();
    }
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  /**
   * Clear the pool
   */
  clear() {
    this.pool = [];
    this.inUse.clear();
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      inUse: this.inUse.size,
      total: this.pool.length + this.inUse.size,
      maxSize: this.maxSize
    };
  }
}

export default {
  MemoryManager,
  MemoryPool
};