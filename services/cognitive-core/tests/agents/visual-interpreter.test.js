// ==========================================
// COGNITIVE CORE SERVICE - Visual Interpreter Agent Tests
// ==========================================

import { VisualInterpreterAgent } from '../../src/agents/visual-interpreter.js';

describe('VisualInterpreterAgent', () => {
  let agent;
  let mockContext;

  beforeEach(() => {
    mockContext = global.createMockContext();
    agent = new VisualInterpreterAgent(mockContext);
  });

  describe('executeTask', () => {
    it('should interpret flow diagram image successfully', async () => {
      const imageData = 'base64EncodedImageData...';
      const context = { qualityMode: 'pro' };

      const expectedInterpretation = {
        status: 'success',
        description: 'A user registration flow with login screen, form validation, and confirmation page',
        elements: [
          {
            id: 'temp_1',
            type: 'screen',
            text: 'Login Screen',
            position: { x: 100, y: 50 },
            components: ['email_input', 'password_input', 'login_button']
          },
          {
            id: 'temp_2', 
            type: 'screen',
            text: 'Registration Form',
            position: { x: 300, y: 50 },
            components: ['form_fields', 'submit_button']
          },
          {
            id: 'temp_3',
            type: 'screen',
            text: 'Confirmation Page',
            position: { x: 500, y: 50 },
            components: ['success_message', 'continue_button']
          }
        ],
        connections: [
          {
            from: 'temp_1',
            to: 'temp_2',
            label: 'Sign Up',
            trigger: 'onClick(signup_link)'
          },
          {
            from: 'temp_2',
            to: 'temp_3', 
            label: 'Submit',
            trigger: 'onSubmit'
          }
        ],
        flowType: 'user_registration',
        complexity: 'medium'
      };

      // Mock the pro model (vision model) response
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedInterpretation)
        }
      });

      const result = await agent.executeTask(imageData, context);

      expect(result.status).toBe('success');
      expect(result.description).toContain('user registration flow');
      expect(result.elements).toHaveLength(3);
      expect(result.connections).toHaveLength(2);
      expect(result.elements[0].text).toBe('Login Screen');
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'visualinterpreter',
        'Visual interpretation completed',
        expect.objectContaining({
          status: 'success',
          elementCount: 3,
          connectionCount: 2,
          hasError: false
        })
      );
    });

    it('should handle complex multi-screen flows', async () => {
      const imageData = 'complexFlowImageData...';

      const expectedInterpretation = {
        status: 'success',
        description: 'Complex e-commerce checkout flow with multiple decision points and error handling',
        elements: [
          { id: 'temp_1', type: 'screen', text: 'Shopping Cart', position: { x: 50, y: 100 } },
          { id: 'temp_2', type: 'decision', text: 'User Logged In?', position: { x: 200, y: 100 } },
          { id: 'temp_3', type: 'screen', text: 'Login Screen', position: { x: 200, y: 200 } },
          { id: 'temp_4', type: 'screen', text: 'Checkout Form', position: { x: 350, y: 100 } },
          { id: 'temp_5', type: 'api_call', text: 'Payment API', position: { x: 500, y: 100 } },
          { id: 'temp_6', type: 'screen', text: 'Success Page', position: { x: 650, y: 50 } },
          { id: 'temp_7', type: 'screen', text: 'Error Page', position: { x: 650, y: 150 } }
        ],
        connections: [
          { from: 'temp_1', to: 'temp_2', label: 'Checkout' },
          { from: 'temp_2', to: 'temp_3', label: 'Not Logged In' },
          { from: 'temp_2', to: 'temp_4', label: 'Logged In' },
          { from: 'temp_3', to: 'temp_4', label: 'After Login' },
          { from: 'temp_4', to: 'temp_5', label: 'Submit Payment' },
          { from: 'temp_5', to: 'temp_6', label: 'Success' },
          { from: 'temp_5', to: 'temp_7', label: 'Error' }
        ],
        flowType: 'ecommerce_checkout',
        complexity: 'high',
        decisionPoints: 1,
        apiCalls: 1
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedInterpretation)
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.elements).toHaveLength(7);
      expect(result.connections).toHaveLength(7);
      expect(result.complexity).toBe('high');
      expect(result.decisionPoints).toBe(1);
      expect(result.flowType).toBe('ecommerce_checkout');
    });

    it('should handle wireframe sketches', async () => {
      const imageData = 'wireframeSketchData...';

      const expectedInterpretation = {
        status: 'success',
        description: 'Hand-drawn wireframe showing mobile app login screen with social login options',
        elements: [
          {
            id: 'temp_1',
            type: 'screen',
            text: 'Login Screen',
            wireframeComponents: [
              { type: 'text_input', label: 'Email', position: 'top' },
              { type: 'text_input', label: 'Password', position: 'middle' },
              { type: 'button', label: 'Login', position: 'center' },
              { type: 'button', label: 'Google Login', position: 'bottom' },
              { type: 'link', label: 'Forgot Password?', position: 'bottom' }
            ],
            deviceType: 'mobile',
            orientation: 'portrait'
          }
        ],
        connections: [],
        sketchType: 'wireframe',
        fidelity: 'low',
        deviceContext: 'mobile'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedInterpretation)
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.sketchType).toBe('wireframe');
      expect(result.fidelity).toBe('low');
      expect(result.deviceContext).toBe('mobile');
      expect(result.elements[0].wireframeComponents).toHaveLength(5);
    });

    it('should return error for unclear images', async () => {
      const imageData = 'unclearImageData...';

      const expectedError = {
        status: 'error',
        error_message: 'The image is too unclear to analyze. Please provide a clearer image with better contrast and visible text.',
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedError)
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('too unclear');
      
      expect(mockContext.logger.logAgentAction).toHaveBeenCalledWith(
        'visualinterpreter',
        'Visual interpretation completed',
        expect.objectContaining({
          status: 'error',
          hasError: true
        })
      );
    });

    it('should return error for non-flow images', async () => {
      const imageData = 'photoImageData...';

      const expectedError = {
        status: 'error',
        error_message: 'This appears to be a photograph rather than a flow diagram or wireframe. Please upload an image containing a flow diagram, wireframe, or UI sketch.',
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedError)
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('photograph');
      expect(result.error_message).toContain('flow diagram');
    });

    it('should handle model errors gracefully and return structured error', async () => {
      const imageData = 'imageData...';

      mockContext.models.pro.generateContent.mockRejectedValue(
        new Error('Vision model timeout')
      );

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('Failed to analyze the image');
      expect(result.error_message).toContain('clearer image');
    });

    it('should always use pro model for vision tasks', async () => {
      const imageData = 'imageData...';
      const context = { qualityMode: 'standard' }; // This should be overridden

      const expectedResult = {
        status: 'success',
        description: 'Simple flow diagram',
        elements: [],
        connections: []
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      await agent.executeTask(imageData, context);

      expect(mockContext.models.pro.generateContent).toHaveBeenCalled();
      expect(mockContext.models.standard.generateContent).not.toHaveBeenCalled();
    });

    it('should validate successful response structure', async () => {
      const imageData = 'imageData...';

      const invalidResponse = {
        status: 'success'
        // Missing description and elements
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(invalidResponse)
        }
      });

      await expect(agent.executeTask(imageData, {}))
        .rejects
        .toThrow('Successful visual interpretation must include description and elements array');
    });

    it('should validate error response structure', async () => {
      const imageData = 'imageData...';

      const invalidErrorResponse = {
        status: 'error'
        // Missing error_message
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(invalidErrorResponse)
        }
      });

      await expect(agent.executeTask(imageData, {}))
        .rejects
        .toThrow('Error response must include error_message');
    });

    it('should validate status field', async () => {
      const imageData = 'imageData...';

      const invalidResponse = {
        status: 'invalid_status',
        description: 'Test'
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(invalidResponse)
        }
      });

      await expect(agent.executeTask(imageData, {}))
        .rejects
        .toThrow('Visual interpreter must return status field with success or error');
    });

    it('should handle JSON parsing errors', async () => {
      const imageData = 'imageData...';

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON response'
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('Failed to analyze the image');
    });

    it('should interpret UI component sketches', async () => {
      const imageData = 'uiComponentSketch...';

      const expectedInterpretation = {
        status: 'success',
        description: 'Sketch of navigation component with menu items and search bar',
        elements: [
          {
            id: 'temp_1',
            type: 'component',
            text: 'Navigation Bar',
            components: [
              { type: 'logo', position: 'left' },
              { type: 'menu_items', items: ['Home', 'Products', 'About', 'Contact'] },
              { type: 'search_bar', position: 'right' },
              { type: 'user_avatar', position: 'far_right' }
            ]
          }
        ],
        connections: [],
        componentType: 'navigation',
        responsive: true
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedInterpretation)
        }
      });

      const result = await agent.executeTask(imageData, { qualityMode: 'pro' });

      expect(result.componentType).toBe('navigation');
      expect(result.elements[0].components).toHaveLength(4);
      expect(result.responsive).toBe(true);
    });

    it('should create proper image part for Gemini API', async () => {
      const imageData = 'testImageBase64Data';
      
      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'success',
            description: 'Test interpretation',
            elements: [],
            connections: []
          })
        }
      });

      await agent.executeTask(imageData, { qualityMode: 'pro' });

      // Verify that generateContent was called with the correct structure
      const callArgs = mockContext.models.pro.generateContent.mock.calls[0][0];
      expect(Array.isArray(callArgs)).toBe(true);
      expect(callArgs).toHaveLength(2);
      expect(typeof callArgs[0]).toBe('string'); // The prompt
      expect(callArgs[1]).toHaveProperty('inlineData');
      expect(callArgs[1].inlineData).toHaveProperty('data', imageData);
      expect(callArgs[1].inlineData).toHaveProperty('mimeType', 'image/jpeg');
    });
  });

  describe('task description generation', () => {
    it('should generate meaningful task descriptions', () => {
      const imageData = 'imageData...';
      const context = {};

      const description = agent.getTaskDescription(imageData, context);

      expect(description).toBe('Interpreting uploaded image/sketch');
    });
  });

  describe('agent lifecycle', () => {
    it('should emit task started event', async () => {
      const imageData = 'imageData...';

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            status: 'success',
            description: 'Test',
            elements: [],
            connections: []
          })
        }
      });

      await agent.process(imageData, {});

      expect(mockContext.eventEmitter.emitAgentTaskStarted).toHaveBeenCalledWith(
        'visualinterpreter',
        expect.any(String),
        'Interpreting uploaded image/sketch'
      );
    });

    it('should emit task completed event on success', async () => {
      const imageData = 'imageData...';
      const expectedResult = {
        status: 'success',
        description: 'Test interpretation',
        elements: [],
        connections: []
      };

      mockContext.models.pro.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(expectedResult)
        }
      });

      const result = await agent.process(imageData, {});

      expect(result).toEqual(expectedResult);
      expect(mockContext.eventEmitter.emitAgentTaskCompleted).toHaveBeenCalledWith(
        'visualinterpreter',
        expect.any(String),
        expectedResult
      );
    });
  });
});