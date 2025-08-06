/**
 * Prompt security utilities for AI services
 * Detects and prevents prompt injection attacks and other security threats
 */
class PromptSecurity {
  constructor(config = {}) {
    this.config = {
      maxPromptLength: config.maxPromptLength || 50000,
      maxTokensPerRequest: config.maxTokensPerRequest || 8192,
      enableInjectionDetection: config.enableInjectionDetection !== false,
      enableSanitization: config.enableSanitization !== false,
      suspiciousPatterns: config.suspiciousPatterns || this.getDefaultSuspiciousPatterns(),
      blockedTerms: config.blockedTerms || this.getDefaultBlockedTerms(),
      sensitiveDataPatterns: config.sensitiveDataPatterns || this.getDefaultSensitiveDataPatterns()
    };

    // Statistics tracking
    this.stats = {
      totalChecks: 0,
      injectionAttemptsDetected: 0,
      sensitiveDataDetected: 0,
      oversizedPrompts: 0,
      blockedPrompts: 0
    };
  }

  /**
   * Check prompt for security issues
   */
  async checkPromptSecurity(prompt, context = {}) {
    this.stats.totalChecks++;
    
    const checks = {
      lengthCheck: this.checkPromptLength(prompt),
      injectionCheck: this.detectPromptInjection(prompt),
      sensitiveDataCheck: this.detectSensitiveData(prompt),
      blockedTermsCheck: this.checkBlockedTerms(prompt),
      suspiciousPatternCheck: this.checkSuspiciousPatterns(prompt)
    };

    const issues = [];
    let securityScore = 1.0; // Start with perfect score
    
    // Evaluate checks
    if (!checks.lengthCheck.valid) {
      issues.push('Prompt exceeds maximum length');
      securityScore -= 0.3;
      this.stats.oversizedPrompts++;
    }
    
    if (checks.injectionCheck.detected) {
      issues.push(`Potential injection detected: ${checks.injectionCheck.type}`);
      securityScore -= 0.5;
      this.stats.injectionAttemptsDetected++;
    }
    
    if (checks.sensitiveDataCheck.detected) {
      issues.push('Sensitive data detected in prompt');
      securityScore -= 0.4;
      this.stats.sensitiveDataDetected++;
    }
    
    if (checks.blockedTermsCheck.detected) {
      issues.push(`Blocked terms found: ${checks.blockedTermsCheck.terms.join(', ')}`);
      securityScore -= 0.6;
      this.stats.blockedPrompts++;
    }
    
    if (checks.suspiciousPatternCheck.detected) {
      issues.push(`Suspicious patterns detected: ${checks.suspiciousPatternCheck.patterns.join(', ')}`);
      securityScore -= 0.3;
    }
    
    // Ensure score doesn't go below 0
    securityScore = Math.max(0, securityScore);
    
    const isSecure = securityScore >= 0.5; // Threshold for security
    
    return {
      isSecure,
      securityScore,
      issues,
      checks,
      recommendation: this.getSecurityRecommendation(securityScore, issues),
      sanitizedPrompt: this.config.enableSanitization && !isSecure ? 
        this.sanitizePrompt(prompt) : prompt
    };
  }

  /**
   * Check prompt length
   */
  checkPromptLength(prompt) {
    const length = prompt.length;
    const valid = length <= this.config.maxPromptLength;
    
    return {
      valid,
      length,
      maxLength: this.config.maxPromptLength,
      exceedBy: valid ? 0 : length - this.config.maxPromptLength
    };
  }

  /**
   * Detect potential prompt injection attempts
   */
  detectPromptInjection(prompt) {
    const injectionPatterns = {
      systemPromptOverride: [
        /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
        /forget\s+(everything|all|previous)/gi,
        /new\s+instructions?:/gi,
        /system:\s*["']?/gi,
        /\[INST\]/gi,
        /###\s*System/gi
      ],
      rolePlayInjection: [
        /you\s+are\s+now\s+/gi,
        /act\s+as\s+/gi,
        /pretend\s+to\s+be\s+/gi,
        /from\s+now\s+on\s+you/gi
      ],
      dataExfiltration: [
        /repeat\s+(everything|all)\s+(above|previous)/gi,
        /show\s+me\s+your\s+(instructions?|prompts?|rules?)/gi,
        /what\s+are\s+your\s+(instructions?|rules?)/gi,
        /reveal\s+your\s+/gi
      ],
      jailbreak: [
        /DAN\s+mode/gi,
        /developer\s+mode/gi,
        /bypass\s+(safety|filter|restrictions?)/gi,
        /unlimited\s+mode/gi
      ]
    };

    for (const [type, patterns] of Object.entries(injectionPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(prompt)) {
          return {
            detected: true,
            type,
            pattern: pattern.source
          };
        }
      }
    }

    return { detected: false };
  }

  /**
   * Detect sensitive data in prompts
   */
  detectSensitiveData(prompt) {
    const patterns = this.config.sensitiveDataPatterns;
    const detected = [];
    
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(prompt)) {
        detected.push(type);
      }
    }
    
    return {
      detected: detected.length > 0,
      types: detected
    };
  }

  /**
   * Check for blocked terms
   */
  checkBlockedTerms(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const foundTerms = [];
    
    for (const term of this.config.blockedTerms) {
      if (lowerPrompt.includes(term.toLowerCase())) {
        foundTerms.push(term);
      }
    }
    
    return {
      detected: foundTerms.length > 0,
      terms: foundTerms
    };
  }

  /**
   * Check for suspicious patterns
   */
  checkSuspiciousPatterns(prompt) {
    const detected = [];
    
    for (const [name, pattern] of Object.entries(this.config.suspiciousPatterns)) {
      if (pattern.test(prompt)) {
        detected.push(name);
      }
    }
    
    return {
      detected: detected.length > 0,
      patterns: detected
    };
  }

  /**
   * Sanitize prompt by removing/replacing problematic content
   */
  sanitizePrompt(prompt) {
    let sanitized = prompt;
    
    // Remove potential injection attempts
    const removalPatterns = [
      /ignore\s+(previous|all|above)\s+(instructions?|prompts?)/gi,
      /\[INST\].*?\[\/INST\]/gi,
      /###\s*System.*?###/gi,
      /system:\s*["']?.*?["']?[\n\r]/gi
    ];
    
    for (const pattern of removalPatterns) {
      sanitized = sanitized.replace(pattern, '[REMOVED]');
    }
    
    // Mask sensitive data
    sanitized = this.maskSensitiveData(sanitized);
    
    // Truncate if too long
    if (sanitized.length > this.config.maxPromptLength) {
      sanitized = sanitized.substring(0, this.config.maxPromptLength) + '... [TRUNCATED]';
    }
    
    return sanitized;
  }

  /**
   * Mask sensitive data in text
   */
  maskSensitiveData(text) {
    const patterns = this.getDefaultSensitiveDataPatterns();
    let masked = text;
    
    // Email addresses
    masked = masked.replace(patterns.email, '[EMAIL]');
    
    // Phone numbers
    masked = masked.replace(patterns.phone, '[PHONE]');
    
    // Credit card numbers
    masked = masked.replace(patterns.creditCard, '[CREDIT_CARD]');
    
    // SSN
    masked = masked.replace(patterns.ssn, '[SSN]');
    
    // API keys (common patterns)
    masked = masked.replace(patterns.apiKey, '[API_KEY]');
    
    return masked;
  }

  /**
   * Get security recommendation based on score
   */
  getSecurityRecommendation(score, issues) {
    if (score >= 0.8) {
      return 'Prompt appears safe to process';
    } else if (score >= 0.5) {
      return 'Prompt has minor security concerns but can be processed with caution';
    } else if (score >= 0.3) {
      return 'Prompt has significant security concerns - consider sanitization or rejection';
    } else {
      return 'Prompt poses high security risk - should be rejected or heavily sanitized';
    }
  }

  /**
   * Get default suspicious patterns
   */
  getDefaultSuspiciousPatterns() {
    return {
      commandExecution: /(\$\(|`|&&|\|\||;|\n).*?(rm|del|format|drop|delete|truncate)/gi,
      sqlInjection: /(\b(union|select|insert|update|delete|drop)\b.*\b(from|into|where|table)\b)/gi,
      scriptInjection: /<script[^>]*>|javascript:|on\w+\s*=/gi,
      pathTraversal: /\.\.[\/\\]|\.\.[\/\\]\.\.[\/\\]/g,
      urlSchemes: /(file|data|javascript|vbscript):/gi
    };
  }

  /**
   * Get default blocked terms
   */
  getDefaultBlockedTerms() {
    return [
      // These should be customized based on your application's needs
      'hack',
      'exploit',
      'vulnerability',
      'bypass security',
      'disable safety'
    ];
  }

  /**
   * Get default sensitive data patterns
   */
  getDefaultSensitiveDataPatterns() {
    return {
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      phone: /(\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      apiKey: /[a-zA-Z0-9]{32,}/g,
      ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      jwt: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g
    };
  }

  /**
   * Get security statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      injectionRate: this.stats.totalChecks > 0 ? 
        this.stats.injectionAttemptsDetected / this.stats.totalChecks : 0,
      blockRate: this.stats.totalChecks > 0 ?
        this.stats.blockedPrompts / this.stats.totalChecks : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalChecks: 0,
      injectionAttemptsDetected: 0,
      sensitiveDataDetected: 0,
      oversizedPrompts: 0,
      blockedPrompts: 0
    };
  }
}

export { PromptSecurity };