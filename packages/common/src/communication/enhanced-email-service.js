// ==========================================
// PACKAGES/COMMON/src/communication/enhanced-email-service.js
// ==========================================

import nodemailer from 'nodemailer';
import { EventEmitter } from 'events';

/**
 * Enhanced Email Service
 * Comprehensive email service with templates, queuing, tracking, and multiple provider support
 */
export class EnhancedEmailService extends EventEmitter {
  constructor(config, logger, messageQueue = null) {
    super();
    
    this.config = {
      provider: 'smtp', // smtp, sendgrid, ses, mailgun
      from: {
        name: 'UX Flow Engine',
        address: 'noreply@ux-flow-engine.com'
      },
      templates: {
        enabled: true,
        baseUrl: process.env.FRONTEND_URL || 'https://app.ux-flow-engine.com'
      },
      tracking: {
        enabled: true,
        trackOpens: true,
        trackClicks: true
      },
      rateLimit: {
        enabled: true,
        maxPerHour: 1000,
        maxPerDay: 10000
      },
      retry: {
        enabled: true,
        maxAttempts: 3,
        backoffMultiplier: 2
      },
      ...config
    };

    this.logger = logger;
    this.messageQueue = messageQueue;
    this.transporter = null;
    this.initialized = false;

    // Rate limiting counters
    this.hourlyCount = 0;
    this.dailyCount = 0;
    this.lastHourReset = Date.now();
    this.lastDayReset = Date.now();

    // Email tracking
    this.sentEmails = new Map();
    this.emailStats = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0
    };
  }

  /**
   * Initialize email service
   */
  async initialize() {
    try {
      await this.setupTransporter();
      await this.setupRateLimitResets();
      
      if (this.messageQueue) {
        await this.setupQueueProcessing();
      }

      this.initialized = true;
      this.logger.info('Enhanced Email Service initialized', {
        provider: this.config.provider,
        queueEnabled: !!this.messageQueue,
        trackingEnabled: this.config.tracking.enabled
      });

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize enhanced email service', error);
      throw error;
    }
  }

  /**
   * Setup email transporter based on provider
   */
  async setupTransporter() {
    switch (this.config.provider) {
      case 'smtp':
        await this.setupSMTPTransporter();
        break;
      case 'sendgrid':
        await this.setupSendGridTransporter();
        break;
      case 'ses':
        await this.setupSESTransporter();
        break;
      case 'mailgun':
        await this.setupMailgunTransporter();
        break;
      default:
        throw new Error(`Unsupported email provider: ${this.config.provider}`);
    }

    if (this.transporter) {
      await this.transporter.verify();
      this.logger.info('Email transporter verified successfully');
    }
  }

  /**
   * Setup SMTP transporter
   */
  async setupSMTPTransporter() {
    if (!this.config.smtp?.host) {
      this.logger.warn('SMTP not configured, running in development mode');
      return;
    }

    this.transporter = nodemailer.createTransporter({
      host: this.config.smtp.host,
      port: this.config.smtp.port || 587,
      secure: this.config.smtp.secure || false,
      auth: this.config.smtp.auth?.user ? {
        user: this.config.smtp.auth.user,
        pass: this.config.smtp.auth.pass,
      } : undefined,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }

  /**
   * Setup SendGrid transporter
   */
  async setupSendGridTransporter() {
    if (!this.config.sendgrid?.apiKey) {
      throw new Error('SendGrid API key not configured');
    }

    this.transporter = nodemailer.createTransporter({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: this.config.sendgrid.apiKey,
      },
    });
  }

  /**
   * Setup AWS SES transporter
   */
  async setupSESTransporter() {
    if (!this.config.ses?.region) {
      throw new Error('AWS SES region not configured');
    }

    const aws = await import('@aws-sdk/client-ses');
    
    this.transporter = nodemailer.createTransporter({
      SES: {
        ses: new aws.SESClient({
          region: this.config.ses.region,
          credentials: this.config.ses.credentials
        }),
        aws,
      },
    });
  }

  /**
   * Setup Mailgun transporter
   */
  async setupMailgunTransporter() {
    if (!this.config.mailgun?.apiKey || !this.config.mailgun?.domain) {
      throw new Error('Mailgun API key and domain not configured');
    }

    this.transporter = nodemailer.createTransporter({
      service: 'Mailgun',
      auth: {
        user: 'api',
        pass: this.config.mailgun.apiKey,
      },
    });
  }

  /**
   * Setup rate limit resets
   */
  setupRateLimitResets() {
    // Reset hourly counter
    setInterval(() => {
      this.hourlyCount = 0;
      this.lastHourReset = Date.now();
    }, 3600000); // 1 hour

    // Reset daily counter
    setInterval(() => {
      this.dailyCount = 0;
      this.lastDayReset = Date.now();
    }, 86400000); // 24 hours
  }

  /**
   * Setup message queue processing
   */
  async setupQueueProcessing() {
    this.messageQueue.registerQueue('email_send', {
      retryAttempts: this.config.retry.maxAttempts,
      retryDelay: 5000,
      concurrency: 3
    });

    this.messageQueue.registerProcessor('email_send', async (jobData) => {
      return await this.processSendEmail(jobData);
    });

    this.logger.info('Email queue processing setup complete');
  }

  /**
   * Send email (with queuing support)
   */
  async sendEmail(emailData, options = {}) {
    const {
      to,
      subject,
      html,
      text,
      template,
      templateData,
      priority = 'normal',
      scheduled = null,
      tracking = true,
      attachments = []
    } = emailData;

    // Validate required fields
    if (!to || !subject || (!html && !template)) {
      throw new Error('Missing required email fields: to, subject, and html/template');
    }

    // Generate email ID for tracking
    const emailId = this.generateEmailId();

    const processedEmailData = {
      id: emailId,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || await this.renderTemplate(template, templateData),
      text: text || this.htmlToText(html),
      attachments,
      tracking: tracking && this.config.tracking.enabled,
      metadata: {
        template,
        templateData,
        userId: options.userId,
        correlationId: options.correlationId,
        source: options.source || 'api',
        campaign: options.campaign,
        tags: options.tags || []
      },
      createdAt: new Date().toISOString()
    };

    // Check rate limits
    if (this.config.rateLimit.enabled) {
      this.checkRateLimit(processedEmailData.to.length);
    }

    // Queue or send immediately
    if (this.messageQueue && (scheduled || priority !== 'immediate')) {
      return await this.queueEmail(processedEmailData, {
        priority: this.getPriorityScore(priority),
        delay: scheduled ? new Date(scheduled).getTime() - Date.now() : 0,
        ...options
      });
    } else {
      return await this.sendEmailImmediate(processedEmailData);
    }
  }

  /**
   * Queue email for async processing
   */
  async queueEmail(emailData, options = {}) {
    const jobId = await this.messageQueue.addJob('email_send', emailData, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      correlationId: emailData.metadata.correlationId,
      userId: emailData.metadata.userId
    });

    this.logger.info('Email queued for processing', {
      emailId: emailData.id,
      jobId,
      to: emailData.to.length,
      template: emailData.metadata.template
    });

    // Track queued email
    this.sentEmails.set(emailData.id, {
      ...emailData,
      status: 'queued',
      jobId,
      queuedAt: new Date().toISOString()
    });

    return { emailId: emailData.id, jobId };
  }

  /**
   * Process email send job (called by queue processor)
   */
  async processSendEmail(emailData) {
    try {
      const result = await this.sendEmailImmediate(emailData);
      
      // Update tracking
      if (this.sentEmails.has(emailData.id)) {
        const trackedEmail = this.sentEmails.get(emailData.id);
        trackedEmail.status = 'sent';
        trackedEmail.sentAt = new Date().toISOString();
        trackedEmail.messageId = result.messageId;
      }

      this.emailStats.sent += emailData.to.length;
      this.emit('email_sent', { emailData, result });
      
      return result;
    } catch (error) {
      // Update tracking
      if (this.sentEmails.has(emailData.id)) {
        const trackedEmail = this.sentEmails.get(emailData.id);
        trackedEmail.status = 'failed';
        trackedEmail.error = error.message;
        trackedEmail.failedAt = new Date().toISOString();
      }

      this.emailStats.failed += emailData.to.length;
      this.emit('email_failed', { emailData, error });
      
      throw error;
    }
  }

  /**
   * Send email immediately
   */
  async sendEmailImmediate(emailData) {
    if (!this.transporter) {
      // Development mode - log instead of send
      this.logger.info('EMAIL (Development Mode)', emailData);
      return { messageId: `dev-${emailData.id}` };
    }

    const emailOptions = {
      from: {
        name: this.config.from.name,
        address: this.config.from.address,
      },
      to: emailData.to,
      subject: emailData.subject,
      html: this.addTracking(emailData.html, emailData),
      text: emailData.text,
      attachments: emailData.attachments || [],
      headers: {
        'X-Email-ID': emailData.id,
        'X-Campaign': emailData.metadata.campaign || 'default',
        ...emailData.metadata.tags && { 'X-Tags': emailData.metadata.tags.join(',') }
      }
    };

    const result = await this.transporter.sendMail(emailOptions);
    
    this.logger.info('Email sent successfully', {
      emailId: emailData.id,
      to: emailData.to,
      subject: emailData.subject,
      messageId: result.messageId
    });

    return result;
  }

  /**
   * Add tracking pixels and click tracking to HTML
   */
  addTracking(html, emailData) {
    if (!emailData.tracking) return html;

    let trackedHtml = html;

    // Add open tracking pixel
    if (this.config.tracking.trackOpens) {
      const trackingPixel = `<img src="${this.config.templates.baseUrl}/api/email/track/open/${emailData.id}" width="1" height="1" style="display: none;" />`;
      trackedHtml += trackingPixel;
    }

    // Add click tracking to links
    if (this.config.tracking.trackClicks) {
      trackedHtml = trackedHtml.replace(
        /<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi,
        (match, url, attributes) => {
          if (url.startsWith('mailto:') || url.startsWith('#')) {
            return match; // Skip mailto and anchor links
          }
          const trackingUrl = `${this.config.templates.baseUrl}/api/email/track/click/${emailData.id}?url=${encodeURIComponent(url)}`;
          return `<a href="${trackingUrl}"${attributes}>`;
        }
      );
    }

    return trackedHtml;
  }

  /**
   * Track email open
   */
  trackOpen(emailId) {
    if (this.sentEmails.has(emailId)) {
      const trackedEmail = this.sentEmails.get(emailId);
      if (!trackedEmail.opened) {
        trackedEmail.opened = true;
        trackedEmail.openedAt = new Date().toISOString();
        this.emailStats.opened += 1;
        this.emit('email_opened', { emailId, email: trackedEmail });
      }
    }
  }

  /**
   * Track email click
   */
  trackClick(emailId, url) {
    if (this.sentEmails.has(emailId)) {
      const trackedEmail = this.sentEmails.get(emailId);
      if (!trackedEmail.clicks) {
        trackedEmail.clicks = [];
      }
      trackedEmail.clicks.push({
        url,
        clickedAt: new Date().toISOString()
      });
      this.emailStats.clicked += 1;
      this.emit('email_clicked', { emailId, url, email: trackedEmail });
    }
  }

  /**
   * Send templated emails
   */
  async sendWelcomeEmail(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'welcome',
      subject: `Welcome to UX Flow Engine${data.workspaceName ? ` - ${data.workspaceName}` : ''}!`,
      templateData: data
    }, options);
  }

  async sendEmailVerification(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'email_verification',
      subject: 'Verify your email address',
      templateData: data
    }, options);
  }

  async sendPasswordReset(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'password_reset',
      subject: 'Reset your password',
      templateData: data
    }, options);
  }

  async sendWorkspaceInvitation(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'workspace_invitation',
      subject: `You're invited to join ${data.workspaceName} on UX Flow Engine`,
      templateData: data
    }, options);
  }

  async sendBillingNotification(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'billing_notification',
      subject: data.subject || 'Billing Update',
      templateData: data
    }, options);
  }

  async sendSystemAlert(to, data, options = {}) {
    return await this.sendEmail({
      to,
      template: 'system_alert',
      subject: data.subject || 'System Alert',
      templateData: data,
      priority: 'high'
    }, options);
  }

  /**
   * Bulk email sending
   */
  async sendBulkEmails(emails, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delayBetweenBatches = options.delay || 1000;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (emailData) => {
        try {
          const result = await this.sendEmail(emailData, {
            ...options,
            campaign: options.campaign || 'bulk_send'
          });
          return { success: true, result, emailData };
        } catch (error) {
          return { success: false, error: error.message, emailData };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value));

      // Delay between batches
      if (i + batchSize < emails.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    this.logger.info('Bulk email send completed', {
      total: emails.length,
      successful,
      failed,
      campaign: options.campaign
    });

    return { total: emails.length, successful, failed, results };
  }

  /**
   * Template rendering (basic implementation)
   */
  async renderTemplate(templateName, data) {
    // In a full implementation, this would use a template engine like Handlebars
    // For now, return a placeholder
    return `
      <html>
        <body>
          <h1>Email Template: ${templateName}</h1>
          <p>Template data: ${JSON.stringify(data, null, 2)}</p>
        </body>
      </html>
    `;
  }

  /**
   * Convert HTML to plain text
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check rate limits
   */
  checkRateLimit(emailCount) {
    if (this.hourlyCount + emailCount > this.config.rateLimit.maxPerHour) {
      throw new Error(`Hourly email limit exceeded (${this.config.rateLimit.maxPerHour})`);
    }

    if (this.dailyCount + emailCount > this.config.rateLimit.maxPerDay) {
      throw new Error(`Daily email limit exceeded (${this.config.rateLimit.maxPerDay})`);
    }

    this.hourlyCount += emailCount;
    this.dailyCount += emailCount;
  }

  /**
   * Get priority score for queue
   */
  getPriorityScore(priority) {
    const scores = {
      immediate: 1000,
      high: 100,
      normal: 10,
      low: 1
    };
    return scores[priority] || scores.normal;
  }

  /**
   * Generate unique email ID
   */
  generateEmailId() {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get email statistics
   */
  getStats() {
    return {
      ...this.emailStats,
      rateLimit: {
        hourlyCount: this.hourlyCount,
        dailyCount: this.dailyCount,
        hourlyLimit: this.config.rateLimit.maxPerHour,
        dailyLimit: this.config.rateLimit.maxPerDay,
        lastHourReset: this.lastHourReset,
        lastDayReset: this.lastDayReset
      },
      tracking: {
        totalTracked: this.sentEmails.size,
        openRate: this.emailStats.sent > 0 ? (this.emailStats.opened / this.emailStats.sent * 100).toFixed(2) : 0,
        clickRate: this.emailStats.sent > 0 ? (this.emailStats.clicked / this.emailStats.sent * 100).toFixed(2) : 0
      }
    };
  }

  /**
   * Get email status
   */
  getEmailStatus(emailId) {
    return this.sentEmails.get(emailId) || null;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'error', message: 'Email service not initialized' };
      }

      if (this.transporter) {
        await this.transporter.verify();
        return {
          status: 'healthy',
          provider: this.config.provider,
          configured: true,
          queueEnabled: !!this.messageQueue,
          stats: this.getStats()
        };
      } else {
        return {
          status: 'healthy',
          provider: 'development',
          configured: false,
          message: 'Running in development mode'
        };
      }
    } catch (error) {
      this.logger.error('Email service health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message,
        provider: this.config.provider
      };
    }
  }

  /**
   * Shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down enhanced email service');
    
    if (this.transporter && this.transporter.close) {
      this.transporter.close();
    }

    this.removeAllListeners();
  }
}

// Email template types
export const EmailTemplates = {
  WELCOME: 'welcome',
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  WORKSPACE_INVITATION: 'workspace_invitation',
  BILLING_NOTIFICATION: 'billing_notification',
  SYSTEM_ALERT: 'system_alert',
  PROJECT_SHARED: 'project_shared',
  FLOW_COMMENT: 'flow_comment',
  WEEKLY_DIGEST: 'weekly_digest',
  EXPORT_READY: 'export_ready'
};

// Email priorities
export const EmailPriority = {
  IMMEDIATE: 'immediate',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low'
};

// Singleton instance
let globalEnhancedEmailService = null;

export const initializeEnhancedEmailService = (config, logger, messageQueue = null) => {
  if (globalEnhancedEmailService) {
    globalEnhancedEmailService.shutdown();
  }
  globalEnhancedEmailService = new EnhancedEmailService(config, logger, messageQueue);
  return globalEnhancedEmailService;
};

export const getEnhancedEmailService = () => {
  if (!globalEnhancedEmailService) {
    throw new Error('Enhanced email service not initialized. Call initializeEnhancedEmailService() first.');
  }
  return globalEnhancedEmailService;
};