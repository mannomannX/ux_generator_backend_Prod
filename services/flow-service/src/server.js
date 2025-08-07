// ==========================================
// SERVICES/FLOW-SERVICE/src/server.js
// ==========================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { FlowManager } from './services/flow-manager.js';
import { EventHandlers } from './events/event-handlers.js';
import { ValidationService } from './services/validation-service.js';
import { VersioningService } from './services/versioning-service.js';
import config from './config/index.js';

// Route imports
import healthRoutes from './routes/health.js';
import flowRoutes from './routes/flows.js';
import versionRoutes from './routes/versions.js';

class FlowService {
  constructor() {
    this.app = express();
    this.logger = new Logger('flow-service');
    this.eventEmitter = new EventEmitter(this.logger, 'flow-service');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('flow-service', this.logger);

    // Service components
    this.flowManager = null;
    this.validationService = null;
    this.versioningService = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize service components
      this.validationService = new ValidationService(this.logger);
      this.versioningService = new VersioningService(this.logger, this.mongoClient);
      this.flowManager = new FlowManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        this.validationService,
        this.versioningService
      );

      // Setup event handlers
      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.flowManager
      );

      // Setup health checks
      this.setupHealthChecks();

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners
      this.setupEventListeners();

      // Initialize database indexes
      await this.flowManager.createDatabaseIndexes();

      this.logger.info('Flow Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Flow Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('flow-validation', () => this.validationService.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet());
    this.app.use(cors());

    // Body parsing
    this.app.use(express.json({ limit: '50mb' })); // Large flows
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });

    // Attach services to request
    this.app.use((req, res, next) => {
      req.flowManager = this.flowManager;
      req.validationService = this.validationService;
      req.versioningService = this.versioningService;
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/flows', flowRoutes);
    this.app.use('/api/v1/versions', versionRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine Flow Service',
        version: '1.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          flows: '/api/v1/flows',
          versions: '/api/v1/versions',
        },
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
      this.logger.info(`Flow Service listening on port ${port}`, {
        port,
        environment: process.env.NODE_ENV,
        endpoints: {
          http: `http://localhost:${port}`,
          health: `http://localhost:${port}/health`,
        },
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    this.logger.info('Shutting down Flow Service...');
    
    try {
      // Close database connections
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();

      this.logger.info('Flow Service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new FlowService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    console.error('Failed to start Flow Service:', error);
    process.exit(1);
  });