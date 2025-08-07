// ==========================================
// SERVICES/COGNITIVE-CORE/src/security/prompt-injection-detector.js
// Advanced prompt injection detection and prevention
// ==========================================

class PromptInjectionDetector {
  constructor(logger) {
    this.logger = logger;
    
    // Known injection patterns
    this.injectionPatterns = [
      // Direct instruction override attempts
      /ignore\s+(all\s+)?previous\s+(instructions|prompts)/i,
      /disregard\s+(all\s+)?previous\s+(instructions|prompts)/i,
      /forget\s+(all\s+)?previous\s+(instructions|prompts)/i,
      /override\s+(system\s+)?prompt/i,
      /bypass\s+(all\s+)?restrictions/i,
      
      // Role manipulation attempts
      /you\s+are\s+now\s+[a-z]+/i,
      /act\s+as\s+[a-z]+/i,
      /pretend\s+to\s+be\s+[a-z]+/i,
      /roleplay\s+as\s+[a-z]+/i,
      /switch\s+to\s+[a-z]+\s+mode/i,
      
      // System prompt extraction attempts
      /what\s+(is|are)\s+your\s+(system\s+)?instructions/i,
      /show\s+me\s+your\s+(system\s+)?prompt/i,
      /reveal\s+your\s+(initial\s+)?instructions/i,
      /print\s+your\s+configuration/i,
      /display\s+your\s+rules/i,
      
      // Jailbreak attempts
      /do\s+anything\s+now/i,
      /dan\s+mode/i,
      /developer\s+mode/i,
      /enable\s+[a-z]+\s+mode/i,
      /unlock\s+[a-z]+\s+mode/i,
      
      // Code execution attempts
      /exec(ute)?\s*\(/i,
      /eval(uate)?\s*\(/i,
      /system\s*\(/i,
      /subprocess/i,
      /os\.(system|exec)/i,
      
      // SQL injection patterns
      /;\s*DROP\s+TABLE/i,
      /;\s*DELETE\s+FROM/i,
      /UNION\s+SELECT/i,
      /OR\s+1\s*=\s*1/i,
      /\'\s+OR\s+\'/i,
      
      // Command injection patterns
      /;\s*rm\s+-rf/i,
      /&&\s*rm\s+/i,
      /\|\s*rm\s+/i,
      /`[^`]*`/,
      /\$\([^)]*\)/,
      
      // Path traversal attempts
      /\.\.[\/\\]/,
      /\/etc\/passwd/i,
      /\/proc\/self/i,
      /c:\\windows\\system32/i,
      
      // Data extraction attempts
      /list\s+all\s+users/i,
      /show\s+all\s+data/i,
      /dump\s+database/i,
      /export\s+all/i,
      /access\s+admin/i,
    ];
    
    // Suspicious keywords that need context checking
    this.suspiciousKeywords = [
      'password',
      'token',
      'api_key',
      'secret',
      'credential',
      'private_key',
      'admin',
      'root',
      'sudo',
      'bypass',
      'override',
      'ignore',
      'hack',
      'exploit',
      'vulnerability',
      'injection',
      'malicious',
    ];
    
    // Safe contexts where keywords might be legitimate
    this.safeContexts = [
      /how\s+to\s+secure/i,
      /best\s+practices\s+for/i,
      /protect\s+against/i,
      /prevent\s+[a-z]+\s+attacks/i,
      /security\s+audit/i,
      /vulnerability\s+assessment/i,
    ];
    
    // Encoding detection patterns
    this.encodingPatterns = {
      base64: /^[A-Za-z0-9+/]{4,}={0,2}$/,
      hex: /^[0-9a-fA-F]+$/,
      unicode: /\\u[0-9a-fA-F]{4}/g,
      htmlEntity: /&#?\w+;/g,
      urlEncoded: /%[0-9a-fA-F]{2}/g,
    };
  }
  
  /**
   * Detect potential prompt injection attempts
   */
  detectInjection(prompt) {
    const detections = [];
    
    // Check for direct injection patterns
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(prompt)) {
        detections.push({
          type: 'injection_pattern',
          pattern: pattern.toString(),
          severity: 'high',
        });
      }
    }
    
    // Check for encoded content
    const encodingDetection = this.detectEncoding(prompt);
    if (encodingDetection.encoded) {
      detections.push({
        type: 'encoded_content',
        encoding: encodingDetection.type,
        severity: 'medium',
      });
    }
    
    // Check for suspicious keywords
    const keywordDetection = this.detectSuspiciousKeywords(prompt);
    if (keywordDetection.suspicious && !keywordDetection.safeContext) {
      detections.push({
        type: 'suspicious_keywords',
        keywords: keywordDetection.keywords,
        severity: 'low',
      });
    }
    
    // Check for unusual patterns
    const unusualPatterns = this.detectUnusualPatterns(prompt);
    if (unusualPatterns.length > 0) {
      detections.push({
        type: 'unusual_patterns',
        patterns: unusualPatterns,
        severity: 'medium',
      });
    }
    
    // Calculate risk score
    const riskScore = this.calculateRiskScore(detections);
    
    return {
      safe: detections.length === 0 || riskScore < 0.3,
      detections,
      riskScore,
      blocked: riskScore >= 0.7,
    };
  }
  
  /**
   * Detect encoded content
   */
  detectEncoding(prompt) {
    // Check for base64
    if (this.encodingPatterns.base64.test(prompt) && prompt.length > 20) {
      try {
        const decoded = Buffer.from(prompt, 'base64').toString('utf-8');
        if (decoded.length > 0 && /^[\x00-\x7F]*$/.test(decoded)) {
          return { encoded: true, type: 'base64', decoded };
        }
      } catch (e) {
        // Not valid base64
      }
    }
    
    // Check for hex encoding
    if (this.encodingPatterns.hex.test(prompt) && prompt.length % 2 === 0 && prompt.length > 10) {
      try {
        const decoded = Buffer.from(prompt, 'hex').toString('utf-8');
        if (decoded.length > 0 && /^[\x00-\x7F]*$/.test(decoded)) {
          return { encoded: true, type: 'hex', decoded };
        }
      } catch (e) {
        // Not valid hex
      }
    }
    
    // Check for unicode escapes
    const unicodeMatches = prompt.match(this.encodingPatterns.unicode);
    if (unicodeMatches && unicodeMatches.length > 3) {
      return { encoded: true, type: 'unicode', count: unicodeMatches.length };
    }
    
    // Check for HTML entities
    const htmlMatches = prompt.match(this.encodingPatterns.htmlEntity);
    if (htmlMatches && htmlMatches.length > 5) {
      return { encoded: true, type: 'html_entities', count: htmlMatches.length };
    }
    
    // Check for URL encoding
    const urlMatches = prompt.match(this.encodingPatterns.urlEncoded);
    if (urlMatches && urlMatches.length > 10) {
      return { encoded: true, type: 'url_encoded', count: urlMatches.length };
    }
    
    return { encoded: false };
  }
  
  /**
   * Detect suspicious keywords
   */
  detectSuspiciousKeywords(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const foundKeywords = [];
    
    for (const keyword of this.suspiciousKeywords) {
      if (lowerPrompt.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    }
    
    // Check if in safe context
    let safeContext = false;
    for (const pattern of this.safeContexts) {
      if (pattern.test(prompt)) {
        safeContext = true;
        break;
      }
    }
    
    return {
      suspicious: foundKeywords.length > 0,
      keywords: foundKeywords,
      safeContext,
    };
  }
  
  /**
   * Detect unusual patterns
   */
  detectUnusualPatterns(prompt) {
    const patterns = [];
    
    // Check for excessive special characters
    const specialCharCount = (prompt.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
    if (specialCharCount > prompt.length * 0.3) {
      patterns.push('excessive_special_chars');
    }
    
    // Check for repeated characters
    if (/(.)\1{10,}/.test(prompt)) {
      patterns.push('repeated_characters');
    }
    
    // Check for mixed case patterns (like aLtErNaTiNg)
    if (/([a-z][A-Z]){5,}|([A-Z][a-z]){5,}/.test(prompt)) {
      patterns.push('mixed_case_pattern');
    }
    
    // Check for invisible characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(prompt)) {
      patterns.push('invisible_characters');
    }
    
    // Check for excessive whitespace
    if (/\s{10,}/.test(prompt)) {
      patterns.push('excessive_whitespace');
    }
    
    // Check for suspicious delimiters
    if (/\[\[.*?\]\]|\{\{.*?\}\}|<<.*?>>/.test(prompt)) {
      patterns.push('suspicious_delimiters');
    }
    
    return patterns;
  }
  
  /**
   * Calculate risk score
   */
  calculateRiskScore(detections) {
    if (detections.length === 0) return 0;
    
    let score = 0;
    const weights = {
      high: 0.4,
      medium: 0.2,
      low: 0.1,
    };
    
    for (const detection of detections) {
      score += weights[detection.severity] || 0.1;
    }
    
    // Cap at 1.0
    return Math.min(score, 1.0);
  }
  
  /**
   * Sanitize prompt to remove potentially dangerous content
   */
  sanitizePrompt(prompt) {
    let sanitized = prompt;
    
    // Remove detected injection patterns
    for (const pattern of this.injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    
    // Decode and sanitize encoded content
    const encodingDetection = this.detectEncoding(sanitized);
    if (encodingDetection.encoded && encodingDetection.decoded) {
      // Replace encoded content with placeholder
      sanitized = '[ENCODED_CONTENT_REMOVED]';
    }
    
    // Remove invisible characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    // Limit length
    if (sanitized.length > 4000) {
      sanitized = sanitized.substring(0, 4000) + '...';
    }
    
    return sanitized;
  }
  
  /**
   * Log detection for analysis
   */
  logDetection(userId, projectId, prompt, detection) {
    this.logger.warn('Prompt injection attempt detected', {
      userId,
      projectId,
      detections: detection.detections,
      riskScore: detection.riskScore,
      blocked: detection.blocked,
      promptLength: prompt.length,
      timestamp: new Date().toISOString(),
    });
  }
}

export { PromptInjectionDetector };