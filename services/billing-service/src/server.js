// ==========================================
// SERVICES/BILLING-SERVICE/src/server.js
// ==========================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck, IndexManager } from '@ux-flow/common';
import { StripeService } from './services/stripe-service.js';
import { BillingManager } from './services/billing-manager.js';
import { CreditManager } from './services/credit-manager.js';
import { SubscriptionManager } from './services/subscription-manager.js';
import { WebhookHandler } from './services/webhook-handler.js';
import { EventHandlers } from './events/event-handlers.js';
import config from './config/index.js';

// Route imports
import healthRoutes from './routes/health.js';
import billingRoutes from './routes/billing.js';
import subscriptionRoutes from './routes/subscriptions.js';
import creditsRoutes from './routes/credits.js';
import webhookRoutes from './routes/webhooks.js';
import paymentMethodsRoutes from './routes/payment-methods.js';

class BillingService {
  constructor() {
    this.app = express();
    this.logger = new Logger('billing-service');
    this.eventEmitter = new EventEmitter(this.logger, 'billing-service');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('billing-service', this.logger);

    // Service components
    this.stripeService = null;
    this.billingManager = null;
    this.creditManager = null;
    this.subscriptionManager = null;
    this.webhookHandler = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize Stripe service
      this.stripeService = new StripeService(this.logger, config.stripe);
      
      // Initialize service components
      this.billingManager = new BillingManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        this.stripeService
      );

      this.creditManager = new CreditManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        this.eventEmitter
      );

      this.subscriptionManager = new SubscriptionManager(
        this.logger,
        this.mongoClient,
        this.stripeService,
        this.creditManager
      );

      this.webhookHandler = new WebhookHandler(
        this.logger,
        this.stripeService,
        this.billingManager,
        this.subscriptionManager,
        this.creditManager
      );

      // Setup event handlers
      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.billingManager,
        this.creditManager,
        this.subscriptionManager
      );

      // Setup health checks
      this.setupHealthChecks();

      // Setup Express middleware
      this.setupMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup event listeners
      this.setupEventListeners();

      // Initialize database collections
      await this.initializeDatabase();

      this.logger.info('Billing Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Billing Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('stripe', () => this.stripeService.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "js.stripe.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "api.stripe.com"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'Stripe-Signature'],
    }));

    // Rate limiting (except for webhooks)
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      skip: (req) => req.path.startsWith('/webhooks'), // Skip rate limiting for webhooks
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
      },
    });
    this.app.use(limiter);

    // Body parsing (raw body for Stripe webhooks)
    this.app.use('/webhooks', express.raw({ type: 'application/json' }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `billing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });

    // Attach services to request
    this.app.use((req, res, next) => {
      req.stripeService = this.stripeService;
      req.billingManager = this.billingManager;
      req.creditManager = this.creditManager;
      req.subscriptionManager = this.subscriptionManager;
      req.webhookHandler = this.webhookHandler;
      req.logger = this.logger;
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.use('/health', healthRoutes);

    // Webhook routes (must be before authentication)
    this.app.use('/webhooks', webhookRoutes);

    // API routes
    this.app.use('/api/v1/billing', billingRoutes);
    this.app.use('/api/v1/subscriptions', subscriptionRoutes);
    this.app.use('/api/v1/credits', creditsRoutes);
    this.app.use('/api/v1/payment-methods', paymentMethodsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine Billing Service',
        version: '1.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          billing: '/api/v1/billing',
          subscriptions: '/api/v1/subscriptions',
          credits: '/api/v1/credits',
          paymentMethods: '/api/v1/payment-methods',
          webhooks: '/webhooks/stripe',
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
        method: req.method,
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

  async initializeDatabase() {
    try {
      // Initialize comprehensive database indexes using IndexManager
      const indexManager = new IndexManager(this.mongoClient, this.logger);
      
      // Create service-specific indexes
      await indexManager.createServiceIndexes('billing-service');
      
      // Also create common indexes that this service might use
      await indexManager.createServiceIndexes('common');
      
      this.logger.info('Billing Service database indexes initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database indexes', error);
      throw error;
    }
  }

  async start() {
    const port = config.port;
    
    this.app.listen(port, '0.0.0.0', () => {
      this.logger.info(`Billing Service listening on port ${port}`, {
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
    this.logger.info('Shutting down Billing Service...');
    
    try {
      // Close database connections
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();

      this.logger.info('Billing Service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new BillingService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    console.error('Failed to start Billing Service:', error);
    process.exit(1);
  });