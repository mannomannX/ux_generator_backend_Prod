// ==========================================
// COGNITIVE CORE SERVICE - Architect Agent Tests
// ==========================================

import { ArchitectAgent } from '../../src/agents/architect.js';

describe('ArchitectAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new ArchitectAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should convert plan to valid transactions', async () => {
      const plan = [
        {
          task: 'Create login screen node',
          reasoning: 'User requested login functionality',
          stepNumber: 1
        },
        {
          task: 'Add email input field',
          reasoning: 'Email is required for authentication',
          stepNumber: 2
        },
        {
          task: 'Connect start to login screen',
          reasoning: 'Establish flow navigation',
          stepNumber: 3
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

      const expectedTransactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_login_screen',
            type: 'Screen',
            position: { x: 200, y: 100 },
            data: {
              title: 'Login',
              elements: [
                {
                  type: 'input',
                  id: 'email',
                  label: 'Email',
                  validation: 'email'
                }
              ]
            }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_start_to_login',
            source: 'start',
            target: 'n_login_screen',
            data: { trigger: 'onLoad' }
          }
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedTransactions)
        }
      });

      const result = await agent.executeTask(plan, context);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('ADD_NODE');
      expect(result[0].payload.type).toBe('Screen');
      expect(result[1].action).toBe('ADD_EDGE');
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'architect',
        'Transactions generated',
        expect.objectContaining({
          transactionCount: 2,
          planStepCount: 3,
          flowNodeCount: 1,
          actions: ['ADD_NODE', 'ADD_EDGE']
        })
      );
    });

    it('should create complex flow with multiple screens and connections', async () => {
      const plan = [
        {
          task: 'Create registration flow',
          reasoning: 'User wants signup process',
          stepNumber: 1
        },
        {
          task: 'Add form validation',
          reasoning: 'Ensure data quality',
          stepNumber: 2
        },
        {
          task: 'Add success screen',
          reasoning: 'Confirm successful registration',
          stepNumber: 3
        }
      ];

      const context = {
        currentFlow: {
          nodes: [{ id: 'start', type: 'Start' }],
          edges: []
        },
        qualityMode: 'pro'
      };

      const expectedTransactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_registration_form',
            type: 'Screen',
            data: { title: 'Registration' }
          }
        },
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_api_register',
            type: 'API Call',
            data: { endpoint: '/api/register' }
          }
        },
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_success_screen',
            type: 'Screen',
            data: { title: 'Welcome!' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_start_to_form',
            source: 'start',
            target: 'n_registration_form'
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_form_to_api',
            source: 'n_registration_form',
            target: 'n_api_register'
          }
        }
      ];

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedTransactions)
        }
      });

      const result = await agent.executeTask(plan, context);

      expect(result).toHaveLength(5);
      expect(result.filter(t => t.action === 'ADD_NODE')).toHaveLength(3);
      expect(result.filter(t => t.action === 'ADD_EDGE')).toHaveLength(2);
    });

    it('should handle existing flow modifications', async () => {
      const plan = [
        {
          task: 'Add forgot password link',
          reasoning: 'Improve user experience',
          stepNumber: 1
        }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'start', type: 'Start' },
            { id: 'login_screen', type: 'Screen', data: { title: 'Login' } },
            { id: 'dashboard', type: 'Screen', data: { title: 'Dashboard' } }
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'login_screen' },
            { id: 'e2', source: 'login_screen', target: 'dashboard' }
          ]
        },
        qualityMode: 'standard'
      };

      const expectedTransactions = [
        {
          action: 'UPDATE_NODE',
          payload: {
            id: 'login_screen',
            data: {
              title: 'Login',
              elements: [
                { type: 'link', id: 'forgot_password', label: 'Forgot Password?' }
              ]
            }
          }
        },
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_forgot_password',
            type: 'Screen',
            data: { title: 'Reset Password' }
          }
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedTransactions)
        }
      });

      const result = await agent.executeTask(plan, context);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('UPDATE_NODE');
      expect(result[0].payload.id).toBe('login_screen');
      expect(result[1].action).toBe('ADD_NODE');
    });

    it('should validate transaction structure', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      // Mock invalid transaction (missing action)
      const invalidTransactions = [
        {
          payload: { id: 'test' }
          // Missing action field
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(invalidTransactions)
        }
      });

      await expect(agent.executeTask(plan, context))
        .rejects
        .toThrow('Transaction 0 missing required fields (action, payload)');
    });

    it('should validate action types', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      // Mock transaction with invalid action
      const invalidTransactions = [
        {
          action: 'INVALID_ACTION',
          payload: { id: 'test' }
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(invalidTransactions)
        }
      });

      await expect(agent.executeTask(plan, context))
        .rejects
        .toThrow('Invalid transaction action: INVALID_ACTION');
    });

    it('should handle empty plan gracefully', async () => {
      const plan = [];
      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([])
        }
      });

      const result = await agent.executeTask(plan, context);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should require array response from AI', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      // Mock non-array response
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            message: 'Not an array'
          })
        }
      });

      await expect(agent.executeTask(plan, context))
        .rejects
        .toThrow('Architect must return an array of transactions');
    });

    it('should handle complex decision flows with API calls', async () => {
      const plan = [
        {
          task: 'Create login with authentication',
          reasoning: 'Secure user access',
          stepNumber: 1
        }
      ];

      const context = {
        currentFlow: {
          nodes: [{ id: 'start', type: 'Start' }],
          edges: []
        },
        qualityMode: 'pro'
      };

      const expectedTransactions = [
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_login',
            type: 'Screen',
            data: { title: 'Login' }
          }
        },
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_api_auth',
            type: 'API Call',
            data: { endpoint: '/api/auth' }
          }
        },
        {
          action: 'ADD_NODE',
          payload: {
            id: 'n_auth_decision',
            type: 'Decision',
            data: { condition: 'api_response.success === true' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_login_to_api',
            source: 'n_login',
            target: 'n_api_auth',
            data: { trigger: 'onSubmit' }
          }
        },
        {
          action: 'ADD_EDGE',
          payload: {
            id: 'e_api_to_decision',
            source: 'n_api_auth',
            target: 'n_auth_decision',
            data: { trigger: 'onResponse' }
          }
        }
      ];

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedTransactions)
        }
      });

      const result = await agent.executeTask(plan, context);

      expect(result).toHaveLength(5);
      
      // Check that API Call -> Decision pattern is followed
      const apiCall = result.find(t => t.payload.type === 'API Call');
      const decision = result.find(t => t.payload.type === 'Decision');
      expect(apiCall).toBeDefined();
      expect(decision).toBeDefined();
    });

    it('should use correct quality mode', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'pro'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { action: 'ADD_NODE', payload: { id: 'test' } }
          ])
        }
      });

      await agent.executeTask(plan, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should handle AI model errors gracefully', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const context = {
        currentFlow: { nodes: [], edges: [] },
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('Architect model failed')
      );

      await expect(agent.executeTask(plan, context))
        .rejects
        .toThrow('Architect model failed');
    });

    it('should include all context in prompt generation', async () => {
      const plan = [
        { task: 'Create complex flow', reasoning: 'Multi-step process', stepNumber: 1 }
      ];

      const context = {
        currentFlow: {
          nodes: [
            { id: 'existing_node', type: 'Screen' }
          ],
          edges: [
            { id: 'existing_edge', source: 'start', target: 'existing_node' }
          ]
        },
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { action: 'ADD_NODE', payload: { id: 'new_node' } }
          ])
        }
      });

      await agent.executeTask(plan, context);

      // Verify the prompt includes current flow state and plan
      const calledPrompt = mockContext.models.standard.generateContent.mock.calls[0][0];
      expect(calledPrompt).toContain('AKTUELLER FLOW-ZUSTAND');
      expect(calledPrompt).toContain('VOM PLANNER ERSTELLTER GESAMTPLAN');
      expect(calledPrompt).toContain('existing_node');
      expect(calledPrompt).toContain('Create complex flow');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const plan = [
        { task: 'Create screen', reasoning: 'User needs interface' },
        { task: 'Add navigation', reasoning: 'User needs flow' }
      ];
      const context = {};

      const description = agent.getTaskDescription(plan, context);

      expect(description).toBe('Converting plan to executable transactions');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { action: 'ADD_NODE', payload: { id: 'test' } }
          ])
        }
      });

      await agent.process(plan, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'architect',
        expect.any(String),
        'Converting plan to executable transactions'
      );
    });

    it('should emit task completed event on success', async () => {
      const plan = [
        { task: 'Test task', reasoning: 'Test reasoning', stepNumber: 1 }
      ];

      const expectedResult = [
        { action: 'ADD_NODE', payload: { id: 'test' } }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(plan, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'architect',
        expect.any(String),
        expectedResult
      );
    });
  });
});