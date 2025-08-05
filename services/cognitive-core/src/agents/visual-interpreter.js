// ==========================================
// SERVICES/COGNITIVE-CORE/src/agents/visual-interpreter.js
// ==========================================
import { BaseAgent } from './base-agent.js';
import { VISUAL_INTERPRETER_PROMPT } from '../prompts/visual-interpreter.prompt.js';

class VisualInterpreterAgent extends BaseAgent {
  getTaskDescription(input, context) {
    return `Interpreting uploaded image/sketch`;
  }

  async executeTask(imageData, context = {}) {
    const { qualityMode = 'pro' } = context; // Always use pro model for vision

    try {
      // Create image part for Gemini
      const imagePart = {
        inlineData: {
          data: imageData,
          mimeType: 'image/jpeg'
        }
      };

      // Use pro model for vision tasks
      const result = await this.models.pro.generateContent([
        VISUAL_INTERPRETER_PROMPT,
        imagePart
      ]);

      const response = await result.response;
      const rawText = response.text();

      // Parse JSON response
      let parsedResponse;
      try {
        const sanitizedText = rawText.replace(/^```json\s*|```\s*$/g, '').trim();
        parsedResponse = JSON.parse(sanitizedText);
      } catch (e) {
        throw new Error('Failed to parse visual interpreter response as JSON');
      }

      // Validate response structure
      if (!parsedResponse.status || !['success', 'error'].includes(parsedResponse.status)) {
        throw new Error('Visual interpreter must return status field with success or error');
      }

      if (parsedResponse.status === 'success') {
        if (!parsedResponse.description || !Array.isArray(parsedResponse.elements)) {
          throw new Error('Successful visual interpretation must include description and elements array');
        }
      } else {
        if (!parsedResponse.error_message) {
          throw new Error('Error response must include error_message');
        }
      }

      this.logger.logAgentAction(this.agentName, 'Visual interpretation completed', {
        status: parsedResponse.status,
        elementCount: parsedResponse.elements?.length || 0,
        connectionCount: parsedResponse.connections?.length || 0,
        hasError: parsedResponse.status === 'error',
      });

      return parsedResponse;

    } catch (error) {
      this.logger.error('Visual interpretation failed', error);
      
      // Return structured error response
      return {
        status: 'error',
        error_message: 'Failed to analyze the image. Please try uploading a clearer image or check if the image contains a valid flow diagram.',
      };
    }
  }
}

export { VisualInterpreterAgent };