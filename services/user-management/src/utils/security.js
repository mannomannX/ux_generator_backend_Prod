import crypto from 'crypto';
import bcrypt from 'bcrypt';

export class SecurityUtils {
  /**
   * Generate secure random token
   */
  static generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate password reset token
   */
  static generateResetToken() {
    return {
      token: this.generateSecureToken(32),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };
  }

  /**
   * Generate email verification token
   */
  static generateVerificationToken() {
    return {
      token: this.generateSecureToken(32),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate API key
   */
  static generateApiKey(prefix = 'uxf') {
    const random = this.generateSecureToken(24);
    return `${prefix}_${random}`;
  }

  /**
   * Rate limiting key generation
   */
  static generateRateLimitKey(identifier, endpoint) {
    return `rate_limit:${endpoint}:${identifier}`;
  }

  /**
   * Generate correlation ID
   */
  static generateCorrelationId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Mask sensitive data for logging
   */
  static maskSensitiveData(data, fields = ['password', 'token', 'secret']) {
    if (typeof data !== 'object' || data === null) return data;

    const masked = { ...data };
    
    for (const field of fields) {
      if (masked[field]) {
        masked[field] = '***masked***';
      }
    }

    return masked;
  }

  /**
   * Generate session ID
   */
  static generateSessionId() {
    return `sess_${this.generateSecureToken(16)}`;
  }

  /**
   * Validate IP address
   */
  static isValidIP(ip) {
    // IPv4 regex with proper octet validation (0-255)
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // Comprehensive IPv6 regex supporting all valid formats
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Check if request is from localhost
   */
  static isLocalhost(ip) {
    return ['127.0.0.1', '::1', 'localhost'].includes(ip);
  }

  /**
   * Generate TOTP secret for 2FA
   */
  static generate2FASecret() {
    return crypto.randomBytes(20).toString('base32');
  }

  /**
   * Time-based UUID for unique identifiers
   */
  static generateTimeBasedId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `${timestamp}_${randomPart}`;
  }
}