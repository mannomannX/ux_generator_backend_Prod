/**
 * Multi-Factor Authentication Service
 * Implements TOTP-based 2FA with backup codes
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

export class MFAService {
  constructor(mongoClient, redisClient, logger) {
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.logger = logger;
    
    // Configuration
    this.config = {
      issuer: process.env.MFA_ISSUER || 'UX Flow Engine',
      secretLength: 32,
      window: 2, // Time window for TOTP validation
      backupCodeCount: 10,
      backupCodeLength: 8,
      maxAttempts: 5,
      lockoutDuration: 900000, // 15 minutes
      qrCodeSize: 256
    };
  }

  /**
   * Enable MFA for a user
   */
  async enableMFA(userId, userEmail) {
    try {
      const db = this.mongoClient.getDb();
      
      // Check if MFA is already enabled
      const user = await db.collection('users').findOne({ _id: userId });
      if (user?.mfa?.enabled) {
        throw new Error('MFA is already enabled for this user');
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        length: this.config.secretLength,
        name: `${this.config.issuer} (${userEmail})`,
        issuer: this.config.issuer
      });

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = await this.hashBackupCodes(backupCodes);

      // Store MFA setup temporarily (user needs to verify with code)
      const setupToken = crypto.randomBytes(32).toString('hex');
      const setupData = {
        userId,
        secret: secret.base32,
        backupCodes: hashedBackupCodes,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 600000) // 10 minutes
      };

      // Store in Redis temporarily
      if (this.redisClient) {
        await this.redisClient.setex(
          `mfa:setup:${setupToken}`,
          600,
          JSON.stringify(setupData)
        );
      }

      // Generate QR code
      const qrCodeUrl = await this.generateQRCode(secret.otpauth_url);

      return {
        setupToken,
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32,
        backupCodes: backupCodes
      };
    } catch (error) {
      this.logger.error('Failed to enable MFA', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Verify and confirm MFA setup
   */
  async verifyMFASetup(setupToken, verificationCode) {
    try {
      // Get setup data from Redis
      if (!this.redisClient) {
        throw new Error('MFA setup expired or invalid');
      }

      const setupDataStr = await this.redisClient.get(`mfa:setup:${setupToken}`);
      if (!setupDataStr) {
        throw new Error('MFA setup token expired or invalid');
      }

      const setupData = JSON.parse(setupDataStr);
      
      // Verify the code
      const isValid = speakeasy.totp.verify({
        secret: setupData.secret,
        encoding: 'base32',
        token: verificationCode,
        window: this.config.window
      });

      if (!isValid) {
        throw new Error('Invalid verification code');
      }

      // Save MFA configuration to database
      const db = this.mongoClient.getDb();
      await db.collection('users').updateOne(
        { _id: setupData.userId },
        {
          $set: {
            'mfa.enabled': true,
            'mfa.secret': this.encryptSecret(setupData.secret),
            'mfa.backupCodes': setupData.backupCodes,
            'mfa.enabledAt': new Date(),
            'mfa.lastUsed': null,
            'mfa.recoveryEmail': null
          }
        }
      );

      // Clean up setup token
      await this.redisClient.del(`mfa:setup:${setupToken}`);

      // Log MFA enablement
      this.logger.info('MFA enabled for user', { userId: setupData.userId });

      return {
        success: true,
        message: 'MFA has been successfully enabled'
      };
    } catch (error) {
      this.logger.error('Failed to verify MFA setup', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify MFA code during login
   */
  async verifyMFACode(userId, code, isBackupCode = false) {
    try {
      // Check rate limiting
      const isLocked = await this.checkRateLimit(userId);
      if (isLocked) {
        throw new Error('Too many failed attempts. Please try again later.');
      }

      const db = this.mongoClient.getDb();
      const user = await db.collection('users').findOne({ _id: userId });

      if (!user?.mfa?.enabled) {
        throw new Error('MFA is not enabled for this user');
      }

      let isValid = false;

      if (isBackupCode) {
        // Verify backup code
        isValid = await this.verifyBackupCode(userId, code, user.mfa.backupCodes);
      } else {
        // Verify TOTP code
        const secret = this.decryptSecret(user.mfa.secret);
        isValid = speakeasy.totp.verify({
          secret,
          encoding: 'base32',
          token: code,
          window: this.config.window
        });
      }

      if (!isValid) {
        await this.recordFailedAttempt(userId);
        throw new Error('Invalid authentication code');
      }

      // Update last used timestamp
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            'mfa.lastUsed': new Date()
          }
        }
      );

      // Clear failed attempts
      await this.clearFailedAttempts(userId);

      return {
        success: true,
        verified: true
      };
    } catch (error) {
      this.logger.error('MFA verification failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Disable MFA for a user
   */
  async disableMFA(userId, password) {
    try {
      const db = this.mongoClient.getDb();
      
      // Verify user's password first
      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) {
        throw new Error('User not found');
      }

      // Password verification would be done here
      // This is a placeholder - actual implementation would verify the password

      // Disable MFA
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            'mfa.enabled': false,
            'mfa.disabledAt': new Date()
          },
          $unset: {
            'mfa.secret': '',
            'mfa.backupCodes': ''
          }
        }
      );

      this.logger.info('MFA disabled for user', { userId });

      return {
        success: true,
        message: 'MFA has been disabled'
      };
    } catch (error) {
      this.logger.error('Failed to disable MFA', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId, currentCode) {
    try {
      // Verify current MFA code first
      await this.verifyMFACode(userId, currentCode, false);

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes();
      const hashedBackupCodes = await this.hashBackupCodes(backupCodes);

      // Update in database
      const db = this.mongoClient.getDb();
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $set: {
            'mfa.backupCodes': hashedBackupCodes,
            'mfa.backupCodesGeneratedAt': new Date()
          }
        }
      );

      this.logger.info('Backup codes regenerated', { userId });

      return {
        success: true,
        backupCodes
      };
    } catch (error) {
      this.logger.error('Failed to regenerate backup codes', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get MFA status for a user
   */
  async getMFAStatus(userId) {
    try {
      const db = this.mongoClient.getDb();
      const user = await db.collection('users').findOne(
        { _id: userId },
        { projection: { 'mfa.enabled': 1, 'mfa.enabledAt': 1, 'mfa.lastUsed': 1 } }
      );

      if (!user) {
        throw new Error('User not found');
      }

      return {
        enabled: user.mfa?.enabled || false,
        enabledAt: user.mfa?.enabledAt,
        lastUsed: user.mfa?.lastUsed
      };
    } catch (error) {
      this.logger.error('Failed to get MFA status', { userId, error: error.message });
      throw error;
    }
  }

  // Helper methods

  /**
   * Generate backup codes
   */
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < this.config.backupCodeCount; i++) {
      const code = crypto.randomBytes(this.config.backupCodeLength)
        .toString('hex')
        .substring(0, this.config.backupCodeLength)
        .toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup codes for storage
   */
  async hashBackupCodes(codes) {
    return codes.map(code => {
      return crypto.createHash('sha256').update(code).digest('hex');
    });
  }

  /**
   * Verify a backup code
   */
  async verifyBackupCode(userId, code, hashedCodes) {
    const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
    const index = hashedCodes.indexOf(codeHash);
    
    if (index === -1) {
      return false;
    }

    // Remove used backup code
    hashedCodes.splice(index, 1);
    
    const db = this.mongoClient.getDb();
    await db.collection('users').updateOne(
      { _id: userId },
      {
        $set: {
          'mfa.backupCodes': hashedCodes,
          'mfa.lastBackupCodeUsed': new Date()
        }
      }
    );

    this.logger.info('Backup code used', { userId, remainingCodes: hashedCodes.length });
    
    return true;
  }

  /**
   * Generate QR code for TOTP setup
   */
  async generateQRCode(otpauthUrl) {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: this.config.qrCodeSize,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeDataUrl;
    } catch (error) {
      this.logger.error('Failed to generate QR code', error);
      throw error;
    }
  }

  /**
   * Encrypt secret for storage
   */
  encryptSecret(secret) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || crypto.randomBytes(32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt secret from storage
   */
  decryptSecret(encryptedData) {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || crypto.randomBytes(32));
    const decipher = crypto.createDecipheriv(
      algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Check rate limiting for MFA attempts
   */
  async checkRateLimit(userId) {
    if (!this.redisClient) return false;
    
    const key = `mfa:attempts:${userId}`;
    const attempts = await this.redisClient.get(key);
    
    if (attempts && parseInt(attempts) >= this.config.maxAttempts) {
      return true; // User is locked out
    }
    
    return false;
  }

  /**
   * Record failed MFA attempt
   */
  async recordFailedAttempt(userId) {
    if (!this.redisClient) return;
    
    const key = `mfa:attempts:${userId}`;
    const attempts = await this.redisClient.incr(key);
    
    if (attempts === 1) {
      await this.redisClient.expire(key, Math.floor(this.config.lockoutDuration / 1000));
    }
    
    this.logger.warn('Failed MFA attempt', { userId, attempts });
  }

  /**
   * Clear failed attempts
   */
  async clearFailedAttempts(userId) {
    if (!this.redisClient) return;
    
    const key = `mfa:attempts:${userId}`;
    await this.redisClient.del(key);
  }
}

export default MFAService;