// ==========================================
// SERVICES/API-GATEWAY/src/middleware/security-logging.js
// Security event logging and monitoring
// ==========================================

import crypto from 'crypto';

class SecurityLogger {
  constructor(logger, redisClient, mongoClient) {
    this.logger = logger;
    this.redis = redisClient;
    this.mongo = mongoClient;
    
    // Security event types
    this.eventTypes = {
      LOGIN_SUCCESS: 'login_success',
      LOGIN_FAILED: 'login_failed',
      LOGOUT: 'logout',
      PASSWORD_CHANGE: 'password_change',
      PASSWORD_RESET: 'password_reset',
      ACCOUNT_LOCKED: 'account_locked',
      SUSPICIOUS_ACTIVITY: 'suspicious_activity',
      RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
      INVALID_TOKEN: 'invalid_token',
      PERMISSION_DENIED: 'permission_denied',
      DATA_BREACH_ATTEMPT: 'data_breach_attempt',
      SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
      XSS_ATTEMPT: 'xss_attempt',
      CSRF_ATTEMPT: 'csrf_attempt',
      BRUTE_FORCE_ATTEMPT: 'brute_force_attempt',
      ADMIN_ACTION: 'admin_action',
      API_KEY_CREATED: 'api_key_created',
      API_KEY_REVOKED: 'api_key_revoked',
      USER_CREATED: 'user_created',
      USER_DELETED: 'user_deleted',
      WORKSPACE_ACCESS: 'workspace_access',
      PROJECT_ACCESS: 'project_access',
      SENSITIVE_DATA_ACCESS: 'sensitive_data_access',
    };
    
    // Risk levels
    this.riskLevels = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };
    
    // Suspicious patterns
    this.suspiciousPatterns = [
      /\$where/i,
      /\$function/i,
      /javascript:/i,
      /<script/i,
      /on\w+=/i,
      /eval\(/i,
      /union\s+select/i,
      /drop\s+table/i,
      /exec\(/i,
      /cmd\.exe/i,
      /powershell/i,
      /\/etc\/passwd/i,
      /\.\.\/\.\.\//i,
    ];
  }
  
  /**
   * Log security event
   */
  async logSecurityEvent(eventType, data, riskLevel = this.riskLevels.LOW) {
    const event = {
      id: crypto.randomBytes(16).toString('hex'),
      type: eventType,
      timestamp: new Date(),
      data: {
        ...data,
        userAgent: data.userAgent || 'unknown',
        ip: data.ip || 'unknown',
      },
      riskLevel,
      processed: false,
    };
    
    try {
      // Store in MongoDB for persistence
      const db = this.mongo.getDb();
      await db.collection('security_events').insertOne(event);
      
      // Also store in Redis for real-time processing
      await this.redis.lpush(
        'security_events:queue',
        JSON.stringify(event)
      );
      
      // Set expiry for Redis entry (7 days)
      await this.redis.expire('security_events:queue', 604800);
      
      // Log to application logger
      if (riskLevel >= this.riskLevels.HIGH) {
        this.logger.error('High-risk security event', event);
      } else if (riskLevel >= this.riskLevels.MEDIUM) {
        this.logger.warn('Medium-risk security event', event);
      } else {
        this.logger.info('Security event', event);
      }
      
      // Trigger alerts for critical events
      if (riskLevel === this.riskLevels.CRITICAL) {
        await this.triggerSecurityAlert(event);
      }
      
      // Update user risk score
      if (data.userId) {
        await this.updateUserRiskScore(data.userId, riskLevel);
      }
      
    } catch (error) {
      this.logger.error('Failed to log security event', {
        error: error.message,
        event,
      });
    }
  }
  
  /**
   * Trigger security alert
   */
  async triggerSecurityAlert(event) {
    try {
      // Send to alert queue
      await this.redis.lpush(
        'security_alerts:critical',
        JSON.stringify({
          ...event,
          alertTime: new Date(),
          status: 'pending',
        })
      );
      
      // Log critical alert
      this.logger.error('SECURITY ALERT: Critical security event detected', {
        eventType: event.type,
        data: event.data,
        riskLevel: event.riskLevel,
      });
      
      // Could also send email/SMS/Slack notification here
      
    } catch (error) {
      this.logger.error('Failed to trigger security alert', error);
    }
  }
  
  /**
   * Update user risk score
   */
  async updateUserRiskScore(userId, riskLevel) {
    try {
      const key = `user_risk_score:${userId}`;
      
      // Increment risk score
      await this.redis.incrby(key, riskLevel);
      
      // Set expiry (reset after 24 hours)
      await this.redis.expire(key, 86400);
      
      // Get current score
      const score = await this.redis.get(key);
      
      // Check if user should be blocked
      if (parseInt(score) > 10) {
        await this.blockSuspiciousUser(userId);
      }
      
    } catch (error) {
      this.logger.error('Failed to update user risk score', error);
    }
  }
  
  /**
   * Block suspicious user
   */
  async blockSuspiciousUser(userId) {
    try {
      // Add to blocked users list
      await this.redis.setex(
        `blocked_user:${userId}`,
        3600, // Block for 1 hour
        JSON.stringify({
          blockedAt: new Date(),
          reason: 'Suspicious activity detected',
        })
      );
      
      // Log the blocking
      await this.logSecurityEvent(
        this.eventTypes.ACCOUNT_LOCKED,
        { userId, reason: 'Automated blocking due to suspicious activity' },
        this.riskLevels.HIGH
      );
      
    } catch (error) {
      this.logger.error('Failed to block suspicious user', error);
    }
  }
  
  /**
   * Check for suspicious patterns in request
   */
  checkForSuspiciousPatterns(req) {
    const suspiciousFindings = [];
    
    // Check URL
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(req.originalUrl)) {
        suspiciousFindings.push({
          location: 'url',
          pattern: pattern.toString(),
          value: req.originalUrl,
        });
      }
    }
    
    // Check query parameters
    for (const [key, value] of Object.entries(req.query || {})) {
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(value)) {
          suspiciousFindings.push({
            location: 'query',
            parameter: key,
            pattern: pattern.toString(),
            value,
          });
        }
      }
    }
    
    // Check body
    if (req.body) {
      const bodyStr = JSON.stringify(req.body);
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(bodyStr)) {
          suspiciousFindings.push({
            location: 'body',
            pattern: pattern.toString(),
          });
        }
      }
    }
    
    // Check headers
    const suspiciousHeaders = ['x-forwarded-host', 'x-real-ip', 'x-forwarded-for'];
    for (const header of suspiciousHeaders) {
      if (req.headers[header]) {
        const value = req.headers[header];
        for (const pattern of this.suspiciousPatterns) {
          if (pattern.test(value)) {
            suspiciousFindings.push({
              location: 'header',
              header,
              pattern: pattern.toString(),
              value,
            });
          }
        }
      }
    }
    
    return suspiciousFindings;
  }
  
  /**
   * Middleware for security logging
   */
  createMiddleware() {
    return async (req, res, next) => {
      // Check for suspicious patterns
      const suspiciousFindings = this.checkForSuspiciousPatterns(req);
      
      if (suspiciousFindings.length > 0) {
        // Log suspicious activity
        await this.logSecurityEvent(
          this.eventTypes.SUSPICIOUS_ACTIVITY,
          {
            method: req.method,
            path: req.path,
            userId: req.user?.userId,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            findings: suspiciousFindings,
            correlationId: req.correlationId,
          },
          this.riskLevels.MEDIUM
        );
        
        // Optionally block the request
        if (suspiciousFindings.some(f => f.location === 'body' || f.location === 'url')) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Request contains suspicious content',
            correlationId: req.correlationId,
          });
        }
      }
      
      // Track response for security events
      const originalSend = res.send;
      res.send = function(data) {
        // Log authentication failures
        if (res.statusCode === 401) {
          this.logSecurityEvent(
            this.eventTypes.LOGIN_FAILED,
            {
              method: req.method,
              path: req.path,
              userId: req.user?.userId,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              correlationId: req.correlationId,
            },
            this.riskLevels.LOW
          ).catch(err => 
            this.logger.error('Failed to log auth failure', err)
          );
        }
        
        // Log permission denials
        if (res.statusCode === 403) {
          this.logSecurityEvent(
            this.eventTypes.PERMISSION_DENIED,
            {
              method: req.method,
              path: req.path,
              userId: req.user?.userId,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
              correlationId: req.correlationId,
            },
            this.riskLevels.MEDIUM
          ).catch(err =>
            this.logger.error('Failed to log permission denial', err)
          );
        }
        
        return originalSend.call(this, data);
      }.bind(this);
      
      next();
    };
  }
  
  /**
   * Get security metrics
   */
  async getSecurityMetrics(timeRange = 3600000) {
    // 1 hour default
    try {
      const db = this.mongo.getDb();
      const startTime = new Date(Date.now() - timeRange);
      
      const metrics = await db.collection('security_events').aggregate([
        {
          $match: {
            timestamp: { $gte: startTime },
          },
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgRiskLevel: { $avg: '$riskLevel' },
            maxRiskLevel: { $max: '$riskLevel' },
          },
        },
        {
          $sort: { count: -1 },
        },
      ]).toArray();
      
      const totalEvents = metrics.reduce((sum, m) => sum + m.count, 0);
      const avgRiskLevel = metrics.reduce((sum, m) => sum + m.avgRiskLevel * m.count, 0) / totalEvents || 0;
      
      return {
        timeRange,
        totalEvents,
        avgRiskLevel,
        eventsByType: metrics,
        criticalEvents: metrics.filter(m => m.maxRiskLevel === this.riskLevels.CRITICAL),
      };
      
    } catch (error) {
      this.logger.error('Failed to get security metrics', error);
      return null;
    }
  }
  
  /**
   * Clean up old security events
   */
  async cleanupOldEvents(retentionDays = 30) {
    try {
      const db = this.mongo.getDb();
      const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
      
      const result = await db.collection('security_events').deleteMany({
        timestamp: { $lt: cutoffDate },
        processed: true,
      });
      
      this.logger.info('Cleaned up old security events', {
        deletedCount: result.deletedCount,
        cutoffDate,
      });
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup old security events', error);
      return 0;
    }
  }
}

export { SecurityLogger };