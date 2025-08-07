/**
 * GDPR-Compliant Analytics Tracker
 * 
 * Tracks agent performance metrics in a privacy-preserving way:
 * - All data is anonymized
 * - No PII is stored
 * - Data is aggregated before storage
 * - Users can opt-out
 * - Data retention policies enforced
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class GDPRAnalytics extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: process.env.ENABLE_ANALYTICS !== 'false',
      retentionDays: config.retentionDays || 90,
      aggregationInterval: config.aggregationInterval || 300000, // 5 minutes
      anonymizationSalt: process.env.ANALYTICS_SALT || crypto.randomBytes(32).toString('hex'),
      ...config
    };

    // Analytics storage (in production, use time-series DB)
    this.metrics = {
      agents: new Map(),      // Agent performance metrics
      models: new Map(),      // Model usage metrics
      responses: new Map(),   // Response quality metrics
      errors: new Map()       // Error tracking
    };

    // Aggregated metrics
    this.aggregated = {
      hourly: new Map(),
      daily: new Map(),
      weekly: new Map()
    };

    // User consent tracking
    this.userConsent = new Map();
    
    // Aggregation timer
    this.aggregationTimer = null;
    
    // Start aggregation
    if (this.config.enabled) {
      this.startAggregation();
    }
  }

  /**
   * Check if user has consented to analytics
   */
  hasConsent(userId) {
    // Check if analytics is globally enabled
    if (!this.config.enabled) return false;
    
    // Anonymize user ID
    const hashedUserId = this.anonymizeId(userId);
    
    // Check consent (default to false for GDPR compliance)
    return this.userConsent.get(hashedUserId) === true;
  }

  /**
   * Record user consent
   */
  recordConsent(userId, consent) {
    const hashedUserId = this.anonymizeId(userId);
    
    if (consent) {
      this.userConsent.set(hashedUserId, true);
      this.emit('consent-granted', { hashedUserId, timestamp: Date.now() });
    } else {
      this.userConsent.delete(hashedUserId);
      // Also delete any existing data for this user
      this.deleteUserData(hashedUserId);
      this.emit('consent-revoked', { hashedUserId, timestamp: Date.now() });
    }
    
    return {
      recorded: true,
      userId: hashedUserId,
      consent
    };
  }

  /**
   * Track agent response metrics (GDPR-compliant)
   */
  trackAgentResponse(data) {
    // Check consent first
    if (!this.hasConsent(data.userId)) {
      return { tracked: false, reason: 'no_consent' };
    }
    
    // Anonymize all identifiable data
    const anonymized = this.anonymizeData(data);
    
    // Extract metrics
    const metrics = {
      timestamp: Date.now(),
      agent: anonymized.agent,
      provider: anonymized.provider,
      model: anonymized.model,
      qualityMode: anonymized.qualityMode,
      
      // Performance metrics
      responseTime: anonymized.responseTime,
      tokensUsed: anonymized.tokensUsed,
      
      // Quality metrics (no actual content)
      responseLength: anonymized.responseLength,
      structureScore: this.calculateStructureScore(anonymized),
      
      // Derived metrics
      tokensPerSecond: anonymized.tokensUsed / (anonymized.responseTime / 1000),
      costEstimate: this.estimateCost(anonymized),
      
      // Context (anonymized)
      hourOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      userTier: anonymized.userTier || 'unknown'
    };
    
    // Store metrics
    this.storeMetrics('agents', metrics);
    
    // Emit for real-time monitoring (if needed)
    this.emit('metrics-tracked', {
      type: 'agent_response',
      timestamp: metrics.timestamp
    });
    
    return { tracked: true, metricsId: this.generateMetricsId() };
  }

  /**
   * Track model performance (aggregated only)
   */
  trackModelPerformance(data) {
    if (!this.config.enabled) return { tracked: false };
    
    const modelKey = `${data.provider}:${data.model}`;
    
    if (!this.metrics.models.has(modelKey)) {
      this.metrics.models.set(modelKey, {
        totalRequests: 0,
        totalResponseTime: 0,
        totalTokens: 0,
        errorCount: 0,
        successCount: 0,
        avgResponseTime: 0,
        avgTokensPerRequest: 0
      });
    }
    
    const modelMetrics = this.metrics.models.get(modelKey);
    
    // Update aggregated metrics only
    modelMetrics.totalRequests++;
    modelMetrics.totalResponseTime += data.responseTime || 0;
    modelMetrics.totalTokens += data.tokensUsed || 0;
    
    if (data.error) {
      modelMetrics.errorCount++;
    } else {
      modelMetrics.successCount++;
    }
    
    // Calculate averages
    modelMetrics.avgResponseTime = modelMetrics.totalResponseTime / modelMetrics.totalRequests;
    modelMetrics.avgTokensPerRequest = modelMetrics.totalTokens / modelMetrics.totalRequests;
    
    return { tracked: true };
  }

  /**
   * Track response quality metrics
   */
  trackResponseQuality(data) {
    if (!this.hasConsent(data.userId)) {
      return { tracked: false, reason: 'no_consent' };
    }
    
    const qualityMetrics = {
      timestamp: Date.now(),
      agent: data.agent,
      
      // Structure metrics (no content)
      hasList: data.hasList || false,
      hasParagraphs: data.hasParagraphs || false,
      hasCodeBlocks: data.hasCodeBlocks || false,
      
      // Complexity metrics
      responseComplexity: this.calculateComplexity(data),
      planItemCount: data.planItemCount || 0,
      editCount: data.editCount || 0,
      
      // Performance
      timeToFirstToken: data.timeToFirstToken || 0,
      streamingEnabled: data.streamingEnabled || false
    };
    
    this.storeMetrics('responses', qualityMetrics);
    
    return { tracked: true };
  }

  /**
   * Track errors (fully anonymized)
   */
  trackError(error) {
    if (!this.config.enabled) return;
    
    const errorMetric = {
      timestamp: Date.now(),
      errorType: this.classifyError(error),
      agent: error.agent || 'unknown',
      provider: error.provider || 'unknown',
      hourOfDay: new Date().getHours(),
      // No error messages or stack traces (could contain PII)
    };
    
    this.storeMetrics('errors', errorMetric);
  }

  /**
   * Anonymize user ID
   */
  anonymizeId(userId) {
    if (!userId) return 'anonymous';
    
    return crypto
      .createHmac('sha256', this.config.anonymizationSalt)
      .update(userId.toString())
      .digest('hex')
      .substring(0, 16); // Use only first 16 chars
  }

  /**
   * Anonymize all data
   */
  anonymizeData(data) {
    const anonymized = { ...data };
    
    // Remove or hash any PII fields
    delete anonymized.userId;
    delete anonymized.email;
    delete anonymized.name;
    delete anonymized.prompt; // Could contain PII
    delete anonymized.response; // Could contain PII
    delete anonymized.context; // Could contain PII
    
    // Hash any IDs
    if (anonymized.projectId) {
      anonymized.projectId = this.anonymizeId(anonymized.projectId);
    }
    if (anonymized.workspaceId) {
      anonymized.workspaceId = this.anonymizeId(anonymized.workspaceId);
    }
    
    // Keep only aggregate or non-identifiable data
    if (data.response) {
      anonymized.responseLength = data.response.length;
      anonymized.responseWords = data.response.split(/\s+/).length;
    }
    
    return anonymized;
  }

  /**
   * Calculate structure score
   */
  calculateStructureScore(data) {
    let score = 0;
    
    if (data.responseLength > 100) score += 1;
    if (data.responseLength < 5000) score += 1;
    if (data.responseWords > 20) score += 1;
    if (data.responseWords < 1000) score += 1;
    
    return score / 4; // Normalize to 0-1
  }

  /**
   * Calculate complexity
   */
  calculateComplexity(data) {
    // Simple complexity metric based on response characteristics
    let complexity = 'simple';
    
    if (data.planItemCount > 5 || data.editCount > 3) {
      complexity = 'complex';
    } else if (data.planItemCount > 2 || data.editCount > 1) {
      complexity = 'moderate';
    }
    
    return complexity;
  }

  /**
   * Estimate cost (no actual costs stored)
   */
  estimateCost(data) {
    // Rough cost categories
    if (data.tokensUsed < 500) return 'low';
    if (data.tokensUsed < 2000) return 'medium';
    return 'high';
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    const errorMessage = error.message || '';
    
    if (errorMessage.includes('timeout')) return 'timeout';
    if (errorMessage.includes('rate')) return 'rate_limit';
    if (errorMessage.includes('auth')) return 'authentication';
    if (errorMessage.includes('validation')) return 'validation';
    if (errorMessage.includes('network')) return 'network';
    
    return 'unknown';
  }

  /**
   * Store metrics with automatic cleanup
   */
  storeMetrics(category, metric) {
    const key = `${category}:${Date.now()}:${Math.random()}`;
    
    if (!this.metrics[category]) {
      this.metrics[category] = new Map();
    }
    
    this.metrics[category].set(key, metric);
    
    // Cleanup old metrics
    this.cleanupOldMetrics(category);
  }

  /**
   * Clean up old metrics based on retention policy
   */
  cleanupOldMetrics(category) {
    const now = Date.now();
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    
    for (const [key, metric] of this.metrics[category]) {
      if (now - metric.timestamp > maxAge) {
        this.metrics[category].delete(key);
      }
    }
  }

  /**
   * Delete all data for a user
   */
  deleteUserData(hashedUserId) {
    // In a real system, this would delete from database
    // For now, we don't store user-specific data anyway
    this.emit('user-data-deleted', { hashedUserId, timestamp: Date.now() });
  }

  /**
   * Generate anonymous metrics ID
   */
  generateMetricsId() {
    return `metrics_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Start aggregation timer
   */
  startAggregation() {
    this.aggregationTimer = setInterval(() => {
      this.aggregateMetrics();
    }, this.config.aggregationInterval);
  }

  /**
   * Aggregate metrics for reporting
   */
  aggregateMetrics() {
    const now = Date.now();
    const hour = new Date().getHours();
    const day = new Date().toDateString();
    
    // Hourly aggregation
    const hourlyKey = `${day}:${hour}`;
    if (!this.aggregated.hourly.has(hourlyKey)) {
      this.aggregated.hourly.set(hourlyKey, {
        timestamp: now,
        agents: {},
        models: {},
        errors: 0,
        totalRequests: 0
      });
    }
    
    const hourlyAgg = this.aggregated.hourly.get(hourlyKey);
    
    // Aggregate agent metrics
    for (const [key, metric] of this.metrics.agents) {
      if (!hourlyAgg.agents[metric.agent]) {
        hourlyAgg.agents[metric.agent] = {
          count: 0,
          avgResponseTime: 0,
          avgTokens: 0
        };
      }
      
      const agentAgg = hourlyAgg.agents[metric.agent];
      agentAgg.count++;
      agentAgg.avgResponseTime = 
        (agentAgg.avgResponseTime * (agentAgg.count - 1) + metric.responseTime) / agentAgg.count;
      agentAgg.avgTokens = 
        (agentAgg.avgTokens * (agentAgg.count - 1) + metric.tokensUsed) / agentAgg.count;
    }
    
    // Aggregate model metrics
    for (const [modelKey, modelMetrics] of this.metrics.models) {
      hourlyAgg.models[modelKey] = {
        requests: modelMetrics.totalRequests,
        avgResponseTime: modelMetrics.avgResponseTime,
        errorRate: modelMetrics.errorCount / modelMetrics.totalRequests
      };
    }
    
    // Count errors
    for (const [key, error] of this.metrics.errors) {
      if (now - error.timestamp < this.config.aggregationInterval) {
        hourlyAgg.errors++;
      }
    }
    
    hourlyAgg.totalRequests = Object.values(hourlyAgg.agents)
      .reduce((sum, agent) => sum + agent.count, 0);
    
    // Clean up old aggregations
    this.cleanupOldAggregations();
  }

  /**
   * Clean up old aggregations
   */
  cleanupOldAggregations() {
    const now = Date.now();
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    
    // Clean hourly
    for (const [key, agg] of this.aggregated.hourly) {
      if (now - agg.timestamp > maxAge) {
        this.aggregated.hourly.delete(key);
      }
    }
    
    // Clean daily
    for (const [key, agg] of this.aggregated.daily) {
      if (now - agg.timestamp > maxAge) {
        this.aggregated.daily.delete(key);
      }
    }
  }

  /**
   * Get analytics report (aggregated only)
   */
  getAnalyticsReport(timeRange = 'day') {
    const report = {
      generated: new Date(),
      timeRange,
      summary: {
        totalRequests: 0,
        avgResponseTime: 0,
        topAgents: [],
        topModels: [],
        errorRate: 0
      },
      agents: {},
      models: {},
      trends: []
    };
    
    // Aggregate based on time range
    const aggregationMap = timeRange === 'hour' ? this.aggregated.hourly : this.aggregated.daily;
    
    for (const [key, agg] of aggregationMap) {
      report.summary.totalRequests += agg.totalRequests;
      
      // Merge agent stats
      for (const [agent, stats] of Object.entries(agg.agents || {})) {
        if (!report.agents[agent]) {
          report.agents[agent] = {
            totalRequests: 0,
            avgResponseTime: 0,
            avgTokens: 0
          };
        }
        
        report.agents[agent].totalRequests += stats.count;
        report.agents[agent].avgResponseTime = 
          (report.agents[agent].avgResponseTime + stats.avgResponseTime) / 2;
        report.agents[agent].avgTokens = 
          (report.agents[agent].avgTokens + stats.avgTokens) / 2;
      }
      
      // Merge model stats
      for (const [model, stats] of Object.entries(agg.models || {})) {
        if (!report.models[model]) {
          report.models[model] = {
            totalRequests: 0,
            avgResponseTime: 0,
            errorRate: 0
          };
        }
        
        report.models[model].totalRequests += stats.requests;
        report.models[model].avgResponseTime = 
          (report.models[model].avgResponseTime + stats.avgResponseTime) / 2;
        report.models[model].errorRate = 
          (report.models[model].errorRate + stats.errorRate) / 2;
      }
    }
    
    // Calculate summary metrics
    if (report.summary.totalRequests > 0) {
      const allAgents = Object.entries(report.agents)
        .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
        .slice(0, 5);
      
      report.summary.topAgents = allAgents.map(([name, stats]) => ({
        name,
        requests: stats.totalRequests
      }));
      
      const allModels = Object.entries(report.models)
        .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
        .slice(0, 5);
      
      report.summary.topModels = allModels.map(([name, stats]) => ({
        name,
        requests: stats.totalRequests
      }));
    }
    
    return report;
  }

  /**
   * Export data for GDPR request
   */
  exportUserData(userId) {
    const hashedUserId = this.anonymizeId(userId);
    
    // Since we don't store PII, return only consent status
    return {
      userId: hashedUserId,
      hasConsent: this.userConsent.get(hashedUserId) || false,
      dataRetentionDays: this.config.retentionDays,
      message: 'No personally identifiable information is stored in analytics'
    };
  }

  /**
   * Stop analytics tracking
   */
  stop() {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    
    this.config.enabled = false;
  }
}

module.exports = GDPRAnalytics;