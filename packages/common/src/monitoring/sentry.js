// ==========================================
// PACKAGES/COMMON/src/monitoring/sentry.js
// ==========================================

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

let initialized = false;

/**
 * Initialize Sentry for error tracking
 */
export const initSentry = (serviceName, options = {}) => {
  if (initialized) {
    return;
  }

  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    serverName: serviceName,
    release: process.env.RELEASE_VERSION || '1.0.0',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    integrations: [
      // HTTP integration
      new Sentry.Integrations.Http({ tracing: true }),
      // Express integration
      new Sentry.Integrations.Express({ app: options.app }),
      // Profiling
      new ProfilingIntegration(),
      // MongoDB
      new Sentry.Integrations.Mongo({
        operations: ['find', 'findOne', 'insertOne', 'updateOne', 'deleteOne'],
      }),
    ],
    
    // Before send hook
    beforeSend(event, hint) {
      // Filter out sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = '[REDACTED]';
      }
      
      // Don't send events in development unless explicitly enabled
      if (process.env.NODE_ENV === 'development' && !process.env.SENTRY_DEV_ENABLED) {
        return null;
      }
      
      return event;
    },
    
    // Ignore certain errors
    ignoreErrors: [
      'NetworkError',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Invalid token',
      'Unauthorized',
    ],
    
    ...options,
  });

  initialized = true;
  console.log(`Sentry initialized for ${serviceName}`);
};

/**
 * Express error handler middleware
 */
export const sentryErrorHandler = () => {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all 4xx and 5xx errors
      if (error.status >= 400) {
        return true;
      }
      return false;
    },
  });
};

/**
 * Express request handler middleware
 */
export const sentryRequestHandler = () => {
  return Sentry.Handlers.requestHandler({
    user: ['id', 'email', 'role'],
    ip: true,
    transaction: 'methodPath',
  });
};

/**
 * Express tracing handler middleware
 */
export const sentryTracingHandler = () => {
  return Sentry.Handlers.tracingHandler();
};

/**
 * Capture exception with context
 */
export const captureException = (error, context = {}) => {
  Sentry.withScope((scope) => {
    // Add context
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });
    
    // Capture the exception
    Sentry.captureException(error);
  });
};

/**
 * Capture message with context
 */
export const captureMessage = (message, level = 'info', context = {}) => {
  Sentry.withScope((scope) => {
    // Add context
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });
    
    // Set level
    scope.setLevel(level);
    
    // Capture the message
    Sentry.captureMessage(message);
  });
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (breadcrumb) => {
  Sentry.addBreadcrumb({
    timestamp: Date.now() / 1000,
    ...breadcrumb,
  });
};

/**
 * Set user context
 */
export const setUser = (user) => {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    workspace_id: user.workspaceId,
  });
};

/**
 * Clear user context
 */
export const clearUser = () => {
  Sentry.setUser(null);
};

/**
 * Set tags
 */
export const setTags = (tags) => {
  Sentry.setTags(tags);
};

/**
 * Set extra context
 */
export const setExtra = (key, value) => {
  Sentry.setExtra(key, value);
};

/**
 * Start a transaction for performance monitoring
 */
export const startTransaction = (name, op = 'http.server') => {
  return Sentry.startTransaction({
    name,
    op,
  });
};

/**
 * Wrap async functions with error handling
 */
export const wrapAsync = (fn, context = {}) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureException(error, context);
      throw error;
    }
  };
};

/**
 * Monitor function performance
 */
export const monitorPerformance = (name, fn) => {
  return async (...args) => {
    const transaction = startTransaction(name, 'function');
    
    try {
      const result = await fn(...args);
      transaction.setStatus('ok');
      return result;
    } catch (error) {
      transaction.setStatus('internal_error');
      throw error;
    } finally {
      transaction.finish();
    }
  };
};

/**
 * Flush events before shutdown
 */
export const flushEvents = async (timeout = 2000) => {
  await Sentry.flush(timeout);
};

/**
 * Close Sentry client
 */
export const closeSentry = async () => {
  await Sentry.close();
};

export default {
  initSentry,
  sentryErrorHandler,
  sentryRequestHandler,
  sentryTracingHandler,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  clearUser,
  setTags,
  setExtra,
  startTransaction,
  wrapAsync,
  monitorPerformance,
  flushEvents,
  closeSentry,
};