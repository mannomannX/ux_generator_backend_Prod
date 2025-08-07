// ==========================================
// SERVICES/USER-MANAGEMENT/src/security/two-factor-auth.js  
// TOTP-based two-factor authentication
// ==========================================

import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import argon2 from 'argon2';
import { Logger } from '@ux-flow/common';

class TwoFactorAuth {
  constructor(logger = new Logger('TwoFactorAuth'), mongoClient = null, redisClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redis = redisClient;
    
    // Configuration
    this.config = {
      serviceName: process.env.SERVICE_NAME || 'UXFlow Engine',
      issuer: process.env.TOTP_ISSUER || 'UXFlow',
      secretLength: parseInt(process.env.TOTP_SECRET_LENGTH) || 32,
      window: parseInt(process.env.TOTP_WINDOW) || 2, // Allow 2 steps before/after
      backupCodeCount: parseInt(process.env.BACKUP_CODE_COUNT) || 10,
      backupCodeLength: 8,
      algorithm: 'sha256',
      encoding: 'base32',
      period: 30, // 30 seconds per TOTP code
    };
    
    // Encryption for storing secrets
    this.encryptionKey = process.env.TOTP_ENCRYPTION_KEY 
      ? Buffer.from(process.env.TOTP_ENCRYPTION_KEY, 'hex')
      : crypto.randomBytes(32);
  }
  
  /**
   * Set up TOTP for a user
   */
  async setupTOTP(userId, userEmail) {
    try {
      // Check if user already has 2FA
      const existing = await this.getUserTOTP(userId);
      if (existing && existing.enabled) {
        throw new Error('2FA is already enabled for this user');
      }
      
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${this.config.serviceName} (${userEmail})`,
        issuer: this.config.issuer,
        length: this.config.secretLength,
        algorithm: this.config.algorithm,
      });
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      // Hash backup codes for storage
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => this.hashBackupCode(code))
      );
      
      // Generate QR code
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      
      // Encrypt secret for storage
      const encryptedSecret = this.encryptSecret(secret.base32);
      
      // Store setup data temporarily (not yet enabled)
      await this.saveTOTPSetup(userId, {
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
        algorithm: this.config.algorithm,
        period: this.config.period,
        setupAt: new Date(),
        enabled: false,
      });
      
      this.logger.info('TOTP setup initiated', { userId });
      
      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        backupCodes,
        manualEntry: {
          secret: secret.base32,
          issuer: this.config.issuer,
          account: userEmail,
          algorithm: this.config.algorithm,
          period: this.config.period,
        },
      };
    } catch (error) {
      this.logger.error('TOTP setup failed', error);
      throw error;
    }
  }
  
  /**
   * Enable TOTP after verification
   */
  async enableTOTP(userId, verificationCode) {
    try {
      const setup = await this.getUserTOTP(userId);
      
      if (!setup) {
        throw new Error('No 2FA setup found. Please setup 2FA first.');
      }
      
      if (setup.enabled) {
        throw new Error('2FA is already enabled');
      }
      
      // Verify the code
      const secret = this.decryptSecret(setup.secret);
      const verified = speakeasy.totp.verify({
        secret,
        encoding: this.config.encoding,
        token: verificationCode,
        window: this.config.window,
        algorithm: setup.algorithm || this.config.algorithm,
      });
      
      if (!verified) {
        throw new Error('Invalid verification code');
      }
      
      // Enable 2FA
      await this.updateTOTPStatus(userId, {
        enabled: true,
        enabledAt: new Date(),
        lastUsed: new Date(),
      });
      
      // Generate recovery codes
      const recoveryCodes = this.generateRecoveryCodes();
      
      this.logger.info('TOTP enabled', { userId });
      
      return {
        success: true,
        recoveryCodes,
      };
    } catch (error) {
      this.logger.error('TOTP enable failed', error);
      throw error;
    }
  }
  
  /**
   * Verify TOTP code
   */
  async verifyTOTP(userId, token) {
    try {
      const user2FA = await this.getUserTOTP(userId);
      
      if (!user2FA) {
        return {
          valid: false,
          reason: '2FA not configured',
        };
      }
      
      if (!user2FA.enabled) {
        return {
          valid: false,
          reason: '2FA not enabled',
        };
      }
      
      // Check if temporarily disabled (e.g., during recovery)
      if (user2FA.temporarilyDisabled) {
        const disabledUntil = new Date(user2FA.disabledUntil);
        if (disabledUntil > new Date()) {
          return {
            valid: false,
            reason: '2FA temporarily disabled',
            disabledUntil,
          };
        }
      }
      
      // Decrypt secret
      const secret = this.decryptSecret(user2FA.secret);
      
      // Verify TOTP code
      const verified = speakeasy.totp.verify({
        secret,
        encoding: this.config.encoding,
        token,
        window: this.config.window,
        algorithm: user2FA.algorithm || this.config.algorithm,
      });
      
      if (verified) {
        // Check for token reuse
        const reused = await this.checkTokenReuse(userId, token);
        if (reused) {
          // Potential attack - token replay
          await this.handleTokenReuse(userId);
          return {
            valid: false,
            reason: 'Token already used - possible security breach',
            securityAlert: true,
          };
        }
        
        // Record used token
        await this.recordUsedToken(userId, token);
        
        // Update last used time
        await this.updateTOTPStatus(userId, { lastUsed: new Date() });
        
        return {
          valid: true,
          method: 'totp',
        };
      }
      
      // Try backup codes
      if (user2FA.backupCodes && user2FA.backupCodes.length > 0) {
        for (let i = 0; i < user2FA.backupCodes.length; i++) {
          const isValid = await this.verifyBackupCode(token, user2FA.backupCodes[i]);
          
          if (isValid) {
            // Remove used backup code
            await this.removeBackupCode(userId, i);
            
            // Log backup code usage
            await this.logSecurityEvent('BACKUP_CODE_USED', {
              userId,
              remainingCodes: user2FA.backupCodes.length - 1,
            });
            
            return {
              valid: true,
              method: 'backup',
              warni

ng: `Backup code used. ${user2FA.backupCodes.length - 1} codes remaining.`,
            };
          }
        }
      }
      
      // Log failed attempt
      await this.logFailedTOTPAttempt(userId);
      
      return {
        valid: false,
        reason: 'Invalid code',
      };
    } catch (error) {
      this.logger.error('TOTP verification failed', error);
      return {
        valid: false,
        reason: 'Verification error',
      };
    }
  }
  
  /**
   * Disable TOTP
   */
  async disableTOTP(userId, password) {
    try {
      const user2FA = await this.getUserTOTP(userId);
      
      if (!user2FA || !user2FA.enabled) {
        throw new Error('2FA is not enabled');
      }
      
      // Verify user password before disabling
      // This should be done by the calling service
      
      // Disable 2FA
      await this.updateTOTPStatus(userId, {
        enabled: false,
        disabledAt: new Date(),
        secret: null,
        backupCodes: [],
      });
      
      // Log security event
      await this.logSecurityEvent('2FA_DISABLED', { userId });
      
      this.logger.info('TOTP disabled', { userId });
      
      return { success: true };
    } catch (error) {
      this.logger.error('TOTP disable failed', error);
      throw error;
    }
  }
  
  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId) {
    try {
      const user2FA = await this.getUserTOTP(userId);
      
      if (!user2FA || !user2FA.enabled) {
        throw new Error('2FA must be enabled to generate backup codes');
      }
      
      // Generate new codes
      const backupCodes = this.generateBackupCodes();
      
      // Hash for storage
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => this.hashBackupCode(code))
      );
      
      // Update stored codes
      await this.updateTOTPStatus(userId, {
        backupCodes: hashedBackupCodes,
        backupCodesGeneratedAt: new Date(),
      });
      
      this.logger.info('Backup codes regenerated', { userId });
      
      return backupCodes;
    } catch (error) {
      this.logger.error('Backup code generation failed', error);
      throw error;
    }
  }
  
  /**
   * Check for token reuse
   */
  async checkTokenReuse(userId, token) {
    if (!this.redis) {
      return false;
    }
    
    try {
      const key = `totp_used:${userId}:${token}`;
      const exists = await this.redis.get(key);
      
      return !!exists;
    } catch (error) {
      this.logger.error('Token reuse check failed', error);
      return false;
    }
  }
  
  /**
   * Record used token
   */
  async recordUsedToken(userId, token) {
    if (!this.redis) {
      return;
    }
    
    try {
      const key = `totp_used:${userId}:${token}`;
      // Store for 90 seconds (3 TOTP periods)
      await this.redis.setex(key, 90, '1');
    } catch (error) {
      this.logger.error('Failed to record used token', error);
    }
  }
  
  /**
   * Handle token reuse (potential attack)
   */
  async handleTokenReuse(userId) {
    try {
      // Temporarily disable 2FA
      await this.updateTOTPStatus(userId, {
        temporarilyDisabled: true,
        disabledUntil: new Date(Date.now() + 3600000), // 1 hour
      });
      
      // Log security event
      await this.logSecurityEvent('TOTP_REUSE_DETECTED', {
        userId,
        severity: 'high',
        action: 'temporarily_disabled',
      });
      
      // Notify user
      if (this.redis) {
        await this.redis.lpush(
          'notification_queue',
          JSON.stringify({
            type: 'security_alert',
            userId,
            message: '2FA token reuse detected. Your account has been secured.',
            priority: 'high',
          })
        );
      }
      
      this.logger.warn('TOTP token reuse detected', { userId });
    } catch (error) {
      this.logger.error('Failed to handle token reuse', error);
    }
  }
  
  /**
   * Generate backup codes
   */
  generateBackupCodes() {
    const codes = [];
    
    for (let i = 0; i < this.config.backupCodeCount; i++) {
      const code = this.generateSecureCode(this.config.backupCodeLength);
      codes.push(code);
    }
    
    return codes;
  }
  
  /**
   * Generate recovery codes (longer, for account recovery)
   */
  generateRecoveryCodes() {
    const codes = [];
    
    for (let i = 0; i < 5; i++) {
      const code = this.generateSecureCode(16);
      codes.push(code);
    }
    
    return codes;
  }
  
  /**
   * Generate secure random code
   */
  generateSecureCode(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
      if (i > 0 && i % 4 === 0) {
        code += '-'; // Add separator every 4 characters
      }
      const randomIndex = crypto.randomInt(charset.length);
      code += charset[randomIndex];
    }
    
    return code;
  }
  
  /**
   * Hash backup code for storage
   */
  async hashBackupCode(code) {
    return await argon2.hash(code, {
      type: argon2.argon2id,
      memoryCost: 16384, // 16 MB
      timeCost: 2,
      parallelism: 1,
    });
  }
  
  /**
   * Verify backup code
   */
  async verifyBackupCode(code, hashedCode) {
    try {
      return await argon2.verify(hashedCode, code);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Encrypt secret for storage
   */
  encryptSecret(secret) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  /**
   * Decrypt secret
   */
  decryptSecret(encryptedSecret) {
    const [ivHex, authTagHex, encrypted] = encryptedSecret.split(':');
    
    const algorithm = 'aes-256-gcm';
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Save TOTP setup
   */
  async saveTOTPSetup(userId, data) {
    if (!this.mongoClient) {
      throw new Error('Database connection required');
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('user_2fa').updateOne(
        { userId },
        {
          $set: {
            ...data,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      this.logger.error('Failed to save TOTP setup', error);
      throw error;
    }
  }
  
  /**
   * Get user TOTP configuration
   */
  async getUserTOTP(userId) {
    if (!this.mongoClient) {
      return null;
    }
    
    try {
      const db = this.mongoClient.getDb();
      return await db.collection('user_2fa').findOne({ userId });
    } catch (error) {
      this.logger.error('Failed to get user TOTP', error);
      return null;
    }
  }
  
  /**
   * Update TOTP status
   */
  async updateTOTPStatus(userId, updates) {
    if (!this.mongoClient) {
      return;
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('user_2fa').updateOne(
        { userId },
        {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      this.logger.error('Failed to update TOTP status', error);
      throw error;
    }
  }
  
  /**
   * Remove used backup code
   */
  async removeBackupCode(userId, codeIndex) {
    if (!this.mongoClient) {
      return;
    }
    
    try {
      const db = this.mongoClient.getDb();
      const user2FA = await this.getUserTOTP(userId);
      
      if (user2FA && user2FA.backupCodes) {
        user2FA.backupCodes.splice(codeIndex, 1);
        
        await db.collection('user_2fa').updateOne(
          { userId },
          {
            $set: {
              backupCodes: user2FA.backupCodes,
              lastBackupCodeUsed: new Date(),
            },
          }
        );
      }
    } catch (error) {
      this.logger.error('Failed to remove backup code', error);
    }
  }
  
  /**
   * Log failed TOTP attempt
   */
  async logFailedTOTPAttempt(userId) {
    try {
      if (this.redis) {
        const key = `totp_failed:${userId}`;
        await this.redis.incr(key);
        await this.redis.expire(key, 3600); // 1 hour window
        
        const count = await this.redis.get(key);
        
        // Lock 2FA after too many failures
        if (count >= 5) {
          await this.updateTOTPStatus(userId, {
            temporarilyDisabled: true,
            disabledUntil: new Date(Date.now() + 900000), // 15 minutes
          });
          
          await this.logSecurityEvent('TOTP_LOCKED', {
            userId,
            attempts: count,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to log TOTP attempt', error);
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
   * Get 2FA statistics
   */
  async get2FAStats() {
    const stats = {
      totalEnabled: 0,
      setupInProgress: 0,
      backupCodesUsed: 0,
      recentFailures: 0,
    };
    
    if (!this.mongoClient) {
      return stats;
    }
    
    try {
      const db = this.mongoClient.getDb();
      
      // Total enabled
      stats.totalEnabled = await db.collection('user_2fa')
        .countDocuments({ enabled: true });
      
      // Setup in progress
      stats.setupInProgress = await db.collection('user_2fa')
        .countDocuments({ enabled: false });
      
      // Recent failures (last hour)
      const hourAgo = new Date(Date.now() - 3600000);
      stats.recentFailures = await db.collection('security_events')
        .countDocuments({
          event: 'TOTP_LOCKED',
          'data.timestamp': { $gte: hourAgo },
        });
      
    } catch (error) {
      this.logger.error('Failed to get 2FA stats', error);
    }
    
    return stats;
  }
}

export { TwoFactorAuth };