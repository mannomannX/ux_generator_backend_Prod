// ==========================================
// SERVICES/USER-MANAGEMENT/src/services/user-manager.js
// ==========================================
import bcrypt from 'bcrypt';
import { MongoClient, JWTUtils, Validators } from '@ux-flow/common';

class UserManager {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // User cache TTL (5 minutes)
    this.userCacheTTL = 300;
  }

  async createUser(userData) {
    try {
      const { email, password, firstName, lastName } = userData;

      // Validate email uniqueness
      const existingUser = await this.getUserByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user document
      const user = {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        workspaceId: null, // Will be set when user joins/creates workspace
        role: 'user',
        permissions: [
          'read_projects',
          'write_projects', 
          'delete_own_projects',
          'manage_own_profile'
        ],
        emailVerified: false,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: null,
        metadata: {
          registrationIP: null, // Could be added from request
          userAgent: null,
        },
      };

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');
      
      const result = await usersCollection.insertOne(user);
      const userId = result.insertedId.toString();

      // Cache the user
      await this.cacheUser(userId, { ...user, id: userId, _id: undefined });

      this.logger.info('User created successfully', {
        userId,
        email: user.email,
      });

      return {
        id: userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        workspaceId: user.workspaceId,
        role: user.role,
        permissions: user.permissions,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt,
      };

    } catch (error) {
      this.logger.error('Failed to create user', error, { email: userData.email });
      throw error;
    }
  }

  async getUserByEmail(email) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      // Try cache first
      const cacheKey = `user:email:${normalizedEmail}`;
      const cachedUser = await this.getCachedData(cacheKey);
      if (cachedUser) {
        return cachedUser;
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');
      
      const user = await usersCollection.findOne({ 
        email: normalizedEmail,
        status: { $ne: 'deleted' }
      });

      if (!user) {
        return null;
      }

      const formattedUser = {
        id: user._id.toString(),
        email: user.email,
        password: user.password, // Keep for authentication
        firstName: user.firstName,
        lastName: user.lastName,
        workspaceId: user.workspaceId,
        role: user.role,
        permissions: user.permissions,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      };

      // Cache the user
      await this.cacheUser(formattedUser.id, formattedUser);
      await this.setCachedData(cacheKey, formattedUser, this.userCacheTTL);

      return formattedUser;

    } catch (error) {
      this.logger.error('Failed to get user by email', error, { email });
      throw error;
    }
  }

  async getUser(userId) {
    try {
      if (!Validators.isValidObjectId(userId)) {
        return null;
      }

      // Try cache first
      const cachedUser = await this.getCachedUser(userId);
      if (cachedUser) {
        return cachedUser;
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');
      
      const user = await usersCollection.findOne({ 
        _id: MongoClient.createObjectId(userId),
        status: { $ne: 'deleted' }
      });

      if (!user) {
        return null;
      }

      const formattedUser = {
        id: user._id.toString(),
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName,
        workspaceId: user.workspaceId,
        role: user.role,
        permissions: user.permissions,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      };

      // Cache the user
      await this.cacheUser(userId, formattedUser);

      return formattedUser;

    } catch (error) {
      this.logger.error('Failed to get user', error, { userId });
      throw error;
    }
  }

  async getUsers(options = {}) {
    try {
      const { page = 1, limit = 50, filters = {} } = options;
      
      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Build query
      const query = { status: { $ne: 'deleted' } };

      if (filters.search) {
        query.$or = [
          { email: { $regex: filters.search, $options: 'i' } },
          { firstName: { $regex: filters.search, $options: 'i' } },
          { lastName: { $regex: filters.search, $options: 'i' } },
        ];
      }

      if (filters.role) {
        query.role = filters.role;
      }

      if (filters.workspaceId) {
        query.workspaceId = filters.workspaceId;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [users, totalCount] = await Promise.all([
        usersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .project({ password: 0 }) // Exclude password
          .toArray(),
        usersCollection.countDocuments(query),
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      return {
        users: users.map(user => ({
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workspaceId: user.workspaceId,
          role: user.role,
          permissions: user.permissions,
          emailVerified: user.emailVerified,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      };

    } catch (error) {
      this.logger.error('Failed to get users', error, { options });
      throw error;
    }
  }

  async updateUser(userId, updates) {
    try {
      if (!Validators.isValidObjectId(userId)) {
        throw new Error('Invalid user ID');
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Prepare update data
      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      // Hash password if being updated
      if (updates.password) {
        const saltRounds = 12;
        updateData.password = await bcrypt.hash(updates.password, saltRounds);
      }

      // Normalize email if being updated
      if (updates.email) {
        updateData.email = updates.email.toLowerCase().trim();
      }

      const result = await usersCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(userId),
          status: { $ne: 'deleted' }
        },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      // Get updated user
      const updatedUser = await this.getUser(userId);

      this.logger.info('User updated', {
        userId,
        updatedFields: Object.keys(updates),
      });

      return updatedUser;

    } catch (error) {
      this.logger.error('Failed to update user', error, { userId, updates });
      throw error;
    }
  }

  async authenticateUser(email, password) {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        return { 
          success: false, 
          reason: 'Invalid email or password' 
        };
      }

      if (user.status !== 'active') {
        return { 
          success: false, 
          reason: 'Account is not active' 
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return { 
          success: false, 
          reason: 'Invalid email or password' 
        };
      }

      // Generate JWT token
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        workspaceId: user.workspaceId,
        role: user.role,
        permissions: user.permissions,
      };

      const token = JWTUtils.sign(tokenPayload);

      this.logger.info('User authenticated successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          workspaceId: user.workspaceId,
          role: user.role,
          permissions: user.permissions,
          emailVerified: user.emailVerified,
          lastLoginAt: user.lastLoginAt,
        },
        token,
      };

    } catch (error) {
      this.logger.error('Authentication failed', error, { email });
      throw error;
    }
  }

  async deleteUser(userId, reason = 'user_request') {
    try {
      if (!Validators.isValidObjectId(userId)) {
        throw new Error('Invalid user ID');
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Soft delete
      const result = await usersCollection.updateOne(
        { 
          _id: MongoClient.createObjectId(userId),
          status: { $ne: 'deleted' }
        },
        {
          $set: {
            status: 'deleted',
            deletedAt: new Date(),
            deletedReason: reason,
            // Keep email but make it non-searchable
            email: `deleted_${Date.now()}_${userId}@deleted.local`,
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      this.logger.info('User soft deleted', {
        userId,
        reason,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to delete user', error, { userId, reason });
      throw error;
    }
  }

  async hardDeleteUser(userId) {
    try {
      if (!Validators.isValidObjectId(userId)) {
        throw new Error('Invalid user ID');
      }

      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      // Hard delete - GDPR compliance
      const result = await usersCollection.deleteOne({
        _id: MongoClient.createObjectId(userId),
      });

      if (result.deletedCount === 0) {
        throw new Error('User not found');
      }

      // Invalidate cache
      await this.invalidateUserCache(userId);

      this.logger.info('User hard deleted (GDPR)', {
        userId,
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to hard delete user', error, { userId });
      throw error;
    }
  }

  async getUsersByWorkspace(workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      const users = await usersCollection
        .find({ 
          workspaceId,
          status: { $ne: 'deleted' }
        })
        .project({ password: 0 })
        .toArray();

      return users.map(user => ({
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions,
        emailVerified: user.emailVerified,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      }));

    } catch (error) {
      this.logger.error('Failed to get users by workspace', error, { workspaceId });
      throw error;
    }
  }

  async updateUserWorkspace(userId, workspaceId) {
    try {
      return await this.updateUser(userId, { workspaceId });
    } catch (error) {
      this.logger.error('Failed to update user workspace', error, { userId, workspaceId });
      throw error;
    }
  }

  async verifyEmail(userId) {
    try {
      return await this.updateUser(userId, { 
        emailVerified: true,
        emailVerifiedAt: new Date()
      });
    } catch (error) {
      this.logger.error('Failed to verify email', error, { userId });
      throw error;
    }
  }

  async changeUserStatus(userId, status) {
    try {
      const validStatuses = ['active', 'suspended', 'inactive'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      return await this.updateUser(userId, { status });
    } catch (error) {
      this.logger.error('Failed to change user status', error, { userId, status });
      throw error;
    }
  }

  async getUserStats() {
    try {
      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');

      const stats = await usersCollection.aggregate([
        {
          $match: { status: { $ne: 'deleted' } }
        },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            verifiedUsers: {
              $sum: { $cond: [{ $eq: ['$emailVerified', true] }, 1, 0] }
            },
            adminUsers: {
              $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
            }
          }
        }
      ]).toArray();

      const result = stats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        verifiedUsers: 0,
        adminUsers: 0,
      };

      return {
        ...result,
        _id: undefined,
      };

    } catch (error) {
      this.logger.error('Failed to get user stats', error);
      throw error;
    }
  }

  // Cache management methods
  async cacheUser(userId, user) {
    try {
      const cacheKey = `user:${userId}`;
      await this.setCachedData(cacheKey, user, this.userCacheTTL);
    } catch (error) {
      this.logger.warn('Failed to cache user', error, { userId });
    }
  }

  async getCachedUser(userId) {
    try {
      const cacheKey = `user:${userId}`;
      return await this.getCachedData(cacheKey);
    } catch (error) {
      this.logger.warn('Failed to get cached user', error, { userId });
      return null;
    }
  }

  async invalidateUserCache(userId) {
    try {
      const user = await this.getCachedUser(userId);
      const cacheKeys = [`user:${userId}`];
      
      if (user && user.email) {
        cacheKeys.push(`user:email:${user.email}`);
      }

      await Promise.all(cacheKeys.map(key => this.redisClient.del(key)));
    } catch (error) {
      this.logger.warn('Failed to invalidate user cache', error, { userId });
    }
  }

  async setCachedData(key, data, ttl) {
    try {
      await this.redisClient.set(key, data, ttl);
    } catch (error) {
      this.logger.warn('Failed to set cached data', error, { key });
    }
  }

  async getCachedData(key) {
    try {
      return await this.redisClient.get(key);
    } catch (error) {
      this.logger.warn('Failed to get cached data', error, { key });
      return null;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const db = this.mongoClient.getDb();
      const usersCollection = db.collection('users');
      
      // Simple query to test database connectivity
      await usersCollection.findOne({}, { projection: { _id: 1 } });
      
      return {
        status: 'ok',
        component: 'user-manager',
      };

    } catch (error) {
      this.logger.error('User manager health check failed', error);
      return {
        status: 'error',
        component: 'user-manager',
        error: error.message,
      };
    }
  }
}

export { UserManager };