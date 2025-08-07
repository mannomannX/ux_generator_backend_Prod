/**
 * Prompt Optimizer Agent
 * 
 * Generates improved prompts based on approved problem analysis.
 * This agent creates concrete, actionable solutions for prompt improvements.
 * 
 * Input: Approved problem suggestion with analysis
 * Output: Optimized prompt that addresses the identified issue
 */

import { BaseAgent } from './agent-base.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PromptOptimizerAgent extends BaseAgent {
  constructor(logger, agentHub) {
    super(logger, agentHub);
    this.agentName = 'promptOptimizer';
    
    // Configuration
    this.config = {
      enabled: process.env.ENABLE_PROMPT_OPTIMIZATION === 'true',
      promptsDirectory: path.join(__dirname, '..', 'prompts'),
      backupDirectory: path.join(__dirname, '..', '..', 'backups', 'prompts'),
      maxPromptLength: 8000,
      minImprovement: 0.1 // Minimum confidence improvement required
    };
    
    // Prompt templates for different types of improvements
    this.improvementTemplates = {
      clarity: {
        instruction: 'Make the instructions clearer and more specific',
        examples: 'Add concrete examples to illustrate the expected behavior'
      },
      completeness: {
        instruction: 'Add missing instructions or edge cases',
        examples: 'Include examples of what should NOT be done'
      },
      consistency: {
        instruction: 'Ensure consistent terminology and formatting',
        examples: 'Standardize the output format requirements'
      },
      validation: {
        instruction: 'Add validation rules and error handling',
        examples: 'Include examples of invalid inputs and expected responses'
      }
    };
    
    // Statistics
    this.stats = {
      promptsOptimized: 0,
      improvementsGenerated: 0,
      averageConfidence: 0,
      failedOptimizations: 0
    };
  }

  getTaskDescription(input, context) {
    return `Optimizing prompt for ${input.sourceAgent || 'unknown'} agent`;
  }

  /**
   * Main task execution - optimize a prompt based on problem analysis
   */
  async executeTask(suggestion, context = {}) {
    const { qualityMode = 'pro' } = context; // Always use pro for prompt optimization
    
    try {
      this.logger.info('Starting prompt optimization', {
        suggestionId: suggestion._id,
        sourceAgent: suggestion.sourceAgent,
        problemLength: suggestion.detectedProblem.length
      });

      // Read current prompt
      const currentPrompt = await this.readCurrentPrompt(suggestion.sourceAgent);
      
      // Generate optimized prompt
      const optimization = await this.generateOptimizedPrompt(
        suggestion,
        currentPrompt,
        qualityMode
      );
      
      // Validate the optimized prompt
      const validation = await this.validateOptimizedPrompt(
        optimization.optimizedPrompt,
        currentPrompt,
        suggestion
      );
      
      if (!validation.isValid) {
        throw new Error(`Prompt validation failed: ${validation.reason}`);
      }
      
      // Prepare result
      const result = {
        suggestionId: suggestion._id,
        sourceAgent: suggestion.sourceAgent,
        originalPrompt: currentPrompt,
        optimizedPrompt: optimization.optimizedPrompt,
        improvementAnalysis: optimization.analysis,
        confidence: optimization.confidence,
        validationResult: validation,
        optimizerMetadata: {
          optimizedAt: new Date(),
          optimizerVersion: '1.0.0',
          qualityMode,
          processingTime: Date.now() - context.startTime || 0
        }
      };
      
      // Update statistics
      this.updateStatistics(result);
      
      this.logger.info('Prompt optimization completed', {
        suggestionId: suggestion._id,
        confidence: result.confidence,
        promptLength: result.optimizedPrompt.length,
        improvementType: optimization.improvementType
      });
      
      return result;
      
    } catch (error) {
      this.stats.failedOptimizations++;
      this.logger.error('Prompt optimization failed', error, {
        suggestionId: suggestion._id,
        sourceAgent: suggestion.sourceAgent
      });
      throw error;
    }
  }

  /**
   * Generate optimized prompt based on problem analysis
   */
  async generateOptimizedPrompt(suggestion, currentPrompt, qualityMode) {
    const optimizationPrompt = this.buildOptimizationPrompt(suggestion, currentPrompt);
    
    const response = await this.callModel(optimizationPrompt, qualityMode);
    
    // Validate response structure
    this.validateOptimizationResponse(response);
    
    return {
      optimizedPrompt: response.optimized_prompt,
      analysis: response.improvement_analysis,
      confidence: response.confidence || 0.8,
      improvementType: response.improvement_type || 'general',
      reasoning: response.reasoning
    };
  }

  /**
   * Build the optimization prompt for the AI model
   */
  buildOptimizationPrompt(suggestion, currentPrompt) {
    return `# PROMPT OPTIMIZATION TASK

Du bist ein Experte für die Optimierung von KI-Prompts. Deine Aufgabe ist es, einen bestehenden Prompt basierend auf einer identifizierten Schwäche zu verbessern.

## PROBLEM ANALYSE
**Betroffener Agent:** ${suggestion.sourceAgent}
**Identifiziertes Problem:** ${suggestion.detectedProblem}
**Konfidenz:** ${suggestion.confidence}

## BEWEIS/KONTEXT
**Original Plan:** ${suggestion.evidence.originalPlan || 'Nicht verfügbar'}
**Nutzer Feedback:** ${suggestion.evidence.userFeedback}
**Erfolgreicher Plan:** ${suggestion.evidence.successfulPlan || 'Noch nicht verfügbar'}

## AKTUELLER PROMPT
\`\`\`
${currentPrompt}
\`\`\`

## DEINE AUFGABE
Optimiere den aktuellen Prompt, um das identifizierte Problem zu lösen. Der optimierte Prompt sollte:

1. Das spezifische Problem direkt ansprechen
2. Klarere Anweisungen enthalten
3. Relevante Beispiele oder Regeln hinzufügen
4. Die bestehende Struktur und Funktionalität beibehalten

## ANTWORT FORMAT
Antworte NUR mit einem gültigen JSON-Objekt:

\`\`\`json
{
  "optimized_prompt": "Der vollständige optimierte Prompt hier...",
  "improvement_analysis": "Detaillierte Erklärung der vorgenommenen Verbesserungen...",
  "improvement_type": "clarity|completeness|consistency|validation|other",
  "confidence": 0.85,
  "reasoning": "Warum diese Änderungen das Problem lösen werden..."
}
\`\`\`

## WICHTIGE REGELN
- Der optimierte Prompt MUSS vollständig und sofort einsetzbar sein
- Behalte die original Sprache (Deutsch) bei
- Füge konkrete Beispiele hinzu, wo sie helfen
- Vermeide es, die Grundstruktur zu zerstören
- Der Prompt sollte nicht länger als ${this.config.maxPromptLength} Zeichen sein

Optimiere den Prompt jetzt:`;
  }

  /**
   * Read the current prompt file for an agent
   */
  async readCurrentPrompt(agentName) {
    try {
      const promptFileName = `${agentName.toLowerCase()}.prompt.js`;
      const promptFilePath = path.join(this.config.promptsDirectory, promptFileName);
      
      const fileContent = await fs.readFile(promptFilePath, 'utf8');
      
      // Extract the actual prompt content from the export
      // This is a simple regex to extract the prompt string
      const promptMatch = fileContent.match(/export const \w+_PROMPT = `([\s\S]*?)`;/);
      
      if (promptMatch && promptMatch[1]) {
        return promptMatch[1].trim();
      } else {
        throw new Error(`Could not extract prompt from ${promptFileName}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Prompt file not found for agent: ${agentName}`);
      }
      throw new Error(`Failed to read prompt file: ${error.message}`);
    }
  }

  /**
   * Validate the optimized prompt
   */
  async validateOptimizedPrompt(optimizedPrompt, originalPrompt, suggestion) {
    const validation = {
      isValid: true,
      reason: null,
      warnings: [],
      improvements: []
    };

    // Length validation
    if (optimizedPrompt.length > this.config.maxPromptLength) {
      validation.isValid = false;
      validation.reason = `Optimized prompt too long: ${optimizedPrompt.length} chars`;
      return validation;
    }

    if (optimizedPrompt.length < 100) {
      validation.isValid = false;
      validation.reason = 'Optimized prompt too short';
      return validation;
    }

    // Content validation
    if (optimizedPrompt === originalPrompt) {
      validation.warnings.push('No changes made to original prompt');
    }

    // Check if key elements are preserved
    const keyElements = this.extractKeyElements(originalPrompt);
    const optimizedElements = this.extractKeyElements(optimizedPrompt);

    for (const element of keyElements.critical) {
      if (!optimizedElements.all.includes(element)) {
        validation.warnings.push(`Critical element possibly removed: ${element}`);
      }
    }

    // Check for improvement indicators
    if (optimizedPrompt.length > originalPrompt.length * 1.1) {
      validation.improvements.push('Added more detailed instructions');
    }

    if (optimizedPrompt.includes('# BEISPIEL') || optimizedPrompt.includes('## BEISPIEL')) {
      validation.improvements.push('Added examples');
    }

    if (optimizedPrompt.includes('REGEL') || optimizedPrompt.includes('WICHTIG')) {
      validation.improvements.push('Added important rules or guidelines');
    }

    return validation;
  }

  /**
   * Extract key elements from a prompt for comparison
   */
  extractKeyElements(prompt) {
    const lines = prompt.split('\n');
    const elements = {
      critical: [],
      headers: [],
      rules: [],
      examples: [],
      all: []
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') || trimmed.startsWith('## ')) {
        elements.headers.push(trimmed);
        elements.all.push(trimmed);
      }
      if (trimmed.includes('REGEL') || trimmed.includes('WICHTIG') || trimmed.includes('MUST')) {
        elements.rules.push(trimmed);
        elements.critical.push(trimmed);
      }
      if (trimmed.includes('BEISPIEL') || trimmed.includes('EXAMPLE')) {
        elements.examples.push(trimmed);
      }
      elements.all.push(trimmed);
    }

    return elements;
  }

  /**
   * Validate the optimization response from the AI model
   */
  validateOptimizationResponse(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid optimization response: not an object');
    }

    if (!response.optimized_prompt || typeof response.optimized_prompt !== 'string') {
      throw new Error('Invalid optimization response: missing optimized_prompt');
    }

    if (response.optimized_prompt.length < 50) {
      throw new Error('Invalid optimization response: prompt too short');
    }

    if (!response.improvement_analysis || typeof response.improvement_analysis !== 'string') {
      throw new Error('Invalid optimization response: missing improvement_analysis');
    }

    if (response.confidence && (typeof response.confidence !== 'number' || 
        response.confidence < 0 || response.confidence > 1)) {
      throw new Error('Invalid optimization response: confidence must be number 0-1');
    }
  }

  /**
   * Create backup of original prompt
   */
  async backupOriginalPrompt(agentName, originalPrompt) {
    try {
      await fs.mkdir(this.config.backupDirectory, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${agentName.toLowerCase()}_${timestamp}.prompt.backup`;
      const backupPath = path.join(this.config.backupDirectory, backupFileName);
      
      await fs.writeFile(backupPath, originalPrompt, 'utf8');
      
      this.logger.debug('Prompt backup created', {
        agentName,
        backupPath,
        promptLength: originalPrompt.length
      });
      
      return backupPath;
    } catch (error) {
      this.logger.error('Failed to create prompt backup', error);
      throw error;
    }
  }

  /**
   * Calculate prompt hash for change detection
   */
  calculatePromptHash(prompt) {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  /**
   * Update statistics
   */
  updateStatistics(result) {
    this.stats.promptsOptimized++;
    this.stats.improvementsGenerated++;
    
    // Update average confidence
    const oldAvg = this.stats.averageConfidence;
    const count = this.stats.promptsOptimized;
    this.stats.averageConfidence = (oldAvg * (count - 1) + result.confidence) / count;
  }

  /**
   * Get optimization statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      successRate: this.stats.promptsOptimized / (this.stats.promptsOptimized + this.stats.failedOptimizations),
      enabled: this.config.enabled
    };
  }

  /**
   * Process multiple approved suggestions
   */
  async processApprovedSuggestions(suggestions, context = {}) {
    const results = [];
    const errors = [];

    for (const suggestion of suggestions) {
      try {
        const result = await this.executeTask(suggestion, {
          ...context,
          startTime: Date.now()
        });
        results.push(result);
      } catch (error) {
        errors.push({
          suggestionId: suggestion._id,
          error: error.message
        });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalProcessed: suggestions.length,
      successRate: results.length / suggestions.length
    };
  }

  /**
   * Preview optimization without applying
   */
  async previewOptimization(suggestion, context = {}) {
    // Same as executeTask but doesn't store results
    const result = await this.executeTask(suggestion, context);
    
    return {
      ...result,
      preview: true,
      canImplement: result.validationResult.isValid,
      warnings: result.validationResult.warnings
    };
  }
}

export { PromptOptimizerAgent };