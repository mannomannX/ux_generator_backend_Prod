// ==========================================
// SERVICES/USER-MANAGEMENT/src/services/user-manager.js
// ==========================================
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { MongoClient, JWTUtils, Validators } from '@ux-flow/common';
import config from '../config/index.js';

class UserManager {
  constructor(logger, mongoClient, redisClient, emailService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.emailService = emailService;
  }

  // User Registration
  async createUser(userData) {
    try {
      const { email, password, firstName, lastName, workspaceName, invitationToken } = userData;

      // Validate input
      if (!Validators.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }

      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);

      // Generate user ID
      const userId = uuidv4();

      // Create user object
      const user = {
        _id: userId,
        email: email.toLowerCase(),
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: this.generateDisplayName(firstName, lastName, email),
        avatar: null,
        role: config.user.defaultRole,
        permissions: [...config.user.defaultPermissions],
        status: 'active',
        emailVerified: !config.security.requireEmailVerification,
        preferences: {
          language: 'en',
          timezone: 'UTC',
          notifications: {
            email: true,
            browser: true,
            mentions: true,
            projectUpdates: true,
          },
        },
        metadata: {
          signupSource: invitationToken ? 'invitation' : 'direct',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: null,
          loginCount: 0,
          lastActiveAt: new Date(),
        },
        security: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
          twoFactorEnabled: false,
        },
      };

      // Handle workspace assignment
      let workspaceId = null;
      if (invitationToken) {
        // Join existing workspace via invitation
        workspaceId = await this.processInvitation(invitationToken, userId);
      } else if (workspaceName) {
        // Create new workspace
        workspaceId = await this.createWorkspaceForUser(userId, workspaceName);
      }

      user.workspaceId = workspaceId;

      // Insert user
      await usersCollection.insertOne(user);

      // Send email verification if required
      if (config.security.requireEmailVerification) {
        await this.sendEmailVerification(userId, email);
      }

      // Send welcome email
      if (config.email.templates.welcomeEmail) {
        await this.emailService.sendWelcomeEmail(email, {
          firstName: firstName || 'User',
          workspaceName: workspaceName || 'Your Workspace',
        });
      }

      // Cache user data
      await this.cacheUser(userId, user);

      this.logger.info('User created successfully', {
        userId,
        email: email.toLowerCase(),
        workspaceId,
        hasWorkspace: !!workspaceId,
        signupSource: user.metadata.signupSource,
      });

      // Return user without sensitive data
      return this.sanitizeUser(user);

    } catch (error) {
      this.logger.error('Failed to create user', error, { email });
      throw error;
    }
  }

  // User Authentication
  async authenticateUser(email, password, options = {}) {
    try {
      const { rememberMe = false, ipAddress, userAgent } = options;

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Find user
      const user = await usersCollection.findOne({ 
        email: email.toLowerCase(),
        status: { $ne: 'deleted' }
      });

      if (!user) {
        await this.recordFailedLogin(email, ipAddress);
        throw new Error('Invalid email or password');
      }

      // Check if account is locked
      if (user.security.lockedUntil && user.security.lockedUntil > new Date()) {
        throw new Error('Account is temporarily locked due to too many failed login attempts');
      }

      // Check if email is verified
      if (config.security.requireEmailVerification && !user.emailVerified) {
        throw new Error('Please verify your email address before logging in');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        await this.recordFailedLogin(email, ipAddress, user._id);
        throw new Error('Invalid email or password');
      }

      // Reset failed login attempts on successful login
      await this.resetFailedLoginAttempts(user._id);

      // Update login metadata
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            'metadata.lastLoginAt': new Date(),
            'metadata.lastActiveAt': new Date(),
            'metadata.updatedAt': new Date(),
          },
          $inc: {
            'metadata.loginCount': 1,
          },
        }
      );

      // Generate tokens
      const tokenPayload = {
        userId: user._id,
        email: user.email,
        workspaceId: user.workspaceId,
        role: user.role,
        permissions: user.permissions,
      };

      const accessToken = JWTUtils.sign(tokenPayload, {
        expiresIn: rememberMe ? '30d' : config.auth.jwtExpiresIn,
      });

      const refreshToken = await this.createRefreshToken(user._id, rememberMe);

      // Create session
      await this.createSession(user._id, {
        accessToken,
        refreshToken,
        ipAddress,
        userAgent,
        rememberMe,
      });

      // Update cache
      await this.cacheUser(user._id, user);

      this.logger.info('User authenticated successfully', {
        userId: user._id,
        email: user.email,
        workspaceId: user.workspaceId,
        rememberMe,
        ipAddress,
      });

      return {
        user: this.sanitizeUser(user),
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: rememberMe ? '30d' : config.auth.jwtExpiresIn,
        },
      };

    } catch (error) {
      this.logger.error('Authentication failed', error, { email, ipAddress });
      throw error;
    }
  }

  // Get User Profile
  async getUserProfile(userId) {
    try {
      // Try cache first
      const cachedUser = await this.getCachedUser(userId);
      if (cachedUser) {
        return this.sanitizeUser(cachedUser);
      }

      // Get from database
      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      const user = await usersCollection.findOne(
        { _id: userId, status: { $ne: 'deleted' } },
        { projection: { password: 0 } }
      );

      if (!user) {
        throw new Error('User not found');
      }

      // Update last active
      await this.updateLastActive(userId);

      // Cache user
      await this.cacheUser(userId, user);

      return this.sanitizeUser(user);

    } catch (error) {
      this.logger.error('Failed to get user profile', error, { userId });
      throw error;
    }
  }

  // Update User Profile
  async updateUserProfile(userId, updates) {
    try {
      const allowedUpdates = [
        'firstName',
        'lastName',
        'displayName',
        'avatar',
        'preferences',
        'bio',
      ];

      const validUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          validUpdates[key] = value;
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        throw new Error('No valid updates provided');
      }

      // Validate updates
      if (validUpdates.firstName && (validUpdates.firstName.length < 1 || validUpdates.firstName.length > 50)) {
        throw new Error('First name must be between 1 and 50 characters');
      }

      if (validUpdates.lastName && (validUpdates.lastName.length < 1 || validUpdates.lastName.length > 50)) {
        throw new Error('Last name must be between 1 and 50 characters');
      }

      if (validUpdates.bio && validUpdates.bio.length > 500) {
        throw new Error('Bio must not exceed 500 characters');
      }

      validUpdates['metadata.updatedAt'] = new Date();

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      const result = await usersCollection.updateOne(
        { _id: userId, status: { $ne: 'deleted' } },
        { $set: validUpdates }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      this.logger.info('User profile updated', {
        userId,
        updatedFields: Object.keys(validUpdates),
      });

      // Return updated user
      return await this.getUserProfile(userId);

    } catch (error) {
      this.logger.error('Failed to update user profile', error, { userId });
      throw error;
    }
  }

  // Change Password
  async changePassword(userId, currentPassword, newPassword) {
    try {
      if (!newPassword || newPassword.length < 8) {
        throw new Error('New password must be at least 8 characters long');
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Get current user with password
      const user = await usersCollection.findOne({ _id: userId });
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      // Update password
      await usersCollection.updateOne(
        { _id: userId },
        {
          $set: {
            password: hashedNewPassword,
            'security.passwordChangedAt': new Date(),
            'metadata.updatedAt': new Date(),
          },
        }
      );

      // Invalidate all sessions except current
      await this.invalidateUserSessions(userId, { excludeCurrent: true });

      // Invalidate cache
      await this.invalidateUserCache(userId);

      this.logger.info('User password changed', { userId });

      return { success: true };

    } catch (error) {
      this.logger.error('Failed to change password', error, { userId });
      throw error;
    }
  }

  // Helper methods
  generateDisplayName(firstName, lastName, email) {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) {
      return firstName;
    }
    return email.split('@')[0];
  }

  sanitizeUser(user) {
    const sanitized = { ...user };
    delete sanitized.password;
    delete sanitized.security;
    
    return {
      id: sanitized._id,
      email: sanitized.email,
      firstName: sanitized.firstName,
      lastName: sanitized.lastName,
      displayName: sanitized.displayName,
      avatar: sanitized.avatar,
      role: sanitized.role,
      permissions: sanitized.permissions,
      status: sanitized.status,
      emailVerified: sanitized.emailVerified,
      workspaceId: sanitized.workspaceId,
      preferences: sanitized.preferences,
      metadata: {
        createdAt: sanitized.metadata.createdAt,
        lastLoginAt: sanitized.metadata.lastLoginAt,
        loginCount: sanitized.metadata.loginCount,
      },
    };
  }

  async recordFailedLogin(email, ipAddress, userId = null) {
    if (!userId) return;

    const db = this.mongoClient.getDb();
    const usersCollection = db.collection('users');

    const result = await usersCollection.updateOne(
      { _id: userId },
      {
        $inc: { 'security.failedLoginAttempts': 1 },
        $set: { 'metadata.updatedAt': new Date() },
      }
    );

    // Lock account if too many failed attempts
    if (result.modifiedCount > 0) {
      const user = await usersCollection.findOne({ _id: userId });
      if (user.security.failedLoginAttempts >= config.auth.maxLoginAttempts) {
        await usersCollection.updateOne(
          { _id: userId },
          {
            $set: {
              'security.lockedUntil': new Date(Date.now() + config.auth.lockoutDuration),
            },
          }
        );
      }
    }
  }

  async resetFailedLoginAttempts(userId) {
    const db = this.mongoClient.getDb();
    await db.collection('users').updateOne(
      { _id: userId },
      {
        $unset: {
          'security.failedLoginAttempts': '',
          'security.lockedUntil': '',
        },
      }
    );
  }

  async createRefreshToken(userId, longLived = false) {
    const token = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (longLived ? 30 : 7));

    const db = this.mongoClient.getDb();
    await db.collection('refresh_tokens').insertOne({
      token,
      userId,
      expiresAt,
      createdAt: new Date(),
    });

    return token;
  }

  async createSession(userId, sessionData) {
    const sessionId = uuidv4();
    const session = {
      _id: sessionId,
      userId,
      ...sessionData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + config.security.sessionCookieMaxAge),
    };

    const db = this.mongoClient.getDb();
    await db.collection('user_sessions').insertOne(session);

    return sessionId;
  }

  async updateLastActive(userId) {
    const db = this.mongoClient.getDb();
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { 'metadata.lastActiveAt': new Date() } }
    );
  }

  // Cache management
  async cacheUser(userId, user) {
    try {
      await this.redisClient.set(
        `user:${userId}`,
        user,
        config.performance.cacheExpiryMinutes * 60
      );
    } catch (error) {
      this.logger.warn('Failed to cache user', error, { userId });
    }
  }

  async getCachedUser(userId) {
    try {
      return await this.redisClient.get(`user:${userId}`);
    } catch (error) {
      this.logger.warn('Failed to get cached user', error, { userId });
      return null;
    }
  }

  async invalidateUserCache(userId) {
    try {
      await this.redisClient.del(`user:${userId}`);
    } catch (error) {
      this.logger.warn('Failed to invalidate user cache', error, { userId });
    }
  }

  async invalidateUserSessions(userId, options = {}) {
    const db = this.mongoClient.getDb();
    
    let query = { userId };
    if (options.excludeCurrent && options.currentSessionId) {
      query._id = { $ne: options.currentSessionId };
    }

    await db.collection('user_sessions').deleteMany(query);
  }

  // Email verification and password reset will be implemented in separate methods
  async sendEmailVerification(userId, email) {
    // Implementation for email verification
    this.logger.info('Email verification sent', { userId, email });
  }

  async createWorkspaceForUser(userId, workspaceName) {
    // This will be implemented when we create WorkspaceManager
    this.logger.info('Creating workspace for user', { userId, workspaceName });
    return null; // Temporary
  }

  async processInvitation(invitationToken, userId) {
    // This will be implemented when we create WorkspaceManager
    this.logger.info('Processing invitation', { invitationToken, userId });
    return null; // Temporary
  }

  // Health check
  healthCheck() {
    return {
      status: 'ok',
      features: {
        registration: config.security.allowSignup,
        emailVerification: config.security.requireEmailVerification,
        twoFactor: config.features.twoFactorAuth,
      },
    };
  }
}

export { UserManager };