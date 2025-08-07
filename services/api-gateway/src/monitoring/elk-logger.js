// ==========================================
// API GATEWAY - ELK Stack Integration
// Elasticsearch, Logstash, Kibana logging
// ==========================================

import winston from 'winston';
import ElasticsearchTransport from 'winston-elasticsearch';
import { Client } from '@elastic/elasticsearch';

export class ELKLogger {
  constructor(config = {}) {
    this.config = {
      elasticsearch: {
        node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
        auth: {
          username: process.env.ELASTICSEARCH_USER || 'elastic',
          password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
        },
        maxRetries: 3,
        requestTimeout: 60000,
        sniffOnStart: true
      },
      index: process.env.LOG_INDEX || 'ux-flow-engine',
      environment: process.env.NODE_ENV || 'development',
      service: 'api-gateway',
      ...config
    };

    this.initializeElasticsearch();
    this.initializeLogger();
    this.setupMetricsCollection();
  }

  /**
   * Initialize Elasticsearch client
   */
  initializeElasticsearch() {
    this.esClient = new Client(this.config.elasticsearch);
    
    // Test connection
    this.esClient.ping()
      .then(() => console.log('Elasticsearch connection established'))
      .catch(err => console.error('Elasticsearch connection failed:', err));

    // Create index template for better performance
    this.createIndexTemplate();
  }

  /**
   * Initialize Winston logger with ELK transport
   */
  initializeLogger() {
    // Elasticsearch transport configuration
    const esTransportOpts = {
      level: process.env.LOG_LEVEL || 'info',
      client: this.esClient,
      index: this.config.index,
      dataStream: true,
      transformer: this.logTransformer.bind(this),
      ensureIndexTemplate: true
    };

    // Create Winston logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: this.config.service,
        environment: this.config.environment,
        hostname: process.env.HOSTNAME || require('os').hostname()
      },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        // Elasticsearch transport
        new ElasticsearchTransport(esTransportOpts)
      ]
    });
  }

  /**
   * Transform log data for Elasticsearch
   */
  logTransformer(logData) {
    const transformed = {
      '@timestamp': logData.timestamp || new Date().toISOString(),
      severity: logData.level,
      service: {
        name: this.config.service,
        environment: this.config.environment,
        version: process.env.SERVICE_VERSION || '1.0.0'
      },
      message: logData.message,
      ...this.extractMetadata(logData)
    };

    // Add trace information if available
    if (logData.meta?.traceId) {
      transformed.trace = {
        id: logData.meta.traceId,
        spanId: logData.meta.spanId
      };
    }

    // Add user context
    if (logData.meta?.userId) {
      transformed.user = {
        id: logData.meta.userId,
        tier: logData.meta.userTier
      };
    }

    // Add request context
    if (logData.meta?.request) {
      transformed.http = {
        request: {
          method: logData.meta.request.method,
          url: logData.meta.request.url,
          headers: this.sanitizeHeaders(logData.meta.request.headers)
        },
        response: {
          status_code: logData.meta.response?.statusCode,
          time: logData.meta.response?.time
        }
      };
    }

    // Add error details
    if (logData.meta?.error) {
      transformed.error = {
        type: logData.meta.error.name,
        message: logData.meta.error.message,
        stack_trace: logData.meta.error.stack
      };
    }

    return transformed;
  }

  /**
   * Extract metadata from log data
   */
  extractMetadata(logData) {
    const metadata = {};

    // Performance metrics
    if (logData.meta?.performance) {
      metadata.performance = {
        duration: logData.meta.performance.duration,
        memory: logData.meta.performance.memory,
        cpu: logData.meta.performance.cpu
      };
    }

    // Business metrics
    if (logData.meta?.business) {
      metadata.business = {
        flowId: logData.meta.business.flowId,
        projectId: logData.meta.business.projectId,
        workspaceId: logData.meta.business.workspaceId,
        operation: logData.meta.business.operation
      };
    }

    // Security events
    if (logData.meta?.security) {
      metadata.security = {
        event: logData.meta.security.event,
        ip: logData.meta.security.ip,
        userAgent: logData.meta.security.userAgent,
        threat: logData.meta.security.threat
      };
    }

    return metadata;
  }

  /**
   * Sanitize headers to remove sensitive data
   */
  sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sanitized = { ...headers };
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'cookie',
      'x-auth-token'
    ];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Create Elasticsearch index template
   */
  async createIndexTemplate() {
    try {
      await this.esClient.indices.putIndexTemplate({
        name: `${this.config.index}-template`,
        body: {
          index_patterns: [`${this.config.index}-*`],
          data_stream: {},
          template: {
            settings: {
              number_of_shards: 3,
              number_of_replicas: 1,
              'index.lifecycle.name': 'ux-flow-engine-policy',
              'index.lifecycle.rollover_alias': this.config.index
            },
            mappings: {
              properties: {
                '@timestamp': { type: 'date' },
                severity: { type: 'keyword' },
                'service.name': { type: 'keyword' },
                'service.environment': { type: 'keyword' },
                message: { type: 'text' },
                'user.id': { type: 'keyword' },
                'user.tier': { type: 'keyword' },
                'http.request.method': { type: 'keyword' },
                'http.request.url': { type: 'text' },
                'http.response.status_code': { type: 'integer' },
                'http.response.time': { type: 'float' },
                'performance.duration': { type: 'float' },
                'performance.memory': { type: 'long' },
                'business.flowId': { type: 'keyword' },
                'business.projectId': { type: 'keyword' },
                'business.workspaceId': { type: 'keyword' },
                'error.type': { type: 'keyword' },
                'error.message': { type: 'text' },
                'security.event': { type: 'keyword' },
                'security.ip': { type: 'ip' },
                'trace.id': { type: 'keyword' },
                'trace.spanId': { type: 'keyword' }
              }
            }
          },
          priority: 200,
          version: 1
        }
      });

      console.log('Elasticsearch index template created');
    } catch (error) {
      console.error('Failed to create index template:', error);
    }
  }

  /**
   * Setup metrics collection
   */
  setupMetricsCollection() {
    // Collect and send metrics every minute
    setInterval(() => {
      this.collectAndSendMetrics();
    }, 60000);
  }

  /**
   * Collect system metrics
   */
  async collectAndSendMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      type: 'metrics',
      service: this.config.service,
      environment: this.config.environment,
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage()
      },
      custom: await this.getCustomMetrics()
    };

    // Send to Elasticsearch
    try {
      await this.esClient.index({
        index: `${this.config.index}-metrics`,
        body: metrics
      });
    } catch (error) {
      console.error('Failed to send metrics to Elasticsearch:', error);
    }
  }

  /**
   * Get custom application metrics
   */
  async getCustomMetrics() {
    // This would be populated with actual metrics
    return {
      requestCount: 0,
      errorRate: 0,
      avgResponseTime: 0,
      activeUsers: 0,
      wsConnections: 0
    };
  }

  /**
   * Log methods for different severity levels
   */
  info(message, meta = {}) {
    this.logger.info(message, { meta });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { meta });
  }

  error(message, error, meta = {}) {
    this.logger.error(message, {
      meta: {
        ...meta,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      }
    });
  }

  debug(message, meta = {}) {
    this.logger.debug(message, { meta });
  }

  /**
   * Log HTTP request
   */
  logRequest(req, res, responseTime) {
    const logData = {
      message: `${req.method} ${req.path}`,
      meta: {
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          query: req.query,
          ip: req.ip
        },
        response: {
          statusCode: res.statusCode,
          time: responseTime
        },
        userId: req.user?.id,
        userTier: req.user?.tier,
        traceId: req.headers['x-trace-id'],
        spanId: req.headers['x-span-id']
      }
    };

    if (res.statusCode >= 400) {
      this.logger.warn(logData.message, logData);
    } else {
      this.logger.info(logData.message, logData);
    }
  }

  /**
   * Log security event
   */
  logSecurityEvent(event, details) {
    this.logger.warn(`Security Event: ${event}`, {
      meta: {
        security: {
          event,
          ...details
        }
      }
    });
  }

  /**
   * Log business event
   */
  logBusinessEvent(event, details) {
    this.logger.info(`Business Event: ${event}`, {
      meta: {
        business: details
      }
    });
  }

  /**
   * Create Express middleware for request logging
   */
  createRequestLogger() {
    return (req, res, next) => {
      const startTime = Date.now();

      // Log request on response finish
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.logRequest(req, res, responseTime);
      });

      next();
    };
  }

  /**
   * Create error handling middleware
   */
  createErrorLogger() {
    return (err, req, res, next) => {
      this.error('Request error', err, {
        request: {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers
        },
        userId: req.user?.id
      });

      next(err);
    };
  }

  /**
   * Search logs in Elasticsearch
   */
  async searchLogs(query, options = {}) {
    const {
      from = 0,
      size = 100,
      startTime = 'now-1h',
      endTime = 'now',
      severity = null,
      userId = null
    } = options;

    const body = {
      query: {
        bool: {
          must: [
            {
              range: {
                '@timestamp': {
                  gte: startTime,
                  lte: endTime
                }
              }
            }
          ]
        }
      },
      sort: [
        { '@timestamp': { order: 'desc' } }
      ],
      from,
      size
    };

    // Add filters
    if (query) {
      body.query.bool.must.push({
        match: { message: query }
      });
    }

    if (severity) {
      body.query.bool.must.push({
        term: { severity }
      });
    }

    if (userId) {
      body.query.bool.must.push({
        term: { 'user.id': userId }
      });
    }

    try {
      const result = await this.esClient.search({
        index: `${this.config.index}-*`,
        body
      });

      return result.hits;
    } catch (error) {
      console.error('Failed to search logs:', error);
      throw error;
    }
  }

  /**
   * Get aggregated metrics from Elasticsearch
   */
  async getAggregatedMetrics(interval = '1h') {
    const body = {
      size: 0,
      query: {
        range: {
          '@timestamp': {
            gte: `now-${interval}`,
            lte: 'now'
          }
        }
      },
      aggs: {
        requests_over_time: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: '1m'
          },
          aggs: {
            status_codes: {
              terms: {
                field: 'http.response.status_code'
              }
            },
            avg_response_time: {
              avg: {
                field: 'http.response.time'
              }
            }
          }
        },
        top_errors: {
          terms: {
            field: 'error.type',
            size: 10
          }
        },
        users_by_tier: {
          terms: {
            field: 'user.tier'
          }
        }
      }
    };

    try {
      const result = await this.esClient.search({
        index: `${this.config.index}-*`,
        body
      });

      return result.aggregations;
    } catch (error) {
      console.error('Failed to get aggregated metrics:', error);
      throw error;
    }
  }
}

export default ELKLogger;