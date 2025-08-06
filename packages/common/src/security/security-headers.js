const helmet = require('helmet');

class SecurityHeaders {
  constructor(config = {}) {
    this.config = {
      csp: config.csp !== false,
      hsts: config.hsts !== false,
      noSniff: config.noSniff !== false,
      xssFilter: config.xssFilter !== false,
      referrerPolicy: config.referrerPolicy || 'strict-origin-when-cross-origin',
      frameOptions: config.frameOptions || 'DENY',
      permissionsPolicy: config.permissionsPolicy !== false,
      ...config
    };
  }

  // Get all security headers middleware
  middleware() {
    const middlewares = [];
    
    // Content Security Policy
    if (this.config.csp) {
      middlewares.push(this.contentSecurityPolicy());
    }
    
    // HTTP Strict Transport Security
    if (this.config.hsts) {
      middlewares.push(helmet.hsts({
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }));
    }
    
    // X-Content-Type-Options
    if (this.config.noSniff) {
      middlewares.push(helmet.noSniff());
    }
    
    // X-XSS-Protection
    if (this.config.xssFilter) {
      middlewares.push(helmet.xssFilter());
    }
    
    // Referrer Policy
    middlewares.push(helmet.referrerPolicy({
      policy: this.config.referrerPolicy
    }));
    
    // X-Frame-Options
    middlewares.push(helmet.frameguard({
      action: this.config.frameOptions.toLowerCase()
    }));
    
    // Permissions Policy
    if (this.config.permissionsPolicy) {
      middlewares.push(this.permissionsPolicy());
    }
    
    // Additional security headers
    middlewares.push(this.additionalHeaders());
    
    return middlewares;
  }

  // Content Security Policy configuration
  contentSecurityPolicy() {
    const directives = {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Consider removing in production
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Consider removing in production
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "blob:"
      ],
      connectSrc: [
        "'self'",
        "wss:",
        "https://api.stripe.com",
        "https://*.google.com",
        "https://*.github.com"
      ],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: this.config.secure ? [] : null,
      blockAllMixedContent: this.config.secure ? [] : null,
      reportUri: this.config.cspReportUri || null
    };
    
    // Remove null values
    Object.keys(directives).forEach(key => {
      if (directives[key] === null) {
        delete directives[key];
      }
    });
    
    return helmet.contentSecurityPolicy({
      directives,
      reportOnly: this.config.cspReportOnly || false
    });
  }

  // Permissions Policy configuration
  permissionsPolicy() {
    return (req, res, next) => {
      const policies = [
        'accelerometer=()',
        'ambient-light-sensor=()',
        'autoplay=(self)',
        'battery=()',
        'camera=()',
        'display-capture=()',
        'document-domain=()',
        'encrypted-media=()',
        'execution-while-not-rendered=()',
        'execution-while-out-of-viewport=()',
        'fullscreen=(self)',
        'geolocation=()',
        'gyroscope=()',
        'layout-animations=()',
        'legacy-image-formats=()',
        'magnetometer=()',
        'microphone=()',
        'midi=()',
        'navigation-override=()',
        'oversized-images=()',
        'payment=()',
        'picture-in-picture=()',
        'publickey-credentials-get=()',
        'sync-xhr=()',
        'usb=()',
        'vr=()',
        'wake-lock=()',
        'screen-wake-lock=()',
        'web-share=()',
        'xr-spatial-tracking=()'
      ];
      
      res.setHeader('Permissions-Policy', policies.join(', '));
      next();
    };
  }

  // Additional security headers
  additionalHeaders() {
    return (req, res, next) => {
      // Prevent browsers from caching sensitive data
      if (req.path.includes('/api/') || req.path.includes('/auth/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      }
      
      // Security headers for API responses
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Download-Options', 'noopen');
      res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      
      // Remove sensitive headers
      res.removeHeader('X-Powered-By');
      res.removeHeader('Server');
      
      // CORS headers for API
      if (req.path.startsWith('/api/')) {
        const origin = req.headers.origin;
        const allowedOrigins = this.config.allowedOrigins || [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://ux-flow-engine.com'
        ];
        
        if (allowedOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
          res.setHeader('Access-Control-Max-Age', '86400');
        }
      }
      
      // Strict Transport Security for HTTPS
      if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }
      
      // Public Key Pinning (optional, requires careful management)
      if (this.config.publicKeyPins) {
        const pins = this.config.publicKeyPins.map(pin => `pin-sha256="${pin}"`).join('; ');
        res.setHeader('Public-Key-Pins', `${pins}; max-age=2592000; includeSubDomains`);
      }
      
      // Expect-CT header for Certificate Transparency
      if (this.config.expectCT) {
        res.setHeader('Expect-CT', 'max-age=86400, enforce');
      }
      
      next();
    };
  }

  // CORS configuration
  corsConfiguration() {
    return {
      origin: (origin, callback) => {
        const allowedOrigins = this.config.allowedOrigins || [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://ux-flow-engine.com'
        ];
        
        // Allow requests with no origin (like mobile apps)
        if (!origin) {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-CSRF-Token',
        'X-Requested-With',
        'Accept',
        'Origin'
      ],
      exposedHeaders: [
        'X-CSRF-Token',
        'X-Request-Id',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ],
      maxAge: 86400,
      preflightContinue: false,
      optionsSuccessStatus: 204
    };
  }

  // Security headers for file uploads
  fileUploadHeaders() {
    return (req, res, next) => {
      if (req.path.includes('/upload') || req.path.includes('/files')) {
        // Prevent execution of uploaded files
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
        
        // Sandbox uploaded content
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        
        // Prevent MIME type sniffing
        res.setHeader('X-Download-Options', 'noopen');
      }
      
      next();
    };
  }

  // API security headers
  apiSecurityHeaders() {
    return (req, res, next) => {
      // Add request ID for tracking
      const requestId = req.headers['x-request-id'] || require('crypto').randomBytes(16).toString('hex');
      res.setHeader('X-Request-Id', requestId);
      
      // Add timestamp
      res.setHeader('X-Response-Time', Date.now());
      
      // Rate limiting headers (if applicable)
      if (req.rateLimit) {
        res.setHeader('X-RateLimit-Limit', req.rateLimit.limit);
        res.setHeader('X-RateLimit-Remaining', req.rateLimit.remaining);
        res.setHeader('X-RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
      }
      
      next();
    };
  }
}

module.exports = SecurityHeaders;