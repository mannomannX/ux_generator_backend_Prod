// ==========================================
// COGNITIVE-CORE - AI Prompt Security & Validation
// ==========================================

/**
 * Comprehensive prompt security and injection prevention
 */
export class PromptSecurity {
  constructor(logger, config = {}) {
    this.logger = logger;
    this.config = {
      maxPromptLength: config.maxPromptLength || 4000,
      maxTokens: config.maxTokens || 3000,
      enablePromptFiltering: config.enablePromptFiltering !== false,
      logSuspiciousPrompts: config.logSuspiciousPrompts !== false,
      blockSuspiciousPrompts: config.blockSuspiciousPrompts === true,
      ...config
    };

    this.setupSecurityPatterns();
    this.loadSecurityRules();
    this.suspiciousPromptCount = new Map();
  }

  /**
   * Setup security patterns for prompt injection detection
   */
  setupSecurityPatterns() {
    // Common prompt injection patterns
    this.injectionPatterns = [
      // Direct instruction overrides
      /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|commands?|prompts?)/i,
      /forget\s+(everything|all|what)\s+(you\s+)?(were\s+)?(told|instructed)/i,
      /disregard\s+(the\s+)?(above|previous|prior|system)\s+(instructions?|prompts?)/i,
      
      // Role hijacking attempts
      /you\s+are\s+(now\s+)?(a|an)\s+(?!UX|design|architect|validator)/i,
      /act\s+as\s+(if\s+you\s+are\s+)?(a|an)\s+(?!UX|design|architect)/i,
      /pretend\s+(to\s+be|you\s+are)\s+(a|an)/i,
      /roleplay\s+as/i,
      
      // System prompt extraction attempts
      /what\s+(are\s+)?(your\s+)?(initial\s+)?(instructions?|prompts?|rules?)/i,
      /show\s+me\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
      /reveal\s+(your\s+)?(hidden\s+)?(instructions?|prompts?)/i,
      /print\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
      
      // Mode switching attempts
      /switch\s+to\s+(developer|debug|admin|root)\s+mode/i,
      /enable\s+(developer|debug|admin|root)\s+mode/i,
      /activate\s+(developer|debug|admin)\s+mode/i,
      
      // Direct system access attempts
      /run\s+(command|script|code)/i,
      /execute\s+(command|script|code)/i,
      /system\s*\(/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
      
      // Jailbreak attempts
      /jailbreak/i,
      /DAN\s+(mode|prompt)/i,
      /do\s+anything\s+now/i,
      /maximum\s+mode/i,
      /dev\s+mode/i,
      
      // Information extraction
      /leak\s+(information|data|secrets)/i,
      /dump\s+(data|information|memory)/i,
      /extract\s+(data|information|secrets)/i,
      
      // Prompt template manipulation
      /{{\s*[^}]+\s*}}/,
      /\[\[.*?\]\]/,
      /<\s*prompt\s*>/i,
      /<\s*system\s*>/i,
      
      // Unicode/encoding attacks
      /\\u[0-9a-fA-F]{4}/,
      /\\x[0-9a-fA-F]{2}/,
      /&#\d+;/,
      
      // Excessive special characters (potential obfuscation)
      /[!@#$%^&*()_+=\[\]{}|;:'"<>?/\\]{10,}/,
      
      // Repetitive patterns (potential DOS)
      /(.{1,10})\1{20,}/,
      
      // Code injection attempts
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /on(load|error|click|focus)/i
    ];

    // Suspicious keywords that warrant extra scrutiny
    this.suspiciousKeywords = [
      'bypass', 'override', 'hack', 'exploit', 'vulnerability',
      'injection', 'backdoor', 'privilege', 'escalate', 'sudo',
      'administrator', 'superuser', 'debug', 'trace', 'leak',
      'extract', 'dump', 'reveal', 'show', 'print', 'output',
      'system', 'kernel', 'root', 'admin', 'developer'
    ];

    // Context-specific UX terms that should be allowed
    this.allowedUXTerms = [
      'user experience', 'interface', 'wireframe', 'prototype',
      'mockup', 'dashboard', 'navigation', 'layout', 'component',
      'screen', 'flow', 'journey', 'persona', 'accessibility',
      'responsive', 'mobile', 'desktop', 'tablet'
    ];
  }

  /**
   * Load additional security rules
   */
  loadSecurityRules() {
    // Custom security rules can be loaded from configuration
    this.securityRules = [
      {
        name: 'excessive_length',
        check: (prompt) => prompt.length > this.config.maxPromptLength,
        severity: 'high',
        message: 'Prompt exceeds maximum length'
      },
      {
        name: 'repeated_characters',
        check: (prompt) => /(.)\1{50,}/.test(prompt),
        severity: 'medium',
        message: 'Prompt contains excessive repeated characters'
      },
      {
        name: 'multiple_languages',
        check: (prompt) => this.detectMultipleLanguages(prompt),
        severity: 'low',
        message: 'Prompt contains multiple languages (potential obfuscation)'
      },
      {
        name: 'base64_content',
        check: (prompt) => this.detectBase64Content(prompt),
        severity: 'high',
        message: 'Prompt contains encoded content'
      },
      {
        name: 'sql_injection',
        check: (prompt) => this.detectSQLPatterns(prompt),
        severity: 'high',
        message: 'Prompt contains SQL injection patterns'
      }
    ];
  }

  /**
   * Main prompt validation function
   */
  async validatePrompt(prompt, context = {}) {
    try {
      const validation = {
        isValid: true,
        warnings: [],
        errors: [],
        suspiciousScore: 0,
        sanitizedPrompt: prompt,
        metadata: {
          originalLength: prompt.length,
          processedAt: new Date().toISOString(),
          userId: context.userId,
          projectId: context.projectId
        }
      };

      // Basic validation
      if (!prompt || typeof prompt !== 'string') {
        validation.isValid = false;
        validation.errors.push('Invalid prompt format');
        return validation;
      }

      // Length validation
      if (prompt.length > this.config.maxPromptLength) {
        validation.isValid = false;
        validation.errors.push(`Prompt too long (${prompt.length}/${this.config.maxPromptLength} characters)`);
      }

      // Empty or whitespace-only prompt
      if (prompt.trim().length === 0) {
        validation.isValid = false;
        validation.errors.push('Empty prompt not allowed');
        return validation;
      }

      if (!this.config.enablePromptFiltering) {
        return validation;
      }

      // Injection pattern detection
      const injectionResults = this.detectInjectionPatterns(prompt);
      validation.suspiciousScore += injectionResults.score;
      validation.warnings.push(...injectionResults.warnings);

      // Security rules validation
      const rulesResults = this.validateSecurityRules(prompt);
      validation.suspiciousScore += rulesResults.score;
      validation.warnings.push(...rulesResults.warnings);
      validation.errors.push(...rulesResults.errors);

      // Keyword analysis
      const keywordResults = this.analyzeKeywords(prompt);
      validation.suspiciousScore += keywordResults.score;
      validation.warnings.push(...keywordResults.warnings);

      // Sanitize prompt
      validation.sanitizedPrompt = this.sanitizePrompt(prompt);

      // Final decision based on suspicious score
      const threshold = this.config.blockSuspiciousPrompts ? 50 : 100;
      if (validation.suspiciousScore >= threshold) {
        validation.isValid = false;
        validation.errors.push('Prompt flagged as potentially malicious');
      }

      // Log suspicious prompts
      if (validation.suspiciousScore > 30 && this.config.logSuspiciousPrompts) {
        await this.logSuspiciousPrompt(prompt, validation, context);
      }

      // Update user suspicious prompt count
      if (context.userId && validation.suspiciousScore > 50) {
        this.updateSuspiciousPromptCount(context.userId);
      }

      return validation;
    } catch (error) {
      this.logger.error('Prompt validation failed', {
        error: error.message,
        promptLength: prompt?.length,
        context
      });
      
      return {
        isValid: false,
        errors: ['Prompt validation system error'],
        warnings: [],
        suspiciousScore: 0,
        sanitizedPrompt: '',
        metadata: { error: error.message }
      };
    }
  }

  /**
   * Detect prompt injection patterns
   */
  detectInjectionPatterns(prompt) {
    const results = {
      score: 0,
      warnings: [],
      detectedPatterns: []
    };

    for (const pattern of this.injectionPatterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        results.score += 20;
        results.detectedPatterns.push({
          pattern: pattern.source,
          match: matches[0],
          index: matches.index
        });
        results.warnings.push(`Potential injection pattern detected: ${matches[0].substring(0, 50)}`);
      }
    }

    return results;
  }

  /**
   * Validate against security rules
   */
  validateSecurityRules(prompt) {
    const results = {
      score: 0,
      warnings: [],
      errors: []
    };

    for (const rule of this.securityRules) {
      try {
        if (rule.check(prompt)) {
          const scoreIncrease = rule.severity === 'high' ? 30 : rule.severity === 'medium' ? 15 : 5;
          results.score += scoreIncrease;
          
          if (rule.severity === 'high') {
            results.errors.push(rule.message);
          } else {
            results.warnings.push(rule.message);
          }
        }
      } catch (error) {
        this.logger.error('Security rule validation failed', {
          rule: rule.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Analyze suspicious keywords
   */
  analyzeKeywords(prompt) {
    const results = {
      score: 0,
      warnings: [],
      suspiciousKeywords: []
    };

    const lowerPrompt = prompt.toLowerCase();
    
    // Check for suspicious keywords
    for (const keyword of this.suspiciousKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = prompt.match(regex);
      
      if (matches) {
        // Check if it's in a UX context
        const isUXContext = this.isInUXContext(prompt, keyword);
        
        if (!isUXContext) {
          results.score += matches.length * 10;
          results.suspiciousKeywords.push(...matches);
          results.warnings.push(`Suspicious keyword detected: ${keyword}`);
        }
      }
    }

    // Excessive use of technical terms outside UX context
    const techTermCount = (lowerPrompt.match(/\b(system|code|script|function|method|class|variable|database|query|command|execute|run|process)\b/g) || []).length;
    if (techTermCount > 5 && !this.isUXRelated(prompt)) {
      results.score += techTermCount * 2;
      results.warnings.push('High concentration of technical terms detected');
    }

    return results;
  }

  /**
   * Check if keyword usage is in UX context
   */
  isInUXContext(prompt, keyword) {
    const contextWindow = 100;
    const keywordIndex = prompt.toLowerCase().indexOf(keyword.toLowerCase());
    
    if (keywordIndex === -1) return false;
    
    const start = Math.max(0, keywordIndex - contextWindow);
    const end = Math.min(prompt.length, keywordIndex + keyword.length + contextWindow);
    const context = prompt.substring(start, end).toLowerCase();
    
    // Check if UX terms are nearby
    return this.allowedUXTerms.some(term => 
      context.includes(term.toLowerCase())
    );
  }

  /**
   * Check if prompt is UX-related
   */
  isUXRelated(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const uxTermCount = this.allowedUXTerms.filter(term => 
      lowerPrompt.includes(term.toLowerCase())
    ).length;
    
    return uxTermCount >= 2;
  }

  /**
   * Sanitize prompt while preserving UX functionality
   * This is a balanced approach that removes genuinely dangerous patterns
   * while preserving legitimate UX design terminology and symbols
   */
  sanitizePrompt(prompt, options = {}) {
    let sanitized = prompt;
    
    // Allow bypassing sanitization for trusted users or specific contexts
    const {
      minimal = false,
      preserveHTML = true,
      preserveFormatting = true,
      trustedUser = false
    } = options;
    
    // For trusted users, apply minimal sanitization
    if (trustedUser) {
      return this.minimalSanitizePrompt(prompt);
    }
    
    // Remove excessive whitespace (but preserve single line breaks)
    sanitized = sanitized.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
    sanitized = sanitized.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple newlines to double newline
    sanitized = sanitized.trim();
    
    // Remove only the most dangerous script-like content (but allow HTML for mockups)
    sanitized = sanitized.replace(/javascript\s*:/gi, ''); // Remove javascript: protocols
    sanitized = sanitized.replace(/data\s*:\s*text\s*\/\s*html/gi, ''); // Remove data:text/html
    sanitized = sanitized.replace(/vbscript\s*:/gi, ''); // Remove vbscript:
    sanitized = sanitized.replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick=
    
    // Remove dangerous HTML script tags but allow other tags for UX mockups
    sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed[^>]*\/?>/gi, '');
    
    // Remove SQL injection patterns only if they're clearly malicious
    // (preserve legitimate usage like "SELECT component from library")
    sanitized = sanitized.replace(/(\b(union\s+select|drop\s+table|delete\s+from|insert\s+into.*values)\b\s*[({;])/gi, '');
    
    // Remove command injection patterns
    sanitized = sanitized.replace(/(\||\|\||&&|;)\s*(rm|del|format|shutdown|reboot|kill)\s/gi, '');
    
    // Remove null bytes and control characters (but preserve common unicode)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Preserve important UX-related symbols and characters:
    // - Unicode characters for design symbols (→, ←, ↑, ↓, etc.)
    // - HTML tags for mockups (<div>, <button>, etc.)
    // - CSS-like syntax for styling descriptions
    // - Common design notation (%, px, em, rem, etc.)
    // - Brackets and symbols for wireframes
    
    return sanitized;
  }

  /**
   * Minimal sanitization for trusted users
   * Only removes the most critical security threats
   */
  minimalSanitizePrompt(prompt) {
    let sanitized = prompt;
    
    // Remove only the most dangerous patterns
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    sanitized = sanitized.replace(/vbscript\s*:/gi, '');
    sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Remove null bytes and critical control characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return sanitized;
  }

  /**
   * Detect multiple languages (potential obfuscation)
   */
  detectMultipleLanguages(prompt) {
    const scripts = {
      latin: /[a-zA-Z]/,
      cyrillic: /[\u0400-\u04FF]/,
      arabic: /[\u0600-\u06FF]/,
      chinese: /[\u4E00-\u9FFF]/,
      japanese: /[\u3040-\u309F\u30A0-\u30FF]/,
      korean: /[\uAC00-\uD7AF]/,
      hebrew: /[\u0590-\u05FF]/,
      thai: /[\u0E00-\u0E7F]/
    };

    let detectedScripts = 0;
    for (const [script, regex] of Object.entries(scripts)) {
      if (regex.test(prompt)) {
        detectedScripts++;
      }
    }

    return detectedScripts > 2;
  }

  /**
   * Detect Base64 encoded content
   */
  detectBase64Content(prompt) {
    // Look for Base64 patterns
    const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    const matches = prompt.match(base64Pattern);
    
    if (!matches) return false;

    // Check if any match looks like encoded content
    return matches.some(match => {
      try {
        const decoded = Buffer.from(match, 'base64').toString('utf8');
        // Look for suspicious patterns in decoded content
        return /(<script|javascript:|data:text\/html|eval\(|exec\()/i.test(decoded);
      } catch {
        return false;
      }
    });
  }

  /**
   * Detect SQL injection patterns
   */
  detectSQLPatterns(prompt) {
    const sqlPatterns = [
      /\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*[;({]/i,
      /'.*or.*'.*=/i,
      /1\s*=\s*1/i,
      /\*.*\*/,
      /--.*$/m,
      /\/\*.*\*\//
    ];

    return sqlPatterns.some(pattern => pattern.test(prompt));
  }

  /**
   * Log suspicious prompts for analysis
   */
  async logSuspiciousPrompt(prompt, validation, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: context.userId,
      projectId: context.projectId,
      promptHash: this.hashPrompt(prompt),
      promptLength: prompt.length,
      suspiciousScore: validation.suspiciousScore,
      warnings: validation.warnings,
      errors: validation.errors,
      detectedPatterns: validation.detectedPatterns || [],
      userAgent: context.userAgent,
      ip: context.ip,
      severity: validation.suspiciousScore > 70 ? 'high' : validation.suspiciousScore > 40 ? 'medium' : 'low'
    };

    this.logger.security('Suspicious prompt detected', logEntry);

    // Store for analysis (could be sent to security monitoring system)
    // In production, you might want to send this to a security information and event management (SIEM) system
  }

  /**
   * Update suspicious prompt count for user
   */
  updateSuspiciousPromptCount(userId) {
    const count = this.suspiciousPromptCount.get(userId) || 0;
    this.suspiciousPromptCount.set(userId, count + 1);

    // Alert if user has too many suspicious prompts
    if (count + 1 >= 5) {
      this.logger.security('User flagged for multiple suspicious prompts', {
        userId,
        count: count + 1,
        timestamp: new Date().toISOString()
      });
    }

    // Clean up old entries periodically
    if (this.suspiciousPromptCount.size > 10000) {
      const entries = Array.from(this.suspiciousPromptCount.entries());
      entries.slice(0, entries.length / 2).forEach(([key]) => {
        this.suspiciousPromptCount.delete(key);
      });
    }
  }

  /**
   * Create hash of prompt for logging (preserves privacy)
   */
  hashPrompt(prompt) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    return {
      totalPatterns: this.injectionPatterns.length,
      totalRules: this.securityRules.length,
      suspiciousKeywords: this.suspiciousKeywords.length,
      allowedUXTerms: this.allowedUXTerms.length,
      flaggedUsers: this.suspiciousPromptCount.size,
      config: {
        maxPromptLength: this.config.maxPromptLength,
        enablePromptFiltering: this.config.enablePromptFiltering,
        blockSuspiciousPrompts: this.config.blockSuspiciousPrompts
      }
    };
  }

  /**
   * Update security patterns from external source
   */
  updateSecurityPatterns(newPatterns) {
    if (Array.isArray(newPatterns)) {
      this.injectionPatterns.push(...newPatterns.map(p => new RegExp(p.pattern, p.flags || 'i')));
      this.logger.info('Updated security patterns', { count: newPatterns.length });
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.suspiciousPromptCount.clear();
    this.logger.info('Prompt security cleanup completed');
  }
}