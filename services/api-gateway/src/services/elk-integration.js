/**
 * ELK Stack Integration Service
 * Elasticsearch, Logstash, Kibana integration for logging and monitoring
 */

import { Client } from '@elastic/elasticsearch';
import winston from 'winston';
import ElasticsearchTransport from 'winston-elasticsearch';

class ELKService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.esClient = null;
    this.winstonLogger = null;
    this.metricsBuffer = [];
    this.logsBuffer = [];
    this.flushInterval = null;
    this.isConnected = false;
    
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize Elasticsearch client
      this.esClient = new Client({
        node: this.config.elasticsearch?.url || process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
        auth: {
          username: this.config.elasticsearch?.username || process.env.ELASTICSEARCH_USERNAME || 'elastic',
          password: this.config.elasticsearch?.password || process.env.ELASTICSEARCH_PASSWORD
        },
        maxRetries: 5,
        requestTimeout: 30000,
        sniffOnStart: true,
        sniffInterval: 60000,
        sniffOnConnectionFault: true,
        ssl: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });

      // Test connection
      const health = await this.esClient.cluster.health();
      this.isConnected = true;
      this.logger.info('Elasticsearch connected', { 
        cluster: health.cluster_name, 
        status: health.status 
      });

      // Create indices if they don't exist
      await this.createIndices();

      // Setup Winston logger with Elasticsearch transport
      this.setupWinstonLogger();

      // Start buffer flush interval
      this.startFlushInterval();

    } catch (error) {
      this.logger.error('Failed to initialize ELK service', error);
      this.isConnected = false;
    }
  }

  async createIndices() {
    const indices = [
      {
        name: 'api-gateway-logs',
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            service: { type: 'keyword' },
            correlationId: { type: 'keyword' },
            userId: { type: 'keyword' },
            method: { type: 'keyword' },
            path: { type: 'keyword' },
            statusCode: { type: 'integer' },
            responseTime: { type: 'float' },
            ip: { type: 'ip' },
            userAgent: { type: 'text' },
            error: {
              properties: {
                message: { type: 'text' },
                stack: { type: 'text' },
                code: { type: 'keyword' }
              }
            }
          }
        }
      },
      {
        name: 'api-gateway-metrics',
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            metric: { type: 'keyword' },
            value: { type: 'float' },
            tags: { type: 'keyword' },
            service: { type: 'keyword' },
            environment: { type: 'keyword' }
          }
        }
      },
      {
        name: 'api-gateway-audit',
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            action: { type: 'keyword' },
            userId: { type: 'keyword' },
            targetId: { type: 'keyword' },
            targetType: { type: 'keyword' },
            changes: { type: 'object' },
            result: { type: 'keyword' },
            ip: { type: 'ip' },
            userAgent: { type: 'text' },
            correlationId: { type: 'keyword' }
          }
        }
      }
    ];

    for (const index of indices) {
      try {
        const indexName = `${index.name}-${new Date().toISOString().slice(0, 7)}`; // Monthly indices
        const exists = await this.esClient.indices.exists({ index: indexName });
        
        if (!exists) {
          await this.esClient.indices.create({
            index: indexName,
            body: {
              mappings: index.mappings,
              settings: {
                number_of_shards: 1,
                number_of_replicas: 1,
                'index.lifecycle.name': 'api-gateway-ilm-policy',
                'index.lifecycle.rollover_alias': index.name
              }
            }
          });
          
          // Create alias
          await this.esClient.indices.putAlias({
            index: indexName,
            name: index.name
          });
          
          this.logger.info(`Created Elasticsearch index: ${indexName}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create index ${index.name}`, error);
      }
    }
  }

  setupWinstonLogger() {
    const esTransportOpts = {
      level: 'info',
      client: this.esClient,
      index: 'api-gateway-logs',
      transformer: (logData) => {
        return {
          '@timestamp': logData.timestamp || new Date().toISOString(),
          message: logData.message,
          severity: logData.level,
          service: 'api-gateway',
          environment: process.env.NODE_ENV || 'development',
          ...logData.meta
        };
      }
    };

    this.winstonLogger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new ElasticsearchTransport(esTransportOpts),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * Log HTTP request/response
   */
  async logHttpRequest(req, res, responseTime) {
    if (!this.isConnected) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 400 ? 'error' : 'info',
      message: `${req.method} ${req.path} ${res.statusCode}`,
      service: 'api-gateway',
      correlationId: req.correlationId,
      userId: req.user?.userId,
      method: req.method,
      path: req.path,
      query: req.query,
      statusCode: res.statusCode,
      responseTime,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      contentLength: res.get('content-length')
    };

    this.logsBuffer.push(logEntry);
    
    // Flush immediately for errors
    if (res.statusCode >= 500) {
      await this.flushLogs();
    }
  }

  /**
   * Log application event
   */
  async logEvent(level, message, meta = {}) {
    if (!this.isConnected) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'api-gateway',
      ...meta
    };

    this.logsBuffer.push(logEntry);
  }

  /**
   * Log audit event
   */
  async logAudit(action, userId, targetId, targetType, changes = null, result = 'success', meta = {}) {
    if (!this.isConnected) return;

    try {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        action,
        userId,
        targetId,
        targetType,
        changes,
        result,
        service: 'api-gateway',
        environment: process.env.NODE_ENV || 'development',
        ...meta
      };

      await this.esClient.index({
        index: 'api-gateway-audit',
        body: auditEntry
      });
    } catch (error) {
      this.logger.error('Failed to log audit event', error);
    }
  }

  /**
   * Send metric to Elasticsearch
   */
  async sendMetric(metric, value, tags = {}) {
    if (!this.isConnected) return;

    const metricEntry = {
      timestamp: new Date().toISOString(),
      metric,
      value,
      tags,
      service: 'api-gateway',
      environment: process.env.NODE_ENV || 'development'
    };

    this.metricsBuffer.push(metricEntry);
  }

  /**
   * Bulk send metrics
   */
  async sendMetrics(metrics) {
    if (!this.isConnected) return;

    for (const metric of metrics) {
      this.metricsBuffer.push({
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        environment: process.env.NODE_ENV || 'development',
        ...metric
      });
    }
  }

  /**
   * Flush buffered logs to Elasticsearch
   */
  async flushLogs() {
    if (!this.isConnected || this.logsBuffer.length === 0) return;

    const logs = [...this.logsBuffer];
    this.logsBuffer = [];

    try {
      const body = logs.flatMap(doc => [
        { index: { _index: 'api-gateway-logs' } },
        doc
      ]);

      if (body.length > 0) {
        const response = await this.esClient.bulk({ body });
        
        if (response.errors) {
          this.logger.error('Errors in bulk log insert', {
            errors: response.items.filter(item => item.index?.error)
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to flush logs to Elasticsearch', error);
      // Re-add logs to buffer for retry
      this.logsBuffer = [...logs, ...this.logsBuffer];
    }
  }

  /**
   * Flush buffered metrics to Elasticsearch
   */
  async flushMetrics() {
    if (!this.isConnected || this.metricsBuffer.length === 0) return;

    const metrics = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      const body = metrics.flatMap(doc => [
        { index: { _index: 'api-gateway-metrics' } },
        doc
      ]);

      if (body.length > 0) {
        const response = await this.esClient.bulk({ body });
        
        if (response.errors) {
          this.logger.error('Errors in bulk metrics insert', {
            errors: response.items.filter(item => item.index?.error)
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to flush metrics to Elasticsearch', error);
      // Re-add metrics to buffer for retry
      this.metricsBuffer = [...metrics, ...this.metricsBuffer];
    }
  }

  /**
   * Start interval to flush buffers
   */
  startFlushInterval() {
    this.flushInterval = setInterval(async () => {
      await Promise.all([
        this.flushLogs(),
        this.flushMetrics()
      ]);
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Search logs
   */
  async searchLogs(query, from = 0, size = 100) {
    if (!this.isConnected) {
      throw new Error('Elasticsearch not connected');
    }

    try {
      const response = await this.esClient.search({
        index: 'api-gateway-logs',
        body: {
          query,
          from,
          size,
          sort: [{ timestamp: { order: 'desc' } }]
        }
      });

      return {
        total: response.hits.total.value,
        hits: response.hits.hits.map(hit => hit._source)
      };
    } catch (error) {
      this.logger.error('Failed to search logs', error);
      throw error;
    }
  }

  /**
   * Get aggregated metrics
   */
  async getMetrics(metric, interval = '1h', duration = '24h') {
    if (!this.isConnected) {
      throw new Error('Elasticsearch not connected');
    }

    try {
      const response = await this.esClient.search({
        index: 'api-gateway-metrics',
        body: {
          query: {
            bool: {
              must: [
                { term: { metric } },
                {
                  range: {
                    timestamp: {
                      gte: `now-${duration}`,
                      lte: 'now'
                    }
                  }
                }
              ]
            }
          },
          aggs: {
            metrics_over_time: {
              date_histogram: {
                field: 'timestamp',
                fixed_interval: interval
              },
              aggs: {
                avg_value: { avg: { field: 'value' } },
                max_value: { max: { field: 'value' } },
                min_value: { min: { field: 'value' } }
              }
            }
          },
          size: 0
        }
      });

      return response.aggregations.metrics_over_time.buckets;
    } catch (error) {
      this.logger.error('Failed to get metrics', error);
      throw error;
    }
  }

  /**
   * Create Kibana dashboard
   */
  async createKibanaDashboard() {
    // This would typically be done through Kibana API or imported as saved objects
    // Placeholder for dashboard creation logic
    this.logger.info('Kibana dashboard creation would be implemented here');
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const health = await this.esClient.cluster.health();
      return {
        status: 'healthy',
        elasticsearch: {
          cluster: health.cluster_name,
          status: health.status,
          nodes: health.number_of_nodes
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Cleanup and close connections
   */
  async shutdown() {
    try {
      // Flush remaining buffers
      await Promise.all([
        this.flushLogs(),
        this.flushMetrics()
      ]);

      // Clear interval
      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }

      // Close Elasticsearch client
      if (this.esClient) {
        await this.esClient.close();
      }

      this.logger.info('ELK service shut down');
    } catch (error) {
      this.logger.error('Error during ELK service shutdown', error);
    }
  }
}

/**
 * Express middleware for ELK logging
 */
export function createELKMiddleware(elkService) {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      res.send = originalSend;
      
      // Log the request/response
      const responseTime = Date.now() - startTime;
      elkService.logHttpRequest(req, res, responseTime).catch(err => {
        console.error('Failed to log to ELK', err);
      });
      
      // Send metrics
      elkService.sendMetrics([
        {
          metric: 'http_request_duration_ms',
          value: responseTime,
          tags: {
            method: req.method,
            path: req.route?.path || req.path,
            status: res.statusCode
          }
        },
        {
          metric: 'http_requests_total',
          value: 1,
          tags: {
            method: req.method,
            status: res.statusCode
          }
        }
      ]).catch(err => {
        console.error('Failed to send metrics to ELK', err);
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

export default ELKService;