// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/agent-orchestrator.js
// ==========================================

import { AIProviderManager } from '../providers/ai-provider-manager.js';
import { LearningSystemCoordinator } from '../learning/learning-system-coordinator.js';
import { AgentRateLimiter } from '../security/agent-rate-limiter.js';
import { AgentResourceLimiter } from '../security/agent-resource-limiter.js';
import { CircuitBreakerFactory } from '../utils/circuit-breaker.js';
import { EnvironmentValidator } from '../utils/env-validator.js';

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
    
    // Rate limiting and resource management
    this.rateLimiter = new AgentRateLimiter(this.redisClient, this.logger);
    this.resourceLimiter = new AgentResourceLimiter(this.logger);
    
    // Circuit breaker for fault tolerance
    this.circuitBreakerFactory = new CircuitBreakerFactory(this.logger, this.eventEmitter);
    
    // AI Provider Manager
    this.aiProviders = null;
    
    // Learning System Coordinator
    this.learningSystem = null;
    
    // Agent configurations
    this.agents = new Map();
    
    // Conversation history (encrypted) - with cleanup tracking
    this.conversationHistory = new Map();
    this.conversationCleanupJob = null;
    this.maxConversationAge = 24 * 60 * 60 * 1000; // 24 hours
    this.maxConversationsInMemory = 1000; // Limit memory usage
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulResponses: 0,
      failedResponses: 0,
      averageResponseTime: 0,
      blockedRequests: 0,
      memoryUsage: 0,
      activeConversations: 0
    };
  }

  async initialize() {
    try {
      // Validate environment variables first
      const envValidation = await EnvironmentValidator.validateAndInitialize(this.logger);
      if (!envValidation.results.valid) {
        throw new Error('Environment validation failed - cannot start service');
      }
      
      // Initialize AI Provider Manager
      const config = {
        gemini: {
          apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
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

      // Initialize Learning System Coordinator
      this.learningSystem = new LearningSystemCoordinator(
        this.logger, 
        this.mongoClient, 
        this, // Pass orchestrator as agentHub
        this.eventEmitter
      );
      await this.learningSystem.initialize();

      // Start conversation cleanup job
      this.startConversationCleanup();

      this.logger.info('Agent Orchestrator initialized successfully with learning system');
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
      },
      analyst: {
        name: 'System Analyst',
        description: 'Analyzes learning episodes and provides prompt improvement recommendations',
        systemPrompt: `You are a specialized system analyst for AI agent systems. Your role is to analyze completed learning episodes and develop precise improvement suggestions for agent prompts. Focus on systematic patterns in agent errors and develop concrete prompt improvements. Always respond with structured JSON containing problem analysis and specific recommendations.`
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

  /**
   * Get a specific agent for use by the learning system
   */
  async getAgent(agentName) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return null;
    }

    // Return an agent wrapper that provides the necessary interface for the learning system
    return {
      analyzeLearningEpisode: async (episode, context = {}) => {
        // Build analysis prompt for the episode
        const analysisPrompt = this.buildEpisodeAnalysisPrompt(episode);
        
        // Use the analyst agent to analyze the episode
        const result = await this.invokeAgent(agentName, analysisPrompt, {
          qualityMode: context.qualityMode || 'pro',
          systemPrompt: agent.systemPrompt
        });

        // Parse the response and return structured analysis
        try {
          const parsedResult = JSON.parse(result.text);
          return {
            sourceAgent: parsedResult.sourceAgent || episode.agentUsed,
            problemCategory: parsedResult.problemCategory,
            detectedProblem: parsedResult.detectedProblem,
            rootCause: parsedResult.rootCause,
            recommendation: parsedResult.recommendation,
            confidence: parsedResult.confidence || 0.8,
            priority: parsedResult.priority || 'medium',
            implementationHint: parsedResult.implementationHint,
            episodeId: episode.episodeId,
            analyzedAt: new Date(),
            evidence: {
              originalPlan: episode.originalPlan,
              userFeedback: episode.userFeedback,
              successfulPlan: episode.successfulPlan
            }
          };
        } catch (error) {
          // Fallback if JSON parsing fails
          return {
            sourceAgent: episode.agentUsed,
            problemCategory: 'general',
            detectedProblem: 'Analysis parsing failed',
            rootCause: 'JSON parsing error in analyst response',
            recommendation: result.text,
            confidence: 0.5,
            priority: 'low',
            implementationHint: 'Manual review required',
            episodeId: episode.episodeId,
            analyzedAt: new Date(),
            evidence: {
              originalPlan: episode.originalPlan,
              userFeedback: episode.userFeedback,
              successfulPlan: episode.successfulPlan
            }
          };
        }
      }
    };
  }

  /**
   * Build analysis prompt for learning episode
   */
  buildEpisodeAnalysisPrompt(episode) {
    return `# LERN-EPISODE ANALYSE

## EPISODE DATEN
**Episode ID**: ${episode.episodeId}
**Agent**: ${episode.agentUsed}
**Erstellt**: ${episode.createdAt}
**Status**: ${episode.status}

## ORIGINAL PLAN
\`\`\`
${episode.originalPlan || 'Nicht verfügbar'}
\`\`\`

## NUTZER FEEDBACK
\`\`\`
${episode.userFeedback}
\`\`\`

## ERFOLGREICHER PLAN
\`\`\`
${episode.successfulPlan || 'Noch nicht verfügbar'}
\`\`\`

## KLASSIFIZIERUNG
- **Intent**: ${episode.classification?.intent || 'Unbekannt'}
- **Sentiment**: ${episode.classification?.sentiment || 'Unbekannt'}
- **Aufgaben**: ${JSON.stringify(episode.classification?.tasks || [])}

## ZUSÄTZLICHER KONTEXT
- **Qualitätsmodus**: ${episode.qualityMode}
- **Prompt Version**: ${episode.promptVersion}
- **Projekt**: ${episode.projectId}
- **Workspace**: ${episode.workspaceId}

Analysiere diese Episode und erstelle eine strukturierte Empfehlung zur Prompt-Verbesserung.`;
  }

  async invokeAgent(agentName, prompt, context = {}) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    // Generate unique operation ID for tracking
    const operationId = this.generateOperationId(agentName);
    
    // Check rate limits before processing
    if (this.rateLimiter && context.userId) {
      const rateLimitResult = await this.rateLimiter.checkRateLimit(
        agentName,
        context.userId,
        context.ipAddress || 'unknown',
        context.userTier || 'free'
      );
      
      if (!rateLimitResult.allowed) {
        this.logger.warn('Agent invocation rate limited', {
          operationId,
          agentName,
          userId: context.userId,
          reason: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter
        });
        
        const error = new Error(`Rate limit exceeded: ${rateLimitResult.reason}`);
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.retryAfter = rateLimitResult.retryAfter;
        error.rateLimitDetails = rateLimitResult;
        throw error;
      }
      
      // Log successful rate limit check for monitoring
      this.logger.debug('Agent invocation rate limit passed', {
        operationId,
        agentName,
        userId: context.userId,
        usage: rateLimitResult.limits?.agent?.usage
      });
    }

    // Check resource limits before processing
    if (this.resourceLimiter) {
      const resourceContext = {
        ...context,
        prompt,
        maxTokens: context.maxTokens || 4000
      };
      
      const resourceResult = await this.resourceLimiter.checkResourceLimits(
        agentName,
        operationId,
        resourceContext
      );
      
      if (!resourceResult.allowed) {
        this.logger.warn('Agent invocation resource limited', {
          operationId,
          agentName,
          userId: context.userId,
          reason: resourceResult.reason,
          checks: resourceResult.checks
        });
        
        const error = new Error(`Resource limit exceeded: ${resourceResult.reason}`);
        error.code = 'RESOURCE_LIMIT_EXCEEDED';
        error.resourceDetails = resourceResult;
        throw error;
      }
      
      // Log successful resource limit check
      this.logger.debug('Agent invocation resource limit passed', {
        operationId,
        agentName,
        userId: context.userId,
        limits: resourceResult.limits
      });
    }

    // Sanitize prompt before processing (with context-aware options)
    if (this.promptSecurity) {
      const sanitizationOptions = {
        preserveHTML: true,
        preserveFormatting: true,
        trustedUser: context.trustedUser || false
      };
      prompt = this.promptSecurity.sanitizePrompt(prompt, sanitizationOptions);
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

      // Get circuit breaker for this agent
      const circuitBreaker = this.circuitBreakerFactory.getBreaker(`agent-${agentName}`, {
        failureThreshold: 3,
        recoveryTimeout: 30000,
        timeout: qualityMode === 'pro' ? 45000 : 30000,
        errorThresholdPercentage: 60
      });

      // Execute AI provider generation with circuit breaker protection
      const result = await circuitBreaker.execute(
        async () => {
          return await this.aiProviders.generate(fullPrompt, {
            agentName,
            qualityMode,
            systemPrompt: systemPrompt || agent.systemPrompt,
            temperature: 0.7,
            maxTokens: 2048
          });
        },
        // Fallback function
        async () => {
          this.logger.warn('Using fallback for agent invocation', { agentName });
          return {
            text: `I apologize, but the ${agentName} agent is temporarily unavailable. Please try again in a few minutes.`,
            model: 'fallback',
            provider: 'system',
            tokens: 0
          };
        }
      );
      
      // Release resources after successful completion
      if (this.resourceLimiter) {
        await this.resourceLimiter.releaseResources(operationId, {
          success: true,
          tokens: result.tokens || 0,
          responseLength: result.text?.length || 0
        });
      }
      
      this.logger.info('Agent invocation completed', { 
        operationId,
        agentName,
        success: true,
        model: result.model,
        provider: result.provider,
        tokens: result.tokens
      });

      return result;
    } catch (error) {
      // Release resources after error
      if (this.resourceLimiter) {
        await this.resourceLimiter.releaseResources(operationId, {
          success: false,
          error: error.message
        });
      }
      
      this.logger.error('Agent invocation failed', error, { 
        operationId,
        agentName 
      });
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
        
        // Sanitize the message with context-aware options
        const sanitizationOptions = {
          preserveHTML: true,
          preserveFormatting: true,
          trustedUser: false // Could be set based on user role/permissions
        };
        message = this.promptSecurity.sanitizePrompt(message, sanitizationOptions);
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

      // Check for learning opportunities with the learning system
      if (this.learningSystem) {
        try {
          // Simple heuristic for corrective feedback detection
          const correctionKeywords = ['wrong', 'incorrect', 'fix', 'change', 'error', 'mistake', 'not right', 'should be'];
          const hasCorrection = correctionKeywords.some(keyword => 
            message.toLowerCase().includes(keyword)
          );
          
          if (hasCorrection) {
            // Mock classification result for corrective feedback
            const classificationResult = {
              sentiment: 'corrective',
              intent: 'correction',
              tasks: ['improve_response'],
              questions: []
            };

            await this.learningSystem.processCorrectiveFeedback(
              classificationResult,
              response.plan, // original plan
              message, // user feedback
              {
                userId,
                projectId,
                agentUsed: response.agentsUsed[0] || 'planner',
                qualityMode,
                promptVersion: '1.0.0',
                workspaceId: projectId // assuming projectId is workspace
              }
            );
          }
        } catch (error) {
          this.logger.error('Failed to process learning opportunity', error);
          // Don't fail the main request due to learning system issues
        }
      }

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
      activeConversations: this.conversationHistory.size,
      rateLimiting: this.rateLimiter ? this.rateLimiter.getStatistics() : null,
      resourceLimiting: this.resourceLimiter ? this.resourceLimiter.getResourceStatistics() : null,
      circuitBreakers: this.circuitBreakerFactory ? this.circuitBreakerFactory.getAllMetrics() : null
    };
  }

  /**
   * Generate unique operation ID for tracking
   */
  generateOperationId(agentName) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    return `op_${agentName}_${timestamp}_${random}`;
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

  /**
   * Start conversation cleanup job to prevent memory leaks
   */
  startConversationCleanup() {
    this.conversationCleanupJob = setInterval(() => {
      this.cleanupConversations();
    }, 60 * 60 * 1000); // Run every hour
    
    this.logger.info('Conversation cleanup job started');
  }

  /**
   * Stop conversation cleanup job
   */
  stopConversationCleanup() {
    if (this.conversationCleanupJob) {
      clearInterval(this.conversationCleanupJob);
      this.conversationCleanupJob = null;
      this.logger.info('Conversation cleanup job stopped');
    }
  }

  /**
   * Clean up old conversations to prevent memory leaks
   */
  async cleanupConversations() {
    const now = Date.now();
    const conversationsToDelete = [];
    
    // Check memory-based conversations
    for (const [key, conversation] of this.conversationHistory.entries()) {
      const lastActivity = conversation.lastActivity || conversation.timestamp || 0;
      if (now - lastActivity > this.maxConversationAge) {
        conversationsToDelete.push(key);
      }
    }
    
    // Limit total conversations in memory
    if (this.conversationHistory.size > this.maxConversationsInMemory) {
      const sortedEntries = Array.from(this.conversationHistory.entries())
        .sort((a, b) => {
          const aTime = a[1].lastActivity || a[1].timestamp || 0;
          const bTime = b[1].lastActivity || b[1].timestamp || 0;
          return aTime - bTime; // Oldest first
        });
      
      const excess = sortedEntries.length - this.maxConversationsInMemory;
      for (let i = 0; i < excess; i++) {
        conversationsToDelete.push(sortedEntries[i][0]);
      }
    }
    
    // Remove conversations from memory
    for (const key of conversationsToDelete) {
      this.conversationHistory.delete(key);
    }
    
    // Clean up Redis conversations
    if (conversationsToDelete.length > 0) {
      try {
        const redisKeys = conversationsToDelete.map(key => `conversation:${key}`);
        if (redisKeys.length > 0) {
          await this.redisClient.del(...redisKeys);
        }
      } catch (error) {
        this.logger.error('Failed to cleanup Redis conversations', error);
      }
    }
    
    // Update metrics
    this.metrics.activeConversations = this.conversationHistory.size;
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
    
    if (conversationsToDelete.length > 0) {
      this.logger.info(`Cleaned up ${conversationsToDelete.length} old conversations`);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down Agent Orchestrator...');
    
    // Stop cleanup jobs
    this.stopConversationCleanup();
    
    // Shutdown resource limiter
    if (this.resourceLimiter) {
      this.resourceLimiter.shutdown();
    }
    
    // Close learning system
    if (this.learningSystem && this.learningSystem.shutdown) {
      await this.learningSystem.shutdown();
    }
    
    // Close AI providers
    if (this.aiProviders && this.aiProviders.shutdown) {
      await this.aiProviders.shutdown();
    }
    
    // Clear memory
    this.conversationHistory.clear();
    this.agents.clear();
    
    this.logger.info('Agent Orchestrator shutdown complete');
  }

  getSecurityMetrics() {
    return {
      blockedRequests: this.metrics.blockedRequests,
      encryptionEnabled: !!this.conversationEncryption,
      apiKeyValidationEnabled: !!this.apiKeyManager,
      promptSecurityEnabled: !!this.promptSecurity
    };
  }

  /**
   * Get circuit breaker health status
   */
  getCircuitBreakerHealth() {
    return this.circuitBreakerFactory ? this.circuitBreakerFactory.getOverallHealth() : {
      totalBreakers: 0,
      healthyBreakers: 0,
      unhealthyBreakers: 0,
      overallHealth: 100,
      breakers: []
    };
  }

  /**
   * Get performance and health metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeAgents: this.agents.size,
      learningSystemEnabled: this.learningSystem?.isEnabled() || false
    };
  }
}

export { AgentOrchestrator };