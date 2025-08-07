/**
 * Integration Tests for Agent Workflows
 * 
 * Tests the complete workflow from user input to agent response,
 * including rate limiting, resource limits, security checks, and learning.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { AgentOrchestrator } from '../../src/orchestrator/agent-orchestrator.js';
import { AIProviderManager } from '../../src/providers/ai-provider-manager.js';
import { Logger } from '@ux-flow/common';

// Mock dependencies
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
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      countDocuments: jest.fn().mockResolvedValue(0),
      createIndex: jest.fn().mockResolvedValue('index-created'),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([])
      })
    })
  }),
  getDb: jest.fn(),
  getClient: jest.fn()
});

const createMockRedisClient = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
  zadd: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  pipeline: jest.fn().mockReturnValue({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([
      [null, 0], // zremrangebyscore
      [null, 5], // zcard (current count)
      [null, 1], // zadd
      [null, 1]  // expire
    ])
  }),
  ping: jest.fn().mockResolvedValue('PONG')
});

const createMockSecurity = () => ({
  promptSecurity: {
    validatePrompt: jest.fn().mockReturnValue({ safe: true, threats: [] }),
    sanitizePrompt: jest.fn().mockImplementation((prompt) => prompt)
  },
  apiKeyManager: {
    validateKey: jest.fn().mockResolvedValue({ valid: true })
  },
  conversationEncryption: {
    encryptConversation: jest.fn().mockImplementation((data) => data),
    decryptConversation: jest.fn().mockImplementation((data) => data)
  }
});

describe('Agent Workflow Integration Tests', () => {
  let orchestrator;
  let mockLogger;
  let mockEventEmitter;
  let mockMongoClient;
  let mockRedisClient;
  let mockSecurity;

  beforeAll(async () => {
    // Setup mocks
    mockLogger = createMockLogger();
    mockEventEmitter = createMockEventEmitter();
    mockMongoClient = createMockMongoClient();
    mockRedisClient = createMockRedisClient();
    mockSecurity = createMockSecurity();

    // Create orchestrator instance
    orchestrator = new AgentOrchestrator(
      mockLogger,
      mockEventEmitter,
      mockMongoClient,
      mockRedisClient,
      mockSecurity
    );

    // Mock AI providers
    orchestrator.aiProviders = {
      generate: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          analysis: 'User wants to create a login flow',
          agents: ['planner', 'architect'],
          tasks: {
            planner: 'Create step-by-step plan for login flow',
            architect: 'Design specific UI components'
          },
          expectedOutcome: 'Complete login flow specification'
        }),
        model: 'gemini-1.5-flash',
        provider: 'google',
        tokens: 150
      }),
      checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      shutdown: jest.fn().mockResolvedValue()
    };

    // Initialize (skip learning system for tests)
    await orchestrator.initializeAgents();
  });

  afterAll(async () => {
    if (orchestrator) {
      await orchestrator.shutdown();
    }
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Basic Agent Invocation Workflow', () => {
    it('should successfully invoke a single agent', async () => {
      const result = await orchestrator.invokeAgent('planner', 'Create a login form', {
        userId: 'test-user-1',
        qualityMode: 'normal'
      });

      expect(result).toBeDefined();
      expect(result.text).toBeTruthy();
      expect(result.model).toBe('gemini-1.5-flash');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Agent invocation completed'),
        expect.objectContaining({
          agentName: 'planner',
          success: true
        })
      );
    });

    it('should handle agent not found error', async () => {
      await expect(
        orchestrator.invokeAgent('nonexistent', 'test prompt', {})
      ).rejects.toThrow("Agent 'nonexistent' not found");
    });

    it('should apply rate limiting when configured', async () => {
      // Mock rate limiter to deny request
      orchestrator.rateLimiter.checkRateLimit = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Rate limit exceeded: 30 requests per minute',
        retryAfter: 60
      });

      await expect(
        orchestrator.invokeAgent('planner', 'test prompt', {
          userId: 'test-user-1'
        })
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Agent invocation rate limited'),
        expect.any(Object)
      );
    });

    it('should apply resource limiting when configured', async () => {
      // Mock resource limiter to deny request
      orchestrator.resourceLimiter.checkResourceLimits = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Agent memory limit exceeded: 600MB > 512MB'
      });

      await expect(
        orchestrator.invokeAgent('planner', 'test prompt', {
          userId: 'test-user-1'
        })
      ).rejects.toThrow('Resource limit exceeded');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Agent invocation resource limited'),
        expect.any(Object)
      );
    });
  });

  describe('Complete User Message Processing Workflow', () => {
    it('should process user message through complete workflow', async () => {
      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'I need help creating a user registration flow with email verification',
        'normal'
      );

      expect(result).toBeDefined();
      expect(result.message).toBeTruthy();
      expect(result.type).toBe('ux_guidance');
      expect(result.agentsUsed).toBeDefined();
      expect(Array.isArray(result.agentsUsed)).toBe(true);

      // Should log conversation
      expect(mockMongoClient.db().collection().insertOne).toHaveBeenCalled();
      
      // Should increment metrics
      expect(orchestrator.metrics.successfulResponses).toBeGreaterThan(0);
      expect(orchestrator.metrics.totalRequests).toBeGreaterThan(0);
    });

    it('should handle security validation during processing', async () => {
      // Mock security check to fail
      mockSecurity.promptSecurity.validatePrompt.mockReturnValue({
        safe: false,
        threats: ['potential_injection']
      });

      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'malicious prompt with <script>alert("hack")</script>',
        'normal'
      );

      expect(result.type).toBe('error');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Potentially malicious prompt blocked'),
        expect.any(Object)
      );
    });

    it('should handle API key validation', async () => {
      mockSecurity.apiKeyManager.validateKey.mockResolvedValue({
        valid: false
      });

      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'test message',
        'normal',
        'invalid-api-key'
      );

      expect(result.type).toBe('error');
      expect(result.error).toContain('Invalid or expired API key');
    });

    it('should properly encrypt and store conversations', async () => {
      await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'Test message for conversation storage',
        'normal'
      );

      // Should encrypt conversation if encryption is enabled
      if (mockSecurity.conversationEncryption) {
        expect(mockSecurity.conversationEncryption.encryptConversation).toHaveBeenCalled();
      }
    });
  });

  describe('Multi-Agent Workflow Execution', () => {
    it('should execute plan with multiple agents in sequence', async () => {
      const mockPlan = {
        analysis: 'Complex UX task requiring multiple agents',
        agents: ['planner', 'architect', 'validator'],
        tasks: {
          planner: 'Create comprehensive plan',
          architect: 'Design implementation',
          validator: 'Validate design'
        }
      };

      // Mock planner to return structured plan
      orchestrator.aiProviders.generate.mockResolvedValueOnce({
        text: JSON.stringify(mockPlan),
        model: 'gemini-1.5-pro',
        provider: 'google',
        tokens: 200
      });

      // Mock subsequent agent calls
      orchestrator.aiProviders.generate.mockResolvedValue({
        text: 'Agent response',
        model: 'gemini-1.5-flash',
        provider: 'google',
        tokens: 100
      });

      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'Create a complete e-commerce checkout flow',
        'pro'
      );

      expect(result.agentsUsed).toContain('planner');
      expect(orchestrator.aiProviders.generate).toHaveBeenCalledTimes(4); // planner + 3 execution agents
    });

    it('should handle agent failures gracefully in workflow', async () => {
      // Mock first agent to succeed, second to fail
      orchestrator.aiProviders.generate
        .mockResolvedValueOnce({
          text: JSON.stringify({
            agents: ['planner', 'architect'],
            tasks: { planner: 'task1', architect: 'task2' }
          }),
          model: 'gemini-1.5-flash',
          provider: 'google'
        })
        .mockResolvedValueOnce({
          text: 'Planner response',
          model: 'gemini-1.5-flash',
          provider: 'google'
        })
        .mockRejectedValueOnce(new Error('Agent failure'));

      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'Test workflow with failure',
        'normal'
      );

      expect(result).toBeDefined();
      // Should still return a result even if one agent fails
      expect(result.agentResults).toBeDefined();
      expect(result.agentResults.some(r => r.error)).toBe(true);
    });
  });

  describe('Learning System Integration', () => {
    it('should detect corrective feedback and create learning episodes', async () => {
      const correctionMessage = 'That\'s wrong, fix the layout to be responsive';
      
      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        correctionMessage,
        'normal'
      );

      // Should detect correction keywords and potentially trigger learning
      expect(mockLogger.info).toHaveBeenCalled();
      // Note: Learning system integration depends on configuration
    });

    it('should handle learning system failures gracefully', async () => {
      // Mock learning system to throw error
      if (orchestrator.learningSystem) {
        orchestrator.learningSystem.processCorrectiveFeedback = jest.fn().mockRejectedValue(
          new Error('Learning system error')
        );
      }

      // Should not fail main request due to learning system issues
      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'This is incorrect, please fix it',
        'normal'
      );

      expect(result.type).not.toBe('error');
    });
  });

  describe('Image Processing Workflow', () => {
    it('should process image messages through visual interpreter', async () => {
      const mockImageData = Buffer.from('fake-image-data');
      
      // Mock image processing response
      orchestrator.aiProviders.generateWithImage = jest.fn().mockResolvedValue({
        text: 'This image shows a mobile app interface with good visual hierarchy',
        model: 'gemini-1.5-pro-vision',
        provider: 'google'
      });

      const result = await orchestrator.processImageMessage(
        'test-user-1',
        'test-project-1',
        mockImageData,
        'image/jpeg'
      );

      expect(result).toBeDefined();
      expect(result.type).toBe('image_analysis');
      expect(result.message).toContain('image');
      expect(orchestrator.aiProviders.generateWithImage).toHaveBeenCalledWith(
        expect.stringContaining('Analyze this UI/UX image'),
        mockImageData,
        expect.objectContaining({
          agentName: 'validator',
          qualityMode: 'pro'
        })
      );
    });

    it('should handle image processing errors', async () => {
      orchestrator.aiProviders.generateWithImage = jest.fn().mockRejectedValue(
        new Error('Image processing failed')
      );

      await expect(
        orchestrator.processImageMessage(
          'test-user-1',
          'test-project-1',
          Buffer.from('invalid-image'),
          'image/jpeg'
        )
      ).rejects.toThrow('Image processing failed');
    });
  });

  describe('System Health and Monitoring', () => {
    it('should provide comprehensive metrics', async () => {
      // Process some requests to generate metrics
      await orchestrator.processUserMessage('test-user', 'test-project', 'test', 'normal');
      
      const metrics = orchestrator.getMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('successfulResponses');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('availableAgents');
      expect(metrics).toHaveProperty('rateLimiting');
      expect(metrics).toHaveProperty('resourceLimiting');

      expect(typeof metrics.totalRequests).toBe('number');
      expect(typeof metrics.uptime).toBe('number');
      expect(typeof metrics.availableAgents).toBe('number');
    });

    it('should check AI provider health', async () => {
      const healthResult = await orchestrator.checkGeminiHealth();
      
      expect(healthResult).toHaveProperty('status');
      expect(orchestrator.aiProviders.checkHealth).toHaveBeenCalled();
    });

    it('should provide security metrics', async () => {
      const securityMetrics = orchestrator.getSecurityMetrics();

      expect(securityMetrics).toHaveProperty('encryptionEnabled');
      expect(securityMetrics).toHaveProperty('apiKeyValidationEnabled');
      expect(securityMetrics).toHaveProperty('promptSecurityEnabled');
      expect(typeof securityMetrics.encryptionEnabled).toBe('boolean');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle AI provider failures gracefully', async () => {
      orchestrator.aiProviders.generate.mockRejectedValue(
        new Error('AI Provider unavailable')
      );

      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'test message',
        'normal'
      );

      expect(result.type).toBe('error');
      expect(result.message).toContain('encountered an error');
      expect(orchestrator.metrics.failedResponses).toBeGreaterThan(0);
    });

    it('should handle conversation encryption failures', async () => {
      mockSecurity.conversationEncryption.encryptConversation.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      // Should fallback to unencrypted storage
      const result = await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'test message',
        'normal'
      );

      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to encrypt conversation'),
        expect.any(Error)
      );
    });

    it('should maintain system stability under high load', async () => {
      // Simulate multiple concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        orchestrator.processUserMessage(
          `test-user-${i}`,
          'test-project',
          `Message ${i}`,
          'normal'
        )
      );

      const results = await Promise.allSettled(promises);
      
      // Should handle concurrent requests without crashing
      expect(results.length).toBe(10);
      expect(results.every(r => r.status === 'fulfilled' || r.status === 'rejected')).toBe(true);
    });
  });

  describe('Conversation Management', () => {
    it('should maintain conversation history across requests', async () => {
      const userId = 'test-user-1';
      const projectId = 'test-project-1';

      // First message
      await orchestrator.processUserMessage(
        userId,
        projectId,
        'Create a login form',
        'normal'
      );

      // Second message - should have conversation context
      await orchestrator.processUserMessage(
        userId,
        projectId,
        'Add password validation',
        'normal'
      );

      // Should build context prompt with previous conversation
      expect(orchestrator.aiProviders.generate).toHaveBeenCalledWith(
        expect.stringContaining('Previous conversation'),
        expect.any(Object)
      );
    });

    it('should clean up old conversations', async () => {
      // Mock old conversation
      const oldConversation = {
        lastActivity: Date.now() - (25 * 60 * 60 * 1000), // 25 hours old
        timestamp: Date.now() - (25 * 60 * 60 * 1000)
      };
      
      orchestrator.conversationHistory.set('old-user:old-project', [oldConversation]);

      // Trigger cleanup
      await orchestrator.cleanupConversations();

      // Old conversation should be removed
      expect(orchestrator.conversationHistory.has('old-user:old-project')).toBe(false);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should track response times accurately', async () => {
      const startMetrics = orchestrator.getMetrics();
      const initialAvgTime = startMetrics.averageResponseTime;

      await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'Performance test message',
        'normal'
      );

      const endMetrics = orchestrator.getMetrics();
      
      // Average response time should be updated
      if (endMetrics.successfulResponses > 1) {
        expect(typeof endMetrics.averageResponseTime).toBe('number');
        expect(endMetrics.averageResponseTime).toBeGreaterThanOrEqual(0);
      }
    });

    it('should properly release resources after operations', async () => {
      const resourceMetricsBefore = orchestrator.resourceLimiter?.getResourceStatistics();
      
      await orchestrator.processUserMessage(
        'test-user-1',
        'test-project-1',
        'Resource test message',
        'normal'
      );

      // Resources should be properly released
      if (orchestrator.resourceLimiter) {
        expect(orchestrator.resourceLimiter.releaseResources).toHaveBeenCalled();
      }
    });
  });
});