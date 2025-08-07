// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/agent-orchestrator.js
// ==========================================

import { AIProviderManager } from '../providers/ai-provider-manager.js';

export class AgentOrchestrator {
  constructor(logger, eventEmitter, mongoClient, redisClient, security = {}) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // Security components
    this.apiKeyManager = security.apiKeyManager;
    this.conversationEncryption = security.conversationEncryption;
    this.promptSecurity = security.promptSecurity;
    
    // AI Provider Manager
    this.aiProviders = null;
    
    // Agent configurations
    this.agents = new Map();
    
    // Conversation history (encrypted)
    this.conversationHistory = new Map();
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulResponses: 0,
      failedResponses: 0,
      averageResponseTime: 0,
      blockedRequests: 0
    };
  }

  async initialize() {
    try {
      // Initialize AI Provider Manager
      const config = {
        gemini: {
          apiKey: process.env.GEMINI_API_KEY
        },
        openai: {
          apiKey: process.env.OPENAI_API_KEY
        },
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY
        }
      };

      this.aiProviders = new AIProviderManager(config, this.logger, this.redisClient);
      await this.aiProviders.initialize();

      // Initialize agent configurations
      await this.initializeAgents();

      this.logger.info('Agent Orchestrator initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Agent Orchestrator', error);
      throw error;
    }
  }
  
  async initializeAgents() {
    // Define agent configurations with their specific prompts and capabilities
    const agentConfigs = {
      planner: {
        name: 'UX Planner',
        description: 'Plans UX solutions and creates step-by-step implementation guides',
        systemPrompt: `You are an expert UX planner. Your role is to analyze user requirements and create detailed, actionable plans for UX/UI implementations. Always structure your response with: 1. Analysis of the requirement, 2. Recommended approach, 3. Step-by-step implementation plan, 4. Key considerations and potential challenges, 5. Success metrics. Be practical and specific in your recommendations.`
      },
      architect: {
        name: 'UX Architect',
        description: 'Converts plans into specific UI/UX implementations and flow structures',
        systemPrompt: `You are an expert UX architect. Convert high-level plans into concrete implementations, including flow structures, component specifications, and interaction patterns. Provide detailed specifications that can be directly implemented.`
      },
      validator: {
        name: 'UX Validator',
        description: 'Validates UX implementations against best practices and accessibility standards',
        systemPrompt: `You are an expert UX validator and accessibility specialist. Review UX implementations and ensure they meet best practices, accessibility standards, and usability principles.`
      }
    };

    // Store agent configurations
    for (const [key, config] of Object.entries(agentConfigs)) {
      this.agents.set(key, config);
    }
  }

  getAvailableAgents() {
    return Array.from(this.agents.entries()).map(([key, config]) => ({
      name: key,
      displayName: config.name,
      description: config.description
    }));
  }

  async invokeAgent(agentName, prompt, context = {}) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    // Sanitize prompt before processing
    if (this.promptSecurity) {
      prompt = this.promptSecurity.sanitizePrompt(prompt);
    }

    const {
      qualityMode = 'normal',
      conversation = [],
      systemPrompt = null
    } = context;

    this.logger.info('Agent invocation started', { agentName, context });

    try {
      // Build context prompt if conversation history exists
      let fullPrompt = prompt;
      if (conversation && conversation.length > 0) {
        const contextMessages = conversation.slice(-5) // Last 5 messages
          .map(msg => `${msg.role}: ${msg.content}`)
          .join('\n');
        
        fullPrompt = `Previous conversation:\n${contextMessages}\n\nCurrent request: ${prompt}`;
      }

      // Use AI provider to generate response
      const result = await this.aiProviders.generate(fullPrompt, {
        agentName,
        qualityMode,
        systemPrompt: systemPrompt || agent.systemPrompt,
        temperature: 0.7,
        maxTokens: 2048
      });
      
      this.logger.info('Agent invocation completed', { 
        agentName,
        success: true,
        model: result.model,
        provider: result.provider
      });

      return result;
    } catch (error) {
      this.logger.error('Agent invocation failed', error, { agentName });
      throw error;
    }
  }

  async processUserMessage(userId, projectId, message, qualityMode = 'normal', apiKey = null) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Validate API key if provided
      if (apiKey && this.apiKeyManager) {
        const keyValidation = await this.apiKeyManager.validateKey(apiKey);
        if (!keyValidation.valid) {
          this.metrics.blockedRequests++;
          throw new Error('Invalid or expired API key');
        }
      }

      // Check prompt security
      if (this.promptSecurity) {
        const securityCheck = this.promptSecurity.validatePrompt(message);
        if (!securityCheck.safe) {
          this.metrics.blockedRequests++;
          this.logger.warn('Potentially malicious prompt blocked', {
            userId,
            projectId,
            threats: securityCheck.threats
          });
          throw new Error('Request blocked due to security concerns');
        }
        
        // Sanitize the message
        message = this.promptSecurity.sanitizePrompt(message);
      }

      // Get or create conversation history
      const conversationKey = `${userId}:${projectId}`;
      let conversation = await this.getEncryptedConversation(conversationKey);

      // Add user message to history
      conversation.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        encrypted: false
      });

      // Analyze the message to determine appropriate agent(s)
      const agentPlan = await this.analyzeAndPlan(message, conversation, qualityMode);

      // Execute the plan
      const response = await this.executePlan(agentPlan, qualityMode);

      // Add assistant response to history
      conversation.push({
        role: 'assistant',
        content: response.message,
        plan: response.plan,
        agentsUsed: response.agentsUsed,
        timestamp: new Date().toISOString()
      });

      // Store updated conversation (keep last 20 messages)
      if (conversation.length > 20) {
        conversation = conversation.slice(-20);
      }
      await this.storeEncryptedConversation(conversationKey, conversation);

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.metrics.successfulResponses++;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.successfulResponses - 1) + responseTime) / 
        this.metrics.successfulResponses;

      // Log conversation to MongoDB for learning
      await this.logConversation(userId, projectId, message, response, responseTime);

      this.logger.info('User message processed successfully', {
        userId,
        projectId,
        agentsUsed: response.agentsUsed,
        responseTime
      });

      return response;

    } catch (error) {
      this.metrics.failedResponses++;
      this.logger.error('Failed to process user message', error);
      
      return {
        message: "I apologize, but I encountered an error processing your request. Please try again or rephrase your question.",
        type: 'error',
        plan: null,
        agentsUsed: [],
        error: error.message
      };
    }
  }

  async analyzeAndPlan(message, conversation, qualityMode) {
    // Use the planner agent to analyze the message and create a plan
    const plannerResponse = await this.invokeAgent('planner', message, {
      conversation,
      qualityMode,
      systemPrompt: `Analyze this UX request and create an execution plan. Format as JSON:
{
  "analysis": "Your analysis",
  "agents": ["agent1", "agent2"],
  "tasks": {
    "agent1": "specific task",
    "agent2": "specific task"
  },
  "expectedOutcome": "description of expected result"
}`
    });

    try {
      // Try to parse as JSON, fallback to text analysis
      const plan = JSON.parse(plannerResponse.text);
      return plan;
    } catch (error) {
      // Fallback to simple plan if JSON parsing fails
      return {
        analysis: plannerResponse.text,
        agents: ['planner'],
        tasks: {
          'planner': 'Provide UX guidance and recommendations'
        },
        expectedOutcome: 'UX recommendations and guidance'
      };
    }
  }

  async executePlan(plan, qualityMode) {
    const agentResults = [];
    let finalMessage = '';

    // Execute tasks with each agent in sequence
    for (const agentName of plan.agents || ['planner']) {
      if (!this.agents.has(agentName)) {
        this.logger.warn(`Unknown agent requested: ${agentName}`);
        continue;
      }

      const task = plan.tasks[agentName] || plan.analysis;
      
      try {
        const result = await this.invokeAgent(agentName, task, {
          qualityMode,
          context: agentResults.length > 0 ? agentResults : null
        });

        agentResults.push({
          agent: agentName,
          task,
          result: result.text,
          model: result.model,
          provider: result.provider
        });

      } catch (error) {
        this.logger.error(`Agent ${agentName} failed`, error);
        agentResults.push({
          agent: agentName,
          task,
          result: `Agent ${agentName} encountered an error: ${error.message}`,
          error: true
        });
      }
    }

    // Combine results into final response
    if (agentResults.length === 1) {
      finalMessage = agentResults[0].result;
    } else {
      // Multiple agents - create structured response
      finalMessage = this.combineAgentResults(agentResults);
    }

    return {
      message: finalMessage,
      type: 'ux_guidance',
      plan: plan,
      agentsUsed: agentResults.map(r => r.agent),
      agentResults: agentResults
    };
  }

  combineAgentResults(results) {
    let combined = '';

    for (const result of results) {
      const agentConfig = this.agents.get(result.agent);
      combined += `## ${agentConfig?.name || result.agent}\n\n`;
      combined += `${result.result}\n\n`;
    }

    return combined;
  }

  async processImageMessage(userId, projectId, imageData, mimeType = 'image/jpeg') {
    try {
      const prompt = `Analyze this UI/UX image and provide detailed feedback. Consider visual design elements, user experience aspects, potential improvements, best practices compliance, and mobile/responsive design considerations.`;

      const response = await this.aiProviders.generateWithImage(
        prompt, 
        imageData, 
        {
          agentName: 'validator',
          qualityMode: 'pro'
        }
      );

      return {
        message: response.text,
        type: 'image_analysis',
        model: response.model,
        provider: response.provider
      };

    } catch (error) {
      this.logger.error('Failed to process image', error);
      throw error;
    }
  }

  async logConversation(userId, projectId, message, response, responseTime) {
    try {
      const db = this.mongoClient.getDb();
      await db.collection('conversations').insertOne({
        userId,
        projectId,
        message,
        response: response.message,
        plan: response.plan,
        agentsUsed: response.agentsUsed,
        responseTime,
        timestamp: new Date(),
        metadata: {
          qualityMode: response.qualityMode,
          models: response.agentResults?.map(r => ({
            agent: r.agent,
            model: r.model,
            provider: r.provider
          }))
        }
      });
    } catch (error) {
      this.logger.error('Failed to log conversation', error);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      availableAgents: this.agents.size,
      activeConversations: this.conversationHistory.size
    };
  }

  async checkGeminiHealth() {
    try {
      return await this.aiProviders.checkHealth();
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  async getEncryptedConversation(conversationKey) {
    if (!this.conversationEncryption) {
      return this.conversationHistory.get(conversationKey) || [];
    }

    const encryptedData = this.conversationHistory.get(conversationKey);
    if (!encryptedData) {
      return [];
    }

    try {
      const decrypted = this.conversationEncryption.decryptConversation(encryptedData);
      return decrypted;
    } catch (error) {
      this.logger.error('Failed to decrypt conversation', error);
      return [];
    }
  }

  async storeEncryptedConversation(conversationKey, conversation) {
    if (!this.conversationEncryption) {
      this.conversationHistory.set(conversationKey, conversation);
      return;
    }

    try {
      const encrypted = this.conversationEncryption.encryptConversation(conversation);
      this.conversationHistory.set(conversationKey, encrypted);
      
      // Also store in Redis for persistence
      await this.redisClient.setAsync(
        `conversation:${conversationKey}`,
        JSON.stringify(encrypted),
        'EX',
        86400 // 24 hour expiry
      );
    } catch (error) {
      this.logger.error('Failed to encrypt conversation', error);
      // Store unencrypted as fallback
      this.conversationHistory.set(conversationKey, conversation);
    }
  }

  getSecurityMetrics() {
    return {
      blockedRequests: this.metrics.blockedRequests,
      encryptionEnabled: !!this.conversationEncryption,
      apiKeyValidationEnabled: !!this.apiKeyManager,
      promptSecurityEnabled: !!this.promptSecurity
    };
  }
}

export { AgentOrchestrator };