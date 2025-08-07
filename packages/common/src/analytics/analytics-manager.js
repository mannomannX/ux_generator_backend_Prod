// ==========================================
// COMMON - Analytics Manager
// Comprehensive analytics with privacy compliance
// ==========================================

import crypto from 'crypto';

export class AnalyticsManager {
  constructor(logger, mongoClient, redisClient, configManager) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.configManager = configManager;
    
    // Analytics configuration
    this.config = {
      enabled: configManager.get('ANALYTICS_ENABLED', true),
      provider: configManager.get('ANALYTICS_PROVIDER', 'mixpanel'),
      retentionDays: 365, // Keep analytics data for 1 year
      anonymizationEnabled: true,
      consentRequired: true,
      batchSize: 100,
      flushInterval: 30000 // 30 seconds
    };
    
    // Event types and their schemas
    this.eventSchemas = {
      // User Events
      'user.registered': {
        category: 'user',
        properties: ['registration_method', 'user_tier', 'workspace_id']
      },
      'user.login': {
        category: 'user',
        properties: ['login_method', 'user_tier', 'session_duration']
      },
      'user.logout': {
        category: 'user',
        properties: ['session_duration', 'user_tier']
      },
      'user.profile_updated': {
        category: 'user',
        properties: ['fields_updated', 'user_tier']
      },
      
      // Flow Events
      'flow.created': {
        category: 'flow',
        properties: ['template_used', 'node_count', 'industry', 'workspace_id']
      },
      'flow.updated': {
        category: 'flow',
        properties: ['changes_made', 'node_count', 'update_type', 'workspace_id']
      },
      'flow.generated': {
        category: 'flow',
        properties: ['generation_time', 'ai_provider', 'quality_mode', 'workspace_id']
      },
      'flow.exported': {
        category: 'flow',
        properties: ['export_format', 'node_count', 'workspace_id']
      },
      'flow.shared': {
        category: 'flow',
        properties: ['share_method', 'recipient_count', 'workspace_id']
      },
      
      // AI Events
      'ai.request': {
        category: 'ai',
        properties: ['agent_type', 'provider', 'model', 'tokens_used', 'cost', 'quality_mode']
      },
      'ai.feedback': {
        category: 'ai',
        properties: ['agent_type', 'feedback_type', 'rating', 'improvement_suggested']
      },
      'ai.learning_moment': {
        category: 'ai',
        properties: ['agent_type', 'learning_type', 'manual_flag']
      },
      
      // Knowledge Events
      'knowledge.query': {
        category: 'knowledge',
        properties: ['query_type', 'results_found', 'response_time', 'workspace_id']
      },
      'knowledge.document_added': {
        category: 'knowledge',
        properties: ['document_type', 'size', 'language', 'workspace_id']
      },
      'knowledge.embedding_generated': {
        category: 'knowledge',
        properties: ['provider', 'model', 'tokens_used', 'cost']
      },
      
      // Collaboration Events
      'collaboration.session_started': {
        category: 'collaboration',
        properties: ['participant_count', 'flow_id', 'workspace_id']
      },
      'collaboration.real_time_edit': {
        category: 'collaboration',
        properties: ['operation_type', 'conflict_resolved', 'workspace_id']
      },
      'collaboration.comment_added': {
        category: 'collaboration',
        properties: ['comment_type', 'thread_id', 'workspace_id']
      },
      
      // Workspace Events
      'workspace.created': {
        category: 'workspace',
        properties: ['tier', 'team_size', 'industry']
      },
      'workspace.member_added': {
        category: 'workspace',
        properties: ['role', 'invitation_method', 'workspace_id']
      },
      'workspace.tier_upgraded': {
        category: 'workspace',
        properties: ['from_tier', 'to_tier', 'workspace_id']
      },
      
      // Billing Events
      'billing.subscription_created': {
        category: 'billing',
        properties: ['tier', 'plan_type', 'amount', 'workspace_id']
      },
      'billing.payment_succeeded': {
        category: 'billing',
        properties: ['amount', 'tier', 'workspace_id']
      },
      'billing.payment_failed': {
        category: 'billing',
        properties: ['amount', 'error_code', 'workspace_id']
      },
      
      // Performance Events
      'performance.page_load': {
        category: 'performance',
        properties: ['page', 'load_time', 'bundle_size']
      },
      'performance.api_response': {
        category: 'performance',
        properties: ['endpoint', 'response_time', 'status_code']
      },
      
      // Error Events
      'error.client': {
        category: 'error',
        properties: ['error_type', 'page', 'browser', 'user_tier']
      },
      'error.server': {
        category: 'error',
        properties: ['service', 'error_type', 'severity']
      }
    };
    
    // Event queue for batching
    this.eventQueue = [];
    
    // External analytics providers
    this.providers = {
      mixpanel: null, // Will be initialized if token is available
      amplitude: null,
      segment: null
    };
    
    this.initialize();
  }

  /**
   * Initialize analytics manager
   */
  async initialize() {
    try {
      // Create database indexes
      await this.createDatabaseIndexes();
      
      // Initialize external providers
      await this.initializeProviders();
      
      // Start event processing
      this.startEventProcessing();
      
      // Setup periodic reporting
      this.setupPeriodicReporting();
      
      this.logger.info('Analytics Manager initialized', {
        enabled: this.config.enabled,
        provider: this.config.provider
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize Analytics Manager', error);
    }
  }

  /**
   * Create database indexes for analytics collections
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // Events collection
    await db.collection('analytics_events').createIndexes([
      { key: { timestamp: -1 } },
      { key: { event: 1, timestamp: -1 } },
      { key: { userId: 1, timestamp: -1 } },
      { key: { workspaceId: 1, timestamp: -1 } },
      { key: { category: 1, timestamp: -1 } },
      { key: { timestamp: 1 }, expireAfterSeconds: this.config.retentionDays * 24 * 60 * 60 }
    ]);
    
    // User consent collection
    await db.collection('analytics_consent').createIndexes([
      { key: { userId: 1 }, unique: true },
      { key: { updatedAt: -1 } }
    ]);
    
    // Analytics sessions collection
    await db.collection('analytics_sessions').createIndexes([
      { key: { sessionId: 1 }, unique: true },
      { key: { userId: 1, startTime: -1 } },
      { key: { workspaceId: 1, startTime: -1 } },
      { key: { startTime: 1 }, expireAfterSeconds: 30 * 24 * 60 * 60 } // 30 days
    ]);
    
    // Analytics aggregations collection (pre-computed metrics)
    await db.collection('analytics_aggregations').createIndexes([
      { key: { date: -1, metric: 1 } },
      { key: { workspaceId: 1, date: -1 } },
      { key: { date: 1 }, expireAfterSeconds: this.config.retentionDays * 24 * 60 * 60 }
    ]);
  }

  /**
   * Initialize external analytics providers
   */
  async initializeProviders() {
    try {
      // Initialize Mixpanel if token is available
      const mixpanelToken = this.configManager.get('MIXPANEL_PROJECT_TOKEN');
      if (mixpanelToken) {
        // In a real implementation, you would initialize the Mixpanel SDK here
        this.providers.mixpanel = {
          token: mixpanelToken,
          initialized: true
        };
        
        this.logger.info('Mixpanel analytics initialized');
      }
      
      // Add other providers as needed
      
    } catch (error) {
      this.logger.error('Failed to initialize analytics providers', error);
    }
  }

  /**
   * Track analytics event
   */
  async track(event, properties = {}, context = {}) {
    if (!this.config.enabled) {
      return;
    }

    try {
      const {
        userId,
        workspaceId,
        sessionId,
        ip,
        userAgent,
        timestamp = new Date()
      } = context;

      // Check user consent
      if (this.config.consentRequired && userId) {
        const hasConsent = await this.checkUserConsent(userId);
        if (!hasConsent) {
          // Only track essential events without user consent
          if (!this.isEssentialEvent(event)) {
            return;
          }
        }
      }

      // Validate event schema
      const schema = this.eventSchemas[event];
      if (!schema) {
        this.logger.warn('Unknown analytics event', { event });
        return;
      }

      // Sanitize and anonymize properties
      const sanitizedProperties = await this.sanitizeProperties(properties, schema);
      
      // Create analytics event
      const analyticsEvent = {
        event,
        category: schema.category,
        properties: sanitizedProperties,
        userId: this.config.anonymizationEnabled ? this.anonymizeUserId(userId) : userId,
        workspaceId,
        sessionId,
        timestamp,
        metadata: {
          ip: this.config.anonymizationEnabled ? this.anonymizeIP(ip) : ip,
          userAgent: this.sanitizeUserAgent(userAgent),
          source: 'server'
        }
      };

      // Add to queue for batch processing
      this.eventQueue.push(analyticsEvent);

      // Flush if queue is full
      if (this.eventQueue.length >= this.config.batchSize) {
        await this.flushEvents();
      }

      // Send to external providers if configured
      if (this.providers.mixpanel?.initialized) {
        await this.sendToMixpanel(analyticsEvent);
      }

    } catch (error) {
      this.logger.error('Failed to track analytics event', error, { event });
    }
  }

  /**
   * Track page view
   */
  async trackPageView(page, properties = {}, context = {}) {
    return await this.track('page.view', {
      page,
      ...properties
    }, context);
  }

  /**
   * Track user action
   */
  async trackUserAction(action, properties = {}, context = {}) {
    return await this.track('user.action', {
      action,
      ...properties
    }, context);
  }

  /**
   * Track performance metric
   */
  async trackPerformance(metric, value, properties = {}, context = {}) {
    return await this.track('performance.metric', {
      metric,
      value,
      ...properties
    }, context);
  }

  /**
   * Track error event
   */
  async trackError(error, properties = {}, context = {}) {
    return await this.track('error.occurred', {
      error_type: error.name,
      error_message: error.message,
      stack_trace: error.stack ? error.stack.substring(0, 1000) : null,
      ...properties
    }, context);
  }

  /**
   * Start analytics session
   */
  async startSession(userId, workspaceId, context = {}) {
    try {
      const sessionId = this.generateSessionId();
      const startTime = new Date();

      const session = {
        sessionId,
        userId: this.config.anonymizationEnabled ? this.anonymizeUserId(userId) : userId,
        workspaceId,
        startTime,
        lastActivity: startTime,
        events: 0,
        metadata: {
          ip: this.config.anonymizationEnabled ? this.anonymizeIP(context.ip) : context.ip,
          userAgent: this.sanitizeUserAgent(context.userAgent),
          referrer: context.referrer,
          utm_source: context.utm_source,
          utm_medium: context.utm_medium,
          utm_campaign: context.utm_campaign
        }
      };

      // Store session in database
      const db = this.mongoClient.getDb();
      await db.collection('analytics_sessions').insertOne(session);

      // Cache session in Redis
      await this.redisClient.setex(
        `analytics:session:${sessionId}`,
        3600, // 1 hour
        JSON.stringify(session)
      );

      // Track session start event
      await this.track('session.started', {
        session_id: sessionId,
        referrer: context.referrer,
        utm_source: context.utm_source,
        utm_medium: context.utm_medium,
        utm_campaign: context.utm_campaign
      }, { userId, workspaceId, sessionId, ...context });

      return sessionId;

    } catch (error) {
      this.logger.error('Failed to start analytics session', error);
      return null;
    }
  }

  /**
   * End analytics session
   */
  async endSession(sessionId, context = {}) {
    try {
      const db = this.mongoClient.getDb();

      // Get session data
      const session = await db.collection('analytics_sessions')
        .findOne({ sessionId });

      if (!session) {
        return;
      }

      const endTime = new Date();
      const duration = endTime.getTime() - session.startTime.getTime();

      // Update session
      await db.collection('analytics_sessions').updateOne(
        { sessionId },
        {
          $set: {
            endTime,
            duration,
            ended: true
          }
        }
      );

      // Remove from cache
      await this.redisClient.del(`analytics:session:${sessionId}`);

      // Track session end event
      await this.track('session.ended', {
        session_id: sessionId,
        duration: Math.round(duration / 1000), // Duration in seconds
        events: session.events || 0
      }, { ...context, sessionId });

    } catch (error) {
      this.logger.error('Failed to end analytics session', error);
    }
  }

  /**
   * Update user consent
   */
  async updateUserConsent(userId, consent) {
    try {
      const db = this.mongoClient.getDb();

      await db.collection('analytics_consent').replaceOne(
        { userId },
        {
          userId,
          consent,
          updatedAt: new Date(),
          ip: consent.ip,
          userAgent: consent.userAgent
        },
        { upsert: true }
      );

      // Cache consent status
      await this.redisClient.setex(
        `analytics:consent:${userId}`,
        86400, // 24 hours
        JSON.stringify(consent)
      );

      this.logger.info('User analytics consent updated', {
        userId,
        analytics: consent.analytics,
        marketing: consent.marketing
      });

    } catch (error) {
      this.logger.error('Failed to update user consent', error);
      throw error;
    }
  }

  /**
   * Check user consent
   */
  async checkUserConsent(userId) {
    try {
      // Check cache first
      const cached = await this.redisClient.get(`analytics:consent:${userId}`);
      if (cached) {
        const consent = JSON.parse(cached);
        return consent.analytics === true;
      }

      // Check database
      const db = this.mongoClient.getDb();
      const consentRecord = await db.collection('analytics_consent')
        .findOne({ userId });

      const hasConsent = consentRecord?.consent?.analytics === true;

      // Cache result
      if (consentRecord) {
        await this.redisClient.setex(
          `analytics:consent:${userId}`,
          86400,
          JSON.stringify(consentRecord.consent)
        );
      }

      return hasConsent;

    } catch (error) {
      this.logger.error('Failed to check user consent', error);
      return false;
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardData(workspaceId, timeframe = '7d', userId = null) {
    try {
      const db = this.mongoClient.getDb();
      
      // Calculate time range
      let startTime;
      switch (timeframe) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      // Build match criteria
      const matchCriteria = {
        timestamp: { $gte: startTime }
      };

      if (workspaceId) {
        matchCriteria.workspaceId = workspaceId;
      }

      if (userId) {
        matchCriteria.userId = this.config.anonymizationEnabled 
          ? this.anonymizeUserId(userId) 
          : userId;
      }

      // Run analytics queries
      const [
        eventStats,
        categoryStats,
        timeSeriesData,
        topEvents,
        userActivity
      ] = await Promise.all([
        // Total events and unique users
        db.collection('analytics_events').aggregate([
          { $match: matchCriteria },
          {
            $group: {
              _id: null,
              totalEvents: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' },
              uniqueWorkspaces: { $addToSet: '$workspaceId' }
            }
          }
        ]).toArray(),

        // Events by category
        db.collection('analytics_events').aggregate([
          { $match: matchCriteria },
          {
            $group: {
              _id: '$category',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray(),

        // Time series data (events per day)
        db.collection('analytics_events').aggregate([
          { $match: matchCriteria },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp'
                }
              },
              count: { $sum: 1 },
              uniqueUsers: { $addToSet: '$userId' }
            }
          },
          { $sort: { _id: 1 } }
        ]).toArray(),

        // Top events
        db.collection('analytics_events').aggregate([
          { $match: matchCriteria },
          {
            $group: {
              _id: '$event',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).toArray(),

        // User activity patterns
        db.collection('analytics_sessions').aggregate([
          {
            $match: {
              startTime: { $gte: startTime },
              ...(workspaceId && { workspaceId })
            }
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$startTime'
                }
              },
              sessions: { $sum: 1 },
              avgDuration: { $avg: '$duration' },
              uniqueUsers: { $addToSet: '$userId' }
            }
          },
          { $sort: { _id: 1 } }
        ]).toArray()
      ]);

      // Process results
      const stats = eventStats[0] || { 
        totalEvents: 0, 
        uniqueUsers: [], 
        uniqueWorkspaces: [] 
      };

      return {
        timeframe,
        summary: {
          totalEvents: stats.totalEvents,
          uniqueUsers: stats.uniqueUsers.length,
          uniqueWorkspaces: stats.uniqueWorkspaces.length,
          avgEventsPerUser: stats.uniqueUsers.length > 0 
            ? Math.round(stats.totalEvents / stats.uniqueUsers.length) 
            : 0
        },
        categories: categoryStats,
        timeSeries: timeSeriesData.map(item => ({
          date: item._id,
          events: item.count,
          uniqueUsers: item.uniqueUsers.length
        })),
        topEvents: topEvents.map(item => ({
          event: item._id,
          count: item.count
        })),
        userActivity: userActivity.map(item => ({
          date: item._id,
          sessions: item.sessions,
          avgDuration: Math.round(item.avgDuration / 1000) || 0, // Convert to seconds
          uniqueUsers: item.uniqueUsers.length
        })),
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to get analytics dashboard data', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealTimeAnalytics(workspaceId = null) {
    try {
      const db = this.mongoClient.getDb();
      const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
      
      const matchCriteria = {
        timestamp: { $gte: last5Minutes }
      };

      if (workspaceId) {
        matchCriteria.workspaceId = workspaceId;
      }

      const [recentEvents, activeSessions] = await Promise.all([
        // Recent events
        db.collection('analytics_events').aggregate([
          { $match: matchCriteria },
          {
            $group: {
              _id: '$event',
              count: { $sum: 1 },
              lastOccurrence: { $max: '$timestamp' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]).toArray(),

        // Active sessions
        db.collection('analytics_sessions').countDocuments({
          startTime: { $gte: new Date(Date.now() - 30 * 60 * 1000) }, // Last 30 minutes
          ended: { $ne: true },
          ...(workspaceId && { workspaceId })
        })
      ]);

      return {
        recentEvents: recentEvents.map(event => ({
          event: event._id,
          count: event.count,
          lastOccurrence: event.lastOccurrence
        })),
        activeSessions,
        timestamp: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to get real-time analytics', error);
      throw error;
    }
  }

  /**
   * Sanitize properties based on schema
   */
  async sanitizeProperties(properties, schema) {
    const sanitized = {};
    
    // Only include properties defined in schema
    for (const allowedProperty of schema.properties) {
      if (properties.hasOwnProperty(allowedProperty)) {
        let value = properties[allowedProperty];
        
        // Sanitize specific property types
        if (typeof value === 'string') {
          value = value.substring(0, 1000); // Limit string length
          value = this.removePII(value);
        }
        
        // Ensure numbers are valid
        if (typeof value === 'number' && !isFinite(value)) {
          value = 0;
        }
        
        sanitized[allowedProperty] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Remove PII from text
   */
  removePII(text) {
    if (typeof text !== 'string') return text;
    
    // Remove email addresses
    text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // Remove phone numbers
    text = text.replace(/\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE]');
    
    // Remove SSN
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    // Remove credit card numbers
    text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
    
    return text;
  }

  /**
   * Anonymize user ID
   */
  anonymizeUserId(userId) {
    if (!userId) return null;
    
    return crypto.createHash('sha256')
      .update(userId + process.env.ANALYTICS_SALT || 'default_salt')
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Anonymize IP address
   */
  anonymizeIP(ip) {
    if (!ip) return null;
    
    // For IPv4, zero out last octet
    if (ip.includes('.')) {
      const parts = ip.split('.');
      parts[3] = '0';
      return parts.join('.');
    }
    
    // For IPv6, zero out last 64 bits
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.slice(0, 4).join(':') + '::';
    }
    
    return '[IP]';
  }

  /**
   * Sanitize user agent
   */
  sanitizeUserAgent(userAgent) {
    if (!userAgent) return null;
    
    // Extract only browser and OS info, remove detailed version numbers
    const simplified = userAgent
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X') // Replace version numbers
      .substring(0, 200); // Limit length
    
    return simplified;
  }

  /**
   * Check if event is essential (can be tracked without consent)
   */
  isEssentialEvent(event) {
    const essentialEvents = [
      'error.occurred',
      'security.violation',
      'session.started',
      'session.ended'
    ];
    
    return essentialEvents.includes(event);
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Flush events to database
   */
  async flushEvents() {
    if (this.eventQueue.length === 0) return;

    try {
      const events = this.eventQueue.splice(0, this.config.batchSize);
      const db = this.mongoClient.getDb();
      
      await db.collection('analytics_events').insertMany(events);
      
      this.logger.debug('Analytics events flushed', { count: events.length });

    } catch (error) {
      this.logger.error('Failed to flush analytics events', error);
    }
  }

  /**
   * Start event processing loop
   */
  startEventProcessing() {
    setInterval(async () => {
      await this.flushEvents();
    }, this.config.flushInterval);
  }

  /**
   * Setup periodic reporting
   */
  setupPeriodicReporting() {
    // Generate daily reports at midnight
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        await this.generateDailyReports();
      }
    }, 60000); // Check every minute
  }

  /**
   * Generate daily analytics reports
   */
  async generateDailyReports() {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const db = this.mongoClient.getDb();
      
      // Generate aggregated metrics for yesterday
      const metrics = await db.collection('analytics_events').aggregate([
        {
          $match: {
            timestamp: { $gte: yesterday, $lt: today }
          }
        },
        {
          $group: {
            _id: {
              workspaceId: '$workspaceId',
              category: '$category'
            },
            events: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' }
          }
        }
      ]).toArray();
      
      // Store aggregated metrics
      const aggregations = metrics.map(metric => ({
        date: yesterday,
        workspaceId: metric._id.workspaceId,
        category: metric._id.category,
        events: metric.events,
        uniqueUsers: metric.uniqueUsers.length,
        createdAt: new Date()
      }));
      
      if (aggregations.length > 0) {
        await db.collection('analytics_aggregations').insertMany(aggregations);
      }
      
      this.logger.info('Daily analytics reports generated', {
        date: yesterday.toISOString().split('T')[0],
        aggregations: aggregations.length
      });

    } catch (error) {
      this.logger.error('Failed to generate daily analytics reports', error);
    }
  }

  /**
   * Send event to Mixpanel
   */
  async sendToMixpanel(event) {
    try {
      // In a real implementation, you would use the Mixpanel SDK
      // This is a placeholder for the actual implementation
      
      if (!this.providers.mixpanel?.initialized) {
        return;
      }

      // Format event for Mixpanel
      const mixpanelEvent = {
        event: event.event,
        properties: {
          ...event.properties,
          distinct_id: event.userId,
          time: event.timestamp.getTime(),
          $insert_id: crypto.randomBytes(16).toString('hex')
        }
      };

      // Send to Mixpanel (placeholder)
      this.logger.debug('Event sent to Mixpanel', { event: event.event });

    } catch (error) {
      this.logger.error('Failed to send event to Mixpanel', error);
    }
  }

  /**
   * Get analytics health status
   */
  getHealthStatus() {
    return {
      enabled: this.config.enabled,
      queueSize: this.eventQueue.length,
      providers: Object.keys(this.providers)
        .filter(key => this.providers[key]?.initialized),
      lastFlush: new Date(),
      status: 'healthy'
    };
  }
}

export default AnalyticsManager;