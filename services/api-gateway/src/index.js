/**
 * API Gateway Service - Main Entry Point
 * Fixed import order and circular dependencies
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import http from 'http';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Import utilities and configs (no circular deps)
import { Logger, MongoClient, RedisClient } from '@ux-flow/common';
import config from './config/index.js';

// Import middleware (order matters - no circular deps)
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error-handler.js';
import { initializeRateLimiter, rateLimiters } from './middleware/rate-limiter.js';
import { initializeTokenBlacklist } from './middleware/auth.js';
import { ServiceAuthenticator, ServiceClient } from './middleware/service-auth.js';

// Import services (independent modules)
import { TokenBlacklistService } from './services/token-blacklist.js';
import ELKService, { createELKMiddleware } from './services/elk-integration.js';
import { MFAService } from './services/mfa-service.js';
import { OAuthService } from './services/oauth-providers.js';
import { CircuitBreakerManager } from './services/circuit-breaker.js';

// Import routes (dependent on middleware)
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import userRoutes from './routes/users.js';
import workspaceRoutes from './routes/workspaces.js';
import healthRoutes from './routes/health.js';

// Import WebSocket components (dependent on services)
import { WebSocketManager } from './websocket/connection-manager-fixed.js';
import { MessageHandler } from './websocket/message-handler.js';
import { RoomManager } from './websocket/room-manager.js';

// Initialize logger
const logger = new Logger('api-gateway');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize services container to avoid circular dependencies
const services = {};

/**
 * Initialize all services
 */
async function initializeServices() {
  try {
    // 1. Initialize database connections
    logger.info('Connecting to MongoDB...');
    const mongoClient = new MongoClient(config.mongodb.uri);
    await mongoClient.connect();
    services.mongoClient = mongoClient;
    
    logger.info('Connecting to Redis...');
    const redisClient = new RedisClient(config.redis);
    await redisClient.connect();
    services.redisClient = redisClient;
    
    // 2. Initialize core services
    logger.info('Initializing core services...');
    
    // Initialize rate limiter
    await initializeRateLimiter(logger);
    services.rateLimiter = rateLimiters;
    
    // Initialize token blacklist
    const tokenBlacklist = initializeTokenBlacklist(redisClient, logger);
    services.tokenBlacklist = tokenBlacklist;
    
    // Initialize ELK
    const elkService = new ELKService(config, logger);
    services.elkService = elkService;
    
    // Initialize MFA
    const mfaService = new MFAService(mongoClient, redisClient, logger);
    services.mfaService = mfaService;
    
    // Initialize OAuth
    const oauthService = new OAuthService(mongoClient, logger);
    services.oauthService = oauthService;
    
    // Initialize Circuit Breaker
    const circuitBreaker = new CircuitBreakerManager(logger);
    services.circuitBreaker = circuitBreaker;
    
    // Initialize Service Authenticator
    const serviceAuth = new ServiceAuthenticator(logger, redisClient);
    services.serviceAuth = serviceAuth;
    
    // Initialize Service Client
    const serviceClient = new ServiceClient('api-gateway', serviceAuth, logger);
    services.serviceClient = serviceClient;
    
    // 3. Initialize WebSocket components
    logger.info('Initializing WebSocket services...');
    
    const roomManager = new RoomManager(redisClient, logger);
    const messageHandler = new MessageHandler(serviceClient, logger);
    const wsManager = new WebSocketManager(
      server,
      logger,
      messageHandler,
      roomManager,
      redisClient
    );
    services.wsManager = wsManager;
    
    logger.info('All services initialized successfully');
    return services;
    
  } catch (error) {
    logger.error('Failed to initialize services', error);
    throw error;
  }
}

/**
 * Configure Express middleware
 */
function configureMiddleware() {
  // Security middleware
  app.use(helmet({
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
  
  // CORS configuration
  app.use(cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining']
  }));
  
  // Compression
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
    threshold: 1024
  }));
  
  // Body parsing
  app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      // Store raw body for signature verification
      req.rawBody = buf.toString('utf8');
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Request tracking
  app.use((req, res, next) => {
    req.correlationId = req.headers['x-request-id'] || 
                       req.headers['x-correlation-id'] || 
                       `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', req.correlationId);
    req.logger = logger;
    next();
  });
  
  // ELK logging middleware
  if (services.elkService) {
    app.use(createELKMiddleware(services.elkService));
  }
  
  // Attach services to app locals
  app.locals = { ...app.locals, ...services };
}

/**
 * Configure routes
 */
function configureRoutes() {
  // Health check routes (no auth required)
  app.use('/health', healthRoutes);
  
  // Apply global rate limiting
  app.use(services.rateLimiter.global());
  
  // Auth routes
  app.use('/auth', authRoutes);
  
  // API routes (require authentication)
  app.use('/api/projects', projectRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  
  // 404 handler
  app.use(notFoundHandler);
  
  // Global error handler (must be last)
  app.use(errorHandler);
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close WebSocket connections
  if (services.wsManager) {
    await services.wsManager.shutdown();
  }
  
  // Close service connections
  if (services.elkService) {
    await services.elkService.shutdown();
  }
  
  if (services.tokenBlacklist) {
    services.tokenBlacklist.stopCleanupJob();
  }
  
  if (services.serviceAuth) {
    services.serviceAuth.destroy();
  }
  
  // Close database connections
  if (services.mongoClient) {
    await services.mongoClient.close();
  }
  
  if (services.redisClient) {
    await services.redisClient.quit();
  }
  
  logger.info('Graceful shutdown completed');
  process.exit(0);
}

/**
 * Start the server
 */
async function startServer() {
  try {
    // Initialize services first
    await initializeServices();
    
    // Configure middleware
    configureMiddleware();
    
    // Configure routes
    configureRoutes();
    
    // Start listening
    const port = config.port || 3000;
    server.listen(port, () => {
      logger.info(`API Gateway running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`WebSocket endpoint: ws://localhost:${port}/ws`);
    });
    
    // Setup graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      gracefulShutdown('UNHANDLED_REJECTION');
    });
    
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Export for testing
export { app, server, services, startServer };

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}