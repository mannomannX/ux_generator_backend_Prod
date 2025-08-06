const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const MongoStore = require('rate-limit-mongo');
const ExpressBrute = require('express-brute');
const MongooseStore = require('express-brute-mongoose');
const mongoose = require('mongoose');
const crypto = require('crypto');

class SecurityMiddleware {
  constructor(config = {}) {
    this.config = {
      rateLimitWindowMs: config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
      rateLimitMax: config.rateLimitMax || 100,
      slowDownWindowMs: config.slowDownWindowMs || 15 * 60 * 1000,
      slowDownDelayAfter: config.slowDownDelayAfter || 50,
      slowDownDelayMs: config.slowDownDelayMs || 500,
      bruteForceRetries: config.bruteForceRetries || 5,
      mongoUri: config.mongoUri || process.env.MONGODB_URI,
      ...config
    };
  }

  // Rate limiting middleware
  rateLimit(options = {}) {
    const config = {
      windowMs: options.windowMs || this.config.rateLimitWindowMs,
      max: options.max || this.config.rateLimitMax,
      message: options.message || 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: 'Too many requests',
          message: config.message,
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      },
      skip: (req) => {
        // Skip rate limiting for whitelisted IPs
        const whitelist = this.config.ipWhitelist || [];
        const clientIp = this.getClientIp(req);
        return whitelist.includes(clientIp);
      },
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise use IP
        return req.user?.id || this.getClientIp(req);
      }
    };
    
    // Use MongoDB store if available
    if (this.config.mongoUri) {
      config.store = new MongoStore({
        uri: this.config.mongoUri,
        collectionName: 'rate_limits',
        expireTimeMs: config.windowMs
      });
    }
    
    return rateLimit(config);
  }

  // Dynamic rate limiting based on user plan
  dynamicRateLimit() {
    return async (req, res, next) => {
      // Get user's subscription plan
      const plan = req.user?.subscription?.plan || 'free';
      
      // Define rate limits per plan
      const limits = {
        free: { windowMs: 15 * 60 * 1000, max: 100 },
        basic: { windowMs: 15 * 60 * 1000, max: 500 },
        pro: { windowMs: 15 * 60 * 1000, max: 2000 },
        enterprise: { windowMs: 15 * 60 * 1000, max: 10000 }
      };
      
      const config = limits[plan] || limits.free;
      
      // Apply rate limit
      const limiter = this.rateLimit(config);
      limiter(req, res, next);
    };
  }

  // Slow down requests middleware
  slowDown(options = {}) {
    const config = {
      windowMs: options.windowMs || this.config.slowDownWindowMs,
      delayAfter: options.delayAfter || this.config.slowDownDelayAfter,
      delayMs: options.delayMs || this.config.slowDownDelayMs,
      maxDelayMs: options.maxDelayMs || 5000,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        return req.user?.id || this.getClientIp(req);
      }
    };
    
    // Use MongoDB store if available
    if (this.config.mongoUri) {
      config.store = new MongoStore({
        uri: this.config.mongoUri,
        collectionName: 'slow_downs',
        expireTimeMs: config.windowMs
      });
    }
    
    return slowDown(config);
  }

  // Brute force protection
  bruteForceProtection() {
    const BruteForceSchema = new mongoose.Schema({
      _id: String,
      data: {
        count: Number,
        lastRequest: Date,
        firstRequest: Date
      },
      expires: { type: Date, index: { expireAfterSeconds: 0 } }
    });
    
    const store = new MongooseStore(
      mongoose.model('BruteForce', BruteForceSchema)
    );
    
    const bruteforce = new ExpressBrute(store, {
      freeRetries: this.config.bruteForceRetries,
      minWait: 5 * 60 * 1000, // 5 minutes
      maxWait: 60 * 60 * 1000, // 1 hour
      lifetime: 24 * 60 * 60, // 1 day
      failCallback: (req, res, next, nextValidRequestDate) => {
        res.status(429).json({
          error: 'Too many failed attempts',
          nextValidRequestDate
        });
      }
    });
    
    return bruteforce.prevent;
  }

  // API key validation
  apiKeyAuth() {
    return async (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      
      if (!apiKey) {
        return res.status(401).json({
          error: 'API key required'
        });
      }
      
      // Validate API key format
      if (!this.isValidApiKey(apiKey)) {
        return res.status(401).json({
          error: 'Invalid API key format'
        });
      }
      
      // Check API key in database
      try {
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        const apiKeyDoc = await mongoose.model('ApiKey').findOne({
          keyHash,
          active: true
        });
        
        if (!apiKeyDoc) {
          return res.status(401).json({
            error: 'Invalid API key'
          });
        }
        
        // Check expiration
        if (apiKeyDoc.expiresAt && apiKeyDoc.expiresAt < new Date()) {
          return res.status(401).json({
            error: 'API key expired'
          });
        }
        
        // Update last used
        apiKeyDoc.lastUsed = new Date();
        apiKeyDoc.usageCount = (apiKeyDoc.usageCount || 0) + 1;
        await apiKeyDoc.save();
        
        // Attach key info to request
        req.apiKey = {
          id: apiKeyDoc._id,
          name: apiKeyDoc.name,
          scopes: apiKeyDoc.scopes,
          userId: apiKeyDoc.userId
        };
        
        next();
      } catch (error) {
        console.error('API key validation error:', error);
        res.status(500).json({
          error: 'API key validation failed'
        });
      }
    };
  }

  // IP whitelisting/blacklisting
  ipFilter() {
    return (req, res, next) => {
      const clientIp = this.getClientIp(req);
      
      // Check blacklist
      const blacklist = this.config.ipBlacklist || [];
      if (blacklist.includes(clientIp)) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      // Check whitelist (if configured)
      if (this.config.ipWhitelist && this.config.ipWhitelist.length > 0) {
        if (!this.config.ipWhitelist.includes(clientIp)) {
          return res.status(403).json({
            error: 'Access denied'
          });
        }
      }
      
      next();
    };
  }

  // Request size limiting
  requestSizeLimit() {
    return (req, res, next) => {
      const maxSize = this.config.maxRequestSize || 10 * 1024 * 1024; // 10MB
      
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        
        if (size > maxSize) {
          res.status(413).json({
            error: 'Request entity too large'
          });
          req.connection.destroy();
        }
      });
      
      next();
    };
  }

  // Security monitoring and logging
  securityMonitoring() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log security events
      const logSecurityEvent = (event) => {
        const log = {
          timestamp: new Date().toISOString(),
          event,
          method: req.method,
          path: req.path,
          ip: this.getClientIp(req),
          userAgent: req.headers['user-agent'],
          userId: req.user?.id,
          requestId: req.id || req.headers['x-request-id']
        };
        
        // Send to security monitoring service
        if (this.config.securityLogger) {
          this.config.securityLogger.log(log);
        }
        
        // Console log in development
        if (process.env.NODE_ENV === 'development') {
          console.log('[SECURITY]', log);
        }
      };
      
      // Monitor suspicious patterns
      const suspicious = this.detectSuspiciousActivity(req);
      if (suspicious) {
        logSecurityEvent({
          type: 'suspicious_activity',
          details: suspicious
        });
      }
      
      // Log response
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        // Log slow requests
        if (duration > 5000) {
          logSecurityEvent({
            type: 'slow_request',
            duration
          });
        }
        
        // Log errors
        if (res.statusCode >= 400) {
          logSecurityEvent({
            type: 'error_response',
            statusCode: res.statusCode
          });
        }
      });
      
      next();
    };
  }

  // Detect suspicious activity
  detectSuspiciousActivity(req) {
    const suspicious = [];
    
    // Check for SQL injection patterns
    const sqlPatterns = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER)\b)|(--)|(;)|(\|\|)|(\/\*)|(\*\/)/gi;
    const url = req.url + JSON.stringify(req.body || {});
    if (sqlPatterns.test(url)) {
      suspicious.push('Possible SQL injection attempt');
    }
    
    // Check for XSS patterns
    const xssPatterns = /<script|<iframe|javascript:|onerror=|onload=/gi;
    if (xssPatterns.test(url)) {
      suspicious.push('Possible XSS attempt');
    }
    
    // Check for path traversal
    if (url.includes('../') || url.includes('..\\')) {
      suspicious.push('Possible path traversal attempt');
    }
    
    // Check for command injection
    const cmdPatterns = /[;&|`$()]/g;
    if (cmdPatterns.test(url)) {
      suspicious.push('Possible command injection attempt');
    }
    
    // Check for unusual user agents
    const userAgent = req.headers['user-agent'] || '';
    const botPatterns = /bot|crawler|spider|scraper|curl|wget|python|java/i;
    if (botPatterns.test(userAgent)) {
      suspicious.push('Bot or automated tool detected');
    }
    
    return suspicious.length > 0 ? suspicious : null;
  }

  // Get client IP address
  getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           req.connection.socket?.remoteAddress;
  }

  // Validate API key format
  isValidApiKey(key) {
    // API key should be 32+ characters, alphanumeric with dashes
    return /^[a-zA-Z0-9-]{32,}$/.test(key);
  }

  // Request validation middleware
  validateRequest() {
    return (req, res, next) => {
      // Validate content type
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
          return res.status(400).json({
            error: 'Content-Type must be application/json'
          });
        }
      }
      
      // Validate request ID
      if (!req.headers['x-request-id']) {
        req.headers['x-request-id'] = crypto.randomBytes(16).toString('hex');
      }
      
      next();
    };
  }

  // Honeypot endpoints
  honeypot() {
    return (req, res, next) => {
      const honeypotPaths = [
        '/admin',
        '/wp-admin',
        '/.env',
        '/config',
        '/phpmyadmin'
      ];
      
      if (honeypotPaths.includes(req.path.toLowerCase())) {
        // Log the attempt
        const log = {
          type: 'honeypot_triggered',
          path: req.path,
          ip: this.getClientIp(req),
          timestamp: new Date().toISOString()
        };
        
        if (this.config.securityLogger) {
          this.config.securityLogger.log(log);
        }
        
        // Blacklist the IP
        if (this.config.autoBlacklist) {
          this.config.ipBlacklist = this.config.ipBlacklist || [];
          this.config.ipBlacklist.push(this.getClientIp(req));
        }
        
        // Respond with fake delay
        setTimeout(() => {
          res.status(404).json({
            error: 'Not found'
          });
        }, Math.random() * 5000);
        
        return;
      }
      
      next();
    };
  }
}

module.exports = SecurityMiddleware;