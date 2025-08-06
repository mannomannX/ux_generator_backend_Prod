// ==========================================
// COGNITIVE CORE SERVICE - Analyst Agent Tests
// ==========================================

import { AnalystAgent } from '../../src/agents/analyst.js';

describe('AnalystAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new AnalystAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should analyze system logs and provide recommendations', async () => {
      const logData = [
        '2024-01-15T10:30:00Z - Planner: Plan generated with 5 steps',
        '2024-01-15T10:30:05Z - Validator: Plan rejected - Orphaned node detected',
        '2024-01-15T10:30:10Z - Planner: Plan regenerated with 6 steps',
        '2024-01-15T10:30:15Z - Validator: Plan rejected - Missing Decision node after API Call',
        '2024-01-15T10:30:20Z - Planner: Plan regenerated with 7 steps',
        '2024-01-15T10:30:25Z - Validator: Plan approved'
      ];

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'The Planner agent needs better prompt engineering to avoid orphaned nodes and ensure proper API Call → Decision patterns. Add explicit examples in the Planner prompt showing: 1) Every new node must have connecting edges, 2) API Call nodes should always connect to Decision nodes for response handling. This would reduce validation failures from 67% to an expected <10%.',
        sourceAgent: 'planner',
        issuePattern: 'structural_validation_failures',
        confidence: 0.85,
        impactMetrics: {
          currentFailureRate: 0.67,
          expectedImprovement: 0.57,
          affectedWorkflows: ['api_integration', 'complex_flows']
        }
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('Planner agent');
      expect(result.recommendation).toContain('orphaned nodes');
      expect(result.recommendation).toContain('Decision nodes');
      expect(result.sourceAgent).toBe('planner');
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'analyst',
        'Log analysis completed',
        expect.objectContaining({
          logDataLength: expect.any(Number),
          recommendationLength: result.recommendation.length,
          hasSourceAgent: true
        })
      );
    });

    it('should analyze architect validation failures', async () => {
      const logData = [
        'Architect: Generated 5 transactions for login flow',
        'Validator: ERROR - Transaction 2 missing required payload.position',
        'Architect: Generated 4 transactions for signup flow', 
        'Validator: ERROR - Transaction 1 has invalid action type "CREATE_NODE"',
        'Architect: Generated 6 transactions for dashboard',
        'Validator: ERROR - Transaction 3 missing payload.data.title'
      ];

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'The Architect agent prompt should include explicit transaction schema validation. Add template examples showing required fields: action (ADD_NODE/UPDATE_NODE/etc.), payload.position {x, y}, payload.data.title. Consider adding a pre-validation step in the Architect to check transaction structure before output.',
        sourceAgent: 'architect',
        issuePattern: 'transaction_schema_violations',
        confidence: 0.92
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('Architect agent');
      expect(result.recommendation).toContain('transaction schema');
      expect(result.recommendation).toContain('required fields');
      expect(result.sourceAgent).toBe('architect');
    });

    it('should analyze performance degradation patterns', async () => {
      const logData = [
        'Manager: Task completed in 1200ms',
        'Manager: Task completed in 1800ms',
        'Manager: Task completed in 2400ms',
        'Manager: Task completed in 3200ms',
        'Manager: Task failed - timeout after 5000ms',
        'Manager: Task failed - timeout after 5000ms'
      ];

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'Manager agent shows progressive performance degradation (1.2s → 3.2s → timeout). Investigate context size growth in Manager prompt - likely memory leakage or inefficient context building. Implement context truncation strategy and monitor prompt token usage. Consider splitting complex coordination tasks across multiple smaller agents.',
        sourceAgent: 'manager',
        issuePattern: 'performance_degradation',
        confidence: 0.78,
        performanceMetrics: {
          averageResponseTime: 2720,
          timeoutRate: 0.33,
          trend: 'degrading'
        }
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('performance degradation');
      expect(result.recommendation).toContain('context truncation');
      expect(result.sourceAgent).toBe('manager');
    });

    it('should analyze multi-agent workflow inefficiencies', async () => {
      const logData = [
        'Classifier: Intent classified as build_request',
        'Manager: Routing to planner for complex task',
        'Planner: Plan generated with 8 steps',
        'Manager: Plan too complex, requesting simplification',
        'Planner: Simplified plan generated with 4 steps',
        'Architect: Transactions generated from simplified plan',
        'Validator: Plan approved'
      ];

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'The Manager-Planner feedback loop indicates complexity assessment mismatch. Enhance Manager agent prompt with clearer complexity thresholds: simple (1-3 steps), complex (4-6 steps), very_complex (7+ steps). Add examples showing when to request plan simplification upfront rather than after generation to reduce back-and-forth iterations.',
        sourceAgent: 'manager',
        issuePattern: 'workflow_inefficiency',
        confidence: 0.71,
        workflowMetrics: {
          averageIterations: 2.1,
          reworkRate: 0.45
        }
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('complexity assessment');
      expect(result.recommendation).toContain('threshold');
      expect(result.sourceAgent).toBe('manager');
    });

    it('should handle string log data', async () => {
      const logData = 'Single log entry: Planner failed to generate valid flow structure';

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'Limited log data shows Planner flow structure failure. Need more detailed logging to identify root cause. Recommend adding structured error reporting in Planner agent to capture: input complexity, generated step count, validation points, and failure reasons.',
        sourceAgent: 'planner',
        issuePattern: 'insufficient_logging',
        confidence: 0.45
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('Limited log data');
      expect(result.recommendation).toContain('structured error reporting');
    });

    it('should identify prompt engineering opportunities', async () => {
      const logData = [
        'Synthesizer: Generated response with 45 words',
        'Synthesizer: Generated response with 12 words', 
        'Synthesizer: Generated response with 156 words',
        'Synthesizer: Generated response with 8 words',
        'User feedback: Response too brief, needs more detail',
        'User feedback: Response too verbose, prefer concise answers'
      ];

      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'Synthesizer agent shows high variability in response length (8-156 words) causing user satisfaction issues. Add response length guidelines to Synthesizer prompt: aim for 50-100 words for explanations, 20-40 words for confirmations. Include examples of well-balanced responses that provide sufficient detail without overwhelming users.',
        sourceAgent: 'synthesizer',
        issuePattern: 'inconsistent_output_quality',
        confidence: 0.83,
        qualityMetrics: {
          lengthVariability: 0.89,
          userSatisfactionScore: 0.62
        }
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('response length');
      expect(result.recommendation).toContain('guidelines');
      expect(result.sourceAgent).toBe('synthesizer');
    });

    it('should handle empty log data', async () => {
      const logData = [];
      const context = { qualityMode: 'pro' };

      const expectedAnalysis = {
        recommendation: 'No log data provided for analysis. Ensure proper logging is enabled across all agents and that log aggregation systems are functioning correctly.',
        sourceAgent: null,
        issuePattern: 'no_data',
        confidence: 1.0
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnalysis)
        }
      });

      const result = await agent.executeTask(logData, context);

      expect(result.recommendation).toContain('No log data');
      expect(result.sourceAgent).toBeNull();
    });

    it('should validate response structure', async () => {
      const logData = ['Test log entry'];
      const context = { qualityMode: 'pro' };

      // Mock invalid response (missing recommendation field)
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sourceAgent: 'test',
            issuePattern: 'test_issue'
          })
        }
      });

      await expect(agent.executeTask(logData, context))
        .rejects
        .toThrow('Analyst must return a recommendation field with string content');
    });

    it('should validate recommendation field is string', async () => {
      const logData = ['Test log entry'];
      const context = { qualityMode: 'pro' };

      // Mock invalid response (recommendation is not string)
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            recommendation: 123 // Not a string
          })
        }
      });

      await expect(agent.executeTask(logData, context))
        .rejects
        .toThrow('Analyst must return a recommendation field with string content');
    });

    it('should always use pro quality mode', async () => {
      const logData = ['Test log'];
      const context = { qualityMode: 'standard' }; // This should be overridden

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            recommendation: 'Test recommendation'
          })
        }
      });

      await agent.executeTask(logData, context);

      // Should use pro model regardless of context quality mode
      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should handle AI model errors gracefully', async () => {
      const logData = ['Test log'];
      const context = { qualityMode: 'pro' };

      mockContext.models.pro.generateContent.mockRejectedValue(
        new Error('Analyst model failed')
      );

      await expect(agent.executeTask(logData, context))
        .rejects
        .toThrow('Analyst model failed');
    });

    it('should properly format log data in prompt', async () => {
      const logData = [
        'Log entry 1: Important information',
        'Log entry 2: Error occurred',
        'Log entry 3: Recovery completed'
      ];
      const context = { qualityMode: 'pro' };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            recommendation: 'Test recommendation'
          })
        }
      });

      await agent.executeTask(logData, context);

      // Verify the prompt includes formatted log data
      const calledPrompt = mockContext.models.pro.generateContent.mock.calls[0][0];
      expect(calledPrompt).toContain('LOG-DATEN ZUR ANALYSE');
      expect(calledPrompt).toContain('Log entry 1: Important information');
      expect(calledPrompt).toContain('Log entry 2: Error occurred');
      expect(calledPrompt).toContain('Log entry 3: Recovery completed');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const logData = ['Sample log data'];
      const context = {};

      const description = agent.getTaskDescription(logData, context);

      expect(description).toBe('Analyzing system logs for improvement opportunities');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const logData = ['Test log'];
      
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            recommendation: 'Test recommendation'
          })
        }
      });

      await agent.process(logData, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'analyst',
        expect.any(String),
        'Analyzing system logs for improvement opportunities'
      );
    });

    it('should emit task completed event on success', async () => {
      const logData = ['Test log'];
      const expectedResult = {
        recommendation: 'Test recommendation'
      };
      
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(logData, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'analyst',
        expect.any(String),
        expectedResult
      );
    });
  });
});