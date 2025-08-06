// ==========================================
// COGNITIVE CORE SERVICE - Synthesizer Agent Tests
// ==========================================

import { SynthesizerAgent } from '../../src/agents/synthesizer.js';

describe('SynthesizerAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new SynthesizerAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should synthesize plan response correctly', async () => {
      const input = null;
      const context = {
        userMessage: 'Create a login flow',
        plan: [
          { task: 'Create login screen', reasoning: 'User requested login functionality' },
          { task: 'Add email field', reasoning: 'Email is required for authentication' },
          { task: 'Add password field', reasoning: 'Password is required for security' }
        ],
        qualityMode: 'standard'
      };

      const expectedResponse = {
        message: 'I\'ll help you create a login flow. Here\'s my detailed plan with 3 steps that covers screen creation, email field, and password field implementation.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResponse)
        }
      });

      const result = await agent.executeTask(input, context);

      expect(result.message).toContain('login flow');
      expect(result.message).toContain('plan');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'synthesizer',
        'Response synthesized',
        expect.objectContaining({
          hasPlan: true,
          hasAnswer: false,
          hasError: false
        })
      );
    });

    it('should synthesize answer response correctly', async () => {
      const input = null;
      const context = {
        userMessage: 'How do I make my forms more accessible?',
        answer: 'To make forms more accessible, use proper labels, ARIA attributes, keyboard navigation support, and high contrast colors. Follow WCAG 2.1 guidelines for best results.',
        qualityMode: 'standard'
      };

      const expectedResponse = {
        message: 'Great question about form accessibility! To make your forms more accessible, you should use proper labels for all input fields, implement ARIA attributes for screen readers, ensure full keyboard navigation support, and maintain high contrast colors. Following WCAG 2.1 guidelines will give you the best results for inclusive design.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResponse)
        }
      });

      const result = await agent.executeTask(input, context);

      expect(result.message).toContain('accessible');
      expect(result.message).toContain('WCAG');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'synthesizer',
        'Response synthesized',
        expect.objectContaining({
          hasPlan: false,
          hasAnswer: true,
          hasError: false
        })
      );
    });

    it('should synthesize error response correctly', async () => {
      const input = null;
      const context = {
        userMessage: 'Create an impossible flow',
        error: 'The requested flow configuration violates UX principles and cannot be implemented',
        qualityMode: 'standard'
      };

      const expectedResponse = {
        message: 'I encountered an issue with your request. The requested flow configuration violates UX principles and cannot be implemented. Let me suggest an alternative approach that would work better for your users.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResponse)
        }
      });

      const result = await agent.executeTask(input, context);

      expect(result.message).toContain('issue');
      expect(result.message).toContain('alternative');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'synthesizer',
        'Response synthesized',
        expect.objectContaining({
          hasPlan: false,
          hasAnswer: false,
          hasError: true
        })
      );
    });

    it('should synthesize complex response with plan and answer', async () => {
      const input = null;
      const context = {
        userMessage: 'Create a signup form and explain validation best practices',
        plan: [
          { task: 'Create signup form', reasoning: 'User wants registration flow' },
          { task: 'Add validation', reasoning: 'Ensure data quality' }
        ],
        answer: 'Validation best practices include real-time feedback, clear error messages, and progressive enhancement.',
        qualityMode: 'pro'
      };

      const expectedResponse = {
        message: 'I\'ll help you create a signup form with proper validation. Here\'s my plan for implementation, plus some best practices: Real-time validation provides immediate feedback, clear error messages help users understand issues, and progressive enhancement ensures the form works everywhere.'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResponse)
        }
      });

      const result = await agent.executeTask(input, context);

      expect(result.message).toContain('signup form');
      expect(result.message).toContain('validation');
      expect(result.message).toContain('best practices');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'synthesizer',
        'Response synthesized',
        expect.objectContaining({
          hasPlan: true,
          hasAnswer: true,
          hasError: false
        })
      );
    });

    it('should handle empty context gracefully', async () => {
      const input = null;
      const context = {
        userMessage: 'Hello',
        qualityMode: 'standard'
      };

      const expectedResponse = {
        message: 'Hello! I\'m here to help you with UX flow design. What would you like to create today?'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResponse)
        }
      });

      const result = await agent.executeTask(input, context);

      expect(result.message).toContain('Hello');
      expect(result.message).toContain('UX flow design');
    });

    it('should validate response has required message field', async () => {
      const input = null;
      const context = {
        userMessage: 'Test',
        qualityMode: 'standard'
      };

      // Mock invalid response (missing message field)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            response: 'Missing message field'
          })
        }
      });

      await expect(agent.executeTask(input, context))
        .rejects
        .toThrow('Synthesizer must return a message field with string content');
    });

    it('should validate message field is string', async () => {
      const input = null;
      const context = {
        userMessage: 'Test',
        qualityMode: 'standard'
      };

      // Mock invalid response (message is not string)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: 123 // Not a string
          })
        }
      });

      await expect(agent.executeTask(input, context))
        .rejects
        .toThrow('Synthesizer must return a message field with string content');
    });

    it('should use correct quality mode', async () => {
      const input = null;
      const context = {
        userMessage: 'Test message',
        qualityMode: 'pro'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: 'Test response'
          })
        }
      });

      await agent.executeTask(input, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should include all context information in synthesis', async () => {
      const input = null;
      const context = {
        userMessage: 'Create a complex dashboard',
        plan: [{ task: 'Dashboard task', reasoning: 'Dashboard reasoning' }],
        answer: 'Dashboard best practices',
        error: null,
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: 'Comprehensive dashboard response'
          })
        }
      });

      await agent.executeTask(input, context);

      // Verify the prompt includes all context parts
      const calledPrompt = mockContext.models.standard.generateContent.mock.calls[0][0];
      expect(calledPrompt).toContain('GENERIERTER PLAN');
      expect(calledPrompt).toContain('ANTWORT AUF FRAGE');
      expect(calledPrompt).toContain('Create a complex dashboard');
    });

    it('should handle AI model errors gracefully', async () => {
      const input = null;
      const context = {
        userMessage: 'Test message',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('AI model failed')
      );

      await expect(agent.executeTask(input, context))
        .rejects
        .toThrow('AI model failed');
    });

    it('should track message length in logs', async () => {
      const input = null;
      const context = {
        userMessage: 'Test',
        plan: [{ task: 'Test task', reasoning: 'Test reasoning' }],
        qualityMode: 'standard'
      };

      const longMessage = 'A'.repeat(500);
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: longMessage
          })
        }
      });

      await agent.executeTask(input, context);

      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'synthesizer',
        'Response synthesized',
        expect.objectContaining({
          messageLength: 500
        })
      );
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const input = null;
      const context = {};

      const description = agent.getTaskDescription(input, context);

      expect(description).toBe('Synthesizing response from multiple agent results');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const input = null;
      const context = {
        userMessage: 'Test',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: 'Test response'
          })
        }
      });

      await agent.process(input, context);

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'synthesizer',
        expect.any(String),
        'Synthesizing response from multiple agent results'
      );
    });

    it('should emit task completed event on success', async () => {
      const input = null;
      const context = {
        userMessage: 'Test',
        qualityMode: 'standard'
      };

      const expectedResult = {
        message: 'Test response'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(input, context);

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'synthesizer',
        expect.any(String),
        expectedResult
      );
    });
  });
});