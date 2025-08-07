/**
 * Model Testing Interface
 * 
 * Admin-only interface for testing different AI models and providers
 * to determine the best configuration for each agent.
 * 
 * SECURITY: This should ONLY be accessible to authorized admins/devs
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ModelTestingInterface extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enabled: process.env.ENABLE_MODEL_TESTING === 'true',
      secretKey: process.env.MODEL_TESTING_SECRET || crypto.randomBytes(32).toString('hex'),
      maxConcurrentTests: config.maxConcurrentTests || 3,
      testTimeout: config.testTimeout || 30000,
      ...config
    };

    // Test sessions storage
    this.testSessions = new Map();
    
    // Test results storage
    this.testResults = new Map();
    
    // Active tests tracking
    this.activeTests = new Set();

    // Security: Track authorized sessions
    this.authorizedSessions = new Set();
  }

  /**
   * Authenticate admin for testing access
   */
  authenticate(authToken, adminId) {
    // Verify token (in production, integrate with your auth system)
    const expectedToken = crypto
      .createHmac('sha256', this.config.secretKey)
      .update(`admin:${adminId}`)
      .digest('hex');
    
    if (authToken !== expectedToken) {
      throw new Error('Unauthorized access to model testing interface');
    }
    
    const sessionId = crypto.randomBytes(16).toString('hex');
    this.authorizedSessions.add(sessionId);
    
    // Session expires after 1 hour
    setTimeout(() => {
      this.authorizedSessions.delete(sessionId);
    }, 3600000);
    
    return sessionId;
  }

  /**
   * Create a new test session
   */
  createTestSession(sessionId, testConfig) {
    if (!this.authorizedSessions.has(sessionId)) {
      throw new Error('Invalid or expired session');
    }
    
    const testId = `test_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    const session = {
      testId,
      sessionId,
      config: testConfig,
      status: 'pending',
      startTime: null,
      endTime: null,
      tests: [],
      results: [],
      createdAt: new Date()
    };
    
    this.testSessions.set(testId, session);
    
    return {
      testId,
      status: 'created',
      config: testConfig
    };
  }

  /**
   * Run a comprehensive model test
   */
  async runModelTest(testId, testParameters) {
    const session = this.testSessions.get(testId);
    
    if (!session) {
      throw new Error('Test session not found');
    }
    
    if (!this.authorizedSessions.has(session.sessionId)) {
      throw new Error('Session expired or unauthorized');
    }
    
    if (this.activeTests.size >= this.config.maxConcurrentTests) {
      throw new Error('Too many concurrent tests. Please wait.');
    }
    
    session.status = 'running';
    session.startTime = Date.now();
    this.activeTests.add(testId);
    
    try {
      const results = await this.executeTest(testParameters);
      
      session.results = results;
      session.status = 'completed';
      session.endTime = Date.now();
      
      // Store results for analysis
      this.storeTestResults(testId, results);
      
      return {
        testId,
        status: 'completed',
        duration: session.endTime - session.startTime,
        summary: this.generateTestSummary(results)
      };
      
    } catch (error) {
      session.status = 'failed';
      session.error = error.message;
      throw error;
      
    } finally {
      this.activeTests.delete(testId);
    }
  }

  /**
   * Execute test with multiple models
   */
  async executeTest(parameters) {
    const {
      agent,
      prompt,
      context,
      models, // Array of { provider, model, temperature }
      iterations = 1
    } = parameters;
    
    const results = [];
    
    for (const modelConfig of models) {
      const modelResults = {
        provider: modelConfig.provider,
        model: modelConfig.model,
        temperature: modelConfig.temperature,
        iterations: [],
        metrics: {
          avgResponseTime: 0,
          avgTokensUsed: 0,
          avgCost: 0,
          consistency: 0
        }
      };
      
      // Run multiple iterations for consistency testing
      for (let i = 0; i < iterations; i++) {
        const iterationResult = await this.runSingleTest(
          agent,
          prompt,
          context,
          modelConfig
        );
        
        modelResults.iterations.push(iterationResult);
      }
      
      // Calculate metrics
      modelResults.metrics = this.calculateMetrics(modelResults.iterations);
      
      results.push(modelResults);
    }
    
    return results;
  }

  /**
   * Run a single test iteration
   */
  async runSingleTest(agent, prompt, context, modelConfig) {
    const startTime = Date.now();
    
    // Simulate API call (in production, use actual API)
    const response = await this.simulateAPICall(
      agent,
      prompt,
      context,
      modelConfig
    );
    
    const endTime = Date.now();
    
    return {
      startTime,
      endTime,
      responseTime: endTime - startTime,
      response: response.content,
      tokensUsed: response.usage,
      cost: this.calculateRequestCost(response.usage, modelConfig),
      metadata: {
        model: modelConfig.model,
        provider: modelConfig.provider,
        temperature: modelConfig.temperature
      }
    };
  }

  /**
   * Simulate API call (replace with actual implementation)
   */
  async simulateAPICall(agent, prompt, context, modelConfig) {
    // In production, make actual API calls to providers
    // For now, return simulated response
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    const responseLength = Math.floor(Math.random() * 500) + 200;
    const response = {
      content: `Simulated response from ${modelConfig.provider}/${modelConfig.model} for agent ${agent}. ` +
               `This would be the actual AI response to: "${prompt}". ` +
               `Response quality and content would vary based on the model capabilities. `.repeat(3),
      usage: {
        promptTokens: Math.floor(prompt.length / 4),
        completionTokens: Math.floor(responseLength / 4),
        totalTokens: Math.floor((prompt.length + responseLength) / 4)
      }
    };
    
    return response;
  }

  /**
   * Calculate request cost
   */
  calculateRequestCost(usage, modelConfig) {
    // Cost calculation based on provider and model
    const costs = {
      'gemini': { input: 0.00025, output: 0.0005 },
      'claude': { input: 0.003, output: 0.015 },
      'gpt4': { input: 0.01, output: 0.03 },
      'llama': { input: 0.0001, output: 0.0001 }
    };
    
    const providerCosts = costs[modelConfig.provider] || costs.gemini;
    
    return {
      inputCost: (usage.promptTokens / 1000) * providerCosts.input,
      outputCost: (usage.completionTokens / 1000) * providerCosts.output,
      totalCost: ((usage.promptTokens / 1000) * providerCosts.input) + 
                 ((usage.completionTokens / 1000) * providerCosts.output)
    };
  }

  /**
   * Calculate metrics from iterations
   */
  calculateMetrics(iterations) {
    if (iterations.length === 0) return {};
    
    const metrics = {
      avgResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      avgTokensUsed: 0,
      avgCost: 0,
      consistency: 0,
      responseLengthVariance: 0
    };
    
    // Calculate averages
    let totalTime = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const responseLengths = [];
    
    for (const iteration of iterations) {
      totalTime += iteration.responseTime;
      totalTokens += iteration.tokensUsed.totalTokens;
      totalCost += iteration.cost.totalCost;
      responseLengths.push(iteration.response.length);
      
      metrics.minResponseTime = Math.min(metrics.minResponseTime, iteration.responseTime);
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, iteration.responseTime);
    }
    
    metrics.avgResponseTime = totalTime / iterations.length;
    metrics.avgTokensUsed = totalTokens / iterations.length;
    metrics.avgCost = totalCost / iterations.length;
    
    // Calculate consistency (based on response length variance)
    const avgLength = responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length;
    const variance = responseLengths.reduce((sum, len) => {
      return sum + Math.pow(len - avgLength, 2);
    }, 0) / responseLengths.length;
    
    metrics.responseLengthVariance = variance;
    metrics.consistency = 1 - (Math.sqrt(variance) / avgLength); // Higher is more consistent
    
    return metrics;
  }

  /**
   * Generate test summary
   */
  generateTestSummary(results) {
    const summary = {
      modelCount: results.length,
      bestPerformance: null,
      bestCost: null,
      bestConsistency: null,
      recommendations: []
    };
    
    // Find best in each category
    let bestTime = Infinity;
    let bestCost = Infinity;
    let bestConsistency = 0;
    
    for (const result of results) {
      const model = `${result.provider}/${result.model}`;
      
      if (result.metrics.avgResponseTime < bestTime) {
        bestTime = result.metrics.avgResponseTime;
        summary.bestPerformance = {
          model,
          avgResponseTime: result.metrics.avgResponseTime
        };
      }
      
      if (result.metrics.avgCost < bestCost) {
        bestCost = result.metrics.avgCost;
        summary.bestCost = {
          model,
          avgCost: result.metrics.avgCost
        };
      }
      
      if (result.metrics.consistency > bestConsistency) {
        bestConsistency = result.metrics.consistency;
        summary.bestConsistency = {
          model,
          consistency: result.metrics.consistency
        };
      }
    }
    
    // Generate recommendations
    if (summary.bestCost && summary.bestPerformance) {
      if (summary.bestCost.model === summary.bestPerformance.model) {
        summary.recommendations.push({
          type: 'optimal',
          model: summary.bestCost.model,
          reason: 'Best balance of cost and performance'
        });
      } else {
        summary.recommendations.push({
          type: 'cost_optimized',
          model: summary.bestCost.model,
          reason: 'Lowest cost option'
        });
        summary.recommendations.push({
          type: 'performance_optimized',
          model: summary.bestPerformance.model,
          reason: 'Fastest response time'
        });
      }
    }
    
    return summary;
  }

  /**
   * Compare test results side by side
   */
  compareResults(testId, adminReview = null) {
    const session = this.testSessions.get(testId);
    
    if (!session || !session.results) {
      throw new Error('Test results not found');
    }
    
    const comparison = {
      testId,
      timestamp: new Date(),
      models: [],
      adminReview: adminReview
    };
    
    for (const result of session.results) {
      comparison.models.push({
        provider: result.provider,
        model: result.model,
        metrics: result.metrics,
        samples: result.iterations.map(iter => ({
          response: iter.response.substring(0, 500), // First 500 chars
          responseTime: iter.responseTime,
          cost: iter.cost.totalCost
        }))
      });
    }
    
    return comparison;
  }

  /**
   * Save admin's model selection
   */
  saveAdminSelection(testId, selection) {
    const session = this.testSessions.get(testId);
    
    if (!session) {
      throw new Error('Test session not found');
    }
    
    const result = {
      testId,
      timestamp: new Date(),
      selection: {
        agent: selection.agent,
        qualityMode: selection.qualityMode,
        provider: selection.provider,
        model: selection.model,
        temperature: selection.temperature,
        reasoning: selection.reasoning
      },
      testMetrics: session.results.find(r => 
        r.provider === selection.provider && r.model === selection.model
      )?.metrics
    };
    
    // Store the selection
    const key = `${selection.agent}:${selection.qualityMode}`;
    this.testResults.set(key, result);
    
    // Emit event for config update
    this.emit('admin-selection', result);
    
    return {
      saved: true,
      key,
      selection: result.selection
    };
  }

  /**
   * Export test results for analysis
   */
  exportTestResults(testId) {
    const session = this.testSessions.get(testId);
    
    if (!session) {
      throw new Error('Test session not found');
    }
    
    return {
      testId,
      config: session.config,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.endTime - session.startTime,
      status: session.status,
      results: session.results,
      exportedAt: new Date()
    };
  }

  /**
   * Get recommended configuration based on tests
   */
  getRecommendedConfig(agent, qualityMode) {
    const key = `${agent}:${qualityMode}`;
    const savedResult = this.testResults.get(key);
    
    if (savedResult) {
      return {
        source: 'admin_tested',
        ...savedResult.selection,
        testMetrics: savedResult.testMetrics
      };
    }
    
    // Return default from agent-model-config
    const agentModelConfig = require('../config/agent-model-config');
    return {
      source: 'default_config',
      ...agentModelConfig.getAgentModel(agent, qualityMode)
    };
  }

  /**
   * Store test results
   */
  storeTestResults(testId, results) {
    // In production, store in database
    // For now, keep in memory with size limit
    if (this.testResults.size > 100) {
      const firstKey = this.testResults.keys().next().value;
      this.testResults.delete(firstKey);
    }
    
    this.testResults.set(testId, {
      timestamp: Date.now(),
      results
    });
  }

  /**
   * Clean up old test sessions
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [testId, session] of this.testSessions) {
      if (now - session.createdAt > maxAge) {
        this.testSessions.delete(testId);
      }
    }
  }
}

module.exports = ModelTestingInterface;