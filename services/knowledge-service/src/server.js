// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/server.js
// ==========================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { KnowledgeManager } from './services/knowledge-manager.js';
import { MemoryManager } from './services/memory-manager.js';
import { VectorStore } from './services/vector-store.js';
import { EventHandlers } from './events/event-handlers.js';
import config from './config/index.js';

// Route imports
import healthRoutes from './routes/health.js';
import knowledgeRoutes from './routes/knowledge.js';
import memoryRoutes from './routes/memory.js';

class KnowledgeService {
  constructor() {
    this.app = express();
    this.logger = new Logger('knowledge-service');
    this.eventEmitter = new EventEmitter(this.logger, 'knowledge-service');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('knowledge-service', this.logger);

    // Service components
    this.vectorStore = null;
    this.knowledgeManager = null;
    this.memoryManager = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize vector store (ChromaDB)
      this.vectorStore = new VectorStore(this.logger, config.chroma);
      await this.vectorStore.initialize();

      // Initialize service components
      this.memoryManager = new MemoryManager(
        this.logger,
        this.mongoClient,
        this.redisClient
      );

      this.knowledgeManager = new KnowledgeManager(
        this.logger,
        this.vectorStore,
        this.mongoClient,
        this.memoryManager
      );

      // Setup event handlers
      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.knowledgeManager,
        this.memoryManager
      );

      // Initialize UX knowledge base
      await this.knowledgeManager.initializeUXKnowledgeBase();

      // Setup health checks
      this.setupHealthChecks();

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners
      this.setupEventListeners();

      this.logger.info('Knowledge Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Knowledge Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('chromadb', () => this.vectorStore.healthCheck());
    this.healthCheck.addDependency('memory-manager', () => this.memoryManager.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });

    // Attach services to request
    this.app.use((req, res, next) => {
      req.knowledgeManager = this.knowledgeManager;
      req.memoryManager = this.memoryManager;
      req.vectorStore = this.vectorStore;
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
    this.app.use('/api/v1/memory', memoryRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine Knowledge Service',
        version: '1.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          knowledge: '/api/v1/knowledge',
          memory: '/api/v1/memory',
        },
        features: [
          'UX Knowledge Base',
          'Vector Search (ChromaDB)',
          'Hierarchical Memory Management',
          'Agent Decision Tracking',
          'Context Summarization',
        ],
        timestamp: new Date().toISOString(),
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        correlationId: req.correlationId,
      });
    });

    // Error handling
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled request error', error, {
        correlationId: req.correlationId,
        path: req.originalUrl,
      });

      res.status(500).json({
        error: 'Internal server error',
        correlationId: req.correlationId,
      });
    });
  }

  setupEventListeners() {
    this.eventHandlers.setupAllHandlers();
  }

  async start() {
    const port = config.port;
    
    this.app.listen(port, '0.0.0.0', () => {
      this.logger.info(`Knowledge Service listening on port ${port}`, {
        port,
        environment: process.env.NODE_ENV,
        features: {
          vectorStore: this.vectorStore.isInitialized(),
          memoryLevels: this.memoryManager.getMemoryLevels(),
          knowledgeCollections: this.knowledgeManager.getCollectionCount(),
        },
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    this.logger.info('Shutting down Knowledge Service...');
    
    try {
      // Close vector store
      if (this.vectorStore) {
        await this.vectorStore.shutdown();
      }

      // Close database connections
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();

      this.logger.info('Knowledge Service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new KnowledgeService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    console.error('Failed to start Knowledge Service:', error);
    process.exit(1);
  });