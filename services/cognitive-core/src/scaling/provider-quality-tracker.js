const EventEmitter = require('events');

/**
 * Provider Quality Tracker
 * 
 * Tracks answer quality and performance for each agent-provider combination
 * to determine which provider gives the best results for specific prompts.
 * 
 * This is NOT about speed or cost, but about ANSWER QUALITY.
 */
class ProviderQualityTracker extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      minSampleSize: config.minSampleSize || 10,
      qualityThreshold: config.qualityThreshold || 0.7,
      evaluationInterval: config.evaluationInterval || 3600000, // 1 hour
      learningRate: config.learningRate || 0.1,
      ...config
    };

    // Quality metrics per agent-provider-prompt-type combination
    this.qualityMetrics = new Map();
    
    // User feedback tracking
    this.feedbackHistory = new Map();
    
    // Provider strengths/weaknesses
    this.providerProfiles = new Map();
    
    // Prompt type classifications
    this.promptTypes = new Map();
    
    // Evaluation timer
    this.evaluationTimer = null;

    this.initialize();
  }

  initialize() {
    // Initialize provider profiles with known strengths
    this.initializeProviderProfiles();
    
    // Start periodic evaluation
    this.startEvaluationTimer();
  }

  /**
   * Initialize known provider strengths and weaknesses
   */
  initializeProviderProfiles() {
    this.providerProfiles.set('gemini', {
      strengths: [
        'multimodal_analysis',
        'fast_iteration',
        'code_generation',
        'factual_accuracy'
      ],
      weaknesses: [
        'creative_writing',
        'nuanced_reasoning'
      ],
      bestFor: {
        'classifier': 0.9,      // Great for classification
        'visualInterpreter': 0.95, // Excellent for image analysis
        'validator': 0.85,      // Good for validation
        'synthesizer': 0.8      // Good for synthesis
      }
    });

    this.providerProfiles.set('claude', {
      strengths: [
        'complex_reasoning',
        'creative_design',
        'nuanced_understanding',
        'ethical_considerations',
        'detailed_analysis'
      ],
      weaknesses: [
        'speed',
        'cost'
      ],
      bestFor: {
        'uxExpert': 0.95,       // Excellent for UX design
        'planner': 0.9,         // Great for planning
        'analyst': 0.9,         // Great for analysis
        'manager': 0.85         // Good for management decisions
      }
    });

    this.providerProfiles.set('gpt4', {
      strengths: [
        'general_intelligence',
        'code_architecture',
        'system_design',
        'complex_problem_solving'
      ],
      weaknesses: [
        'cost',
        'latency'
      ],
      bestFor: {
        'architect': 0.95,      // Excellent for architecture
        'planner': 0.85,        // Good for planning
        'manager': 0.8,         // Good for management
        'analyst': 0.85         // Good for analysis
      }
    });

    this.providerProfiles.set('llama', {
      strengths: [
        'speed',
        'cost_efficiency',
        'simple_tasks',
        'pattern_matching'
      ],
      weaknesses: [
        'complex_reasoning',
        'creative_tasks',
        'nuanced_understanding'
      ],
      bestFor: {
        'validator': 0.7,       // Decent for validation
        'classifier': 0.75,     // Decent for classification
        'manager': 0.65         // Okay for simple management
      }
    });
  }

  /**
   * Track the quality of a response
   */
  async trackResponseQuality(request, response, provider, agent) {
    const promptType = this.classifyPrompt(request.prompt);
    const key = this.generateMetricKey(agent, provider, promptType);
    
    // Get or create metric entry
    let metric = this.qualityMetrics.get(key);
    if (!metric) {
      metric = this.createNewMetric(agent, provider, promptType);
      this.qualityMetrics.set(key, metric);
    }

    // Evaluate response quality
    const qualityScore = await this.evaluateResponseQuality(
      request,
      response,
      agent,
      provider,
      promptType
    );

    // Update metrics
    this.updateMetrics(metric, qualityScore, response);

    // Check if this provider should be preferred for this type
    this.updateProviderPreferences(agent, promptType, provider, qualityScore);

    // Emit quality event
    this.emit('quality-tracked', {
      agent,
      provider,
      promptType,
      qualityScore,
      metrics: metric
    });

    return {
      qualityScore,
      recommendation: this.getProviderRecommendation(agent, promptType)
    };
  }

  /**
   * Evaluate response quality based on multiple factors
   */
  async evaluateResponseQuality(request, response, agent, provider, promptType) {
    let score = 0;
    let weights = {
      completeness: 0.25,
      accuracy: 0.25,
      relevance: 0.2,
      coherence: 0.15,
      agentFit: 0.15
    };

    // 1. Completeness - Did the response address all aspects?
    const completenessScore = this.evaluateCompleteness(request, response);
    score += completenessScore * weights.completeness;

    // 2. Accuracy - Is the information correct?
    const accuracyScore = this.evaluateAccuracy(response, agent);
    score += accuracyScore * weights.accuracy;

    // 3. Relevance - Is the response on-topic?
    const relevanceScore = this.evaluateRelevance(request, response);
    score += relevanceScore * weights.relevance;

    // 4. Coherence - Is the response well-structured?
    const coherenceScore = this.evaluateCoherence(response);
    score += coherenceScore * weights.coherence;

    // 5. Agent Fit - Does it match the agent's expected output?
    const agentFitScore = this.evaluateAgentFit(response, agent);
    score += agentFitScore * weights.agentFit;

    // Apply provider profile bonus/penalty
    const profileAdjustment = this.getProviderProfileAdjustment(provider, agent);
    score = score * (1 + profileAdjustment);

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Evaluate if response addresses all aspects of the request
   */
  evaluateCompleteness(request, response) {
    // Check for key concepts from request in response
    const requestKeywords = this.extractKeywords(request.prompt);
    const responseKeywords = this.extractKeywords(response.content);
    
    const coverage = requestKeywords.filter(kw => 
      responseKeywords.some(rk => rk.includes(kw) || kw.includes(rk))
    ).length / requestKeywords.length;

    return coverage;
  }

  /**
   * Evaluate accuracy based on agent-specific criteria
   */
  evaluateAccuracy(response, agent) {
    const agentAccuracyRules = {
      'architect': {
        mustInclude: ['flow', 'node', 'connection'],
        mustNotInclude: ['maybe', 'possibly', 'not sure']
      },
      'uxExpert': {
        mustInclude: ['user', 'experience', 'design'],
        mustNotInclude: ['code', 'implementation']
      },
      'validator': {
        mustInclude: ['valid', 'check', 'correct'],
        mustNotInclude: ['error', 'invalid', 'failed']
      },
      'classifier': {
        mustInclude: ['category', 'type', 'classification'],
        mustNotInclude: ['unknown', 'unclear']
      }
    };

    const rules = agentAccuracyRules[agent] || { mustInclude: [], mustNotInclude: [] };
    const content = response.content.toLowerCase();
    
    let score = 1.0;
    
    // Check for required terms (partial penalty)
    for (const term of rules.mustInclude) {
      if (!content.includes(term)) {
        score -= 0.1;
      }
    }
    
    // Check for forbidden terms (larger penalty)
    for (const term of rules.mustNotInclude) {
      if (content.includes(term)) {
        score -= 0.2;
      }
    }
    
    return Math.max(0, score);
  }

  /**
   * Evaluate relevance to the original request
   */
  evaluateRelevance(request, response) {
    // Simple relevance check based on topic consistency
    const requestTopic = this.extractTopic(request.prompt);
    const responseTopic = this.extractTopic(response.content);
    
    // Calculate topic similarity
    const similarity = this.calculateTopicSimilarity(requestTopic, responseTopic);
    
    return similarity;
  }

  /**
   * Evaluate response coherence and structure
   */
  evaluateCoherence(response) {
    const content = response.content;
    
    // Check for structure indicators
    let score = 0.5; // Base score
    
    // Positive indicators
    if (content.includes('\n')) score += 0.1; // Has paragraphs
    if (/\d\.|•|-/.test(content)) score += 0.1; // Has lists
    if (content.length > 100 && content.length < 2000) score += 0.1; // Good length
    if (/^[A-Z]/.test(content)) score += 0.1; // Starts with capital
    if (/[.!?]$/.test(content)) score += 0.1; // Ends with punctuation
    
    // Negative indicators
    if (content.length < 50) score -= 0.2; // Too short
    if (content.length > 5000) score -= 0.1; // Too long
    if (content.split(' ').filter(w => w.length > 20).length > 5) score -= 0.1; // Too many long words
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Evaluate if response fits the agent's expected style
   */
  evaluateAgentFit(response, agent) {
    const agentStyles = {
      'architect': {
        technical: true,
        structured: true,
        detailed: true
      },
      'uxExpert': {
        userFocused: true,
        creative: true,
        principled: true
      },
      'planner': {
        sequential: true,
        organized: true,
        actionable: true
      },
      'validator': {
        precise: true,
        binary: true,
        conclusive: true
      }
    };

    const expectedStyle = agentStyles[agent];
    if (!expectedStyle) return 0.7; // Default score
    
    let score = 0;
    let checks = 0;
    
    if (expectedStyle.technical) {
      checks++;
      if (/\b(api|function|method|class|component)\b/i.test(response.content)) score++;
    }
    
    if (expectedStyle.userFocused) {
      checks++;
      if (/\b(user|experience|intuitive|friendly|accessible)\b/i.test(response.content)) score++;
    }
    
    if (expectedStyle.structured) {
      checks++;
      if (/\n|•|\d\.|step/i.test(response.content)) score++;
    }
    
    if (expectedStyle.sequential) {
      checks++;
      if (/first|then|next|finally|step \d/i.test(response.content)) score++;
    }
    
    return checks > 0 ? score / checks : 0.7;
  }

  /**
   * Get provider profile adjustment for agent
   */
  getProviderProfileAdjustment(provider, agent) {
    const profile = this.providerProfiles.get(provider);
    if (!profile || !profile.bestFor[agent]) return 0;
    
    // Return adjustment between -0.2 and +0.2 based on profile
    return (profile.bestFor[agent] - 0.7) * 0.5;
  }

  /**
   * Classify prompt into types
   */
  classifyPrompt(prompt) {
    const promptLower = prompt.toLowerCase();
    
    // Classification rules
    if (/create|build|generate|make/.test(promptLower)) return 'creation';
    if (/update|modify|change|edit/.test(promptLower)) return 'modification';
    if (/check|validate|verify|test/.test(promptLower)) return 'validation';
    if (/analyze|review|evaluate|assess/.test(promptLower)) return 'analysis';
    if (/plan|strategy|approach|steps/.test(promptLower)) return 'planning';
    if (/design|layout|ui|ux/.test(promptLower)) return 'design';
    if (/fix|solve|debug|repair/.test(promptLower)) return 'troubleshooting';
    
    return 'general';
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    // Simple keyword extraction
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
  }

  /**
   * Check if word is a stop word
   */
  isStopWord(word) {
    const stopWords = ['the', 'and', 'for', 'with', 'this', 'that', 'have', 'from', 'will', 'can', 'are', 'was', 'been'];
    return stopWords.includes(word);
  }

  /**
   * Extract main topic from text
   */
  extractTopic(text) {
    const keywords = this.extractKeywords(text);
    // Return top 3 most relevant keywords as topic
    return keywords.slice(0, 3);
  }

  /**
   * Calculate similarity between topics
   */
  calculateTopicSimilarity(topic1, topic2) {
    if (!topic1.length || !topic2.length) return 0;
    
    const matches = topic1.filter(t1 => 
      topic2.some(t2 => t1 === t2 || t1.includes(t2) || t2.includes(t1))
    ).length;
    
    return matches / Math.max(topic1.length, topic2.length);
  }

  /**
   * Generate metric key
   */
  generateMetricKey(agent, provider, promptType) {
    return `${agent}:${provider}:${promptType}`;
  }

  /**
   * Create new metric entry
   */
  createNewMetric(agent, provider, promptType) {
    return {
      agent,
      provider,
      promptType,
      samples: 0,
      totalQuality: 0,
      avgQuality: 0,
      maxQuality: 0,
      minQuality: 1,
      recentScores: [],
      lastUpdated: Date.now(),
      confidence: 0
    };
  }

  /**
   * Update metrics with new quality score
   */
  updateMetrics(metric, qualityScore, response) {
    metric.samples++;
    metric.totalQuality += qualityScore;
    metric.avgQuality = metric.totalQuality / metric.samples;
    metric.maxQuality = Math.max(metric.maxQuality, qualityScore);
    metric.minQuality = Math.min(metric.minQuality, qualityScore);
    
    // Keep last 20 scores for trend analysis
    metric.recentScores.push(qualityScore);
    if (metric.recentScores.length > 20) {
      metric.recentScores.shift();
    }
    
    // Calculate confidence based on sample size
    metric.confidence = Math.min(1, metric.samples / this.config.minSampleSize);
    
    metric.lastUpdated = Date.now();
    
    // Track response characteristics
    if (!metric.responseCharacteristics) {
      metric.responseCharacteristics = {};
    }
    metric.responseCharacteristics.avgLength = 
      ((metric.responseCharacteristics.avgLength || 0) * (metric.samples - 1) + 
       response.content.length) / metric.samples;
  }

  /**
   * Update provider preferences based on quality
   */
  updateProviderPreferences(agent, promptType, provider, qualityScore) {
    const preferenceKey = `${agent}:${promptType}`;
    
    if (!this.promptTypes.has(preferenceKey)) {
      this.promptTypes.set(preferenceKey, new Map());
    }
    
    const preferences = this.promptTypes.get(preferenceKey);
    const currentScore = preferences.get(provider) || 0;
    
    // Use exponential moving average for smooth updates
    const newScore = currentScore * (1 - this.config.learningRate) + 
                     qualityScore * this.config.learningRate;
    
    preferences.set(provider, newScore);
  }

  /**
   * Get best provider recommendation for agent and prompt type
   */
  getProviderRecommendation(agent, promptType) {
    const preferenceKey = `${agent}:${promptType}`;
    const preferences = this.promptTypes.get(preferenceKey);
    
    if (!preferences || preferences.size === 0) {
      // Use profile-based recommendation
      return this.getProfileBasedRecommendation(agent);
    }
    
    // Find provider with highest quality score
    let bestProvider = null;
    let bestScore = 0;
    
    for (const [provider, score] of preferences) {
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }
    
    // Only recommend if score is above threshold
    if (bestScore >= this.config.qualityThreshold) {
      return {
        provider: bestProvider,
        confidence: bestScore,
        reason: 'quality_based'
      };
    }
    
    return this.getProfileBasedRecommendation(agent);
  }

  /**
   * Get profile-based recommendation
   */
  getProfileBasedRecommendation(agent) {
    let bestProvider = 'gemini'; // Default
    let bestScore = 0;
    
    for (const [provider, profile] of this.providerProfiles) {
      const score = profile.bestFor[agent] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }
    
    return {
      provider: bestProvider,
      confidence: bestScore,
      reason: 'profile_based'
    };
  }

  /**
   * Record user feedback on response quality
   */
  recordUserFeedback(agent, provider, promptType, feedback) {
    const key = this.generateMetricKey(agent, provider, promptType);
    
    if (!this.feedbackHistory.has(key)) {
      this.feedbackHistory.set(key, []);
    }
    
    const feedbackEntry = {
      timestamp: Date.now(),
      rating: feedback.rating, // 1-5 scale
      comment: feedback.comment,
      helpful: feedback.helpful // boolean
    };
    
    this.feedbackHistory.get(key).push(feedbackEntry);
    
    // Update quality metrics based on feedback
    const metric = this.qualityMetrics.get(key);
    if (metric) {
      // Adjust quality score based on user feedback
      const feedbackScore = feedback.rating / 5;
      metric.avgQuality = metric.avgQuality * 0.7 + feedbackScore * 0.3;
      metric.userFeedbackScore = feedbackScore;
    }
    
    this.emit('user-feedback', {
      agent,
      provider,
      promptType,
      feedback: feedbackEntry
    });
  }

  /**
   * Start evaluation timer
   */
  startEvaluationTimer() {
    this.evaluationTimer = setInterval(() => {
      this.evaluateProviderPerformance();
    }, this.config.evaluationInterval);
  }

  /**
   * Evaluate overall provider performance
   */
  evaluateProviderPerformance() {
    const evaluation = {
      timestamp: Date.now(),
      providers: {},
      agents: {},
      recommendations: []
    };
    
    // Aggregate by provider
    for (const [key, metric] of this.qualityMetrics) {
      const [agent, provider, promptType] = key.split(':');
      
      if (!evaluation.providers[provider]) {
        evaluation.providers[provider] = {
          totalSamples: 0,
          avgQuality: 0,
          bestAgent: null,
          bestScore: 0
        };
      }
      
      const providerStats = evaluation.providers[provider];
      providerStats.totalSamples += metric.samples;
      providerStats.avgQuality = 
        (providerStats.avgQuality * (providerStats.totalSamples - metric.samples) + 
         metric.avgQuality * metric.samples) / providerStats.totalSamples;
      
      if (metric.avgQuality > providerStats.bestScore) {
        providerStats.bestScore = metric.avgQuality;
        providerStats.bestAgent = agent;
      }
      
      // Aggregate by agent
      if (!evaluation.agents[agent]) {
        evaluation.agents[agent] = {
          bestProvider: null,
          bestScore: 0
        };
      }
      
      if (metric.avgQuality > evaluation.agents[agent].bestScore) {
        evaluation.agents[agent].bestScore = metric.avgQuality;
        evaluation.agents[agent].bestProvider = provider;
      }
    }
    
    // Generate recommendations
    for (const [agent, stats] of Object.entries(evaluation.agents)) {
      if (stats.bestProvider && stats.bestScore >= this.config.qualityThreshold) {
        evaluation.recommendations.push({
          agent,
          recommendedProvider: stats.bestProvider,
          qualityScore: stats.bestScore,
          confidence: this.calculateConfidence(agent, stats.bestProvider)
        });
      }
    }
    
    this.emit('evaluation-complete', evaluation);
    
    return evaluation;
  }

  /**
   * Calculate confidence for recommendation
   */
  calculateConfidence(agent, provider) {
    let totalSamples = 0;
    let relevantSamples = 0;
    
    for (const [key, metric] of this.qualityMetrics) {
      const [a, p] = key.split(':');
      if (a === agent) {
        totalSamples += metric.samples;
        if (p === provider) {
          relevantSamples += metric.samples;
        }
      }
    }
    
    if (totalSamples === 0) return 0;
    
    // Confidence based on sample size and distribution
    const sampleConfidence = Math.min(1, relevantSamples / this.config.minSampleSize);
    const distributionConfidence = relevantSamples / totalSamples;
    
    return sampleConfidence * 0.7 + distributionConfidence * 0.3;
  }

  /**
   * Get quality report
   */
  getQualityReport() {
    const report = {
      summary: {
        totalMetrics: this.qualityMetrics.size,
        totalFeedback: Array.from(this.feedbackHistory.values()).flat().length,
        evaluationTime: Date.now()
      },
      byAgent: {},
      byProvider: {},
      recommendations: []
    };
    
    // Organize metrics by agent
    for (const [key, metric] of this.qualityMetrics) {
      const [agent, provider, promptType] = key.split(':');
      
      if (!report.byAgent[agent]) {
        report.byAgent[agent] = {};
      }
      
      if (!report.byAgent[agent][provider]) {
        report.byAgent[agent][provider] = {
          samples: 0,
          avgQuality: 0,
          promptTypes: {}
        };
      }
      
      report.byAgent[agent][provider].samples += metric.samples;
      report.byAgent[agent][provider].avgQuality = 
        (report.byAgent[agent][provider].avgQuality * 
         (report.byAgent[agent][provider].samples - metric.samples) +
         metric.avgQuality * metric.samples) / 
        report.byAgent[agent][provider].samples;
      
      report.byAgent[agent][provider].promptTypes[promptType] = {
        avgQuality: metric.avgQuality,
        samples: metric.samples,
        confidence: metric.confidence
      };
    }
    
    // Generate recommendations
    for (const [agent, providers] of Object.entries(report.byAgent)) {
      let best = { provider: null, score: 0 };
      
      for (const [provider, stats] of Object.entries(providers)) {
        if (stats.avgQuality > best.score && stats.samples >= this.config.minSampleSize) {
          best = { provider, score: stats.avgQuality };
        }
      }
      
      if (best.provider) {
        report.recommendations.push({
          agent,
          provider: best.provider,
          quality: best.score,
          samples: providers[best.provider].samples
        });
      }
    }
    
    return report;
  }

  /**
   * Export quality data for analysis
   */
  exportQualityData() {
    return {
      metrics: Array.from(this.qualityMetrics.entries()).map(([key, value]) => ({
        key,
        ...value
      })),
      feedback: Array.from(this.feedbackHistory.entries()).map(([key, value]) => ({
        key,
        feedback: value
      })),
      profiles: Array.from(this.providerProfiles.entries()).map(([key, value]) => ({
        provider: key,
        ...value
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Import quality data
   */
  importQualityData(data) {
    if (data.metrics) {
      for (const metric of data.metrics) {
        this.qualityMetrics.set(metric.key, metric);
      }
    }
    
    if (data.feedback) {
      for (const item of data.feedback) {
        this.feedbackHistory.set(item.key, item.feedback);
      }
    }
    
    this.emit('data-imported', {
      metrics: data.metrics?.length || 0,
      feedback: data.feedback?.length || 0
    });
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
    }
  }
}

module.exports = ProviderQualityTracker;