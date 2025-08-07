// ==========================================
// SERVICES/USER-MANAGEMENT/src/security/account-lockout.js
// Progressive account lockout protection
// ==========================================

import crypto from 'crypto';
import { Logger } from '@ux-flow/common';

class AccountLockout {
  constructor(logger = new Logger('AccountLockout'), redisClient = null, mongoClient = null) {
    this.logger = logger;
    this.redis = redisClient;
    this.mongoClient = mongoClient;
    
    // Progressive lockout thresholds
    this.attempts = [
      { threshold: 3, lockoutMinutes: 5 },
      { threshold: 5, lockoutMinutes: 15 },
      { threshold: 10, lockoutMinutes: 60 },
      { threshold: 20, lockoutMinutes: 1440 }, // 24 hours
    ];
    
    // Configuration
    this.windowMinutes = parseInt(process.env.LOCKOUT_WINDOW_MINUTES) || 60; // 1 hour window
    this.ipRateLimitPerHour = parseInt(process.env.IP_RATE_LIMIT_PER_HOUR) || 50;
    this.notifyAfterAttempts = parseInt(process.env.NOTIFY_AFTER_ATTEMPTS) || 5;
    
    // Suspicious patterns
    this.suspiciousPatterns = {
      rapidAttempts: 3, // attempts within 1 minute
      distributedAttempts: 10, // attempts from different IPs
      credentialStuffing: 5, // different usernames from same IP
    };
  }
  
  /**
   * Record a failed authentication attempt
   */
  async recordFailedAttempt(identifier, ip, metadata = {}) {
    try {
      const now = Date.now();
      const accountKey = `failed_auth:${identifier}`;
      const ipKey = `failed_auth:ip:${ip}`;
      const globalKey = 'failed_auth:global';
      
      // Track by account
      if (this.redis) {
        await this.redis.zadd(accountKey, now, `${now}:${ip}`);
        await this.redis.expire(accountKey, this.windowMinutes * 60);
        
        // Track by IP
        await this.redis.zadd(ipKey, now, `${now}:${identifier}`);
        await this.redis.expire(ipKey, this.windowMinutes * 60);
        
        // Track global attempts for anomaly detection
        await this.redis.zadd(globalKey, now, `${now}:${identifier}:${ip}`);
        await this.redis.expire(globalKey, 3600); // 1 hour
      }
      
      // Get recent attempts
      const accountAttempts = await this.getRecentAttempts(accountKey);
      const ipAttempts = await this.getRecentAttempts(ipKey);
      
      // Check for lockout
      const lockout = this.calculateLockout(Math.max(accountAttempts, ipAttempts));
      
      if (lockout) {
        await this.applyLockout(identifier, ip, lockout, {
          accountAttempts,
          ipAttempts,
          ...metadata,
        });
      }
      
      // Check for suspicious patterns
      const suspicious = await this.detectSuspiciousPatterns(identifier, ip);
      
      if (suspicious.detected) {
        await this.handleSuspiciousActivity(identifier, ip, suspicious);
      }
      
      // Send notification if threshold reached
      if (accountAttempts >= this.notifyAfterAttempts) {
        await this.notifyUser(identifier, accountAttempts, ip);
      }
      
      // Log to database
      await this.logFailedAttempt(identifier, ip, {
        accountAttempts,
        ipAttempts,
        lockout,
        suspicious,
        ...metadata,
      });
      
      return {
        lockout,
        attempts: accountAttempts,
        suspicious,
      };
    } catch (error) {
      this.logger.error('Failed to record failed attempt', error);
      // Fail open - don't block on error
      return { lockout: null, attempts: 0 };
    }
  }
  
  /**
   * Check if account or IP is locked out
   */
  async checkLockout(identifier, ip) {
    try {
      // Check account lockout
      const accountLock = await this.getLockout(`lockout:${identifier}`);
      if (accountLock) {
        return accountLock;
      }
      
      // Check IP lockout
      const ipLock = await this.getLockout(`lockout:ip:${ip}`);
      if (ipLock) {
        return {
          ...ipLock,
          reason: 'IP address temporarily blocked',
        };
      }
      
      // Check for global rate limiting
      const globalLock = await this.checkGlobalRateLimit(ip);
      if (globalLock) {
        return globalLock;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to check lockout', error);
      // Fail open
      return null;
    }
  }
  
  /**
   * Clear failed attempts on successful login
   */
  async clearFailedAttempts(identifier, ip) {
    try {
      if (this.redis) {
        await this.redis.del(`failed_auth:${identifier}`);
        
        // Reduce IP counter but don't clear completely
        const ipKey = `failed_auth:ip:${ip}`;
        const now = Date.now();
        const cutoff = now - (this.windowMinutes * 60 * 1000);
        
        await this.redis.zremrangebyscore(ipKey, '-inf', cutoff);
      }
      
      this.logger.info('Cleared failed attempts', { identifier });
    } catch (error) {
      this.logger.error('Failed to clear attempts', error);
    }
  }
  
  /**
   * Get recent attempt count
   */
  async getRecentAttempts(key) {
    if (!this.redis) {
      return 0;
    }
    
    try {
      const now = Date.now();
      const cutoff = now - (this.windowMinutes * 60 * 1000);
      
      // Remove old entries and count recent ones
      await this.redis.zremrangebyscore(key, '-inf', cutoff);
      return await this.redis.zcard(key);
    } catch (error) {
      this.logger.error('Failed to get recent attempts', error);
      return 0;
    }
  }
  
  /**
   * Calculate lockout duration based on attempts
   */
  calculateLockout(attemptCount) {
    for (let i = this.attempts.length - 1; i >= 0; i--) {
      if (attemptCount >= this.attempts[i].threshold) {
        return {
          duration: this.attempts[i].lockoutMinutes * 60,
          severity: i + 1,
          threshold: this.attempts[i].threshold,
          attempts: attemptCount,
        };
      }
    }
    return null;
  }
  
  /**
   * Apply lockout to account/IP
   */
  async applyLockout(identifier, ip, lockout, metadata) {
    if (!this.redis) {
      return;
    }
    
    try {
      const now = Date.now();
      const lockoutData = {
        reason: 'Too many failed attempts',
        attempts: lockout.attempts,
        lockedUntil: new Date(now + lockout.duration * 1000),
        severity: lockout.severity,
        ip,
        ...metadata,
      };
      
      // Lock account
      await this.redis.setex(
        `lockout:${identifier}`,
        lockout.duration,
        JSON.stringify(lockoutData)
      );
      
      // Lock IP if severe
      if (lockout.severity >= 3) {
        await this.redis.setex(
          `lockout:ip:${ip}`,
          lockout.duration,
          JSON.stringify({
            ...lockoutData,
            reason: 'IP blocked due to suspicious activity',
          })
        );
      }
      
      // Log lockout event
      await this.logSecurityEvent('ACCOUNT_LOCKED', {
        identifier,
        ip,
        lockout,
        metadata,
      });
      
      this.logger.warn('Account locked', {
        identifier,
        duration: lockout.duration,
        severity: lockout.severity,
      });
    } catch (error) {
      this.logger.error('Failed to apply lockout', error);
    }
  }
  
  /**
   * Get lockout information
   */
  async getLockout(key) {
    if (!this.redis) {
      return null;
    }
    
    try {
      const data = await this.redis.get(key);
      
      if (data) {
        const lockout = JSON.parse(data);
        
        // Calculate remaining time
        const remaining = Math.max(0, 
          Math.floor((new Date(lockout.lockedUntil) - Date.now()) / 1000)
        );
        
        return {
          ...lockout,
          remainingSeconds: remaining,
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get lockout', error);
      return null;
    }
  }
  
  /**
   * Detect suspicious patterns
   */
  async detectSuspiciousPatterns(identifier, ip) {
    const patterns = {
      detected: false,
      types: [],
      score: 0,
    };
    
    if (!this.redis) {
      return patterns;
    }
    
    try {
      const now = Date.now();
      
      // Check for rapid attempts
      const rapidKey = `rapid:${identifier}`;
      await this.redis.zadd(rapidKey, now, now);
      await this.redis.expire(rapidKey, 60);
      
      const rapidCount = await this.redis.zcard(rapidKey);
      if (rapidCount >= this.suspiciousPatterns.rapidAttempts) {
        patterns.detected = true;
        patterns.types.push('rapid_attempts');
        patterns.score += 0.3;
      }
      
      // Check for distributed attacks
      const accountData = await this.redis.zrange(`failed_auth:${identifier}`, 0, -1);
      const uniqueIPs = new Set(accountData.map(d => d.split(':')[1]));
      
      if (uniqueIPs.size >= this.suspiciousPatterns.distributedAttempts) {
        patterns.detected = true;
        patterns.types.push('distributed_attack');
        patterns.score += 0.5;
      }
      
      // Check for credential stuffing
      const ipData = await this.redis.zrange(`failed_auth:ip:${ip}`, 0, -1);
      const uniqueAccounts = new Set(ipData.map(d => d.split(':')[1]));
      
      if (uniqueAccounts.size >= this.suspiciousPatterns.credentialStuffing) {
        patterns.detected = true;
        patterns.types.push('credential_stuffing');
        patterns.score += 0.7;
      }
      
      // Check for known attack patterns
      const attackPatterns = await this.checkKnownAttackPatterns(identifier, ip);
      if (attackPatterns.detected) {
        patterns.detected = true;
        patterns.types.push(...attackPatterns.types);
        patterns.score += attackPatterns.score;
      }
      
      patterns.score = Math.min(1, patterns.score);
      
    } catch (error) {
      this.logger.error('Failed to detect patterns', error);
    }
    
    return patterns;
  }
  
  /**
   * Check for known attack patterns
   */
  async checkKnownAttackPatterns(identifier, ip) {
    const patterns = {
      detected: false,
      types: [],
      score: 0,
    };
    
    // Common weak passwords being tried
    const weakPasswords = ['password', '123456', 'admin', 'qwerty'];
    const commonUsernames = ['admin', 'root', 'test', 'user'];
    
    // Check if identifier matches common targets
    if (commonUsernames.includes(identifier.toLowerCase())) {
      patterns.detected = true;
      patterns.types.push('common_username');
      patterns.score += 0.2;
    }
    
    // Check if IP is from known bad ranges (simplified)
    if (await this.isKnownBadIP(ip)) {
      patterns.detected = true;
      patterns.types.push('bad_ip');
      patterns.score += 0.5;
    }
    
    return patterns;
  }
  
  /**
   * Handle suspicious activity
   */
  async handleSuspiciousActivity(identifier, ip, suspicious) {
    try {
      // Immediate lockout for high-risk patterns
      if (suspicious.score >= 0.7) {
        const lockout = {
          duration: 3600, // 1 hour
          severity: 4,
          threshold: 0,
        };
        
        await this.applyLockout(identifier, ip, lockout, {
          reason: 'Suspicious activity detected',
          patterns: suspicious.types,
          score: suspicious.score,
        });
      }
      
      // Log security event
      await this.logSecurityEvent('SUSPICIOUS_ACTIVITY', {
        identifier,
        ip,
        patterns: suspicious.types,
        score: suspicious.score,
      });
      
      // Alert security team for high-risk activities
      if (suspicious.score >= 0.5) {
        await this.alertSecurityTeam(identifier, ip, suspicious);
      }
      
    } catch (error) {
      this.logger.error('Failed to handle suspicious activity', error);
    }
  }
  
  /**
   * Check global rate limiting
   */
  async checkGlobalRateLimit(ip) {
    if (!this.redis) {
      return null;
    }
    
    try {
      const key = `rate_limit:${ip}`;
      const count = await this.redis.incr(key);
      
      if (count === 1) {
        await this.redis.expire(key, 3600); // 1 hour window
      }
      
      if (count > this.ipRateLimitPerHour) {
        return {
          reason: 'Rate limit exceeded',
          lockedUntil: new Date(Date.now() + 3600000),
          remainingSeconds: 3600,
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to check rate limit', error);
      return null;
    }
  }
  
  /**
   * Check if IP is known bad
   */
  async isKnownBadIP(ip) {
    // This would integrate with threat intelligence feeds
    // For now, just a placeholder
    return false;
  }
  
  /**
   * Notify user of failed attempts
   */
  async notifyUser(identifier, attempts, ip) {
    try {
      // Queue notification for email service
      if (this.redis) {
        await this.redis.lpush(
          'notification_queue',
          JSON.stringify({
            type: 'failed_login_attempts',
            identifier,
            attempts,
            ip,
            timestamp: Date.now(),
          })
        );
      }
      
      this.logger.info('User notification queued', { identifier, attempts });
    } catch (error) {
      this.logger.error('Failed to queue notification', error);
    }
  }
  
  /**
   * Alert security team
   */
  async alertSecurityTeam(identifier, ip, suspicious) {
    try {
      // Queue high-priority alert
      if (this.redis) {
        await this.redis.lpush(
          'security_alerts',
          JSON.stringify({
            type: 'suspicious_login_activity',
            identifier,
            ip,
            patterns: suspicious.types,
            score: suspicious.score,
            timestamp: Date.now(),
            priority: 'high',
          })
        );
      }
      
      this.logger.warn('Security alert raised', {
        identifier,
        ip,
        patterns: suspicious.types,
      });
    } catch (error) {
      this.logger.error('Failed to raise security alert', error);
    }
  }
  
  /**
   * Log failed attempt to database
   */
  async logFailedAttempt(identifier, ip, metadata) {
    try {
      if (this.mongoClient) {
        const db = this.mongoClient.getDb();
        await db.collection('failed_auth_attempts').insertOne({
          identifier,
          ip,
          timestamp: new Date(),
          ...metadata,
        });
      }
    } catch (error) {
      this.logger.error('Failed to log attempt to database', error);
    }
  }
  
  /**
   * Log security events
   */
  async logSecurityEvent(event, data) {
    try {
      if (this.mongoClient) {
        const db = this.mongoClient.getDb();
        await db.collection('security_events').insertOne({
          event,
          data,
          timestamp: new Date(),
        });
      }
      
      this.logger.info(`Security Event: ${event}`, data);
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }
  
  /**
   * Get lockout statistics
   */
  async getLockoutStats() {
    const stats = {
      currentLockouts: 0,
      last24Hours: 0,
      topTargetedAccounts: [],
      topAttackingIPs: [],
    };
    
    if (!this.redis) {
      return stats;
    }
    
    try {
      // Get current lockouts
      const lockoutKeys = await this.redis.keys('lockout:*');
      stats.currentLockouts = lockoutKeys.length;
      
      // Get attempts in last 24 hours
      if (this.mongoClient) {
        const db = this.mongoClient.getDb();
        const yesterday = new Date(Date.now() - 86400000);
        
        stats.last24Hours = await db.collection('failed_auth_attempts')
          .countDocuments({ timestamp: { $gte: yesterday } });
        
        // Top targeted accounts
        const topAccounts = await db.collection('failed_auth_attempts')
          .aggregate([
            { $match: { timestamp: { $gte: yesterday } } },
            { $group: { _id: '$identifier', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ])
          .toArray();
        
        stats.topTargetedAccounts = topAccounts;
        
        // Top attacking IPs
        const topIPs = await db.collection('failed_auth_attempts')
          .aggregate([
            { $match: { timestamp: { $gte: yesterday } } },
            { $group: { _id: '$ip', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ])
          .toArray();
        
        stats.topAttackingIPs = topIPs;
      }
      
    } catch (error) {
      this.logger.error('Failed to get lockout stats', error);
    }
    
    return stats;
  }
}

export { AccountLockout };