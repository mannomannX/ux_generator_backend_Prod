// ==========================================
// SERVICES/USER-MANAGEMENT/src/auth/oauth-strategies.js
// ==========================================

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { JWTUtils } from '@ux-flow/common';
// SECURITY FIX: Import crypto for state generation
import crypto from 'crypto';

export class OAuthStrategies {
  constructor(logger, userManager, workspaceManager, redisClient) {
    this.logger = logger;
    this.userManager = userManager;
    this.workspaceManager = workspaceManager;
    this.jwtUtils = new JWTUtils(logger);
    this.redisClient = redisClient;
    
    // SECURITY FIX: OAuth state management
    this.stateCache = new Map();
    this.stateTTL = 600; // 10 minutes
    
    // SECURITY FIX: Allowed redirect domains
    this.allowedRedirectDomains = [
      'localhost',
      '127.0.0.1',
      process.env.FRONTEND_DOMAIN || 'app.uxflow.com'
    ].filter(Boolean);
  }

  /**
   * Initialize OAuth strategies
   */
  initialize() {
    this.setupGoogleStrategy();
    this.setupGitHubStrategy();
    this.setupSerialization();
  }

  /**
   * Setup Google OAuth strategy
   */
  setupGoogleStrategy() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      this.logger.warn('Google OAuth not configured - missing credentials');
      return;
    }

    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || 'http://localhost:3004'}/api/v1/auth/google/callback`,
      // SECURITY FIX: Minimal necessary scopes only
      scope: ['openid', 'profile', 'email'],
      // SECURITY FIX: Enable state parameter for CSRF protection
      state: true,
      // SECURITY FIX: Additional security options
      skipUserProfile: false,
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        // SECURITY FIX: Validate state parameter to prevent CSRF
        if (!await this.validateOAuthState(req.query.state, req.sessionID)) {
          return done(new Error('Invalid OAuth state parameter'), null);
        }
        
        // SECURITY FIX: Validate email is verified
        const primaryEmail = profile.emails?.find(email => email.verified) || profile.emails?.[0];
        if (!primaryEmail || !primaryEmail.value) {
          return done(new Error('No verified email found'), null);
        }
        
        const userData = {
          googleId: profile.id,
          email: primaryEmail.value,
          name: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          avatar: profile.photos?.[0]?.value,
          provider: 'google',
          // SECURITY FIX: Add security metadata
          emailVerified: primaryEmail.verified || false,
          oauthVerifiedAt: new Date().toISOString(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const user = await this.findOrCreateUser(userData, req);
        done(null, user);
      } catch (error) {
        this.logger.error('Google OAuth error', error);
        done(error, null);
      }
    }));

    this.logger.info('Google OAuth strategy initialized');
  }

  /**
   * Setup GitHub OAuth strategy
   */
  setupGitHubStrategy() {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      this.logger.warn('GitHub OAuth not configured - missing credentials');
      return;
    }

    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || 'http://localhost:3004'}/api/v1/auth/github/callback`,
      // SECURITY FIX: Minimal necessary scopes only
      scope: ['user:email'],
      // SECURITY FIX: Enable state parameter for CSRF protection
      state: true,
      // SECURITY FIX: Additional security options
      passReqToCallback: true
    }, async (req, accessToken, refreshToken, profile, done) => {
      try {
        // SECURITY FIX: Validate state parameter to prevent CSRF
        if (!await this.validateOAuthState(req.query.state, req.sessionID)) {
          return done(new Error('Invalid OAuth state parameter'), null);
        }
        
        // SECURITY FIX: Validate email exists and is verified
        const primaryEmail = profile.emails?.find(email => email.primary && email.verified) || profile.emails?.[0];
        if (!primaryEmail?.value) {
          return done(new Error('No verified email found'), null);
        }
        
        const userData = {
          githubId: profile.id,
          email: primaryEmail.value,
          name: profile.displayName || profile.username,
          username: profile.username,
          avatar: profile.photos?.[0]?.value,
          provider: 'github',
          bio: profile._json?.bio,
          company: profile._json?.company,
          // SECURITY FIX: Add security metadata
          emailVerified: primaryEmail.verified || false,
          oauthVerifiedAt: new Date().toISOString(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const user = await this.findOrCreateUser(userData, req);
        done(null, user);
      } catch (error) {
        this.logger.error('GitHub OAuth error', error);
        done(error, null);
      }
    }));

    this.logger.info('GitHub OAuth strategy initialized');
  }

  /**
   * Setup passport serialization
   */
  setupSerialization() {
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await this.userManager.getUserById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
  }

  /**
   * Find or create user from OAuth data
   */
  async findOrCreateUser(oauthData) {
    try {
      const db = this.userManager.mongoClient.getDb();
      
      // Try to find existing user
      let user = await db.collection('users').findOne({
        $or: [
          { email: oauthData.email },
          { [`oauth.${oauthData.provider}.id`]: oauthData[`${oauthData.provider}Id`] },
        ],
      });

      if (user) {
        // Update OAuth info
        await db.collection('users').updateOne(
          { _id: user._id },
          {
            $set: {
              [`oauth.${oauthData.provider}`]: {
                id: oauthData[`${oauthData.provider}Id`],
                avatar: oauthData.avatar,
                username: oauthData.username,
                lastLogin: new Date(),
              },
              lastLogin: new Date(),
            },
          }
        );

        this.logger.info('OAuth user logged in', { 
          userId: user._id,
          provider: oauthData.provider 
        });

        return user;
      }

      // Create new user
      const newUser = {
        email: oauthData.email,
        name: oauthData.name,
        firstName: oauthData.firstName,
        lastName: oauthData.lastName,
        avatar: oauthData.avatar,
        username: oauthData.username || oauthData.email.split('@')[0],
        role: 'user',
        status: 'active',
        emailVerified: true, // OAuth users are pre-verified
        oauth: {
          [oauthData.provider]: {
            id: oauthData[`${oauthData.provider}Id`],
            avatar: oauthData.avatar,
            username: oauthData.username,
            lastLogin: new Date(),
          },
        },
        settings: {
          notifications: {
            email: true,
            inApp: true,
          },
          theme: 'light',
          language: 'en',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: new Date(),
      };

      const result = await db.collection('users').insertOne(newUser);
      newUser._id = result.insertedId;

      // Create default workspace for new user
      const workspace = await this.workspaceManager.createWorkspace({
        name: `${oauthData.name}'s Workspace`,
        description: 'Personal workspace',
        ownerId: newUser._id.toString(),
      });

      // Update user with workspace
      await db.collection('users').updateOne(
        { _id: newUser._id },
        { $set: { workspaceId: workspace.id } }
      );

      this.logger.info('OAuth user created', { 
        userId: newUser._id,
        provider: oauthData.provider,
        workspaceId: workspace.id 
      });

      return newUser;
    } catch (error) {
      this.logger.error('Failed to find or create OAuth user', error);
      throw error;
    }
  }

  /**
   * Generate JWT tokens for OAuth user
   */
  async generateTokens(user) {
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
    };

    const accessToken = this.jwtUtils.generateToken(payload);
    const refreshToken = this.jwtUtils.generateRefreshToken(payload);

    // Store refresh token
    await this.userManager.storeRefreshToken(user._id.toString(), refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        workspaceId: user.workspaceId,
      },
    };
  }
  
  // SECURITY FIX: New security methods
  
  /**
   * Generate OAuth state parameter for CSRF protection
   */
  generateOAuthState(sessionId) {
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state with session ID and TTL
    const stateData = {
      sessionId,
      createdAt: Date.now(),
      expires: Date.now() + (this.stateTTL * 1000)
    };
    
    this.stateCache.set(state, stateData);
    
    // Clean up expired states
    this.cleanupExpiredStates();
    
    return state;
  }
  
  /**
   * Validate OAuth state parameter
   */
  async validateOAuthState(state, sessionId) {
    if (!state || !sessionId) {
      return false;
    }
    
    const stateData = this.stateCache.get(state);
    
    if (!stateData) {
      this.logger.warn('OAuth state not found', { state: state.substring(0, 8) + '...' });
      return false;
    }
    
    // Check if state has expired
    if (Date.now() > stateData.expires) {
      this.stateCache.delete(state);
      this.logger.warn('OAuth state expired', { state: state.substring(0, 8) + '...' });
      return false;
    }
    
    // Validate session ID matches
    if (stateData.sessionId !== sessionId) {
      this.logger.warn('OAuth state session mismatch', { 
        state: state.substring(0, 8) + '...',
        expectedSession: stateData.sessionId,
        actualSession: sessionId
      });
      return false;
    }
    
    // Remove used state to prevent replay
    this.stateCache.delete(state);
    
    return true;
  }
  
  /**
   * Validate redirect URL to prevent open redirect attacks
   */
  validateRedirectUrl(redirectUrl) {
    if (!redirectUrl) {
      return false;
    }
    
    try {
      const url = new URL(redirectUrl);
      
      // Only allow https in production
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        return false;
      }
      
      // Check if domain is in allowed list
      const hostname = url.hostname.toLowerCase();
      return this.allowedRedirectDomains.some(domain => {
        return hostname === domain || hostname.endsWith('.' + domain);
      });
      
    } catch (error) {
      this.logger.warn('Invalid redirect URL format', { redirectUrl });
      return false;
    }
  }
  
  /**
   * Clean up expired OAuth states
   */
  cleanupExpiredStates() {
    const now = Date.now();
    
    for (const [state, data] of this.stateCache.entries()) {
      if (now > data.expires) {
        this.stateCache.delete(state);
      }
    }
  }
  
  /**
   * Enhanced find or create user with security validations
   */
  async findOrCreateUser(oauthData, req) {
    try {
      // SECURITY FIX: Validate redirect URL if provided
      const redirectUrl = req.query.redirect_uri || req.session?.redirectUrl;
      if (redirectUrl && !this.validateRedirectUrl(redirectUrl)) {
        throw new Error('Invalid redirect URL');
      }
      
      // SECURITY FIX: Rate limiting for OAuth attempts
      const clientId = req.ip + ':' + req.get('User-Agent');
      if (await this.isRateLimited(clientId)) {
        throw new Error('Too many OAuth attempts. Please try again later.');
      }
      
      const db = this.userManager.mongoClient.getDb();
      
      // Try to find existing user
      let user = await db.collection('users').findOne({
        $or: [
          { email: oauthData.email },
          { [`oauth.${oauthData.provider}.id`]: oauthData[`${oauthData.provider}Id`] },
        ],
      });

      if (user) {
        // SECURITY FIX: Log OAuth login for audit
        await this.logOAuthEvent('LOGIN', {
          userId: user._id,
          provider: oauthData.provider,
          email: oauthData.email,
          ipAddress: oauthData.ipAddress,
          userAgent: oauthData.userAgent
        });
        
        // Update OAuth info with security metadata
        await db.collection('users').updateOne(
          { _id: user._id },
          {
            $set: {
              [`oauth.${oauthData.provider}`]: {
                id: oauthData[`${oauthData.provider}Id`],
                avatar: oauthData.avatar,
                username: oauthData.username,
                lastLogin: new Date(),
                emailVerified: oauthData.emailVerified,
                oauthVerifiedAt: oauthData.oauthVerifiedAt
              },
              lastLogin: new Date(),
              lastLoginIP: oauthData.ipAddress
            },
          }
        );

        return user;
      }

      // SECURITY FIX: Enhanced new user creation with security metadata
      const newUser = {
        email: oauthData.email,
        name: oauthData.name,
        firstName: oauthData.firstName,
        lastName: oauthData.lastName,
        avatar: oauthData.avatar,
        username: oauthData.username || oauthData.email.split('@')[0],
        role: 'user',
        status: 'active',
        emailVerified: oauthData.emailVerified,
        oauth: {
          [oauthData.provider]: {
            id: oauthData[`${oauthData.provider}Id`],
            avatar: oauthData.avatar,
            username: oauthData.username,
            lastLogin: new Date(),
            emailVerified: oauthData.emailVerified,
            oauthVerifiedAt: oauthData.oauthVerifiedAt
          },
        },
        // SECURITY FIX: Add security metadata
        registrationIP: oauthData.ipAddress,
        registrationUserAgent: oauthData.userAgent,
        settings: {
          notifications: {
            email: true,
            inApp: true,
          },
          theme: 'light',
          language: 'en',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: new Date(),
        lastLoginIP: oauthData.ipAddress
      };

      const result = await db.collection('users').insertOne(newUser);
      newUser._id = result.insertedId;

      // Create default workspace for new user
      const workspace = await this.workspaceManager.createWorkspace({
        name: `${oauthData.name}'s Workspace`,
        description: 'Personal workspace',
        ownerId: newUser._id.toString(),
      });

      // Update user with workspace
      await db.collection('users').updateOne(
        { _id: newUser._id },
        { $set: { workspaceId: workspace.id } }
      );

      // SECURITY FIX: Log OAuth registration for audit
      await this.logOAuthEvent('REGISTRATION', {
        userId: newUser._id,
        provider: oauthData.provider,
        email: oauthData.email,
        ipAddress: oauthData.ipAddress,
        userAgent: oauthData.userAgent,
        workspaceId: workspace.id
      });

      return newUser;
    } catch (error) {
      this.logger.error('Failed to find or create OAuth user', error);
      throw error;
    }
  }
  
  /**
   * Check if client is rate limited
   */
  async isRateLimited(clientId) {
    if (!this.redisClient) {
      return false; // Skip rate limiting if Redis unavailable
    }
    
    try {
      const key = `oauth_rate_limit:${clientId}`;
      const attempts = await this.redisClient.get(key);
      
      if (attempts && parseInt(attempts) >= 10) { // 10 attempts per hour
        return true;
      }
      
      // Increment counter
      await this.redisClient.incr(key);
      await this.redisClient.expire(key, 3600); // 1 hour
      
      return false;
    } catch (error) {
      this.logger.error('Rate limit check failed', error);
      return false; // Fail open
    }
  }
  
  /**
   * Log OAuth security events
   */
  async logOAuthEvent(event, data) {
    try {
      if (this.userManager.mongoClient) {
        const db = this.userManager.mongoClient.getDb();
        await db.collection('oauth_events').insertOne({
          event,
          data,
          timestamp: new Date(),
        });
      }
      
      this.logger.info(`OAuth Event: ${event}`, data);
    } catch (error) {
      this.logger.error('Failed to log OAuth event', error);
    }
  }
}

export default OAuthStrategies;