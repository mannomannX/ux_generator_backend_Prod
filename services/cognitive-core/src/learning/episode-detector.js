/**
 * Learning Episode Detector
 * 
 * Detects learning opportunities when users provide corrective feedback.
 * This is the foundation of the self-optimizing prompt system.
 * 
 * Triggers when:
 * - Classifier detects "corrective" sentiment in plan_approval responses
 * - User provides feedback that indicates the AI response needs improvement
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

class EpisodeDetector extends EventEmitter {
  constructor(logger, mongoClient) {
    super();
    
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Configuration
    this.config = {
      enabled: process.env.ENABLE_LEARNING === 'true',
      maxEpisodesPerUser: 100,
      episodeTimeout: 1800000, // 30 minutes
      minFeedbackLength: 10
    };
    
    // Active learning episodes (temporary storage until completion)
    this.activeEpisodes = new Map();
    
    // Cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEpisodes();
    }, 300000); // Every 5 minutes
    
    // Statistics
    this.stats = {
      episodesCreated: 0,
      episodesCompleted: 0,
      episodesExpired: 0,
      totalLearningTriggers: 0
    };
  }

  /**
   * Initialize the episode detector
   */
  async initialize() {
    if (!this.config.enabled) {
      this.logger.info('Learning episode detection is disabled');
      return;
    }

    try {
      // Ensure MongoDB collections exist
      await this.ensureCollections();
      
      this.logger.info('Episode detector initialized', {
        enabled: this.config.enabled,
        maxEpisodesPerUser: this.config.maxEpisodesPerUser
      });
    } catch (error) {
      this.logger.error('Failed to initialize episode detector', error);
      throw error;
    }
  }

  /**
   * Detect corrective feedback and create learning episode
   */
  async detectCorrectiveFeedback(classificationResult, originalPlan, userFeedback, context) {
    if (!this.config.enabled) return null;
    
    // Check if this is corrective sentiment
    if (classificationResult.sentiment !== 'corrective') {
      return null;
    }

    // Validate minimum feedback length
    if (!userFeedback || userFeedback.length < this.config.minFeedbackLength) {
      this.logger.debug('Feedback too short for learning episode', {
        feedbackLength: userFeedback?.length || 0
      });
      return null;
    }

    // Create learning episode
    const episodeId = this.generateEpisodeId();
    const episode = {
      episodeId,
      userId: context.userId || 'anonymous',
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      
      // Core episode data
      originalPlan,
      userFeedback,
      successfulPlan: null, // Will be set when plan is successfully executed
      
      // Context information
      agentUsed: context.agentUsed || 'unknown',
      promptVersion: context.promptVersion || 'unknown',
      qualityMode: context.qualityMode || 'normal',
      
      // Classification results
      classification: {
        intent: classificationResult.intent,
        sentiment: classificationResult.sentiment,
        tasks: classificationResult.tasks,
        questions: classificationResult.questions
      },
      
      // Metadata
      status: 'active', // active, completed, expired, analyzed
      createdAt: new Date(),
      completedAt: null,
      analyzedAt: null,
      
      // Analysis results (filled by analyst agent)
      analysis: null
    };

    // Store in active episodes
    this.activeEpisodes.set(episodeId, episode);
    this.stats.episodesCreated++;
    this.stats.totalLearningTriggers++;

    this.logger.info('Learning episode created', {
      episodeId,
      userId: episode.userId,
      agentUsed: episode.agentUsed,
      feedbackLength: userFeedback.length,
      originalPlanLength: originalPlan?.length || 0
    });

    // Emit event for monitoring
    this.emit('episode-created', episode);

    return episodeId;
  }

  /**
   * Complete an episode with successful plan execution
   */
  async completeEpisode(episodeId, successfulPlan) {
    if (!this.config.enabled) return false;

    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) {
      this.logger.warn('Attempting to complete unknown episode', { episodeId });
      return false;
    }

    // Add successful plan and mark as completed
    episode.successfulPlan = successfulPlan;
    episode.status = 'completed';
    episode.completedAt = new Date();

    // Store completed episode in MongoDB
    await this.storeCompletedEpisode(episode);

    // Remove from active episodes
    this.activeEpisodes.delete(episodeId);
    this.stats.episodesCompleted++;

    this.logger.info('Learning episode completed', {
      episodeId,
      userId: episode.userId,
      agentUsed: episode.agentUsed,
      duration: episode.completedAt - episode.createdAt,
      successfulPlanLength: successfulPlan?.length || 0
    });

    // Emit event to trigger analysis
    this.emit('episode-completed', episode);

    return true;
  }

  /**
   * Get active episode for a context
   */
  getActiveEpisode(userId, workspaceId, projectId) {
    // Find most recent active episode for this context
    for (const [episodeId, episode] of this.activeEpisodes) {
      if (episode.userId === userId && 
          episode.workspaceId === workspaceId && 
          episode.projectId === projectId) {
        return { episodeId, episode };
      }
    }
    return null;
  }

  /**
   * Cancel/expire an episode
   */
  expireEpisode(episodeId, reason = 'timeout') {
    const episode = this.activeEpisodes.get(episodeId);
    if (!episode) return false;

    episode.status = 'expired';
    episode.expiredReason = reason;
    
    this.activeEpisodes.delete(episodeId);
    this.stats.episodesExpired++;

    this.logger.debug('Learning episode expired', {
      episodeId,
      reason,
      age: Date.now() - episode.createdAt
    });

    this.emit('episode-expired', { episodeId, reason });
    return true;
  }

  /**
   * Get learning statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      activeEpisodes: this.activeEpisodes.size,
      config: this.config
    };
  }

  /**
   * Store completed episode in MongoDB
   */
  async storeCompletedEpisode(episode) {
    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      
      const document = {
        ...episode,
        _id: episode.episodeId,
        // Add indexes for efficient queries
        indexFields: {
          userId: episode.userId,
          agentUsed: episode.agentUsed,
          status: episode.status,
          createdAt: episode.createdAt
        }
      };

      await collection.insertOne(document);
      
      this.logger.debug('Episode stored in database', {
        episodeId: episode.episodeId
      });
    } catch (error) {
      this.logger.error('Failed to store completed episode', error, {
        episodeId: episode.episodeId
      });
    }
  }

  /**
   * Ensure required MongoDB collections exist
   */
  async ensureCollections() {
    try {
      const db = this.mongoClient.db('learning');
      
      // Create episodes collection with indexes
      const episodesCollection = db.collection('episodes');
      await episodesCollection.createIndex({ 'indexFields.userId': 1 });
      await episodesCollection.createIndex({ 'indexFields.agentUsed': 1 });
      await episodesCollection.createIndex({ 'indexFields.status': 1 });
      await episodesCollection.createIndex({ 'indexFields.createdAt': -1 });
      
      this.logger.debug('Learning collections and indexes ensured');
    } catch (error) {
      this.logger.error('Failed to ensure collections', error);
      throw error;
    }
  }

  /**
   * Cleanup expired episodes
   */
  async cleanupExpiredEpisodes() {
    if (!this.config.enabled) return;

    // Cleanup in-memory expired episodes
    const now = Date.now();
    const expiredEpisodes = [];

    for (const [episodeId, episode] of this.activeEpisodes) {
      if (now - episode.createdAt.getTime() > this.config.episodeTimeout) {
        expiredEpisodes.push(episodeId);
      }
    }

    for (const episodeId of expiredEpisodes) {
      this.expireEpisode(episodeId, 'timeout');
    }

    if (expiredEpisodes.length > 0) {
      this.logger.debug('Cleaned up expired in-memory episodes', {
        count: expiredEpisodes.length
      });
    }

    // Also prune old episodes from database
    await this.pruneOldEpisodes();
  }

  /**
   * Prune old episodes from MongoDB storage
   * Removes episodes older than retention period and implements archive strategy
   */
  async pruneOldEpisodes() {
    if (!this.config.enabled) return;

    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      const now = new Date();
      
      // Configuration for pruning
      const retentionConfig = {
        // Keep all episodes for 30 days
        fullRetentionDays: 30,
        // Keep analyzed episodes for 90 days  
        analyzedRetentionDays: 90,
        // Keep completed episodes for 60 days
        completedRetentionDays: 60,
        // Keep failed/expired episodes for 7 days only
        failedRetentionDays: 7,
        // Archive episodes older than 180 days
        archiveAfterDays: 180
      };

      const results = {
        expired: 0,
        completed: 0, 
        analyzed: 0,
        archived: 0,
        errors: []
      };

      // 1. Remove very old expired/failed episodes (7 days)
      const failedCutoff = new Date(now - retentionConfig.failedRetentionDays * 24 * 60 * 60 * 1000);
      try {
        const failedResult = await collection.deleteMany({
          'indexFields.status': { $in: ['expired', 'failed'] },
          'indexFields.createdAt': { $lt: failedCutoff }
        });
        results.expired = failedResult.deletedCount;
      } catch (error) {
        this.logger.error('Failed to prune expired episodes', error);
        results.errors.push(`Failed episodes: ${error.message}`);
      }

      // 2. Remove old completed episodes (60 days)
      const completedCutoff = new Date(now - retentionConfig.completedRetentionDays * 24 * 60 * 60 * 1000);
      try {
        const completedResult = await collection.deleteMany({
          'indexFields.status': 'completed',
          analyzedAt: null, // Not yet analyzed
          'indexFields.createdAt': { $lt: completedCutoff }
        });
        results.completed = completedResult.deletedCount;
      } catch (error) {
        this.logger.error('Failed to prune completed episodes', error);
        results.errors.push(`Completed episodes: ${error.message}`);
      }

      // 3. Archive or remove very old analyzed episodes (90 days)
      const analyzedCutoff = new Date(now - retentionConfig.analyzedRetentionDays * 24 * 60 * 60 * 1000);
      try {
        // First, archive episodes that are valuable but old
        await this.archiveValuableEpisodes(analyzedCutoff);
        
        // Then remove regular analyzed episodes
        const analyzedResult = await collection.deleteMany({
          'indexFields.status': 'analyzed',
          'indexFields.createdAt': { $lt: analyzedCutoff },
          archived: { $ne: true }
        });
        results.analyzed = analyzedResult.deletedCount;
      } catch (error) {
        this.logger.error('Failed to prune analyzed episodes', error);
        results.errors.push(`Analyzed episodes: ${error.message}`);
      }

      // 4. Maintain episode count limits per user
      await this.enforceUserEpisodeLimits();

      // 5. Update statistics
      if (results.expired + results.completed + results.analyzed > 0) {
        this.logger.info('Episode pruning completed', {
          removed: {
            expired: results.expired,
            completed: results.completed,
            analyzed: results.analyzed
          },
          archived: results.archived,
          errors: results.errors
        });
      }

      return results;

    } catch (error) {
      this.logger.error('Episode pruning failed', error);
      return { error: error.message };
    }
  }

  /**
   * Archive valuable episodes before deletion
   * Archives episodes that might be valuable for future learning
   */
  async archiveValuableEpisodes(cutoffDate) {
    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      const archiveCollection = this.mongoClient.db('learning').collection('archived_episodes');

      // Find valuable episodes to archive
      const valuableEpisodes = await collection.find({
        'indexFields.status': 'analyzed',
        'indexFields.createdAt': { $lt: cutoffDate },
        $or: [
          { 'analysis.confidence': { $gte: 0.8 } }, // High confidence analysis
          { 'analysis.priority': 'high' },         // High priority suggestions
          { 'classification.intent': 'correction' }, // Corrective feedback episodes
          { agentUsed: 'analyst' }                  // Analysis episodes
        ],
        archived: { $ne: true }
      }).limit(100).toArray(); // Limit to prevent memory issues

      if (valuableEpisodes.length > 0) {
        // Prepare archive documents
        const archiveDocuments = valuableEpisodes.map(episode => ({
          ...episode,
          archivedAt: new Date(),
          originalId: episode._id,
          retentionReason: this.determineRetentionReason(episode)
        }));

        // Insert into archive collection
        await archiveCollection.insertMany(archiveDocuments);

        // Mark original episodes as archived
        const episodeIds = valuableEpisodes.map(e => e._id);
        await collection.updateMany(
          { _id: { $in: episodeIds } },
          { 
            $set: { 
              archived: true,
              archivedAt: new Date()
            }
          }
        );

        this.logger.info(`Archived ${valuableEpisodes.length} valuable episodes`);
        return valuableEpisodes.length;
      }

      return 0;

    } catch (error) {
      this.logger.error('Failed to archive valuable episodes', error);
      throw error;
    }
  }

  /**
   * Determine why an episode should be retained in archive
   */
  determineRetentionReason(episode) {
    const reasons = [];

    if (episode.analysis?.confidence >= 0.8) {
      reasons.push('high_confidence_analysis');
    }
    if (episode.analysis?.priority === 'high') {
      reasons.push('high_priority_suggestion');
    }
    if (episode.classification?.intent === 'correction') {
      reasons.push('corrective_feedback');
    }
    if (episode.agentUsed === 'analyst') {
      reasons.push('analysis_episode');
    }
    if (episode.analysis?.sourceAgent && ['planner', 'architect'].includes(episode.analysis.sourceAgent)) {
      reasons.push('core_agent_improvement');
    }

    return reasons.length > 0 ? reasons : ['default_retention'];
  }

  /**
   * Enforce per-user episode limits
   * Removes oldest episodes if user has too many
   */
  async enforceUserEpisodeLimits() {
    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      const maxEpisodesPerUser = this.config.maxEpisodesPerUser || 100;

      // Get users with too many episodes
      const userCounts = await collection.aggregate([
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            oldestEpisode: { $min: '$indexFields.createdAt' }
          }
        },
        {
          $match: {
            count: { $gt: maxEpisodesPerUser }
          }
        }
      ]).toArray();

      for (const userCount of userCounts) {
        const userId = userCount._id;
        const excessCount = userCount.count - maxEpisodesPerUser;

        // Remove oldest episodes for this user
        const oldestEpisodes = await collection.find({
          'indexFields.userId': userId
        })
        .sort({ 'indexFields.createdAt': 1 })
        .limit(excessCount)
        .toArray();

        if (oldestEpisodes.length > 0) {
          const episodeIds = oldestEpisodes.map(e => e._id);
          await collection.deleteMany({ _id: { $in: episodeIds } });

          this.logger.info(`Removed ${oldestEpisodes.length} excess episodes for user ${userId}`);
        }
      }

    } catch (error) {
      this.logger.error('Failed to enforce user episode limits', error);
    }
  }

  /**
   * Get episode storage statistics
   */
  async getStorageStatistics() {
    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      const archiveCollection = this.mongoClient.db('learning').collection('archived_episodes');

      const [episodeStats, archiveStats] = await Promise.all([
        collection.aggregate([
          {
            $group: {
              _id: '$indexFields.status',
              count: { $sum: 1 },
              oldestDate: { $min: '$indexFields.createdAt' },
              newestDate: { $max: '$indexFields.createdAt' }
            }
          }
        ]).toArray(),
        archiveCollection.countDocuments()
      ]);

      const totalEpisodes = episodeStats.reduce((sum, stat) => sum + stat.count, 0);

      return {
        totalEpisodes,
        archivedEpisodes: archiveStats,
        episodesByStatus: episodeStats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            oldestDate: stat.oldestDate,
            newestDate: stat.newestDate
          };
          return acc;
        }, {}),
        storageHealth: {
          status: totalEpisodes > 10000 ? 'high' : totalEpisodes > 5000 ? 'medium' : 'low',
          recommendation: totalEpisodes > 10000 
            ? 'Consider more aggressive pruning'
            : totalEpisodes > 5000 
            ? 'Monitor storage usage'
            : 'Storage usage normal'
        }
      };

    } catch (error) {
      this.logger.error('Failed to get storage statistics', error);
      return { error: error.message };
    }
  }

  /**
   * Generate unique episode ID
   */
  generateEpisodeId() {
    const randomBytes = crypto.randomBytes(4).toString('hex');
    return `episode_${Date.now()}_${randomBytes}`;
  }

  /**
   * Get episode history for analysis
   */
  async getEpisodeHistory(userId, agentUsed = null, limit = 50) {
    if (!this.config.enabled) return [];

    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      
      const query = { 'indexFields.userId': userId };
      if (agentUsed) {
        query['indexFields.agentUsed'] = agentUsed;
      }

      const episodes = await collection.find(query)
        .sort({ 'indexFields.createdAt': -1 })
        .limit(limit)
        .toArray();

      return episodes;
    } catch (error) {
      this.logger.error('Failed to get episode history', error);
      return [];
    }
  }

  /**
   * Get episodes ready for analysis
   */
  async getEpisodesForAnalysis(limit = 10) {
    if (!this.config.enabled) return [];

    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      
      const episodes = await collection.find({
        'indexFields.status': 'completed',
        analyzedAt: null
      })
        .sort({ completedAt: 1 }) // Oldest first
        .limit(limit)
        .toArray();

      return episodes;
    } catch (error) {
      this.logger.error('Failed to get episodes for analysis', error);
      return [];
    }
  }

  /**
   * Mark episode as analyzed
   */
  async markEpisodeAnalyzed(episodeId, analysisResult) {
    if (!this.config.enabled) return false;

    try {
      const collection = this.mongoClient.db('learning').collection('episodes');
      
      await collection.updateOne(
        { _id: episodeId },
        {
          $set: {
            'indexFields.status': 'analyzed',
            analyzedAt: new Date(),
            analysis: analysisResult
          }
        }
      );

      this.logger.debug('Episode marked as analyzed', { episodeId });
      return true;
    } catch (error) {
      this.logger.error('Failed to mark episode as analyzed', error);
      return false;
    }
  }

  /**
   * Shutdown the detector
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.logger.info('Episode detector shutdown', {
      stats: this.getStatistics()
    });
  }
}

export { EpisodeDetector };