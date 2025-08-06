// ==========================================
// COGNITIVE CORE SERVICE - Advanced Metrics Collection
// ==========================================

import { performance } from 'perf_hooks';
import { EventTypes } from '@ux-flow/common';

/**
 * Advanced Metrics Collector for Production Monitoring
 */
export class MetricsCollector {
  constructor(logger, eventEmitter) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    
    // Metrics storage
    this.httpMetrics = new Map();
    this.agentMetrics = new Map();
    this.aiProviderMetrics = new Map();
    this.conversationMetrics = new Map();
    this.systemMetrics = new Map();
    
    // Performance tracking
    this.performanceTracker = new Map();
    this.slidingWindows = new Map();
    
    // System resource tracking
    this.resourceUsage = {
      memory: [],
      cpu: [],
      eventLoop: []
    };
    
    this.startTime = Date.now();
    this.setupPeriodicCollection();
  }

  /**
   * HTTP Request Metrics Middleware
   */
  httpMetricsMiddleware() {
    return (req, res, next) => {
      const startTime = performance.now();
      const startMemory = process.memoryUsage();
      
      // Generate request ID if not exists
      req.requestId = req.requestId || this.generateRequestId();
      
      // Track request start
      this.performanceTracker.set(req.requestId, {
        startTime,
        startMemory,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent')
      });

      // Override res.end to capture metrics
      const originalEnd = res.end;
      res.end = (...args) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const endMemory = process.memoryUsage();
        
        // Record HTTP metrics
        this.recordHttpMetric({
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
          requestId: req.requestId,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
        
        // Cleanup tracking
        this.performanceTracker.delete(req.requestId);
        
        // Call original end
        originalEnd.apply(res, args);
      };

      next();
    };
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpMetric(metric) {
    const key = `${metric.method}_${this.normalizeUrl(metric.url)}`;
    
    if (!this.httpMetrics.has(key)) {
      this.httpMetrics.set(key, {
        method: metric.method,
        url: metric.url,
        totalRequests: 0,
        successfulRequests: 0,
        errorRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        statusCodes: new Map(),
        lastRequest: null,
        memoryUsage: []
      });
    }

    const metrics = this.httpMetrics.get(key);
    metrics.totalRequests++;
    metrics.lastRequest = new Date();
    
    // Update response time statistics
    metrics.averageResponseTime = this.updateAverage(
      metrics.averageResponseTime,
      metric.duration,
      metrics.totalRequests
    );
    metrics.minResponseTime = Math.min(metrics.minResponseTime, metric.duration);
    metrics.maxResponseTime = Math.max(metrics.maxResponseTime, metric.duration);
    
    // Track status codes
    const statusCode = metric.statusCode.toString();
    const currentCount = metrics.statusCodes.get(statusCode) || 0;
    metrics.statusCodes.set(statusCode, currentCount + 1);
    
    // Track success/error rates
    if (metric.statusCode >= 200 && metric.statusCode < 400) {
      metrics.successfulRequests++;
    } else {
      metrics.errorRequests++;
    }
    
    // Track memory usage (keep last 100 samples)
    metrics.memoryUsage.push({
      timestamp: Date.now(),
      delta: metric.memoryDelta
    });
    if (metrics.memoryUsage.length > 100) {
      metrics.memoryUsage.shift();
    }

    // Log slow requests
    if (metric.duration > 5000) { // 5 seconds
      this.logger.warn('Slow HTTP request detected', {
        method: metric.method,
        url: metric.url,
        duration: metric.duration,
        statusCode: metric.statusCode,
        requestId: metric.requestId
      });
    }

    // Update sliding window metrics
    this.updateSlidingWindow('http_requests', key, metric.duration);
  }

  /**
   * Record agent performance metrics
   */
  recordAgentMetric(agentName, taskId, duration, success, metadata = {}) {
    if (!this.agentMetrics.has(agentName)) {
      this.agentMetrics.set(agentName, {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        lastExecution: null,
        errorTypes: new Map(),
        qualityModeStats: new Map(),
        tokenUsage: []
      });
    }

    const metrics = this.agentMetrics.get(agentName);
    metrics.totalTasks++;
    metrics.lastExecution = new Date();
    
    // Update execution time statistics
    metrics.averageExecutionTime = this.updateAverage(
      metrics.averageExecutionTime,
      duration,
      metrics.totalTasks
    );
    metrics.minExecutionTime = Math.min(metrics.minExecutionTime, duration);
    metrics.maxExecutionTime = Math.max(metrics.maxExecutionTime, duration);
    
    // Track success/failure
    if (success) {
      metrics.successfulTasks++;
    } else {
      metrics.failedTasks++;
      
      // Track error types
      if (metadata.errorType) {
        const currentCount = metrics.errorTypes.get(metadata.errorType) || 0;
        metrics.errorTypes.set(metadata.errorType, currentCount + 1);
      }
    }
    
    // Track quality mode usage
    if (metadata.qualityMode) {
      const qmStats = metrics.qualityModeStats.get(metadata.qualityMode) || {
        count: 0,
        averageTime: 0
      };
      qmStats.count++;
      qmStats.averageTime = this.updateAverage(qmStats.averageTime, duration, qmStats.count);
      metrics.qualityModeStats.set(metadata.qualityMode, qmStats);
    }
    
    // Track token usage
    if (metadata.tokenUsage) {
      metrics.tokenUsage.push({
        timestamp: Date.now(),
        input: metadata.tokenUsage.input || 0,
        output: metadata.tokenUsage.output || 0,
        total: metadata.tokenUsage.total || 0
      });
      // Keep last 1000 samples
      if (metrics.tokenUsage.length > 1000) {
        metrics.tokenUsage.shift();
      }
    }

    // Update sliding window
    this.updateSlidingWindow('agent_execution', agentName, duration);

    // Alert on high failure rate
    const failureRate = metrics.failedTasks / metrics.totalTasks;
    if (failureRate > 0.1 && metrics.totalTasks > 10) { // 10% failure rate with at least 10 tasks
      this.logger.warn('High agent failure rate detected', {
        agentName,
        failureRate: Math.round(failureRate * 100) + '%',
        totalTasks: metrics.totalTasks,
        failedTasks: metrics.failedTasks
      });
    }
  }

  /**
   * Record AI provider metrics
   */
  recordAIProviderMetric(provider, operation, duration, success, metadata = {}) {
    if (!this.aiProviderMetrics.has(provider)) {
      this.aiProviderMetrics.set(provider, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        operations: new Map(),
        errorTypes: new Map(),
        rateLimitHits: 0,
        tokenUsage: {
          total: 0,
          input: 0,
          output: 0
        },
        costEstimate: 0,
        lastUsed: null
      });
    }

    const metrics = this.aiProviderMetrics.get(provider);
    metrics.totalRequests++;
    metrics.lastUsed = new Date();
    
    // Update response time statistics
    metrics.averageResponseTime = this.updateAverage(
      metrics.averageResponseTime,
      duration,
      metrics.totalRequests
    );
    metrics.minResponseTime = Math.min(metrics.minResponseTime, duration);
    metrics.maxResponseTime = Math.max(metrics.maxResponseTime, duration);
    
    // Track operations
    if (!metrics.operations.has(operation)) {
      metrics.operations.set(operation, {
        count: 0,
        averageTime: 0,
        successes: 0,
        failures: 0
      });
    }
    const opMetrics = metrics.operations.get(operation);
    opMetrics.count++;
    opMetrics.averageTime = this.updateAverage(opMetrics.averageTime, duration, opMetrics.count);
    
    // Track success/failure
    if (success) {
      metrics.successfulRequests++;
      opMetrics.successes++;
    } else {
      metrics.failedRequests++;
      opMetrics.failures++;
      
      // Track error types
      if (metadata.errorType) {
        const currentCount = metrics.errorTypes.get(metadata.errorType) || 0;
        metrics.errorTypes.set(metadata.errorType, currentCount + 1);
        
        // Track rate limit hits specifically
        if (metadata.errorType === 'RateLimitError') {
          metrics.rateLimitHits++;
        }
      }
    }
    
    // Track token usage
    if (metadata.tokenUsage) {
      metrics.tokenUsage.total += metadata.tokenUsage.total || 0;
      metrics.tokenUsage.input += metadata.tokenUsage.input || 0;
      metrics.tokenUsage.output += metadata.tokenUsage.output || 0;
      
      // Estimate cost (rough approximation)
      if (provider === 'google-gemini') {
        metrics.costEstimate += (metadata.tokenUsage.total || 0) * 0.00015 / 1000;
      } else if (provider === 'openai') {
        metrics.costEstimate += (metadata.tokenUsage.total || 0) * 0.002 / 1000;
      }
    }

    // Update sliding window
    this.updateSlidingWindow('ai_provider', provider, duration);
  }

  /**
   * Record conversation metrics
   */
  recordConversationMetric(conversationId, event, metadata = {}) {
    if (!this.conversationMetrics.has(conversationId)) {
      this.conversationMetrics.set(conversationId, {
        startTime: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        planCount: 0,
        planApprovalRate: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        agentsUsed: new Set(),
        averageResponseTime: 0,
        stateTransitions: []
      });
    }

    const metrics = this.conversationMetrics.get(conversationId);
    metrics.lastActivity = Date.now();
    
    switch (event) {
      case 'message_received':
        metrics.messageCount++;
        break;
        
      case 'plan_generated':
        metrics.planCount++;
        if (metadata.agentsUsed) {
          metadata.agentsUsed.forEach(agent => metrics.agentsUsed.add(agent));
        }
        break;
        
      case 'plan_approved':
        metrics.approvedPlans++;
        metrics.planApprovalRate = metrics.approvedPlans / metrics.planCount;
        break;
        
      case 'plan_rejected':
        metrics.rejectedPlans++;
        metrics.planApprovalRate = metrics.approvedPlans / metrics.planCount;
        break;
        
      case 'response_sent':
        if (metadata.responseTime) {
          metrics.averageResponseTime = this.updateAverage(
            metrics.averageResponseTime,
            metadata.responseTime,
            metrics.messageCount
          );
        }
        break;
        
      case 'state_transition':
        metrics.stateTransitions.push({
          from: metadata.fromState,
          to: metadata.toState,
          timestamp: Date.now()
        });
        // Keep last 50 transitions
        if (metrics.stateTransitions.length > 50) {
          metrics.stateTransitions.shift();
        }
        break;
    }
  }

  /**
   * Update sliding window metrics
   */
  updateSlidingWindow(category, key, value, windowSizeMs = 300000) { // 5 minutes
    const windowKey = `${category}_${key}`;
    
    if (!this.slidingWindows.has(windowKey)) {
      this.slidingWindows.set(windowKey, []);
    }
    
    const window = this.slidingWindows.get(windowKey);
    const now = Date.now();
    
    // Add new value
    window.push({ timestamp: now, value });
    
    // Remove old values outside window
    const cutoff = now - windowSizeMs;
    while (window.length > 0 && window[0].timestamp < cutoff) {
      window.shift();
    }
  }

  /**
   * Setup periodic system metrics collection
   */
  setupPeriodicCollection() {
    // Collect system metrics every 30 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // Collect event loop lag every 10 seconds
    this.eventLoopInterval = setInterval(() => {
      this.measureEventLoopLag();
    }, 10000);
    
    // Emit metrics summary every 5 minutes
    this.summaryInterval = setInterval(() => {
      this.emitMetricsSummary();
    }, 300000);
  }

  /**
   * Collect system resource metrics
   */
  collectSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.resourceUsage.memory.push({
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss
    });
    
    this.resourceUsage.cpu.push({
      timestamp: Date.now(),
      user: cpuUsage.user,
      system: cpuUsage.system
    });
    
    // Keep last 1000 samples (about 8 hours)
    if (this.resourceUsage.memory.length > 1000) {
      this.resourceUsage.memory.shift();
    }
    if (this.resourceUsage.cpu.length > 1000) {
      this.resourceUsage.cpu.shift();
    }
    
    // Alert on high memory usage
    if (memoryUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
      this.logger.warn('High memory usage detected', {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
      });
    }
  }

  /**
   * Measure event loop lag
   */
  measureEventLoopLag() {
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      
      this.resourceUsage.eventLoop.push({
        timestamp: Date.now(),
        lag
      });
      
      // Keep last 1000 samples
      if (this.resourceUsage.eventLoop.length > 1000) {
        this.resourceUsage.eventLoop.shift();
      }
      
      // Alert on high event loop lag
      if (lag > 100) { // 100ms
        this.logger.warn('High event loop lag detected', {
          lag: Math.round(lag) + 'ms'
        });
      }
    });
  }

  /**
   * Emit periodic metrics summary
   */
  emitMetricsSummary() {
    const summary = this.getMetricsSummary();
    
    this.logger.info('Metrics summary', summary);
    
    this.eventEmitter.emit(EventTypes.METRICS_SUMMARY, {
      service: 'cognitive-core',
      timestamp: new Date(),
      summary
    });
  }

  /**
   * Get comprehensive metrics summary
   */
  getMetricsSummary() {
    const now = Date.now();
    const uptime = now - this.startTime;
    
    // HTTP metrics summary
    const httpSummary = this.summarizeHttpMetrics();
    const agentSummary = this.summarizeAgentMetrics();
    const aiProviderSummary = this.summarizeAIProviderMetrics();
    const conversationSummary = this.summarizeConversationMetrics();
    const systemSummary = this.summarizeSystemMetrics();
    
    return {
      uptime,
      timestamp: new Date(),
      http: httpSummary,
      agents: agentSummary,
      aiProviders: aiProviderSummary,
      conversations: conversationSummary,
      system: systemSummary
    };
  }

  /**
   * Summarize HTTP metrics
   */
  summarizeHttpMetrics() {
    let totalRequests = 0;
    let totalErrors = 0;
    let averageResponseTime = 0;
    const endpointStats = {};
    
    for (const [endpoint, metrics] of this.httpMetrics.entries()) {
      totalRequests += metrics.totalRequests;
      totalErrors += metrics.errorRequests;
      averageResponseTime += metrics.averageResponseTime * metrics.totalRequests;
      
      endpointStats[endpoint] = {
        requests: metrics.totalRequests,
        errors: metrics.errorRequests,
        averageTime: Math.round(metrics.averageResponseTime),
        errorRate: metrics.errorRequests / metrics.totalRequests
      };
    }
    
    return {
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      averageResponseTime: totalRequests > 0 ? averageResponseTime / totalRequests : 0,
      endpoints: endpointStats
    };
  }

  /**
   * Summarize agent metrics
   */
  summarizeAgentMetrics() {
    let totalTasks = 0;
    let totalFailures = 0;
    const agentStats = {};
    
    for (const [agentName, metrics] of this.agentMetrics.entries()) {
      totalTasks += metrics.totalTasks;
      totalFailures += metrics.failedTasks;
      
      agentStats[agentName] = {
        tasks: metrics.totalTasks,
        failures: metrics.failedTasks,
        averageTime: Math.round(metrics.averageExecutionTime),
        failureRate: metrics.failedTasks / metrics.totalTasks,
        qualityModes: Object.fromEntries(metrics.qualityModeStats)
      };
    }
    
    return {
      totalTasks,
      totalFailures,
      overallFailureRate: totalTasks > 0 ? totalFailures / totalTasks : 0,
      agents: agentStats
    };
  }

  /**
   * Summarize AI provider metrics
   */
  summarizeAIProviderMetrics() {
    const providerStats = {};
    let totalCost = 0;
    let totalTokens = 0;
    
    for (const [provider, metrics] of this.aiProviderMetrics.entries()) {
      totalCost += metrics.costEstimate;
      totalTokens += metrics.tokenUsage.total;
      
      providerStats[provider] = {
        requests: metrics.totalRequests,
        failures: metrics.failedRequests,
        averageTime: Math.round(metrics.averageResponseTime),
        failureRate: metrics.failedRequests / metrics.totalRequests,
        tokenUsage: metrics.tokenUsage.total,
        costEstimate: Math.round(metrics.costEstimate * 1000) / 1000,
        rateLimitHits: metrics.rateLimitHits
      };
    }
    
    return {
      totalCost: Math.round(totalCost * 1000) / 1000,
      totalTokens,
      providers: providerStats
    };
  }

  /**
   * Summarize conversation metrics
   */
  summarizeConversationMetrics() {
    let totalConversations = this.conversationMetrics.size;
    let totalMessages = 0;
    let totalPlans = 0;
    let totalApprovals = 0;
    
    for (const metrics of this.conversationMetrics.values()) {
      totalMessages += metrics.messageCount;
      totalPlans += metrics.planCount;
      totalApprovals += metrics.approvedPlans;
    }
    
    return {
      activeConversations: totalConversations,
      totalMessages,
      totalPlans,
      overallApprovalRate: totalPlans > 0 ? totalApprovals / totalPlans : 0,
      averageMessagesPerConversation: totalConversations > 0 ? totalMessages / totalConversations : 0
    };
  }

  /**
   * Summarize system metrics
   */
  summarizeSystemMetrics() {
    const currentMemory = process.memoryUsage();
    const recentEventLoopLag = this.resourceUsage.eventLoop.slice(-10);
    const avgEventLoopLag = recentEventLoopLag.length > 0 
      ? recentEventLoopLag.reduce((sum, sample) => sum + sample.lag, 0) / recentEventLoopLag.length
      : 0;
    
    return {
      memory: {
        heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024),
        external: Math.round(currentMemory.external / 1024 / 1024),
        rss: Math.round(currentMemory.rss / 1024 / 1024)
      },
      eventLoop: {
        averageLag: Math.round(avgEventLoopLag * 100) / 100
      },
      uptime: Math.round((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusMetrics() {
    const metrics = [];
    
    // HTTP metrics
    for (const [endpoint, data] of this.httpMetrics.entries()) {
      const labels = `{method="${data.method}",endpoint="${endpoint}"}`;
      metrics.push(`http_requests_total${labels} ${data.totalRequests}`);
      metrics.push(`http_request_duration_seconds${labels} ${data.averageResponseTime / 1000}`);
      metrics.push(`http_errors_total${labels} ${data.errorRequests}`);
    }
    
    // Agent metrics
    for (const [agentName, data] of this.agentMetrics.entries()) {
      const labels = `{agent="${agentName}"}`;
      metrics.push(`agent_tasks_total${labels} ${data.totalTasks}`);
      metrics.push(`agent_task_duration_seconds${labels} ${data.averageExecutionTime / 1000}`);
      metrics.push(`agent_failures_total${labels} ${data.failedTasks}`);
    }
    
    // AI Provider metrics
    for (const [provider, data] of this.aiProviderMetrics.entries()) {
      const labels = `{provider="${provider}"}`;
      metrics.push(`ai_provider_requests_total${labels} ${data.totalRequests}`);
      metrics.push(`ai_provider_duration_seconds${labels} ${data.averageResponseTime / 1000}`);
      metrics.push(`ai_provider_failures_total${labels} ${data.failedRequests}`);
      metrics.push(`ai_provider_tokens_total${labels} ${data.tokenUsage.total}`);
    }
    
    // System metrics
    const memory = process.memoryUsage();
    metrics.push(`process_heap_bytes ${memory.heapUsed}`);
    metrics.push(`process_resident_memory_bytes ${memory.rss}`);
    
    return metrics.join('\n');
  }

  /**
   * Helper methods
   */
  updateAverage(currentAvg, newValue, totalCount) {
    return (currentAvg * (totalCount - 1) + newValue) / totalCount;
  }

  normalizeUrl(url) {
    // Remove query params and normalize IDs
    return url.replace(/\?.*$/, '')
              .replace(/\/[0-9a-fA-F]{24}$/, '/:id')
              .replace(/\/\d+$/, '/:id');
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Cleanup and shutdown
   */
  shutdown() {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    if (this.eventLoopInterval) {
      clearInterval(this.eventLoopInterval);
    }
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
    }
    
    this.logger.info('Metrics collector shut down');
  }
}

export default MetricsCollector;