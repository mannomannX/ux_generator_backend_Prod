// ==========================================
// PACKAGES/COMMON/src/monitoring/index.js
// ==========================================
export {
  DistributedTracer,
  initializeTracer,
  getTracer,
  trace,
  getCurrentSpan,
  addLog
} from './distributed-tracer.js';

export {
  SystemMetrics,
  initializeSystemMetrics,
  getSystemMetrics
} from './system-metrics.js';

export {
  PerformanceMonitor,
  initializePerformanceMonitor,
  getPerformanceMonitor
} from './performance-monitor.js';

// Re-export existing monitoring modules
export * from './sentry.js';
export * from './metrics.js';