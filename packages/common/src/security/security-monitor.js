const EventEmitter = require('events');
const crypto = require('crypto');

class SecurityMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      alertThresholds: {
        failedLogins: config.failedLoginsThreshold || 5,
        rateLimitHits: config.rateLimitThreshold || 10,
        suspiciousActivity: config.suspiciousThreshold || 3,
        errorRate: config.errorRateThreshold || 0.1, // 10%
        responseTime: config.responseTimeThreshold || 5000 // 5 seconds
      },
      windowSize: config.windowSize || 5 * 60 * 1000, // 5 minutes
      alertChannels: config.alertChannels || ['console', 'email'],
      ...config
    };
    
    this.events = new Map();
    this.metrics = new Map();
    this.alerts = new Map();
    
    // Start cleanup interval
    this.startCleanup();
  }

  // Track security event
  trackEvent(type, data = {}) {
    const event = {
      id: crypto.randomBytes(16).toString('hex'),
      type,
      timestamp: Date.now(),
      data,
      ip: data.ip,
      userId: data.userId,
      sessionId: data.sessionId
    };
    
    // Store event
    if (!this.events.has(type)) {
      this.events.set(type, []);
    }
    this.events.get(type).push(event);
    
    // Update metrics
    this.updateMetrics(type, event);
    
    // Check for alerts
    this.checkAlerts(type, event);
    
    // Emit event
    this.emit('security-event', event);
    
    return event;
  }

  // Update metrics
  updateMetrics(type, event) {
    const key = `${type}_count`;
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + 1);
    
    // Track by IP
    if (event.ip) {
      const ipKey = `ip_${event.ip}_${type}`;
      const ipCount = this.metrics.get(ipKey) || 0;
      this.metrics.set(ipKey, ipCount + 1);
    }
    
    // Track by user
    if (event.userId) {
      const userKey = `user_${event.userId}_${type}`;
      const userCount = this.metrics.get(userKey) || 0;
      this.metrics.set(userKey, userCount + 1);
    }
  }

  // Check for alert conditions
  checkAlerts(type, event) {
    const now = Date.now();
    const window = now - this.config.windowSize;
    
    // Get recent events of this type
    const recentEvents = (this.events.get(type) || [])
      .filter(e => e.timestamp > window);
    
    // Check failed login attempts
    if (type === 'failed_login') {
      const failedByIp = recentEvents.filter(e => e.ip === event.ip);
      if (failedByIp.length >= this.config.alertThresholds.failedLogins) {
        this.triggerAlert('excessive_failed_logins', {
          ip: event.ip,
          count: failedByIp.length,
          events: failedByIp
        });
      }
      
      const failedByUser = recentEvents.filter(e => e.userId === event.userId);
      if (failedByUser.length >= this.config.alertThresholds.failedLogins) {
        this.triggerAlert('account_under_attack', {
          userId: event.userId,
          count: failedByUser.length,
          events: failedByUser
        });
      }
    }
    
    // Check rate limit violations
    if (type === 'rate_limit_exceeded') {
      const limitsByIp = recentEvents.filter(e => e.ip === event.ip);
      if (limitsByIp.length >= this.config.alertThresholds.rateLimitHits) {
        this.triggerAlert('rate_limit_abuse', {
          ip: event.ip,
          count: limitsByIp.length,
          events: limitsByIp
        });
      }
    }
    
    // Check suspicious activity
    if (type === 'suspicious_activity') {
      const suspiciousByIp = recentEvents.filter(e => e.ip === event.ip);
      if (suspiciousByIp.length >= this.config.alertThresholds.suspiciousActivity) {
        this.triggerAlert('potential_attack', {
          ip: event.ip,
          count: suspiciousByIp.length,
          patterns: suspiciousByIp.map(e => e.data.pattern),
          events: suspiciousByIp
        });
      }
    }
    
    // Check for distributed attacks
    this.checkDistributedAttack(type, recentEvents);
  }

  // Check for distributed attack patterns
  checkDistributedAttack(type, events) {
    if (type !== 'failed_login' && type !== 'suspicious_activity') {
      return;
    }
    
    // Group by target
    const targets = new Map();
    events.forEach(event => {
      const target = event.data.target || event.data.path || 'unknown';
      if (!targets.has(target)) {
        targets.set(target, []);
      }
      targets.get(target).push(event);
    });
    
    // Check if multiple IPs are targeting the same resource
    targets.forEach((targetEvents, target) => {
      const uniqueIps = new Set(targetEvents.map(e => e.ip));
      if (uniqueIps.size >= 5) {
        this.triggerAlert('distributed_attack', {
          target,
          ipCount: uniqueIps.size,
          ips: Array.from(uniqueIps),
          eventCount: targetEvents.length
        });
      }
    });
  }

  // Trigger security alert
  triggerAlert(alertType, data) {
    const alertKey = `${alertType}_${JSON.stringify(data)}`;
    
    // Debounce alerts
    if (this.alerts.has(alertKey)) {
      const lastAlert = this.alerts.get(alertKey);
      if (Date.now() - lastAlert < this.config.windowSize) {
        return; // Already alerted recently
      }
    }
    
    const alert = {
      id: crypto.randomBytes(16).toString('hex'),
      type: alertType,
      severity: this.getAlertSeverity(alertType),
      timestamp: Date.now(),
      data
    };
    
    this.alerts.set(alertKey, Date.now());
    
    // Send alert through configured channels
    this.sendAlert(alert);
    
    // Emit alert event
    this.emit('security-alert', alert);
    
    // Take automatic action if configured
    this.takeAutomaticAction(alert);
  }

  // Get alert severity
  getAlertSeverity(alertType) {
    const severities = {
      excessive_failed_logins: 'medium',
      account_under_attack: 'high',
      rate_limit_abuse: 'low',
      potential_attack: 'high',
      distributed_attack: 'critical',
      data_breach_attempt: 'critical',
      privilege_escalation: 'critical'
    };
    
    return severities[alertType] || 'medium';
  }

  // Send alert through channels
  sendAlert(alert) {
    this.config.alertChannels.forEach(channel => {
      switch (channel) {
        case 'console':
          console.error(`[SECURITY ALERT] ${alert.type}:`, alert);
          break;
          
        case 'email':
          this.sendEmailAlert(alert);
          break;
          
        case 'slack':
          this.sendSlackAlert(alert);
          break;
          
        case 'webhook':
          this.sendWebhookAlert(alert);
          break;
          
        case 'sentry':
          this.sendSentryAlert(alert);
          break;
      }
    });
  }

  // Send email alert
  async sendEmailAlert(alert) {
    if (!this.config.emailConfig) {
      return;
    }
    
    try {
      const subject = `[${alert.severity.toUpperCase()}] Security Alert: ${alert.type}`;
      const body = this.formatAlertMessage(alert);
      
      // Send email using configured email service
      if (this.config.emailService) {
        await this.config.emailService.send({
          to: this.config.securityEmail,
          subject,
          text: body,
          html: this.formatAlertHtml(alert)
        });
      }
    } catch (error) {
      console.error('Failed to send email alert:', error);
    }
  }

  // Send Slack alert
  async sendSlackAlert(alert) {
    if (!this.config.slackWebhook) {
      return;
    }
    
    try {
      const message = {
        text: `Security Alert: ${alert.type}`,
        attachments: [{
          color: this.getAlertColor(alert.severity),
          fields: [
            {
              title: 'Type',
              value: alert.type,
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            },
            {
              title: 'Details',
              value: JSON.stringify(alert.data, null, 2),
              short: false
            }
          ],
          footer: 'Security Monitor',
          ts: Math.floor(alert.timestamp / 1000)
        }]
      };
      
      // Send to Slack
      await fetch(this.config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  // Send webhook alert
  async sendWebhookAlert(alert) {
    if (!this.config.alertWebhook) {
      return;
    }
    
    try {
      await fetch(this.config.alertWebhook, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Alert-Type': alert.type,
          'X-Alert-Severity': alert.severity
        },
        body: JSON.stringify(alert)
      });
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }

  // Send Sentry alert
  sendSentryAlert(alert) {
    if (!this.config.sentryDsn) {
      return;
    }
    
    try {
      // Capture as Sentry event
      if (global.Sentry) {
        global.Sentry.captureMessage(`Security Alert: ${alert.type}`, {
          level: this.getSentryLevel(alert.severity),
          tags: {
            alert_type: alert.type,
            severity: alert.severity
          },
          extra: alert.data
        });
      }
    } catch (error) {
      console.error('Failed to send Sentry alert:', error);
    }
  }

  // Take automatic action based on alert
  async takeAutomaticAction(alert) {
    if (!this.config.automaticActions) {
      return;
    }
    
    switch (alert.type) {
      case 'excessive_failed_logins':
        // Block IP temporarily
        if (this.config.ipBlocker) {
          await this.config.ipBlocker.blockIp(alert.data.ip, 3600000); // 1 hour
        }
        break;
        
      case 'account_under_attack':
        // Lock account
        if (this.config.userService) {
          await this.config.userService.lockAccount(alert.data.userId);
        }
        break;
        
      case 'distributed_attack':
        // Enable enhanced security mode
        if (this.config.securityService) {
          await this.config.securityService.enableEnhancedMode();
        }
        break;
        
      case 'potential_attack':
        // Increase monitoring
        this.config.alertThresholds.suspiciousActivity = 1;
        break;
    }
  }

  // Format alert message
  formatAlertMessage(alert) {
    return `
Security Alert: ${alert.type}
Severity: ${alert.severity}
Time: ${new Date(alert.timestamp).toISOString()}

Details:
${JSON.stringify(alert.data, null, 2)}

Please investigate immediately.
    `.trim();
  }

  // Format alert HTML
  formatAlertHtml(alert) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; }
    .alert { padding: 20px; border: 2px solid ${this.getAlertColor(alert.severity)}; }
    .severity { color: ${this.getAlertColor(alert.severity)}; font-weight: bold; }
    .details { background: #f4f4f4; padding: 10px; margin: 10px 0; }
    pre { white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="alert">
    <h2>Security Alert: ${alert.type}</h2>
    <p>Severity: <span class="severity">${alert.severity.toUpperCase()}</span></p>
    <p>Time: ${new Date(alert.timestamp).toISOString()}</p>
    <div class="details">
      <h3>Details:</h3>
      <pre>${JSON.stringify(alert.data, null, 2)}</pre>
    </div>
    <p>Please investigate immediately.</p>
  </div>
</body>
</html>
    `.trim();
  }

  // Get alert color based on severity
  getAlertColor(severity) {
    const colors = {
      low: '#FFA500',
      medium: '#FF8C00',
      high: '#FF4500',
      critical: '#FF0000'
    };
    return colors[severity] || '#FFA500';
  }

  // Get Sentry level from severity
  getSentryLevel(severity) {
    const levels = {
      low: 'info',
      medium: 'warning',
      high: 'error',
      critical: 'fatal'
    };
    return levels[severity] || 'warning';
  }

  // Get security metrics
  getMetrics() {
    const metrics = {};
    
    this.metrics.forEach((value, key) => {
      metrics[key] = value;
    });
    
    return metrics;
  }

  // Get recent events
  getRecentEvents(type = null, limit = 100) {
    const now = Date.now();
    const window = now - this.config.windowSize;
    
    let events = [];
    
    if (type) {
      events = (this.events.get(type) || [])
        .filter(e => e.timestamp > window);
    } else {
      this.events.forEach((typeEvents) => {
        events.push(...typeEvents.filter(e => e.timestamp > window));
      });
    }
    
    return events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Cleanup old data
  cleanup() {
    const now = Date.now();
    const window = now - this.config.windowSize * 2; // Keep 2x window for analysis
    
    // Clean events
    this.events.forEach((events, type) => {
      const filtered = events.filter(e => e.timestamp > window);
      if (filtered.length > 0) {
        this.events.set(type, filtered);
      } else {
        this.events.delete(type);
      }
    });
    
    // Clean alerts
    const alertsToDelete = [];
    this.alerts.forEach((timestamp, key) => {
      if (timestamp < window) {
        alertsToDelete.push(key);
      }
    });
    alertsToDelete.forEach(key => this.alerts.delete(key));
  }

  // Start cleanup interval
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  // Generate security report
  generateReport() {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const report = {
      timestamp: now,
      period: {
        start: dayAgo,
        end: now
      },
      summary: {
        totalEvents: 0,
        eventTypes: {},
        topIps: [],
        topUsers: [],
        alerts: []
      },
      metrics: this.getMetrics()
    };
    
    // Analyze events
    this.events.forEach((events, type) => {
      const recentEvents = events.filter(e => e.timestamp > dayAgo);
      report.summary.totalEvents += recentEvents.length;
      report.summary.eventTypes[type] = recentEvents.length;
    });
    
    return report;
  }
}

module.exports = SecurityMonitor;