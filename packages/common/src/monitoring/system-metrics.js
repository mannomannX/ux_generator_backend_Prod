// ==========================================
// PACKAGES/COMMON/src/monitoring/system-metrics.js
// ==========================================

import os from 'os';
import { EventEmitter } from 'events';

/**
 * System Metrics Collector
 * Collects and monitors system performance metrics
 */
export class SystemMetrics extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      collectInterval: 5000, // 5 seconds
      historyLimit: 288, // 24 hours of data at 5-second intervals
      cpuThreshold: 80,
      memoryThreshold: 80,
      diskThreshold: 85,
      enableAlerts: true,
      ...options
    };

    this.metrics = {
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem()
      },
      history: []
    };

    this.intervalId = null;
    this.lastCpuUsage = null;
  }

  /**
   * Start collecting metrics
   */
  start() {
    if (this.intervalId) {
      this.stop();
    }

    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.options.collectInterval);

    this.emit('started');
  }

  /**
   * Stop collecting metrics
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped');
  }

  /**
   * Collect current system metrics
   */
  async collectMetrics() {
    try {
      const timestamp = Date.now();
      const memUsage = process.memoryUsage();
      
      const metrics = {
        timestamp,
        cpu: await this.getCpuUsage(),
        memory: {
          used: memUsage.rss,
          heap: {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal
          },
          external: memUsage.external,
          system: {
            total: os.totalmem(),
            free: os.freemem(),
            used: os.totalmem() - os.freemem()
          }
        },
        uptime: {
          system: os.uptime(),
          process: process.uptime()
        },
        loadAverage: os.loadavg(),
        networkInterfaces: this.getNetworkStats(),
        eventLoop: await this.getEventLoopLag(),
        gc: this.getGCStats()
      };

      // Calculate percentages
      metrics.cpu.usage = Math.round(metrics.cpu.usage * 100) / 100;
      metrics.memory.heap.usage = Math.round((metrics.memory.heap.used / metrics.memory.heap.total) * 100);
      metrics.memory.system.usage = Math.round((metrics.memory.system.used / metrics.memory.system.total) * 100);

      // Add to history
      this.metrics.history.push(metrics);
      
      // Limit history size
      if (this.metrics.history.length > this.options.historyLimit) {
        this.metrics.history.shift();
      }

      // Check for alerts
      if (this.options.enableAlerts) {
        this.checkAlerts(metrics);
      }

      this.emit('metrics', metrics);
      return metrics;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get CPU usage percentage
   */
  async getCpuUsage() {
    const cpus = os.cpus();
    
    if (!this.lastCpuUsage) {
      this.lastCpuUsage = cpus.map(cpu => ({
        idle: cpu.times.idle,
        total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
      }));
      
      // Wait a bit to get accurate measurement
      await new Promise(resolve => setTimeout(resolve, 100));
      return { usage: 0, cores: cpus.length };
    }

    const currentCpus = cpus.map(cpu => ({
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
    }));

    let totalUsage = 0;
    for (let i = 0; i < cpus.length; i++) {
      const prev = this.lastCpuUsage[i];
      const curr = currentCpus[i];
      
      const idleDiff = curr.idle - prev.idle;
      const totalDiff = curr.total - prev.total;
      
      const usage = totalDiff > 0 ? 100 - (100 * idleDiff / totalDiff) : 0;
      totalUsage += usage;
    }

    this.lastCpuUsage = currentCpus;
    
    return {
      usage: totalUsage / cpus.length,
      cores: cpus.length,
      loadAverage: os.loadavg()
    };
  }

  /**
   * Get network interface statistics
   */
  getNetworkStats() {
    const interfaces = os.networkInterfaces();
    const stats = {};

    for (const [name, addresses] of Object.entries(interfaces)) {
      const ipv4 = addresses.find(addr => addr.family === 'IPv4' && !addr.internal);
      if (ipv4) {
        stats[name] = {
          address: ipv4.address,
          netmask: ipv4.netmask,
          mac: ipv4.mac
        };
      }
    }

    return stats;
  }

  /**
   * Measure event loop lag
   */
  getEventLoopLag() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        resolve({ lag });
      });
    });
  }

  /**
   * Get garbage collection statistics
   */
  getGCStats() {
    if (global.gc && global.gc.getHeapStatistics) {
      return global.gc.getHeapStatistics();
    }
    return null;
  }

  /**
   * Check for performance alerts
   */
  checkAlerts(metrics) {
    const alerts = [];

    // CPU threshold
    if (metrics.cpu.usage > this.options.cpuThreshold) {
      alerts.push({
        type: 'cpu_high',
        severity: 'warning',
        message: `CPU usage is ${metrics.cpu.usage.toFixed(1)}% (threshold: ${this.options.cpuThreshold}%)`,
        value: metrics.cpu.usage,
        threshold: this.options.cpuThreshold
      });
    }

    // Memory threshold
    if (metrics.memory.system.usage > this.options.memoryThreshold) {
      alerts.push({
        type: 'memory_high',
        severity: 'warning',
        message: `Memory usage is ${metrics.memory.system.usage}% (threshold: ${this.options.memoryThreshold}%)`,
        value: metrics.memory.system.usage,
        threshold: this.options.memoryThreshold
      });
    }

    // Event loop lag
    if (metrics.eventLoop.lag > 100) { // 100ms
      alerts.push({
        type: 'eventloop_lag',
        severity: metrics.eventLoop.lag > 500 ? 'critical' : 'warning',
        message: `Event loop lag is ${metrics.eventLoop.lag.toFixed(1)}ms`,
        value: metrics.eventLoop.lag,
        threshold: 100
      });
    }

    // Load average (for Unix systems)
    if (os.platform() !== 'win32' && metrics.loadAverage[0] > metrics.cpu.cores) {
      alerts.push({
        type: 'load_high',
        severity: 'warning',
        message: `Load average (${metrics.loadAverage[0].toFixed(2)}) exceeds CPU cores (${metrics.cpu.cores})`,
        value: metrics.loadAverage[0],
        threshold: metrics.cpu.cores
      });
    }

    if (alerts.length > 0) {
      this.emit('alerts', alerts);
    }
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics() {
    if (this.metrics.history.length === 0) {
      return null;
    }
    return this.metrics.history[this.metrics.history.length - 1];
  }

  /**
   * Get historical metrics
   */
  getHistoricalMetrics(timeRange = '1h') {
    const now = Date.now();
    let duration;

    switch (timeRange) {
      case '5m':
        duration = 5 * 60 * 1000;
        break;
      case '15m':
        duration = 15 * 60 * 1000;
        break;
      case '1h':
        duration = 60 * 60 * 1000;
        break;
      case '6h':
        duration = 6 * 60 * 60 * 1000;
        break;
      case '24h':
        duration = 24 * 60 * 60 * 1000;
        break;
      default:
        duration = 60 * 60 * 1000; // Default 1 hour
    }

    const cutoff = now - duration;
    return this.metrics.history.filter(metric => metric.timestamp >= cutoff);
  }

  /**
   * Get aggregated statistics
   */
  getAggregatedStats(timeRange = '1h') {
    const history = this.getHistoricalMetrics(timeRange);
    if (history.length === 0) return null;

    const cpuUsages = history.map(m => m.cpu.usage);
    const memoryUsages = history.map(m => m.memory.system.usage);
    const eventLoopLags = history.map(m => m.eventLoop.lag);

    return {
      timeRange,
      sampleCount: history.length,
      cpu: {
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        avg: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length,
        current: cpuUsages[cpuUsages.length - 1]
      },
      memory: {
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        avg: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        current: memoryUsages[memoryUsages.length - 1]
      },
      eventLoop: {
        min: Math.min(...eventLoopLags),
        max: Math.max(...eventLoopLags),
        avg: eventLoopLags.reduce((a, b) => a + b, 0) / eventLoopLags.length,
        current: eventLoopLags[eventLoopLags.length - 1]
      }
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics() {
    const current = this.getCurrentMetrics();
    if (!current) return '';

    const timestamp = Math.floor(current.timestamp / 1000);
    
    return `
# HELP system_cpu_usage_percent Current CPU usage percentage
# TYPE system_cpu_usage_percent gauge
system_cpu_usage_percent ${current.cpu.usage} ${timestamp}

# HELP system_memory_usage_bytes Memory usage in bytes
# TYPE system_memory_usage_bytes gauge
system_memory_usage_bytes ${current.memory.system.used} ${timestamp}

# HELP system_memory_usage_percent Memory usage percentage
# TYPE system_memory_usage_percent gauge
system_memory_usage_percent ${current.memory.system.usage} ${timestamp}

# HELP process_heap_usage_bytes Process heap usage in bytes
# TYPE process_heap_usage_bytes gauge
process_heap_usage_bytes ${current.memory.heap.used} ${timestamp}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds ${current.uptime.process} ${timestamp}

# HELP nodejs_eventloop_lag_milliseconds Event loop lag in milliseconds
# TYPE nodejs_eventloop_lag_milliseconds gauge
nodejs_eventloop_lag_milliseconds ${current.eventLoop.lag} ${timestamp}

# HELP system_load_average_1m System load average over 1 minute
# TYPE system_load_average_1m gauge
system_load_average_1m ${current.loadAverage[0]} ${timestamp}
    `.trim();
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}

// Singleton instance
let globalMetrics = null;

export const initializeSystemMetrics = (options = {}) => {
  if (globalMetrics) {
    globalMetrics.destroy();
  }
  globalMetrics = new SystemMetrics(options);
  return globalMetrics;
};

export const getSystemMetrics = () => {
  if (!globalMetrics) {
    throw new Error('System metrics not initialized. Call initializeSystemMetrics() first.');
  }
  return globalMetrics;
};