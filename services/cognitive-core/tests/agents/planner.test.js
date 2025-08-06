// ==========================================
// COGNITIVE CORE SERVICE - Planner Agent Tests
// ==========================================

import { PlannerAgent } from '../../src/agents/planner.js';

describe('PlannerAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new PlannerAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should create detailed execution plan', async () => {
      const task = 'Erstelle einen Login-Screen mit Email und Passwort-Feldern';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'start', type: 'Start' }
          ],
          edges: []
        },
        ragContext: 'Login-Best-Practices: Verwende Email-Validierung und sichere Passwort-Felder',
        qualityMode: 'standard'
      };

      const expectedPlan = [
        {
          task: 'Screen-Knoten für Login erstellen',
          reasoning: 'Hauptcontainer für Login-Funktionalität'
        },
        {
          task: 'Email-Eingabefeld hinzufügen',
          reasoning: 'Benutzeranmeldung über Email-Adresse'
        },
        {
          task: 'Passwort-Eingabefeld hinzufügen',
          reasoning: 'Sichere Authentifizierung'
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedPlan)
        }
      });

      const result = await agent.executeTask(task, context);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('task');
      expect(result[0]).toHaveProperty('reasoning');
      expect(result[0]).toHaveProperty('stepNumber', 1);
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'planner',
        'Plan created',
        expect.objectContaining({
          stepCount: 3,
          hasRAGContext: true,
          flowNodeCount: 1
        })
      );
    });

    it('should handle complex multi-step plans', async () => {
      const task = 'Erstelle einen vollständigen E-Commerce Checkout-Flow';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: 'E-Commerce Best Practices...',
        qualityMode: 'pro'
      };

      const complexPlan = Array.from({ length: 8 }, (_, i) => ({
        task: `Checkout Step ${i + 1}`,
        reasoning: `Reason for step ${i + 1}`
      }));

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(complexPlan)
        }
      });

      const result = await agent.executeTask(task, context);

      expect(result).toHaveLength(8);
      expect(result.every(step => step.stepNumber > 0)).toBe(true);
      expect(result[7].stepNumber).toBe(8);
    });

    it('should work without RAG context', async () => {
      const task = 'Füge einen Button hinzu';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: '',
        qualityMode: 'standard'
      };

      const simplePlan = [
        {
          task: 'Button-Element hinzufügen',
          reasoning: 'Benutzer-Interaktion ermöglichen'
        }
      ];

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(simplePlan)
        }
      });

      const result = await agent.executeTask(task, context);

      expect(result).toHaveLength(1);
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'planner',
        'Plan created',
        expect.objectContaining({
          hasRAGContext: false
        })
      );
    });

    it('should validate plan steps have required fields', async () => {
      const task = 'Test task';
      
      // Mock invalid response (missing reasoning)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { task: 'Step 1' }, // Missing reasoning
            { task: 'Step 2', reasoning: 'Valid step' }
          ])
        }
      });

      await expect(agent.executeTask(task, {}))
        .rejects
        .toThrow('Plan step 0 missing required fields (task, reasoning)');
    });

    it('should validate response is an array', async () => {
      const task = 'Test task';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            notAnArray: 'invalid response'
          })
        }
      });

      await expect(agent.executeTask(task, {}))
        .rejects
        .toThrow('Planner agent must return an array of plan steps');
    });

    it('should handle prompt template replacement', async () => {
      const task = 'Create user profile page';
      const context = {
        currentFlow: { nodes: [{ id: 'start', type: 'Start' }], edges: [] },
        ragContext: 'User profile best practices: Include avatar, personal info',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { task: 'Profile step', reasoning: 'Profile reasoning' }
          ])
        }
      });

      await agent.executeTask(task, context);

      // Verify the prompt was called with replaced template variables
      const calledPrompt = mockContext.models.standard.generateContent.mock.calls[0][0];
      expect(calledPrompt).toContain('User profile best practices');
      expect(calledPrompt).toContain('"nodes": [');
      expect(calledPrompt).toContain('Create user profile page');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const input = 'Erstelle einen Dashboard mit Widgets';
      
      const description = agent.getTaskDescription(input);
      
      expect(description).toContain('Creating detailed execution plan');
      expect(description).toContain('Erstelle einen Dashboard mit Widgets');
    });

    it('should truncate long task descriptions', () => {
      const longInput = 'A'.repeat(100);
      
      const description = agent.getTaskDescription(longInput);
      
      expect(description.length).toBeLessThan(100);
      expect(description).toContain('...');
    });
  });

  describe('integration with current flow', () => {
    it('should consider existing flow structure in planning', async () => {
      const task = 'Erweitere den bestehenden Login-Flow';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'start', type: 'Start' },
            { id: 'login', type: 'Screen', data: { title: 'Login' } },
            { id: 'success', type: 'Screen', data: { title: 'Dashboard' } }
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'login' },
            { id: 'e2', source: 'login', target: 'success' }
          ]
        },
        ragContext: '',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            {
              task: 'Forgot Password Link hinzufügen',
              reasoning: 'Erweitert bestehenden Login-Screen'
            },
            {
              task: 'Email-Verifikation Screen hinzufügen',
              reasoning: 'Zusätzlicher Sicherheitsschritt'
            }
          ])
        }
      });

      const result = await agent.executeTask(task, context);

      expect(result).toHaveLength(2);
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'planner',
        'Plan created',
        expect.objectContaining({
          flowNodeCount: 3
        })
      );
    });
  });

  describe('quality mode handling', () => {
    it('should use standard model for standard quality', async () => {
      const task = 'Simple task';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { task: 'Step 1', reasoning: 'Reason 1' }
          ])
        }
      });

      await agent.executeTask(task, { qualityMode: 'standard' });

      expect(mockContext.models.standard.generateContent).toHaveBeenCalled();
      expect(mockContext.models.pro.generateContent).not.toHaveBeenCalled();
    });

    it('should use pro model for pro quality', async () => {
      const task = 'Complex task';
      
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { task: 'Step 1', reasoning: 'Reason 1' }
          ])
        }
      });

      await agent.executeTask(task, { qualityMode: 'pro' });

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should default to standard quality if not specified', async () => {
      const task = 'Default task';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify([
            { task: 'Step 1', reasoning: 'Reason 1' }
          ])
        }
      });

      await agent.executeTask(task, {});

      expect(mockContext.models.standard.generateContent).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle AI model errors', async () => {
      const task = 'Test task';
      
      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('Model timeout')
      );

      await expect(agent.executeTask(task, {}))
        .rejects
        .toThrow('Model timeout');
    });

    it('should handle invalid JSON responses', async () => {
      const task = 'Test task';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON response'
        }
      });

      await expect(agent.executeTask(task, {}))
        .rejects
        .toThrow();
    });
  });
});