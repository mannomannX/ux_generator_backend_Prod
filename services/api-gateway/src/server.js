// ==========================================
// SERVICES/API-GATEWAY/src/server.js
// ==========================================
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { WebSocketManager } from './websocket/connection-manager.js';
import { MessageHandler } from './websocket/message-handler.js';
import { RoomManager } from './websocket/room-manager.js';
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { corsConfig } from './middleware/cors.js';
import { rateLimitConfig } from './middleware/rate-limit.js';

// Route imports
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import adminRoutes from './routes/admin.js';

class ApiGatewayService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.logger = new Logger('api-gateway');
    this.eventEmitter = new EventEmitter(this.logger, 'api-gateway');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('api-gateway', this.logger);
    
    // WebSocket components
    this.roomManager = null;
    this.messageHandler = null;
    this.wsManager = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize WebSocket components
      this.roomManager = new RoomManager(this.logger, this.redisClient);
      this.messageHandler = new MessageHandler(
        this.logger,
        this.eventEmitter,
        this.mongoClient,
        this.redisClient,
        this.roomManager
      );
      this.wsManager = new WebSocketManager(
        this.server,
        this.logger,
        this.messageHandler,
        this.roomManager
      );

      // Setup health checks
      this.setupHealthChecks();

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners for inter-service communication
      this.setupEventListeners();

      this.logger.info('API Gateway Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize API Gateway Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('websocket', () => this.wsManager.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS
    this.app.use(cors(corsConfig));

    // Rate limiting
    this.app.use(rateLimit(rateLimitConfig));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' })); // For image uploads
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });
  }

  setupRoutes() {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // API versioning
    const v1Router = express.Router();

    // Public routes
    v1Router.use('/auth', authRoutes);

    // Protected routes
    v1Router.use('/projects', authMiddleware, projectRoutes);
    v1Router.use('/admin', authMiddleware, adminRoutes);

    // Mount versioned API
    this.app.use('/api/v1', v1Router);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine API Gateway',
        version: '2.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          websocket: 'ws://localhost:3000',
          api: '/api/v1',
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
    this.app.use(errorHandler(this.logger));
  }

  setupEventListeners() {
    // Listen for responses from other services
    this.eventEmitter.on('USER_RESPONSE_READY', (data) => {
      this.wsManager.sendToUser(data.userId, data.projectId, {
        type: 'assistant_response',
        message: data.response.message,
        plan: data.response.plan,
        responseType: data.response.type,
        correlationId: data.originalEventId,
      });
    });

    this.eventEmitter.on('FLOW_UPDATED', (data) => {
      this.wsManager.broadcastToProject(data.projectId, {
        type: 'flow_updated',
        flow: data.flow,
        updatedBy: data.userId,
      });
    });

    this.eventEmitter.on('SERVICE_ERROR', (data) => {
      this.logger.error('Service error received', null, data);
      // Could implement error notification to clients here
    });

    this.logger.info('Event listeners setup completed');
  }

  async start() {
    const port = process.env.API_GATEWAY_PORT || 3000;
    
    this.server.listen(port, '0.0.0.0', () => {
      this.logger.info(`API Gateway Service listening on port ${port}`, {
        port,
        environment: process.env.NODE_ENV,
        endpoints: {
          http: `http://localhost:${port}`,
          websocket: `ws://localhost:${port}`,
        },
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    this.logger.info('Shutting down API Gateway Service...');
    
    try {
      // Close WebSocket connections
      if (this.wsManager) {
        await this.wsManager.shutdown();
      }

      // Close database connections
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();

      // Close HTTP server
      this.server.close(() => {
        this.logger.info('API Gateway Service shut down successfully');
        process.exit(0);
      });
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new ApiGatewayService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    console.error('Failed to start API Gateway Service:', error);
    process.exit(1);
  });