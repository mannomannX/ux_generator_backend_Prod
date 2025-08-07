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

const { EventEmitter } = require('events');

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
  cleanupExpiredEpisodes() {
    if (!this.config.enabled) return;

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
      this.logger.debug('Cleaned up expired episodes', {
        count: expiredEpisodes.length
      });
    }
  }

  /**
   * Generate unique episode ID
   */
  generateEpisodeId() {
    return `episode_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
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

module.exports = { EpisodeDetector };