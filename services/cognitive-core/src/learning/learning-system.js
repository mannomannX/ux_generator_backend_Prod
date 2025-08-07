// ==========================================
// COGNITIVE CORE - Real Learning System
// Based on OPEN_QUESTIONS_ANSWERS.md specifications
// ==========================================

import crypto from 'crypto';

export class LearningSystem {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // Learning configuration
    this.config = {
      retentionDays: 90, // Store learning episodes for 90 days
      anonymizationEnabled: true,
      optOutKey: 'learning_opt_out',
      minFeedbackSamples: 10, // Minimum samples to trigger learning
      learningBatchSize: 100
    };
    
    // PII patterns for anonymization
    this.piiPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
      /\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // Phone
      /\b\d{1,5}\s\w+\s(Street|St|Avenue|Ave|Road|Rd|Lane|Ln)\b/gi // Address
    ];
    
    this.initialize();
  }

  /**
   * Initialize learning system
   */
  async initialize() {
    try {
      // Create indexes for efficient querying
      await this.createDatabaseIndexes();
      
      // Start background cleanup process
      this.startCleanupProcess();
      
      // Start learning analytics process
      this.startLearningAnalytics();
      
      this.logger.info('Learning system initialized');
    } catch (error) {
      this.logger.error('Failed to initialize learning system', error);
    }
  }

  /**
   * Create database indexes for learning collections
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // Learning episodes collection
    await db.collection('learning_episodes').createIndexes([
      { key: { createdAt: 1 }, expireAfterSeconds: this.config.retentionDays * 24 * 60 * 60 },
      { key: { agentType: 1, feedbackType: 1 } },
      { key: { workspaceId: 1 } },
      { key: { anonymized: 1 } }
    ]);
    
    // Feedback patterns collection
    await db.collection('feedback_patterns').createIndexes([
      { key: { pattern: 1 }, unique: true },
      { key: { confidence: -1 } },
      { key: { lastUpdated: 1 } }
    ]);
    
    // User opt-outs collection
    await db.collection('learning_opt_outs').createIndexes([
      { key: { userId: 1 }, unique: true },
      { key: { createdAt: 1 } }
    ]);
  }

  /**
   * Record a learning episode from user interaction
   */
  async recordLearningEpisode(episodeData) {
    try {
      // Check if user has opted out
      const hasOptedOut = await this.hasUserOptedOut(episodeData.userId);
      if (hasOptedOut) {
        this.logger.debug('User has opted out of learning', { userId: episodeData.userId });
        return;
      }

      // Anonymize the data
      const anonymizedData = await this.anonymizeEpisodeData(episodeData);
      
      const episode = {
        ...anonymizedData,
        id: crypto.randomUUID(),
        createdAt: new Date(),
        anonymized: true,
        processed: false
      };

      // Store in database
      const db = this.mongoClient.getDb();
      await db.collection('learning_episodes').insertOne(episode);
      
      // Cache recent episodes for quick access
      await this.cacheRecentEpisode(episode);
      
      this.logger.info('Learning episode recorded', {
        episodeId: episode.id,
        agentType: episode.agentType,
        feedbackType: episode.feedbackType
      });

    } catch (error) {
      this.logger.error('Failed to record learning episode', error);
    }
  }

  /**
   * Record user feedback on AI actions
   */
  async recordUserFeedback(feedbackData) {
    const {
      userId,
      agentType,
      actionId,
      feedbackType, // 'positive', 'negative', 'edit', 'reject'
      originalPrompt,
      agentResponse,
      userModification = null,
      context = {}
    } = feedbackData;

    const episode = {
      userId,
      agentType,
      actionId,
      feedbackType,
      originalPrompt,
      agentResponse,
      userModification,
      context,
      timestamp: Date.now()
    };

    await this.recordLearningEpisode(episode);
    
    // Trigger immediate pattern analysis for high-impact feedback
    if (feedbackType === 'reject' || feedbackType === 'negative') {
      await this.analyzeImmediateFeedback(episode);
    }
  }

  /**
   * Record manual learning moment marked by user
   */
  async recordManualLearningMoment(momentData) {
    const {
      userId,
      agentType,
      situation,
      expectedBehavior,
      actualBehavior,
      improvement,
      context = {}
    } = momentData;

    const episode = {
      userId,
      agentType,
      situationDescription: situation,
      expectedBehavior,
      actualBehavior,
      suggestedImprovement: improvement,
      feedbackType: 'manual_learning',
      context,
      timestamp: Date.now(),
      highPriority: true // Manual moments get higher priority
    };

    await this.recordLearningEpisode(episode);
    
    this.logger.info('Manual learning moment recorded', {
      agentType,
      userId: episode.anonymizedUserId
    });
  }

  /**
   * Anonymize episode data by removing PII
   */
  async anonymizeEpisodeData(data) {
    const anonymized = { ...data };
    
    // Remove direct user identifiers
    delete anonymized.userId;
    anonymized.anonymizedUserId = this.createUserHash(data.userId);
    
    // Anonymize text content
    if (anonymized.originalPrompt) {
      anonymized.originalPrompt = this.removePII(anonymized.originalPrompt);
    }
    
    if (anonymized.agentResponse) {
      anonymized.agentResponse = this.removePII(anonymized.agentResponse);
    }
    
    if (anonymized.userModification) {
      anonymized.userModification = this.removePII(anonymized.userModification);
    }
    
    // Anonymize context data
    if (anonymized.context) {
      anonymized.context = this.anonymizeContext(anonymized.context);
    }

    return anonymized;
  }

  /**
   * Remove PII from text content
   */
  removePII(text) {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text;
    
    // Replace PII patterns with placeholders
    this.piiPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '[REDACTED]');
    });
    
    // Remove specific names (basic heuristic)
    cleaned = cleaned.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[NAME]');
    
    return cleaned;
  }

  /**
   * Anonymize context data
   */
  anonymizeContext(context) {
    const anonymized = { ...context };
    
    // Remove sensitive fields
    delete anonymized.userEmail;
    delete anonymized.userName;
    delete anonymized.apiKey;
    delete anonymized.sessionToken;
    
    // Hash workspace ID
    if (anonymized.workspaceId) {
      anonymized.workspaceId = this.createHash(anonymized.workspaceId);
    }
    
    // Hash project ID
    if (anonymized.projectId) {
      anonymized.projectId = this.createHash(anonymized.projectId);
    }
    
    return anonymized;
  }

  /**
   * Create hash for anonymization
   */
  createUserHash(userId) {
    return crypto.createHash('sha256')
      .update(userId + process.env.LEARNING_SALT)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Create generic hash
   */
  createHash(data) {
    return crypto.createHash('sha256')
      .update(data)
      .digest('hex')
      .substring(0, 12);
  }

  /**
   * Check if user has opted out of learning
   */
  async hasUserOptedOut(userId) {
    try {
      const db = this.mongoClient.getDb();
      const optOut = await db.collection('learning_opt_outs')
        .findOne({ userId });
      
      return optOut !== null;
    } catch (error) {
      this.logger.error('Failed to check opt-out status', error);
      return false; // Default to not opted out on error
    }
  }

  /**
   * Allow user to opt out of learning system
   */
  async optOutUser(userId, reason = null) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('learning_opt_outs').insertOne({
        userId,
        reason,
        createdAt: new Date()
      });
      
      // Remove existing episodes for this user
      await db.collection('learning_episodes').deleteMany({
        anonymizedUserId: this.createUserHash(userId)
      });
      
      this.logger.info('User opted out of learning system', { userId });
      
    } catch (error) {
      this.logger.error('Failed to opt out user', error);
      throw error;
    }
  }

  /**
   * Allow user to opt back in
   */
  async optInUser(userId) {
    try {
      const db = this.mongoClient.getDb();
      await db.collection('learning_opt_outs').deleteOne({ userId });
      
      this.logger.info('User opted back into learning system', { userId });
      
    } catch (error) {
      this.logger.error('Failed to opt in user', error);
      throw error;
    }
  }

  /**
   * Analyze feedback patterns and update agent behavior
   */
  async analyzeFeedbackPatterns() {
    try {
      const db = this.mongoClient.getDb();
      
      // Get unprocessed episodes
      const episodes = await db.collection('learning_episodes')
        .find({ 
          processed: false,
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        })
        .limit(this.config.learningBatchSize)
        .toArray();

      if (episodes.length === 0) {
        return;
      }

      // Group by agent type and feedback type
      const groupedEpisodes = this.groupEpisodesByPattern(episodes);
      
      // Analyze each pattern
      for (const [pattern, patternEpisodes] of Object.entries(groupedEpisodes)) {
        if (patternEpisodes.length >= this.config.minFeedbackSamples) {
          await this.analyzePattern(pattern, patternEpisodes);
        }
      }

      // Mark episodes as processed
      const episodeIds = episodes.map(e => e.id);
      await db.collection('learning_episodes')
        .updateMany(
          { id: { $in: episodeIds } },
          { $set: { processed: true, processedAt: new Date() } }
        );

      this.logger.info('Feedback patterns analyzed', {
        episodesProcessed: episodes.length,
        patterns: Object.keys(groupedEpisodes).length
      });

    } catch (error) {
      this.logger.error('Failed to analyze feedback patterns', error);
    }
  }

  /**
   * Group episodes by pattern for analysis
   */
  groupEpisodesByPattern(episodes) {
    const groups = {};
    
    episodes.forEach(episode => {
      const pattern = `${episode.agentType}:${episode.feedbackType}`;
      
      if (!groups[pattern]) {
        groups[pattern] = [];
      }
      
      groups[pattern].push(episode);
    });
    
    return groups;
  }

  /**
   * Analyze specific pattern and extract insights
   */
  async analyzePattern(pattern, episodes) {
    const [agentType, feedbackType] = pattern.split(':');
    
    // Extract common themes
    const insights = {
      pattern,
      agentType,
      feedbackType,
      episodeCount: episodes.length,
      commonIssues: this.extractCommonIssues(episodes),
      suggestedImprovements: this.generateImprovements(episodes),
      confidence: this.calculateConfidence(episodes),
      createdAt: new Date()
    };

    // Store pattern insights
    const db = this.mongoClient.getDb();
    await db.collection('feedback_patterns').replaceOne(
      { pattern },
      insights,
      { upsert: true }
    );

    // Cache insights for quick access
    await this.cachePatternInsights(insights);
    
    this.logger.info('Pattern analyzed', {
      pattern,
      episodeCount: episodes.length,
      confidence: insights.confidence
    });
  }

  /**
   * Extract common issues from episodes
   */
  extractCommonIssues(episodes) {
    const issues = [];
    
    // Analyze negative feedback episodes
    const negativeEpisodes = episodes.filter(e => 
      ['negative', 'reject', 'edit'].includes(e.feedbackType)
    );
    
    // Look for common words/phrases in prompts that led to poor responses
    const commonWords = this.extractCommonTerms(
      negativeEpisodes.map(e => e.originalPrompt).filter(Boolean)
    );
    
    if (commonWords.length > 0) {
      issues.push({
        type: 'prompt_patterns',
        description: 'Common prompt patterns leading to poor responses',
        terms: commonWords.slice(0, 10) // Top 10
      });
    }
    
    // Look for common response patterns that get rejected
    const commonResponsePatterns = this.extractCommonTerms(
      negativeEpisodes.map(e => e.agentResponse).filter(Boolean)
    );
    
    if (commonResponsePatterns.length > 0) {
      issues.push({
        type: 'response_patterns',
        description: 'Common response patterns that get rejected',
        terms: commonResponsePatterns.slice(0, 10)
      });
    }
    
    return issues;
  }

  /**
   * Generate improvement suggestions based on episodes
   */
  generateImprovements(episodes) {
    const improvements = [];
    
    // Analyze successful patterns
    const positiveEpisodes = episodes.filter(e => 
      e.feedbackType === 'positive'
    );
    
    if (positiveEpisodes.length > 0) {
      const successPatterns = this.extractCommonTerms(
        positiveEpisodes.map(e => e.originalPrompt).filter(Boolean)
      );
      
      improvements.push({
        type: 'enhance_success_patterns',
        description: 'Patterns associated with positive feedback',
        patterns: successPatterns.slice(0, 5),
        priority: 'high'
      });
    }
    
    // Analyze user modifications to understand preferences
    const editEpisodes = episodes.filter(e => 
      e.feedbackType === 'edit' && e.userModification
    );
    
    if (editEpisodes.length > 0) {
      improvements.push({
        type: 'learn_from_edits',
        description: 'Learn from user modifications',
        sampleCount: editEpisodes.length,
        priority: 'medium'
      });
    }
    
    return improvements;
  }

  /**
   * Calculate confidence score for pattern
   */
  calculateConfidence(episodes) {
    const totalEpisodes = episodes.length;
    const consistentFeedback = episodes.filter(e => 
      e.feedbackType === episodes[0].feedbackType
    ).length;
    
    const consistency = consistentFeedback / totalEpisodes;
    const sampleSizeScore = Math.min(totalEpisodes / 100, 1); // Up to 100 samples
    
    return Math.round((consistency * 0.7 + sampleSizeScore * 0.3) * 100) / 100;
  }

  /**
   * Extract common terms from text array
   */
  extractCommonTerms(texts) {
    const wordCounts = {};
    
    texts.forEach(text => {
      if (!text) return;
      
      // Simple word extraction (could be improved with NLP)
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3); // Filter short words
      
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });
    
    // Return words sorted by frequency
    return Object.entries(wordCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([word]) => word);
  }

  /**
   * Get learning insights for agent improvement
   */
  async getLearningInsights(agentType) {
    try {
      const db = this.mongoClient.getDb();
      
      // Get recent patterns for this agent
      const patterns = await db.collection('feedback_patterns')
        .find({ 
          agentType,
          confidence: { $gte: 0.7 } // High confidence patterns only
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      return {
        agentType,
        patterns,
        lastUpdated: patterns.length > 0 ? patterns[0].createdAt : null
      };

    } catch (error) {
      this.logger.error('Failed to get learning insights', error);
      return { agentType, patterns: [], lastUpdated: null };
    }
  }

  /**
   * Cache recent episode for quick access
   */
  async cacheRecentEpisode(episode) {
    try {
      const key = `learning:recent:${episode.agentType}`;
      await this.redisClient.lpush(key, JSON.stringify(episode));
      await this.redisClient.ltrim(key, 0, 99); // Keep last 100
      await this.redisClient.expire(key, 3600); // 1 hour
    } catch (error) {
      this.logger.error('Failed to cache recent episode', error);
    }
  }

  /**
   * Cache pattern insights for quick access
   */
  async cachePatternInsights(insights) {
    try {
      const key = `learning:patterns:${insights.pattern}`;
      await this.redisClient.setex(key, 3600, JSON.stringify(insights));
    } catch (error) {
      this.logger.error('Failed to cache pattern insights', error);
    }
  }

  /**
   * Analyze immediate feedback for quick adjustments
   */
  async analyzeImmediateFeedback(episode) {
    try {
      // For high-impact negative feedback, immediately flag for review
      if (episode.feedbackType === 'reject') {
        await this.flagForReview(episode, 'immediate_reject');
      }
      
      // Check if this is part of a trend
      const recentEpisodes = await this.getRecentSimilarEpisodes(episode);
      
      if (recentEpisodes.length >= 3) { // 3 similar negative feedback in short time
        await this.flagForReview(episode, 'negative_trend');
        
        this.logger.warn('Negative feedback trend detected', {
          agentType: episode.agentType,
          feedbackType: episode.feedbackType,
          recentCount: recentEpisodes.length
        });
      }

    } catch (error) {
      this.logger.error('Failed to analyze immediate feedback', error);
    }
  }

  /**
   * Get recent similar episodes
   */
  async getRecentSimilarEpisodes(episode) {
    try {
      const key = `learning:recent:${episode.agentType}`;
      const recentData = await this.redisClient.lrange(key, 0, 20);
      
      const recentEpisodes = recentData.map(data => JSON.parse(data))
        .filter(e => 
          e.feedbackType === episode.feedbackType &&
          Date.now() - e.timestamp < 3600000 // Within last hour
        );

      return recentEpisodes;

    } catch (error) {
      this.logger.error('Failed to get recent similar episodes', error);
      return [];
    }
  }

  /**
   * Flag episode for manual review
   */
  async flagForReview(episode, reason) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('learning_reviews').insertOne({
        episodeId: episode.id,
        agentType: episode.agentType,
        reason,
        status: 'pending',
        createdAt: new Date(),
        priority: reason === 'immediate_reject' ? 'high' : 'medium'
      });

    } catch (error) {
      this.logger.error('Failed to flag episode for review', error);
    }
  }

  /**
   * Start background cleanup process
   */
  startCleanupProcess() {
    // Clean up old data every 24 hours
    setInterval(async () => {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.config.retentionDays);
        
        const db = this.mongoClient.getDb();
        
        // Clean up old episodes (MongoDB TTL should handle this, but double-check)
        const result = await db.collection('learning_episodes')
          .deleteMany({ createdAt: { $lt: cutoff } });
        
        if (result.deletedCount > 0) {
          this.logger.info('Cleaned up old learning episodes', {
            deletedCount: result.deletedCount
          });
        }

      } catch (error) {
        this.logger.error('Failed to cleanup old learning data', error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Start learning analytics process
   */
  startLearningAnalytics() {
    // Analyze patterns every 6 hours
    setInterval(async () => {
      await this.analyzeFeedbackPatterns();
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    // Generate reports every 24 hours
    setInterval(async () => {
      await this.generateLearningReports();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Generate learning reports for analytics
   */
  async generateLearningReports() {
    try {
      const db = this.mongoClient.getDb();
      
      // Generate daily learning summary
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const stats = await db.collection('learning_episodes').aggregate([
        { $match: { createdAt: { $gte: startOfDay } } },
        {
          $group: {
            _id: {
              agentType: '$agentType',
              feedbackType: '$feedbackType'
            },
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const report = {
        date: new Date(),
        totalEpisodes: stats.reduce((sum, s) => sum + s.count, 0),
        byAgent: {},
        byFeedbackType: {}
      };

      stats.forEach(stat => {
        const { agentType, feedbackType } = stat._id;
        
        if (!report.byAgent[agentType]) {
          report.byAgent[agentType] = {};
        }
        report.byAgent[agentType][feedbackType] = stat.count;
        
        if (!report.byFeedbackType[feedbackType]) {
          report.byFeedbackType[feedbackType] = 0;
        }
        report.byFeedbackType[feedbackType] += stat.count;
      });

      // Store report
      await db.collection('learning_reports').insertOne(report);
      
      this.logger.info('Learning report generated', {
        totalEpisodes: report.totalEpisodes,
        agentTypes: Object.keys(report.byAgent).length
      });

    } catch (error) {
      this.logger.error('Failed to generate learning reports', error);
    }
  }

  /**
   * Get learning statistics for monitoring
   */
  async getLearningStats() {
    try {
      const db = this.mongoClient.getDb();
      
      // Get recent stats
      const [episodes, patterns, optOuts] = await Promise.all([
        db.collection('learning_episodes').countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
        db.collection('feedback_patterns').countDocuments(),
        db.collection('learning_opt_outs').countDocuments()
      ]);

      return {
        episodesToday: episodes,
        totalPatterns: patterns,
        optedOutUsers: optOuts,
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to get learning stats', error);
      return null;
    }
  }
}

export default LearningSystem;