import { EventTypes, PromptSecurity, EncryptionUtils } from '@ux-flow/common';

/**
 * AI-specific security manager for the Cognitive Core service
 * Handles prompt injection detection, AI model security, and conversation safety
 */
class AISecurityManager {
  constructor(logger, eventEmitter, redisClient, config = {}) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.redisClient = redisClient;
    
    // Initialize shared security utilities
    this.promptSecurity = new PromptSecurity({
      maxPromptLength: config.maxPromptLength || 50000,
      maxTokensPerRequest: config.maxTokensPerRequest || 8192,
      enableInjectionDetection: config.enableInjectionDetection !== false,
      enableSanitization: config.enableSanitization !== false
    });
    
    this.encryptionUtils = new EncryptionUtils();
    
    this.config = {
      // AI-specific security settings
      maxConversationLength: config.maxConversationLength || 100,
      maxRequestsPerMinute: config.maxRequestsPerMinute || 30,
      maxConcurrentRequests: config.maxConcurrentRequests || 100,
      
      // Model-specific limits
      modelLimits: config.modelLimits || {
        'gemini-1.5-flash': { maxTokens: 8192, rateLimit: 60 },
        'gemini-1.5-pro': { maxTokens: 32768, rateLimit: 30 },
        'gpt-4': { maxTokens: 8192, rateLimit: 40 },
        'claude-3': { maxTokens: 100000, rateLimit: 50 }
      },
      
      // Conversation monitoring
      enableConversationMonitoring: config.enableConversationMonitoring !== false,
      suspiciousScoreThreshold: config.suspiciousScoreThreshold || 0.3,
      
      // Alert thresholds
      alertThresholds: {
        promptInjectionAttempts: config.promptInjectionAttempts || 5,
        rateLimitViolations: config.rateLimitViolations || 10,
        suspiciousConversations: config.suspiciousConversations || 3
      }
    };

    // Security metrics
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      sanitizedPrompts: 0,
      rateLimitViolations: 0,
      suspiciousConversations: new Set(),
      modelUsage: {}
    };

    // Rate limiting maps
    this.userRequestCounts = new Map();
    this.conversationSecurityScores = new Map();
    
    // Start monitoring
    this.startSecurityMonitoring();
  }

  /**
   * Validate and secure an AI request
   */
  async validateAIRequest(userId, prompt, context = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    try {
      // Check rate limits
      const rateLimitCheck = await this.checkRateLimit(userId, context.model);
      if (!rateLimitCheck.allowed) {
        this.metrics.rateLimitViolations++;
        this.metrics.blockedRequests++;
        
        await this.handleSecurityViolation('RATE_LIMIT', {
          userId,
          limit: rateLimitCheck.limit,
          current: rateLimitCheck.current
        });
        
        return {
          allowed: false,
          reason: 'Rate limit exceeded',
          retryAfter: rateLimitCheck.retryAfter
        };
      }

      // Check prompt security
      const securityCheck = await this.promptSecurity.checkPromptSecurity(prompt, context);
      
      // Update conversation security score
      this.updateConversationSecurityScore(
        context.conversationId || userId,
        securityCheck.securityScore
      );
      
      // Handle insecure prompts
      if (!securityCheck.isSecure) {
        this.logger.warn('Insecure prompt detected', {
          userId,
          securityScore: securityCheck.securityScore,
          issues: securityCheck.issues
        });
        
        if (securityCheck.securityScore < this.config.suspiciousScoreThreshold) {
          this.metrics.blockedRequests++;
          
          await this.handleSecurityViolation('PROMPT_INJECTION', {
            userId,
            securityScore: securityCheck.securityScore,
            issues: securityCheck.issues
          });
          
          return {
            allowed: false,
            reason: 'Security threat detected',
            issues: securityCheck.issues
          };
        }
        
        // Allow with sanitization for moderate threats
        this.metrics.sanitizedPrompts++;
        prompt = securityCheck.sanitizedPrompt;
      }

      // Check conversation context
      const conversationCheck = await this.validateConversationContext(
        userId,
        context.conversationId,
        context
      );
      
      if (!conversationCheck.valid) {
        return {
          allowed: false,
          reason: conversationCheck.reason
        };
      }

      // Encrypt sensitive data if needed
      if (context.encryptSensitive) {
        prompt = await this.encryptSensitiveContent(prompt, userId);
      }

      const processingTime = Date.now() - startTime;
      
      return {
        allowed: true,
        prompt: prompt, // May be sanitized
        securityScore: securityCheck.securityScore,
        processingTime,
        metadata: {
          sanitized: prompt !== securityCheck.sanitizedPrompt,
          rateLimitRemaining: rateLimitCheck.remaining,
          securityChecks: securityCheck.checks
        }
      };

    } catch (error) {
      this.logger.error('Error validating AI request', error, {
        userId,
        processingTime: Date.now() - startTime
      });
      
      // Fail closed - deny on error
      return {
        allowed: false,
        reason: 'Security validation error',
        error: error.message
      };
    }
  }

  /**
   * Check rate limits for user and model
   */
  async checkRateLimit(userId, model = 'gemini-1.5-flash') {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${userId}:${minute}`;
    
    // Get or create user request count
    if (!this.userRequestCounts.has(key)) {
      this.userRequestCounts.set(key, { count: 0, timestamp: minute });
    }
    
    const userRequests = this.userRequestCounts.get(key);
    
    // Clean old entries
    for (const [k, v] of this.userRequestCounts.entries()) {
      if (v.timestamp < minute - 1) {
        this.userRequestCounts.delete(k);
      }
    }
    
    // Check limits
    const modelLimit = this.config.modelLimits[model] || { rateLimit: 30 };
    const userLimit = this.config.maxRequestsPerMinute;
    const effectiveLimit = Math.min(modelLimit.rateLimit, userLimit);
    
    if (userRequests.count >= effectiveLimit) {
      return {
        allowed: false,
        limit: effectiveLimit,
        current: userRequests.count,
        retryAfter: (minute + 1) * 60000 - now,
        remaining: 0
      };
    }
    
    // Increment counter
    userRequests.count++;
    
    // Update model usage stats
    if (!this.metrics.modelUsage[model]) {
      this.metrics.modelUsage[model] = 0;
    }
    this.metrics.modelUsage[model]++;
    
    return {
      allowed: true,
      limit: effectiveLimit,
      current: userRequests.count,
      remaining: effectiveLimit - userRequests.count
    };
  }

  /**
   * Validate conversation context
   */
  async validateConversationContext(userId, conversationId, context) {
    if (!conversationId) {
      return { valid: true };
    }
    
    // Check conversation length
    const conversationLength = context.messageCount || 0;
    if (conversationLength > this.config.maxConversationLength) {
      return {
        valid: false,
        reason: `Conversation exceeds maximum length of ${this.config.maxConversationLength} messages`
      };
    }
    
    // Check conversation security score
    const securityScore = this.conversationSecurityScores.get(conversationId) || 1.0;
    if (securityScore < this.config.suspiciousScoreThreshold) {
      this.metrics.suspiciousConversations.add(conversationId);
      
      return {
        valid: false,
        reason: 'Conversation flagged as suspicious due to previous security violations'
      };
    }
    
    // Check for conversation hijacking attempts
    const storedUserId = await this.redisClient.get(`conversation:${conversationId}:user`);
    if (storedUserId && storedUserId !== userId) {
      await this.handleSecurityViolation('CONVERSATION_HIJACK', {
        userId,
        conversationId,
        originalUser: storedUserId
      });
      
      return {
        valid: false,
        reason: 'Unauthorized access to conversation'
      };
    }
    
    return { valid: true };
  }

  /**
   * Update conversation security score
   */
  updateConversationSecurityScore(conversationId, newScore) {
    const currentScore = this.conversationSecurityScores.get(conversationId) || 1.0;
    
    // Weighted average with bias toward recent scores
    const updatedScore = (currentScore * 0.3) + (newScore * 0.7);
    
    this.conversationSecurityScores.set(conversationId, updatedScore);
    
    // Alert if conversation becomes suspicious
    if (updatedScore < this.config.suspiciousScoreThreshold && currentScore >= this.config.suspiciousScoreThreshold) {
      this.logger.warn('Conversation became suspicious', {
        conversationId,
        previousScore: currentScore,
        newScore: updatedScore
      });
      
      this.eventEmitter.emit(EventTypes.SECURITY_ALERT, {
        type: 'SUSPICIOUS_CONVERSATION',
        conversationId,
        securityScore: updatedScore
      });
    }
  }

  /**
   * Handle security violations
   */
  async handleSecurityViolation(violationType, details) {
    this.logger.error('Security violation detected', {
      type: violationType,
      ...details
    });
    
    // Emit security event
    this.eventEmitter.emit(EventTypes.SECURITY_VIOLATION, {
      type: violationType,
      timestamp: new Date().toISOString(),
      details
    });
    
    // Store violation in Redis for analysis
    const violationKey = `security:violation:${violationType}:${Date.now()}`;
    await this.redisClient.set(violationKey, {
      type: violationType,
      timestamp: new Date().toISOString(),
      ...details
    }, 86400); // 24 hour TTL
    
    // Check if we need to trigger alerts
    await this.checkAlertThresholds(violationType);
  }

  /**
   * Check if alert thresholds are exceeded
   */
  async checkAlertThresholds(violationType) {
    const violations = await this.redisClient.keys(`security:violation:${violationType}:*`);
    const recentViolations = violations.filter(key => {
      const timestamp = parseInt(key.split(':').pop());
      return Date.now() - timestamp < 3600000; // Last hour
    });
    
    const thresholdMap = {
      'PROMPT_INJECTION': this.config.alertThresholds.promptInjectionAttempts,
      'RATE_LIMIT': this.config.alertThresholds.rateLimitViolations,
      'SUSPICIOUS_CONVERSATION': this.config.alertThresholds.suspiciousConversations
    };
    
    const threshold = thresholdMap[violationType];
    if (threshold && recentViolations.length >= threshold) {
      this.logger.error('Security alert threshold exceeded', {
        violationType,
        count: recentViolations.length,
        threshold
      });
      
      this.eventEmitter.emit(EventTypes.CRITICAL_SECURITY_ALERT, {
        type: violationType,
        count: recentViolations.length,
        threshold,
        message: `${violationType} threshold exceeded: ${recentViolations.length}/${threshold} in the last hour`
      });
    }
  }

  /**
   * Encrypt sensitive content in prompts
   */
  async encryptSensitiveContent(prompt, userId) {
    // Generate user-specific encryption key
    const userKey = this.encryptionUtils.deriveKeyScrypt(
      process.env.ENCRYPTION_MASTER_KEY || 'default-master-key',
      userId,
      32
    );
    
    // Detect and encrypt sensitive patterns
    const patterns = {
      apiKeys: /([a-zA-Z0-9]{32,})/g,
      emails: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
    };
    
    let encryptedPrompt = prompt;
    for (const [type, pattern] of Object.entries(patterns)) {
      encryptedPrompt = encryptedPrompt.replace(pattern, (match) => {
        const encrypted = this.encryptionUtils.encrypt(match, userKey);
        return `[ENCRYPTED:${type}:${encrypted.combined.toString('base64')}]`;
      });
    }
    
    return encryptedPrompt;
  }

  /**
   * Validate agent response before sending to user
   */
  async validateAgentResponse(response, context = {}) {
    // Check for potential data leakage
    const sensitivePatterns = [
      /GOOGLE_API_KEY/gi,
      /MONGODB_URI/gi,
      /JWT_SECRET/gi,
      /process\.env\./gi,
      /password\s*[:=]\s*["'][^"']+["']/gi
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(response)) {
        this.logger.error('Sensitive data detected in agent response', {
          pattern: pattern.source,
          context
        });
        
        // Sanitize response
        response = response.replace(pattern, '[REDACTED]');
      }
    }
    
    return response;
  }

  /**
   * Start security monitoring
   */
  startSecurityMonitoring() {
    // Monitor security metrics every minute
    this.monitoringInterval = setInterval(() => {
      const stats = {
        ...this.metrics,
        promptSecurityStats: this.promptSecurity.getStatistics(),
        suspiciousConversationCount: this.metrics.suspiciousConversations.size,
        activeRateLimits: this.userRequestCounts.size
      };
      
      this.logger.info('Security metrics', stats);
      
      // Reset some metrics
      if (this.metrics.totalRequests > 10000) {
        this.metrics.totalRequests = 0;
        this.metrics.blockedRequests = 0;
        this.metrics.sanitizedPrompts = 0;
        this.metrics.rateLimitViolations = 0;
      }
    }, 60000);
  }

  /**
   * Get security report
   */
  getSecurityReport() {
    return {
      metrics: this.metrics,
      promptSecurityStats: this.promptSecurity.getStatistics(),
      suspiciousConversations: Array.from(this.metrics.suspiciousConversations),
      conversationScores: Array.from(this.conversationSecurityScores.entries())
        .map(([id, score]) => ({ conversationId: id, securityScore: score }))
        .sort((a, b) => a.securityScore - b.securityScore)
        .slice(0, 10), // Top 10 most suspicious
      modelUsage: this.metrics.modelUsage
    };
  }

  /**
   * Shutdown security manager
   */
  async shutdown() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Save final metrics
    const report = this.getSecurityReport();
    await this.redisClient.set('security:final-report', report, 86400);
    
    this.logger.info('AISecurityManager shutdown completed', report);
  }
}

export { AISecurityManager };