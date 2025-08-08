import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Logger, MongoClient, RedisClient, EventEmitter, ErrorHandler } from '@ux-flow/common';
import { loadConfig } from './config/index.js';
import { setupRoutes } from './routes/index.js';
import { SubscriptionManager } from './services/subscription-manager.js';
import { UsageTracker } from './services/usage-tracker.js';
import { PaymentProcessor } from './services/payment-processor.js';
import { InvoiceGenerator } from './services/invoice-generator.js';
import { WebhookHandler } from './services/webhook-handler.js';
import { initializeCronJobs } from './utils/cron-jobs.js';
import { errorMiddleware } from './middleware/error.js';

dotenv.config();

const app = express();
const logger = new Logger('billing-service');
const config = loadConfig();

let mongoClient;
let redisClient;
let eventEmitter;
let subscriptionManager;
let usageTracker;
let paymentProcessor;
let invoiceGenerator;
let webhookHandler;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});

async function initializeServices() {
  try {
    mongoClient = new MongoClient(logger, config.mongodb);
    await mongoClient.connect();
    logger.info('MongoDB connected');

    redisClient = new RedisClient(logger, config.redis);
    await redisClient.connect();
    logger.info('Redis connected');

    eventEmitter = new EventEmitter(redisClient, logger);
    await eventEmitter.initialize();
    logger.info('Event system initialized');

    paymentProcessor = new PaymentProcessor(logger, config.stripe);
    await paymentProcessor.initialize();
    logger.info('Payment processor initialized');

    subscriptionManager = new SubscriptionManager(
      logger,
      mongoClient,
      redisClient,
      paymentProcessor,
      eventEmitter
    );
    await subscriptionManager.initialize();
    logger.info('Subscription manager initialized');

    usageTracker = new UsageTracker(
      logger,
      mongoClient,
      redisClient,
      eventEmitter
    );
    await usageTracker.initialize();
    logger.info('Usage tracker initialized');

    invoiceGenerator = new InvoiceGenerator(
      logger,
      mongoClient,
      paymentProcessor
    );
    await invoiceGenerator.initialize();
    logger.info('Invoice generator initialized');

    webhookHandler = new WebhookHandler(
      logger,
      paymentProcessor,
      subscriptionManager,
      eventEmitter
    );
    logger.info('Webhook handler initialized');

    initializeCronJobs({
      subscriptionManager,
      usageTracker,
      invoiceGenerator,
      logger
    });
    logger.info('Cron jobs initialized');

    setupEventListeners();
    logger.info('Event listeners setup complete');

  } catch (error) {
    logger.error('Failed to initialize services', error);
    throw error;
  }
}

function setupEventListeners() {
  eventEmitter.on('USER_REGISTERED', async (data) => {
    try {
      await subscriptionManager.createFreeTierSubscription(data.userId, data.workspaceId);
      logger.info('Free tier subscription created for new user', { userId: data.userId });
    } catch (error) {
      logger.error('Failed to create free tier subscription', error);
    }
  });

  eventEmitter.on('AI_REQUEST_MADE', async (data) => {
    try {
      await usageTracker.trackAIUsage(data.workspaceId, data.model, data.tokens);
      logger.info('AI usage tracked', { workspaceId: data.workspaceId });
    } catch (error) {
      logger.error('Failed to track AI usage', error);
    }
  });

  eventEmitter.on('FLOW_CREATED', async (data) => {
    try {
      await usageTracker.trackFlowUsage(data.workspaceId, 'create');
      logger.info('Flow creation tracked', { workspaceId: data.workspaceId });
    } catch (error) {
      logger.error('Failed to track flow usage', error);
    }
  });

  eventEmitter.on('USER_ADDED_TO_WORKSPACE', async (data) => {
    try {
      await usageTracker.trackUserUsage(data.workspaceId, 'add');
      logger.info('User addition tracked', { workspaceId: data.workspaceId });
    } catch (error) {
      logger.error('Failed to track user usage', error);
    }
  });
}

app.use(helmet());
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/v1/billing', limiter);

app.use((req, res, next) => {
  req.logger = logger;
  req.config = config;
  req.services = {
    mongo: mongoClient,
    redis: redisClient,
    eventEmitter,
    subscriptionManager,
    usageTracker,
    paymentProcessor,
    invoiceGenerator,
    webhookHandler
  };
  next();
});

app.get('/health', (req, res) => {
  const healthcheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'billing-service',
    version: '1.0.0',
    uptime: process.uptime(),
    dependencies: {
      mongodb: mongoClient?.isConnected() ? 'connected' : 'disconnected',
      redis: redisClient?.isConnected() ? 'connected' : 'disconnected',
      stripe: paymentProcessor?.isInitialized() ? 'connected' : 'disconnected'
    }
  };
  res.json(healthcheck);
});

setupRoutes(app);

app.use(errorMiddleware);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

async function startServer() {
  try {
    await initializeServices();
    
    const PORT = config.port || 3004;
    app.listen(PORT, () => {
      logger.info(`Billing Service running on port ${PORT}`, {
        environment: config.env,
        features: {
          stripe: !!config.stripe.secretKey,
          webhooks: !!config.stripe.webhookSecret,
          invoicing: true,
          usageTracking: true
        }
      });
    });
  } catch (error) {
    logger.error('Failed to start billing service', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await mongoClient?.close();
  await redisClient?.disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

startServer();