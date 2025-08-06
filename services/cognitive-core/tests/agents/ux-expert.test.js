// ==========================================
// COGNITIVE CORE SERVICE - UX Expert Agent Tests
// ==========================================

import { UxExpertAgent } from '../../src/agents/ux-expert.js';

describe('UxExpertAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new UxExpertAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should answer UX question with expert knowledge', async () => {
      const question = 'What are the best practices for form validation?';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'form_screen', type: 'Screen', data: { title: 'Contact Form' } }
          ],
          edges: []
        },
        ragContext: 'Form validation best practices: 1. Real-time feedback 2. Clear error messages 3. Progressive enhancement',
        qualityMode: 'standard'
      };

      const expectedAnswer = {
        answer: 'For effective form validation, follow these key principles: 1) Provide real-time feedback as users type to catch errors early, 2) Display clear, specific error messages that explain exactly what\'s wrong and how to fix it, 3) Use progressive enhancement to ensure forms work without JavaScript, and 4) Validate on both client and server side for security. Position error messages close to the relevant fields and use consistent styling throughout your form.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('form validation');
      expect(result.answer).toContain('real-time feedback');
      expect(result.answer).toContain('error messages');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'uxExpert',
        'UX question answered',
        expect.objectContaining({
          questionLength: question.length,
          hasRAGContext: true,
          flowNodeCount: 1
        })
      );
    });

    it('should provide accessibility guidance', async () => {
      const question = 'How can I make my navigation more accessible?';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'nav', type: 'Component', data: { type: 'navigation' } }
          ],
          edges: []
        },
        ragContext: 'Accessibility guidelines: WCAG 2.1 AA standards, keyboard navigation, screen reader support',
        qualityMode: 'pro'
      };

      const expectedAnswer = {
        answer: 'To make navigation more accessible, implement these WCAG 2.1 AA standards: 1) Ensure keyboard navigation with Tab, Enter, and Arrow keys, 2) Add proper ARIA labels and roles (nav, menuitem, menubar), 3) Provide skip links to main content, 4) Maintain adequate color contrast (4.5:1 ratio), 5) Use semantic HTML elements like <nav> and <ul>, 6) Implement focus indicators that are clearly visible, and 7) Test with screen readers to ensure proper announcement of menu items and current location.'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('accessible');
      expect(result.answer).toContain('WCAG');
      expect(result.answer).toContain('keyboard navigation');
      expect(result.answer).toContain('ARIA');
    });

    it('should provide UX principles guidance', async () => {
      const question = 'What are Nielsen\'s usability heuristics and how do I apply them?';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: 'Nielsen\'s 10 Usability Heuristics: Visibility of system status, Match between system and real world, User control and freedom, Consistency and standards, Error prevention, Recognition rather than recall, Flexibility and efficiency of use, Aesthetic and minimalist design, Help users recognize and recover from errors, Help and documentation',
        qualityMode: 'standard'
      };

      const expectedAnswer = {
        answer: 'Nielsen\'s 10 Usability Heuristics are fundamental UX principles: 1) Visibility of system status - always inform users about what\'s happening (loading states, confirmations), 2) Match between system and real world - use familiar concepts and language, 3) User control and freedom - provide undo/redo and clear exit options, 4) Consistency and standards - follow platform conventions, 5) Error prevention - design to prevent problems before they occur, 6) Recognition rather than recall - make objects, actions, and options visible, 7) Flexibility and efficiency - provide shortcuts for experienced users, 8) Aesthetic and minimalist design - remove unnecessary elements, 9) Help users recognize and recover from errors - clear error messages with solutions, 10) Help and documentation - provide contextual help when needed.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('Nielsen');
      expect(result.answer).toContain('heuristics');
      expect(result.answer).toContain('system status');
      expect(result.answer).toContain('error prevention');
    });

    it('should provide mobile UX guidance', async () => {
      const question = 'What are the key considerations for mobile UX design?';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'mobile_screen', type: 'Screen', data: { title: 'Mobile App' } }
          ],
          edges: []
        },
        ragContext: 'Mobile UX principles: Touch targets, thumb zones, responsive design, performance optimization',
        qualityMode: 'standard'
      };

      const expectedAnswer = {
        answer: 'Key mobile UX considerations include: 1) Touch targets should be at least 44px (iOS) or 48dp (Android) for easy tapping, 2) Design for thumb zones - place important actions within comfortable reach, 3) Optimize for one-handed use with bottom navigation, 4) Minimize text input with smart defaults and autofill, 5) Design for various screen sizes with responsive layouts, 6) Prioritize performance with fast loading and smooth animations, 7) Consider context of mobile use - users are often distracted or in motion, 8) Use native patterns and gestures that users expect, and 9) Ensure content is readable without zooming with appropriate font sizes (16px minimum).'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('mobile');
      expect(result.answer).toContain('touch targets');
      expect(result.answer).toContain('thumb zones');
      expect(result.answer).toContain('responsive');
    });

    it('should provide design system guidance', async () => {
      const question = 'How do I create a consistent design system?';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: 'Design systems: Component libraries, design tokens, style guides, documentation',
        qualityMode: 'pro'
      };

      const expectedAnswer = {
        answer: 'To create a consistent design system: 1) Start with design tokens - define colors, typography, spacing, and other visual properties as variables, 2) Create a component library with reusable UI elements (buttons, forms, cards), 3) Establish clear naming conventions and organizational structure, 4) Document usage guidelines, do\'s and don\'ts for each component, 5) Include accessibility standards in your system, 6) Version control your system and communicate changes, 7) Create governance processes for maintaining and updating the system, 8) Provide code examples and implementation guides for developers, and 9) Regularly audit your products for consistency and adherence to the system.'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('design system');
      expect(result.answer).toContain('design tokens');
      expect(result.answer).toContain('component library');
      expect(result.answer).toContain('consistency');
    });

    it('should handle questions about specific flow elements', async () => {
      const question = 'How can I improve the user experience of this checkout flow?';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'cart', type: 'Screen', data: { title: 'Shopping Cart' } },
            { id: 'checkout', type: 'Screen', data: { title: 'Checkout' } },
            { id: 'payment', type: 'Screen', data: { title: 'Payment' } },
            { id: 'confirmation', type: 'Screen', data: { title: 'Order Confirmation' } }
          ],
          edges: [
            { id: 'e1', source: 'cart', target: 'checkout' },
            { id: 'e2', source: 'checkout', target: 'payment' },
            { id: 'e3', source: 'payment', target: 'confirmation' }
          ]
        },
        ragContext: 'E-commerce UX best practices: Guest checkout, progress indicators, trust signals, error handling',
        qualityMode: 'standard'
      };

      const expectedAnswer = {
        answer: 'To improve your checkout flow: 1) Add a progress indicator showing steps (Cart → Checkout → Payment → Confirmation), 2) Offer guest checkout option to reduce friction, 3) Display trust signals like security badges and accepted payment methods, 4) Minimize form fields and use smart defaults, 5) Show order summary and costs upfront with no hidden fees, 6) Implement real-time validation and clear error messages, 7) Provide multiple payment options, 8) Add reassuring copy about security and return policies, 9) Enable address autofill and saved payment methods for returning users, and 10) Test on mobile devices since many users shop on mobile.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('checkout flow');
      expect(result.answer).toContain('progress indicator');
      expect(result.answer).toContain('guest checkout');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'uxExpert',
        'UX question answered',
        expect.objectContaining({
          flowNodeCount: 4
        })
      );
    });

    it('should work without RAG context', async () => {
      const question = 'What is the difference between UI and UX?';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: '',
        qualityMode: 'standard'
      };

      const expectedAnswer = {
        answer: 'UI (User Interface) and UX (User Experience) are related but distinct disciplines: UI focuses on the visual and interactive elements - buttons, colors, typography, layouts, and how things look. UX focuses on the overall experience - how users feel, the ease of accomplishing tasks, user research, information architecture, and user journey mapping. Think of UI as the digital touchpoints users interact with, while UX is the holistic experience and satisfaction users have with a product. Good UX requires understanding user needs through research, while good UI requires strong visual design skills. Both are essential for successful digital products.'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedAnswer)
        }
      });

      const result = await agent.executeTask(question, context);

      expect(result.answer).toContain('UI');
      expect(result.answer).toContain('UX');
      expect(result.answer).toContain('User Interface');
      expect(result.answer).toContain('User Experience');
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'uxExpert',
        'UX question answered',
        expect.objectContaining({
          hasRAGContext: false
        })
      );
    });

    it('should validate response structure', async () => {
      const question = 'Test question';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: '',
        qualityMode: 'standard'
      };

      // Mock invalid response (missing answer field)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            response: 'Missing answer field'
          })
        }
      });

      await expect(agent.executeTask(question, context))
        .rejects
        .toThrow('UX Expert must return an answer field with string content');
    });

    it('should validate answer field is string', async () => {
      const question = 'Test question';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: '',
        qualityMode: 'standard'
      };

      // Mock invalid response (answer is not string)
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            answer: 123 // Not a string
          })
        }
      });

      await expect(agent.executeTask(question, context))
        .rejects
        .toThrow('UX Expert must return an answer field with string content');
    });

    it('should use correct quality mode', async () => {
      const question = 'Test question';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: 'Test context',
        qualityMode: 'pro'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            answer: 'Test answer'
          })
        }
      });

      await agent.executeTask(question, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should handle AI model errors gracefully', async () => {
      const question = 'Test question';
      const context = {
        currentFlow: { nodes: [], edges: [] },
        ragContext: '',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockRejectedValue(
        new Error('UX Expert model failed')
      );

      await expect(agent.executeTask(question, context))
        .rejects
        .toThrow('UX Expert model failed');
    });

    it('should include all context in prompt', async () => {
      const question = 'How to improve user onboarding?';
      const context = {
        currentFlow: {
          nodes: [
            { id: 'welcome', type: 'Screen', data: { title: 'Welcome' } }
          ],
          edges: []
        },
        ragContext: 'Onboarding best practices: Progressive disclosure, contextual help, quick wins',
        qualityMode: 'standard'
      };

      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            answer: 'Comprehensive onboarding advice'
          })
        }
      });

      await agent.executeTask(question, context);

      // Verify the prompt includes all context
      const calledPrompt = mockContext.models.standard.generateContent.mock.calls[0][0];
      expect(calledPrompt).toContain('WISSENS-KONTEXT');
      expect(calledPrompt).toContain('AKTUELLER FLOW');
      expect(calledPrompt).toContain('Progressive disclosure');
      expect(calledPrompt).toContain('Welcome');
      expect(calledPrompt).toContain('improve user onboarding');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const question = 'What are the best practices for mobile navigation?';
      const context = {};

      const description = agent.getTaskDescription(question, context);

      expect(description).toContain('Answering UX question');
      expect(description).toContain('What are the best practices for mobile navigation...');
    });

    it('should truncate long questions in descriptions', () => {
      const longQuestion = 'A'.repeat(100);
      
      const description = agent.getTaskDescription(longQuestion, {});
      
      expect(description.length).toBeLessThan(100);
      expect(description).toContain('...');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const question = 'Test question';
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            answer: 'Test answer'
          })
        }
      });

      await agent.process(question, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'uxExpert',
        expect.any(String),
        expect.stringContaining('Answering UX question')
      );
    });

    it('should emit task completed event on success', async () => {
      const question = 'Test question';
      const expectedResult = {
        answer: 'Test answer'
      };
      
      mockContext.models.standard.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(question, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'uxExpert',
        expect.any(String),
        expectedResult
      );
    });
  });
});