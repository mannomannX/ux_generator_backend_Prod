// ==========================================
// SERVICES/API-GATEWAY/src/routes/auth.js
// ==========================================
import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { JWTUtils, Validators } from '@ux-flow/common';
import { asyncHandler, ValidationError, AuthenticationError } from '../middleware/error-handler.js';
import { authRateLimit, sensitiveOperationRateLimit } from '../middleware/rate-limit.js';
import { authMiddleware } from '../middleware/auth.js';
import { ComprehensiveValidator } from '../middleware/comprehensive-validation.js';
import { DatabaseTransactions } from '../utils/database-transactions.js';

const router = express.Router();
const validator = new ComprehensiveValidator();

// Apply auth rate limiting to all routes
router.use(authRateLimit);

// Register new user
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, firstName, lastName, workspaceName } = req.body;

  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  if (!Validators.isValidEmail(email)) {
    throw new ValidationError('Invalid email format');
  }

  // Validate password strength
  try {
    validator.validatePassword(password);
  } catch (error) {
    throw new ValidationError(error.message);
  }

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');
  const workspacesCollection = db.collection('workspaces');

  // Check if user already exists
  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) {
    throw new ValidationError('User with this email already exists');
  }

  // Hash password with configurable salt rounds
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 14;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create workspace for the user (if provided)
  let workspaceId = null;
  if (workspaceName) {
    const workspace = {
      name: workspaceName,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        allowGuestAccess: false,
        maxProjects: 10,
      },
    };

    const workspaceResult = await workspacesCollection.insertOne(workspace);
    workspaceId = workspaceResult.insertedId.toString();
  }

  // Create user
  const user = {
    email,
    password: hashedPassword,
    firstName: firstName || null,
    lastName: lastName || null,
    workspaceId,
    role: 'user',
    permissions: ['read_projects', 'write_projects', 'delete_own_projects'],
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  };

  const userResult = await usersCollection.insertOne(user);
  const userId = userResult.insertedId.toString();

  // Update workspace with owner info
  if (workspaceId) {
    await workspacesCollection.updateOne(
      { _id: workspaceResult.insertedId },
      { 
        $set: { 
          ownerId: userId,
          members: [{ userId, role: 'owner', joinedAt: new Date() }],
        }
      }
    );
  }

  // Generate JWT token
  const tokenPayload = {
    userId,
    email,
    workspaceId,
    role: user.role,
    permissions: user.permissions,
  };

  const token = JWTUtils.sign(tokenPayload);

  req.app.locals.logger.info('User registered successfully', {
    userId,
    email,
    workspaceId,
    correlationId: req.correlationId,
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: userId,
      email,
      firstName,
      lastName,
      workspaceId,
      role: user.role,
      emailVerified: false,
    },
    token,
    expiresIn: '7d',
  });
}));

// Login user
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  // Find user
  const user = await usersCollection.findOne({ email });
  
  // Timing-safe password verification
  let isValidPassword = false;
  if (user) {
    isValidPassword = await bcrypt.compare(password, user.password);
  } else {
    // Perform dummy comparison to prevent timing attacks
    await bcrypt.compare(password, '$2b$14$dummyhash1234567890123456789012345678901234567890');
  }
  
  if (!user || !isValidPassword) {
    // Generic error message to prevent user enumeration
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  await usersCollection.updateOne(
    { _id: user._id },
    { 
      $set: { 
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      }
    }
  );

  // Generate JWT token
  const tokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    workspaceId: user.workspaceId,
    role: user.role,
    permissions: user.permissions,
  };

  const token = JWTUtils.sign(tokenPayload);

  req.app.locals.logger.info('User logged in successfully', {
    userId: user._id.toString(),
    email,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Login successful',
    user: {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      workspaceId: user.workspaceId,
      role: user.role,
      emailVerified: user.emailVerified,
    },
    token,
    expiresIn: '7d',
  });
}));

// Refresh token
router.post('/refresh', authMiddleware, asyncHandler(async (req, res) => {
  const { userId, email, workspaceId, role, permissions } = req.user;

  // Extract the token from the authorization header
  const authHeader = req.headers.authorization;
  const currentToken = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  // Decode the token to check its expiry time
  const decodedToken = JWTUtils.verify(currentToken);
  if (!decodedToken) {
    throw new AuthenticationError('Invalid token for refresh');
  }

  // Check if the token is close to expiry (within refresh threshold)
  const now = Math.floor(Date.now() / 1000);
  const refreshThreshold = parseInt(process.env.JWT_REFRESH_THRESHOLD) || 86400; // 24 hours
  const timeUntilExpiry = decodedToken.exp - now;
  
  if (timeUntilExpiry > refreshThreshold) {
    return res.status(400).json({
      error: 'Token refresh not allowed',
      message: 'Token is not yet eligible for refresh',
      timeUntilRefresh: timeUntilExpiry - refreshThreshold,
      correlationId: req.correlationId,
    });
  }

  // Verify user still exists and is active
  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');
  const user = await usersCollection.findOne({
    _id: userId,
    status: { $ne: 'disabled' }
  });

  if (!user) {
    throw new AuthenticationError('User not found or disabled');
  }

  // Generate new token with fresh user data
  const tokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    workspaceId: user.workspaceId,
    role: user.role,
    permissions: user.permissions,
  };

  const token = JWTUtils.sign(tokenPayload);

  // Log token refresh for security monitoring
  req.app.locals.logger?.info('Token refreshed', {
    userId,
    previousExpiry: new Date(decodedToken.exp * 1000).toISOString(),
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Token refreshed successfully',
    token,
    expiresIn: '7d',
  });
}));

// Get current user profile
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  const user = await usersCollection.findOne(
    { _id: userId },
    { projection: { password: 0 } } // Exclude password
  );

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      workspaceId: user.workspaceId,
      role: user.role,
      permissions: user.permissions,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
}));

// Update user profile
router.patch('/me', authMiddleware, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { firstName, lastName } = req.body;

  const updateData = {
    updatedAt: new Date(),
  };

  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  const result = await usersCollection.updateOne(
    { _id: userId },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw new AuthenticationError('User not found');
  }

  req.app.locals.logger.info('User profile updated', {
    userId,
    updatedFields: Object.keys(updateData),
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Profile updated successfully',
  });
}));

// Change password with enhanced security
router.post('/change-password', authMiddleware, sensitiveOperationRateLimit, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters long');
  }

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');

  // Get current user
  const user = await usersCollection.findOne({ _id: userId });
  if (!user) {
    throw new AuthenticationError('User not found');
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password);
  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password with consistent salt rounds
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 14;
  const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await usersCollection.updateOne(
    { _id: userId },
    { 
      $set: { 
        password: hashedNewPassword,
        updatedAt: new Date(),
      }
    }
  );

  req.app.locals.logger.info('User password changed', {
    userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Password changed successfully',
  });
}));

// Logout with server-side token blacklisting
router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  const { userId, token, tokenExp } = req.user;
  
  // Get token blacklist service
  const { getTokenBlacklist } = await import('../middleware/auth.js');
  const tokenBlacklist = getTokenBlacklist();
  
  if (tokenBlacklist && token && tokenExp) {
    // Blacklist the current token
    await tokenBlacklist.blacklistToken(
      token, 
      userId, 
      tokenExp * 1000, // Convert to milliseconds
      'user_logout'
    );
  }

  req.app.locals.logger.info('User logged out and token blacklisted', {
    userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Logout successful',
  });
}));

// Logout all sessions (revoke all tokens)
router.post('/logout-all', authMiddleware, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  
  // Get token blacklist service
  const { getTokenBlacklist } = await import('../middleware/auth.js');
  const tokenBlacklist = getTokenBlacklist();
  
  let revokedCount = 0;
  if (tokenBlacklist) {
    // Revoke all tokens for this user
    revokedCount = await tokenBlacklist.revokeAllUserTokens(userId, 'logout_all_sessions');
  }

  req.app.locals.logger.info('All user sessions terminated', {
    userId,
    revokedCount,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'All sessions logged out successfully',
    sessionsRevoked: revokedCount,
  });
}));

export default router;