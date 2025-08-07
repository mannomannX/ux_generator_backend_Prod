// ==========================================
// SERVICES/USER-MANAGEMENT/src/security/token-manager.js
// JWT token rotation and blacklisting system
// ==========================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Logger } from '@ux-flow/common';

class TokenManager {
  constructor(logger = new Logger('TokenManager'), redisClient = null) {
    this.logger = logger;
    this.redis = redisClient;
    
    // Token configuration
    this.accessTokenTTL = parseInt(process.env.ACCESS_TOKEN_TTL) || 900; // 15 minutes
    this.refreshTokenTTL = parseInt(process.env.REFRESH_TOKEN_TTL) || 604800; // 7 days
    this.tokenRotationThreshold = parseInt(process.env.TOKEN_ROTATION_THRESHOLD) || 300; // 5 minutes
    
    // JWT configuration
    this.jwtAlgorithm = process.env.JWT_ALGORITHM || 'HS256';
    this.jwtSecret = process.env.JWT_SECRET;
    
    // SECURITY FIX: Require separate refresh token secret
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!this.jwtRefreshSecret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_REFRESH_SECRET environment variable is required in production');
      } else {
        // Generate separate secret for development
        this.jwtRefreshSecret = crypto.randomBytes(64).toString('hex');
        this.logger.warn('Generated temporary refresh token secret - set JWT_REFRESH_SECRET in production');
      }
    }
    
    this.jwtIssuer = process.env.JWT_ISSUER || 'ux-flow-engine';
    this.jwtAudience = process.env.JWT_AUDIENCE || 'ux-flow-users';
    
    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    // SECURITY FIX: Validate that secrets are different
    if (this.jwtSecret === this.jwtRefreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different for security');
    }
    
    // SECURITY FIX: Validate JWT secret strength in production
    this.validateSecretStrength(this.jwtSecret, 'JWT_SECRET');
    this.validateSecretStrength(this.jwtRefreshSecret, 'JWT_REFRESH_SECRET');
  }
  
  /**
   * SECURITY FIX: Validate JWT secret strength and entropy
   */
  validateSecretStrength(secret, secretName) {
    if (!secret || typeof secret !== 'string') {
      throw new Error(`${secretName} must be a non-empty string`);
    }
    
    // Minimum length requirements
    const minLength = process.env.NODE_ENV === 'production' ? 64 : 32;
    if (secret.length < minLength) {
      throw new Error(`${secretName} must be at least ${minLength} characters long`);
    }
    
    // Check for common weak patterns
    const weakPatterns = [
      /^(.)\1+$/, // All same character
      /^(password|secret|key|token)/i, // Common words
      /^(123|abc|qwe|test)/i, // Common sequences
      /^(.{1,4})\1+$/, // Repeating short patterns
    ];
    
    for (const pattern of weakPatterns) {
      if (pattern.test(secret)) {
        throw new Error(`${secretName} contains weak patterns and should be more random`);
      }
    }
    
    // Entropy validation for production
    if (process.env.NODE_ENV === 'production') {
      const entropy = this.calculateEntropy(secret);
      const minEntropy = 4.5; // bits per character (reasonable for a good secret)
      
      if (entropy < minEntropy) {
        this.logger.warn(`${secretName} has low entropy (${entropy.toFixed(2)} bits/char). Consider using a more random secret.`);
      }
      
      // Character diversity requirements for production
      const hasLowerCase = /[a-z]/.test(secret);
      const hasUpperCase = /[A-Z]/.test(secret);
      const hasNumbers = /\d/.test(secret);
      const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(secret);
      
      const charTypeCount = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
      
      if (charTypeCount < 3) {
        this.logger.warn(`${secretName} should contain at least 3 different character types (lowercase, uppercase, numbers, special characters) for better security.`);
      }
    }
    
    // Check for common dictionary words or leaked secrets patterns
    const suspiciousPatterns = [
      /admin/i, /root/i, /default/i, /example/i, /sample/i, /demo/i,
      /changeme/i, /replace/i, /temp/i, /dev/i, /stage/i, /prod/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(secret)) {
        this.logger.warn(`${secretName} contains suspicious patterns. Ensure it's not a default or placeholder value.`);
        break;
      }
    }
  }
  
  /**
   * SECURITY FIX: Calculate Shannon entropy for secret strength assessment
   */
  calculateEntropy(str) {
    const freq = {};
    const len = str.length;
    
    // Calculate character frequency
    for (let i = 0; i < len; i++) {
      freq[str[i]] = (freq[str[i]] || 0) + 1;
    }
    
    // Calculate entropy
    let entropy = 0;
    for (const char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }
  
  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(userId, metadata = {}) {
    try {
      const tokenId = crypto.randomBytes(16).toString('hex');
      const sessionId = crypto.randomBytes(16).toString('hex');
      const fingerprint = crypto.randomBytes(32).toString('hex');
      
      // Create access token
      const accessToken = jwt.sign(
        {
          sub: userId,
          jti: tokenId,
          sid: sessionId,
          type: 'access',
          fingerprint: this.hashFingerprint(fingerprint),
          ...metadata,
        },
        this.jwtSecret,
        {
          expiresIn: this.accessTokenTTL,
          algorithm: this.jwtAlgorithm,
          issuer: this.jwtIssuer,
          audience: this.jwtAudience,
        }
      );
      
      // Create refresh token
      const refreshTokenId = `${tokenId}_refresh`;
      const refreshToken = jwt.sign(
        {
          sub: userId,
          jti: refreshTokenId,
          sid: sessionId,
          type: 'refresh',
          fingerprint: this.hashFingerprint(fingerprint),
        },
        this.jwtRefreshSecret,
        {
          expiresIn: this.refreshTokenTTL,
          algorithm: this.jwtAlgorithm,
          issuer: this.jwtIssuer,
          audience: this.jwtAudience,
        }
      );
      
      // Store session information in Redis
      if (this.redis) {
        const sessionData = {
          userId,
          tokenId,
          sessionId,
          fingerprint,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          metadata,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
          rotationCount: 0,
        };
        
        await this.redis.setex(
          `session:${sessionId}`,
          this.refreshTokenTTL,
          JSON.stringify(sessionData)
        );
        
        // Track active sessions per user
        await this.redis.sadd(`user_sessions:${userId}`, sessionId);
        await this.redis.expire(`user_sessions:${userId}`, this.refreshTokenTTL);
      }
      
      this.logger.info('Generated token pair', {
        userId,
        sessionId,
        tokenId,
      });
      
      return {
        accessToken,
        refreshToken,
        sessionId,
        fingerprint,
        expiresIn: this.accessTokenTTL,
      };
    } catch (error) {
      this.logger.error('Failed to generate token pair', error);
      throw new Error('Token generation failed');
    }
  }
  
  /**
   * Verify and validate token
   */
  async verifyToken(token, type = 'access', fingerprint = null) {
    try {
      // Select appropriate secret
      const secret = type === 'refresh' ? this.jwtRefreshSecret : this.jwtSecret;
      
      // Verify JWT signature and claims
      const decoded = jwt.verify(token, secret, {
        algorithms: [this.jwtAlgorithm],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      });
      
      // Check token type
      if (decoded.type !== type) {
        throw new Error(`Invalid token type. Expected ${type}, got ${decoded.type}`);
      }
      
      // Verify fingerprint if provided
      if (fingerprint && decoded.fingerprint) {
        const expectedFingerprint = this.hashFingerprint(fingerprint);
        if (decoded.fingerprint !== expectedFingerprint) {
          throw new Error('Token fingerprint mismatch');
        }
      }
      
      // Check if token is blacklisted
      if (this.redis) {
        const isBlacklisted = await this.redis.get(`blacklist:${decoded.jti}`);
        if (isBlacklisted) {
          throw new Error('Token has been revoked');
        }
        
        // Check if session is still valid
        const session = await this.redis.get(`session:${decoded.sid}`);
        if (!session) {
          throw new Error('Session expired or invalid');
        }
        
        // Update session activity
        const sessionData = JSON.parse(session);
        sessionData.lastActivity = Date.now();
        
        await this.redis.setex(
          `session:${decoded.sid}`,
          this.refreshTokenTTL,
          JSON.stringify(sessionData)
        );
        
        // Check if token needs rotation
        const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
        const shouldRotate = tokenAge > this.tokenRotationThreshold;
        
        return {
          valid: true,
          decoded,
          shouldRotate,
          session: sessionData,
        };
      }
      
      // Without Redis, just return decoded token
      return {
        valid: true,
        decoded,
        shouldRotate: false,
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired',
          expired: true,
        };
      }
      
      if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid token',
        };
      }
      
      this.logger.error('Token verification failed', error);
      
      return {
        valid: false,
        error: error.message || 'Token verification failed',
      };
    }
  }
  
  /**
   * Rotate tokens (generate new pair from refresh token)
   */
  async rotateTokens(refreshToken, fingerprint = null) {
    try {
      // Verify refresh token
      const verification = await this.verifyToken(refreshToken, 'refresh', fingerprint);
      
      if (!verification.valid) {
        throw new Error(verification.error || 'Invalid refresh token');
      }
      
      const { decoded, session } = verification;
      
      // Check rotation limit
      if (session && session.rotationCount >= 100) {
        throw new Error('Token rotation limit exceeded');
      }
      
      // Blacklist old tokens
      await this.blacklistToken(refreshToken);
      
      // Generate new token pair
      const newTokens = await this.generateTokenPair(decoded.sub, {
        ...session?.metadata,
        rotatedFrom: decoded.jti,
        rotationCount: (session?.rotationCount || 0) + 1,
      });
      
      // Update session with new token info
      if (this.redis && session) {
        session.tokenId = newTokens.tokenId;
        session.rotationCount = (session.rotationCount || 0) + 1;
        session.lastRotation = Date.now();
        
        await this.redis.setex(
          `session:${decoded.sid}`,
          this.refreshTokenTTL,
          JSON.stringify(session)
        );
      }
      
      this.logger.info('Tokens rotated', {
        userId: decoded.sub,
        sessionId: decoded.sid,
        rotationCount: session?.rotationCount,
      });
      
      return newTokens;
    } catch (error) {
      this.logger.error('Token rotation failed', error);
      throw error;
    }
  }
  
  /**
   * Blacklist a token
   */
  async blacklistToken(token) {
    if (!this.redis) {
      this.logger.warn('Cannot blacklist token without Redis');
      return;
    }
    
    try {
      // Decode token to get JTI and expiry
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.jti) {
        this.logger.warn('Cannot blacklist invalid token');
        return;
      }
      
      // Calculate TTL (time until token would naturally expire)
      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;
      
      if (ttl > 0) {
        // Add to blacklist with TTL
        await this.redis.setex(`blacklist:${decoded.jti}`, ttl, '1');
        
        // Log blacklist event
        await this.logSecurityEvent('TOKEN_BLACKLISTED', {
          tokenId: decoded.jti,
          userId: decoded.sub,
          sessionId: decoded.sid,
          ttl,
        });
        
        this.logger.info('Token blacklisted', {
          tokenId: decoded.jti,
          ttl,
        });
      }
    } catch (error) {
      this.logger.error('Failed to blacklist token', error);
    }
  }
  
  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId) {
    if (!this.redis) {
      this.logger.warn('Cannot revoke tokens without Redis');
      return;
    }
    
    try {
      // Get all user sessions
      const sessionIds = await this.redis.smembers(`user_sessions:${userId}`);
      
      for (const sessionId of sessionIds) {
        // Get session data
        const sessionData = await this.redis.get(`session:${sessionId}`);
        
        if (sessionData) {
          const session = JSON.parse(sessionData);
          
          // Blacklist tokens associated with session
          await this.redis.setex(
            `blacklist:${session.tokenId}`,
            this.accessTokenTTL,
            '1'
          );
          
          await this.redis.setex(
            `blacklist:${session.tokenId}_refresh`,
            this.refreshTokenTTL,
            '1'
          );
          
          // Delete session
          await this.redis.del(`session:${sessionId}`);
        }
      }
      
      // Clear user sessions set
      await this.redis.del(`user_sessions:${userId}`);
      
      // Log security event
      await this.logSecurityEvent('ALL_TOKENS_REVOKED', {
        userId,
        sessionCount: sessionIds.length,
      });
      
      this.logger.info('All user tokens revoked', {
        userId,
        sessionCount: sessionIds.length,
      });
    } catch (error) {
      this.logger.error('Failed to revoke user tokens', error);
      throw error;
    }
  }
  
  /**
   * Revoke specific session
   */
  async revokeSession(sessionId) {
    if (!this.redis) {
      return;
    }
    
    try {
      const sessionData = await this.redis.get(`session:${sessionId}`);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        
        // Blacklist tokens
        await this.redis.setex(
          `blacklist:${session.tokenId}`,
          this.accessTokenTTL,
          '1'
        );
        
        await this.redis.setex(
          `blacklist:${session.tokenId}_refresh`,
          this.refreshTokenTTL,
          '1'
        );
        
        // Remove from user sessions
        await this.redis.srem(`user_sessions:${session.userId}`, sessionId);
        
        // Delete session
        await this.redis.del(`session:${sessionId}`);
        
        this.logger.info('Session revoked', { sessionId });
      }
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
    }
  }
  
  /**
   * Get active sessions for user
   */
  async getUserSessions(userId) {
    if (!this.redis) {
      return [];
    }
    
    try {
      const sessionIds = await this.redis.smembers(`user_sessions:${userId}`);
      const sessions = [];
      
      for (const sessionId of sessionIds) {
        const sessionData = await this.redis.get(`session:${sessionId}`);
        
        if (sessionData) {
          const session = JSON.parse(sessionData);
          sessions.push({
            sessionId,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
            rotationCount: session.rotationCount,
          });
        }
      }
      
      return sessions.sort((a, b) => b.lastActivity - a.lastActivity);
    } catch (error) {
      this.logger.error('Failed to get user sessions', error);
      return [];
    }
  }
  
  /**
   * Clean up expired sessions and blacklist entries
   */
  async cleanupExpired() {
    if (!this.redis) {
      return;
    }
    
    try {
      // Redis automatically handles expiry for us
      // This method is for any additional cleanup if needed
      
      this.logger.debug('Cleanup completed');
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }
  
  /**
   * Hash fingerprint for storage
   */
  hashFingerprint(fingerprint) {
    return crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex');
  }
  
  /**
   * Log security events
   */
  async logSecurityEvent(event, data) {
    try {
      // Log to database if available
      if (this.mongoClient) {
        const db = this.mongoClient.getDb();
        await db.collection('security_events').insertOne({
          event,
          data,
          timestamp: new Date(),
        });
      }
      
      // Also log to logger
      this.logger.info(`Security Event: ${event}`, data);
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }
}

export { TokenManager };