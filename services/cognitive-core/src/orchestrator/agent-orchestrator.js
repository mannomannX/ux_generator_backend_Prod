// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/agent-orchestrator.js
// ==========================================
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EventTypes } from '@ux-flow/common';

// Import all agents
import { ManagerAgent } from '../agents/manager.js';
import { PlannerAgent } from '../agents/planner.js';
import { ArchitectAgent } from '../agents/architect.js';
import { ValidatorAgent } from '../agents/validator.js';
import { ClassifierAgent } from '../agents/classifier.js';
import { SynthesizerAgent } from '../agents/synthesizer.js';
import { UxExpertAgent } from '../agents/ux-expert.js';
import { VisualInterpreterAgent } from '../agents/visual-interpreter.js';
import { AnalystAgent } from '../agents/analyst.js';

class AgentOrchestrator {
  constructor(logger, eventEmitter, mongoClient, redisClient) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;

    // Initialize Google Gemini
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.models = {
      standard: this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest",
        generationConfig: { responseMimeType: "application/json" }
      }),
      pro: this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-pro-latest" 
      }),
    };

    // Initialize all agents
    this.agents = this.initializeAgents();
    
    // State management for ongoing conversations
    this.conversationStates = new Map();
  }

  initializeAgents() {
    const sharedContext = {
      logger: this.logger,
      eventEmitter: this.eventEmitter,
      mongoClient: this.mongoClient,
      redisClient: this.redisClient,
      models: this.models,
    };

    return {
      manager: new ManagerAgent(sharedContext),
      planner: new PlannerAgent(sharedContext),
      architect: new ArchitectAgent(sharedContext),
      validator: new ValidatorAgent(sharedContext),
      classifier: new ClassifierAgent(sharedContext),
      synthesizer: new SynthesizerAgent(sharedContext),
      uxExpert: new UxExpertAgent(sharedContext),
      visualInterpreter: new VisualInterpreterAgent(sharedContext),
      analyst: new AnalystAgent(sharedContext),
    };
  }

  getAvailableAgents() {
    return Object.keys(this.agents);
  }

  async invokeAgent(agentName, prompt, context = {}) {
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    this.logger.logAgentAction(agentName, 'Agent invocation started', { context });

    try {
      const result = await agent.process(prompt, context);
      
      this.logger.logAgentAction(agentName, 'Agent invocation completed', { 
        success: true,
        resultType: typeof result 
      });

      return result;
    } catch (error) {
      this.logger.logAgentAction(agentName, 'Agent invocation failed', { 
        error: error.message 
      });
      throw error;
    }
  }

  // Main orchestration method for user conversations
  async processUserMessage(userId, projectId, message, qualityMode = 'standard') {
    const conversationId = `${userId}-${projectId}`;
    
    try {
      // Step 1: Classify the user message
      const classification = await this.invokeAgent('classifier', message, {
        qualityMode,
      });

      this.logger.info('Message classified', {
        userId,
        projectId,
        intent: classification.intent,
        sentiment: classification.sentiment,
        taskCount: classification.tasks?.length || 0,
        questionCount: classification.questions?.length || 0,
      });

      // Step 2: Get conversation context
      const context = await this.getConversationContext(userId, projectId);

      // Step 3: Route based on intent
      let response;
      switch (classification.intent) {
        case 'build_request':
          response = await this.handleBuildRequest(
            userId, 
            projectId, 
            classification, 
            context, 
            qualityMode
          );
          break;
          
        case 'question_about_flow':
          response = await this.handleFlowQuestion(
            userId, 
            projectId, 
            classification, 
            context, 
            qualityMode
          );
          break;
          
        case 'meta_question':
          response = await this.handleMetaQuestion(
            userId, 
            projectId, 
            classification, 
            context, 
            qualityMode
          );
          break;
          
        default:
          response = await this.handleGeneralConversation(
            userId, 
            projectId, 
            classification, 
            context, 
            qualityMode
          );
      }

      // Step 4: Store conversation state
      await this.updateConversationState(conversationId, {
        lastMessage: message,
        lastResponse: response,
        classification,
        timestamp: new Date(),
      });

      return response;

    } catch (error) {
      this.logger.error('User message processing failed', error, {
        userId,
        projectId,
        messageLength: message.length,
      });
      throw error;
    }
  }

  async handleBuildRequest(userId, projectId, classification, context, qualityMode) {
    // Get task from classification
    const primaryTask = classification.tasks[0];
    
    // Step 1: Manager determines the approach
    const managerResponse = await this.invokeAgent('manager', primaryTask, {
      context: context.fullContext,
      improvementSuggestion: context.improvementSuggestion,
      qualityMode,
    });

    if (managerResponse.type === 'clarification_question') {
      return {
        type: 'clarification_needed',
        message: managerResponse.question,
      };
    }

    // Step 2: Planner creates the plan
    const plan = await this.invokeAgent('planner', managerResponse.task, {
      currentFlow: context.currentFlow,
      ragContext: context.knowledgeContext,
      qualityMode,
    });

    // Step 3: Synthesize response
    const synthesis = await this.invokeAgent('synthesizer', null, {
      userMessage: primaryTask,
      plan,
      qualityMode,
    });

    return {
      type: 'plan_for_approval',
      message: synthesis.message,
      plan,
      metadata: {
        complexity: managerResponse.complexity,
        agentsInvolved: ['manager', 'planner', 'synthesizer'],
      },
    };
  }

  async handleFlowQuestion(userId, projectId, classification, context, qualityMode) {
    const question = classification.questions[0];
    
    const answer = await this.invokeAgent('uxExpert', question, {
      currentFlow: context.currentFlow,
      ragContext: context.knowledgeContext,
      qualityMode,
    });

    return {
      type: 'answer',
      message: answer.answer,
      metadata: {
        question,
        agentsInvolved: ['uxExpert'],
      },
    };
  }

  async handleMetaQuestion(userId, projectId, classification, context, qualityMode) {
    // Simple meta questions about the system
    const question = classification.questions[0];
    
    return {
      type: 'answer',
      message: `I'm an AI-powered UX Flow design assistant. I help you create, modify, and optimize user experience flows through natural conversation. You can ask me to create screens, add interactions, or explain UX principles. How can I help you with your flow design?`,
      metadata: {
        question,
        agentsInvolved: [],
      },
    };
  }

  async handleGeneralConversation(userId, projectId, classification, context, qualityMode) {
    return {
      type: 'answer',
      message: `I'm here to help you with UX flow design. You can ask me to create new elements, modify existing ones, or explain design principles. What would you like to work on?`,
      metadata: {
        agentsInvolved: [],
      },
    };
  }

  async getConversationContext(userId, projectId) {
    // This would integrate with the context engine (future implementation)
    return {
      fullContext: "New conversation context",
      improvementSuggestion: null,
      currentFlow: { nodes: [], edges: [] },
      knowledgeContext: "Basic UX principles available",
    };
  }

  async updateConversationState(conversationId, state) {
    this.conversationStates.set(conversationId, state);
    
    // Persist to Redis for cross-service access
    await this.redisClient.set(
      `conversation:${conversationId}`,
      state,
      3600 // 1 hour TTL
    );
  }

  async checkGeminiHealth() {
    try {
      // Simple test call to Gemini
      const result = await this.models.standard.generateContent('Test health check');
      return { status: 'ok', model: 'gemini-1.5-flash' };
    } catch (error) {
      this.logger.error('Gemini health check failed', error);
      return { status: 'error', error: error.message };
    }
  }
}

export { AgentOrchestrator };