// ==========================================
// PACKAGES/COMMON/src/logger/index.js
// ==========================================
import winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  constructor(serviceName = 'unknown-service') {
    this.serviceName = serviceName;
    this.logger = winston.createLogger({
      levels: logLevels,
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            service: service || this.serviceName,
            message,
            ...meta,
          });
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });

    // Add file transport in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(
        new winston.transports.File({
          filename: `logs/${serviceName}-error.log`,
          level: 'error',
        })
      );
      this.logger.add(
        new winston.transports.File({
          filename: `logs/${serviceName}-combined.log`,
        })
      );
    }
  }

  info(message, meta = {}) {
    this.logger.info(message, { service: this.serviceName, ...meta });
  }

  error(message, error = null, meta = {}) {
    this.logger.error(message, {
      service: this.serviceName,
      error: error?.message || error,
      stack: error?.stack,
      ...meta,
    });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { service: this.serviceName, ...meta });
  }

  debug(message, meta = {}) {
    this.logger.debug(message, { service: this.serviceName, ...meta });
  }

  // Agent-specific logging
  logAgentAction(agentName, action, metadata = {}) {
    this.info(`[${agentName}] ${action}`, {
      agent: agentName,
      action,
      ...metadata,
    });
  }

  // Request logging middleware for Express
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.info('HTTP Request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('user-agent'),
          ip: req.ip,
        });
      });
      
      next();
    };
  }
}

export { Logger };
