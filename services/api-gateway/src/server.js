// ==========================================
// SERVICES/API-GATEWAY/src/server.js
// ==========================================
import express from 'express';
import { createServer } from 'http';
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
  ServiceChannels,
  InterServiceEvents,
  ServiceRegistry,
  createServiceConfig,
  ServiceNames
} from '@ux-flow/common';
import { WebSocketManager } from './websocket/connection-manager.js';
import { MessageHandler } from './websocket/message-handler.js';
import { RoomManager } from './websocket/room-manager.js';
import { authMiddleware, optionalAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { corsConfig } from './middleware/cors.js';
import { rateLimitConfig } from './middleware/rate-limit.js';
import { ServiceAuthenticator, ServiceClient } from './middleware/service-auth.js';
import { ErrorRecoverySystem } from './middleware/error-recovery.js';

// Route imports
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import adminRoutes from './routes/admin.js';

// Security imports
import { SecurityLogger } from './middleware/security-logging.js';

class ApiGatewayService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.logger = new Logger('api-gateway');
    this.eventEmitter = new EventEmitter(this.logger, 'api-gateway');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('api-gateway', this.logger);
    
    // Inter-service communication
    this.eventBus = null;
    this.serviceRegistry = null;
    this.serviceAuthenticator = null;
    this.serviceClient = null;
    this.errorRecovery = null;
    
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
      
      // Initialize Redis Event Bus for inter-service communication
      this.eventBus = new RedisEventBus(
        this.redisClient,
        this.logger,
        ServiceNames.API_GATEWAY
      );
      await this.eventBus.initialize();
      await this.eventBus.subscribeToServiceEvents();
      
      // Initialize Service Registry
      this.serviceRegistry = new ServiceRegistry(this.logger, this.redisClient);
      await this.serviceRegistry.initialize();

      // Initialize Error Recovery System (must be early)
      this.errorRecovery = new ErrorRecoverySystem(this.logger, this.redisClient);

      // Initialize Service Authentication
      this.serviceAuthenticator = new ServiceAuthenticator(this.logger, this.redisClient);
      this.serviceClient = new ServiceClient('api-gateway', this.serviceAuthenticator, this.logger);
      
      // Register this service
      await this.serviceRegistry.register(
        createServiceConfig(ServiceNames.API_GATEWAY, {
          port: process.env.API_GATEWAY_PORT || 3000,
          endpoints: [
            '/api/v1/auth',
            '/api/v1/projects',
            '/api/v1/admin',
            '/health'
          ]
        })
      );

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
    // Initialize security logger
    this.securityLogger = new SecurityLogger(this.logger, this.redisClient, this.mongoClient);
    
    // SECURITY FIX: Enhanced security headers configuration
    this.app.use(helmet({
      // Content Security Policy - removing unsafe-inline
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'strict-dynamic'"], // Removed 'unsafe-inline', added 'strict-dynamic' for modern browsers
          styleSrc: ["'self'", "'sha256-{hash-will-be-generated}'"], // Removed 'unsafe-inline', use hash-based CSP for specific styles
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"], // Prevent object/embed attacks
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"], // Prevent clickjacking
          baseUri: ["'self'"], // Prevent base tag attacks
          formAction: ["'self'"], // Prevent form hijacking
        },
        reportUri: '/csp-report',
      },
      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      // Prevent MIME type sniffing
      noSniff: true,
      // X-Frame-Options
      frameguard: { action: 'deny' },
      // X-XSS-Protection
      xssFilter: true,
      // Referrer Policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Permissions Policy (Feature Policy replacement)
      permissionsPolicy: {
        features: {
          geolocation: ["'none'"],
          microphone: ["'none'"],
          camera: ["'none'"],
          payment: ["'none'"],
          usb: ["'none'"],
          vr: ["'none'"],
          accelerometer: ["'none'"],
          gyroscope: ["'none'"],
          magnetometer: ["'none'"],
          clipboard: ["'self'"]
        }
      }
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
    
    // Security logging middleware - MUST be after correlation ID
    this.app.use(this.securityLogger.createMiddleware());

    // Make service components available to routes
    this.app.use((req, res, next) => {
      req.app.locals.mongoClient = this.mongoClient;
      req.app.locals.redisClient = this.redisClient;
      req.app.locals.logger = this.logger;
      req.app.locals.serviceClient = this.serviceClient;
      req.app.locals.eventBus = this.eventBus;
      req.app.locals.errorRecovery = this.errorRecovery;
      next();
    });
  }

  setupRoutes() {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // SECURITY FIX: CSP Report endpoint for monitoring violations
    this.app.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
      const report = req.body;
      if (report && report['csp-report']) {
        this.securityLogger.logSecurityEvent('CSP_VIOLATION', {
          violatedDirective: report['csp-report']['violated-directive'],
          blockedUri: report['csp-report']['blocked-uri'],
          documentUri: report['csp-report']['document-uri'],
          sourceFile: report['csp-report']['source-file'],
          lineNumber: report['csp-report']['line-number'],
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }
      res.status(204).end();
    });

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
    // Listen for responses from other services via Redis Event Bus
    this.eventBus.on(InterServiceEvents.RESPONSE_AI_PROCESSING, (data) => {
      this.wsManager.sendToUser(data.userId, data.projectId, {
        type: 'assistant_response',
        message: data.response.message,
        plan: data.response.plan,
        responseType: data.response.type,
        correlationId: data.originalEventId,
      });
    });

    this.eventBus.on(InterServiceEvents.NOTIFY_FLOW_UPDATED, (data) => {
      this.wsManager.broadcastToProject(data.projectId, {
        type: 'flow_updated',
        flow: data.flow,
        updatedBy: data.userId,
      });
    });

    this.eventBus.on('SERVICE_ERROR', (data) => {
      this.logger.error('Service error received', null, data);
      // Notify clients of service errors
      if (data.userId && data.projectId) {
        this.wsManager.sendToUser(data.userId, data.projectId, {
          type: 'service_error',
          error: data.error,
          service: data.service
        });
      }
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

      // Cleanup services
      if (this.eventBus) {
        await this.eventBus.disconnect();
      }
      
      if (this.serviceRegistry) {
        await this.serviceRegistry.cleanup();
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
    // Use a basic logger instance since the service hasn't initialized yet
    const logger = new Logger('api-gateway-startup');
    logger.error('Failed to start API Gateway Service', error);
    process.exit(1);
  });