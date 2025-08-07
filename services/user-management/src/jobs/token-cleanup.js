/**
 * Token Cleanup Job
 * Periodically removes expired tokens and blacklisted tokens from the database
 */

export class TokenCleanupJob {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    this.isRunning = false;
    this.intervalId = null;
    this.stats = {
      lastRun: null,
      tokensRemoved: 0,
      sessionsRemoved: 0,
      blacklistEntriesRemoved: 0,
      errors: 0
    };
  }

  /**
   * Start the cleanup job
   */
  start(intervalMs = 60 * 60 * 1000) { // Default: 1 hour
    if (this.isRunning) {
      this.logger.warn('Token cleanup job is already running');
      return;
    }
    
    this.isRunning = true;
    
    // Run immediately on start
    this.runCleanup();
    
    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
    
    this.logger.info('Token cleanup job started', {
      interval: intervalMs / 1000 + ' seconds'
    });
  }

  /**
   * Stop the cleanup job
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    this.logger.info('Token cleanup job stopped');
  }

  /**
   * Run cleanup tasks
   */
  async runCleanup() {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting token cleanup');
      
      const results = await Promise.allSettled([
        this.cleanupExpiredTokens(),
        this.cleanupExpiredSessions(),
        this.cleanupBlacklistedTokens(),
        this.cleanupPasswordResetTokens(),
        this.cleanupEmailVerificationTokens(),
        this.cleanupApiKeys(),
        this.cleanupSAMLSessions(),
        this.cleanupRefreshTokens()
      ]);
      
      // Process results
      let totalRemoved = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          totalRemoved += result.value || 0;
        } else {
          this.stats.errors++;
          this.logger.error('Cleanup task failed', {
            task: this.getTaskName(index),
            error: result.reason
          });
        }
      });
      
      // Clean Redis cache
      await this.cleanupRedisCache();
      
      // Update stats
      this.stats.lastRun = new Date();
      
      const duration = Date.now() - startTime;
      this.logger.info('Token cleanup completed', {
        duration: duration + 'ms',
        totalRemoved,
        stats: this.stats
      });
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Token cleanup job failed', error);
    }
  }

  /**
   * Cleanup expired access tokens
   */
  async cleanupExpiredTokens() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      const result = await db.collection('tokens').deleteMany({
        expiresAt: { $lt: now },
        type: 'access'
      });
      
      this.stats.tokensRemoved += result.deletedCount;
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired access tokens', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
      throw error;
    }
  }

  /**
   * Cleanup expired refresh tokens
   */
  async cleanupRefreshTokens() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      // Remove expired refresh tokens
      const result = await db.collection('refresh_tokens').deleteMany({
        expiresAt: { $lt: now }
      });
      
      // Also remove refresh tokens that haven't been used in 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const unusedResult = await db.collection('refresh_tokens').deleteMany({
        lastUsedAt: { $lt: thirtyDaysAgo }
      });
      
      const totalRemoved = result.deletedCount + unusedResult.deletedCount;
      this.stats.tokensRemoved += totalRemoved;
      
      if (totalRemoved > 0) {
        this.logger.debug('Removed refresh tokens', {
          expired: result.deletedCount,
          unused: unusedResult.deletedCount
        });
      }
      
      return totalRemoved;
      
    } catch (error) {
      this.logger.error('Failed to cleanup refresh tokens', error);
      throw error;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      const result = await db.collection('sessions').deleteMany({
        expiresAt: { $lt: now }
      });
      
      this.stats.sessionsRemoved += result.deletedCount;
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired sessions', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', error);
      throw error;
    }
  }

  /**
   * Cleanup old blacklisted tokens
   */
  async cleanupBlacklistedTokens() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      // Remove blacklisted tokens that have expired
      // (no need to keep them in blacklist after expiration)
      const result = await db.collection('token_blacklist').deleteMany({
        expiresAt: { $lt: now }
      });
      
      this.stats.blacklistEntriesRemoved += result.deletedCount;
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired blacklist entries', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup blacklisted tokens', error);
      throw error;
    }
  }

  /**
   * Cleanup expired password reset tokens
   */
  async cleanupPasswordResetTokens() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      const result = await db.collection('password_reset_tokens').deleteMany({
        expiresAt: { $lt: now }
      });
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired password reset tokens', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup password reset tokens', error);
      throw error;
    }
  }

  /**
   * Cleanup expired email verification tokens
   */
  async cleanupEmailVerificationTokens() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      const result = await db.collection('email_verification_tokens').deleteMany({
        expiresAt: { $lt: now }
      });
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired email verification tokens', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup email verification tokens', error);
      throw error;
    }
  }

  /**
   * Cleanup expired API keys
   */
  async cleanupApiKeys() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      // Remove expired API keys
      const result = await db.collection('api_keys').deleteMany({
        expiresAt: { $lt: now, $ne: null }
      });
      
      // Archive revoked API keys older than 90 days
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const revokedKeys = await db.collection('api_keys').find({
        status: 'revoked',
        revokedAt: { $lt: ninetyDaysAgo }
      }).toArray();
      
      if (revokedKeys.length > 0) {
        // Archive to separate collection
        await db.collection('api_keys_archive').insertMany(revokedKeys);
        
        // Remove from active collection
        await db.collection('api_keys').deleteMany({
          _id: { $in: revokedKeys.map(key => key._id) }
        });
      }
      
      const totalRemoved = result.deletedCount + revokedKeys.length;
      
      if (totalRemoved > 0) {
        this.logger.debug('Cleaned up API keys', {
          expired: result.deletedCount,
          archived: revokedKeys.length
        });
      }
      
      return totalRemoved;
      
    } catch (error) {
      this.logger.error('Failed to cleanup API keys', error);
      throw error;
    }
  }

  /**
   * Cleanup expired SAML sessions
   */
  async cleanupSAMLSessions() {
    try {
      const db = this.mongoClient.getDb();
      const now = new Date();
      
      const result = await db.collection('saml_sessions').deleteMany({
        expiresAt: { $lt: now }
      });
      
      if (result.deletedCount > 0) {
        this.logger.debug('Removed expired SAML sessions', {
          count: result.deletedCount
        });
      }
      
      return result.deletedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup SAML sessions', error);
      throw error;
    }
  }

  /**
   * Cleanup Redis cache entries
   */
  async cleanupRedisCache() {
    try {
      // Scan for expired keys (Redis handles TTL automatically, but we can force cleanup)
      const keys = await this.redisClient.keys('token:*');
      
      let removedCount = 0;
      for (const key of keys) {
        const ttl = await this.redisClient.ttl(key);
        
        // Remove keys with negative TTL (expired but not yet removed)
        if (ttl < 0 && ttl !== -1) {
          await this.redisClient.del(key);
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        this.logger.debug('Removed expired Redis cache entries', {
          count: removedCount
        });
      }
      
      return removedCount;
      
    } catch (error) {
      this.logger.error('Failed to cleanup Redis cache', error);
      // Don't throw - Redis cleanup is not critical
      return 0;
    }
  }

  /**
   * Get task name by index
   */
  getTaskName(index) {
    const tasks = [
      'cleanupExpiredTokens',
      'cleanupExpiredSessions',
      'cleanupBlacklistedTokens',
      'cleanupPasswordResetTokens',
      'cleanupEmailVerificationTokens',
      'cleanupApiKeys',
      'cleanupSAMLSessions',
      'cleanupRefreshTokens'
    ];
    
    return tasks[index] || 'unknown';
  }

  /**
   * Get cleanup job statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      nextRun: this.intervalId ? new Date(Date.now() + 60 * 60 * 1000) : null
    };
  }

  /**
   * Force immediate cleanup
   */
  async forceCleanup() {
    this.logger.info('Forcing immediate token cleanup');
    await this.runCleanup();
  }
}

/**
 * Create and configure token cleanup job
 */
export const createTokenCleanupJob = (logger, mongoClient, redisClient, options = {}) => {
  const job = new TokenCleanupJob(logger, mongoClient, redisClient);
  
  const {
    autoStart = true,
    interval = 60 * 60 * 1000, // 1 hour default
  } = options;
  
  if (autoStart) {
    job.start(interval);
  }
  
  return job;
};

export default TokenCleanupJob;