/**
 * JWT Token Blacklist Service
 * Handles token revocation and blacklisting
 */

export class TokenBlacklistService {
  constructor(redisClient, logger) {
    this.redis = redisClient;
    this.logger = logger;
    this.BLACKLIST_PREFIX = 'token:blacklist:';
    this.REVOKED_TOKENS_SET = 'token:revoked:set';
    this.USER_TOKENS_PREFIX = 'user:tokens:';
  }

  /**
   * Add token to blacklist
   */
  async blacklistToken(token, userId, expiryTime, reason = 'manual_revocation') {
    try {
      // Calculate TTL based on token expiry
      const now = Date.now();
      const ttl = Math.max(0, Math.ceil((expiryTime - now) / 1000));
      
      if (ttl <= 0) {
        // Token already expired, no need to blacklist
        return true;
      }

      // Store blacklisted token with metadata
      const blacklistKey = `${this.BLACKLIST_PREFIX}${token}`;
      const blacklistData = JSON.stringify({
        userId,
        revokedAt: now,
        reason,
        expiryTime
      });

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Add to blacklist with TTL
      pipeline.setex(blacklistKey, ttl, blacklistData);
      
      // Add to revoked tokens set for tracking
      pipeline.zadd(this.REVOKED_TOKENS_SET, expiryTime, token);
      
      // Track user's revoked tokens
      const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}:revoked`;
      pipeline.zadd(userTokensKey, expiryTime, token);
      pipeline.expire(userTokensKey, 86400 * 30); // Keep for 30 days
      
      await pipeline.exec();

      this.logger.info('Token blacklisted', {
        userId,
        reason,
        expiryIn: ttl
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to blacklist token', error);
      throw error;
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isBlacklisted(token) {
    try {
      const blacklistKey = `${this.BLACKLIST_PREFIX}${token}`;
      const exists = await this.redis.exists(blacklistKey);
      return exists > 0;
    } catch (error) {
      this.logger.error('Failed to check token blacklist', error);
      // Fail closed - treat as blacklisted on error
      return true;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId, reason = 'security_event') {
    try {
      // Get all active sessions for user
      const sessionsKey = `sessions:user:${userId}`;
      const sessions = await this.redis.smembers(sessionsKey);
      
      const pipeline = this.redis.pipeline();
      const now = Date.now();
      const defaultTTL = 86400; // 24 hours
      
      for (const sessionId of sessions) {
        const sessionKey = `session:${sessionId}`;
        const sessionData = await this.redis.get(sessionKey);
        
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (session.token) {
              // Blacklist the token
              const blacklistKey = `${this.BLACKLIST_PREFIX}${session.token}`;
              const expiryTime = session.expiryTime || (now + defaultTTL * 1000);
              const ttl = Math.max(0, Math.ceil((expiryTime - now) / 1000));
              
              if (ttl > 0) {
                pipeline.setex(blacklistKey, ttl, JSON.stringify({
                  userId,
                  revokedAt: now,
                  reason,
                  sessionId
                }));
                
                pipeline.zadd(this.REVOKED_TOKENS_SET, expiryTime, session.token);
              }
            }
            
            // Delete the session
            pipeline.del(sessionKey);
          } catch (parseError) {
            this.logger.error('Failed to parse session data', { sessionId, error: parseError });
          }
        }
      }
      
      // Clear user's session set
      pipeline.del(sessionsKey);
      
      // Mark user as requiring re-authentication
      pipeline.setex(`user:force-reauth:${userId}`, 86400, reason);
      
      await pipeline.exec();
      
      this.logger.info('All user tokens revoked', {
        userId,
        reason,
        sessionCount: sessions.length
      });
      
      return sessions.length;
    } catch (error) {
      this.logger.error('Failed to revoke user tokens', { userId, error });
      throw error;
    }
  }

  /**
   * Revoke tokens by pattern (e.g., workspace-wide)
   */
  async revokeTokensByPattern(pattern, reason = 'bulk_revocation') {
    try {
      const keys = await this.redis.keys(`session:*${pattern}*`);
      let revokedCount = 0;
      const now = Date.now();
      const defaultTTL = 86400; // 24 hours
      
      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        const sessionData = await this.redis.get(key);
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (session.token) {
              const blacklistKey = `${this.BLACKLIST_PREFIX}${session.token}`;
              const expiryTime = session.expiryTime || (now + defaultTTL * 1000);
              const ttl = Math.max(0, Math.ceil((expiryTime - now) / 1000));
              
              if (ttl > 0) {
                pipeline.setex(blacklistKey, ttl, JSON.stringify({
                  revokedAt: now,
                  reason,
                  pattern
                }));
                
                pipeline.zadd(this.REVOKED_TOKENS_SET, expiryTime, session.token);
                revokedCount++;
              }
            }
            
            pipeline.del(key);
          } catch (parseError) {
            this.logger.error('Failed to parse session for revocation', { key, error: parseError });
          }
        }
      }
      
      await pipeline.exec();
      
      this.logger.info('Tokens revoked by pattern', {
        pattern,
        reason,
        revokedCount
      });
      
      return revokedCount;
    } catch (error) {
      this.logger.error('Failed to revoke tokens by pattern', { pattern, error });
      throw error;
    }
  }

  /**
   * Clean up expired blacklist entries
   */
  async cleanupExpiredTokens() {
    try {
      const now = Date.now();
      
      // Remove expired tokens from the sorted set
      const removed = await this.redis.zremrangebyscore(
        this.REVOKED_TOKENS_SET,
        '-inf',
        now
      );
      
      if (removed > 0) {
        this.logger.info('Cleaned up expired blacklist entries', { count: removed });
      }
      
      return removed;
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error);
      return 0;
    }
  }

  /**
   * Get blacklist statistics
   */
  async getStatistics() {
    try {
      const totalRevoked = await this.redis.zcard(this.REVOKED_TOKENS_SET);
      const now = Date.now();
      const activeRevoked = await this.redis.zcount(
        this.REVOKED_TOKENS_SET,
        now,
        '+inf'
      );
      
      // Get recent revocations (last 24 hours)
      const dayAgo = now - (86400 * 1000);
      const recentKeys = await this.redis.keys(`${this.BLACKLIST_PREFIX}*`);
      let recentRevocations = 0;
      
      for (const key of recentKeys.slice(0, 100)) { // Sample first 100
        const data = await this.redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.revokedAt >= dayAgo) {
              recentRevocations++;
            }
          } catch (e) {
            // Skip invalid entries
          }
        }
      }
      
      return {
        totalRevoked,
        activeRevoked,
        expiredRevoked: totalRevoked - activeRevoked,
        recentRevocations,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to get blacklist statistics', error);
      return null;
    }
  }

  /**
   * Initialize cleanup job
   */
  startCleanupJob(intervalMs = 3600000) { // Default: 1 hour
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredTokens();
    }, intervalMs);
    
    this.logger.info('Token blacklist cleanup job started', { intervalMs });
  }

  /**
   * Stop cleanup job
   */
  stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('Token blacklist cleanup job stopped');
    }
  }
}

export default TokenBlacklistService;