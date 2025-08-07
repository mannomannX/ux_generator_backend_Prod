// ==========================================
// PACKAGES/COMMON/src/monitoring/performance-monitor.js
// ==========================================

import { EventEmitter } from 'events';
import { DistributedTracer } from './distributed-tracer.js';
import { SystemMetrics } from './system-metrics.js';

/**
 * Performance Monitor
 * Comprehensive performance monitoring and alerting system
 */
export class PerformanceMonitor extends EventEmitter {
  constructor(serviceName, options = {}) {
    super();
    
    this.serviceName = serviceName;
    this.options = {
      enableTracing: process.env.ENABLE_TRACING !== 'false',
      enableSystemMetrics: process.env.ENABLE_SYSTEM_METRICS !== 'false',
      enablePerformanceAlerts: process.env.ENABLE_PERFORMANCE_ALERTS !== 'false',
      alertThresholds: {
        responseTime: 5000, // 5 seconds
        errorRate: 0.05, // 5%
        memoryUsage: 80, // 80%
        cpuUsage: 80, // 80%
        eventLoopLag: 100 // 100ms
      },
      metricsRetention: {
        detailed: 3600000, // 1 hour
        aggregated: 86400000 // 24 hours
      },
      ...options
    };

    this.tracer = null;
    this.systemMetrics = null;
    
    // Performance metrics
    this.metrics = {
      requests: new Map(), // Request performance tracking
      errors: new Map(), // Error tracking
      responseTime: {
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0
      },
      throughput: {
        current: 0,
        peak: 0
      },
      errorRate: 0,
      alerts: []
    };

    this.requestTimes = [];
    this.errorCounts = [];
    this.startTime = Date.now();

    if (this.options.enableTracing) {
      this.initializeTracing();
    }

    if (this.options.enableSystemMetrics) {
      this.initializeSystemMetrics();
    }

    this.startPerformanceTracking();
  }

  /**
   * Initialize distributed tracing
   */
  initializeTracing() {
    this.tracer = new DistributedTracer(this.serviceName, {
      enabledTracing: true,
      sampleRate: parseFloat(process.env.TRACE_SAMPLE_RATE || '0.1')
    });
  }

  /**
   * Initialize system metrics
   */
  initializeSystemMetrics() {
    this.systemMetrics = new SystemMetrics({
      enableAlerts: this.options.enablePerformanceAlerts
    });

    this.systemMetrics.on('alerts', (alerts) => {
      this.handleSystemAlerts(alerts);
    });

    this.systemMetrics.start();
  }

  /**
   * Start performance tracking
   */
  startPerformanceTracking() {
    // Clean up old metrics every minute
    setInterval(() => {
      this.cleanupOldMetrics();
      this.calculateAggregatedMetrics();
    }, 60000);

    // Check for performance alerts every 30 seconds
    if (this.options.enablePerformanceAlerts) {
      setInterval(() => {
        this.checkPerformanceAlerts();
      }, 30000);
    }
  }

  /**
   * Express middleware for performance monitoring
   */
  middleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const originalEnd = res.end;

      // Add tracing middleware if available
      let tracingMiddleware = null;
      if (this.tracer) {
        tracingMiddleware = this.tracer.middleware();
      }

      // Generate request ID
      req.requestId = req.headers['x-request-id'] || this.generateRequestId();
      req.startTime = startTime;

      // Track request
      const requestInfo = {
        id: req.requestId,
        method: req.method,
        path: req.path,
        startTime,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      };

      this.metrics.requests.set(req.requestId, requestInfo);

      // Override response end to capture metrics
      res.end = (...args) => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Update request info
        requestInfo.endTime = endTime;
        requestInfo.responseTime = responseTime;
        requestInfo.statusCode = res.statusCode;
        requestInfo.responseSize = res.get('content-length') || 0;

        // Track performance metrics
        this.trackRequest(requestInfo);

        // Check for slow requests
        if (responseTime > this.options.alertThresholds.responseTime) {
          this.handleSlowRequest(requestInfo);
        }

        // Track errors
        if (res.statusCode >= 400) {
          this.trackError(requestInfo);
        }

        originalEnd.apply(res, args);
      };

      // Apply tracing middleware if available
      if (tracingMiddleware) {
        tracingMiddleware(req, res, next);
      } else {
        next();
      }
    };
  }

  /**
   * Track request performance
   */
  trackRequest(requestInfo) {
    this.requestTimes.push({
      timestamp: requestInfo.endTime,
      responseTime: requestInfo.responseTime,
      path: requestInfo.path,
      method: requestInfo.method,
      statusCode: requestInfo.statusCode
    });

    // Limit stored request times
    if (this.requestTimes.length > 10000) {
      this.requestTimes = this.requestTimes.slice(-5000);
    }

    this.emit('request_completed', requestInfo);
  }

  /**
   * Track error
   */
  trackError(requestInfo) {
    this.errorCounts.push({
      timestamp: requestInfo.endTime,
      statusCode: requestInfo.statusCode,
      path: requestInfo.path,
      method: requestInfo.method,
      responseTime: requestInfo.responseTime
    });

    // Limit stored errors
    if (this.errorCounts.length > 1000) {
      this.errorCounts = this.errorCounts.slice(-500);
    }

    this.emit('request_error', requestInfo);
  }

  /**
   * Handle slow request
   */
  handleSlowRequest(requestInfo) {
    const alert = {
      type: 'slow_request',
      severity: 'warning',
      timestamp: Date.now(),
      message: `Slow request detected: ${requestInfo.method} ${requestInfo.path} took ${requestInfo.responseTime}ms`,
      data: {
        requestId: requestInfo.id,
        method: requestInfo.method,
        path: requestInfo.path,
        responseTime: requestInfo.responseTime,
        threshold: this.options.alertThresholds.responseTime
      }
    };

    this.metrics.alerts.push(alert);
    this.emit('performance_alert', alert);
  }

  /**
   * Handle system alerts
   */
  handleSystemAlerts(systemAlerts) {
    for (const alert of systemAlerts) {
      const performanceAlert = {
        type: `system_${alert.type}`,
        severity: alert.severity,
        timestamp: Date.now(),
        message: alert.message,
        data: alert
      };

      this.metrics.alerts.push(performanceAlert);
      this.emit('performance_alert', performanceAlert);
    }
  }

  /**
   * Calculate aggregated metrics
   */
  calculateAggregatedMetrics() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Filter recent request times
    const recentRequests = this.requestTimes.filter(r => r.timestamp > oneHourAgo);
    const recentErrors = this.errorCounts.filter(e => e.timestamp > oneHourAgo);

    if (recentRequests.length === 0) return;

    // Calculate response time percentiles
    const responseTimes = recentRequests.map(r => r.responseTime).sort((a, b) => a - b);
    
    this.metrics.responseTime = {
      p50: this.calculatePercentile(responseTimes, 50),
      p95: this.calculatePercentile(responseTimes, 95),
      p99: this.calculatePercentile(responseTimes, 99),
      avg: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    };

    // Calculate throughput (requests per minute)
    const recentMinuteRequests = recentRequests.filter(r => r.timestamp > now - 60000);
    this.metrics.throughput.current = recentMinuteRequests.length;
    this.metrics.throughput.peak = Math.max(this.metrics.throughput.peak, this.metrics.throughput.current);

    // Calculate error rate
    this.metrics.errorRate = recentRequests.length > 0 ? 
      recentErrors.length / recentRequests.length : 0;
  }

  /**
   * Calculate percentile
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts() {
    const alerts = [];

    // Check error rate
    if (this.metrics.errorRate > this.options.alertThresholds.errorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: this.metrics.errorRate > 0.1 ? 'critical' : 'warning',
        timestamp: Date.now(),
        message: `High error rate: ${(this.metrics.errorRate * 100).toFixed(2)}%`,
        data: {
          errorRate: this.metrics.errorRate,
          threshold: this.options.alertThresholds.errorRate
        }
      });
    }

    // Check response time
    if (this.metrics.responseTime.p95 > this.options.alertThresholds.responseTime) {
      alerts.push({
        type: 'high_response_time',
        severity: this.metrics.responseTime.p95 > this.options.alertThresholds.responseTime * 2 ? 'critical' : 'warning',
        timestamp: Date.now(),
        message: `High response time: P95 is ${this.metrics.responseTime.p95}ms`,
        data: {
          p95ResponseTime: this.metrics.responseTime.p95,
          threshold: this.options.alertThresholds.responseTime
        }
      });
    }

    for (const alert of alerts) {
      this.metrics.alerts.push(alert);
      this.emit('performance_alert', alert);
    }
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    const now = Date.now();
    const retentionTime = this.options.metricsRetention.detailed;

    // Clean up old requests
    for (const [requestId, request] of this.metrics.requests.entries()) {
      if (request.startTime < now - retentionTime) {
        this.metrics.requests.delete(requestId);
      }
    }

    // Clean up old alerts
    this.metrics.alerts = this.metrics.alerts.filter(
      alert => alert.timestamp > now - this.options.metricsRetention.aggregated
    );
  }

  /**
   * Get current performance metrics
   */
  getMetrics() {
    const systemMetrics = this.systemMetrics?.getCurrentMetrics();
    
    return {
      service: this.serviceName,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      requests: {
        total: this.requestTimes.length,
        active: this.metrics.requests.size,
        responseTime: this.metrics.responseTime,
        throughput: this.metrics.throughput
      },
      errors: {
        total: this.errorCounts.length,
        rate: this.metrics.errorRate,
        recent: this.errorCounts.slice(-10)
      },
      system: systemMetrics ? {
        cpu: systemMetrics.cpu,
        memory: systemMetrics.memory,
        eventLoop: systemMetrics.eventLoop,
        loadAverage: systemMetrics.loadAverage
      } : null,
      alerts: this.metrics.alerts.slice(-50), // Last 50 alerts
      health: this.getHealthStatus()
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const criticalAlerts = this.metrics.alerts.filter(
      alert => alert.severity === 'critical' && 
               alert.timestamp > Date.now() - 300000 // Last 5 minutes
    );

    if (criticalAlerts.length > 0) {
      return 'critical';
    }

    const warningAlerts = this.metrics.alerts.filter(
      alert => alert.severity === 'warning' && 
               alert.timestamp > Date.now() - 300000
    );

    if (warningAlerts.length > 3) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start a performance trace
   */
  startTrace(operation, metadata = {}) {
    if (this.tracer) {
      return this.tracer.startTrace(operation, metadata);
    }
    return null;
  }

  /**
   * Get distributed tracer
   */
  getTracer() {
    return this.tracer;
  }

  /**
   * Get system metrics collector
   */
  getSystemMetrics() {
    return this.systemMetrics;
  }

  /**
   * Export metrics in various formats
   */
  exportMetrics(format = 'json') {
    const metrics = this.getMetrics();

    switch (format.toLowerCase()) {
      case 'prometheus':
        return this.exportPrometheusMetrics(metrics);
      case 'json':
      default:
        return JSON.stringify(metrics, null, 2);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(metrics) {
    const timestamp = Math.floor(metrics.timestamp / 1000);
    
    let output = `# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{service="${this.serviceName}"} ${metrics.requests.total} ${timestamp}

# HELP http_requests_active Currently active HTTP requests
# TYPE http_requests_active gauge
http_requests_active{service="${this.serviceName}"} ${metrics.requests.active} ${timestamp}

# HELP http_request_duration_p50 HTTP request duration P50 in milliseconds
# TYPE http_request_duration_p50 gauge
http_request_duration_p50{service="${this.serviceName}"} ${metrics.requests.responseTime.p50} ${timestamp}

# HELP http_request_duration_p95 HTTP request duration P95 in milliseconds
# TYPE http_request_duration_p95 gauge
http_request_duration_p95{service="${this.serviceName}"} ${metrics.requests.responseTime.p95} ${timestamp}

# HELP http_request_duration_p99 HTTP request duration P99 in milliseconds
# TYPE http_request_duration_p99 gauge
http_request_duration_p99{service="${this.serviceName}"} ${metrics.requests.responseTime.p99} ${timestamp}

# HELP http_error_rate HTTP error rate (0-1)
# TYPE http_error_rate gauge
http_error_rate{service="${this.serviceName}"} ${metrics.errors.rate} ${timestamp}

# HELP service_uptime_seconds Service uptime in seconds
# TYPE service_uptime_seconds counter
service_uptime_seconds{service="${this.serviceName}"} ${Math.floor(metrics.uptime / 1000)} ${timestamp}
`;

    // Add system metrics if available
    if (this.systemMetrics) {
      output += '\n' + this.systemMetrics.exportPrometheusMetrics();
    }

    return output;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    if (this.systemMetrics) {
      this.systemMetrics.destroy();
    }
    
    if (this.tracer) {
      await this.tracer.shutdown();
    }

    this.removeAllListeners();
  }
}

// Export singleton instance
let globalPerformanceMonitor = null;

export const initializePerformanceMonitor = (serviceName, options = {}) => {
  if (globalPerformanceMonitor) {
    globalPerformanceMonitor.shutdown();
  }
  globalPerformanceMonitor = new PerformanceMonitor(serviceName, options);
  return globalPerformanceMonitor;
};

export const getPerformanceMonitor = () => {
  if (!globalPerformanceMonitor) {
    throw new Error('Performance monitor not initialized. Call initializePerformanceMonitor() first.');
  }
  return globalPerformanceMonitor;
};