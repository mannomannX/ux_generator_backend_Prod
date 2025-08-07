/**
 * Learning System Coordinator
 * 
 * Central orchestrator for the self-optimizing prompt system.
 * Coordinates the complete learning cycle from episode detection to implementation.
 * 
 * Learning Flow:
 * 1. Episode Detector identifies corrective feedback
 * 2. Analyst Agent diagnoses the problem
 * 3. Problem Database stores findings
 * 4. Admin Interface allows human review and approval
 * 5. Prompt Optimizer generates improved prompts
 * 6. Implementation Workflow deploys changes safely
 */

import { EventEmitter } from 'events';

class LearningSystemCoordinator extends EventEmitter {
  constructor(logger, mongoClient, agentHub, eventEmitter) {
    super();
    
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.agentHub = agentHub;
    this.eventEmitter = eventEmitter;
    
    // Components (will be initialized)
    this.episodeDetector = null;
    this.problemDatabase = null;
    this.promptAdmin = null;
    this.promptOptimizer = null;
    this.implementationWorkflow = null;
    
    // Configuration
    this.config = {
      enabled: process.env.ENABLE_LEARNING_SYSTEM === 'true',
      autoAnalysis: process.env.AUTO_ANALYZE_EPISODES !== 'false',
      autoOptimization: process.env.AUTO_OPTIMIZE_PROMPTS !== 'false',
      batchSize: parseInt(process.env.LEARNING_BATCH_SIZE) || 5,
      processingInterval: 300000 // 5 minutes
    };
    
    // Processing state
    this.isProcessing = false;
    this.processingTimer = null;
    
    // Statistics
    this.stats = {
      totalEpisodes: 0,
      analyzedEpisodes: 0,
      approvedSuggestions: 0,
      optimizedPrompts: 0,
      implementedPrompts: 0,
      cycleTime: {
        average: 0,
        min: Infinity,
        max: 0
      }
    };
  }

  /**
   * Initialize the learning system
   */
  async initialize() {
    if (!this.config.enabled) {
      this.logger.info('Learning system is disabled');
      return;
    }

    try {
      // Import and initialize components
      const { EpisodeDetector } = await import('./episode-detector.js');
      const { ProblemDatabase } = await import('./problem-database.js');
      const { PromptSuggestionAdmin } = await import('../admin/prompt-suggestion-admin.js');
      const { PromptOptimizerAgent } = await import('../agents/prompt-optimizer.js');
      const { PromptImplementationWorkflow } = await import('./prompt-implementation-workflow.js');
      const { LearningDatabaseInitializer } = await import('./database-initializer.js');

      // Initialize learning database first
      this.logger.info('Initializing learning database structure');
      const dbInitializer = new LearningDatabaseInitializer(this.mongoClient, this.logger);
      const dbInitResult = await dbInitializer.initialize();
      
      this.logger.info('Learning database initialization result', dbInitResult);

      // Initialize components
      this.episodeDetector = new EpisodeDetector(this.logger, this.mongoClient);
      this.problemDatabase = new ProblemDatabase(this.logger, this.mongoClient);
      this.promptAdmin = new PromptSuggestionAdmin(this.logger, this.problemDatabase, this.eventEmitter);
      this.promptOptimizer = new PromptOptimizerAgent(this.logger, this.agentHub);
      this.implementationWorkflow = new PromptImplementationWorkflow(
        this.logger, 
        this.problemDatabase, 
        this.eventEmitter
      );

      // Initialize all components
      await Promise.all([
        this.episodeDetector.initialize(),
        this.problemDatabase.initialize(),
        this.implementationWorkflow.initialize()
      ]);

      // Set up event handlers
      this.setupEventHandlers();

      // Start automatic processing if enabled
      if (this.config.autoAnalysis || this.config.autoOptimization) {
        this.startAutomaticProcessing();
      }

      this.logger.info('Learning system coordinator initialized', {
        enabled: this.config.enabled,
        autoAnalysis: this.config.autoAnalysis,
        autoOptimization: this.config.autoOptimization,
        batchSize: this.config.batchSize
      });

    } catch (error) {
      this.logger.error('Failed to initialize learning system', error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the learning cycle
   */
  setupEventHandlers() {
    // Episode completed -> trigger analysis
    this.episodeDetector.on('episode-completed', async (episode) => {
      if (this.config.autoAnalysis) {
        await this.analyzeEpisode(episode);
      }
    });

    // Suggestion approved -> trigger optimization
    this.eventEmitter.on('suggestion-approved', async (event) => {
      if (this.config.autoOptimization) {
        await this.optimizeSuggestion(event.suggestionId);
      }
    });

    // Episode created -> update stats
    this.episodeDetector.on('episode-created', () => {
      this.stats.totalEpisodes++;
    });
  }

  /**
   * Process corrective feedback and create learning episode
   */
  async processCorrectiveFeedback(classificationResult, originalPlan, userFeedback, context) {
    if (!this.config.enabled) return null;

    try {
      const episodeId = await this.episodeDetector.detectCorrectiveFeedback(
        classificationResult,
        originalPlan,
        userFeedback,
        context
      );

      if (episodeId) {
        this.logger.info('Learning episode created from corrective feedback', {
          episodeId,
          userId: context.userId,
          agentUsed: context.agentUsed
        });

        this.emit('learning-episode-created', {
          episodeId,
          context,
          timestamp: new Date()
        });
      }

      return episodeId;
    } catch (error) {
      this.logger.error('Failed to process corrective feedback', error);
      return null;
    }
  }

  /**
   * Complete a learning episode with successful plan
   */
  async completeEpisode(episodeId, successfulPlan) {
    if (!this.config.enabled) return false;

    try {
      const success = await this.episodeDetector.completeEpisode(episodeId, successfulPlan);

      if (success) {
        this.logger.info('Learning episode completed', { episodeId });
        this.emit('learning-episode-completed', { episodeId, timestamp: new Date() });
      }

      return success;
    } catch (error) {
      this.logger.error('Failed to complete episode', error, { episodeId });
      return false;
    }
  }

  /**
   * Analyze a completed learning episode
   */
  async analyzeEpisode(episode) {
    try {
      const cycleStart = Date.now();

      this.logger.debug('Analyzing learning episode', { episodeId: episode.episodeId });

      // Get analyst agent
      const analystAgent = await this.agentHub.getAgent('analyst');
      if (!analystAgent) {
        throw new Error('Analyst agent not available');
      }

      // Perform analysis
      const analysisResult = await analystAgent.analyzeLearningEpisode(episode, {
        qualityMode: 'pro'
      });

      // Store analysis in problem database
      const suggestionId = await this.problemDatabase.storeProblemSuggestion(analysisResult);

      // Update statistics
      this.stats.analyzedEpisodes++;
      this.updateCycleTime(Date.now() - cycleStart);

      this.logger.info('Episode analysis completed', {
        episodeId: episode.episodeId,
        suggestionId,
        sourceAgent: analysisResult.sourceAgent
      });

      this.emit('episode-analyzed', {
        episodeId: episode.episodeId,
        suggestionId,
        analysisResult
      });

      return suggestionId;
    } catch (error) {
      this.logger.error('Episode analysis failed', error, {
        episodeId: episode.episodeId
      });
      throw error;
    }
  }

  /**
   * Optimize an approved suggestion
   */
  async optimizeSuggestion(suggestionId) {
    try {
      this.logger.debug('Optimizing approved suggestion', { suggestionId });

      // Get suggestion details
      const suggestion = await this.problemDatabase.getSuggestion(suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${suggestionId} not found`);
      }

      // Generate optimized prompt
      const optimizationResult = await this.promptOptimizer.executeTask(suggestion, {
        qualityMode: 'pro'
      });

      // Store optimized prompt
      await this.problemDatabase.storeSuggestedPrompt(
        suggestionId,
        optimizationResult.optimizedPrompt,
        optimizationResult.optimizerMetadata
      );

      // Update statistics
      this.stats.optimizedPrompts++;

      this.logger.info('Prompt optimization completed', {
        suggestionId,
        sourceAgent: suggestion.sourceAgent,
        confidence: optimizationResult.confidence
      });

      this.emit('prompt-optimized', {
        suggestionId,
        optimizationResult
      });

      return optimizationResult;
    } catch (error) {
      this.logger.error('Prompt optimization failed', error, { suggestionId });
      throw error;
    }
  }

  /**
   * Implement an optimized prompt
   */
  async implementOptimizedPrompt(suggestionId, implementedBy, options = {}) {
    try {
      this.logger.info('Implementing optimized prompt', { suggestionId, implementedBy });

      // Get suggestion and optimized prompt
      const suggestion = await this.problemDatabase.getSuggestion(suggestionId);
      if (!suggestion) {
        throw new Error(`Suggestion ${suggestionId} not found`);
      }

      if (!suggestion.suggestedPrompt) {
        throw new Error('No optimized prompt available for suggestion');
      }

      // Prepare optimization data
      const optimizedPrompt = {
        optimizedPrompt: suggestion.suggestedPrompt,
        confidence: suggestion.confidence,
        sourceAgent: suggestion.sourceAgent
      };

      // Execute implementation
      const implementationResult = await this.implementationWorkflow.startImplementation(
        suggestionId,
        optimizedPrompt,
        implementedBy,
        options
      );

      // Update statistics
      this.stats.implementedPrompts++;

      this.logger.info('Prompt implementation completed', {
        suggestionId,
        implementationId: implementationResult.implementationId,
        duration: implementationResult.duration
      });

      this.emit('prompt-implemented', {
        suggestionId,
        implementationResult
      });

      return implementationResult;
    } catch (error) {
      this.logger.error('Prompt implementation failed', error, { suggestionId });
      throw error;
    }
  }

  /**
   * Start automatic processing of learning episodes
   */
  startAutomaticProcessing() {
    if (this.processingTimer) return;

    this.processingTimer = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processLearningQueue();
      }
    }, this.config.processingInterval);

    this.logger.info('Automatic learning processing started', {
      interval: this.config.processingInterval
    });
  }

  /**
   * Process learning queue automatically
   */
  async processLearningQueue() {
    if (!this.config.enabled || this.isProcessing) return;

    this.isProcessing = true;

    try {
      // Process completed episodes for analysis
      if (this.config.autoAnalysis) {
        const episodes = await this.episodeDetector.getEpisodesForAnalysis(this.config.batchSize);
        
        for (const episode of episodes) {
          try {
            await this.analyzeEpisode(episode);
            await this.episodeDetector.markEpisodeAnalyzed(episode.episodeId, { analyzed: true });
          } catch (error) {
            this.logger.error('Failed to process episode in queue', error, {
              episodeId: episode.episodeId
            });
          }
        }
      }

      // Process approved suggestions for optimization
      if (this.config.autoOptimization) {
        const suggestions = await this.problemDatabase.getApprovedSuggestions(this.config.batchSize);
        
        for (const suggestion of suggestions) {
          try {
            await this.optimizeSuggestion(suggestion._id);
          } catch (error) {
            this.logger.error('Failed to process suggestion in queue', error, {
              suggestionId: suggestion._id
            });
          }
        }
      }

    } catch (error) {
      this.logger.error('Learning queue processing failed', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get system statistics
   */
  async getSystemStatistics() {
    const episodeStats = this.episodeDetector.getStatistics();
    const problemDbStats = await this.problemDatabase.getStatistics();
    const optimizerStats = this.promptOptimizer.getStatistics();
    const implementationStats = this.implementationWorkflow.getStatistics();

    return {
      system: { ...this.stats },
      episodes: episodeStats,
      problems: problemDbStats,
      optimization: optimizerStats,
      implementation: implementationStats,
      processing: {
        enabled: this.config.enabled,
        isProcessing: this.isProcessing,
        autoAnalysis: this.config.autoAnalysis,
        autoOptimization: this.config.autoOptimization
      }
    };
  }

  /**
   * Get learning system health
   */
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      issues: [],
      components: {
        episodeDetector: this.episodeDetector ? 'active' : 'inactive',
        problemDatabase: this.problemDatabase ? 'active' : 'inactive',
        promptOptimizer: this.promptOptimizer ? 'active' : 'inactive',
        implementationWorkflow: this.implementationWorkflow ? 'active' : 'inactive'
      }
    };

    if (!this.config.enabled) {
      health.status = 'disabled';
      health.issues.push('Learning system is disabled');
    }

    if (this.isProcessing && this.processingTimer) {
      health.components.automaticProcessing = 'active';
    }

    if (this.stats.totalEpisodes === 0) {
      health.issues.push('No learning episodes recorded yet');
    }

    // Check database health
    try {
      const { LearningDatabaseInitializer } = await import('./database-initializer.js');
      const dbInitializer = new LearningDatabaseInitializer(this.mongoClient, this.logger);
      const dbHealth = await dbInitializer.getHealthStatus();
      
      health.database = dbHealth;
      
      if (dbHealth.status !== 'healthy') {
        health.issues.push(`Database unhealthy: ${dbHealth.error || 'Unknown issue'}`);
      }
    } catch (error) {
      health.issues.push(`Database health check failed: ${error.message}`);
    }

    if (health.issues.length > 0) {
      health.status = health.issues.some(issue => issue.includes('disabled')) ? 'disabled' : 'degraded';
    }

    return health;
  }

  /**
   * Manual trigger for processing specific episodes
   */
  async processEpisode(episodeId) {
    const episodes = await this.episodeDetector.getEpisodesForAnalysis(100);
    const episode = episodes.find(e => e.episodeId === episodeId);

    if (!episode) {
      throw new Error(`Episode ${episodeId} not found or not ready for analysis`);
    }

    return await this.analyzeEpisode(episode);
  }

  /**
   * Get admin interface router
   */
  getAdminRouter() {
    return this.promptAdmin ? this.promptAdmin.getRouter() : null;
  }

  /**
   * Helper methods
   */
  updateCycleTime(duration) {
    this.stats.cycleTime.average = 
      (this.stats.cycleTime.average + duration) / 2;
    this.stats.cycleTime.min = Math.min(this.stats.cycleTime.min, duration);
    this.stats.cycleTime.max = Math.max(this.stats.cycleTime.max, duration);
  }

  /**
   * Shutdown the learning system
   */
  async shutdown() {
    this.logger.info('Learning system coordinator shutting down...');

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    // Shutdown components
    if (this.episodeDetector) {
      this.episodeDetector.shutdown();
    }

    if (this.promptAdmin) {
      this.promptAdmin.shutdown();
    }

    if (this.implementationWorkflow) {
      this.implementationWorkflow.shutdown();
    }

    this.logger.info('Learning system coordinator shutdown completed', {
      totalEpisodes: this.stats.totalEpisodes,
      analyzedEpisodes: this.stats.analyzedEpisodes,
      implementedPrompts: this.stats.implementedPrompts
    });
  }
}

export { LearningSystemCoordinator };