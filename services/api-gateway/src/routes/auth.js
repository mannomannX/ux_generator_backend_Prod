// ==========================================
// SERVICES/API-GATEWAY/src/routes/auth.js
// ==========================================
import express from 'express';
import bcrypt from 'bcrypt';
import { JWTUtils, Validators } from '@ux-flow/common';
import { asyncHandler, ValidationError, AuthenticationError } from '../middleware/error-handler.js';
import { authRateLimit } from '../middleware/rate-limit.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

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

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }

  const db = req.app.locals.mongoClient.getDb();
  const usersCollection = db.collection('users');
  const workspacesCollection = db.collection('workspaces');

  // Check if user already exists
  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) {
    throw new ValidationError('User with this email already exists');
  }

  // Hash password
  const saltRounds = 12;
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
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
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

  // Generate new token
  const tokenPayload = {
    userId,
    email,
    workspaceId,
    role,
    permissions,
  };

  const token = JWTUtils.sign(tokenPayload);

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

// Change password
router.post('/change-password', authMiddleware, asyncHandler(async (req, res) => {
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

  // Hash new password
  const saltRounds = 12;
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

// Logout (client-side token invalidation)
router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  req.app.locals.logger.info('User logged out', {
    userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Logout successful',
  });
}));

export default router;