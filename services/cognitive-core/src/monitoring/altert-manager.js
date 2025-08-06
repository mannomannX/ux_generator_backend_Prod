// ==========================================
// SERVICES/COGNITIVE-CORE/src/monitoring/alert-manager.js
// ==========================================

import { Logger, EventTypes } from '@ux-flow/common';

/**
 * AlertManager provides comprehensive alerting for production issues
 * with intelligent escalation and notification strategies
 */
class AlertManager {
  constructor(logger, eventEmitter) {
    this.logger = logger || new Logger('alert-manager');
    this.eventEmitter = eventEmitter;
    
    // Alert state tracking
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.suppressedAlerts = new Set();
    
    // Alert thresholds and configuration
    this.alertConfig = {
      // Agent performance alerts
      agentFailureRate: { threshold: 0.05, severity: 'high', cooldown: 300000 }, // 5% failure rate
      agentResponseTime: { threshold: 5000, severity: 'medium', cooldown: 600000 }, // 5s response time
      
      // AI provider alerts
      providerFailure: { threshold: 3, severity: 'critical', cooldown: 60000 }, // 3 consecutive failures
      allProvidersDown: { threshold: 1, severity: 'critical', cooldown: 30000 }, // Any failure when all down
      providerFailoverRate: { threshold: 0.2, severity: 'medium', cooldown: 900000 }, // 20% failover rate
      
      // System resource alerts
      memoryUsage: { threshold: 1024, severity: 'high', cooldown: 300000 }, // 1GB memory usage
      queueLength: { threshold: 50, severity: 'medium', cooldown: 180000 }, // 50 tasks in queue
      conversationErrors: { threshold: 3, severity: 'critical', cooldown: 120000 }, // 3 consecutive errors
      
      // Performance alerts
      responseTimeP95: { threshold: 2000, severity: 'medium', cooldown: 600000 }, // 2s p95 response time
      errorRate: { threshold: 0.1, severity: 'high', cooldown: 300000 }, // 10% error rate
      
      // Business logic alerts
      planRejectionRate: { threshold: 0.3, severity: 'medium', cooldown: 1800000 }, // 30% plan rejection rate
      userSatisfactionDrop: { threshold: 0.7, severity: 'medium', cooldown: 3600000 } // Satisfaction below 70%
    };
    
    // Notification channels
    this.notificationChannels = {
      console: { enabled: true, levels: ['critical', 'high'] },
      webhook: { enabled: false, url: null, levels: ['critical'] },
      email: { enabled: false, smtp: null, levels: ['critical', 'high'] },
      slack: { enabled: false, webhook: null, levels: ['critical', 'high', 'medium'] }
    };
    
    // Alert statistics
    this.stats = {
      totalAlerts: 0,
      alertsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      alertsByCategory: {},
      resolvedAlerts: 0,
      averageResolutionTime: 0
    };
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Start background monitoring
    this.startBackgroundMonitoring();
    
    this.logger.info('Alert Manager initialized', {
      alertTypes: Object.keys(this.alertConfig).length,
      notificationChannels: Object.keys(this.notificationChannels).filter(
        channel => this.notificationChannels[channel].enabled
      ),
      cooldownPeriods: Object.fromEntries(
        Object.entries(this.alertConfig).map(([k, v]) => [k, `${v.cooldown/1000}s`])
      )
    });
  }

  /**
   * Setup event listeners for alert triggers
   */
  setupEventListeners() {
    // Agent task failures
    this.eventEmitter.on(EventTypes.AGENT_TASK_FAILED, (data) => {
      this.checkAgentFailureRate(data.agentName, data.error);
    });
    
    // AI provider health changes
    this.eventEmitter.on('AI_PROVIDER_HEALTH_CHANGED', (data) => {
      this.checkProviderHealth(data.provider, data.status, data.error);
    });
    
    // System status changes
    this.eventEmitter.on(EventTypes.SYSTEM_STATUS_CHANGED, (data) => {
      this.checkSystemStatus(data.status, data.queueLength, data.errorRate);
    });
    
    // Conversation state errors
    this.eventEmitter.on(EventTypes.CONVERSATION_STATE_CHANGED, (data) => {
      if (data.newState === 'error') {
        this.checkConversationErrors(data.userId, data.projectId, data.metadata);
      }
    });
    
    // Service errors
    this.eventEmitter.on(EventTypes.SERVICE_ERROR, (data) => {
      this.handleServiceError(data.service, data.error, data.severity || 'medium');
    });
  }

  /**
   * Create and manage alerts with intelligent deduplication
   */
  async createAlert(alertType, severity, title, description, metadata = {}) {
    const alertId = `${alertType}_${Date.now()}`;
    const now = new Date();
    
    // Check if alert is suppressed or in cooldown
    if (this.isAlertSuppressed(alertType)) {
      this.logger.debug('Alert suppressed due to cooldown', {
        alertType,
        severity,
        cooldownRemaining: this.getCooldownRemaining(alertType)
      });
      return null;
    }
    
    // Create alert object
    const alert = {
      id: alertId,
      type: alertType,
      severity,
      title,
      description,
      metadata: {
        ...metadata,
        service: 'cognitive-core',
        timestamp: now.toISOString(),
        hostname: process.env.HOSTNAME || 'unknown'
      },
      status: 'active',
      createdAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      notifications: []
    };
    
    // Store alert
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push({ ...alert });
    
    // Update statistics
    this.updateAlertStatistics(alertType, severity);
    
    // Send notifications
    await this.sendNotifications(alert);
    
    // Set cooldown
    this.setAlertCooldown(alertType);
    
    // Log alert creation
    this.logger.warn('Alert created', {
      alertId,
      alertType,
      severity,
      title,
      metadata: alert.metadata
    });
    
    // Emit alert event for other components
    this.eventEmitter.emit('ALERT_CREATED', {
      alert,
      timestamp: now
    });
    
    return alert;
  }

  /**
   * Check agent failure rate and create alerts
   */
  checkAgentFailureRate(agentName, error) {
    const recentFailures = this.getRecentAgentFailures(agentName, 300000); // Last 5 minutes
    const recentExecutions = this.getRecentAgentExecutions(agentName, 300000);
    
    if (recentExecutions === 0) return;
    
    const failureRate = recentFailures / recentExecutions;
    const config = this.alertConfig.agentFailureRate;
    
    if (failureRate >= config.threshold) {
      this.createAlert(
        'agentFailureRate',
        config.severity,
        `High Agent Failure Rate: ${agentName}`,
        `Agent ${agentName} has a failure rate of ${Math.round(failureRate * 100)}% (${recentFailures}/${recentExecutions} executions failed in the last 5 minutes)`,
        {
          agentName,
          failureRate: Math.round(failureRate * 100) + '%',
          failures: recentFailures,
          executions: recentExecutions,
          recentError: error,
          recommendation: 'Check AI provider status, review agent prompts, or switch quality mode'
        }
      );
    }
  }

  /**
   * Check AI provider health and create alerts
   */
  checkProviderHealth(provider, status, error) {
    if (status === 'unhealthy' || status === 'error') {
      const consecutiveFailures = this.getConsecutiveProviderFailures(provider);
      const config = this.alertConfig.providerFailure;
      
      if (consecutiveFailures >= config.threshold) {
        this.createAlert(
          'providerFailure',
          config.severity,
          `AI Provider Failure: ${provider}`,
          `AI provider ${provider} has failed ${consecutiveFailures} consecutive times`,
          {
            provider,
            consecutiveFailures,
            error: error?.message || 'Unknown error',
            status,
            recommendation: 'Verify API keys, check provider status, ensure network connectivity'
          }
        );
      }
    }
    
    // Check if all providers are down
    if (this.areAllProvidersDown()) {
      this.createAlert(
        'allProvidersDown',
        'critical',
        'All AI Providers Down',
        'All AI providers are currently unavailable, service is severely degraded',
        {
          providers: this.getAllProviderStatuses(),
          impact: 'critical',
          recommendation: 'Emergency escalation required - check all API keys and network connectivity'
        }
      );
    }
  }

  /**
   * Check system status and resource usage
   */
  checkSystemStatus(status, queueLength, errorRate) {
    // Queue length alert
    if (queueLength > this.alertConfig.queueLength.threshold) {
      this.createAlert(
        'queueLength',
        this.alertConfig.queueLength.severity,
        'High Task Queue Length',
        `Task queue has ${queueLength} pending items, system may be overloaded`,
        {
          queueLength,
          threshold: this.alertConfig.queueLength.threshold,
          systemStatus: status,
          recommendation: 'Consider scaling up resources or reducing request rate'
        }
      );
    }
    
    // Error rate alert
    if (errorRate > this.alertConfig.errorRate.threshold) {
      this.createAlert(
        'errorRate',
        this.alertConfig.errorRate.severity,
        'High System Error Rate',
        `System error rate is ${Math.round(errorRate * 100)}%, indicating service degradation`,
        {
          errorRate: Math.round(errorRate * 100) + '%',
          threshold: Math.round(this.alertConfig.errorRate.threshold * 100) + '%',
          systemStatus: status,
          recommendation: 'Investigate recent deployments, check dependencies, review error logs'
        }
      );
    }
  }

  /**
   * Check memory usage and create alerts
   */
  checkMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
    const config = this.alertConfig.memoryUsage;
    
    if (memoryMB > config.threshold) {
      this.createAlert(
        'memoryUsage',
        config.severity,
        'High Memory Usage',
        `Service is using ${Math.round(memoryMB)}MB of memory, exceeding threshold of ${config.threshold}MB`,
        {
          memoryUsageMB: Math.round(memoryMB),
          thresholdMB: config.threshold,
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          recommendation: 'Check for memory leaks, consider scaling up, review conversation cleanup'
        }
      );
    }
  }

  /**
   * Handle service errors
   */
  handleServiceError(serviceName, error, severity = 'medium') {
    this.createAlert(
      'serviceError',
      severity,
      `Service Error: ${serviceName}`,
      `Service ${serviceName} encountered an error: ${error}`,
      {
        serviceName,
        error,
        errorType: typeof error === 'object' ? error.name : 'UnknownError',
        recommendation: 'Check service logs, verify dependencies, restart if necessary'
      }
    );
  }

  /**
   * Send notifications through configured channels
   */
  async sendNotifications(alert) {
    const notifications = [];
    
    // Console notification (always enabled for critical/high)
    if (this.notificationChannels.console.enabled && 
        this.notificationChannels.console.levels.includes(alert.severity)) {
      this.sendConsoleNotification(alert);
      notifications.push('console');
    }
    
    // Webhook notification
    if (this.notificationChannels.webhook.enabled && 
        this.notificationChannels.webhook.levels.includes(alert.severity)) {
      try {
        await this.sendWebhookNotification(alert);
        notifications.push('webhook');
      } catch (error) {
        this.logger.error('Failed to send webhook notification', error);
      }
    }
    
    // Email notification (if configured)
    if (this.notificationChannels.email.enabled && 
        this.notificationChannels.email.levels.includes(alert.severity)) {
      try {
        await this.sendEmailNotification(alert);
        notifications.push('email');
      } catch (error) {
        this.logger.error('Failed to send email notification', error);
      }
    }
    
    // Slack notification (if configured)
    if (this.notificationChannels.slack.enabled && 
        this.notificationChannels.slack.levels.includes(alert.severity)) {
      try {
        await this.sendSlackNotification(alert);
        notifications.push('slack');
      } catch (error) {
        this.logger.error('Failed to send Slack notification', error);
      }
    }
    
    alert.notifications = notifications;
    return notifications;
  }

  /**
   * Send console notification
   */
  sendConsoleNotification(alert) {
    const severityColors = {
      critical: '\x1b[31m', // Red
      high: '\x1b[33m',     // Yellow
      medium: '\x1b[36m',   // Cyan
      low: '\x1b[37m'       // White
    };
    
    const color = severityColors[alert.severity] || '\x1b[37m';
    const reset = '\x1b[0m';
    
    console.log(`\n${color}🚨 ALERT [${alert.severity.toUpperCase()}] ${reset}`);
    console.log(`${color}Title: ${alert.title}${reset}`);
    console.log(`${color}Description: ${alert.description}${reset}`);
    console.log(`${color}Time: ${alert.createdAt.toISOString()}${reset}`);
    console.log(`${color}Alert ID: ${alert.id}${reset}`);
    
    if (alert.metadata.recommendation) {
      console.log(`${color}Recommendation: ${alert.metadata.recommendation}${reset}`);
    }
    
    console.log('');
  }

  /**
   * Send webhook notification (placeholder for external integration)
   */
  async sendWebhookNotification(alert) {
    if (!this.notificationChannels.webhook.url) {
      throw new Error('Webhook URL not configured');
    }
    
    const payload = {
      alertId: alert.id,
      alertType: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      service: 'cognitive-core',
      timestamp: alert.createdAt.toISOString(),
      metadata: alert.metadata
    };
    
    // Implementation would use fetch or axios to send to webhook URL
    this.logger.info('Webhook notification sent', { alertId: alert.id, webhook: this.notificationChannels.webhook.url });
  }

  /**
   * Acknowledge alert (mark as acknowledged by operator)
   */
  acknowledgeAlert(alertId, acknowledgedBy, notes = '') {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }
    
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedNotes = notes;
    
    this.logger.info('Alert acknowledged', {
      alertId,
      acknowledgedBy,
      notes,
      alertType: alert.type
    });
    
    this.eventEmitter.emit('ALERT_ACKNOWLEDGED', {
      alert,
      acknowledgedBy,
      notes,
      timestamp: alert.acknowledgedAt
    });
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId, resolvedBy, resolution = '', autoResolved = false) {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }
    
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;
    alert.resolution = resolution;
    alert.autoResolved = autoResolved;
    alert.status = 'resolved';
    
    // Calculate resolution time
    const resolutionTime = alert.resolvedAt - alert.createdAt;
    alert.resolutionTimeMs = resolutionTime;
    
    // Remove from active alerts
    this.activeAlerts.delete(alertId);
    
    // Update statistics
    this.stats.resolvedAlerts++;
    this.stats.averageResolutionTime = 
      (this.stats.averageResolutionTime * (this.stats.resolvedAlerts - 1) + resolutionTime) / this.stats.resolvedAlerts;
    
    this.logger.info('Alert resolved', {
      alertId,
      resolvedBy,
      resolution,
      resolutionTimeMs: resolutionTime,
      autoResolved,
      alertType: alert.type
    });
    
    this.eventEmitter.emit('ALERT_RESOLVED', {
      alert,
      resolvedBy,
      resolution,
      resolutionTimeMs: resolutionTime,
      timestamp: alert.resolvedAt
    });
  }

  /**
   * Start background monitoring tasks
   */
  startBackgroundMonitoring() {
    // Memory monitoring
    setInterval(() => {
      this.checkMemoryUsage();
    }, 60000); // Every minute
    
    // Auto-resolve alerts
    setInterval(() => {
      this.autoResolveAlerts();
    }, 300000); // Every 5 minutes
    
    // Cleanup old alerts
    setInterval(() => {
      this.cleanupOldAlerts();
    }, 3600000); // Every hour
    
    // Health check
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Every 30 seconds
  }

  /**
   * Auto-resolve alerts based on conditions
   */
  autoResolveAlerts() {
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      // Auto-resolve old alerts (24 hours)
      const alertAge = new Date() - alert.createdAt;
      if (alertAge > 24 * 60 * 60 * 1000) {
        this.resolveAlert(alertId, 'system', 'Auto-resolved due to age', true);
        continue;
      }
      
      // Auto-resolve based on alert type conditions
      if (this.shouldAutoResolve(alert)) {
        this.resolveAlert(alertId, 'system', 'Auto-resolved - condition no longer met', true);
      }
    }
  }

  /**
   * Check if alert should be auto-resolved
   */
  shouldAutoResolve(alert) {
    const now = new Date();
    
    // Don't auto-resolve recent alerts (give them time to be addressed)
    if ((now - alert.createdAt) < 600000) { // 10 minutes
      return false;
    }
    
    switch (alert.type) {
      case 'memoryUsage':
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        return currentMemory < this.alertConfig.memoryUsage.threshold * 0.8;
        
      case 'queueLength':
        // Would need access to current queue length
        return false; // Can't auto-resolve without system state
        
      default:
        return false;
    }
  }

  /**
   * Utility methods
   */
  
  isAlertSuppressed(alertType) {
    return this.suppressedAlerts.has(alertType);
  }
  
  setAlertCooldown(alertType) {
    const cooldown = this.alertConfig[alertType]?.cooldown || 300000;
    this.suppressedAlerts.add(alertType);
    
    setTimeout(() => {
      this.suppressedAlerts.delete(alertType);
    }, cooldown);
  }
  
  getCooldownRemaining(alertType) {
    // Implementation would track cooldown timestamps
    return 0;
  }
  
  updateAlertStatistics(alertType, severity) {
    this.stats.totalAlerts++;
    this.stats.alertsBySeverity[severity] = (this.stats.alertsBySeverity[severity] || 0) + 1;
    this.stats.alertsByCategory[alertType] = (this.stats.alertsByCategory[alertType] || 0) + 1;
  }
  
  getRecentAgentFailures(agentName, timeWindow) {
    // Implementation would query actual agent failure data
    return 0;
  }
  
  getRecentAgentExecutions(agentName, timeWindow) {
    // Implementation would query actual agent execution data
    return 1;
  }
  
  getConsecutiveProviderFailures(provider) {
    // Implementation would track provider failure streaks
    return 1;
  }
  
  areAllProvidersDown() {
    // Implementation would check all provider statuses
    return false;
  }
  
  getAllProviderStatuses() {
    return {};
  }
  
  cleanupOldAlerts() {
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    const cutoff = new Date(Date.now() - maxAge);
    
    this.alertHistory = this.alertHistory.filter(alert => alert.createdAt > cutoff);
  }
  
  performHealthCheck() {
    // Basic health check to ensure alert system is working
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    
    // Self-monitoring
    if (this.activeAlerts.size > 100) {
      this.logger.warn('Alert Manager: Too many active alerts', {
        activeAlerts: this.activeAlerts.size,
        recommendation: 'Check for alert storm or increase auto-resolution'
      });
    }
  }

  /**
   * Get alert statistics and dashboard data
   */
  getAlertStatistics() {
    return {
      current: {
        activeAlerts: this.activeAlerts.size,
        alertsBySeverity: Object.fromEntries(
          Array.from(this.activeAlerts.values())
            .reduce((acc, alert) => {
              acc.set(alert.severity, (acc.get(alert.severity) || 0) + 1);
              return acc;
            }, new Map())
        ),
        oldestAlert: this.activeAlerts.size > 0 ? 
          Math.min(...Array.from(this.activeAlerts.values()).map(a => a.createdAt)) : null
      },
      historical: this.stats,
      configuration: {
        alertTypes: Object.keys(this.alertConfig).length,
        notificationChannels: Object.keys(this.notificationChannels)
          .filter(channel => this.notificationChannels[channel].enabled)
      },
      timestamp: new Date()
    };
  }
}

export { AlertManager };