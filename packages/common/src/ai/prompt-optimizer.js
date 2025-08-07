// ==========================================
// PACKAGES/COMMON/src/ai/prompt-optimizer.js
// ==========================================

import { EventEmitter } from 'events';

/**
 * Prompt Optimization System
 * Learns from AI responses to optimize prompts for better results
 */
export class PromptOptimizer extends EventEmitter {
  constructor(redisClient, logger, options = {}) {
    super();
    
    this.redisClient = redisClient;
    this.logger = logger;
    this.options = {
      enabled: process.env.ENABLE_PROMPT_OPTIMIZATION !== 'false',
      learningRate: 0.1,
      minSamples: 10,
      maxPromptVariations: 50,
      optimizationInterval: 3600000, // 1 hour
      retentionPeriod: 2592000000, // 30 days
      qualityThreshold: 0.7,
      ...options
    };

    // Prompt templates and variations
    this.promptTemplates = new Map();
    this.promptVariations = new Map();
    this.performanceMetrics = new Map();
    
    // Learning data
    this.interactionHistory = [];
    this.optimizationQueue = [];
    
    if (this.options.enabled) {
      this.startOptimizationProcess();
    }
  }

  /**
   * Initialize prompt templates
   */
  async initialize() {
    await this.loadPromptTemplates();
    await this.loadPerformanceMetrics();
    
    this.logger.info('Prompt Optimizer initialized', {
      enabled: this.options.enabled,
      templatesCount: this.promptTemplates.size,
      variationsCount: this.promptVariations.size
    });

    this.emit('initialized');
  }

  /**
   * Register a prompt template
   */
  registerTemplate(templateId, config) {
    const template = {
      id: templateId,
      name: config.name,
      category: config.category || 'general',
      basePrompt: config.basePrompt,
      variables: config.variables || [],
      constraints: config.constraints || {},
      qualityMetrics: config.qualityMetrics || ['relevance', 'clarity', 'completeness'],
      targetAudience: config.targetAudience || 'general',
      expectedOutputType: config.expectedOutputType || 'text',
      optimizationEnabled: config.optimizationEnabled !== false,
      createdAt: new Date().toISOString()
    };

    this.promptTemplates.set(templateId, template);
    
    // Initialize performance metrics
    this.performanceMetrics.set(templateId, {
      totalUses: 0,
      averageQuality: 0,
      averageResponseTime: 0,
      successRate: 0,
      variations: []
    });

    this.logger.info('Prompt template registered', {
      templateId,
      category: template.category,
      optimizationEnabled: template.optimizationEnabled
    });

    return template;
  }

  /**
   * Optimize a prompt for better results
   */
  async optimizePrompt(templateId, context = {}, qualityMode = 'normal') {
    const template = this.promptTemplates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    if (!this.options.enabled || !template.optimizationEnabled) {
      return this.renderPrompt(template.basePrompt, context);
    }

    // Get best performing variation
    const bestVariation = await this.getBestVariation(templateId, context, qualityMode);
    
    if (bestVariation) {
      this.logger.debug('Using optimized prompt variation', {
        templateId,
        variationId: bestVariation.id,
        quality: bestVariation.quality
      });
      
      return this.renderPrompt(bestVariation.prompt, context);
    }

    // Generate new variation if needed
    const newVariation = await this.generateVariation(template, context, qualityMode);
    if (newVariation) {
      return this.renderPrompt(newVariation.prompt, context);
    }

    // Fallback to base prompt
    return this.renderPrompt(template.basePrompt, context);
  }

  /**
   * Get the best performing variation for a template
   */
  async getBestVariation(templateId, context, qualityMode) {
    const variations = this.promptVariations.get(templateId);
    if (!variations || variations.length === 0) {
      return null;
    }

    // Filter variations by context similarity and quality mode
    const suitableVariations = variations.filter(variation => {
      return variation.qualityMode === qualityMode &&
             variation.quality >= this.options.qualityThreshold &&
             this.calculateContextSimilarity(variation.context, context) > 0.5;
    });

    if (suitableVariations.length === 0) {
      return null;
    }

    // Sort by combined score (quality + performance + recency)
    suitableVariations.sort((a, b) => {
      const scoreA = this.calculateVariationScore(a);
      const scoreB = this.calculateVariationScore(b);
      return scoreB - scoreA;
    });

    return suitableVariations[0];
  }

  /**
   * Generate a new prompt variation
   */
  async generateVariation(template, context, qualityMode) {
    const existingVariations = this.promptVariations.get(template.id) || [];
    
    if (existingVariations.length >= this.options.maxPromptVariations) {
      // Remove lowest performing variation
      const lowestPerforming = existingVariations.sort((a, b) => a.quality - b.quality)[0];
      const index = existingVariations.indexOf(lowestPerforming);
      existingVariations.splice(index, 1);
    }

    // Generate variation based on successful patterns
    const variation = await this.createPromptVariation(template, context, qualityMode);
    
    if (variation) {
      existingVariations.push(variation);
      this.promptVariations.set(template.id, existingVariations);
      
      this.logger.debug('Generated new prompt variation', {
        templateId: template.id,
        variationId: variation.id,
        qualityMode
      });
    }

    return variation;
  }

  /**
   * Create a new prompt variation using optimization techniques
   */
  async createPromptVariation(template, context, qualityMode) {
    const basePrompt = template.basePrompt;
    const optimizationTechniques = [
      'addContext',
      'improveClarity',
      'addConstraints',
      'enhanceSpecificity',
      'adjustTone',
      'addExamples'
    ];

    // Select optimization technique based on historical performance
    const technique = this.selectOptimizationTechnique(template.id, optimizationTechniques);
    
    let optimizedPrompt;
    switch (technique) {
      case 'addContext':
        optimizedPrompt = this.addContextToPrompt(basePrompt, context);
        break;
      case 'improveClarity':
        optimizedPrompt = this.improveClarityPrompt(basePrompt);
        break;
      case 'addConstraints':
        optimizedPrompt = this.addConstraintsToPrompt(basePrompt, template.constraints);
        break;
      case 'enhanceSpecificity':
        optimizedPrompt = this.enhanceSpecificityPrompt(basePrompt, context);
        break;
      case 'adjustTone':
        optimizedPrompt = this.adjustTonePrompt(basePrompt, qualityMode);
        break;
      case 'addExamples':
        optimizedPrompt = this.addExamplesToPrompt(basePrompt, template.category);
        break;
      default:
        optimizedPrompt = basePrompt;
    }

    if (optimizedPrompt === basePrompt) {
      return null; // No optimization applied
    }

    return {
      id: `${template.id}_var_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      templateId: template.id,
      prompt: optimizedPrompt,
      technique,
      context,
      qualityMode,
      quality: 0.5, // Initial neutral score
      uses: 0,
      totalResponseTime: 0,
      successCount: 0,
      createdAt: new Date().toISOString(),
      lastUsed: null
    };
  }

  /**
   * Optimization techniques
   */
  addContextToPrompt(basePrompt, context) {
    const contextEntries = Object.entries(context)
      .filter(([key, value]) => value && typeof value === 'string')
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    if (!contextEntries) return basePrompt;
    
    return `${basePrompt}\n\nContext:\n${contextEntries}`;
  }

  improveClarityPrompt(basePrompt) {
    // Add clarity enhancers
    const clarityPhrases = [
      'Please be specific and detailed in your response.',
      'Provide clear, actionable guidance.',
      'Structure your response with clear headings and bullet points.',
      'Focus on practical, implementable solutions.'
    ];
    
    const randomPhrase = clarityPhrases[Math.floor(Math.random() * clarityPhrases.length)];
    return `${basePrompt}\n\n${randomPhrase}`;
  }

  addConstraintsToPrompt(basePrompt, constraints) {
    if (!constraints || Object.keys(constraints).length === 0) {
      return basePrompt;
    }

    const constraintText = Object.entries(constraints)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    return `${basePrompt}\n\nConstraints:\n${constraintText}`;
  }

  enhanceSpecificityPrompt(basePrompt, context) {
    const specificityEnhancers = [
      'Provide specific examples and use cases.',
      'Include exact steps and procedures.',
      'Mention specific tools, technologies, or methodologies.',
      'Give precise measurements, timeframes, or quantities where applicable.'
    ];

    const enhancer = specificityEnhancers[Math.floor(Math.random() * specificityEnhancers.length)];
    return `${basePrompt}\n\n${enhancer}`;
  }

  adjustTonePrompt(basePrompt, qualityMode) {
    const toneAdjustments = {
      normal: 'Respond in a professional, clear manner.',
      pro: 'Provide an expert-level, comprehensive response with technical details.',
      creative: 'Be creative and innovative in your approach.',
      analytical: 'Focus on data-driven insights and logical analysis.'
    };

    const adjustment = toneAdjustments[qualityMode] || toneAdjustments.normal;
    return `${basePrompt}\n\n${adjustment}`;
  }

  addExamplesToPrompt(basePrompt, category) {
    // This would ideally pull from a knowledge base of good examples
    const examplePrompts = {
      ux: 'Include examples of successful UX patterns and best practices.',
      design: 'Reference well-known design principles and examples.',
      architecture: 'Provide architectural patterns and real-world examples.',
      general: 'Include relevant examples to illustrate your points.'
    };

    const example = examplePrompts[category] || examplePrompts.general;
    return `${basePrompt}\n\n${example}`;
  }

  /**
   * Record interaction for learning
   */
  async recordInteraction(templateId, variationId, interactionData) {
    if (!this.options.enabled) return;

    const interaction = {
      templateId,
      variationId,
      timestamp: new Date().toISOString(),
      responseTime: interactionData.responseTime,
      quality: interactionData.quality || 0.5,
      userFeedback: interactionData.userFeedback,
      success: interactionData.success !== false,
      outputLength: interactionData.outputLength || 0,
      context: interactionData.context || {},
      metadata: interactionData.metadata || {}
    };

    // Store in history
    this.interactionHistory.push(interaction);

    // Update metrics
    await this.updateMetrics(templateId, variationId, interaction);

    // Queue for optimization
    if (this.shouldTriggerOptimization(templateId)) {
      this.optimizationQueue.push(templateId);
    }

    // Cleanup old history
    this.cleanupHistory();

    this.emit('interaction_recorded', interaction);
  }

  /**
   * Update performance metrics
   */
  async updateMetrics(templateId, variationId, interaction) {
    // Update template metrics
    const templateMetrics = this.performanceMetrics.get(templateId);
    if (templateMetrics) {
      templateMetrics.totalUses++;
      templateMetrics.averageQuality = this.updateRunningAverage(
        templateMetrics.averageQuality,
        interaction.quality,
        templateMetrics.totalUses
      );
      templateMetrics.averageResponseTime = this.updateRunningAverage(
        templateMetrics.averageResponseTime,
        interaction.responseTime,
        templateMetrics.totalUses
      );
      templateMetrics.successRate = this.updateRunningAverage(
        templateMetrics.successRate,
        interaction.success ? 1 : 0,
        templateMetrics.totalUses
      );
    }

    // Update variation metrics
    if (variationId) {
      const variations = this.promptVariations.get(templateId) || [];
      const variation = variations.find(v => v.id === variationId);
      if (variation) {
        variation.uses++;
        variation.totalResponseTime += interaction.responseTime;
        if (interaction.success) {
          variation.successCount++;
        }
        variation.quality = this.updateRunningAverage(
          variation.quality,
          interaction.quality,
          variation.uses
        );
        variation.lastUsed = interaction.timestamp;
      }
    }

    // Persist metrics to Redis
    await this.persistMetrics(templateId);
  }

  /**
   * Update running average
   */
  updateRunningAverage(currentAverage, newValue, count) {
    return ((currentAverage * (count - 1)) + newValue) / count;
  }

  /**
   * Calculate variation score
   */
  calculateVariationScore(variation) {
    const qualityScore = variation.quality * 0.4;
    const successRate = variation.uses > 0 ? (variation.successCount / variation.uses) * 0.3 : 0;
    const responseTimeScore = Math.max(0, (5000 - (variation.totalResponseTime / variation.uses)) / 5000) * 0.2;
    const recencyScore = this.calculateRecencyScore(variation.lastUsed) * 0.1;
    
    return qualityScore + successRate + responseTimeScore + recencyScore;
  }

  /**
   * Calculate recency score
   */
  calculateRecencyScore(lastUsed) {
    if (!lastUsed) return 0;
    
    const daysSinceLastUse = (Date.now() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - (daysSinceLastUse / 30)); // Decay over 30 days
  }

  /**
   * Calculate context similarity
   */
  calculateContextSimilarity(context1, context2) {
    if (!context1 || !context2) return 0;
    
    const keys1 = Object.keys(context1);
    const keys2 = Object.keys(context2);
    
    if (keys1.length === 0 && keys2.length === 0) return 1;
    if (keys1.length === 0 || keys2.length === 0) return 0;
    
    const commonKeys = keys1.filter(key => keys2.includes(key));
    const similarityScore = commonKeys.length / Math.max(keys1.length, keys2.length);
    
    return similarityScore;
  }

  /**
   * Select optimization technique based on historical performance
   */
  selectOptimizationTechnique(templateId, techniques) {
    // For now, randomly select. In a full implementation, this would be based on historical success
    return techniques[Math.floor(Math.random() * techniques.length)];
  }

  /**
   * Check if optimization should be triggered
   */
  shouldTriggerOptimization(templateId) {
    const metrics = this.performanceMetrics.get(templateId);
    if (!metrics) return false;

    return metrics.totalUses % this.options.minSamples === 0 &&
           metrics.averageQuality < this.options.qualityThreshold;
  }

  /**
   * Start optimization process
   */
  startOptimizationProcess() {
    setInterval(() => {
      this.processOptimizationQueue();
    }, this.options.optimizationInterval);

    this.logger.info('Prompt optimization process started');
  }

  /**
   * Process optimization queue
   */
  async processOptimizationQueue() {
    while (this.optimizationQueue.length > 0) {
      const templateId = this.optimizationQueue.shift();
      await this.optimizeTemplate(templateId);
    }
  }

  /**
   * Optimize a specific template
   */
  async optimizeTemplate(templateId) {
    try {
      const template = this.promptTemplates.get(templateId);
      const metrics = this.performanceMetrics.get(templateId);
      
      if (!template || !metrics) return;

      // Analyze performance patterns
      const recentInteractions = this.interactionHistory
        .filter(i => i.templateId === templateId)
        .slice(-100); // Last 100 interactions

      if (recentInteractions.length < this.options.minSamples) return;

      // Identify improvement opportunities
      const improvements = await this.identifyImprovements(template, recentInteractions);
      
      // Apply improvements
      for (const improvement of improvements) {
        await this.applyImprovement(templateId, improvement);
      }

      this.logger.info('Template optimization completed', {
        templateId,
        improvements: improvements.length,
        averageQuality: metrics.averageQuality
      });

      this.emit('template_optimized', { templateId, improvements });
    } catch (error) {
      this.logger.error('Template optimization failed', error, { templateId });
    }
  }

  /**
   * Identify improvement opportunities
   */
  async identifyImprovements(template, interactions) {
    const improvements = [];

    // Analyze quality patterns
    const lowQualityInteractions = interactions.filter(i => i.quality < this.options.qualityThreshold);
    
    if (lowQualityInteractions.length > interactions.length * 0.3) {
      improvements.push({
        type: 'quality',
        description: 'High rate of low-quality responses',
        action: 'enhance_clarity',
        priority: 'high'
      });
    }

    // Analyze response time patterns
    const averageResponseTime = interactions.reduce((sum, i) => sum + i.responseTime, 0) / interactions.length;
    
    if (averageResponseTime > 10000) { // 10 seconds
      improvements.push({
        type: 'performance',
        description: 'High average response time',
        action: 'optimize_length',
        priority: 'medium'
      });
    }

    // Analyze user feedback patterns
    const negativeFeedback = interactions.filter(i => i.userFeedback && i.userFeedback < 0);
    
    if (negativeFeedback.length > interactions.length * 0.2) {
      improvements.push({
        type: 'user_satisfaction',
        description: 'High rate of negative feedback',
        action: 'adjust_tone',
        priority: 'high'
      });
    }

    return improvements;
  }

  /**
   * Apply improvement to template
   */
  async applyImprovement(templateId, improvement) {
    // Create new variation with improvement
    const template = this.promptTemplates.get(templateId);
    if (!template) return;

    const improvedVariation = await this.createImprovementVariation(template, improvement);
    if (improvedVariation) {
      const variations = this.promptVariations.get(templateId) || [];
      variations.push(improvedVariation);
      this.promptVariations.set(templateId, variations);
    }
  }

  /**
   * Create variation based on improvement
   */
  async createImprovementVariation(template, improvement) {
    let improvedPrompt;
    
    switch (improvement.action) {
      case 'enhance_clarity':
        improvedPrompt = this.improveClarityPrompt(template.basePrompt);
        break;
      case 'optimize_length':
        improvedPrompt = this.optimizeLengthPrompt(template.basePrompt);
        break;
      case 'adjust_tone':
        improvedPrompt = this.adjustTonePrompt(template.basePrompt, 'pro');
        break;
      default:
        return null;
    }

    return {
      id: `${template.id}_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      templateId: template.id,
      prompt: improvedPrompt,
      technique: improvement.action,
      improvement,
      quality: 0.6, // Slightly higher initial score for improvements
      uses: 0,
      totalResponseTime: 0,
      successCount: 0,
      createdAt: new Date().toISOString(),
      lastUsed: null
    };
  }

  /**
   * Optimize prompt length
   */
  optimizeLengthPrompt(basePrompt) {
    return `${basePrompt}\n\nPlease provide a concise but comprehensive response.`;
  }

  /**
   * Render prompt with variables
   */
  renderPrompt(prompt, context) {
    let renderedPrompt = prompt;
    
    // Simple variable substitution
    for (const [key, value] of Object.entries(context)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      renderedPrompt = renderedPrompt.replace(placeholder, value);
    }
    
    return renderedPrompt;
  }

  /**
   * Load templates from storage
   */
  async loadPromptTemplates() {
    try {
      const templatesKey = 'prompt_optimizer:templates';
      const templates = await this.redisClient.hgetall(templatesKey);
      
      for (const [templateId, data] of Object.entries(templates)) {
        const template = JSON.parse(data);
        this.promptTemplates.set(templateId, template);
      }
    } catch (error) {
      this.logger.error('Failed to load prompt templates', error);
    }
  }

  /**
   * Load performance metrics from storage
   */
  async loadPerformanceMetrics() {
    try {
      const metricsKey = 'prompt_optimizer:metrics';
      const metrics = await this.redisClient.hgetall(metricsKey);
      
      for (const [templateId, data] of Object.entries(metrics)) {
        const metric = JSON.parse(data);
        this.performanceMetrics.set(templateId, metric);
      }
    } catch (error) {
      this.logger.error('Failed to load performance metrics', error);
    }
  }

  /**
   * Persist metrics to Redis
   */
  async persistMetrics(templateId) {
    try {
      const metricsKey = 'prompt_optimizer:metrics';
      const metrics = this.performanceMetrics.get(templateId);
      
      if (metrics) {
        await this.redisClient.hset(metricsKey, templateId, JSON.stringify(metrics));
      }
    } catch (error) {
      this.logger.error('Failed to persist metrics', error, { templateId });
    }
  }

  /**
   * Clean up old history
   */
  cleanupHistory() {
    const cutoff = Date.now() - this.options.retentionPeriod;
    this.interactionHistory = this.interactionHistory.filter(
      interaction => new Date(interaction.timestamp).getTime() > cutoff
    );
  }

  /**
   * Get optimization statistics
   */
  getStats() {
    const stats = {
      enabled: this.options.enabled,
      templates: this.promptTemplates.size,
      variations: Array.from(this.promptVariations.values()).reduce((sum, vars) => sum + vars.length, 0),
      interactions: this.interactionHistory.length,
      queueSize: this.optimizationQueue.length,
      templateStats: {}
    };

    // Add per-template stats
    for (const [templateId, metrics] of this.performenceMetrics.entries()) {
      stats.templateStats[templateId] = {
        uses: metrics.totalUses,
        averageQuality: Math.round(metrics.averageQuality * 100) / 100,
        successRate: Math.round(metrics.successRate * 100),
        averageResponseTime: Math.round(metrics.averageResponseTime),
        variations: this.promptVariations.get(templateId)?.length || 0
      };
    }

    return stats;
  }

  /**
   * Get template performance
   */
  getTemplatePerformance(templateId) {
    const template = this.promptTemplates.get(templateId);
    const metrics = this.performanceMetrics.get(templateId);
    const variations = this.promptVariations.get(templateId) || [];

    if (!template || !metrics) {
      return null;
    }

    return {
      template,
      metrics,
      variations: variations.map(v => ({
        id: v.id,
        technique: v.technique,
        quality: v.quality,
        uses: v.uses,
        successRate: v.uses > 0 ? (v.successCount / v.uses) : 0,
        lastUsed: v.lastUsed
      })),
      recentInteractions: this.interactionHistory
        .filter(i => i.templateId === templateId)
        .slice(-20)
    };
  }

  /**
   * Export optimization data
   */
  exportData() {
    return {
      templates: Array.from(this.promptTemplates.entries()),
      variations: Array.from(this.promptVariations.entries()),
      metrics: Array.from(this.performanceMetrics.entries()),
      interactions: this.interactionHistory.slice(-1000), // Last 1000 interactions
      stats: this.getStats()
    };
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down prompt optimizer');
    this.removeAllListeners();
  }
}

// Singleton instance
let globalPromptOptimizer = null;

export const initializePromptOptimizer = (redisClient, logger, options = {}) => {
  if (globalPromptOptimizer) {
    globalPromptOptimizer.shutdown();
  }
  globalPromptOptimizer = new PromptOptimizer(redisClient, logger, options);
  return globalPromptOptimizer;
};

export const getPromptOptimizer = () => {
  if (!globalPromptOptimizer) {
    throw new Error('Prompt optimizer not initialized. Call initializePromptOptimizer() first.');
  }
  return globalPromptOptimizer;
};