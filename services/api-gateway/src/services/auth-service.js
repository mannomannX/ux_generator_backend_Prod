// ==========================================
// API GATEWAY - Authentication Service
// ==========================================

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Logger } from '@ux-flow/common';

export class AuthService {
  constructor(logger, mongoClient, redisClient, config) {
    this.logger = logger || new Logger('auth-service');
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.config = config || {};
    
    // JWT configuration
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtExpiry = this.config.jwtExpiry || '1h';
    this.refreshExpiry = this.config.refreshExpiry || '7d';
    
    // Session management
    this.sessions = new Map();
    this.maxSessionsPerUser = this.config.maxSessionsPerUser || 5;
  }

  async authenticateUser(email, password) {
    try {
      // Get user from database
      const db = this.mongoClient.getDb();
      const user = await db.collection('users').findOne({ email });
      
      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Check if account is active
      if (user.status !== 'active') {
        return {
          success: false,
          error: 'Account is not active'
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        // Log failed attempt
        await this.logFailedAttempt(user._id, email);
        
        return {
          success: false,
          error: 'Invalid email or password'
        };
      }

      // Check for account lockout
      if (await this.isAccountLocked(user._id)) {
        return {
          success: false,
          error: 'Account temporarily locked due to multiple failed attempts'
        };
      }

      // Generate tokens
      const tokens = await this.generateTokens(user);
      
      // Create session
      await this.createSession(user._id, tokens.sessionId);
      
      // Update last login
      await db.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: { 
            lastLogin: new Date(),
            lastLoginIp: user.lastLoginIp 
          }
        }
      );

      // Clear failed attempts
      await this.clearFailedAttempts(user._id);

      return {
        success: true,
        user: this.sanitizeUser(user),
        ...tokens
      };
    } catch (error) {
      this.logger.error('Authentication failed', error);
      throw error;
    }
  }

  async generateTokens(user) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
      sessionId
    };

    const token = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.jwtExpiry
    });

    const refreshToken = jwt.sign(
      { ...tokenPayload, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshExpiry }
    );

    return {
      token,
      refreshToken,
      sessionId,
      expiresIn: this.jwtExpiry
    };
  }

  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Check if session is valid
      if (!await this.isSessionValid(decoded.sessionId)) {
        throw new Error('Session invalid or expired');
      }

      // Update session activity
      await this.updateSessionActivity(decoded.sessionId);
      
      return {
        valid: true,
        user: decoded
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async refreshTokens(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret);
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      // Get fresh user data
      const db = this.mongoClient.getDb();
      const user = await db.collection('users').findOne({ 
        _id: decoded.id 
      });

      if (!user || user.status !== 'active') {
        throw new Error('User not found or inactive');
      }

      // Generate new tokens
      return await this.generateTokens(user);
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  async createSession(userId, sessionId) {
    const session = {
      userId: userId.toString(),
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      active: true
    };

    // Store in memory
    this.sessions.set(sessionId, session);
    
    // Store in Redis for distributed systems
    if (this.redisClient) {
      const key = `session:${sessionId}`;
      await this.redisClient.set(
        key,
        JSON.stringify(session),
        'EX',
        86400 // 24 hours
      );
    }

    // Store in database
    const db = this.mongoClient.getDb();
    await db.collection('sessions').insertOne(session);
    
    // Check and enforce session limit
    await this.enforceSessionLimit(userId);
  }

  async enforceSessionLimit(userId) {
    const db = this.mongoClient.getDb();
    
    // Get all active sessions for user
    const sessions = await db.collection('sessions')
      .find({ userId: userId.toString(), active: true })
      .sort({ createdAt: -1 })
      .toArray();

    if (sessions.length > this.maxSessionsPerUser) {
      // Invalidate oldest sessions
      const toInvalidate = sessions.slice(this.maxSessionsPerUser);
      
      for (const session of toInvalidate) {
        await this.invalidateSession(session.sessionId);
      }
      
      this.logger.info(`Invalidated ${toInvalidate.length} old sessions for user ${userId}`);
    }
  }

  async invalidateSession(sessionId) {
    // Remove from memory
    this.sessions.delete(sessionId);
    
    // Remove from Redis
    if (this.redisClient) {
      await this.redisClient.del(`session:${sessionId}`);
    }
    
    // Mark as inactive in database
    const db = this.mongoClient.getDb();
    await db.collection('sessions').updateOne(
      { sessionId },
      { 
        $set: { 
          active: false,
          invalidatedAt: new Date()
        }
      }
    );
  }

  async isSessionValid(sessionId) {
    // Check memory first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);
      return session.active;
    }

    // Check Redis
    if (this.redisClient) {
      const data = await this.redisClient.get(`session:${sessionId}`);
      if (data) {
        const session = JSON.parse(data);
        return session.active;
      }
    }

    // Check database
    const db = this.mongoClient.getDb();
    const session = await db.collection('sessions').findOne({ 
      sessionId,
      active: true 
    });
    
    return !!session;
  }

  async updateSessionActivity(sessionId) {
    const now = new Date();
    
    // Update in memory
    if (this.sessions.has(sessionId)) {
      this.sessions.get(sessionId).lastActivity = now;
    }
    
    // Update in Redis
    if (this.redisClient) {
      const key = `session:${sessionId}`;
      const data = await this.redisClient.get(key);
      if (data) {
        const session = JSON.parse(data);
        session.lastActivity = now;
        await this.redisClient.set(key, JSON.stringify(session), 'EX', 86400);
      }
    }
    
    // Update in database (throttled)
    const db = this.mongoClient.getDb();
    await db.collection('sessions').updateOne(
      { sessionId },
      { $set: { lastActivity: now } }
    );
  }

  async logFailedAttempt(userId, email) {
    const db = this.mongoClient.getDb();
    
    await db.collection('failed_login_attempts').insertOne({
      userId: userId?.toString(),
      email,
      timestamp: new Date(),
      ip: this.currentRequestIp
    });

    // Check if account should be locked
    const recentAttempts = await db.collection('failed_login_attempts')
      .countDocuments({
        userId: userId?.toString(),
        timestamp: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // Last 15 minutes
      });

    if (recentAttempts >= 5) {
      await this.lockAccount(userId);
    }
  }

  async lockAccount(userId) {
    const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    
    const db = this.mongoClient.getDb();
    await db.collection('users').updateOne(
      { _id: userId },
      { 
        $set: { 
          lockedUntil: lockUntil,
          lockedAt: new Date()
        }
      }
    );
    
    this.logger.warn(`Account locked for user ${userId} until ${lockUntil}`);
  }

  async isAccountLocked(userId) {
    const db = this.mongoClient.getDb();
    const user = await db.collection('users').findOne({ _id: userId });
    
    if (user?.lockedUntil) {
      if (new Date(user.lockedUntil) > new Date()) {
        return true;
      } else {
        // Unlock if time has passed
        await db.collection('users').updateOne(
          { _id: userId },
          { $unset: { lockedUntil: 1, lockedAt: 1 } }
        );
      }
    }
    
    return false;
  }

  async clearFailedAttempts(userId) {
    const db = this.mongoClient.getDb();
    await db.collection('failed_login_attempts').deleteMany({
      userId: userId?.toString()
    });
  }

  async logout(sessionId) {
    await this.invalidateSession(sessionId);
    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAllSessions(userId) {
    const db = this.mongoClient.getDb();
    
    // Get all active sessions
    const sessions = await db.collection('sessions')
      .find({ userId: userId.toString(), active: true })
      .toArray();
    
    // Invalidate all sessions
    for (const session of sessions) {
      await this.invalidateSession(session.sessionId);
    }
    
    return { 
      success: true, 
      message: `Logged out from ${sessions.length} sessions` 
    };
  }

  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }

  // API Key management
  async generateApiKey(userId, name, permissions = []) {
    const apiKey = `sk_${process.env.NODE_ENV}_${Math.random().toString(36).substr(2, 32)}`;
    const hashedKey = await bcrypt.hash(apiKey, 10);
    
    const db = this.mongoClient.getDb();
    await db.collection('api_keys').insertOne({
      userId: userId.toString(),
      name,
      key: hashedKey,
      lastFourChars: apiKey.slice(-4),
      permissions,
      createdAt: new Date(),
      lastUsed: null,
      active: true
    });
    
    return apiKey; // Return only once when created
  }

  async validateApiKey(apiKey) {
    const db = this.mongoClient.getDb();
    const keys = await db.collection('api_keys')
      .find({ active: true })
      .toArray();
    
    for (const keyDoc of keys) {
      if (await bcrypt.compare(apiKey, keyDoc.key)) {
        // Update last used
        await db.collection('api_keys').updateOne(
          { _id: keyDoc._id },
          { $set: { lastUsed: new Date() } }
        );
        
        return {
          valid: true,
          userId: keyDoc.userId,
          permissions: keyDoc.permissions
        };
      }
    }
    
    return { valid: false };
  }

  async revokeApiKey(userId, keyId) {
    const db = this.mongoClient.getDb();
    const result = await db.collection('api_keys').updateOne(
      { _id: keyId, userId: userId.toString() },
      { $set: { active: false, revokedAt: new Date() } }
    );
    
    return result.modifiedCount > 0;
  }
}

export default AuthService;