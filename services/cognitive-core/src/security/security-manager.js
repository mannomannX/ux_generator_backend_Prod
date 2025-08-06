// ==========================================
// SERVICES/COGNITIVE-CORE/src/security/security-manager.js
// ==========================================

import crypto from 'crypto';
import { EventTypes } from '@ux-flow/common';

/**
 * SecurityManager handles all security-related operations for the Cognitive Core service
 * Including prompt injection detection, API key rotation, secure communication, and threat monitoring
 */
class SecurityManager {
  constructor(logger, eventEmitter, redisClient, config = {}) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.redisClient = redisClient;
    
    this.config = {
      // Prompt injection detection
      maxPromptLength: config.maxPromptLength || 50000,
      suspiciousPatterns: config.suspiciousPatterns || this.getDefaultSuspiciousPatterns(),
      maxTokensPerRequest: config.maxTokensPerRequest || 8192,
      
      // API key security
      keyRotationIntervalMs: config.keyRotationIntervalMs || 7 * 24 * 60 * 60 * 1000, // 7 days
      maxFailuresBeforeRotation: config.maxFailuresBeforeRotation || 50,
      
      // Rate limiting and DDoS protection
      maxRequestsPerSecond: config.maxRequestsPerSecond || 10,
      maxConcurrentRequests: config.maxConcurrentRequests || 100,
      
      // Data encryption
      encryptionAlgorithm: 'aes-256-gcm',
      keyDerivationIterations: 100000,
      
      // Threat monitoring
      alertThresholds: {
        suspiciousActivityScore: config.suspiciousActivityScore || 0.7,
        apiKeyFailureRate: config.apiKeyFailureRate || 0.1,
        promptInjectionAttempts: config.promptInjectionAttempts || 5
      }
    };

    // Security state tracking
    this.securityMetrics = {
      promptInjectionAttempts: 0,
      apiKeyFailures: 0,
      suspiciousActivities: 0,
      encryptionOperations: 0,
      securityAlerts: 0
    };

    // Active threat tracking
    this.activeThreatSources = new Map();
    this.recentAlerts = new Map();

    // Initialize security monitoring
    this.initializeSecurityMonitoring();
  }

  /**
   * Initialize security monitoring and periodic tasks
   */
  initializeSecurityMonitoring() {
    // Periodic security health check
    this.securityHealthInterval = setInterval(() => {
      this.performSecurityHealthCheck();
    }, 60000); // Every minute

    // Cleanup old threat data
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldThreatData();
    }, 300000); // Every 5 minutes

    this.logger.info('Security monitoring initialized', {
      component: 'SecurityManager',
      intervals: {
        healthCheck: '60s',
        cleanup: '300s'
      }
    });
  }

  /**
   * Detect and prevent prompt injection attacks
   */
  async detectPromptInjection(prompt, context = {}) {
    const startTime = Date.now();
    
    try {
      const injectionScore = await this.calculateInjectionScore(prompt);
      const threats = this.detectSpecificThreats(prompt);
      
      const result = {
        isInjection: injectionScore > 0.7,
        injectionScore,
        threats,
        sanitizedPrompt: null,
        blocked: false
      };

      // Block high-risk prompts
      if (injectionScore > 0.8) {
        result.blocked = true;
        this.securityMetrics.promptInjectionAttempts++;
        
        await this.handleSecurityThreat('prompt_injection', {
          score: injectionScore,
          threats,
          userId: context.userId,
          projectId: context.projectId,
          promptPreview: prompt.substring(0, 100)
        });
        
        this.logger.warn('Prompt injection blocked', {
          component: 'SecurityManager',
          injectionScore,
          threats,
          userId: context.userId,
          projectId: context.projectId
        });
        
        throw new Error('Security violation: Prompt injection detected and blocked');
      }

      // Sanitize medium-risk prompts
      if (injectionScore > 0.5) {
        result.sanitizedPrompt = await this.sanitizePrompt(prompt);
        
        this.logger.warn('Prompt sanitized due to security risk', {
          component: 'SecurityManager',
          injectionScore,
          threats,
          originalLength: prompt.length,
          sanitizedLength: result.sanitizedPrompt.length
        });
      }

      const processingTime = Date.now() - startTime;
      this.logger.debug('Prompt injection detection completed', {
        component: 'SecurityManager',
        injectionScore,
        processingTime,
        blocked: result.blocked
      });

      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Prompt injection detection failed', error, {
        component: 'SecurityManager',
        processingTime,
        promptLength: prompt.length
      });
      
      // Fail securely - block the prompt if we can't analyze it
      return {
        isInjection: true,
        injectionScore: 1.0,
        threats: ['analysis_failure'],
        sanitizedPrompt: null,
        blocked: true
      };
    }
  }

  /**
   * Calculate injection score based on multiple factors
   */
  async calculateInjectionScore(prompt) {
    let score = 0;
    
    // Length-based scoring
    if (prompt.length > this.config.maxPromptLength) {
      score += 0.3;
    }
    
    // Pattern-based scoring
    for (const pattern of this.config.suspiciousPatterns) {
      const matches = (prompt.match(pattern.regex) || []).length;
      score += matches * pattern.weight;
    }
    
    // Entropy analysis (high randomness might indicate obfuscation)
    const entropy = this.calculateEntropy(prompt);
    if (entropy > 7) {
      score += 0.2;
    }
    
    // Token count analysis
    const estimatedTokens = Math.ceil(prompt.length / 4);
    if (estimatedTokens > this.config.maxTokensPerRequest) {
      score += 0.2;
    }
    
    // Repetition detection (could indicate injection attempts)
    const repetitionScore = this.detectRepetition(prompt);
    score += repetitionScore * 0.3;
    
    // Base64/hex encoding detection
    const encodingScore = this.detectSuspiciousEncoding(prompt);
    score += encodingScore * 0.2;

    return Math.min(score, 1.0);
  }

  /**
   * Detect specific threat types in prompt
   */
  detectSpecificThreats(prompt) {
    const threats = [];
    const lowerPrompt = prompt.toLowerCase();
    
    // System command injection
    if (/(?:system|exec|eval|spawn|child_process)/i.test(prompt)) {
      threats.push('system_command_injection');
    }
    
    // Credential extraction
    if (/(?:password|token|key|secret|credential)/i.test(prompt)) {
      threats.push('credential_extraction');
    }
    
    // Model manipulation
    if (/(?:ignore|forget|override|bypass|jailbreak)/i.test(prompt)) {
      threats.push('model_manipulation');
    }
    
    // Data exfiltration
    if (/(?:database|file|document|export|download)/i.test(prompt)) {
      threats.push('data_exfiltration');
    }
    
    // Role manipulation
    if (/(?:you are now|pretend to be|act as|roleplay)/i.test(prompt)) {
      threats.push('role_manipulation');
    }
    
    // Prompt termination attempts
    if (/(?:"""|```|###|---end---|stop generation)/i.test(prompt)) {
      threats.push('prompt_termination');
    }

    return threats;
  }

  /**
   * Sanitize potentially malicious prompts
   */
  async sanitizePrompt(prompt) {
    let sanitized = prompt;
    
    // Remove suspicious patterns
    for (const pattern of this.config.suspiciousPatterns) {
      if (pattern.remove) {
        sanitized = sanitized.replace(pattern.regex, '');
      }
    }
    
    // Limit length
    if (sanitized.length > this.config.maxPromptLength) {
      sanitized = sanitized.substring(0, this.config.maxPromptLength);
    }
    
    // Remove excessive repetition
    sanitized = this.removeExcessiveRepetition(sanitized);
    
    // Decode and re-encode suspicious content
    sanitized = this.normalizeSuspiciousEncoding(sanitized);
    
    // Add security marker
    sanitized = `[SANITIZED] ${sanitized}`;
    
    return sanitized;
  }

  /**
   * Manage API key security and rotation
   */
  async manageApiKeySecurity(provider, apiKey) {
    const keyId = this.generateKeyId(provider, apiKey);
    const keyData = await this.getApiKeyData(keyId);
    
    // Check if key needs rotation
    const rotationNeeded = await this.checkKeyRotationNeeded(keyData);
    
    if (rotationNeeded) {
      await this.initiateKeyRotation(provider, keyId);
      
      this.logger.warn('API key rotation initiated', {
        component: 'SecurityManager',
        provider,
        reason: rotationNeeded.reason,
        failures: keyData?.failures || 0
      });
      
      // Emit security event
      this.eventEmitter.emit(EventTypes.SECURITY_KEY_ROTATION, {
        provider,
        reason: rotationNeeded.reason,
        timestamp: new Date()
      });
    }
    
    // Update key usage statistics
    await this.updateKeyUsageStats(keyId, 'usage');
    
    return {
      keySecure: !rotationNeeded,
      rotationNeeded: !!rotationNeeded,
      keyAge: keyData?.createdAt ? Date.now() - keyData.createdAt : 0
    };
  }

  /**
   * Handle API key failures securely
   */
  async handleApiKeyFailure(provider, error, context = {}) {
    const keyId = this.generateKeyId(provider, context.apiKey);
    await this.updateKeyUsageStats(keyId, 'failure');
    
    this.securityMetrics.apiKeyFailures++;
    
    // Check for potential key compromise
    const keyData = await this.getApiKeyData(keyId);
    const failureRate = keyData.failures / (keyData.usage || 1);
    
    if (failureRate > this.config.alertThresholds.apiKeyFailureRate) {
      await this.handleSecurityThreat('api_key_compromise', {
        provider,
        failureRate,
        totalFailures: keyData.failures,
        error: error.message
      });
    }
    
    this.logger.error('API key failure handled', error, {
      component: 'SecurityManager',
      provider,
      failureRate,
      totalFailures: keyData.failures
    });
  }

  /**
   * Encrypt sensitive data before storage
   */
  async encryptSensitiveData(data, context = {}) {
    try {
      const key = await this.deriveEncryptionKey(context.userId || 'system');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.config.encryptionAlgorithm, key);
      
      cipher.setAAD(Buffer.from(context.projectId || 'default'));
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      this.securityMetrics.encryptionOperations++;
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.config.encryptionAlgorithm
      };
      
    } catch (error) {
      this.logger.error('Data encryption failed', error, {
        component: 'SecurityManager',
        dataType: typeof data
      });
      throw new Error('Encryption operation failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptSensitiveData(encryptedData, context = {}) {
    try {
      const key = await this.deriveEncryptionKey(context.userId || 'system');
      const decipher = crypto.createDecipher(
        encryptedData.algorithm, 
        key
      );
      
      decipher.setAAD(Buffer.from(context.projectId || 'default'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
      
    } catch (error) {
      this.logger.error('Data decryption failed', error, {
        component: 'SecurityManager',
        algorithm: encryptedData.algorithm
      });
      throw new Error('Decryption operation failed');
    }
  }

  /**
   * Monitor and handle security threats
   */
  async handleSecurityThreat(threatType, threatData) {
    const threatId = `threat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const threat = {
      id: threatId,
      type: threatType,
      data: threatData,
      timestamp: new Date(),
      severity: this.calculateThreatSeverity(threatType, threatData),
      source: threatData.userId || threatData.ip || 'unknown',
      handled: false
    };
    
    // Store threat for analysis
    await this.storeThreatData(threat);
    
    // Update active threat sources
    this.updateActiveThreatSources(threat);
    
    // Check if alert should be raised
    if (threat.severity >= 0.8) {
      await this.raiseSecurityAlert(threat);
    }
    
    this.securityMetrics.suspiciousActivities++;
    
    this.logger.warn('Security threat handled', {
      component: 'SecurityManager',
      threatId,
      threatType,
      severity: threat.severity,
      source: threat.source
    });
    
    // Emit security event
    this.eventEmitter.emit(EventTypes.SECURITY_THREAT_DETECTED, {
      threatId,
      threatType,
      severity: threat.severity,
      source: threat.source,
      timestamp: threat.timestamp
    });
    
    return threatId;
  }

  /**
   * Perform periodic security health check
   */
  async performSecurityHealthCheck() {
    try {
      const health = {
        timestamp: new Date(),
        status: 'healthy',
        metrics: { ...this.securityMetrics },
        activeThreatSources: this.activeThreatSources.size,
        recentAlerts: this.recentAlerts.size,
        issues: []
      };
      
      // Check for high threat activity
      if (this.securityMetrics.suspiciousActivities > 100) {
        health.status = 'degraded';
        health.issues.push('High suspicious activity detected');
      }
      
      // Check API key failure rate
      const totalApiCalls = this.securityMetrics.apiKeyFailures + 1000; // Estimated
      const failureRate = this.securityMetrics.apiKeyFailures / totalApiCalls;
      if (failureRate > this.config.alertThresholds.apiKeyFailureRate) {
        health.status = 'critical';
        health.issues.push('High API key failure rate detected');
      }
      
      // Check for active threats
      if (this.activeThreatSources.size > 10) {
        health.status = 'critical';
        health.issues.push('Multiple active threat sources detected');
      }
      
      // Emit health status
      this.eventEmitter.emit(EventTypes.SECURITY_HEALTH_CHECK, health);
      
      if (health.status !== 'healthy') {
        this.logger.warn('Security health check detected issues', {
          component: 'SecurityManager',
          status: health.status,
          issues: health.issues,
          metrics: health.metrics
        });
      }
      
    } catch (error) {
      this.logger.error('Security health check failed', error, {
        component: 'SecurityManager'
      });
    }
  }

  /**
   * Get comprehensive security status
   */
  getSecurityStatus() {
    return {
      status: this.calculateOverallSecurityStatus(),
      metrics: { ...this.securityMetrics },
      activeThreatSources: this.activeThreatSources.size,
      recentAlerts: Array.from(this.recentAlerts.values()),
      configuration: {
        maxPromptLength: this.config.maxPromptLength,
        maxTokensPerRequest: this.config.maxTokensPerRequest,
        encryptionEnabled: true,
        threatMonitoringEnabled: true
      },
      lastHealthCheck: new Date()
    };
  }

  /**
   * Helper Methods
   */

  getDefaultSuspiciousPatterns() {
    return [
      { regex: /(?:ignore|forget|disregard)\s+(?:previous|above|earlier)/gi, weight: 0.4, remove: true },
      { regex: /(?:system|admin|root|sudo)\s+(?:command|exec|run)/gi, weight: 0.5, remove: true },
      { regex: /(?:eval|exec|spawn)\s*\(/gi, weight: 0.6, remove: true },
      { regex: /(?:password|token|key|secret)\s*[:=]/gi, weight: 0.3, remove: false },
      { regex: /(?:jailbreak|bypass|override|hack)/gi, weight: 0.4, remove: true },
      { regex: /(?:\bAI\b|\bassistant\b)\s+(?:you are|pretend|act as)/gi, weight: 0.3, remove: false }
    ];
  }

  calculateEntropy(text) {
    const freq = {};
    for (let char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }
    
    let entropy = 0;
    const len = text.length;
    for (let char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }

  detectRepetition(text) {
    const words = text.split(/\s+/);
    const wordFreq = {};
    let maxFreq = 0;
    
    for (let word of words) {
      if (word.length > 3) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
        maxFreq = Math.max(maxFreq, wordFreq[word]);
      }
    }
    
    return Math.min(maxFreq / words.length, 1.0);
  }

  detectSuspiciousEncoding(text) {
    let score = 0;
    
    // Base64 detection
    const base64Matches = text.match(/[A-Za-z0-9+\/]{20,}={0,2}/g) || [];
    score += base64Matches.length * 0.1;
    
    // Hex encoding detection
    const hexMatches = text.match(/(?:0x)?[0-9a-fA-F]{16,}/g) || [];
    score += hexMatches.length * 0.1;
    
    // URL encoding detection
    const urlEncodedMatches = text.match(/%[0-9a-fA-F]{2}/g) || [];
    score += urlEncodedMatches.length * 0.05;
    
    return Math.min(score, 1.0);
  }

  removeExcessiveRepetition(text) {
    return text.replace(/(.{10,}?)\1{3,}/g, '$1');
  }

  normalizeSuspiciousEncoding(text) {
    try {
      // Decode URL encoding
      let normalized = decodeURIComponent(text);
      
      // Basic base64 detection and decoding (with caution)
      const base64Pattern = /^[A-Za-z0-9+\/]{4}*={0,2}$/;
      if (base64Pattern.test(normalized) && normalized.length > 20) {
        try {
          const decoded = Buffer.from(normalized, 'base64').toString('utf8');
          if (/^[\x20-\x7E\s]*$/.test(decoded)) { // Only printable ASCII
            normalized = decoded;
          }
        } catch (e) {
          // Keep original if decoding fails
        }
      }
      
      return normalized;
    } catch (e) {
      return text;
    }
  }

  generateKeyId(provider, apiKey) {
    return crypto.createHash('sha256')
      .update(`${provider}:${apiKey}`)
      .digest('hex')
      .substring(0, 16);
  }

  async getApiKeyData(keyId) {
    try {
      const data = await this.redisClient.get(`security:apikey:${keyId}`);
      return data || {
        usage: 0,
        failures: 0,
        createdAt: Date.now(),
        lastUsed: null
      };
    } catch (error) {
      return {
        usage: 0,
        failures: 0,
        createdAt: Date.now(),
        lastUsed: null
      };
    }
  }

  async updateKeyUsageStats(keyId, type) {
    try {
      const data = await this.getApiKeyData(keyId);
      
      if (type === 'usage') {
        data.usage++;
        data.lastUsed = Date.now();
      } else if (type === 'failure') {
        data.failures++;
      }
      
      await this.redisClient.set(`security:apikey:${keyId}`, data, 86400); // 24h TTL
    } catch (error) {
      this.logger.warn('Failed to update key usage stats', {
        component: 'SecurityManager',
        keyId,
        type,
        error: error.message
      });
    }
  }

  async checkKeyRotationNeeded(keyData) {
    const keyAge = Date.now() - keyData.createdAt;
    
    if (keyAge > this.config.keyRotationIntervalMs) {
      return { reason: 'age_exceeded', keyAge };
    }
    
    if (keyData.failures > this.config.maxFailuresBeforeRotation) {
      return { reason: 'failure_threshold', failures: keyData.failures };
    }
    
    return null;
  }

  async initiateKeyRotation(provider, keyId) {
    // This would typically integrate with a key management system
    this.logger.info('Key rotation initiated', {
      component: 'SecurityManager',
      provider,
      keyId
    });
    
    // Clear old key data
    await this.redisClient.del(`security:apikey:${keyId}`);
  }

  async deriveEncryptionKey(userId) {
    const salt = Buffer.from(userId + process.env.JWT_SECRET, 'utf8');
    return crypto.pbkdf2Sync('encryption-key', salt, this.config.keyDerivationIterations, 32, 'sha256');
  }

  calculateThreatSeverity(threatType, threatData) {
    const severityMap = {
      prompt_injection: 0.8,
      api_key_compromise: 0.9,
      data_breach: 1.0,
      unauthorized_access: 0.7,
      rate_limit_exceeded: 0.5
    };
    
    let baseSeverity = severityMap[threatType] || 0.5;
    
    // Adjust based on threat data
    if (threatData.score && threatData.score > 0.8) {
      baseSeverity = Math.min(baseSeverity + 0.2, 1.0);
    }
    
    if (threatData.failureRate && threatData.failureRate > 0.5) {
      baseSeverity = Math.min(baseSeverity + 0.1, 1.0);
    }
    
    return baseSeverity;
  }

  async storeThreatData(threat) {
    try {
      await this.redisClient.set(
        `security:threat:${threat.id}`,
        threat,
        3600 // 1 hour TTL
      );
    } catch (error) {
      this.logger.warn('Failed to store threat data', {
        component: 'SecurityManager',
        threatId: threat.id,
        error: error.message
      });
    }
  }

  updateActiveThreatSources(threat) {
    const source = threat.source;
    if (source !== 'unknown') {
      const existing = this.activeThreatSources.get(source) || {
        count: 0,
        lastThreat: null,
        severity: 0
      };
      
      existing.count++;
      existing.lastThreat = threat.timestamp;
      existing.severity = Math.max(existing.severity, threat.severity);
      
      this.activeThreatSources.set(source, existing);
    }
  }

  async raiseSecurityAlert(threat) {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const alert = {
      id: alertId,
      threatId: threat.id,
      type: threat.type,
      severity: threat.severity,
      timestamp: new Date(),
      message: `High severity security threat detected: ${threat.type}`,
      data: threat.data
    };
    
    this.recentAlerts.set(alertId, alert);
    this.securityMetrics.securityAlerts++;
    
    // Emit critical security alert
    this.eventEmitter.emit(EventTypes.SECURITY_ALERT, alert);
    
    this.logger.error('Security alert raised', {
      component: 'SecurityManager',
      alertId,
      threatId: threat.id,
      severity: threat.severity,
      type: threat.type
    });
  }

  cleanupOldThreatData() {
    const fiveMinutesAgo = Date.now() - 300000;
    
    // Cleanup active threat sources
    for (const [source, data] of this.activeThreatSources.entries()) {
      if (data.lastThreat && data.lastThreat < fiveMinutesAgo) {
        this.activeThreatSources.delete(source);
      }
    }
    
    // Cleanup recent alerts (keep for 1 hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [alertId, alert] of this.recentAlerts.entries()) {
      if (alert.timestamp < oneHourAgo) {
        this.recentAlerts.delete(alertId);
      }
    }
  }

  calculateOverallSecurityStatus() {
    const metrics = this.securityMetrics;
    
    if (metrics.securityAlerts > 0) return 'critical';
    if (metrics.promptInjectionAttempts > 10) return 'warning';
    if (metrics.suspiciousActivities > 50) return 'warning';
    if (this.activeThreatSources.size > 5) return 'warning';
    
    return 'secure';
  }

  /**
   * Shutdown security manager
   */
  async shutdown() {
    if (this.securityHealthInterval) {
      clearInterval(this.securityHealthInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.logger.info('Security manager shutdown completed', {
      component: 'SecurityManager',
      finalMetrics: this.securityMetrics
    });
  }
}

export { SecurityManager };