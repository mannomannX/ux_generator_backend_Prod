/**
 * Agent to AI Provider Mapping Configuration
 * 
 * This configuration determines which AI provider each agent should use.
 * Modify this file to optimize performance and costs based on:
 * - Provider strengths (Claude for analysis, Gemini for speed, GPT-4 for complex reasoning)
 * - Cost considerations (Gemini is cheapest, Claude/GPT-4 more expensive)
 * - Rate limits (distribute load across providers)
 * 
 * Usage-based pricing (as of Dec 2024):
 * - Gemini Pro: $0.00025/1K input, $0.0005/1K output tokens
 * - Claude Sonnet: $0.003/1K input, $0.015/1K output tokens  
 * - GPT-4 Turbo: $0.01/1K input, $0.03/1K output tokens
 * - Llama (local): Infrastructure cost only (~$0.0001/1K tokens)
 */

module.exports = {
  // Agent-specific provider preferences
  agents: {
    // Classifier - Simple categorization, use cheapest provider
    classifier: {
      primary: 'gemini',
      fallback: ['llama', 'claude'],
      model: 'gemini-1.5-flash', // Fastest Gemini model
      maxTokens: 500,
      temperature: 0.3,
      reasoning: 'Simple classification task, speed over accuracy'
    },

    // Analyst - Requires good reasoning, use balanced provider
    analyst: {
      primary: 'gemini',
      fallback: ['claude', 'gpt4'],
      model: 'gemini-1.5-pro',
      maxTokens: 2000,
      temperature: 0.5,
      reasoning: 'Analytical tasks need good reasoning but not top-tier'
    },

    // UX Expert - Creative and design-focused, use premium provider
    uxExpert: {
      primary: 'claude',
      fallback: ['gpt4', 'gemini'],
      model: 'claude-3-sonnet-20240229',
      maxTokens: 3000,
      temperature: 0.7,
      reasoning: 'Creative design work benefits from Claude\'s capabilities'
    },

    // Architect - Complex system design, use most capable provider
    architect: {
      primary: 'gpt4',
      fallback: ['claude', 'gemini'],
      model: 'gpt-4-turbo-preview',
      maxTokens: 4000,
      temperature: 0.6,
      reasoning: 'System architecture requires top reasoning capabilities'
    },

    // Planner - Strategic planning, use good reasoning provider
    planner: {
      primary: 'claude',
      fallback: ['gpt4', 'gemini'],
      model: 'claude-3-sonnet-20240229',
      maxTokens: 2500,
      temperature: 0.5,
      reasoning: 'Planning benefits from Claude\'s structured thinking'
    },

    // Validator - Rule checking, can use local model
    validator: {
      primary: 'llama',
      fallback: ['gemini', 'claude'],
      model: 'codellama-13b',
      maxTokens: 1500,
      temperature: 0.2,
      reasoning: 'Validation is rule-based, local models sufficient'
    },

    // Visual Interpreter - Image understanding, needs multimodal
    visualInterpreter: {
      primary: 'gemini',
      fallback: ['gpt4', 'claude'],
      model: 'gemini-1.5-pro-vision',
      maxTokens: 2000,
      temperature: 0.4,
      reasoning: 'Gemini has excellent multimodal capabilities'
    },

    // Synthesizer - Combining information, use balanced provider
    synthesizer: {
      primary: 'gemini',
      fallback: ['claude', 'llama'],
      model: 'gemini-1.5-pro',
      maxTokens: 3000,
      temperature: 0.5,
      reasoning: 'Synthesis needs good performance at reasonable cost'
    },

    // Manager - Orchestration decisions, use fast provider
    manager: {
      primary: 'llama',
      fallback: ['gemini', 'claude'],
      model: 'llama2-7b',
      maxTokens: 1000,
      temperature: 0.4,
      reasoning: 'Management decisions are often simple, speed matters'
    }
  },

  // Provider-specific configurations
  providers: {
    gemini: {
      apiKeys: [
        process.env.GEMINI_API_KEY_1 || process.env.GOOGLE_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5
      ].filter(Boolean),
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      rateLimit: {
        requestsPerMinute: 60,
        tokensPerMinute: 1000000,
        requestsPerDay: 1500 // Free tier limit
      },
      cost: {
        inputPer1K: 0.00025,
        outputPer1K: 0.0005
      },
      capabilities: ['text', 'code', 'vision', 'function-calling'],
      reliability: 0.99,
      avgLatency: 800 // ms
    },

    claude: {
      apiKeys: [
        process.env.CLAUDE_API_KEY_1 || process.env.ANTHROPIC_API_KEY,
        process.env.CLAUDE_API_KEY_2,
        process.env.CLAUDE_API_KEY_3
      ].filter(Boolean),
      endpoint: 'https://api.anthropic.com/v1',
      rateLimit: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
        requestsPerDay: null // No daily limit
      },
      cost: {
        inputPer1K: 0.003,
        outputPer1K: 0.015
      },
      capabilities: ['text', 'code', 'analysis', 'creative'],
      reliability: 0.98,
      avgLatency: 1200
    },

    gpt4: {
      apiKeys: [
        process.env.OPENAI_API_KEY_1 || process.env.OPENAI_API_KEY,
        process.env.OPENAI_API_KEY_2,
        process.env.OPENAI_API_KEY_3
      ].filter(Boolean),
      endpoint: 'https://api.openai.com/v1',
      rateLimit: {
        requestsPerMinute: 500,
        tokensPerMinute: 150000,
        requestsPerDay: null
      },
      cost: {
        inputPer1K: 0.01,
        outputPer1K: 0.03
      },
      capabilities: ['text', 'code', 'vision', 'function-calling', 'json-mode'],
      reliability: 0.97,
      avgLatency: 1500
    },

    llama: {
      endpoints: [
        process.env.LLAMA_ENDPOINT_1 || 'http://localhost:11434',
        process.env.LLAMA_ENDPOINT_2 || 'http://localhost:11435',
        process.env.LLAMA_ENDPOINT_3 || 'http://localhost:11436'
      ].filter(Boolean),
      models: {
        'llama2-7b': { memory: '8GB', speed: 'fast' },
        'llama2-13b': { memory: '16GB', speed: 'medium' },
        'mistral-7b': { memory: '8GB', speed: 'fast' },
        'codellama-13b': { memory: '16GB', speed: 'medium' }
      },
      rateLimit: {
        requestsPerMinute: 1000, // Limited by hardware
        tokensPerMinute: 500000,
        requestsPerDay: null
      },
      cost: {
        inputPer1K: 0.0001, // Infrastructure cost
        outputPer1K: 0.0001
      },
      capabilities: ['text', 'code'],
      reliability: 0.95, // Lower due to self-hosting
      avgLatency: 500 // Faster due to local
    }
  },

  // Dynamic routing rules based on context
  routingRules: {
    // Route based on user tier
    tierRouting: {
      free: {
        preferredProviders: ['llama', 'gemini'],
        maxCostPerRequest: 0.001,
        cachingRequired: true
      },
      basic: {
        preferredProviders: ['gemini', 'llama'],
        maxCostPerRequest: 0.01,
        cachingRequired: true
      },
      pro: {
        preferredProviders: ['gemini', 'claude'],
        maxCostPerRequest: 0.05,
        cachingRequired: false
      },
      enterprise: {
        preferredProviders: ['gpt4', 'claude', 'gemini'],
        maxCostPerRequest: 0.10,
        cachingRequired: false
      }
    },

    // Route based on request complexity
    complexityRouting: {
      simple: {
        providers: ['llama', 'gemini'],
        maxTokens: 500
      },
      moderate: {
        providers: ['gemini', 'claude'],
        maxTokens: 2000
      },
      complex: {
        providers: ['claude', 'gpt4'],
        maxTokens: 4000
      },
      critical: {
        providers: ['gpt4'], // Use best provider for critical tasks
        maxTokens: 8000
      }
    },

    // Time-based routing (optimize costs during off-peak)
    timeBasedRouting: {
      peakHours: {
        // 9 AM - 6 PM EST
        start: 9,
        end: 18,
        strategy: 'balanced', // Balance between cost and performance
        preferCache: true
      },
      offPeak: {
        // 6 PM - 9 AM EST
        start: 18,
        end: 9,
        strategy: 'quality', // Use better models during off-peak
        preferCache: false
      }
    },

    // Load balancing strategy
    loadBalancing: {
      strategy: 'weighted-round-robin', // or 'least-connections', 'random'
      weights: {
        gemini: 5,    // 50% of traffic
        claude: 2,    // 20% of traffic
        gpt4: 1,      // 10% of traffic
        llama: 2      // 20% of traffic
      },
      healthCheck: {
        enabled: true,
        interval: 30000, // 30 seconds
        timeout: 5000,
        unhealthyThreshold: 3
      }
    }
  },

  // Performance optimization settings
  optimizations: {
    // Batch similar requests
    batching: {
      enabled: true,
      maxBatchSize: 10,
      maxWaitTime: 5000, // 5 seconds
      similarityThreshold: 0.85
    },

    // Response streaming
    streaming: {
      enabled: true,
      providers: ['gpt4', 'claude'], // Providers that support streaming
      chunkSize: 100 // tokens
    },

    // Parallel processing
    parallelization: {
      enabled: true,
      maxConcurrent: 5,
      strategies: {
        'split-merge': true, // Split complex tasks
        'ensemble': false    // Use multiple providers and merge
      }
    },

    // Retries and fallbacks
    resilience: {
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      fallbackToCache: true,
      fallbackToTemplate: true
    }
  },

  // Monitoring and alerting
  monitoring: {
    metrics: {
      trackCosts: true,
      trackLatency: true,
      trackErrors: true,
      trackTokenUsage: true
    },
    alerts: {
      costThreshold: 100, // Alert if daily cost exceeds $100
      errorRateThreshold: 0.05, // Alert if error rate > 5%
      latencyThreshold: 5000 // Alert if p95 latency > 5s
    },
    reporting: {
      dailyReport: true,
      weeklyReport: true,
      perAgentBreakdown: true,
      perProviderBreakdown: true
    }
  },

  // A/B testing configuration
  experiments: {
    enabled: false,
    tests: [
      {
        name: 'gemini-vs-claude-for-analysis',
        agents: ['analyst'],
        variants: {
          control: 'gemini',
          treatment: 'claude'
        },
        allocation: 0.5, // 50/50 split
        metrics: ['latency', 'cost', 'quality']
      }
    ]
  }
};

// Helper function to get provider for an agent
function getProviderForAgent(agentName, context = {}) {
  const config = module.exports;
  const agentConfig = config.agents[agentName];
  
  if (!agentConfig) {
    console.warn(`No configuration for agent: ${agentName}`);
    return 'gemini'; // Default fallback
  }

  // Check tier-based routing
  if (context.userTier) {
    const tierConfig = config.routingRules.tierRouting[context.userTier];
    if (tierConfig && tierConfig.preferredProviders.includes(agentConfig.primary)) {
      return agentConfig.primary;
    }
    // Use first available preferred provider
    return tierConfig.preferredProviders[0];
  }

  // Check complexity-based routing
  if (context.complexity) {
    const complexityConfig = config.routingRules.complexityRouting[context.complexity];
    if (complexityConfig && complexityConfig.providers.includes(agentConfig.primary)) {
      return agentConfig.primary;
    }
    return complexityConfig.providers[0];
  }

  // Default to agent's primary provider
  return agentConfig.primary;
}

// Helper function to estimate cost
function estimateCost(agent, provider, inputTokens, outputTokens) {
  const config = module.exports;
  const providerConfig = config.providers[provider];
  
  if (!providerConfig) return 0;
  
  const inputCost = (inputTokens / 1000) * providerConfig.cost.inputPer1K;
  const outputCost = (outputTokens / 1000) * providerConfig.cost.outputPer1K;
  
  return inputCost + outputCost;
}

module.exports.getProviderForAgent = getProviderForAgent;
module.exports.estimateCost = estimateCost;