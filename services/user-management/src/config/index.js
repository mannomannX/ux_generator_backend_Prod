// ==========================================
// SERVICES/USER-MANAGEMENT/src/config/index.js
// ==========================================

import crypto from 'crypto';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables in production
const validateEnvironment = () => {
  if (process.env.NODE_ENV === 'production') {
    const required = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET', 
      'ENCRYPTION_KEY',
      'MONGODB_URI',
      'REDIS_URL',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASSWORD'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Validate secret lengths
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters');
    }
  }
};

validateEnvironment();

// Generate secure secrets for development
const getSecureSecret = (envVar, minLength = 32) => {
  if (process.env[envVar]) {
    return process.env[envVar];
  }
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envVar} must be set in production`);
  }
  
  // Generate random secret for development
  return crypto.randomBytes(minLength).toString('hex');
};

const config = {
  port: process.env.USER_MANAGEMENT_PORT || 3004,
  environment: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  database: {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    mongoOptions: {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      w: 'majority'
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 1,
      keyPrefix: 'user:',
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true
    }
  },

  // Authentication Configuration
  auth: {
    jwtSecret: getSecureSecret('JWT_SECRET'),
    jwtRefreshSecret: getSecureSecret('JWT_REFRESH_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    passwordResetExpiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || '1h',
    emailVerificationExpiresIn: process.env.EMAIL_VERIFICATION_EXPIRES_IN || '24h',
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 15 * 60 * 1000, // 15 minutes
    jwtAlgorithm: process.env.JWT_ALGORITHM || 'HS512',
    jwtIssuer: process.env.JWT_ISSUER || 'ux-flow-engine',
    jwtAudience: process.env.JWT_AUDIENCE || 'ux-flow-users',
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutes
    rememberMeDuration: parseInt(process.env.REMEMBER_ME_DURATION) || 30 * 24 * 60 * 60 * 1000, // 30 days
    
    // Enhanced password policy
    passwordPolicy: {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
      maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      bcryptRounds: 12, // Increased from default 10
      preventReuse: 5, // Prevent reuse of last 5 passwords
      expiryDays: 90 // Password expires after 90 days
    },
    
    // Session configuration
    session: {
      maxConcurrent: 5,
      timeout: 86400000, // 24 hours
      extendOnActivity: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    },
    
    // MFA configuration
    mfa: {
      enabled: process.env.MFA_ENABLED === 'true',
      issuer: 'UX Flow Engine',
      window: 1,
      backupCodesCount: 10
    }
  },

  // Email Configuration
  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp',
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'UX-Flow-Engine',
      address: process.env.EMAIL_FROM_ADDRESS || 'noreply@ux-flow-engine.com'
    },
    replyTo: process.env.EMAIL_REPLY_TO || 'support@ux-flow-engine.com',
    templates: {
      welcomeEmail: true,
      emailVerification: true,
      passwordReset: true,
      workspaceInvitation: true,
      accountLocked: true,
      suspiciousActivity: true,
      passwordExpiry: true
    },
    rateLimit: {
      maxPerHour: 10,
      maxPerDay: 50
    }
  },

  // Workspace Configuration
  workspace: {
    maxWorkspacesPerUser: {
      free: 1,
      basic: 3,
      pro: 10,
      enterprise: -1 // unlimited
    },
    maxMembersPerWorkspace: {
      free: 3,
      basic: 10,
      pro: 50,
      enterprise: -1 // unlimited
    },
    maxProjectsPerWorkspace: {
      free: 5,
      basic: 20,
      pro: 100,
      enterprise: -1 // unlimited
    },
    storageQuota: {
      free: 100 * 1024 * 1024, // 100MB
      basic: 1024 * 1024 * 1024, // 1GB
      pro: 10 * 1024 * 1024 * 1024, // 10GB
      enterprise: -1 // unlimited
    },
    roles: ['owner', 'admin', 'editor', 'viewer'],
    permissions: {
      owner: ['*'],
      admin: ['manage_members', 'manage_projects', 'manage_settings', 'view_billing'],
      editor: ['create_projects', 'edit_projects', 'delete_own_projects'],
      viewer: ['view_projects']
    }
  },

  // User Configuration
  user: {
    defaultPlan: 'free',
    plans: ['free', 'basic', 'pro', 'enterprise'],
    profileImageMaxSize: 5 * 1024 * 1024, // 5MB
    allowedImageFormats: ['image/jpeg', 'image/png', 'image/gif'],
    maxApiKeysPerUser: {
      free: 1,
      basic: 3,
      pro: 10,
      enterprise: -1 // unlimited
    }
  },

  // Security Configuration
  security: {
    encryption: {
      algorithm: 'aes-256-gcm',
      key: getSecureSecret('ENCRYPTION_KEY', 32),
      ivLength: 16,
      tagLength: 16,
      saltRounds: 12
    },
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.ALLOWED_ORIGINS?.split(',') || ['https://app.uxflow.com'])
        : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
      maxAge: 86400
    },
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    },
    rateLimit: {
      auth: {
        register: { windowMs: 3600000, max: 5 },
        login: { windowMs: 900000, max: 5 },
        passwordReset: { windowMs: 3600000, max: 3 },
        emailVerification: { windowMs: 3600000, max: 5 }
      },
      api: {
        default: { windowMs: 60000, max: 100 },
        workspace: { windowMs: 60000, max: 50 },
        invitation: { windowMs: 3600000, max: 20 }
      }
    }
  },

  // OAuth Configuration
  oauth: {
    google: {
      enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
      scope: ['profile', 'email']
    },
    github: {
      enabled: process.env.GITHUB_OAUTH_ENABLED === 'true',
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackUrl: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback',
      scope: ['user:email']
    },
    microsoft: {
      enabled: process.env.MICROSOFT_OAUTH_ENABLED === 'true',
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL || '/auth/microsoft/callback',
      scope: ['openid', 'profile', 'email']
    }
  },

  // SSO Configuration
  sso: {
    enabled: process.env.SSO_ENABLED === 'true',
    saml: {
      enabled: process.env.SAML_ENABLED === 'true',
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER,
      cert: process.env.SAML_CERT,
      privateKey: process.env.SAML_PRIVATE_KEY
    }
  },

  // Audit Configuration
  audit: {
    enabled: process.env.AUDIT_ENABLED !== 'false',
    retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS) || 90,
    events: [
      'user.created',
      'user.updated',
      'user.deleted',
      'user.login',
      'user.logout',
      'user.password_changed',
      'user.mfa_enabled',
      'user.mfa_disabled',
      'workspace.created',
      'workspace.updated',
      'workspace.deleted',
      'workspace.member_added',
      'workspace.member_removed',
      'workspace.role_changed',
      'security.suspicious_activity',
      'security.account_locked',
      'security.password_reset'
    ]
  },

  // Feature Flags
  features: {
    registration: process.env.FEATURE_REGISTRATION !== 'false',
    emailVerification: process.env.FEATURE_EMAIL_VERIFICATION !== 'false',
    passwordReset: process.env.FEATURE_PASSWORD_RESET !== 'false',
    mfa: process.env.FEATURE_MFA === 'true',
    oauth: process.env.FEATURE_OAUTH === 'true',
    teams: process.env.FEATURE_TEAMS === 'true',
    sso: process.env.FEATURE_SSO === 'true',
    apiKeys: process.env.FEATURE_API_KEYS === 'true',
    workspaces: process.env.FEATURE_WORKSPACES !== 'false'
  },

  // Monitoring Configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT) || 9091,
    healthCheckInterval: 30000,
    metrics: {
      registrations: true,
      logins: true,
      activeUsers: true,
      workspaces: true,
      errors: true
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || false,
    maxSize: '10m',
    maxFiles: 5,
    sensitive: {
      mask: ['password', 'token', 'secret', 'key', 'authorization', 'creditCard'],
      exclude: ['user_id', 'workspace_id', 'correlation_id']
    }
  },

  // Validation Configuration
  validation: {
    username: {
      minLength: 3,
      maxLength: 30,
      pattern: /^[a-zA-Z0-9_-]+$/,
      reserved: ['admin', 'root', 'api', 'www', 'mail', 'support', 'help', 'about']
    },
    email: {
      maxLength: 255,
      domainBlacklist: ['tempmail.com', 'throwaway.email', 'guerrillamail.com']
    },
    workspace: {
      nameMinLength: 2,
      nameMaxLength: 100,
      descriptionMaxLength: 500
    }
  }
};

export default config;