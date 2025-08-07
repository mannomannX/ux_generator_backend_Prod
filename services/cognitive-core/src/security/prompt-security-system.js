// ==========================================
// COGNITIVE CORE - Prompt Security System
// Protection against prompt injection attacks
// ==========================================

import crypto from 'crypto';

export class PromptSecuritySystem {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // Prompt injection patterns
    this.injectionPatterns = [
      // Direct instruction attempts
      /ignore\s+(all\s+)?previous\s+instructions?/i,
      /forget\s+(all\s+)?previous\s+instructions?/i,
      /disregard\s+(all\s+)?previous\s+instructions?/i,
      /override\s+system\s+prompt/i,
      
      // Role playing attempts
      /you\s+are\s+now\s+a\s+(?!ux|user)/i,
      /act\s+as\s+(?!a\s+ux)/i,
      /pretend\s+to\s+be\s+(?!a\s+ux)/i,
      /role\s*:\s*(?!ux)/i,
      
      // System command attempts
      /\[SYSTEM\]/i,
      /\[\/SYSTEM\]/i,
      /\[ADMIN\]/i,
      /\[ROOT\]/i,
      /<system>/i,
      /<\/system>/i,
      
      // Code execution attempts
      /```[\s\S]*exec\(/i,
      /```[\s\S]*eval\(/i,
      /```[\s\S]*system\(/i,
      /```[\s\S]*import\s+os/i,
      
      // Data extraction attempts
      /show\s+me\s+your\s+(training|system|internal)/i,
      /what\s+are\s+your\s+(instructions|rules|guidelines)/i,
      /repeat\s+your\s+(instructions|prompt|system)/i,
      /tell\s+me\s+about\s+your\s+(training|system)/i,
      
      // Escape attempts
      /"""\s*\n\s*ignore/i,
      /'''\s*\n\s*ignore/i,
      /\n\s*---\s*\n/i,
      /\n\s*===\s*\n/i,
      
      // Character manipulation
      /[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/,  // Zero-width and directional chars
      /[\u0000-\u001f\u007f-\u009f]/,              // Control characters
      
      // Prompt boundary attempts
      /\[END\s+PROMPT\]/i,
      /\[START\s+NEW\s+PROMPT\]/i,
      /---END---/i,
      /---START---/i,
      
      // Developer mode attempts
      /developer\s+mode/i,
      /debug\s+mode/i,
      /admin\s+mode/i,
      /maintenance\s+mode/i,
      
      // Token manipulation
      /\[TOKEN\]/i,
      /\[\/TOKEN\]/i,
      /\<TOKEN\>/i,
      /\<\/TOKEN\>/i
    ];
    
    // Suspicious keywords that increase threat score
    this.suspiciousKeywords = [
      'jailbreak', 'bypass', 'hack', 'exploit', 'vulnerability',
      'injection', 'manipulation', 'override', 'backdoor',
      'privilege', 'escalation', 'sudo', 'root', 'admin',
      'system32', '/etc/', '/bin/', 'powershell', 'cmd.exe',
      'eval', 'exec', 'shell', 'bash', 'ssh', 'ftp'
    ];
    
    // Whitelist patterns for legitimate UX content
    this.whitelistPatterns = [
      /user\s+experience/i,
      /user\s+interface/i,
      /design\s+system/i,
      /wireframe/i,
      /prototype/i,
      /usability/i,
      /accessibility/i,
      /interaction\s+design/i,
      /information\s+architecture/i,
      /user\s+journey/i,
      /user\s+flow/i,
      /design\s+thinking/i
    ];
    
    this.initialize();
  }

  /**
   * Initialize security system
   */
  async initialize() {
    try {
      // Create database indexes
      await this.createDatabaseIndexes();
      
      // Load custom patterns from database
      await this.loadCustomPatterns();
      
      // Start cleanup process for old blocked prompts
      this.startCleanupProcess();
      
      this.logger.info('Prompt Security System initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize Prompt Security System', error);
    }
  }

  /**
   * Create database indexes for security collections
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // Blocked prompts collection
    await db.collection('blocked_prompts').createIndexes([
      { key: { timestamp: 1 }, expireAfterSeconds: 30 * 24 * 60 * 60 }, // 30 days retention
      { key: { userId: 1, timestamp: -1 } },
      { key: { threatScore: -1 } },
      { key: { reviewed: 1 } }
    ]);
    
    // Security patterns collection
    await db.collection('security_patterns').createIndexes([
      { key: { pattern: 1 }, unique: true },
      { key: { enabled: 1 } },
      { key: { severity: 1 } }
    ]);
    
    // False positives collection
    await db.collection('false_positives').createIndexes([
      { key: { promptHash: 1 }, unique: true },
      { key: { reviewedAt: 1 } }
    ]);
  }

  /**
   * Analyze prompt for security threats
   */
  async analyzePrompt(prompt, userId, context = {}) {
    try {
      const analysis = {
        prompt,
        userId,
        context,
        timestamp: new Date(),
        threatScore: 0,
        threats: [],
        blocked: false,
        reason: null
      };

      // Check if prompt is whitelisted (false positive)
      const promptHash = this.createPromptHash(prompt);
      if (await this.isWhitelisted(promptHash)) {
        analysis.whitelisted = true;
        return analysis;
      }

      // Analyze for injection patterns
      await this.analyzeInjectionPatterns(analysis);
      
      // Analyze suspicious keywords
      await this.analyzeSuspiciousKeywords(analysis);
      
      // Analyze prompt structure
      await this.analyzePromptStructure(analysis);
      
      // Analyze encoding and obfuscation
      await this.analyzeObfuscation(analysis);
      
      // Check against custom patterns
      await this.analyzeCustomPatterns(analysis);
      
      // Calculate final threat score
      this.calculateFinalThreatScore(analysis);
      
      // Determine if prompt should be blocked
      this.determineBlocking(analysis);
      
      // Log and store if suspicious or blocked
      if (analysis.threatScore > 30 || analysis.blocked) {
        await this.logSecurityEvent(analysis);
      }
      
      return analysis;
      
    } catch (error) {
      this.logger.error('Failed to analyze prompt security', error);
      
      // On error, allow prompt but log the failure
      return {
        prompt,
        userId,
        timestamp: new Date(),
        threatScore: 0,
        threats: [],
        blocked: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze for injection patterns
   */
  async analyzeInjectionPatterns(analysis) {
    const { prompt } = analysis;
    
    for (const pattern of this.injectionPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        const threat = {
          type: 'injection_pattern',
          pattern: pattern.source,
          match: matches[0],
          severity: this.getPatternSeverity(pattern),
          score: this.getPatternScore(pattern)
        };
        
        analysis.threats.push(threat);
        analysis.threatScore += threat.score;
        
        this.logger.warn('Injection pattern detected', {
          userId: analysis.userId,
          pattern: pattern.source,
          match: matches[0]
        });
      }
    }
  }

  /**
   * Analyze suspicious keywords
   */
  async analyzeSuspiciousKeywords(analysis) {
    const { prompt } = analysis;
    const lowerPrompt = prompt.toLowerCase();
    
    const foundKeywords = this.suspiciousKeywords.filter(keyword => 
      lowerPrompt.includes(keyword.toLowerCase())
    );
    
    if (foundKeywords.length > 0) {
      const threat = {
        type: 'suspicious_keywords',
        keywords: foundKeywords,
        severity: foundKeywords.length > 2 ? 'high' : 'medium',
        score: foundKeywords.length * 15
      };
      
      analysis.threats.push(threat);
      analysis.threatScore += threat.score;
    }
  }

  /**
   * Analyze prompt structure for anomalies
   */
  async analyzePromptStructure(analysis) {
    const { prompt } = analysis;
    
    // Check for unusual character frequency
    const charAnalysis = this.analyzeCharacterFrequency(prompt);
    if (charAnalysis.suspicious) {
      analysis.threats.push({
        type: 'character_anomaly',
        details: charAnalysis,
        severity: 'medium',
        score: 25
      });
      analysis.threatScore += 25;
    }
    
    // Check for excessive repetition
    const repetitionScore = this.analyzeRepetition(prompt);
    if (repetitionScore > 0.3) { // 30% repetition threshold
      analysis.threats.push({
        type: 'excessive_repetition',
        repetitionScore,
        severity: 'low',
        score: 10
      });
      analysis.threatScore += 10;
    }
    
    // Check for unusual length
    if (prompt.length > 10000) { // Very long prompt
      analysis.threats.push({
        type: 'excessive_length',
        length: prompt.length,
        severity: 'medium',
        score: 20
      });
      analysis.threatScore += 20;
    }
  }

  /**
   * Analyze for encoding and obfuscation
   */
  async analyzeObfuscation(analysis) {
    const { prompt } = analysis;
    
    // Check for Base64 encoding
    const base64Matches = prompt.match(/[A-Za-z0-9+\/]{20,}={0,2}/g);
    if (base64Matches && base64Matches.length > 0) {
      // Try to decode and check if it contains suspicious content
      for (const match of base64Matches) {
        try {
          const decoded = Buffer.from(match, 'base64').toString('utf-8');
          
          // Check if decoded content has injection patterns
          for (const pattern of this.injectionPatterns) {
            if (pattern.test(decoded)) {
              analysis.threats.push({
                type: 'encoded_injection',
                encoding: 'base64',
                decodedContent: decoded.substring(0, 100),
                severity: 'high',
                score: 50
              });
              analysis.threatScore += 50;
              break;
            }
          }
        } catch (e) {
          // Invalid base64, but still suspicious
          analysis.threats.push({
            type: 'suspicious_encoding',
            encoding: 'base64',
            severity: 'low',
            score: 10
          });
          analysis.threatScore += 10;
        }
      }
    }
    
    // Check for URL encoding
    if (prompt.includes('%') && /%[0-9a-fA-F]{2}/.test(prompt)) {
      try {
        const decoded = decodeURIComponent(prompt);
        if (decoded !== prompt) {
          // Check decoded content
          for (const pattern of this.injectionPatterns) {
            if (pattern.test(decoded)) {
              analysis.threats.push({
                type: 'url_encoded_injection',
                decodedContent: decoded.substring(0, 100),
                severity: 'high',
                score: 45
              });
              analysis.threatScore += 45;
              break;
            }
          }
        }
      } catch (e) {
        analysis.threats.push({
          type: 'malformed_url_encoding',
          severity: 'medium',
          score: 15
        });
        analysis.threatScore += 15;
      }
    }
  }

  /**
   * Analyze against custom security patterns
   */
  async analyzeCustomPatterns(analysis) {
    try {
      const db = this.mongoClient.getDb();
      const customPatterns = await db.collection('security_patterns')
        .find({ enabled: true })
        .toArray();

      for (const patternDoc of customPatterns) {
        try {
          const pattern = new RegExp(patternDoc.pattern, patternDoc.flags || 'i');
          const matches = analysis.prompt.match(pattern);
          
          if (matches) {
            const threat = {
              type: 'custom_pattern',
              patternId: patternDoc._id,
              pattern: patternDoc.pattern,
              match: matches[0],
              severity: patternDoc.severity || 'medium',
              score: patternDoc.score || 30
            };
            
            analysis.threats.push(threat);
            analysis.threatScore += threat.score;
          }
        } catch (regexError) {
          this.logger.error('Invalid custom security pattern', regexError, {
            patternId: patternDoc._id
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to check custom patterns', error);
    }
  }

  /**
   * Calculate final threat score with contextual adjustments
   */
  calculateFinalThreatScore(analysis) {
    let { threatScore } = analysis;
    
    // Adjust score based on UX context
    const uxScore = this.calculateUXContextScore(analysis.prompt);
    if (uxScore > 0) {
      // Legitimate UX content reduces threat score
      threatScore = Math.max(0, threatScore - uxScore);
    }
    
    // Adjust based on user history
    // TODO: Implement user reputation scoring
    
    analysis.threatScore = Math.min(100, Math.max(0, threatScore));
  }

  /**
   * Calculate UX context score (higher = more legitimate)
   */
  calculateUXContextScore(prompt) {
    let score = 0;
    
    for (const pattern of this.whitelistPatterns) {
      if (pattern.test(prompt)) {
        score += 10;
      }
    }
    
    return Math.min(50, score); // Cap at 50 points
  }

  /**
   * Determine if prompt should be blocked
   */
  determineBlocking(analysis) {
    // Block high-threat prompts
    if (analysis.threatScore >= 70) {
      analysis.blocked = true;
      analysis.reason = 'High threat score detected';
      return;
    }
    
    // Block specific high-severity threats
    const highSeverityThreats = analysis.threats.filter(t => t.severity === 'high');
    if (highSeverityThreats.length > 0) {
      analysis.blocked = true;
      analysis.reason = 'High severity security threat detected';
      return;
    }
    
    // Block multiple medium severity threats
    const mediumSeverityThreats = analysis.threats.filter(t => t.severity === 'medium');
    if (mediumSeverityThreats.length >= 3) {
      analysis.blocked = true;
      analysis.reason = 'Multiple security threats detected';
      return;
    }
  }

  /**
   * Log security event
   */
  async logSecurityEvent(analysis) {
    try {
      const db = this.mongoClient.getDb();
      
      const event = {
        userId: analysis.userId,
        promptHash: this.createPromptHash(analysis.prompt),
        promptPreview: analysis.prompt.substring(0, 200), // Store preview only
        threatScore: analysis.threatScore,
        threats: analysis.threats,
        blocked: analysis.blocked,
        reason: analysis.reason,
        context: analysis.context,
        timestamp: analysis.timestamp,
        reviewed: false
      };
      
      await db.collection('blocked_prompts').insertOne(event);
      
      // Cache recent blocks for rate limiting
      if (analysis.blocked) {
        await this.cacheBlockedUser(analysis.userId);
      }
      
      this.logger.warn('Security event logged', {
        userId: analysis.userId,
        threatScore: analysis.threatScore,
        blocked: analysis.blocked,
        threatsCount: analysis.threats.length
      });
      
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }

  /**
   * Check if user has been blocked recently
   */
  async checkRecentBlocks(userId) {
    try {
      const key = `security:blocked:${userId}`;
      const blockedCount = await this.redisClient.get(key);
      
      if (blockedCount && parseInt(blockedCount) >= 3) {
        // User has been blocked 3+ times in the last hour
        return {
          blocked: true,
          reason: 'Too many security violations',
          count: parseInt(blockedCount)
        };
      }
      
      return { blocked: false };
      
    } catch (error) {
      this.logger.error('Failed to check recent blocks', error);
      return { blocked: false };
    }
  }

  /**
   * Cache blocked user for rate limiting
   */
  async cacheBlockedUser(userId) {
    try {
      const key = `security:blocked:${userId}`;
      
      await this.redisClient.multi()
        .incr(key)
        .expire(key, 3600) // 1 hour
        .exec();
        
    } catch (error) {
      this.logger.error('Failed to cache blocked user', error);
    }
  }

  /**
   * Check if prompt hash is whitelisted (false positive)
   */
  async isWhitelisted(promptHash) {
    try {
      const db = this.mongoClient.getDb();
      const falsePositive = await db.collection('false_positives')
        .findOne({ promptHash });
      
      return falsePositive !== null;
      
    } catch (error) {
      this.logger.error('Failed to check whitelist', error);
      return false;
    }
  }

  /**
   * Mark prompt as false positive (whitelist it)
   */
  async markAsFalsePositive(promptHash, reviewedBy, reason) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('false_positives').insertOne({
        promptHash,
        reviewedBy,
        reason,
        reviewedAt: new Date()
      });
      
      // Mark corresponding blocked prompt as reviewed
      await db.collection('blocked_prompts').updateMany(
        { promptHash },
        { 
          $set: { 
            reviewed: true, 
            reviewResult: 'false_positive',
            reviewedBy,
            reviewedAt: new Date()
          }
        }
      );
      
      this.logger.info('Prompt marked as false positive', {
        promptHash: promptHash.substring(0, 8),
        reviewedBy
      });
      
    } catch (error) {
      this.logger.error('Failed to mark as false positive', error);
      throw error;
    }
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeframe = '24h') {
    try {
      const db = this.mongoClient.getDb();
      
      let startTime;
      switch (timeframe) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
      
      const stats = await db.collection('blocked_prompts').aggregate([
        { $match: { timestamp: { $gte: startTime } } },
        {
          $group: {
            _id: null,
            totalEvents: { $sum: 1 },
            blockedPrompts: { $sum: { $cond: ['$blocked', 1, 0] } },
            avgThreatScore: { $avg: '$threatScore' },
            maxThreatScore: { $max: '$threatScore' },
            uniqueUsers: { $addToSet: '$userId' }
          }
        }
      ]).toArray();
      
      const result = stats[0] || {
        totalEvents: 0,
        blockedPrompts: 0,
        avgThreatScore: 0,
        maxThreatScore: 0,
        uniqueUsers: []
      };
      
      return {
        timeframe,
        totalEvents: result.totalEvents,
        blockedPrompts: result.blockedPrompts,
        suspiciousEvents: result.totalEvents - result.blockedPrompts,
        avgThreatScore: Math.round(result.avgThreatScore || 0),
        maxThreatScore: result.maxThreatScore || 0,
        affectedUsers: result.uniqueUsers.length,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get security stats', error);
      return null;
    }
  }

  /**
   * Get unreviewed security events for manual review
   */
  async getUnreviewedEvents(limit = 50) {
    try {
      const db = this.mongoClient.getDb();
      
      const events = await db.collection('blocked_prompts')
        .find({ reviewed: false, blocked: true })
        .sort({ threatScore: -1, timestamp: -1 })
        .limit(limit)
        .toArray();
      
      return events;
      
    } catch (error) {
      this.logger.error('Failed to get unreviewed events', error);
      return [];
    }
  }

  /**
   * Create hash for prompt identification
   */
  createPromptHash(prompt) {
    return crypto.createHash('sha256')
      .update(prompt.trim())
      .digest('hex');
  }

  /**
   * Get pattern severity
   */
  getPatternSeverity(pattern) {
    // High severity patterns
    const highSeverityPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions?/i,
      /\[SYSTEM\]/i,
      /```[\s\S]*exec\(/i
    ];
    
    if (highSeverityPatterns.some(p => p.source === pattern.source)) {
      return 'high';
    }
    
    return 'medium';
  }

  /**
   * Get pattern threat score
   */
  getPatternScore(pattern) {
    const severity = this.getPatternSeverity(pattern);
    
    switch (severity) {
      case 'high': return 40;
      case 'medium': return 25;
      case 'low': return 10;
      default: return 15;
    }
  }

  /**
   * Analyze character frequency for anomalies
   */
  analyzeCharacterFrequency(text) {
    const charCount = {};
    const totalChars = text.length;
    
    for (const char of text) {
      charCount[char] = (charCount[char] || 0) + 1;
    }
    
    // Check for excessive repetition of single characters
    const maxFrequency = Math.max(...Object.values(charCount));
    const maxFrequencyRatio = maxFrequency / totalChars;
    
    return {
      suspicious: maxFrequencyRatio > 0.2, // 20% of text is same character
      maxFrequencyRatio,
      dominantChar: Object.keys(charCount).find(k => charCount[k] === maxFrequency)
    };
  }

  /**
   * Analyze repetition in text
   */
  analyzeRepetition(text) {
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = {};
    
    for (const word of words) {
      if (word.length > 2) { // Ignore very short words
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }
    
    const totalWords = Object.values(wordCount).reduce((a, b) => a + b, 0);
    const duplicateWords = Object.values(wordCount).reduce((sum, count) => {
      return sum + Math.max(0, count - 1);
    }, 0);
    
    return totalWords > 0 ? duplicateWords / totalWords : 0;
  }

  /**
   * Load custom security patterns from database
   */
  async loadCustomPatterns() {
    try {
      const db = this.mongoClient.getDb();
      const patterns = await db.collection('security_patterns')
        .find({ enabled: true })
        .toArray();
      
      this.logger.info('Custom security patterns loaded', { count: patterns.length });
      
    } catch (error) {
      this.logger.error('Failed to load custom patterns', error);
    }
  }

  /**
   * Start cleanup process for old data
   */
  startCleanupProcess() {
    // Clean up old blocked prompts every 24 hours
    // (MongoDB TTL should handle this, but we can add custom logic here)
    setInterval(async () => {
      try {
        // Any custom cleanup logic can go here
        this.logger.debug('Security cleanup process executed');
      } catch (error) {
        this.logger.error('Security cleanup failed', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }
}

export default PromptSecuritySystem;