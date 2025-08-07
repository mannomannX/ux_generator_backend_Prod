/**
 * OAuth Providers Service
 * Implements Google, GitHub, and Microsoft OAuth integration
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';

export class OAuthService {
  constructor(mongoClient, logger) {
    this.mongoClient = mongoClient;
    this.logger = logger;
    
    this.providers = {
      google: {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
        scope: ['profile', 'email']
      },
      github: {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback',
        scope: ['user:email']
      },
      microsoft: {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
        scope: ['user.read']
      }
    };
    
    this.initializeStrategies();
  }

  initializeStrategies() {
    // Google OAuth Strategy
    if (this.providers.google.clientID) {
      passport.use(new GoogleStrategy(
        this.providers.google,
        this.handleOAuthCallback.bind(this, 'google')
      ));
    }

    // GitHub OAuth Strategy
    if (this.providers.github.clientID) {
      passport.use(new GitHubStrategy(
        this.providers.github,
        this.handleOAuthCallback.bind(this, 'github')
      ));
    }

    // Microsoft OAuth Strategy
    if (this.providers.microsoft.clientID) {
      passport.use(new MicrosoftStrategy(
        this.providers.microsoft,
        this.handleOAuthCallback.bind(this, 'microsoft')
      ));
    }

    // Serialize/Deserialize user
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const db = this.mongoClient.getDb();
        const user = await db.collection('users').findOne({ _id: id });
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });
  }

  async handleOAuthCallback(provider, accessToken, refreshToken, profile, done) {
    try {
      const db = this.mongoClient.getDb();
      
      // Extract user data from profile
      const userData = this.extractUserData(provider, profile);
      
      // Find or create user
      let user = await db.collection('users').findOne({
        $or: [
          { [`oauth.${provider}.id`]: userData.providerId },
          { email: userData.email }
        ]
      });

      if (user) {
        // Update existing user with OAuth info
        await db.collection('users').updateOne(
          { _id: user._id },
          {
            $set: {
              [`oauth.${provider}`]: {
                id: userData.providerId,
                accessToken,
                refreshToken,
                profile: userData.profile,
                lastLogin: new Date()
              },
              lastLoginAt: new Date()
            }
          }
        );
      } else {
        // Create new user
        const newUser = {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          displayName: userData.displayName,
          avatar: userData.avatar,
          emailVerified: true,
          oauth: {
            [provider]: {
              id: userData.providerId,
              accessToken,
              refreshToken,
              profile: userData.profile,
              lastLogin: new Date()
            }
          },
          role: 'user',
          permissions: ['read_projects', 'write_projects'],
          createdAt: new Date(),
          lastLoginAt: new Date()
        };
        
        const result = await db.collection('users').insertOne(newUser);
        user = { ...newUser, _id: result.insertedId };
      }

      this.logger.info('OAuth login successful', {
        provider,
        userId: user._id,
        email: user.email
      });

      done(null, user);
    } catch (error) {
      this.logger.error('OAuth callback error', {
        provider,
        error: error.message
      });
      done(error, null);
    }
  }

  extractUserData(provider, profile) {
    switch (provider) {
      case 'google':
        return {
          providerId: profile.id,
          email: profile.emails[0].value,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          displayName: profile.displayName,
          avatar: profile.photos[0]?.value,
          profile: {
            locale: profile._json.locale,
            verified: profile._json.email_verified
          }
        };
      
      case 'github':
        return {
          providerId: profile.id,
          email: profile.emails[0]?.value || `${profile.username}@github.local`,
          firstName: profile.displayName?.split(' ')[0] || profile.username,
          lastName: profile.displayName?.split(' ').slice(1).join(' ') || '',
          displayName: profile.displayName || profile.username,
          avatar: profile.photos[0]?.value,
          profile: {
            username: profile.username,
            company: profile._json.company,
            location: profile._json.location,
            bio: profile._json.bio
          }
        };
      
      case 'microsoft':
        return {
          providerId: profile.id,
          email: profile.emails[0].value,
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          displayName: profile.displayName,
          avatar: null,
          profile: {
            tenant: profile._json.tid
          }
        };
      
      default:
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }
  }

  async unlinkProvider(userId, provider) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('users').updateOne(
        { _id: userId },
        {
          $unset: {
            [`oauth.${provider}`]: ''
          }
        }
      );

      this.logger.info('OAuth provider unlinked', { userId, provider });
      
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to unlink OAuth provider', {
        userId,
        provider,
        error: error.message
      });
      throw error;
    }
  }

  getAuthUrl(provider) {
    const providerConfig = this.providers[provider];
    if (!providerConfig) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }

    // Generate OAuth URL based on provider
    switch (provider) {
      case 'google':
        return `/auth/google`;
      case 'github':
        return `/auth/github`;
      case 'microsoft':
        return `/auth/microsoft`;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

export default OAuthService;