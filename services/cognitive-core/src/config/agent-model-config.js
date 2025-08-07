/**
 * Agent Model Configuration
 * 
 * Manual configuration for which AI model each agent should use
 * in Normal vs Pro modes. This replaces automatic quality tracking
 * with explicit manual configuration.
 */

const { Logger } = require('@ux-flow/common');

const logger = new Logger('agent-model-config');

module.exports = {
  // Configuration version for tracking changes
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  
  // Quality modes available to users
  qualityModes: {
    normal: {
      name: 'Normal',
      description: 'Fast and cost-effective AI responses',
      costMultiplier: 1.0,
      priority: 'standard'
    },
    pro: {
      name: 'Pro',
      description: 'Premium quality AI responses with advanced models',
      costMultiplier: 3.0,
      priority: 'high',
      requiresSubscription: true
    }
  },

  // Agent to Model Mapping
  // Each agent has specific models for Normal and Pro modes
  agentModels: {
    // Manager Agent - Coordinates and delegates tasks
    manager: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 0.3,
        maxTokens: 1000,
        reasoning: 'Fast coordination with basic reasoning'
      },
      pro: {
        provider: 'claude',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.4,
        maxTokens: 2000,
        reasoning: 'Advanced coordination with nuanced understanding'
      }
    },

    // Classifier Agent - Categorizes and analyzes intent
    classifier: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 0.2,
        maxTokens: 500,
        reasoning: 'Quick classification, good enough for most cases'
      },
      pro: {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        temperature: 0.2,
        maxTokens: 1000,
        reasoning: 'More accurate classification with context understanding'
      }
    },

    // Analyst Agent - Deep analysis and insights
    analyst: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 0.4,
        maxTokens: 1500,
        reasoning: 'Basic analysis with decent insights'
      },
      pro: {
        provider: 'claude',
        model: 'claude-3-opus-20240229',
        temperature: 0.5,
        maxTokens: 3000,
        reasoning: 'Deep analysis with comprehensive insights'
      }
    },

    // UX Expert Agent - Design and user experience
    uxExpert: {
      normal: {
        provider: 'claude',
        model: 'claude-3-haiku-20240307',
        temperature: 0.6,
        maxTokens: 2000,
        reasoning: 'Good UX suggestions with standard patterns'
      },
      pro: {
        provider: 'claude',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
        maxTokens: 4000,
        reasoning: 'Creative and innovative UX solutions'
      }
    },

    // Architect Agent - System design and architecture
    architect: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        temperature: 0.3,
        maxTokens: 2500,
        reasoning: 'Solid architectural decisions'
      },
      pro: {
        provider: 'gpt4',
        model: 'gpt-4-turbo-preview',
        temperature: 0.4,
        maxTokens: 4000,
        reasoning: 'Advanced architecture with best practices'
      }
    },

    // Planner Agent - Strategic planning and workflows
    planner: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 0.3,
        maxTokens: 1500,
        reasoning: 'Clear step-by-step planning'
      },
      pro: {
        provider: 'claude',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.4,
        maxTokens: 2500,
        reasoning: 'Comprehensive planning with contingencies'
      }
    },

    // Validator Agent - Quality checks and validation
    validator: {
      normal: {
        provider: 'llama',
        model: 'codellama-13b',
        temperature: 0.1,
        maxTokens: 1000,
        reasoning: 'Fast validation with rule checking'
      },
      pro: {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        temperature: 0.2,
        maxTokens: 1500,
        reasoning: 'Thorough validation with detailed feedback'
      }
    },

    // Visual Interpreter Agent - Image and visual analysis
    visualInterpreter: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash-vision',
        temperature: 0.3,
        maxTokens: 1500,
        reasoning: 'Basic visual understanding'
      },
      pro: {
        provider: 'gemini',
        model: 'gemini-1.5-pro-vision',
        temperature: 0.4,
        maxTokens: 2500,
        reasoning: 'Advanced visual analysis with detailed insights'
      }
    },

    // Synthesizer Agent - Combining and summarizing information
    synthesizer: {
      normal: {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        temperature: 0.4,
        maxTokens: 2000,
        reasoning: 'Quick synthesis of information'
      },
      pro: {
        provider: 'claude',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.5,
        maxTokens: 3000,
        reasoning: 'Comprehensive synthesis with nuanced understanding'
      }
    }
  },

  // Provider-specific configurations
  providers: {
    gemini: {
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      headers: {
        'Content-Type': 'application/json'
      },
      models: {
        'gemini-1.5-flash': {
          contextWindow: 1048576,
          costPer1kInput: 0.00025,
          costPer1kOutput: 0.0005,
          rateLimit: 60
        },
        'gemini-1.5-pro': {
          contextWindow: 1048576,
          costPer1kInput: 0.00125,
          costPer1kOutput: 0.005,
          rateLimit: 30
        },
        'gemini-1.5-flash-vision': {
          contextWindow: 1048576,
          costPer1kInput: 0.00025,
          costPer1kOutput: 0.0005,
          rateLimit: 60,
          supportsImages: true
        },
        'gemini-1.5-pro-vision': {
          contextWindow: 1048576,
          costPer1kInput: 0.00125,
          costPer1kOutput: 0.005,
          rateLimit: 30,
          supportsImages: true
        }
      }
    },
    
    claude: {
      endpoint: 'https://api.anthropic.com/v1',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      models: {
        'claude-3-haiku-20240307': {
          contextWindow: 200000,
          costPer1kInput: 0.00025,
          costPer1kOutput: 0.00125,
          rateLimit: 50
        },
        'claude-3-sonnet-20240229': {
          contextWindow: 200000,
          costPer1kInput: 0.003,
          costPer1kOutput: 0.015,
          rateLimit: 40
        },
        'claude-3-opus-20240229': {
          contextWindow: 200000,
          costPer1kInput: 0.015,
          costPer1kOutput: 0.075,
          rateLimit: 30
        }
      }
    },
    
    gpt4: {
      endpoint: 'https://api.openai.com/v1',
      headers: {
        'Content-Type': 'application/json'
      },
      models: {
        'gpt-4-turbo-preview': {
          contextWindow: 128000,
          costPer1kInput: 0.01,
          costPer1kOutput: 0.03,
          rateLimit: 500
        },
        'gpt-4': {
          contextWindow: 8192,
          costPer1kInput: 0.03,
          costPer1kOutput: 0.06,
          rateLimit: 500
        }
      }
    },
    
    llama: {
      endpoint: process.env.LLAMA_ENDPOINT || 'http://localhost:11434',
      headers: {
        'Content-Type': 'application/json'
      },
      models: {
        'llama2-7b': {
          contextWindow: 4096,
          costPer1kInput: 0.0001,
          costPer1kOutput: 0.0001,
          rateLimit: 1000
        },
        'codellama-13b': {
          contextWindow: 16384,
          costPer1kInput: 0.0001,
          costPer1kOutput: 0.0001,
          rateLimit: 1000
        },
        'mistral-7b': {
          contextWindow: 8192,
          costPer1kInput: 0.0001,
          costPer1kOutput: 0.0001,
          rateLimit: 1000
        }
      }
    }
  },

  // Feature flags for different subscription tiers
  tierFeatures: {
    free: {
      qualityMode: 'normal',
      maxRequestsPerDay: 100,
      maxTokensPerRequest: 1000,
      allowedAgents: ['classifier', 'validator']
    },
    basic: {
      qualityMode: 'normal',
      maxRequestsPerDay: 1000,
      maxTokensPerRequest: 2000,
      allowedAgents: ['classifier', 'validator', 'planner', 'synthesizer']
    },
    pro: {
      qualityMode: 'pro',
      maxRequestsPerDay: 10000,
      maxTokensPerRequest: 4000,
      allowedAgents: 'all'
    },
    enterprise: {
      qualityMode: 'pro',
      maxRequestsPerDay: -1, // Unlimited
      maxTokensPerRequest: 8000,
      allowedAgents: 'all',
      customModels: true
    }
  },

  // Helper function to get model config for an agent
  getAgentModel(agentName, qualityMode = 'normal', userTier = 'basic') {
    // Check if user tier allows this quality mode
    const tierFeature = this.tierFeatures[userTier];
    if (!tierFeature) {
      throw new Error(`Invalid user tier: ${userTier}`);
    }

    // Downgrade to normal if pro not allowed
    if (qualityMode === 'pro' && tierFeature.qualityMode === 'normal') {
      qualityMode = 'normal';
    }

    // Check if agent is allowed for this tier
    if (tierFeature.allowedAgents !== 'all' && 
        !tierFeature.allowedAgents.includes(agentName)) {
      throw new Error(`Agent ${agentName} not available for ${userTier} tier`);
    }

    // Get agent config
    const agentConfig = this.agentModels[agentName];
    if (!agentConfig) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    const modelConfig = agentConfig[qualityMode];
    if (!modelConfig) {
      throw new Error(`No ${qualityMode} configuration for agent ${agentName}`);
    }

    // Get provider details
    const providerConfig = this.providers[modelConfig.provider];
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }

    const modelDetails = providerConfig.models[modelConfig.model];
    if (!modelDetails) {
      throw new Error(`Unknown model: ${modelConfig.model} for provider ${modelConfig.provider}`);
    }

    return {
      agent: agentName,
      qualityMode,
      ...modelConfig,
      endpoint: providerConfig.endpoint,
      headers: providerConfig.headers,
      modelDetails
    };
  },

  // Calculate cost for a request
  calculateCost(agent, qualityMode, inputTokens, outputTokens) {
    try {
      const config = this.getAgentModel(agent, qualityMode);
      const inputCost = (inputTokens / 1000) * config.modelDetails.costPer1kInput;
      const outputCost = (outputTokens / 1000) * config.modelDetails.costPer1kOutput;
      
      const totalCost = inputCost + outputCost;
      const qualityMultiplier = this.qualityModes[qualityMode].costMultiplier || 1;
      
      return {
        inputCost,
        outputCost,
        totalCost,
        adjustedCost: totalCost * qualityMultiplier,
        model: config.model,
        provider: config.provider
      };
    } catch (error) {
      logger.error('Error calculating agent cost', error);
      return null;
    }
  }
};

// Export helper functions
module.exports.getAgentModel = module.exports.getAgentModel.bind(module.exports);
module.exports.calculateCost = module.exports.calculateCost.bind(module.exports);