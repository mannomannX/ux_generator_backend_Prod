// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/server.js
// ==========================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { KnowledgeManager } from './services/knowledge-manager.js';
import { EventHandlers } from './events/event-handlers.js';
import { DataSanitizer } from './security/data-sanitizer.js';
import { VectorSecurity } from './security/vector-security.js';
import config from './config/index.js';

// Route imports
import healthRoutes from './routes/health.js';
import knowledgeRoutes from './routes/knowledge.js';
import documentsRoutes from './routes/documents.js';

class KnowledgeService {
  constructor() {
    this.app = express();
    this.logger = new Logger('knowledge-service');
    this.eventEmitter = new EventEmitter(this.logger, 'knowledge-service');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('knowledge-service', this.logger);

    // Service components
    this.knowledgeManager = null;
    this.eventHandlers = null;
    
    // Security components
    this.dataSanitizer = null;
    this.vectorSecurity = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize security components
      this.dataSanitizer = new DataSanitizer(this.logger);
      this.vectorSecurity = new VectorSecurity(this.logger);
      
      // Initialize knowledge manager with security
      this.knowledgeManager = new KnowledgeManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        {
          dataSanitizer: this.dataSanitizer,
          vectorSecurity: this.vectorSecurity
        }
      );
      await this.knowledgeManager.initialize();

      // Setup event handlers
      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.knowledgeManager
      );

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
    this.healthCheck.addDependency('chromadb', () => this.knowledgeManager.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));
    
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      maxAge: 86400
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);
    
    // Stricter rate limiting for vector operations
    const vectorLimiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 20, // limit each IP to 20 vector operations per minute
      message: 'Too many vector operations',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/v1/knowledge/search', vectorLimiter);
    this.app.use('/api/v1/knowledge/embed', vectorLimiter);

    // Body parsing with size limits
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });

    // Attach services and security to request
    this.app.use((req, res, next) => {
      req.knowledgeManager = this.knowledgeManager;
      req.dataSanitizer = this.dataSanitizer;
      req.vectorSecurity = this.vectorSecurity;
      
      // Sanitize all input data
      if (req.body) {
        req.body = this.dataSanitizer.sanitizeJSON(req.body);
      }
      if (req.query) {
        req.query = this.dataSanitizer.sanitizeQuery(req.query);
      }
      
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/knowledge', knowledgeRoutes);
    this.app.use('/api/v1/documents', documentsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine Knowledge Service',
        version: '1.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          knowledge: '/api/v1/knowledge',
          documents: '/api/v1/documents',
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
        ip: req.ip
      });

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(error.status || 500).json({
        error: isDevelopment ? error.message : 'Internal server error',
        correlationId: req.correlationId,
        ...(isDevelopment && { stack: error.stack })
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
    this.logger.info('Shutting down Knowledge Service...');
    
    try {
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