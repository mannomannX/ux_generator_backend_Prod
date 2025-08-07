import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { 
  Logger, 
  EventEmitter, 
  MongoClient, 
  RedisClient, 
  HealthCheck,
  RedisEventBus,
  ServiceRegistry,
  createServiceConfig,
  ServiceNames,
  InterServiceEvents
} from '@ux-flow/common';
import { AgentOrchestrator } from './orchestrator/agent-orchestrator.js';
import { EventHandlers } from './orchestrator/event-handlers.js';
import { ApiKeyManager } from './security/api-key-manager.js';
import { ConversationEncryption } from './security/conversation-encryption.js';
import { PromptSecurity } from './security/prompt-security.js';
import { PromptSecuritySystem } from './security/prompt-security-system.js';
import { LearningSystem } from './learning/learning-system.js';
import { AIProviderManager } from './ai/ai-provider-manager.js';
import config from './config/index.js';

class CognitiveCoreService {
  constructor() {
    this.app = express();
    this.logger = new Logger('cognitive-core');
    this.eventEmitter = new EventEmitter(this.logger, 'cognitive-core');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('cognitive-core', this.logger);
    
    // Inter-service communication
    this.eventBus = null;
    this.serviceRegistry = null;
    
    // Security components
    this.apiKeyManager = null;
    this.conversationEncryption = null;
    this.promptSecurity = null;
    this.promptSecuritySystem = null;
    
    // AI and learning components
    this.learningSystem = null;
    this.aiProviderManager = null;
    
    this.orchestrator = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();
      
      // Initialize Redis Event Bus
      this.eventBus = new RedisEventBus(
        this.redisClient,
        this.logger,
        ServiceNames.COGNITIVE_CORE
      );
      await this.eventBus.initialize();
      await this.eventBus.subscribeToServiceEvents();
      
      // Initialize Service Registry
      this.serviceRegistry = new ServiceRegistry(this.logger, this.redisClient);
      await this.serviceRegistry.initialize();

      // Initialize Security Components
      this.apiKeyManager = new ApiKeyManager(this.logger, this.redisClient);
      this.conversationEncryption = new ConversationEncryption(this.logger);
      this.promptSecurity = new PromptSecurity(this.logger);
      this.promptSecuritySystem = new PromptSecuritySystem(this.logger, this.mongoClient, this.redisClient);

      // Initialize Learning System
      this.learningSystem = new LearningSystem(this.logger, this.mongoClient, this.redisClient);

      // Initialize AI Provider Manager (need billing service reference)
      this.aiProviderManager = new AIProviderManager(this.logger, this.mongoClient, this.redisClient, null);

      // Verify encryption is working
      this.conversationEncryption.verifyEncryption();
      
      // Register this service
      await this.serviceRegistry.register(
        createServiceConfig(ServiceNames.COGNITIVE_CORE, {
          port: process.env.COGNITIVE_CORE_PORT || 3001,
          endpoints: [
            '/agents',
            '/agents/:agentName/invoke',
            '/health'
          ]
        })
      );

      // Initialize orchestrator and event handlers with security components
      this.orchestrator = new AgentOrchestrator(
        this.logger,
        this.eventEmitter,
        this.mongoClient,
        this.redisClient,
        {
          apiKeyManager: this.apiKeyManager,
          conversationEncryption: this.conversationEncryption,
          promptSecurity: this.promptSecurity,
          promptSecuritySystem: this.promptSecuritySystem,
          learningSystem: this.learningSystem,
          aiProviderManager: this.aiProviderManager
        }
      );

      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventBus,
        this.orchestrator,
        this.serviceRegistry
      );

      // Setup health checks
      this.setupHealthChecks();

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners
      this.setupEventListeners();

      this.logger.info('Cognitive Core Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Cognitive Core Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('google-gemini', () => this.orchestrator.checkGeminiHealth());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' })); // For image uploads
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use(this.logger.requestLogger());
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', this.healthCheck.middleware());

    // Agent status and info
    this.app.get('/agents', (req, res) => {
      res.json({
        agents: this.orchestrator.getAvailableAgents(),
        status: 'active',
      });
    });

    // Manual agent invocation (for testing)
    this.app.post('/agents/:agentName/invoke', async (req, res) => {
      try {
        const { agentName } = req.params;
        const { prompt, context = {} } = req.body;

        const result = await this.orchestrator.invokeAgent(agentName, prompt, context);
        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('Manual agent invocation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Learning system routes
    this.app.post('/learning/feedback', async (req, res) => {
      try {
        await this.learningSystem.recordUserFeedback(req.body);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to record feedback', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/learning/manual-moment', async (req, res) => {
      try {
        await this.learningSystem.recordManualLearningMoment(req.body);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to record manual learning moment', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/learning/insights/:agentType', async (req, res) => {
      try {
        const insights = await this.learningSystem.getLearningInsights(req.params.agentType);
        res.json(insights);
      } catch (error) {
        this.logger.error('Failed to get learning insights', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/learning/stats', async (req, res) => {
      try {
        const stats = await this.learningSystem.getLearningStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Failed to get learning stats', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/learning/opt-out', async (req, res) => {
      try {
        const { userId, reason } = req.body;
        await this.learningSystem.optOutUser(userId, reason);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to opt out user', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/learning/opt-in', async (req, res) => {
      try {
        const { userId } = req.body;
        await this.learningSystem.optInUser(userId);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to opt in user', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Security system routes
    this.app.get('/security/stats', async (req, res) => {
      try {
        const { timeframe = '24h' } = req.query;
        const stats = await this.promptSecuritySystem.getSecurityStats(timeframe);
        res.json(stats);
      } catch (error) {
        this.logger.error('Failed to get security stats', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/security/unreviewed', async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const events = await this.promptSecuritySystem.getUnreviewedEvents(parseInt(limit));
        res.json(events);
      } catch (error) {
        this.logger.error('Failed to get unreviewed security events', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/security/false-positive', async (req, res) => {
      try {
        const { promptHash, reviewedBy, reason } = req.body;
        await this.promptSecuritySystem.markAsFalsePositive(promptHash, reviewedBy, reason);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Failed to mark as false positive', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // AI provider management routes
    this.app.get('/providers/stats', async (req, res) => {
      try {
        const stats = await this.aiProviderManager.getProviderStats();
        res.json(stats);
      } catch (error) {
        this.logger.error('Failed to get provider stats', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/providers/available', (req, res) => {
      try {
        res.json({
          providers: this.aiProviderManager.getAvailableProviders(),
          totalModels: this.aiProviderManager.getTotalModelCount()
        });
      } catch (error) {
        this.logger.error('Failed to get available providers', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Error handling
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled request error', error);
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.id,
      });
    });
  }

  setupEventListeners() {
    this.eventHandlers.setupAllHandlers();
  }

  async start() {
    const port = config.port;
    
    this.app.listen(port, () => {
      this.logger.info(`Cognitive Core Service listening on port ${port}`, {
        port,
        environment: process.env.NODE_ENV,
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    this.logger.info('Shutting down Cognitive Core Service...');
    
    try {
      // Cleanup services
      if (this.eventBus) {
        await this.eventBus.disconnect();
      }
      
      if (this.serviceRegistry) {
        await this.serviceRegistry.cleanup();
      }
      
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();
      this.logger.info('Cognitive Core Service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new CognitiveCoreService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    // Use a basic logger instance since the service hasn't initialized yet
    const logger = new Logger('cognitive-core-startup');
    logger.error('Failed to start Cognitive Core Service', error);
    process.exit(1);
  });