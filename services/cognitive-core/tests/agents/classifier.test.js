// ==========================================
// COGNITIVE CORE SERVICE - Classifier Agent Tests
// ==========================================

import { ClassifierAgent } from '../../src/agents/classifier.js';

describe('ClassifierAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new ClassifierAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should classify build request correctly', async () => {
      const userMessage = 'Create a login screen with email and password fields';
      const context = { qualityMode: 'standard' };

      const expectedClassification = {
        intent: 'build_request',
        sentiment: 'neutral',
        tasks: ['Create a login screen with email and password fields'],
        questions: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, context);

      expect(result.intent).toBe('build_request');
      expect(result.sentiment).toBe('neutral');
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toContain('login screen');
      expect(result.questions).toHaveLength(0);
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'classifier',
        'Message classified',
        expect.objectContaining({
          intent: 'build_request',
          sentiment: 'neutral',
          taskCount: 1,
          questionCount: 0
        })
      );
    });

    it('should classify question about flow correctly', async () => {
      const userMessage = 'How do I add validation to my form fields?';
      
      const expectedClassification = {
        intent: 'question_about_flow',
        sentiment: 'neutral',
        tasks: [],
        questions: ['How do I add validation to my form fields?']
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.intent).toBe('question_about_flow');
      expect(result.sentiment).toBe('neutral');
      expect(result.tasks).toHaveLength(0);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toContain('validation');
    });

    it('should classify meta question correctly', async () => {
      const userMessage = 'What can you help me with?';
      
      const expectedClassification = {
        intent: 'meta_question',
        sentiment: 'neutral',
        tasks: [],
        questions: ['What can you help me with?']
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.intent).toBe('meta_question');
      expect(result.sentiment).toBe('neutral');
      expect(result.questions[0]).toContain('What can you help');
    });

    it('should classify positive sentiment correctly', async () => {
      const userMessage = 'Perfect! That looks great, please implement it.';
      
      const expectedClassification = {
        intent: 'build_request',
        sentiment: 'positive',
        tasks: ['Implement the suggested solution'],
        questions: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.sentiment).toBe('positive');
      expect(result.intent).toBe('build_request');
    });

    it('should classify corrective sentiment correctly', async () => {
      const userMessage = 'No, that\'s wrong. Change the button to red instead.';
      
      const expectedClassification = {
        intent: 'build_request',
        sentiment: 'corrective',
        tasks: ['Change the button to red instead'],
        questions: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.sentiment).toBe('corrective');
      expect(result.intent).toBe('build_request');
    });

    it('should classify general conversation correctly', async () => {
      const userMessage = 'Hello there!';
      
      const expectedClassification = {
        intent: 'general_conversation',
        sentiment: 'positive',
        tasks: [],
        questions: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.intent).toBe('general_conversation');
      expect(result.sentiment).toBe('positive');
    });

    it('should handle multiple tasks in one message', async () => {
      const userMessage = 'Create a login screen and add a forgot password link';
      
      const expectedClassification = {
        intent: 'build_request',
        sentiment: 'neutral',
        tasks: [
          'Create a login screen',
          'Add a forgot password link'
        ],
        questions: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toContain('login screen');
      expect(result.tasks[1]).toContain('forgot password');
    });

    it('should handle mixed tasks and questions', async () => {
      const userMessage = 'Add a submit button and how do I make it more accessible?';
      
      const expectedClassification = {
        intent: 'build_request',
        sentiment: 'neutral',
        tasks: ['Add a submit button'],
        questions: ['How do I make it more accessible?']
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedClassification)
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.tasks).toHaveLength(1);
      expect(result.questions).toHaveLength(1);
      expect(result.tasks[0]).toContain('submit button');
      expect(result.questions[0]).toContain('accessible');
    });

    it('should validate response structure and throw error for missing fields', async () => {
      const userMessage = 'Test message';
      
      // Mock invalid response (missing required fields)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'build_request'
            // Missing sentiment, tasks, questions
          })
        }
      });

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('Classifier response missing required field');
    });

    it('should validate intent values', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'invalid_intent',
            sentiment: 'neutral',
            tasks: [],
            questions: []
          })
        }
      });

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('Invalid intent: invalid_intent');
    });

    it('should validate sentiment values', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'build_request',
            sentiment: 'invalid_sentiment',
            tasks: [],
            questions: []
          })
        }
      });

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('Invalid sentiment: invalid_sentiment');
    });

    it('should validate tasks and questions are arrays', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'build_request',
            sentiment: 'neutral',
            tasks: 'not an array',
            questions: []
          })
        }
      });

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('Tasks and questions must be arrays');
    });

    it('should handle AI model errors gracefully', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('AI model timeout')
      );

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('AI model timeout');
    });

    it('should use correct quality mode', async () => {
      const userMessage = 'Test message';
      const context = { qualityMode: 'pro' };
      
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'build_request',
            sentiment: 'neutral',
            tasks: [],
            questions: []
          })
        }
      });

      await agent.executeTask(userMessage, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const input = 'Create a user dashboard';
      const context = {};

      const description = agent.getTaskDescription(input, context);

      expect(description).toContain('Classifying user message');
      expect(description).toContain('Create a user dashboard...');
    });

    it('should truncate long messages in descriptions', () => {
      const longInput = 'A'.repeat(100);
      
      const description = agent.getTaskDescription(longInput, {});
      
      expect(description.length).toBeLessThan(100);
      expect(description).toContain('...');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            intent: 'build_request',
            sentiment: 'neutral',
            tasks: [],
            questions: []
          })
        }
      });

      await agent.process(userMessage, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'classifier',
        expect.any(String),
        expect.stringContaining('Classifying user message')
      );
    });

    it('should emit task completed event on success', async () => {
      const userMessage = 'Test message';
      const expectedResult = {
        intent: 'build_request',
        sentiment: 'neutral',
        tasks: [],
        questions: []
      };
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(userMessage, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'classifier',
        expect.any(String),
        expectedResult
      );
    });
  });
});