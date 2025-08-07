// ==========================================
// PACKAGES/COMMON/src/monitoring/distributed-tracer.js
// ==========================================

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Distributed Tracing System
 * Tracks requests across multiple services
 */
export class DistributedTracer {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.asyncStorage = new AsyncLocalStorage();
    this.options = {
      enabledTracing: process.env.ENABLE_TRACING !== 'false',
      sampleRate: parseFloat(process.env.TRACE_SAMPLE_RATE || '0.1'),
      maxSpanDuration: 300000, // 5 minutes
      ...options
    };

    this.spans = new Map(); // Active spans
    this.completedSpans = new Map(); // Completed spans for batching
    this.batchSize = 100;
    this.flushInterval = 10000; // 10 seconds

    if (this.options.enabledTracing) {
      this.startBatchProcessor();
    }
  }

  /**
   * Start a new trace
   */
  startTrace(operation, metadata = {}) {
    if (!this.options.enabledTracing || !this.shouldSample()) {
      return null;
    }

    const traceId = randomUUID();
    const spanId = randomUUID();
    
    const trace = {
      traceId,
      spanId,
      parentSpanId: null,
      operation,
      serviceName: this.serviceName,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'started',
      metadata: {
        ...metadata,
        hostname: process.env.HOSTNAME || require('os').hostname(),
        version: process.env.SERVICE_VERSION || '1.0.0'
      },
      logs: [],
      tags: new Map(),
      children: []
    };

    this.spans.set(spanId, trace);
    return trace;
  }

  /**
   * Start a child span
   */
  startChildSpan(parentTrace, operation, metadata = {}) {
    if (!parentTrace || !this.options.enabledTracing) {
      return null;
    }

    const spanId = randomUUID();
    
    const childSpan = {
      traceId: parentTrace.traceId,
      spanId,
      parentSpanId: parentTrace.spanId,
      operation,
      serviceName: this.serviceName,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'started',
      metadata: {
        ...metadata,
        hostname: process.env.HOSTNAME || require('os').hostname()
      },
      logs: [],
      tags: new Map(),
      children: []
    };

    this.spans.set(spanId, childSpan);
    parentTrace.children.push(spanId);
    
    return childSpan;
  }

  /**
   * Finish a span
   */
  finishSpan(span, status = 'success', error = null) {
    if (!span) return;

    const now = Date.now();
    span.endTime = now;
    span.duration = now - span.startTime;
    span.status = status;

    if (error) {
      span.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
      this.addTag(span, 'error', true);
    }

    // Move to completed spans for batching
    this.spans.delete(span.spanId);
    this.completedSpans.set(span.spanId, span);

    // Clean up if trace is complete
    this.checkTraceCompletion(span.traceId);
  }

  /**
   * Add a log entry to a span
   */
  addLog(span, level, message, data = {}) {
    if (!span) return;

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      data
    });
  }

  /**
   * Add a tag to a span
   */
  addTag(span, key, value) {
    if (!span) return;
    span.tags.set(key, value);
  }

  /**
   * Express middleware for automatic request tracing
   */
  middleware() {
    return (req, res, next) => {
      if (!this.options.enabledTracing) {
        return next();
      }

      // Extract trace context from headers
      const traceId = req.headers['x-trace-id'] || randomUUID();
      const parentSpanId = req.headers['x-span-id'];
      
      // Create new span for this request
      const spanId = randomUUID();
      const span = {
        traceId,
        spanId,
        parentSpanId,
        operation: `${req.method} ${req.path}`,
        serviceName: this.serviceName,
        startTime: Date.now(),
        endTime: null,
        duration: null,
        status: 'started',
        metadata: {
          method: req.method,
          path: req.path,
          query: req.query,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          correlationId: req.correlationId
        },
        logs: [],
        tags: new Map(),
        children: []
      };

      this.spans.set(spanId, span);

      // Add trace context to response headers
      res.set('x-trace-id', traceId);
      res.set('x-span-id', spanId);

      // Store in async context
      this.asyncStorage.run({ span }, () => {
        // Override res.end to capture response details
        const originalEnd = res.end;
        res.end = (...args) => {
          span.metadata.statusCode = res.statusCode;
          span.metadata.responseSize = res.get('content-length') || 0;
          
          const status = res.statusCode >= 400 ? 'error' : 'success';
          this.finishSpan(span, status);
          
          originalEnd.apply(res, args);
        };

        next();
      });
    };
  }

  /**
   * Get current span from async context
   */
  getCurrentSpan() {
    const store = this.asyncStorage.getStore();
    return store?.span || null;
  }

  /**
   * Wrap async function with tracing
   */
  trace(operation, fn, metadata = {}) {
    return async (...args) => {
      const currentSpan = this.getCurrentSpan();
      const span = currentSpan ? 
        this.startChildSpan(currentSpan, operation, metadata) :
        this.startTrace(operation, metadata);

      if (!span) {
        return fn(...args);
      }

      try {
        const result = await this.asyncStorage.run({ span }, () => fn(...args));
        this.finishSpan(span, 'success');
        return result;
      } catch (error) {
        this.finishSpan(span, 'error', error);
        throw error;
      }
    };
  }

  /**
   * Check if we should sample this trace
   */
  shouldSample() {
    return Math.random() < this.options.sampleRate;
  }

  /**
   * Check if trace is complete and clean up
   */
  checkTraceCompletion(traceId) {
    // This could be more sophisticated - for now just batch completed spans
    if (this.completedSpans.size >= this.batchSize) {
      this.flushSpans();
    }
  }

  /**
   * Start batch processor
   */
  startBatchProcessor() {
    setInterval(() => {
      if (this.completedSpans.size > 0) {
        this.flushSpans();
      }
    }, this.flushInterval);

    // Clean up old active spans
    setInterval(() => {
      const now = Date.now();
      for (const [spanId, span] of this.spans.entries()) {
        if (now - span.startTime > this.options.maxSpanDuration) {
          this.finishSpan(span, 'timeout');
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Flush completed spans
   */
  async flushSpans() {
    if (this.completedSpans.size === 0) return;

    const spans = Array.from(this.completedSpans.values());
    this.completedSpans.clear();

    try {
      await this.sendSpans(spans);
    } catch (error) {
      console.error('Failed to flush spans:', error);
      // Could implement retry logic here
    }
  }

  /**
   * Send spans to tracing backend
   */
  async sendSpans(spans) {
    // Convert spans to format suitable for backend
    const serializedSpans = spans.map(span => ({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operationName: span.operation,
      serviceName: span.serviceName,
      startTime: span.startTime,
      endTime: span.endTime,
      duration: span.duration,
      status: span.status,
      tags: Object.fromEntries(span.tags),
      logs: span.logs,
      metadata: span.metadata,
      error: span.error || null
    }));

    // Send to configured backend (Jaeger, Zipkin, etc.)
    if (process.env.JAEGER_ENDPOINT) {
      await this.sendToJaeger(serializedSpans);
    } else if (process.env.ZIPKIN_ENDPOINT) {
      await this.sendToZipkin(serializedSpans);
    } else {
      // Fallback to console logging for development
      console.log('TRACING:', JSON.stringify(serializedSpans, null, 2));
    }
  }

  /**
   * Send spans to Jaeger
   */
  async sendToJaeger(spans) {
    try {
      const response = await fetch(`${process.env.JAEGER_ENDPOINT}/api/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{
            traceID: spans[0].traceId,
            spans: spans.map(span => ({
              traceID: span.traceId,
              spanID: span.spanId,
              parentSpanID: span.parentSpanId,
              operationName: span.operationName,
              startTime: span.startTime * 1000, // microseconds
              duration: span.duration * 1000, // microseconds
              tags: Object.entries(span.tags || {}).map(([key, value]) => ({
                key,
                type: typeof value === 'string' ? 'string' : 'number',
                value: String(value)
              })),
              logs: span.logs.map(log => ({
                timestamp: log.timestamp * 1000,
                fields: [
                  { key: 'level', value: log.level },
                  { key: 'message', value: log.message },
                  { key: 'data', value: JSON.stringify(log.data) }
                ]
              })),
              process: {
                serviceName: span.serviceName,
                tags: [
                  { key: 'hostname', value: process.env.HOSTNAME || 'unknown' },
                  { key: 'version', value: process.env.SERVICE_VERSION || '1.0.0' }
                ]
              }
            }))
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Jaeger request failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send spans to Jaeger:', error);
      throw error;
    }
  }

  /**
   * Send spans to Zipkin
   */
  async sendToZipkin(spans) {
    try {
      const zipkinSpans = spans.map(span => ({
        traceId: span.traceId.replace(/-/g, ''),
        id: span.spanId.replace(/-/g, ''),
        parentId: span.parentSpanId?.replace(/-/g, ''),
        name: span.operationName,
        timestamp: span.startTime * 1000, // microseconds
        duration: span.duration * 1000, // microseconds
        localEndpoint: {
          serviceName: span.serviceName,
          ipv4: '127.0.0.1'
        },
        tags: span.tags || {},
        annotations: span.logs.map(log => ({
          timestamp: log.timestamp * 1000,
          value: `${log.level}: ${log.message}`
        }))
      }));

      const response = await fetch(`${process.env.ZIPKIN_ENDPOINT}/api/v2/spans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(zipkinSpans)
      });

      if (!response.ok) {
        throw new Error(`Zipkin request failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send spans to Zipkin:', error);
      throw error;
    }
  }

  /**
   * Get metrics about tracing
   */
  getMetrics() {
    return {
      serviceName: this.serviceName,
      activeSpans: this.spans.size,
      pendingSpans: this.completedSpans.size,
      enabledTracing: this.options.enabledTracing,
      sampleRate: this.options.sampleRate
    };
  }

  /**
   * Shutdown and flush remaining spans
   */
  async shutdown() {
    if (this.completedSpans.size > 0) {
      await this.flushSpans();
    }
  }
}

// Export singleton for convenience
let globalTracer = null;

export const initializeTracer = (serviceName, options = {}) => {
  globalTracer = new DistributedTracer(serviceName, options);
  return globalTracer;
};

export const getTracer = () => {
  if (!globalTracer) {
    throw new Error('Tracer not initialized. Call initializeTracer() first.');
  }
  return globalTracer;
};

export const trace = (operation, fn, metadata = {}) => {
  return getTracer().trace(operation, fn, metadata);
};

export const getCurrentSpan = () => {
  return globalTracer?.getCurrentSpan() || null;
};

export const addLog = (level, message, data = {}) => {
  const span = getCurrentSpan();
  if (span && globalTracer) {
    globalTracer.addLog(span, level, message, data);
  }
};