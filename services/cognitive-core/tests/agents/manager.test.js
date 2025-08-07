// ==========================================
// COGNITIVE CORE - Manager Agent Unit Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ManagerAgent } from '../../src/agents/manager.js';
import { 
  testTasks, 
  testAgentResponses, 
  testContexts,
  mockServices 
} from '../fixtures/test-data.js';

describe('ManagerAgent', () => {
  let managerAgent;
  let mockContext;
  let mockAIProvider;

  beforeEach(() => {
    // Setup mock AI provider
    mockAIProvider = {
      generateResponse: jest.fn(),
      generateStreamResponse: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      getModel: jest.fn().mockReturnValue('gpt-4')
    };

    // Setup mock context
    mockContext = {
      logger: mockServices.logger,
      config: {
        defaultModel: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000
      },
      aiProvider: mockAIProvider
    };

    managerAgent = new ManagerAgent(mockContext);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeTask', () => {
    it('should successfully delegate a simple task', async () => {
      const { userMessage, context } = testTasks.simple;
      
      // Mock AI response
      mockAIProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify(testAgentResponses.manager.success)
      });

      const result = await managerAgent.executeTask(userMessage, context);

      expect(result).toMatchObject({
        type: 'task_delegation',
        delegatedTo: 'planner',
        task: expect.stringContaining('login')
      });
      
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Manager processing task'),
        expect.any(Object)
      );
    });

    it('should request clarification for ambiguous tasks', async () => {
      const userMessage = 'Do something with the interface';
      
      mockAIProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify(testAgentResponses.manager.clarification)
      });

      const result = await managerAgent.executeTask(userMessage, testContexts.newProject);

      expect(result).toMatchObject({
        type: 'clarification_needed',
        question: expect.any(String),
        options: expect.any(Array)
      });
    });

    it('should handle complex tasks by delegating to architect', async () => {
      const { userMessage, context } = testTasks.complex;
      
      mockAIProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify({
          type: 'task_delegation',
          delegatedTo: 'architect',
          task: userMessage,
          complexity: 'complex'
        })
      });

      const result = await managerAgent.executeTask(userMessage, context);

      expect(result.delegatedTo).toBe('architect');
      expect(result.complexity).toBe('complex');
    });

    it('should include project context in task analysis', async () => {
      const { userMessage } = testTasks.simple;
      const context = testContexts.existingProject;
      
      mockAIProvider.generateResponse.mockResolvedValue({
        content: JSON.stringify(testAgentResponses.manager.success)
      });

      await managerAgent.executeTask(userMessage, context);

      // Verify context was passed to AI
      expect(mockAIProvider.generateResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(userMessage)
            })
          ])
        })
      );
    });

    it('should handle AI provider errors gracefully', async () => {
      const { userMessage, context } = testTasks.simple;
      
      mockAIProvider.generateResponse.mockRejectedValue(
        new Error('AI service unavailable')
      );

      await expect(
        managerAgent.executeTask(userMessage, context)
      ).rejects.toThrow('AI service unavailable');

      expect(mockContext.logger.error).toHaveBeenCalled();
    });

    it('should parse and validate AI responses', async () => {
      const { userMessage, context } = testTasks.simple;
      
      // Mock invalid JSON response
      mockAIProvider.generateResponse.mockResolvedValue({
        content: 'Invalid JSON response'
      });

      await expect(
        managerAgent.executeTask(userMessage, context)
      ).rejects.toThrow();
    });

    it('should handle streaming responses when enabled', async () => {
      const { userMessage, context } = testTasks.simple;
      const streamContext = { ...context, stream: true };
      
      // Mock streaming response
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { content: '{"type":"task_' };
          yield { content: 'delegation","delegatedTo":"planner"' };
          yield { content: ',"task":"Create login screen"}' };
        }
      };
      
      mockAIProvider.generateStreamResponse.mockResolvedValue(mockStream);

      const result = await managerAgent.executeTask(userMessage, streamContext);

      expect(result).toMatchObject({
        type: 'task_delegation',
        delegatedTo: 'planner'
      });
    });
  });

  describe('analyzeComplexity', () => {
    it('should correctly identify simple tasks', () => {
      const task = 'Add a button to the form';
      const complexity = managerAgent.analyzeComplexity(task);
      
      expect(complexity).toBe('simple');
    });

    it('should correctly identify complex tasks', () => {
      const task = 'Design a complete multi-step checkout flow with payment integration, order review, and confirmation';
      const complexity = managerAgent.analyzeComplexity(task);
      
      expect(complexity).toBe('complex');
    });

    it('should correctly identify medium complexity tasks', () => {
      const task = 'Create a user profile page with edit functionality';
      const complexity = managerAgent.analyzeComplexity(task);
      
      expect(complexity).toBe('medium');
    });
  });

  describe('determineAgent', () => {
    it('should select planner for UI creation tasks', () => {
      const task = 'Create a navigation menu';
      const agent = managerAgent.determineAgent(task, 'simple');
      
      expect(agent).toBe('planner');
    });

    it('should select architect for complex system design', () => {
      const task = 'Design the application architecture';
      const agent = managerAgent.determineAgent(task, 'complex');
      
      expect(agent).toBe('architect');
    });

    it('should select validator for validation tasks', () => {
      const task = 'Check accessibility compliance';
      const agent = managerAgent.determineAgent(task, 'simple');
      
      expect(agent).toBe('validator');
    });

    it('should select analyst for analysis tasks', () => {
      const task = 'Analyze user flow performance';
      const agent = managerAgent.determineAgent(task, 'medium');
      
      expect(agent).toBe('analyst');
    });

    it('should select ux-expert for UX-specific tasks', () => {
      const task = 'Improve the user experience of the checkout process';
      const agent = managerAgent.determineAgent(task, 'medium');
      
      expect(agent).toBe('ux-expert');
    });
  });

  describe('formatContext', () => {
    it('should format context with history', () => {
      const context = testContexts.existingProject;
      const formatted = managerAgent.formatContext(context);
      
      expect(formatted).toContain('Previous conversation');
      expect(formatted).toContain('Current flow');
      expect(formatted).toContain('Project type: mobile');
    });

    it('should handle empty context gracefully', () => {
      const formatted = managerAgent.formatContext({});
      
      expect(formatted).toContain('No previous context');
    });

    it('should include user preferences when available', () => {
      const context = testContexts.existingProject;
      const formatted = managerAgent.formatContext(context);
      
      expect(formatted).toContain('theme');
      expect(formatted).toContain('complexity');
    });
  });

  describe('buildPrompt', () => {
    it('should build a comprehensive prompt', () => {
      const task = 'Create a dashboard';
      const context = testContexts.newProject;
      const prompt = managerAgent.buildPrompt(task, context);
      
      expect(prompt).toContain(task);
      expect(prompt).toContain('Manager Agent');
      expect(prompt).toContain('Analyze');
    });

    it('should include quality mode in prompt', () => {
      const task = 'Create a dashboard';
      const context = { ...testContexts.newProject, quality: 'pro' };
      const prompt = managerAgent.buildPrompt(task, context);
      
      expect(prompt).toContain('pro');
    });
  });
});