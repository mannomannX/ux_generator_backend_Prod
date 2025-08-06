// ==========================================
// SERVICES/USER-MANAGEMENT/src/server.js
// ==========================================
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { Logger, EventEmitter, MongoClient, RedisClient, HealthCheck } from '@ux-flow/common';
import { UserManager } from './services/user-manager.js';
import { WorkspaceManager } from './services/workspace-manager.js';
import { EventHandlers } from './events/event-handlers.js';
import { EmailService } from './services/email-service.js';
import config from './config/index.js';

// Route imports
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import workspacesRoutes from './routes/workspaces.js';
import adminRoutes from './routes/admin.js';

class UserManagementService {
  constructor() {
    this.app = express();
    this.logger = new Logger('user-management');
    this.eventEmitter = new EventEmitter(this.logger, 'user-management');
    this.mongoClient = new MongoClient(this.logger);
    this.redisClient = new RedisClient(this.logger);
    this.healthCheck = new HealthCheck('user-management', this.logger);

    // Service components
    this.userManager = null;
    this.workspaceManager = null;
    this.emailService = null;
    this.eventHandlers = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await this.mongoClient.connect();
      await this.redisClient.connect();

      // Initialize service components
      this.emailService = new EmailService(this.logger);
      this.userManager = new UserManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        this.emailService
      );
      this.workspaceManager = new WorkspaceManager(
        this.logger,
        this.mongoClient,
        this.redisClient,
        this.userManager
      );

      // Setup event handlers
      this.eventHandlers = new EventHandlers(
        this.logger,
        this.eventEmitter,
        this.userManager,
        this.workspaceManager
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

      this.logger.info('User Management Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize User Management Service', error);
      throw error;
    }
  }

  setupHealthChecks() {
    this.healthCheck.addDependency('mongodb', () => this.mongoClient.healthCheck());
    this.healthCheck.addDependency('redis', () => this.redisClient.healthCheck());
    this.healthCheck.addDependency('email', () => this.emailService.healthCheck());
  }

  setupMiddleware() {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(this.logger.requestLogger());

    // Request correlation ID
    this.app.use((req, res, next) => {
      req.correlationId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });

    // Attach services to request
    this.app.use((req, res, next) => {
      req.userManager = this.userManager;
      req.workspaceManager = this.workspaceManager;
      req.emailService = this.emailService;
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1/auth', authRoutes);
    this.app.use('/api/v1/users', usersRoutes);
    this.app.use('/api/v1/workspaces', workspacesRoutes);
    this.app.use('/api/v1/admin', adminRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'UX-Flow-Engine User Management Service',
        version: '1.0.0',
        status: 'online',
        endpoints: {
          health: '/health',
          auth: '/api/v1/auth',
          users: '/api/v1/users',
          workspaces: '/api/v1/workspaces',
          admin: '/api/v1/admin',
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
      const db = this.mongoClient.getDb();
      
      // Create indexes for performance
      await Promise.all([
        // Users collection indexes
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('users').createIndex({ workspaceId: 1 }),
        db.collection('users').createIndex({ status: 1 }),
        db.collection('users').createIndex({ role: 1 }),
        
        // Workspaces collection indexes
        db.collection('workspaces').createIndex({ ownerId: 1 }),
        db.collection('workspaces').createIndex({ 'members.userId': 1 }),
        db.collection('workspaces').createIndex({ status: 1 }),
        
        // User sessions collection indexes
        db.collection('user_sessions').createIndex({ userId: 1 }),
        db.collection('user_sessions').createIndex({ token: 1 }, { unique: true }),
        db.collection('user_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        
        // Password reset tokens
        db.collection('password_reset_tokens').createIndex({ token: 1 }, { unique: true }),
        db.collection('password_reset_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        
        // Email verification tokens
        db.collection('email_verification_tokens').createIndex({ token: 1 }, { unique: true }),
        db.collection('email_verification_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ]);

      this.logger.info('Database indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create database indexes', error);
      throw error;
    }
  }

  async start() {
    const port = config.port;
    
    this.app.listen(port, '0.0.0.0', () => {
      this.logger.info(`User Management Service listening on port ${port}`, {
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
    this.logger.info('Shutting down User Management Service...');
    
    try {
      // Close database connections
      await this.mongoClient.disconnect();
      await this.redisClient.disconnect();

      this.logger.info('User Management Service shut down successfully');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error);
      process.exit(1);
    }
  }
}

// Start the service
const service = new UserManagementService();

service.initialize()
  .then(() => service.start())
  .catch((error) => {
    console.error('Failed to start User Management Service:', error);
    process.exit(1);
  });