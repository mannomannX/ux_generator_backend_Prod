// ==========================================
// SERVICES/USER-MANAGEMENT/src/auth/oauth-strategies.js
// ==========================================

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { JWTUtils } from '@ux-flow/common';

export class OAuthStrategies {
  constructor(logger, userManager, workspaceManager) {
    this.logger = logger;
    this.userManager = userManager;
    this.workspaceManager = workspaceManager;
    this.jwtUtils = new JWTUtils(logger);
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
      scope: ['profile', 'email'],
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const userData = {
          googleId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          avatar: profile.photos[0]?.value,
          provider: 'google',
        };

        const user = await this.findOrCreateUser(userData);
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
      scope: ['user:email'],
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const userData = {
          githubId: profile.id,
          email: profile.emails?.[0]?.value || `${profile.username}@github.local`,
          name: profile.displayName || profile.username,
          username: profile.username,
          avatar: profile.photos[0]?.value,
          provider: 'github',
          bio: profile._json.bio,
          company: profile._json.company,
        };

        const user = await this.findOrCreateUser(userData);
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
}

export default OAuthStrategies;