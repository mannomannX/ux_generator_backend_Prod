// ==========================================
// COGNITIVE CORE SERVICE - Validator Agent Tests
// ==========================================

import { ValidatorAgent } from '../../src/agents/validator.js';

describe('ValidatorAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new ValidatorAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should validate correct transactions successfully', async () => {
      const transactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_login',
            type: 'Screen',
            position: { x: 100, y: 100 },
            data: { title: 'Login Screen' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_start_login',
            source: 'start',
            target: 'n_login',
            data: { trigger: 'onLoad' }
          }
        }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'start', type: 'Start' }
          ],
          edges: []
        },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'OK',
        issues: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('OK');
      expect(result.issues).toHaveLength(0);
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'validator',
        'Validation completed',
        expect.objectContaining({
          status: 'OK',
          issueCount: 0,
          transactionCount: 2
        })
      );
    });

    it('should detect validation errors in transactions', async () => {
      const transactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_orphaned',
            type: 'Screen',
            position: { x: 100, y: 100 },
            data: { title: 'Orphaned Screen' }
          }
        }
        // Missing edge - this will create an orphaned node
      ];

      const context = {
        currentFlow: {
          nodes: [{ id: 'start', type: 'Start' }],
          edges: []
        },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'ERROR',
        issues: [
          'Orphaned node detected: n_orphaned has no incoming or outgoing connections',
          'Missing connection from start node to new screen'
        ]
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('ERROR');
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toContain('Orphaned node');
      expect(result.issues[1]).toContain('Missing connection');
    });

    it('should validate API Call -> Decision pattern', async () => {
      const transactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_api_call',
            type: 'API Call',
            data: { endpoint: '/login' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_api_to_success',
            source: 'n_api_call',
            target: 'n_success_screen',
            data: { trigger: 'onSuccess' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_api_to_error',
            source: 'n_api_call',
            target: 'n_error_screen',
            data: { trigger: 'onError' }
          }
        }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'n_success_screen', type: 'Screen' },
            { id: 'n_error_screen', type: 'Screen' }
          ],
          edges: []
        },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'ERROR',
        issues: [
          'API Call node should connect to a Decision node, not directly to multiple endpoints'
        ]
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('ERROR');
      expect(result.issues[0]).toContain('Decision node');
    });

    it('should validate transaction structure', async () => {
      const transactions = [
        {
          action: 'INVALID_ACTION',
          payload: { id: 'test' }
        }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'ERROR',
        issues: [
          'Invalid transaction action: INVALID_ACTION',
          'Valid actions are: ADD_NODE, UPDATE_NODE, DELETE_NODE, ADD_EDGE, DELETE_EDGE'
        ]
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('ERROR');
      expect(result.issues).toContain('Invalid transaction action: INVALID_ACTION');
    });

    it('should validate flow connectivity', async () => {
      const transactions = [
        {
          action: 'DELETE_EDGE',
          payload: {
            id: 'e_critical_connection'
          }
        }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'start', type: 'Start' },
            { id: 'screen1', type: 'Screen' },
            { id: 'end', type: 'End' }
          ],
          edges: [
            { id: 'e_critical_connection', source: 'start', target: 'screen1' },
            { id: 'e_screen_to_end', source: 'screen1', target: 'end' }
          ]
        },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'ERROR',
        issues: [
          'Removing edge e_critical_connection would create unreachable nodes',
          'Start node would not connect to any screens'
        ]
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('ERROR');
      expect(result.issues).toContain('unreachable nodes');
    });

    it('should validate complex flow with multiple paths', async () => {
      const transactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_decision',
            type: 'Decision',
            data: { condition: 'user.isLoggedIn' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_decision_true',
            source: 'n_decision',
            target: 'n_dashboard',
            data: { trigger: 'if_true' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_decision_false',
            source: 'n_decision',
            target: 'n_login',
            data: { trigger: 'if_false' }
          }
        }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'n_dashboard', type: 'Screen' },
            { id: 'n_login', type: 'Screen' }
          ],
          edges: []
        },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'OK',
        issues: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('OK');
      expect(result.issues).toHaveLength(0);
    });

    it('should validate response structure and throw error for invalid status', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      // Mock invalid response (invalid status)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'INVALID_STATUS',
            issues: []
          })
        }
      });

      await expect(agent.executeTask(transactions, context))
        .rejects
        .toThrow('Validator must return status field with OK or ERROR');
    });

    it('should validate issues field is array', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      // Mock invalid response (issues is not array)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'OK',
            issues: 'not an array'
          })
        }
      });

      await expect(agent.executeTask(transactions, context))
        .rejects
        .toThrow('Validator must return issues array');
    });

    it('should handle empty transactions array', async () => {
      const transactions = [];
      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'OK',
        issues: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      const result = await agent.executeTask(transactions, context);

      expect(result.status).toBe('OK');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'validator',
        'Validation completed',
        expect.objectContaining({
          transactionCount: 0
        })
      );
    });

    it('should use correct quality mode', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'pro'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'OK',
            issues: []
          })
        }
      });

      await agent.executeTask(transactions, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should handle AI model errors gracefully', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('Validation model failed')
      );

      await expect(agent.executeTask(transactions, context))
        .rejects
        .toThrow('Validation model failed');
    });

    it('should include transaction details in logs', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'n1' } },
        { action: 'ADD_EDGE', payload: { id: 'e1' } }
      ];

      const context = {
        currentFlow: { nodes: [{ id: 'existing' }], edges: [] },
        qualityMode: 'standard'
      };

      const expectedValidation = {
        status: 'ERROR',
        issues: ['Test issue']
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedValidation)
        }
      });

      await agent.executeTask(transactions, context);

      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'validator',
        'Validation completed',
        expect.objectContaining({
          status: 'ERROR',
          issueCount: 1,
          transactionCount: 2,
          issues: ['Test issue']
        })
      );
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test1' } },
        { action: 'ADD_EDGE', payload: { id: 'test2' } }
      ];
      const context = {};

      const description = agent.getTaskDescription(transactions, context);

      expect(description).toBe('Validating 2 transactions');
    });

    it('should handle empty transactions in description', () => {
      const transactions = [];
      const context = {};

      const description = agent.getTaskDescription(transactions, context);

      expect(description).toBe('Validating 0 transactions');
    });

    it('should handle non-array input in description', () => {
      const transactions = null;
      const context = {};

      const description = agent.getTaskDescription(transactions, context);

      expect(description).toBe('Validating 0 transactions');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'OK',
            issues: []
          })
        }
      });

      await agent.process(transactions, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'validator',
        expect.any(String),
        'Validating 1 transactions'
      );
    });

    it('should emit task completed event on success', async () => {
      const transactions = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      const expectedResult = {
        status: 'OK',
        issues: []
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(transactions, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'validator',
        expect.any(String),
        expectedResult
      );
    });
  });
});