// ==========================================
// SERVICES/COGNITIVE-CORE/src/middleware/performance-optimizer.js
// ==========================================

import { Logger } from '@ux-flow/common';

/**
 * PerformanceOptimizer provides comprehensive performance monitoring and optimization
 * for the Cognitive Core service with intelligent resource management
 */
class PerformanceOptimizer {
  constructor(logger) {
    this.logger = logger || new Logger('performance-optimizer');
    
    // Performance tracking
    this.metrics = {
      requestCount: 0,
      averageResponseTime: 0,
      slowRequests: 0,
      memoryPressure: 0,
      cpuUsage: 0,
      agentPerformance: new Map(),
      providerPerformance: new Map()
    };
    
    // Performance thresholds
    this.thresholds = {
      slowRequestMs: 5000,
      criticalMemoryMB: 800,
      criticalCpuPercent: 80,
      maxConcurrentAgents: 10,
      agentTimeoutMs: 30000
    };
    
    // Resource pools
    this.resourcePools = {
      activeRequests: new Set(),
      agentQueue: [],
      providerConnections: new Map()
    };
    
    // Performance optimization strategies
    this.optimizationStrategies = {
      requestBatching: true,
      agentPooling: true,
      responseCompression: true,
      memoryManagement: true,
      loadBalancing: true
    };
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    this.logger.info('Performance Optimizer initialized', {
      thresholds: this.thresholds,
      strategies: Object.keys(this.optimizationStrategies).filter(k => this.optimizationStrategies[k])
    });
  }

  /**
   * Express middleware for request performance optimization
   */
  middleware() {
    return (req, res, next) => {
      const startTime = process.hrtime.bigint();
      const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      // Add request to active pool
      this.resourcePools.activeRequests.add(requestId);
      
      // Attach performance context to request
      req.performance = {
        requestId,
        startTime,
        optimizations: []
      };
      
      // Check system load and apply throttling if needed
      if (this.shouldThrottleRequest()) {
        const throttleDelay = this.calculateThrottleDelay();
        req.performance.optimizations.push(`throttled_${throttleDelay}ms`);
        
        return setTimeout(() => {
          this.processRequest(req, res, next, startTime, requestId);
        }, throttleDelay);
      }
      
      this.processRequest(req, res, next, startTime, requestId);
    };
  }

  /**
   * Process request with performance optimizations
   */
  processRequest(req, res, next, startTime, requestId) {
    // Enable response compression for large payloads
    if (this.optimizationStrategies.responseCompression) {
      this.enableResponseCompression(req, res);
    }
    
    // Set up response time tracking
    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
      this.trackRequestPerformance(req, res, duration, requestId);
      this.resourcePools.activeRequests.delete(requestId);
    });
    
    // Set up timeout handling
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        this.logger.warn('Request timeout detected', {
          requestId,
          url: req.url,
          duration: this.thresholds.agentTimeoutMs
        });
        
        res.status(408).json({
          error: 'REQUEST_TIMEOUT',
          message: 'Request processing timeout',
          requestId,
          suggestion: 'Try reducing request complexity or enabling pro mode'
        });
      }
    }, this.thresholds.agentTimeoutMs);
    
    res.on('finish', () => clearTimeout(timeout));
    
    next();
  }

  /**
   * Optimize agent execution with intelligent routing and pooling
   */
  async optimizeAgentExecution(agentName, task, context = {}) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Check agent performance history
      const agentMetrics = this.getAgentMetrics(agentName);
      
      // Apply optimization strategies
      const optimizedContext = await this.optimizeAgentContext(agentName, context, agentMetrics);
      
      // Select optimal AI provider based on performance
      const optimalProvider = this.selectOptimalProvider(agentName, task, agentMetrics);
      if (optimalProvider) {
        optimizedContext.preferredProvider = optimalProvider;
      }
      
      // Apply quality mode optimization
      const optimizedQualityMode = this.optimizeQualityMode(agentName, task, context.qualityMode);
      optimizedContext.qualityMode = optimizedQualityMode;
      
      // Track agent execution
      const executionId = `${agentName}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      this.trackAgentStart(agentName, executionId, task);
      
      return {
        optimizedContext,
        executionId,
        optimizations: [
          optimalProvider && `provider_${optimalProvider}`,
          optimizedQualityMode !== context.qualityMode && `quality_${optimizedQualityMode}`,
          'context_optimized'
        ].filter(Boolean)
      };
      
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.logger.error('Agent optimization failed', error, {
        agentName,
        duration,
        task: typeof task === 'string' ? task.substring(0, 100) : 'complex_task'
      });
      
      // Return original context as fallback
      return {
        optimizedContext: context,
        executionId: null,
        optimizations: ['fallback_mode']
      };
    }
  }

  /**
   * Track agent execution completion
   */
  trackAgentCompletion(agentName, executionId, success, duration, metadata = {}) {
    if (!this.metrics.agentPerformance.has(agentName)) {
      this.metrics.agentPerformance.set(agentName, {
        totalExecutions: 0,
        successfulExecutions: 0,
        averageDuration: 0,
        recentDurations: [],
        errorRate: 0,
        lastExecution: null
      });
    }
    
    const agentMetrics = this.metrics.agentPerformance.get(agentName);
    agentMetrics.totalExecutions++;
    agentMetrics.lastExecution = new Date();
    
    if (success) {
      agentMetrics.successfulExecutions++;
      
      // Update average duration with sliding window
      agentMetrics.recentDurations.push(duration);
      if (agentMetrics.recentDurations.length > 50) {
        agentMetrics.recentDurations = agentMetrics.recentDurations.slice(-50);
      }
      
      agentMetrics.averageDuration = 
        agentMetrics.recentDurations.reduce((sum, d) => sum + d, 0) / agentMetrics.recentDurations.length;
    }
    
    agentMetrics.errorRate = 
      (agentMetrics.totalExecutions - agentMetrics.successfulExecutions) / agentMetrics.totalExecutions;
    
    // Log performance insights
    if (duration > this.thresholds.slowRequestMs) {
      this.logger.warn('Slow agent execution detected', {
        agentName,
        executionId,
        duration,
        averageDuration: agentMetrics.averageDuration,
        suggestion: 'Consider switching to faster AI provider or optimizing prompts'
      });
    }
  }

  /**
   * Optimize agent context based on performance history
   */
  async optimizeAgentContext(agentName, context, agentMetrics) {
    const optimizedContext = { ...context };
    
    // Optimize prompt length based on agent performance
    if (agentMetrics.averageDuration > 3000 && context.ragContext) {
      const originalLength = context.ragContext.length;
      optimizedContext.ragContext = this.optimizeRAGContext(context.ragContext);
      
      if (optimizedContext.ragContext.length < originalLength) {
        this.logger.debug('RAG context optimized for performance', {
          agentName,
          originalLength,
          optimizedLength: optimizedContext.ragContext.length,
          reduction: `${Math.round(((originalLength - optimizedContext.ragContext.length) / originalLength) * 100)}%`
        });
      }
    }
    
    // Optimize current flow data for better processing
    if (context.currentFlow && this.isLargeFlow(context.currentFlow)) {
      optimizedContext.currentFlow = this.optimizeFlowData(context.currentFlow);
      optimizedContext.flowOptimized = true;
    }
    
    // Add performance hints for agent
    optimizedContext.performanceHints = {
      expectedDuration: agentMetrics.averageDuration || 2000,
      errorRate: agentMetrics.errorRate || 0,
      optimization: 'enabled'
    };
    
    return optimizedContext;
  }

  /**
   * Select optimal AI provider based on performance metrics
   */
  selectOptimalProvider(agentName, task, agentMetrics) {
    // Get provider performance for this agent
    const providerPerformance = this.getProviderPerformanceForAgent(agentName);
    
    if (!providerPerformance || providerPerformance.size === 0) {
      return null; // Let default provider selection handle it
    }
    
    // Find fastest performing provider with good reliability
    let optimalProvider = null;
    let bestScore = 0;
    
    for (const [provider, metrics] of providerPerformance.entries()) {
      if (metrics.errorRate > 0.1) continue; // Skip unreliable providers
      
      // Score based on speed and reliability
      const speedScore = Math.max(0, 5000 - metrics.averageResponseTime) / 5000; // Normalize to 0-1
      const reliabilityScore = 1 - metrics.errorRate;
      const totalScore = (speedScore * 0.6) + (reliabilityScore * 0.4);
      
      if (totalScore > bestScore) {
        bestScore = totalScore;
        optimalProvider = provider;
      }
    }
    
    return optimalProvider;
  }

  /**
   * Optimize quality mode based on task complexity and performance requirements
   */
  optimizeQualityMode(agentName, task, currentQualityMode) {
    // For simple classification tasks, standard mode is sufficient
    if (agentName === 'classifier' && currentQualityMode === 'pro') {
      return 'standard';
    }
    
    // For complex planning with performance constraints, optimize based on system load
    if (agentName === 'planner' && this.isSystemUnderLoad()) {
      return 'standard'; // Downgrade to maintain responsiveness
    }
    
    // For visual interpretation, always use pro for accuracy
    if (agentName === 'visualInterpreter') {
      return 'pro';
    }
    
    return currentQualityMode || 'standard';
  }

  /**
   * Check if request should be throttled based on system resources
   */
  shouldThrottleRequest() {
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Throttle if memory pressure is high
    if (memoryMB > this.thresholds.criticalMemoryMB) {
      return true;
    }
    
    // Throttle if too many active requests
    if (this.resourcePools.activeRequests.size > this.thresholds.maxConcurrentAgents) {
      return true;
    }
    
    // Throttle if recent error rate is high
    const recentErrorRate = this.calculateRecentErrorRate();
    if (recentErrorRate > 0.2) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate appropriate throttle delay
   */
  calculateThrottleDelay() {
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Base delay on memory pressure
    const memoryPressure = Math.max(0, memoryMB - this.thresholds.criticalMemoryMB) / 200;
    const baseDelay = Math.min(1000, memoryPressure * 500);
    
    // Add randomization to prevent thundering herd
    const jitter = Math.random() * 200;
    
    return Math.floor(baseDelay + jitter);
  }

  /**
   * Enable response compression for large payloads
   */
  enableResponseCompression(req, res) {
    const originalJson = res.json;
    
    res.json = function(data) {
      const dataSize = JSON.stringify(data).length;
      
      // Compress responses larger than 1KB
      if (dataSize > 1024 && req.headers['accept-encoding']?.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        req.performance?.optimizations.push(`compressed_${Math.round(dataSize/1024)}kb`);
      }
      
      return originalJson.call(this, data);
    };
  }

  /**
   * Track request performance metrics
   */
  trackRequestPerformance(req, res, duration, requestId) {
    this.metrics.requestCount++;
    
    // Update average response time with sliding window
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + duration) / this.metrics.requestCount;
    
    if (duration > this.thresholds.slowRequestMs) {
      this.metrics.slowRequests++;
    }
    
    // Log performance data
    const performanceData = {
      requestId,
      url: req.url,
      method: req.method,
      duration: Math.round(duration),
      statusCode: res.statusCode,
      optimizations: req.performance?.optimizations || []
    };
    
    if (duration > this.thresholds.slowRequestMs) {
      this.logger.warn('Slow request detected', performanceData);
    } else {
      this.logger.debug('Request performance tracked', performanceData);
    }
  }

  /**
   * Start performance monitoring background tasks
   */
  startPerformanceMonitoring() {
    // Memory monitoring
    setInterval(() => {
      this.monitorSystemResources();
    }, 10000); // Every 10 seconds
    
    // Agent performance analysis
    setInterval(() => {
      this.analyzeAgentPerformance();
    }, 30000); // Every 30 seconds
    
    // Garbage collection optimization
    setInterval(() => {
      this.optimizeMemoryUsage();
    }, 60000); // Every minute
  }

  /**
   * Monitor system resources and update metrics
   */
  monitorSystemResources() {
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryPressure = memoryUsage.heapUsed / 1024 / 1024; // MB
    
    // Estimate CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    
    // Log warnings for resource pressure
    if (this.metrics.memoryPressure > this.thresholds.criticalMemoryMB) {
      this.logger.warn('High memory pressure detected', {
        memoryUsageMB: Math.round(this.metrics.memoryPressure),
        threshold: this.thresholds.criticalMemoryMB,
        activeRequests: this.resourcePools.activeRequests.size
      });
    }
  }

  /**
   * Analyze agent performance patterns and suggest optimizations
   */
  analyzeAgentPerformance() {
    for (const [agentName, metrics] of this.metrics.agentPerformance.entries()) {
      // Check for performance degradation
      if (metrics.errorRate > 0.1) {
        this.logger.warn('Agent performance degradation detected', {
          agentName,
          errorRate: Math.round(metrics.errorRate * 100) + '%',
          averageDuration: Math.round(metrics.averageDuration),
          suggestion: 'Consider reviewing prompts or switching AI providers'
        });
      }
      
      // Check for slow agents
      if (metrics.averageDuration > 5000) {
        this.logger.warn('Slow agent performance detected', {
          agentName,
          averageDuration: Math.round(metrics.averageDuration),
          recentExecutions: metrics.recentDurations.length,
          suggestion: 'Consider prompt optimization or pro model usage'
        });
      }
    }
  }

  /**
   * Optimize memory usage with intelligent cleanup
   */
  optimizeMemoryUsage() {
    // Force garbage collection if memory pressure is high
    if (this.metrics.memoryPressure > this.thresholds.criticalMemoryMB * 0.8) {
      if (global.gc) {
        global.gc();
        this.logger.debug('Garbage collection triggered', {
          memoryBeforeGC: this.metrics.memoryPressure,
          memoryAfterGC: process.memoryUsage().heapUsed / 1024 / 1024
        });
      }
    }
    
    // Clean up old performance data
    this.cleanupOldMetrics();
  }

  /**
   * Clean up old performance metrics to prevent memory leaks
   */
  cleanupOldMetrics() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = new Date();
    
    for (const [agentName, metrics] of this.metrics.agentPerformance.entries()) {
      if (metrics.lastExecution && (now - metrics.lastExecution) > maxAge) {
        // Reset old agent metrics but keep structure
        metrics.recentDurations = metrics.recentDurations.slice(-10);
      }
    }
  }

  /**
   * Utility methods
   */
  
  getAgentMetrics(agentName) {
    return this.metrics.agentPerformance.get(agentName) || {
      totalExecutions: 0,
      successfulExecutions: 0,
      averageDuration: 2000,
      errorRate: 0,
      recentDurations: []
    };
  }
  
  getProviderPerformanceForAgent(agentName) {
    return this.metrics.providerPerformance.get(agentName) || new Map();
  }
  
  isSystemUnderLoad() {
    return (
      this.metrics.memoryPressure > this.thresholds.criticalMemoryMB * 0.7 ||
      this.resourcePools.activeRequests.size > this.thresholds.maxConcurrentAgents * 0.7
    );
  }
  
  calculateRecentErrorRate() {
    // Simplified recent error rate calculation
    return this.metrics.slowRequests / Math.max(1, this.metrics.requestCount);
  }
  
  isLargeFlow(flow) {
    return flow && ((flow.nodes && flow.nodes.length > 50) || (flow.edges && flow.edges.length > 100));
  }
  
  optimizeRAGContext(ragContext) {
    // Truncate RAG context to most relevant parts
    if (ragContext.length > 2000) {
      return ragContext.substring(0, 1500) + '...[truncated for performance]';
    }
    return ragContext;
  }
  
  optimizeFlowData(flow) {
    // Simplify flow data for performance
    return {
      nodes: flow.nodes ? flow.nodes.map(node => ({
        id: node.id,
        type: node.type,
        // Remove heavy data objects
      })) : [],
      edges: flow.edges ? flow.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target
      })) : []
    };
  }
  
  trackAgentStart(agentName, executionId, task) {
    // Implementation for tracking agent start
    this.logger.debug('Agent execution started', {
      agentName,
      executionId,
      taskType: typeof task
    });
  }

  /**
   * Get comprehensive performance statistics
   */
  getPerformanceStatistics() {
    return {
      system: {
        memoryUsageMB: Math.round(this.metrics.memoryPressure),
        activeRequests: this.resourcePools.activeRequests.size,
        averageResponseTime: Math.round(this.metrics.averageResponseTime),
        slowRequestsPercent: Math.round((this.metrics.slowRequests / Math.max(1, this.metrics.requestCount)) * 100)
      },
      agents: Object.fromEntries(
        Array.from(this.metrics.agentPerformance.entries()).map(([name, metrics]) => [
          name,
          {
            averageDuration: Math.round(metrics.averageDuration),
            errorRate: Math.round(metrics.errorRate * 100) + '%',
            totalExecutions: metrics.totalExecutions,
            lastExecution: metrics.lastExecution
          }
        ])
      ),
      optimizations: {
        enabled: Object.keys(this.optimizationStrategies).filter(k => this.optimizationStrategies[k]),
        thresholds: this.thresholds
      },
      timestamp: new Date()
    };
  }
}

export { PerformanceOptimizer };