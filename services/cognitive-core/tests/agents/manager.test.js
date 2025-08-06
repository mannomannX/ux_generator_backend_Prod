// ==========================================
// COGNITIVE CORE SERVICE - Manager Agent Tests
// ==========================================

import { ManagerAgent } from '../../src/agents/manager.js';

describe('ManagerAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new ManagerAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should process user message with context', async () => {
      const userMessage = 'Erstelle einen Login-Screen';
      const context = {
        context: '--- Langzeit-Fakten ---\nKeine verfügbar\n\n--- Mittelfristige Zusammenfassung ---\nErste Konversation\n\n--- Kurzzeitgedächtnis ---\nNeue Session',
        qualityMode: 'standard'
      };

      // Mock successful AI response
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            type: 'planner_task',
            task: 'Erstelle einen Login-Screen mit Email und Passwort-Feldern',
            complexity: 'simple'
          })
        }
      });

      const result = await agent.executeTask(userMessage, context);

      expect(result.type).toBe('planner_task');
      expect(result.task).toContain('Login-Screen');
      expect(result.complexity).toBe('simple');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'manager',
        'Task analysis completed',
        expect.any(Object)
      );
    });

    it('should return clarification question when task is unclear', async () => {
      const userMessage = 'Mache etwas';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            type: 'clarification_question',
            question: 'Was genau möchten Sie erstellen? Können Sie Ihr Ziel präziser beschreiben?'
          })
        }
      });

      const result = await agent.executeTask(userMessage, {});

      expect(result.type).toBe('clarification_question');
      expect(result.question).toContain('präziser');
    });

    it('should handle improvement suggestions in context', async () => {
      const userMessage = 'Füge einen Button hinzu';
      const context = {
        context: 'Test context',
        improvementSuggestion: 'Verwende präzisere Beschreibungen für UI-Elemente',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            type: 'planner_task',
            task: 'Füge einen präzise beschriebenen Button hinzu',
            complexity: 'simple'
          })
        }
      });

      const result = await agent.executeTask(userMessage, context);

      expect(result.type).toBe('planner_task');
      expect(mockContext.models.standard.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('Verwende präzisere Beschreibungen')
      );
    });

    it('should throw error for invalid response format', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            invalidType: 'invalid'
          })
        }
      });

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('Manager agent returned invalid response format');
    });

    it('should handle AI API errors gracefully', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('API quota exceeded')
      );

      await expect(agent.executeTask(userMessage, {}))
        .rejects
        .toThrow('API quota exceeded');
    });
  });

  describe('memory extraction methods', () => {
    it('should extract long-term memory from context', () => {
      const fullContext = `
        --- Langzeit-Fakten ---
        Nutzer bevorzugt minimales Design
        Verwendet häufig Login-Flows
        
        --- Mittelfristige Zusammenfassung ---
        Andere Inhalte
      `;

      const longTerm = agent.extractLongTermMemory(fullContext);
      
      expect(longTerm).toContain('minimales Design');
      expect(longTerm).toContain('Login-Flows');
    });

    it('should extract mid-term memory from context', () => {
      const fullContext = `
        --- Langzeit-Fakten ---
        Andere Inhalte
        
        --- Mittelfristige Zusammenfassung ---
        Aktuelles Projekt: E-Commerce App
        Letzte Änderung: Shopping Cart
        
        --- Kurzzeitgedächtnis ---
        Noch andere Inhalte
      `;

      const midTerm = agent.extractMidTermMemory(fullContext);
      
      expect(midTerm).toContain('E-Commerce App');
      expect(midTerm).toContain('Shopping Cart');
    });

    it('should extract short-term memory from context', () => {
      const fullContext = `
        --- Langzeit-Fakten ---
        Andere Inhalte
        
        --- Kurzzeitgedächtnis (letzte 5 Nachrichten) ---
        user: Füge einen Login-Screen hinzu
        assistant: Hier ist der Plan...
        user: Das sieht gut aus
      `;

      const shortTerm = agent.extractShortTermMemory(fullContext);
      
      expect(shortTerm).toContain('Login-Screen hinzu');
      expect(shortTerm).toContain('Das sieht gut aus');
    });

    it('should handle missing memory sections gracefully', () => {
      const fullContext = 'No structured memory content';

      expect(agent.extractLongTermMemory(fullContext)).toBe('No long-term memory available');
      expect(agent.extractMidTermMemory(fullContext)).toBe('No mid-term memory available');
      expect(agent.extractShortTermMemory(fullContext)).toBe('No short-term memory available');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const input = 'Erstelle einen Dashboard-Screen';
      const context = { qualityMode: 'standard' };

      const description = agent.getTaskDescription(input, context);

      expect(description).toBe('Analyzing user request and determining task approach');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const userMessage = 'Test message';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            type: 'planner_task',
            task: 'Test task',
            complexity: 'simple'
          })
        }
      });

      await agent.process(userMessage, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'manager',
        expect.any(String),
        'Analyzing user request and determining task approach'
      );
    });

    it('should emit task completed event on success', async () => {
      const userMessage = 'Test message';
      const expectedResult = {
        type: 'planner_task',
        task: 'Test task',
        complexity: 'simple'
      };
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(userMessage, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'manager',
        expect.any(String),
        expectedResult
      );
    });
  });
});