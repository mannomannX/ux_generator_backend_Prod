// ==========================================
// SERVICES/USER-MANAGEMENT/src/config/index.js
// ==========================================
const config = {
  port: process.env.USER_MANAGEMENT_PORT || 3004,
  
  // Database Configuration
  database: {
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/ux-flow-engine',
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  },

  // Authentication Configuration
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshTokenExpiresIn: '30d',
    passwordResetExpiresIn: '1h',
    emailVerificationExpiresIn: '24h',
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
  },

  // Email Configuration
  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp', // smtp, sendgrid, mailgun
    smtp: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'UX-Flow-Engine',
      address: process.env.EMAIL_FROM_ADDRESS || 'noreply@ux-flow-engine.com',
    },
    templates: {
      welcomeEmail: true,
      emailVerification: true,
      passwordReset: true,
      workspaceInvitation: true,
    },
  },

  // Workspace Configuration
  workspace: {
    defaultSettings: {
      allowGuestAccess: false,
      maxProjects: 10,
      maxMembers: 5,
      allowProjectSharing: true,
      autoSave: true,
    },
    limits: {
      nameMinLength: 2,
      nameMaxLength: 50,
      descriptionMaxLength: 500,
      maxWorkspacesPerUser: 3,
    },
  },

  // User Configuration
  user: {
    defaultRole: 'user',
    defaultPermissions: [
      'read_projects',
      'write_projects',
      'delete_own_projects',
      'read_workspace',
      'invite_members',
    ],
    limits: {
      nameMinLength: 1,
      nameMaxLength: 50,
      bioMaxLength: 500,
    },
    avatar: {
      maxSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif'],
    },
  },

  // Security Configuration
  security: {
    bcryptRounds: 12,
    sessionCookieName: 'ux-flow-session',
    sessionCookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    csrfProtection: process.env.NODE_ENV === 'production',
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    allowSignup: process.env.ALLOW_SIGNUP !== 'false',
  },

  // Rate Limiting Configuration
  rateLimit: {
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
    },
    api: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window
    },
    workspace: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // 10 workspace operations per hour
    },
  },

  // GDPR Compliance Configuration
  gdpr: {
    dataRetentionDays: 365 * 2, // 2 years
    automaticDeletion: true,
    exportFormats: ['json', 'csv'],
    anonymizationDelay: 30, // Days before anonymization
  },

  // Feature Flags
  features: {
    socialLogin: process.env.ENABLE_SOCIAL_LOGIN === 'true',
    twoFactorAuth: process.env.ENABLE_2FA === 'true',
    workspaceAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    auditLog: process.env.ENABLE_AUDIT_LOG === 'true',
    apiKeys: process.env.ENABLE_API_KEYS === 'true',
  },

  // External Services
  external: {
    gravatar: {
      enabled: true,
      defaultImage: 'identicon',
    },
    analytics: {
      provider: process.env.ANALYTICS_PROVIDER, // mixpanel, amplitude
      apiKey: process.env.ANALYTICS_API_KEY,
    },
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    structuredFormat: process.env.NODE_ENV === 'production',
    auditEvents: [
      'user_created',
      'user_deleted',
      'workspace_created',
      'workspace_deleted',
      'member_added',
      'member_removed',
      'role_changed',
      'permission_changed',
    ],
  },

  // Performance Configuration
  performance: {
    enableCaching: true,
    cacheExpiryMinutes: 15,
    batchOperations: true,
    maxBatchSize: 100,
  },
};

export default config;