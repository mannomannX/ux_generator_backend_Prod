const EventEmitter = require('events');

/**
 * Adaptive Cost Optimizer
 * 
 * Monitors actual API usage and costs, then dynamically adjusts routing
 * to stay within budget while maintaining performance.
 * 
 * Features:
 * - Real-time cost tracking
 * - Budget enforcement
 * - Dynamic provider switching
 * - Usage pattern learning
 * - Cost prediction
 */
class AdaptiveCostOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      dailyBudget: config.dailyBudget || 100, // $100/day default
      monthlyBudget: config.monthlyBudget || 2000, // $2000/month
      budgetAlertThreshold: config.budgetAlertThreshold || 0.8, // Alert at 80%
      optimizationInterval: config.optimizationInterval || 60000, // 1 minute
      learningRate: config.learningRate || 0.1,
      ...config
    };

    // Usage tracking
    this.usage = {
      daily: new Map(),
      monthly: new Map(),
      hourly: new Map()
    };

    // Cost tracking
    this.costs = {
      daily: 0,
      monthly: 0,
      byProvider: new Map(),
      byAgent: new Map(),
      byUser: new Map()
    };

    // Performance metrics
    this.performance = {
      byProvider: new Map(),
      byAgent: new Map()
    };

    // Learned patterns
    this.patterns = {
      peakHours: [],
      agentUsage: new Map(),
      userBehavior: new Map(),
      costSpikes: []
    };

    // Optimization state
    this.optimizationState = {
      mode: 'balanced', // 'economy', 'balanced', 'performance'
      restrictions: new Set(),
      overrides: new Map()
    };

    this.initializeOptimizer();
  }

  initializeOptimizer() {
    // Start optimization loop
    this.optimizationTimer = setInterval(() => {
      this.optimize();
    }, this.config.optimizationInterval);

    // Reset daily costs at midnight
    this.scheduleDailyReset();

    // Load historical data if available
    this.loadHistoricalData();
  }

  /**
   * Track API usage and cost
   */
  trackUsage(request, response, provider) {
    const now = Date.now();
    const hour = new Date().getHours();
    const date = new Date().toDateString();
    
    // Calculate cost
    const cost = this.calculateCost(request, response, provider);
    
    // Update cost tracking
    this.costs.daily += cost;
    this.costs.monthly += cost;
    
    // Track by provider
    const providerCosts = this.costs.byProvider.get(provider) || 0;
    this.costs.byProvider.set(provider, providerCosts + cost);
    
    // Track by agent
    const agentCosts = this.costs.byAgent.get(request.agent) || 0;
    this.costs.byAgent.set(request.agent, agentCosts + cost);
    
    // Track by user tier
    const userTier = request.userTier || 'free';
    const tierCosts = this.costs.byUser.get(userTier) || 0;
    this.costs.byUser.set(userTier, tierCosts + cost);
    
    // Track hourly patterns
    const hourlyUsage = this.usage.hourly.get(hour) || { count: 0, cost: 0 };
    hourlyUsage.count++;
    hourlyUsage.cost += cost;
    this.usage.hourly.set(hour, hourlyUsage);
    
    // Track performance
    this.trackPerformance(provider, request.agent, response.latency);
    
    // Check budget alerts
    this.checkBudgetAlerts();
    
    // Emit usage event
    this.emit('usage-tracked', {
      provider,
      agent: request.agent,
      cost,
      totalDaily: this.costs.daily,
      remainingBudget: this.config.dailyBudget - this.costs.daily
    });
    
    return { cost, budget: this.getBudgetStatus() };
  }

  /**
   * Calculate actual cost based on token usage
   */
  calculateCost(request, response, provider) {
    const providerRates = {
      gemini: { input: 0.00025, output: 0.0005 },
      claude: { input: 0.003, output: 0.015 },
      gpt4: { input: 0.01, output: 0.03 },
      llama: { input: 0.0001, output: 0.0001 }
    };
    
    const rates = providerRates[provider] || providerRates.gemini;
    const inputTokens = response.usage?.prompt_tokens || this.estimateTokens(request.prompt);
    const outputTokens = response.usage?.completion_tokens || this.estimateTokens(response.content);
    
    return (inputTokens * rates.input + outputTokens * rates.output) / 1000;
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Track performance metrics
   */
  trackPerformance(provider, agent, latency) {
    // Provider performance
    const providerPerf = this.performance.byProvider.get(provider) || {
      requests: 0,
      totalLatency: 0,
      errors: 0
    };
    providerPerf.requests++;
    providerPerf.totalLatency += latency || 0;
    providerPerf.avgLatency = providerPerf.totalLatency / providerPerf.requests;
    this.performance.byProvider.set(provider, providerPerf);
    
    // Agent performance
    const agentPerf = this.performance.byAgent.get(agent) || {
      requests: 0,
      totalLatency: 0
    };
    agentPerf.requests++;
    agentPerf.totalLatency += latency || 0;
    agentPerf.avgLatency = agentPerf.totalLatency / agentPerf.requests;
    this.performance.byAgent.set(agent, agentPerf);
  }

  /**
   * Main optimization routine
   */
  optimize() {
    const budgetStatus = this.getBudgetStatus();
    
    // Determine optimization mode based on budget
    if (budgetStatus.dailyUsage > 0.9) {
      this.setOptimizationMode('economy');
    } else if (budgetStatus.dailyUsage > 0.7) {
      this.setOptimizationMode('balanced');
    } else {
      this.setOptimizationMode('performance');
    }
    
    // Apply optimizations
    this.optimizeProviderRouting();
    this.optimizeAgentAssignments();
    this.applyUsagePatterns();
    
    // Predict future costs
    const prediction = this.predictRemainingCosts();
    
    // Emit optimization event
    this.emit('optimization-complete', {
      mode: this.optimizationState.mode,
      budgetStatus,
      prediction,
      recommendations: this.getRecommendations()
    });
  }

  /**
   * Set optimization mode
   */
  setOptimizationMode(mode) {
    if (this.optimizationState.mode === mode) return;
    
    this.optimizationState.mode = mode;
    
    switch (mode) {
      case 'economy':
        // Restrict expensive providers
        this.optimizationState.restrictions.add('gpt4');
        this.optimizationState.restrictions.add('claude');
        // Force simple requests to local models
        this.optimizationState.overrides.set('simple', 'llama');
        break;
        
      case 'balanced':
        // Allow Claude but restrict GPT-4
        this.optimizationState.restrictions.delete('claude');
        this.optimizationState.restrictions.add('gpt4');
        break;
        
      case 'performance':
        // No restrictions
        this.optimizationState.restrictions.clear();
        this.optimizationState.overrides.clear();
        break;
    }
    
    this.emit('mode-changed', mode);
  }

  /**
   * Optimize provider routing based on performance and cost
   */
  optimizeProviderRouting() {
    const routes = new Map();
    
    // Calculate cost-effectiveness score for each provider
    for (const [provider, perf] of this.performance.byProvider) {
      const cost = this.costs.byProvider.get(provider) || 0;
      const requests = perf.requests || 1;
      const avgCost = cost / requests;
      const avgLatency = perf.avgLatency || 1000;
      
      // Score: Lower is better (combines cost and latency)
      const score = (avgCost * 1000) + (avgLatency / 100);
      
      routes.set(provider, {
        score,
        avgCost,
        avgLatency,
        restricted: this.optimizationState.restrictions.has(provider)
      });
    }
    
    // Sort providers by score
    const sortedProviders = Array.from(routes.entries())
      .filter(([_, data]) => !data.restricted)
      .sort((a, b) => a[1].score - b[1].score)
      .map(([provider]) => provider);
    
    // Update routing preferences
    this.optimizationState.preferredProviders = sortedProviders;
  }

  /**
   * Optimize agent-to-provider assignments
   */
  optimizeAgentAssignments() {
    const assignments = new Map();
    
    for (const [agent, cost] of this.costs.byAgent) {
      const perf = this.performance.byAgent.get(agent);
      
      // Determine best provider for this agent based on usage
      let bestProvider = 'gemini'; // Default
      
      if (cost > 10) {
        // High-cost agent, use cheaper provider
        bestProvider = 'llama';
      } else if (perf && perf.avgLatency > 3000) {
        // Slow agent, use faster provider
        bestProvider = 'gemini';
      } else if (agent.includes('expert') || agent.includes('architect')) {
        // Complex agents, use better provider if budget allows
        if (this.optimizationState.mode !== 'economy') {
          bestProvider = 'claude';
        }
      }
      
      assignments.set(agent, bestProvider);
    }
    
    this.optimizationState.agentAssignments = assignments;
  }

  /**
   * Apply learned usage patterns
   */
  applyUsagePatterns() {
    const hour = new Date().getHours();
    const hourlyData = this.usage.hourly.get(hour);
    
    if (!hourlyData) return;
    
    // Identify peak hours
    const avgHourlyUsage = this.calculateAverageHourlyUsage();
    const isPeakHour = hourlyData.count > avgHourlyUsage * 1.5;
    
    if (isPeakHour && !this.patterns.peakHours.includes(hour)) {
      this.patterns.peakHours.push(hour);
    }
    
    // Adjust strategy for peak hours
    if (isPeakHour) {
      // During peak hours, be more conservative
      this.optimizationState.peakHourMode = true;
      this.emit('peak-hour-detected', hour);
    }
  }

  /**
   * Predict remaining costs for the day
   */
  predictRemainingCosts() {
    const now = new Date();
    const hoursRemaining = 24 - now.getHours();
    const avgHourlyCost = this.costs.daily / (now.getHours() + 1);
    
    // Simple linear prediction
    let predictedCost = avgHourlyCost * hoursRemaining;
    
    // Adjust for known patterns
    for (let h = now.getHours() + 1; h < 24; h++) {
      const hourlyData = this.usage.hourly.get(h);
      if (hourlyData) {
        // Use historical data if available
        predictedCost += hourlyData.cost * 0.3; // Weight historical data
      }
    }
    
    return {
      predicted: this.costs.daily + predictedCost,
      confidence: 0.7,
      withinBudget: (this.costs.daily + predictedCost) < this.config.dailyBudget
    };
  }

  /**
   * Get optimization recommendations
   */
  getRecommendations() {
    const recommendations = [];
    const budgetStatus = this.getBudgetStatus();
    
    // Budget recommendations
    if (budgetStatus.dailyUsage > 0.8) {
      recommendations.push({
        type: 'budget',
        priority: 'high',
        message: 'Daily budget nearly exhausted. Switch to economy mode.',
        action: () => this.setOptimizationMode('economy')
      });
    }
    
    // Provider recommendations
    for (const [provider, cost] of this.costs.byProvider) {
      const perf = this.performance.byProvider.get(provider);
      if (perf && perf.avgLatency > 3000) {
        recommendations.push({
          type: 'performance',
          priority: 'medium',
          message: `${provider} showing high latency (${perf.avgLatency}ms)`,
          action: () => this.optimizationState.restrictions.add(provider)
        });
      }
    }
    
    // Agent recommendations
    for (const [agent, cost] of this.costs.byAgent) {
      if (cost > this.config.dailyBudget * 0.2) {
        recommendations.push({
          type: 'cost',
          priority: 'high',
          message: `Agent ${agent} consuming ${(cost/this.config.dailyBudget*100).toFixed(1)}% of daily budget`,
          action: () => this.optimizationState.agentAssignments.set(agent, 'llama')
        });
      }
    }
    
    // Cache recommendations
    const cacheHitRate = this.getCacheHitRate();
    if (cacheHitRate < 0.2) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: `Low cache hit rate (${(cacheHitRate*100).toFixed(1)}%). Consider cache warming.`,
        action: () => this.emit('warm-cache-recommended')
      });
    }
    
    return recommendations;
  }

  /**
   * Get current budget status
   */
  getBudgetStatus() {
    return {
      dailyBudget: this.config.dailyBudget,
      dailySpent: this.costs.daily,
      dailyRemaining: Math.max(0, this.config.dailyBudget - this.costs.daily),
      dailyUsage: this.costs.daily / this.config.dailyBudget,
      monthlyBudget: this.config.monthlyBudget,
      monthlySpent: this.costs.monthly,
      monthlyRemaining: Math.max(0, this.config.monthlyBudget - this.costs.monthly),
      monthlyUsage: this.costs.monthly / this.config.monthlyBudget,
      mode: this.optimizationState.mode
    };
  }

  /**
   * Check and trigger budget alerts
   */
  checkBudgetAlerts() {
    const status = this.getBudgetStatus();
    
    // Daily budget alert
    if (status.dailyUsage > this.config.budgetAlertThreshold) {
      this.emit('budget-alert', {
        type: 'daily',
        usage: status.dailyUsage,
        spent: status.dailySpent,
        remaining: status.dailyRemaining
      });
    }
    
    // Monthly budget alert
    if (status.monthlyUsage > this.config.budgetAlertThreshold) {
      this.emit('budget-alert', {
        type: 'monthly',
        usage: status.monthlyUsage,
        spent: status.monthlySpent,
        remaining: status.monthlyRemaining
      });
    }
    
    // Critical alert
    if (status.dailyUsage > 0.95) {
      this.emit('budget-critical', {
        message: 'Daily budget nearly exhausted. Switching to economy mode.',
        action: 'economy-mode'
      });
      this.setOptimizationMode('economy');
    }
  }

  /**
   * Get provider recommendation for a request
   */
  getProviderRecommendation(request) {
    // Check for overrides
    if (this.optimizationState.overrides.has(request.complexity)) {
      return this.optimizationState.overrides.get(request.complexity);
    }
    
    // Check agent assignments
    if (this.optimizationState.agentAssignments.has(request.agent)) {
      return this.optimizationState.agentAssignments.get(request.agent);
    }
    
    // Use preferred providers list
    if (this.optimizationState.preferredProviders) {
      return this.optimizationState.preferredProviders[0];
    }
    
    // Default based on mode
    switch (this.optimizationState.mode) {
      case 'economy':
        return 'llama';
      case 'balanced':
        return 'gemini';
      case 'performance':
        return 'claude';
      default:
        return 'gemini';
    }
  }

  /**
   * Calculate average hourly usage
   */
  calculateAverageHourlyUsage() {
    let total = 0;
    let count = 0;
    
    for (const [_, data] of this.usage.hourly) {
      total += data.count;
      count++;
    }
    
    return count > 0 ? total / count : 0;
  }

  /**
   * Get cache hit rate (placeholder - would integrate with cache)
   */
  getCacheHitRate() {
    // This would integrate with the semantic cache
    return 0.3; // Placeholder
  }

  /**
   * Schedule daily reset
   */
  scheduleDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
      this.resetDailyCosts();
      this.scheduleDailyReset(); // Schedule next reset
    }, msUntilMidnight);
  }

  /**
   * Reset daily costs
   */
  resetDailyCosts() {
    // Archive daily data
    const date = new Date().toDateString();
    this.usage.daily.set(date, {
      cost: this.costs.daily,
      byProvider: new Map(this.costs.byProvider),
      byAgent: new Map(this.costs.byAgent)
    });
    
    // Reset daily counters
    this.costs.daily = 0;
    this.costs.byProvider.clear();
    this.costs.byAgent.clear();
    
    // Reset optimization state
    this.setOptimizationMode('balanced');
    
    this.emit('daily-reset', date);
  }

  /**
   * Load historical data for pattern learning
   */
  loadHistoricalData() {
    // This would load from database
    // For now, initialize with reasonable defaults
    this.patterns.peakHours = [9, 10, 11, 14, 15, 16]; // Business hours
  }

  /**
   * Get detailed cost report
   */
  getCostReport() {
    return {
      current: this.getBudgetStatus(),
      byProvider: Object.fromEntries(this.costs.byProvider),
      byAgent: Object.fromEntries(this.costs.byAgent),
      byUserTier: Object.fromEntries(this.costs.byUser),
      hourlyPattern: Object.fromEntries(this.usage.hourly),
      performance: {
        byProvider: Object.fromEntries(this.performance.byProvider),
        byAgent: Object.fromEntries(this.performance.byAgent)
      },
      recommendations: this.getRecommendations(),
      optimizationMode: this.optimizationState.mode,
      predictions: this.predictRemainingCosts()
    };
  }

  /**
   * Manual budget adjustment
   */
  adjustBudget(dailyBudget, monthlyBudget) {
    this.config.dailyBudget = dailyBudget || this.config.dailyBudget;
    this.config.monthlyBudget = monthlyBudget || this.config.monthlyBudget;
    
    // Re-optimize with new budget
    this.optimize();
    
    this.emit('budget-adjusted', {
      daily: this.config.dailyBudget,
      monthly: this.config.monthlyBudget
    });
  }

  /**
   * Emergency cost reduction
   */
  emergencyCostReduction() {
    // Immediate actions to reduce costs
    this.setOptimizationMode('economy');
    this.optimizationState.restrictions.add('gpt4');
    this.optimizationState.restrictions.add('claude');
    this.optimizationState.overrides.set('*', 'llama'); // Force all to local
    
    this.emit('emergency-mode', {
      reason: 'Budget exceeded',
      actions: ['economy-mode', 'restrict-premium', 'force-local']
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
    }
  }
}

module.exports = AdaptiveCostOptimizer;