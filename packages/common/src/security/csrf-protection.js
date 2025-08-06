const crypto = require('crypto');

class CSRFProtection {
  constructor(config = {}) {
    this.config = {
      secretLength: config.secretLength || 32,
      tokenLength: config.tokenLength || 32,
      cookieName: config.cookieName || '_csrf',
      headerName: config.headerName || 'x-csrf-token',
      paramName: config.paramName || '_csrf',
      sessionKey: config.sessionKey || 'csrfSecret',
      skipMethods: config.skipMethods || ['GET', 'HEAD', 'OPTIONS'],
      sameSite: config.sameSite || 'strict',
      secure: config.secure !== false,
      httpOnly: config.httpOnly !== false,
      maxAge: config.maxAge || 86400000, // 24 hours
      ...config
    };
    
    this.tokens = new Map();
  }

  // Generate a new CSRF token
  generateToken(sessionId) {
    const secret = crypto.randomBytes(this.config.secretLength).toString('hex');
    const token = crypto.randomBytes(this.config.tokenLength).toString('hex');
    
    // Create hash of secret + token
    const hash = crypto
      .createHmac('sha256', secret)
      .update(token)
      .digest('hex');
    
    // Store token with session
    this.tokens.set(sessionId, {
      secret,
      token,
      hash,
      createdAt: Date.now(),
      lastUsed: Date.now()
    });
    
    // Clean up old tokens
    this.cleanupTokens();
    
    return token;
  }

  // Verify CSRF token
  verifyToken(sessionId, providedToken) {
    const tokenData = this.tokens.get(sessionId);
    
    if (!tokenData) {
      return false;
    }
    
    // Check if token has expired
    const now = Date.now();
    if (now - tokenData.createdAt > this.config.maxAge) {
      this.tokens.delete(sessionId);
      return false;
    }
    
    // Verify token using constant-time comparison
    const expectedHash = crypto
      .createHmac('sha256', tokenData.secret)
      .update(providedToken)
      .digest('hex');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(tokenData.hash),
      Buffer.from(expectedHash)
    );
    
    if (isValid) {
      // Update last used time
      tokenData.lastUsed = now;
      this.tokens.set(sessionId, tokenData);
    }
    
    return isValid;
  }

  // Express middleware
  middleware() {
    return (req, res, next) => {
      // Skip CSRF for safe methods
      if (this.config.skipMethods.includes(req.method)) {
        return next();
      }
      
      // Get session ID
      const sessionId = req.session?.id || req.cookies?.sessionId;
      
      if (!sessionId) {
        return res.status(403).json({
          error: 'No session found'
        });
      }
      
      // Get token from request
      const token = this.getTokenFromRequest(req);
      
      if (!token) {
        return res.status(403).json({
          error: 'CSRF token missing'
        });
      }
      
      // Verify token
      if (!this.verifyToken(sessionId, token)) {
        return res.status(403).json({
          error: 'Invalid CSRF token'
        });
      }
      
      // Generate new token for response
      const newToken = this.generateToken(sessionId);
      
      // Set token in response header
      res.setHeader(this.config.headerName, newToken);
      
      // Set token in cookie
      res.cookie(this.config.cookieName, newToken, {
        httpOnly: this.config.httpOnly,
        secure: this.config.secure,
        sameSite: this.config.sameSite,
        maxAge: this.config.maxAge
      });
      
      next();
    };
  }

  // Get token from request
  getTokenFromRequest(req) {
    // Check header
    let token = req.headers[this.config.headerName];
    
    // Check body
    if (!token && req.body) {
      token = req.body[this.config.paramName];
    }
    
    // Check query
    if (!token && req.query) {
      token = req.query[this.config.paramName];
    }
    
    // Check cookie
    if (!token && req.cookies) {
      token = req.cookies[this.config.cookieName];
    }
    
    return token;
  }

  // Clean up expired tokens
  cleanupTokens() {
    const now = Date.now();
    const expired = [];
    
    for (const [sessionId, tokenData] of this.tokens.entries()) {
      if (now - tokenData.createdAt > this.config.maxAge) {
        expired.push(sessionId);
      }
    }
    
    expired.forEach(sessionId => this.tokens.delete(sessionId));
  }

  // Double submit cookie pattern
  doubleSubmitCookie() {
    return (req, res, next) => {
      // Skip CSRF for safe methods
      if (this.config.skipMethods.includes(req.method)) {
        return next();
      }
      
      const cookieToken = req.cookies[this.config.cookieName];
      const headerToken = req.headers[this.config.headerName];
      
      if (!cookieToken || !headerToken) {
        return res.status(403).json({
          error: 'CSRF token missing'
        });
      }
      
      // Constant-time comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(cookieToken),
        Buffer.from(headerToken)
      );
      
      if (!isValid) {
        return res.status(403).json({
          error: 'CSRF token mismatch'
        });
      }
      
      next();
    };
  }

  // Synchronizer token pattern
  synchronizerToken() {
    return (req, res, next) => {
      // Generate token for GET requests
      if (req.method === 'GET') {
        const sessionId = req.session?.id || req.cookies?.sessionId;
        
        if (sessionId) {
          const token = this.generateToken(sessionId);
          res.locals.csrfToken = token;
        }
        
        return next();
      }
      
      // Verify token for state-changing requests
      if (!this.config.skipMethods.includes(req.method)) {
        const sessionId = req.session?.id || req.cookies?.sessionId;
        const token = this.getTokenFromRequest(req);
        
        if (!sessionId || !token || !this.verifyToken(sessionId, token)) {
          return res.status(403).json({
            error: 'Invalid CSRF token'
          });
        }
      }
      
      next();
    };
  }

  // Origin header verification
  verifyOrigin() {
    return (req, res, next) => {
      // Skip for safe methods
      if (this.config.skipMethods.includes(req.method)) {
        return next();
      }
      
      const origin = req.headers.origin || req.headers.referer;
      
      if (!origin) {
        return res.status(403).json({
          error: 'Origin header missing'
        });
      }
      
      const allowedOrigins = this.config.allowedOrigins || [
        `https://${req.hostname}`,
        `http://${req.hostname}`
      ];
      
      const url = new URL(origin);
      const isAllowed = allowedOrigins.some(allowed => {
        const allowedUrl = new URL(allowed);
        return url.protocol === allowedUrl.protocol &&
               url.hostname === allowedUrl.hostname &&
               url.port === allowedUrl.port;
      });
      
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Origin not allowed'
        });
      }
      
      next();
    };
  }

  // SameSite cookie configuration
  configureSameSiteCookie() {
    return (req, res, next) => {
      // Set SameSite cookie for session
      if (req.session) {
        res.cookie('sessionId', req.session.id, {
          httpOnly: true,
          secure: this.config.secure,
          sameSite: this.config.sameSite,
          maxAge: this.config.maxAge
        });
      }
      
      next();
    };
  }
}

module.exports = CSRFProtection;