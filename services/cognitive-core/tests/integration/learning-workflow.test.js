/**
 * Integration Tests for Learning System Workflows
 * 
 * Tests the complete learning pipeline from episode detection through
 * analysis, optimization, and prompt implementation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { LearningSystemCoordinator } from '../../src/learning/learning-system-coordinator.js';
import { EpisodeDetector } from '../../src/learning/episode-detector.js';
import { ProblemDatabase } from '../../src/learning/problem-database.js';
import { PromptOptimizerAgent } from '../../src/agents/prompt-optimizer.js';

// Mock utilities
const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
});

const createMockEventEmitter = () => ({
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
});

const createMockMongoClient = () => ({
  db: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis()
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      createIndex: jest.fn().mockResolvedValue('index-created'),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      })
    }),
    createCollection: jest.fn().mockResolvedValue({}),
    listCollections: jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { name: 'episodes' },
        { name: 'prompt_suggestions' }
      ])
    })
  })
});

const createMockAgentHub = () => ({
  getAgent: jest.fn().mockReturnValue({
    analyzeLearningEpisode: jest.fn().mockResolvedValue({
      sourceAgent: 'planner',
      problemCategory: 'completeness',
      detectedProblem: 'Agent creates incomplete flow structures',
      rootCause: 'Missing validation for required flow elements',
      recommendation: 'Add validation rules for mandatory flow components',
      confidence: 0.85,
      priority: 'high',
      implementationHint: 'Update planner prompt validation section'
    })
  })
});

describe('Learning System Workflow Integration Tests', () => {
  let learningCoordinator;
  let mockLogger;
  let mockEventEmitter;
  let mockMongoClient;
  let mockAgentHub;

  beforeAll(async () => {
    mockLogger = createMockLogger();
    mockEventEmitter = createMockEventEmitter();
    mockMongoClient = createMockMongoClient();
    mockAgentHub = createMockAgentHub();

    // Mock environment for learning system
    process.env.ENABLE_LEARNING_SYSTEM = 'true';
    process.env.AUTO_ANALYZE_EPISODES = 'true';
    process.env.AUTO_OPTIMIZE_PROMPTS = 'true';
  });

  beforeEach(async () => {
    // Create fresh instance for each test
    learningCoordinator = new LearningSystemCoordinator(
      mockLogger,
      mockMongoClient,
      mockAgentHub,
      mockEventEmitter
    );

    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.ENABLE_LEARNING_SYSTEM;
    delete process.env.AUTO_ANALYZE_EPISODES;
    delete process.env.AUTO_OPTIMIZE_PROMPTS;
  });

  describe('Learning System Initialization', () => {
    it('should initialize all learning components successfully', async () => {
      await learningCoordinator.initialize();

      expect(learningCoordinator.episodeDetector).toBeDefined();
      expect(learningCoordinator.problemDatabase).toBeDefined();
      expect(learningCoordinator.promptOptimizer).toBeDefined();
      expect(learningCoordinator.implementationWorkflow).toBeDefined();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Learning system coordinator initialized'),
        expect.any(Object)
      );
    });

    it('should skip initialization when disabled', async () => {
      process.env.ENABLE_LEARNING_SYSTEM = 'false';
      
      const disabledCoordinator = new LearningSystemCoordinator(
        mockLogger,
        mockMongoClient,
        mockAgentHub,
        mockEventEmitter
      );

      await disabledCoordinator.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Learning system is disabled');
      expect(disabledCoordinator.episodeDetector).toBeNull();
    });

    it('should setup database structure during initialization', async () => {
      await learningCoordinator.initialize();

      // Should create database collections and indexes
      const dbMock = mockMongoClient.db();
      expect(dbMock.createCollection).toHaveBeenCalled();
      expect(dbMock.collection().createIndex).toHaveBeenCalled();
    });
  });

  describe('Episode Detection and Creation Workflow', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should create learning episode from corrective feedback', async () => {
      const classificationResult = {
        sentiment: 'corrective',
        intent: 'correction',
        tasks: ['improve_response'],
        questions: []
      };

      const originalPlan = 'Create login form with username field';
      const userFeedback = 'This is wrong, also add password field and validation';
      const context = {
        userId: 'test-user-1',
        projectId: 'test-project-1',
        agentUsed: 'planner',
        qualityMode: 'normal'
      };

      const episodeId = await learningCoordinator.processCorrectiveFeedback(
        classificationResult,
        originalPlan,
        userFeedback,
        context
      );

      expect(episodeId).toBeDefined();
      expect(typeof episodeId).toBe('string');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Learning episode created from corrective feedback'),
        expect.objectContaining({
          episodeId,
          userId: context.userId,
          agentUsed: context.agentUsed
        })
      );
    });

    it('should complete episode with successful plan', async () => {
      const episodeId = 'test-episode-1';
      const successfulPlan = 'Create login form with username, password, and validation';

      const success = await learningCoordinator.completeEpisode(episodeId, successfulPlan);

      expect(success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Learning episode completed'),
        expect.objectContaining({ episodeId })
      );
    });

    it('should handle episode completion gracefully when episode not found', async () => {
      const success = await learningCoordinator.completeEpisode('nonexistent-episode', 'plan');

      expect(success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to complete episode'),
        expect.any(Error),
        expect.objectContaining({ episodeId: 'nonexistent-episode' })
      );
    });
  });

  describe('Episode Analysis Workflow', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should analyze completed episode successfully', async () => {
      const mockEpisode = {
        episodeId: 'episode-123',
        userId: 'test-user-1',
        agentUsed: 'planner',
        originalPlan: 'Create simple form',
        userFeedback: 'Add validation and better styling',
        successfulPlan: 'Create form with validation and improved styling',
        classification: {
          sentiment: 'corrective',
          intent: 'correction'
        }
      };

      const suggestionId = await learningCoordinator.analyzeEpisode(mockEpisode);

      expect(suggestionId).toBeDefined();
      expect(mockAgentHub.getAgent).toHaveBeenCalledWith('analyst');
      expect(learningCoordinator.stats.analyzedEpisodes).toBe(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Episode analysis completed'),
        expect.objectContaining({
          episodeId: mockEpisode.episodeId,
          suggestionId
        })
      );
    });

    it('should handle analyst agent not available', async () => {
      mockAgentHub.getAgent.mockReturnValue(null);

      const mockEpisode = {
        episodeId: 'episode-123',
        agentUsed: 'planner'
      };

      await expect(learningCoordinator.analyzeEpisode(mockEpisode))
        .rejects.toThrow('Analyst agent not available');
    });

    it('should update cycle time statistics during analysis', async () => {
      const mockEpisode = {
        episodeId: 'episode-456',
        agentUsed: 'architect'
      };

      await learningCoordinator.analyzeEpisode(mockEpisode);

      expect(learningCoordinator.stats.cycleTime.average).toBeGreaterThan(0);
      expect(learningCoordinator.stats.cycleTime.min).toBeGreaterThan(0);
    });
  });

  describe('Prompt Optimization Workflow', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should optimize approved suggestion successfully', async () => {
      const suggestionId = 'suggestion-789';
      
      // Mock problem database to return suggestion
      learningCoordinator.problemDatabase = {
        getSuggestion: jest.fn().mockResolvedValue({
          _id: suggestionId,
          sourceAgent: 'planner',
          detectedProblem: 'Missing validation logic',
          confidence: 0.8,
          status: 'approved'
        }),
        storeSuggestedPrompt: jest.fn().mockResolvedValue('prompt-123')
      };

      // Mock prompt optimizer
      learningCoordinator.promptOptimizer = {
        executeTask: jest.fn().mockResolvedValue({
          optimizedPrompt: 'Improved prompt with validation logic...',
          confidence: 0.85,
          optimizerMetadata: {
            version: '1.0.0',
            optimizedAt: new Date()
          }
        }),
        getStatistics: jest.fn().mockReturnValue({})
      };

      const optimizationResult = await learningCoordinator.optimizeSuggestion(suggestionId);

      expect(optimizationResult).toBeDefined();
      expect(optimizationResult.optimizedPrompt).toContain('validation logic');
      expect(learningCoordinator.stats.optimizedPrompts).toBe(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Prompt optimization completed'),
        expect.objectContaining({
          suggestionId,
          confidence: 0.85
        })
      );
    });

    it('should handle missing suggestion during optimization', async () => {
      learningCoordinator.problemDatabase = {
        getSuggestion: jest.fn().mockResolvedValue(null)
      };

      await expect(learningCoordinator.optimizeSuggestion('nonexistent-suggestion'))
        .rejects.toThrow('Suggestion nonexistent-suggestion not found');
    });
  });

  describe('Prompt Implementation Workflow', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should implement optimized prompt successfully', async () => {
      const suggestionId = 'suggestion-impl-1';
      const implementedBy = 'admin-user';

      // Mock dependencies
      learningCoordinator.problemDatabase = {
        getSuggestion: jest.fn().mockResolvedValue({
          _id: suggestionId,
          sourceAgent: 'architect',
          suggestedPrompt: 'Optimized architect prompt...',
          confidence: 0.9
        })
      };

      learningCoordinator.implementationWorkflow = {
        startImplementation: jest.fn().mockResolvedValue({
          success: true,
          implementationId: 'impl-123',
          duration: 5000
        })
      };

      const implementationResult = await learningCoordinator.implementOptimizedPrompt(
        suggestionId,
        implementedBy,
        { testMode: true }
      );

      expect(implementationResult.success).toBe(true);
      expect(implementationResult.implementationId).toBe('impl-123');
      expect(learningCoordinator.stats.implementedPrompts).toBe(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Prompt implementation completed'),
        expect.objectContaining({
          suggestionId,
          implementationId: 'impl-123'
        })
      );
    });

    it('should handle missing optimized prompt during implementation', async () => {
      learningCoordinator.problemDatabase = {
        getSuggestion: jest.fn().mockResolvedValue({
          _id: 'suggestion-1',
          sourceAgent: 'planner'
          // Missing suggestedPrompt
        })
      };

      await expect(learningCoordinator.implementOptimizedPrompt('suggestion-1', 'admin'))
        .rejects.toThrow('No optimized prompt available for suggestion');
    });
  });

  describe('Automatic Learning Queue Processing', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should process learning queue automatically when enabled', async () => {
      // Mock episodes ready for analysis
      learningCoordinator.episodeDetector = {
        getEpisodesForAnalysis: jest.fn().mockResolvedValue([
          { episodeId: 'ep-1', agentUsed: 'planner' },
          { episodeId: 'ep-2', agentUsed: 'architect' }
        ]),
        markEpisodeAnalyzed: jest.fn().mockResolvedValue(true)
      };

      // Mock problem database with approved suggestions
      learningCoordinator.problemDatabase = {
        getApprovedSuggestions: jest.fn().mockResolvedValue([
          { _id: 'sugg-1', sourceAgent: 'validator' }
        ])
      };

      // Mock analysis method
      learningCoordinator.analyzeEpisode = jest.fn().mockResolvedValue('analysis-123');
      learningCoordinator.optimizeSuggestion = jest.fn().mockResolvedValue({});

      await learningCoordinator.processLearningQueue();

      expect(learningCoordinator.analyzeEpisode).toHaveBeenCalledTimes(2);
      expect(learningCoordinator.optimizeSuggestion).toHaveBeenCalledTimes(1);
      expect(learningCoordinator.episodeDetector.markEpisodeAnalyzed).toHaveBeenCalledTimes(2);
    });

    it('should handle individual episode processing failures in queue', async () => {
      learningCoordinator.episodeDetector = {
        getEpisodesForAnalysis: jest.fn().mockResolvedValue([
          { episodeId: 'ep-fail', agentUsed: 'planner' },
          { episodeId: 'ep-success', agentUsed: 'architect' }
        ]),
        markEpisodeAnalyzed: jest.fn().mockResolvedValue(true)
      };

      learningCoordinator.problemDatabase = {
        getApprovedSuggestions: jest.fn().mockResolvedValue([])
      };

      // Mock first analysis to fail, second to succeed
      learningCoordinator.analyzeEpisode = jest.fn()
        .mockRejectedValueOnce(new Error('Analysis failed'))
        .mockResolvedValueOnce('analysis-success');

      await learningCoordinator.processLearningQueue();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process episode in queue'),
        expect.any(Error),
        expect.objectContaining({ episodeId: 'ep-fail' })
      );

      // Should continue processing other episodes despite failure
      expect(learningCoordinator.analyzeEpisode).toHaveBeenCalledTimes(2);
    });
  });

  describe('Learning System Statistics and Health', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should provide comprehensive system statistics', async () => {
      // Mock component statistics
      learningCoordinator.episodeDetector = {
        getStatistics: jest.fn().mockReturnValue({
          totalEpisodes: 50,
          activeEpisodes: 5
        })
      };

      learningCoordinator.problemDatabase = {
        getStatistics: jest.fn().mockResolvedValue({
          totalSuggestions: 20,
          approvedSuggestions: 8
        })
      };

      learningCoordinator.promptOptimizer = {
        getStatistics: jest.fn().mockReturnValue({
          optimizedPrompts: 5,
          averageConfidence: 0.82
        })
      };

      learningCoordinator.implementationWorkflow = {
        getStatistics: jest.fn().mockReturnValue({
          implementedPrompts: 3,
          successRate: 0.9
        })
      };

      const statistics = await learningCoordinator.getSystemStatistics();

      expect(statistics).toHaveProperty('system');
      expect(statistics).toHaveProperty('episodes');
      expect(statistics).toHaveProperty('problems');
      expect(statistics).toHaveProperty('optimization');
      expect(statistics).toHaveProperty('implementation');

      expect(statistics.episodes.totalEpisodes).toBe(50);
      expect(statistics.problems.totalSuggestions).toBe(20);
      expect(statistics.optimization.optimizedPrompts).toBe(5);
    });

    it('should provide accurate system health status', async () => {
      const health = await learningCoordinator.getSystemHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('database');

      expect(health.components.episodeDetector).toBe('active');
      expect(health.components.problemDatabase).toBe('active');
      expect(health.components.promptOptimizer).toBe('active');
    });

    it('should report disabled status when learning system is off', async () => {
      const disabledCoordinator = new LearningSystemCoordinator(
        mockLogger,
        mockMongoClient,
        mockAgentHub,
        mockEventEmitter
      );
      disabledCoordinator.config.enabled = false;

      const health = await disabledCoordinator.getSystemHealth();

      expect(health.status).toBe('disabled');
      expect(health.issues).toContain('Learning system is disabled');
    });
  });

  describe('Event Handling and Workflow Coordination', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should handle episode-completed events automatically', async () => {
      const mockEpisode = {
        episodeId: 'auto-episode-1',
        agentUsed: 'planner'
      };

      learningCoordinator.analyzeEpisode = jest.fn().mockResolvedValue('auto-analysis-1');

      // Simulate episode completion event
      if (learningCoordinator.episodeDetector?.emit) {
        learningCoordinator.episodeDetector.emit('episode-completed', mockEpisode);
      }

      // Give time for async event handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(learningCoordinator.analyzeEpisode).toHaveBeenCalledWith(mockEpisode);
    });

    it('should handle suggestion-approved events automatically', async () => {
      learningCoordinator.optimizeSuggestion = jest.fn().mockResolvedValue({});

      // Simulate suggestion approval event
      mockEventEmitter.emit('suggestion-approved', {
        suggestionId: 'auto-suggestion-1'
      });

      // Give time for async event handling
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(learningCoordinator.optimizeSuggestion).toHaveBeenCalledWith('auto-suggestion-1');
    });
  });

  describe('Manual Learning Operations', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should process specific episode manually', async () => {
      const episodeId = 'manual-episode-1';

      learningCoordinator.episodeDetector = {
        getEpisodesForAnalysis: jest.fn().mockResolvedValue([
          { episodeId, agentUsed: 'validator' }
        ])
      };

      learningCoordinator.analyzeEpisode = jest.fn().mockResolvedValue('manual-analysis');

      const result = await learningCoordinator.processEpisode(episodeId);

      expect(result).toBe('manual-analysis');
      expect(learningCoordinator.analyzeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({ episodeId })
      );
    });

    it('should handle manual processing of nonexistent episode', async () => {
      learningCoordinator.episodeDetector = {
        getEpisodesForAnalysis: jest.fn().mockResolvedValue([])
      };

      await expect(learningCoordinator.processEpisode('nonexistent'))
        .rejects.toThrow('Episode nonexistent not found or not ready for analysis');
    });
  });

  describe('Learning System Shutdown', () => {
    beforeEach(async () => {
      await learningCoordinator.initialize();
    });

    it('should shutdown all components gracefully', async () => {
      // Mock component shutdown methods
      learningCoordinator.episodeDetector = {
        shutdown: jest.fn()
      };
      learningCoordinator.promptAdmin = {
        shutdown: jest.fn()
      };
      learningCoordinator.implementationWorkflow = {
        shutdown: jest.fn()
      };

      await learningCoordinator.shutdown();

      expect(learningCoordinator.episodeDetector.shutdown).toHaveBeenCalled();
      expect(learningCoordinator.promptAdmin.shutdown).toHaveBeenCalled();
      expect(learningCoordinator.implementationWorkflow.shutdown).toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Learning system coordinator shutdown completed'),
        expect.objectContaining({
          totalEpisodes: learningCoordinator.stats.totalEpisodes,
          implementedPrompts: learningCoordinator.stats.implementedPrompts
        })
      );
    });
  });
});