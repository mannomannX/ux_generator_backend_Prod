// ==========================================
// SERVICES/COGNITIVE-CORE/src/utils/secure-logger.js
// Secure logging utility that sanitizes sensitive data
// ==========================================

class SecureLogger {
  constructor(baseLogger) {
    this.baseLogger = baseLogger;
    
    // Patterns for sensitive data
    this.sensitivePatterns = [
      // API Keys
      { pattern: /api[_-]?key['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9\-_]{20,})['\"]?/gi, replacement: 'api_key=[REDACTED]' },
      { pattern: /sk-[a-zA-Z0-9]{48}/g, replacement: 'sk-[REDACTED]' },
      { pattern: /AIza[a-zA-Z0-9\-_]{35}/g, replacement: 'AIza[REDACTED]' },
      
      // Tokens
      { pattern: /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
      { pattern: /token['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9\-._~+/]{20,})['\"]?/gi, replacement: 'token=[REDACTED]' },
      
      // Passwords
      { pattern: /password['\"]?\s*[:=]\s*['\"]?([^'\"}\s]{4,})['\"]?/gi, replacement: 'password=[REDACTED]' },
      { pattern: /pwd['\"]?\s*[:=]\s*['\"]?([^'\"}\s]{4,})['\"]?/gi, replacement: 'pwd=[REDACTED]' },
      
      // Credit Cards
      { pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, replacement: '[CREDIT_CARD]' },
      
      // SSN
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
      
      // Email addresses (partial redaction)
      { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: (match, p1, p2) => `${p1.substring(0, 2)}***@${p2}` },
      
      // Phone numbers
      { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE]' },
      
      // IP addresses (partial redaction)
      { pattern: /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, replacement: '$1.$2.xxx.xxx' },
      
      // MongoDB connection strings
      { pattern: /mongodb(\+srv)?:\/\/[^@]+@[^\s]+/g, replacement: 'mongodb://[REDACTED]' },
      
      // AWS credentials
      { pattern: /AKIA[0-9A-Z]{16}/g, replacement: 'AKIA[REDACTED]' },
      { pattern: /aws[_-]?secret[_-]?access[_-]?key['\"]?\s*[:=]\s*['\"]?([a-zA-Z0-9/+=]{40})['\"]?/gi, replacement: 'aws_secret_access_key=[REDACTED]' },
      
      // Private keys
      { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },
      
      // JWT tokens
      { pattern: /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g, replacement: '[JWT_REDACTED]' },
    ];
    
    // Fields to always redact in objects
    this.sensitiveFields = [
      'password',
      'pwd',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'access_token',
      'refresh_token',
      'private_key',
      'privateKey',
      'credit_card',
      'creditCard',
      'ssn',
      'socialSecurityNumber',
      'bank_account',
      'bankAccount',
    ];
    
    // Environment check
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.enableDetailedLogs = process.env.ENABLE_DETAILED_LOGS === 'true';
  }
  
  /**
   * Sanitize a string by removing sensitive data
   */
  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    let sanitized = str;
    
    // Apply all sensitive patterns
    for (const { pattern, replacement } of this.sensitivePatterns) {
      if (typeof replacement === 'function') {
        sanitized = sanitized.replace(pattern, replacement);
      } else {
        sanitized = sanitized.replace(pattern, replacement);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize an object by redacting sensitive fields
   */
  sanitizeObject(obj, depth = 0) {
    if (depth > 10) return '[MAX_DEPTH_EXCEEDED]';
    
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if field should be redacted
      const lowerKey = key.toLowerCase();
      if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Format log message
   */
  formatMessage(level, message, ...args) {
    // Sanitize the message
    const sanitizedMessage = this.sanitizeString(message);
    
    // Sanitize additional arguments
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        return this.sanitizeObject(arg);
      }
      if (typeof arg === 'string') {
        return this.sanitizeString(arg);
      }
      return arg;
    });
    
    // Remove console.log statements in production
    if (process.env.NODE_ENV === 'production' && !this.enableDetailedLogs) {
      // Filter out verbose logs in production
      if (level === 'debug' || level === 'trace') {
        return null;
      }
    }
    
    return {
      message: sanitizedMessage,
      args: sanitizedArgs,
      timestamp: new Date().toISOString(),
      level,
    };
  }
  
  /**
   * Log methods
   */
  debug(message, ...args) {
    const formatted = this.formatMessage('debug', message, ...args);
    if (formatted && this.baseLogger.debug) {
      this.baseLogger.debug(formatted.message, ...formatted.args);
    }
  }
  
  info(message, ...args) {
    const formatted = this.formatMessage('info', message, ...args);
    if (formatted && this.baseLogger.info) {
      this.baseLogger.info(formatted.message, ...formatted.args);
    }
  }
  
  warn(message, ...args) {
    const formatted = this.formatMessage('warn', message, ...args);
    if (formatted && this.baseLogger.warn) {
      this.baseLogger.warn(formatted.message, ...formatted.args);
    }
  }
  
  error(message, error, ...args) {
    const formatted = this.formatMessage('error', message, ...args);
    if (formatted && this.baseLogger.error) {
      // Sanitize error stack trace
      if (error && error.stack) {
        error = {
          ...error,
          message: this.sanitizeString(error.message),
          stack: this.sanitizeString(error.stack),
        };
      }
      this.baseLogger.error(formatted.message, error, ...formatted.args);
    }
  }
  
  /**
   * Remove all console.log statements from code
   */
  static removeConsoleLogs(code) {
    // Remove console.log, console.error, console.warn, etc.
    const patterns = [
      /console\.(log|error|warn|info|debug|trace)\([^)]*\);?/g,
      /console\.(log|error|warn|info|debug|trace)\([^}]*\);?/g,
    ];
    
    let cleaned = code;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '// [Console log removed for production]');
    }
    
    return cleaned;
  }
  
  /**
   * Create middleware for Express to sanitize logs
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      // Override console methods in the request context
      const originalConsole = { ...console };
      
      ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
        console[method] = (...args) => {
          const sanitizedArgs = args.map(arg => {
            if (typeof arg === 'object') {
              return this.sanitizeObject(arg);
            }
            if (typeof arg === 'string') {
              return this.sanitizeString(arg);
            }
            return arg;
          });
          
          if (this.isDevelopment || this.enableDetailedLogs) {
            originalConsole[method](...sanitizedArgs);
          }
        };
      });
      
      // Restore after request
      res.on('finish', () => {
        Object.assign(console, originalConsole);
      });
      
      next();
    };
  }
}

export { SecureLogger };