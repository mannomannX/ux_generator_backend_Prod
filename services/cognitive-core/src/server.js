import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { AgentOrchestrator } from './orchestrator/agent-orchestrator.js';
import { EventHandlers } from './orchestrator/event-handlers.js';
import config from './config/index.js';

class CognitiveCoreService {
  constructor() {
    this.app = express();
    this.logger = new Logger('cognitive-core');
    this.eventEmitter = new EventEmitter(this.logger, 'cognitive-core');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('cognitive-core', this.logger);
    this.orchestrator = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize orchestrator and event handlers
      this.orchestrator = new AgentOrchestrator(
        this.logger,
        this.eventEmitter,
        this.mongoClient,
        this.redisClient
      );

      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.orchestrator
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
    console.error('Failed to start Cognitive Core Service:', error);
    process.exit(1);
  });