// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/auth.js
// ==========================================
import express from 'express';
import rateLimit from 'express-rate-limit';
import { 
  validateSchema,
  userRegistrationSchema,
  userLoginSchema,
  changePasswordSchema,
  requireAuth,
  optionalAuth 
} from '@ux-flow/common';
import config from '../config/index.js';

const router = express.Router();

// Stricter rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please wait before trying again',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth rate limiting to sensitive endpoints
router.use('/login', authRateLimit);
router.use('/register', authRateLimit);
router.use('/forgot-password', authRateLimit);

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Check if registration is allowed
    if (!config.security.allowSignup) {
      return res.status(403).json({
        error: 'Registration is currently disabled',
        correlationId: req.correlationId,
      });
    }

    // Validate request body
    const validation = validateSchema(userRegistrationSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const { email, password, firstName, lastName, workspaceName, invitationToken } = validation.value;

    // Create user
    const user = await req.userManager.createUser({
      email,
      password,
      firstName,
      lastName,
      workspaceName,
      invitationToken,
    });

    // Authenticate user immediately after registration
    const authResult = await req.userManager.authenticateUser(email, password, {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: authResult.user,
      tokens: authResult.tokens,
      emailVerificationRequired: config.security.requireEmailVerification,
    });

  } catch (error) {
    if (error.message.includes('already exists')) {
      res.status(409).json({
        error: 'User already exists',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('Invalid') || error.message.includes('must be')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Registration failed',
        message: 'Unable to create user account',
        correlationId: req.correlationId,
      });
    }
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate request body
    const validation = validateSchema(userLoginSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const { email, password, rememberMe = false } = validation.value;

    // Authenticate user
    const authResult = await req.userManager.authenticateUser(email, password, {
      rememberMe,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Set secure cookie with refresh token
    res.cookie(config.security.sessionCookieName, authResult.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : config.security.sessionCookieMaxAge,
    });

    res.json({
      message: 'Login successful',
      user: authResult.user,
      accessToken: authResult.tokens.accessToken,
      expiresIn: authResult.tokens.expiresIn,
    });

  } catch (error) {
    if (error.message.includes('Invalid email or password')) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password',
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('locked')) {
      res.status(423).json({
        error: 'Account locked',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('verify your email')) {
      res.status(403).json({
        error: 'Email verification required',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Login failed',
        message: 'Unable to authenticate user',
        correlationId: req.correlationId,
      });
    }
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies[config.security.sessionCookieName] || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        correlationId: req.correlationId,
      });
    }

    const result = await req.userManager.refreshAccessToken(refreshToken);

    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });

  } catch (error) {
    res.status(401).json({
      error: 'Token refresh failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Logout user
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const refreshToken = req.cookies[config.security.sessionCookieName];
    
    if (refreshToken) {
      await req.userManager.revokeRefreshToken(refreshToken);
    }

    // Invalidate session
    await req.userManager.invalidateUserSessions(req.user.userId, { 
      currentSessionOnly: true 
    });

    // Clear cookie
    res.clearCookie(config.security.sessionCookieName);

    res.json({
      message: 'Logout successful',
    });

  } catch (error) {
    res.status(500).json({
      error: 'Logout failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get current user profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await req.userManager.getUserProfile(req.user.userId);
    
    res.json({
      user,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get user profile',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Update user profile
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const allowedUpdates = ['firstName', 'lastName', 'displayName', 'preferences', 'bio'];
    const updates = {};

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided',
        correlationId: req.correlationId,
      });
    }

    const updatedUser = await req.userManager.updateUserProfile(req.user.userId, updates);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (error) {
    if (error.message.includes('must be') || error.message.includes('exceed')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Profile update failed',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const validation = validateSchema(changePasswordSchema, req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const { currentPassword, newPassword } = validation.value;

    await req.userManager.changePassword(req.user.userId, currentPassword, newPassword);

    res.json({
      message: 'Password changed successfully',
    });

  } catch (error) {
    if (error.message.includes('Current password is incorrect')) {
      res.status(401).json({
        error: 'Current password incorrect',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('must be')) {
      res.status(400).json({
        error: 'Validation error',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Password change failed',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Send password reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        correlationId: req.correlationId,
      });
    }

    await req.userManager.sendPasswordReset(email);

    // Always return success to prevent email enumeration
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent',
    });

  } catch (error) {
    // Always return success to prevent email enumeration
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent',
    });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Token and new password are required',
        correlationId: req.correlationId,
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long',
        correlationId: req.correlationId,
      });
    }

    await req.userManager.resetPassword(token, newPassword);

    res.json({
      message: 'Password reset successfully',
    });

  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      res.status(400).json({
        error: 'Invalid or expired token',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Password reset failed',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Verify email address
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Verification token is required',
        correlationId: req.correlationId,
      });
    }

    await req.userManager.verifyEmail(token);

    res.json({
      message: 'Email verified successfully',
    });

  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      res.status(400).json({
        error: 'Invalid or expired token',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Email verification failed',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Resend email verification
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    await req.userManager.resendEmailVerification(req.user.userId);

    res.json({
      message: 'Verification email sent',
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to send verification email',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Check auth status
router.get('/status', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        authenticated: false,
      });
    }

    const user = await req.userManager.getUserProfile(req.user.userId);

    res.json({
      authenticated: true,
      user,
    });

  } catch (error) {
    res.json({
      authenticated: false,
    });
  }
});

// Get user sessions
router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await req.userManager.getUserSessions(req.user.userId);

    res.json({
      sessions,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Revoke all other sessions
router.post('/revoke-sessions', requireAuth, async (req, res) => {
  try {
    await req.userManager.invalidateUserSessions(req.user.userId, {
      excludeCurrent: true,
    });

    res.json({
      message: 'All other sessions revoked successfully',
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to revoke sessions',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

export default router;