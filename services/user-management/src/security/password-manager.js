// ==========================================
// SERVICES/USER-MANAGEMENT/src/security/password-manager.js  
// Secure password management with Argon2
// ==========================================

import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Logger } from '@ux-flow/common';

class PasswordManager {
  constructor(logger = new Logger('PasswordManager'), mongoClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Argon2 configuration
    this.argon2Config = {
      type: argon2.argon2id,
      memoryCost: parseInt(process.env.ARGON2_MEMORY_COST) || 65536, // 64 MB
      timeCost: parseInt(process.env.ARGON2_TIME_COST) || 3,
      parallelism: parseInt(process.env.ARGON2_PARALLELISM) || 4,
      hashLength: 32,
      saltLength: 16,
    };
    
    // Password requirements
    this.requirements = {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 12,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventCommon: true,
      preventSequential: true,
      preventRepeating: true,
      historyCount: parseInt(process.env.PASSWORD_HISTORY_COUNT) || 12,
    };
    
    // Common passwords to block
    this.commonPasswords = new Set([
      'password123', 'admin123', 'qwerty123', 'password1',
      'welcome123', 'letmein', 'monkey123', 'dragon123',
      'master123', 'superman', 'batman123', 'trustno1',
    ]);
    
    // Bcrypt configuration for migration
    this.bcryptRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 14;
  }
  
  /**
   * Hash password using Argon2id
   */
  async hashPassword(password) {
    try {
      // Validate password strength first
      const validation = this.validatePasswordStrength(password);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Hash with Argon2id
      const hash = await argon2.hash(password, this.argon2Config);
      
      return hash;
    } catch (error) {
      this.logger.error('Failed to hash password', error);
      throw new Error('Password hashing failed');
    }
  }
  
  /**
   * Verify password with migration support
   */
  async verifyPassword(password, hash) {
    try {
      // Check if using old bcrypt (migration path)
      if (this.isBcryptHash(hash)) {
        const valid = await bcrypt.compare(password, hash);
        if (valid) {
          // Password is correct but needs rehashing
          return { 
            valid: true, 
            needsRehash: true,
            newHash: await this.hashPassword(password),
          };
        }
        return { valid: false };
      }
      
      // Verify Argon2 hash
      const valid = await argon2.verify(hash, password);
      
      // Check if parameters need updating
      const needsRehash = this.needsRehash(hash);
      
      if (valid && needsRehash) {
        return {
          valid: true,
          needsRehash: true,
          newHash: await this.hashPassword(password),
        };
      }
      
      return { valid, needsRehash: false };
    } catch (error) {
      this.logger.error('Password verification failed', error);
      return { valid: false };
    }
  }
  
  /**
   * Check if hash is bcrypt
   */
  isBcryptHash(hash) {
    return hash && (
      hash.startsWith('$2a$') || 
      hash.startsWith('$2b$') || 
      hash.startsWith('$2y$')
    );
  }
  
  /**
   * Check if hash needs rehashing
   */
  needsRehash(hash) {
    try {
      // Parse Argon2 hash parameters
      const params = this.parseArgon2Hash(hash);
      
      // Check if parameters are outdated
      return params.memoryCost < this.argon2Config.memoryCost ||
             params.timeCost < this.argon2Config.timeCost ||
             params.parallelism < this.argon2Config.parallelism;
    } catch (error) {
      // If we can't parse, assume it needs rehashing
      return true;
    }
  }
  
  /**
   * Parse Argon2 hash parameters
   */
  parseArgon2Hash(hash) {
    // Argon2 hash format: $argon2id$v=19$m=65536,t=3,p=4$...
    const parts = hash.split('$');
    const params = parts[3]?.split(',') || [];
    
    return {
      memoryCost: parseInt(params[0]?.split('=')[1]) || 0,
      timeCost: parseInt(params[1]?.split('=')[1]) || 0,
      parallelism: parseInt(params[2]?.split('=')[1]) || 0,
    };
  }
  
  /**
   * Validate password strength
   */
  validatePasswordStrength(password) {
    const errors = [];
    
    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['Password must be a string'] };
    }
    
    // Check length
    if (password.length < this.requirements.minLength) {
      errors.push(`Password must be at least ${this.requirements.minLength} characters long`);
    }
    
    if (password.length > this.requirements.maxLength) {
      errors.push(`Password must not exceed ${this.requirements.maxLength} characters`);
    }
    
    // Check character requirements
    if (this.requirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (this.requirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (this.requirements.requireNumbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (this.requirements.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Check for common passwords
    if (this.requirements.preventCommon) {
      const lowerPassword = password.toLowerCase();
      for (const common of this.commonPasswords) {
        if (lowerPassword.includes(common)) {
          errors.push('Password is too common or predictable');
          break;
        }
      }
    }
    
    // Check for sequential characters
    if (this.requirements.preventSequential) {
      if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password)) {
        errors.push('Password contains sequential characters');
      }
    }
    
    // Check for repeating characters
    if (this.requirements.preventRepeating) {
      if (/(.)\\1{2,}/.test(password)) {
        errors.push('Password contains too many repeating characters');
      }
    }
    
    // Calculate password score
    const score = this.calculatePasswordScore(password);
    
    return {
      valid: errors.length === 0,
      errors,
      score,
      strength: this.getPasswordStrength(score),
    };
  }
  
  /**
   * Calculate password score
   */
  calculatePasswordScore(password) {
    let score = 0;
    
    // Length score
    score += Math.min(password.length * 2, 20);
    
    // Character variety
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;
    
    // Additional complexity
    const uniqueChars = new Set(password).size;
    score += Math.min(uniqueChars, 20);
    
    // Entropy estimate
    const entropy = Math.log2(Math.pow(uniqueChars, password.length));
    score += Math.min(entropy / 2, 20);
    
    return Math.min(score, 100);
  }
  
  /**
   * Get password strength label
   */
  getPasswordStrength(score) {
    if (score < 30) return 'weak';
    if (score < 50) return 'fair';
    if (score < 70) return 'good';
    if (score < 90) return 'strong';
    return 'very strong';
  }
  
  /**
   * Check password history
   */
  async checkPasswordHistory(userId, newPassword) {
    if (!this.mongoClient) {
      return { allowed: true };
    }
    
    try {
      const db = this.mongoClient.getDb();
      const history = await db.collection('password_history')
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(this.requirements.historyCount)
        .toArray();
      
      for (const entry of history) {
        const result = await this.verifyPassword(newPassword, entry.hash);
        if (result.valid) {
          const daysSince = Math.floor((Date.now() - entry.createdAt.getTime()) / (1000 * 86400));
          return {
            allowed: false,
            message: `This password was used ${daysSince} days ago. Please choose a different password.`,
          };
        }
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check password history', error);
      // Fail open - allow if we can't check
      return { allowed: true };
    }
  }
  
  /**
   * Add password to history
   */
  async addToHistory(userId, passwordHash) {
    if (!this.mongoClient) {
      return;
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Add new entry
      await db.collection('password_history').insertOne({
        userId,
        hash: passwordHash,
        createdAt: new Date(),
      });
      
      // Remove old entries beyond limit
      const oldEntries = await db.collection('password_history')
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(this.requirements.historyCount)
        .toArray();
      
      if (oldEntries.length > 0) {
        await db.collection('password_history').deleteMany({
          _id: { $in: oldEntries.map(e => e._id) },
        });
      }
    } catch (error) {
      this.logger.error('Failed to add password to history', error);
    }
  }
  
  /**
   * Generate secure random password
   */
  generateSecurePassword(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*(),.?":{}|<>';
    
    const allChars = uppercase + lowercase + numbers + special;
    let password = '';
    
    // Ensure at least one of each required type
    password += uppercase[crypto.randomInt(uppercase.length)];
    password += lowercase[crypto.randomInt(lowercase.length)];
    password += numbers[crypto.randomInt(numbers.length)];
    password += special[crypto.randomInt(special.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[crypto.randomInt(allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
  }
  
  /**
   * Generate password reset token
   */
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * Hash reset token for storage
   */
  async hashResetToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  /**
   * Verify reset token
   */
  verifyResetToken(token, hashedToken) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(tokenHash), Buffer.from(hashedToken));
  }
}

export { PasswordManager };