/**
 * Metrics Collector Service
 * Collects and reports service metrics for monitoring
 */

import os from 'os';
import { EventEmitter } from 'events';

export class MetricsCollector extends EventEmitter {
  constructor(logger, redisClient) {
    super();
    this.logger = logger;
    this.redisClient = redisClient;
    
    // Metrics storage
    this.metrics = {
      counters: new Map(),
      gauges: new Map(),
      histograms: new Map(),
      timers: new Map()
    };
    
    // Configuration
    this.config = {
      flushInterval: parseInt(process.env.METRICS_FLUSH_INTERVAL) || 60000, // 1 minute
      retentionPeriod: parseInt(process.env.METRICS_RETENTION) || 86400, // 24 hours
      namespace: 'user-management'
    };
    
    // Start collection
    this.startCollection();
  }

  /**
   * Start metrics collection
   */
  startCollection() {
    // Collect system metrics periodically
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000); // Every 30 seconds
    
    // Flush metrics to storage
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.config.flushInterval);
    
    this.logger.info('Metrics collection started');
  }

  /**
   * Stop metrics collection
   */
  stopCollection() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    // Final flush
    this.flushMetrics();
    
    this.logger.info('Metrics collection stopped');
  }

  /**
   * Increment a counter
   */
  increment(name, value = 1, tags = {}) {
    const key = this.generateKey(name, tags);
    const current = this.metrics.counters.get(key) || 0;
    this.metrics.counters.set(key, current + value);
    
    this.emit('metric', {
      type: 'counter',
      name,
      value: current + value,
      tags,
      timestamp: Date.now()
    });
  }

  /**
   * Decrement a counter
   */
  decrement(name, value = 1, tags = {}) {
    this.increment(name, -value, tags);
  }

  /**
   * Set a gauge value
   */
  gauge(name, value, tags = {}) {
    const key = this.generateKey(name, tags);
    this.metrics.gauges.set(key, value);
    
    this.emit('metric', {
      type: 'gauge',
      name,
      value,
      tags,
      timestamp: Date.now()
    });
  }

  /**
   * Record a timing
   */
  timing(name, duration, tags = {}) {
    const key = this.generateKey(name, tags);
    
    if (!this.metrics.timers.has(key)) {
      this.metrics.timers.set(key, []);
    }
    
    this.metrics.timers.get(key).push(duration);
    
    this.emit('metric', {
      type: 'timing',
      name,
      value: duration,
      tags,
      timestamp: Date.now()
    });
  }

  /**
   * Record a histogram value
   */
  histogram(name, value, tags = {}) {
    const key = this.generateKey(name, tags);
    
    if (!this.metrics.histograms.has(key)) {
      this.metrics.histograms.set(key, []);
    }
    
    this.metrics.histograms.get(key).push(value);
    
    this.emit('metric', {
      type: 'histogram',
      name,
      value,
      tags,
      timestamp: Date.now()
    });
  }

  /**
   * Start a timer
   */
  startTimer(name, tags = {}) {
    const id = `${name}_${Date.now()}_${Math.random()}`;
    const timer = {
      name,
      tags,
      startTime: process.hrtime.bigint()
    };
    
    this.metrics.timers.set(id, timer);
    
    return {
      end: () => {
        const timer = this.metrics.timers.get(id);
        if (timer) {
          const duration = Number(process.hrtime.bigint() - timer.startTime) / 1000000; // Convert to ms
          this.metrics.timers.delete(id);
          this.timing(name, duration, tags);
          return duration;
        }
      }
    };
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics() {
    // CPU usage
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;
    
    this.gauge('system.cpu.usage', cpuUsage);
    
    // Memory usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    this.gauge('system.memory.total', totalMem);
    this.gauge('system.memory.free', freeMem);
    this.gauge('system.memory.used', usedMem);
    this.gauge('system.memory.usage', (usedMem / totalMem) * 100);
    
    // Process metrics
    const memUsage = process.memoryUsage();
    this.gauge('process.memory.rss', memUsage.rss);
    this.gauge('process.memory.heapTotal', memUsage.heapTotal);
    this.gauge('process.memory.heapUsed', memUsage.heapUsed);
    this.gauge('process.memory.external', memUsage.external);
    
    // Event loop lag (simplified)
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      this.gauge('process.eventLoop.lag', lag);
    });
    
    // Uptime
    this.gauge('process.uptime', process.uptime());
  }

  /**
   * Collect application metrics
   */
  getApplicationMetrics() {
    return {
      // Request metrics
      requests: {
        total: this.getCounter('requests.total'),
        success: this.getCounter('requests.success'),
        error: this.getCounter('requests.error'),
        byStatus: {
          '2xx': this.getCounter('requests.status.2xx'),
          '3xx': this.getCounter('requests.status.3xx'),
          '4xx': this.getCounter('requests.status.4xx'),
          '5xx': this.getCounter('requests.status.5xx')
        }
      },
      
      // Auth metrics
      auth: {
        logins: this.getCounter('auth.login.success'),
        loginFailures: this.getCounter('auth.login.failure'),
        signups: this.getCounter('auth.signup'),
        passwordResets: this.getCounter('auth.password.reset'),
        tokenRefreshes: this.getCounter('auth.token.refresh')
      },
      
      // User metrics
      users: {
        active: this.getGauge('users.active'),
        new: this.getCounter('users.new'),
        deleted: this.getCounter('users.deleted')
      },
      
      // API key metrics
      apiKeys: {
        created: this.getCounter('apikeys.created'),
        revoked: this.getCounter('apikeys.revoked'),
        validated: this.getCounter('apikeys.validated'),
        invalid: this.getCounter('apikeys.invalid')
      },
      
      // Performance metrics
      performance: {
        responseTime: this.getTimingStats('response.time'),
        dbQueryTime: this.getTimingStats('db.query.time'),
        cacheHitRate: this.calculateCacheHitRate()
      },
      
      // Error metrics
      errors: {
        total: this.getCounter('errors.total'),
        database: this.getCounter('errors.database'),
        validation: this.getCounter('errors.validation'),
        authentication: this.getCounter('errors.authentication')
      }
    };
  }

  /**
   * Get counter value
   */
  getCounter(name) {
    return this.metrics.counters.get(name) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name) {
    return this.metrics.gauges.get(name) || 0;
  }

  /**
   * Get timing statistics
   */
  getTimingStats(name) {
    const timings = this.metrics.timers.get(name) || [];
    
    if (timings.length === 0) {
      return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = timings.sort((a, b) => a - b);
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    
    return {
      avg,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    };
  }

  /**
   * Calculate percentile
   */
  percentile(sorted, p) {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate cache hit rate
   */
  calculateCacheHitRate() {
    const hits = this.getCounter('cache.hits');
    const misses = this.getCounter('cache.misses');
    const total = hits + misses;
    
    return total > 0 ? (hits / total) * 100 : 0;
  }

  /**
   * Flush metrics to storage
   */
  async flushMetrics() {
    try {
      const timestamp = Date.now();
      const metrics = {
        timestamp,
        namespace: this.config.namespace,
        counters: Object.fromEntries(this.metrics.counters),
        gauges: Object.fromEntries(this.metrics.gauges),
        timings: this.getTimingsSummary(),
        histograms: this.getHistogramsSummary()
      };
      
      // Store in Redis with expiration
      const key = `metrics:${this.config.namespace}:${timestamp}`;
      await this.redisClient.setex(
        key,
        this.config.retentionPeriod,
        JSON.stringify(metrics)
      );
      
      // Store latest metrics for quick access
      await this.redisClient.set(
        `metrics:${this.config.namespace}:latest`,
        JSON.stringify(metrics)
      );
      
      // Reset certain metrics after flush
      this.resetMetrics();
      
      this.logger.debug('Metrics flushed', { timestamp });
      
    } catch (error) {
      this.logger.error('Failed to flush metrics', error);
    }
  }

  /**
   * Get timings summary
   */
  getTimingsSummary() {
    const summary = {};
    
    for (const [key, values] of this.metrics.timers.entries()) {
      if (Array.isArray(values) && values.length > 0) {
        summary[key] = this.getTimingStats(key);
      }
    }
    
    return summary;
  }

  /**
   * Get histograms summary
   */
  getHistogramsSummary() {
    const summary = {};
    
    for (const [key, values] of this.metrics.histograms.entries()) {
      if (values.length > 0) {
        const sorted = values.sort((a, b) => a - b);
        summary[key] = {
          count: values.length,
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          p50: this.percentile(sorted, 0.5),
          p95: this.percentile(sorted, 0.95),
          p99: this.percentile(sorted, 0.99)
        };
      }
    }
    
    return summary;
  }

  /**
   * Reset metrics after flush
   */
  resetMetrics() {
    // Clear timers and histograms
    this.metrics.timers.clear();
    this.metrics.histograms.clear();
    
    // Counters and gauges persist
  }

  /**
   * Generate metric key
   */
  generateKey(name, tags = {}) {
    if (Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    
    return `${name}{${tagString}}`;
  }

  /**
   * Get metrics for dashboard
   */
  async getDashboardMetrics(period = '1h') {
    try {
      const now = Date.now();
      let startTime;
      
      switch (period) {
        case '5m':
          startTime = now - 5 * 60 * 1000;
          break;
        case '15m':
          startTime = now - 15 * 60 * 1000;
          break;
        case '1h':
          startTime = now - 60 * 60 * 1000;
          break;
        case '24h':
          startTime = now - 24 * 60 * 60 * 1000;
          break;
        default:
          startTime = now - 60 * 60 * 1000;
      }
      
      // Get stored metrics from Redis
      const keys = await this.redisClient.keys(`metrics:${this.config.namespace}:*`);
      const metrics = [];
      
      for (const key of keys) {
        if (key.endsWith(':latest')) continue;
        
        const timestamp = parseInt(key.split(':').pop());
        if (timestamp >= startTime) {
          const data = await this.redisClient.get(key);
          if (data) {
            metrics.push(JSON.parse(data));
          }
        }
      }
      
      // Sort by timestamp
      metrics.sort((a, b) => a.timestamp - b.timestamp);
      
      return {
        period,
        startTime,
        endTime: now,
        metrics,
        current: this.getApplicationMetrics()
      };
      
    } catch (error) {
      this.logger.error('Failed to get dashboard metrics', error);
      return null;
    }
  }

  /**
   * Health check metrics
   */
  getHealthMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      metrics: {
        counters: this.metrics.counters.size,
        gauges: this.metrics.gauges.size,
        timers: this.metrics.timers.size,
        histograms: this.metrics.histograms.size
      }
    };
  }
}

/**
 * Request metrics middleware
 */
export function requestMetrics(metricsCollector) {
  return (req, res, next) => {
    const timer = metricsCollector.startTimer('response.time', {
      method: req.method,
      path: req.route?.path || req.path
    });
    
    // Track request
    metricsCollector.increment('requests.total');
    
    // Override res.end to capture metrics
    const originalEnd = res.end;
    res.end = function(...args) {
      // Record response time
      timer.end();
      
      // Track status codes
      const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
      metricsCollector.increment(`requests.status.${statusClass}`);
      
      if (res.statusCode >= 200 && res.statusCode < 400) {
        metricsCollector.increment('requests.success');
      } else if (res.statusCode >= 400) {
        metricsCollector.increment('requests.error');
      }
      
      originalEnd.apply(res, args);
    };
    
    next();
  };
}

export default MetricsCollector;