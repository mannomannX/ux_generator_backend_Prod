// ==========================================
// COGNITIVE CORE SERVICE - Agent Orchestrator Tests
// ==========================================

import { AgentOrchestrator } from '../../src/orchestrator/agent-orchestrator.js';

describe('AgentOrchestrator', () => {
  let orchestrator;
  let mockLogger;
  let mockEventEmitter;
  let mockMongoClient;
  let mockRedisClient;

  beforeEach(() => {
    mockLogger = global.createMockLogger();
    mockEventEmitter = global.createMockEventEmitter();
    mockMongoClient = {
      connect: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' })
    };
    mockRedisClient = {
      connect: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({ status: 'ok' }),
      set: jest.fn(),
      get: jest.fn()
    };

    // Mock environment variable
    process.env.GOOGLE_API_KEY = 'test-key';

    orchestrator = new AgentOrchestrator(
      mockLogger,
      mockEventEmitter,
      mockMongoClient,
      mockRedisClient
    );
  });

  describe('initialization', () => {
    it('should initialize all required agents', () => {
      const availableAgents = orchestrator.getAvailableAgents();
      
      expect(availableAgents).toContain('manager');
      expect(availableAgents).toContain('planner');
      expect(availableAgents).toContain('architect');
      expect(availableAgents).toContain('validator');
      expect(availableAgents).toContain('classifier');
      expect(availableAgents).toContain('synthesizer');
      expect(availableAgents).toContain('uxExpert');
      expect(availableAgents).toContain('visualInterpreter');
      expect(availableAgents).toContain('analyst');
      
      expect(availableAgents).toHaveLength(9);
    });

    it('should initialize Google Gemini models', () => {
      expect(orchestrator.models).toBeDefined();
      expect(orchestrator.models.standard).toBeDefined();
      expect(orchestrator.models.pro).toBeDefined();
    });

    it('should initialize conversation state map', () => {
      expect(orchestrator.conversationStates).toBeInstanceOf(Map);
    });
  });

  describe('agent invocation', () => {
    it('should invoke agent successfully', async () => {
      // Mock agent response
      const mockResult = { intent: 'build_request', sentiment: 'neutral' };
      jest.spyOn(orchestrator.agents.classifier, 'process')
        .mockResolvedValue(mockResult);

      const result = await orchestrator.invokeAgent('classifier', 'Test message', {});

      expect(result).toEqual(mockResult);
      expect(orchestrator.agents.classifier.process).toHaveBeenCalledWith('Test message', {});
      expect(mockLogger.logAgentAction).toHaveBeenCalledWith(
        'classifier',
        'Agent invocation completed',
        { success: true, resultType: 'object' }
      );
    });

    it('should throw error for unknown agent', async () => {
      await expect(orchestrator.invokeAgent('unknownAgent', 'Test', {}))
        .rejects
        .toThrow("Agent 'unknownAgent' not found");
    });

    it('should handle agent processing errors', async () => {
      jest.spyOn(orchestrator.agents.classifier, 'process')
        .mockRejectedValue(new Error('Agent failed'));

      await expect(orchestrator.invokeAgent('classifier', 'Test', {}))
        .rejects
        .toThrow('Agent failed');

      expect(mockLogger.logAgentAction).toHaveBeenCalledWith(
        'classifier',
        'Agent invocation failed',
        { error: 'Agent failed' }
      );
    });
  });

  describe('user message processing', () => {
    beforeEach(() => {
      // Mock all agents
      jest.spyOn(orchestrator.agents.classifier, 'process').mockResolvedValue({
        intent: 'build_request',
        sentiment: 'neutral',
        tasks: ['Create login screen'],
        questions: []
      });
      
      jest.spyOn(orchestrator.agents.manager, 'process').mockResolvedValue({
        type: 'planner_task',
        task: 'Create login screen with email and password',
        complexity: 'simple'
      });
      
      jest.spyOn(orchestrator.agents.planner, 'process').mockResolvedValue([
        { task: 'Add login screen node', reasoning: 'User requested login functionality' }
      ]);
      
      jest.spyOn(orchestrator.agents.synthesizer, 'process').mockResolvedValue({
        message: 'I\'ll help you create a login screen. Here\'s my plan:'
      });

      jest.spyOn(orchestrator, 'getConversationContext').mockResolvedValue({
        fullContext: 'Test context',
        improvementSuggestion: null,
        currentFlow: { nodes: [], edges: [] },
        knowledgeContext: 'Basic UX principles'
      });
    });

    it('should process build request successfully', async () => {
      const result = await orchestrator.processUserMessage(
        'user123',
        'project456',
        'Create a login screen',
        'standard'
      );

      expect(result.type).toBe('plan_for_approval');
      expect(result.plan).toHaveLength(1);
      expect(result.metadata.complexity).toBe('simple');
      expect(result.metadata.agentsInvolved).toContain('planner');
    });

    it('should handle clarification questions', async () => {
      jest.spyOn(orchestrator.agents.manager, 'process').mockResolvedValue({
        type: 'clarification_question',
        question: 'What type of screen do you want?'
      });

      const result = await orchestrator.processUserMessage(
        'user123',
        'project456',
        'Create something',
        'standard'
      );

      expect(result.type).toBe('clarification_needed');
      expect(result.message).toBe('What type of screen do you want?');
    });

    it('should process question_about_flow intent', async () => {
      jest.spyOn(orchestrator.agents.classifier, 'process').mockResolvedValue({
        intent: 'question_about_flow',
        sentiment: 'neutral',
        tasks: [],
        questions: ['How do I add validation?']
      });

      jest.spyOn(orchestrator.agents.uxExpert, 'process').mockResolvedValue({
        answer: 'You can add validation by using the validation property on input elements.'
      });

      const result = await orchestrator.processUserMessage(
        'user123',
        'project456',
        'How do I add validation?',
        'standard'
      );

      expect(result.type).toBe('answer');
      expect(result.message).toContain('validation property');
    });

    it('should handle meta questions', async () => {
      jest.spyOn(orchestrator.agents.classifier, 'process').mockResolvedValue({
        intent: 'meta_question',
        sentiment: 'neutral',
        tasks: [],
        questions: ['What can you do?']
      });

      const result = await orchestrator.processUserMessage(
        'user123',
        'project456',
        'What can you do?',
        'standard'
      );

      expect(result.type).toBe('answer');
      expect(result.message).toContain('AI-powered UX Flow design assistant');
    });

    it('should handle processing errors gracefully', async () => {
      jest.spyOn(orchestrator.agents.classifier, 'process')
        .mockRejectedValue(new Error('Classifier failed'));

      await expect(orchestrator.processUserMessage(
        'user123',
        'project456',
        'Test message',
        'standard'
      )).rejects.toThrow('Classifier failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'User message processing failed',
        expect.any(Error),
        expect.objectContaining({
          userId: 'user123',
          projectId: 'project456'
        })
      );
    });
  });

  describe('conversation state management', () => {
    it('should update conversation state', async () => {
      const conversationId = 'user123-project456';
      const state = {
        lastMessage: 'Test message',
        lastResponse: { type: 'answer', message: 'Test response' },
        timestamp: new Date()
      };

      await orchestrator.updateConversationState(conversationId, state);

      expect(orchestrator.conversationStates.get(conversationId)).toEqual(state);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `conversation:${conversationId}`,
        state,
        3600
      );
    });

    it('should get conversation context', async () => {
      const context = await orchestrator.getConversationContext('user123', 'project456');

      expect(context).toHaveProperty('fullContext');
      expect(context).toHaveProperty('currentFlow');
      expect(context).toHaveProperty('knowledgeContext');
    });
  });

  describe('health checks', () => {
    it('should check Gemini health successfully', async () => {
      const health = await orchestrator.checkGeminiHealth();

      expect(health.status).toBe('ok');
      expect(health.model).toBe('gemini-1.5-flash');
    });

    it('should handle Gemini health check failure', async () => {
      // Mock Gemini API failure
      orchestrator.models.standard.generateContent.mockRejectedValue(
        new Error('API unavailable')
      );

      const health = await orchestrator.checkGeminiHealth();

      expect(health.status).toBe('error');
      expect(health.error).toBe('API unavailable');
    });
  });

  describe('workflow integration', () => {
    it('should handle complete workflow from classification to synthesis', async () => {
      // Setup complete workflow mocks
      jest.spyOn(orchestrator.agents.classifier, 'process').mockResolvedValue({
        intent: 'build_request',
        sentiment: 'positive',
        tasks: ['Create dashboard'],
        questions: []
      });

      jest.spyOn(orchestrator.agents.manager, 'process').mockResolvedValue({
        type: 'planner_task',
        task: 'Create dashboard with widgets',
        complexity: 'complex'
      });

      jest.spyOn(orchestrator.agents.planner, 'process').mockResolvedValue([
        { task: 'Add dashboard screen', reasoning: 'Main container' },
        { task: 'Add widget components', reasoning: 'Data display' }
      ]);

      jest.spyOn(orchestrator.agents.synthesizer, 'process').mockResolvedValue({
        message: 'I\'ll create a dashboard with multiple widgets for you.'
      });

      const result = await orchestrator.processUserMessage(
        'user123',
        'project456',
        'Create a dashboard with widgets',
        'pro'
      );

      // Verify complete workflow
      expect(orchestrator.agents.classifier.process).toHaveBeenCalled();
      expect(orchestrator.agents.manager.process).toHaveBeenCalled();
      expect(orchestrator.agents.planner.process).toHaveBeenCalled();
      expect(orchestrator.agents.synthesizer.process).toHaveBeenCalled();

      expect(result.type).toBe('plan_for_approval');
      expect(result.plan).toHaveLength(2);
      expect(result.metadata.complexity).toBe('complex');
    });
  });
});