// ==========================================
// SERVICES/FLOW-SERVICE/src/middleware/authentication.js
// JWT-based authentication middleware
// ==========================================

import jwt from 'jsonwebtoken';
import { Logger } from '@ux-flow/common';

class AuthenticationMiddleware {
  constructor(logger = new Logger('AuthMiddleware'), mongoClient = null) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // JWT configuration
    this.jwtSecret = process.env.JWT_SECRET;
    this.jwtAlgorithm = 'HS256';
    this.jwtIssuer = 'ux-flow-engine';
    
    // Service token configuration
    this.serviceSecret = process.env.SERVICE_AUTH_SECRET;
    this.allowedServices = new Set([
      'api-gateway',
      'cognitive-core',
      'knowledge-service',
      'user-management',
      'billing-service',
    ]);
    
    if (!this.jwtSecret) {
      this.logger.error('JWT_SECRET not configured - authentication will fail');
    }
  }
  
  /**
   * Authenticate user requests with JWT
   */
  authenticateUser() {
    return async (req, res, next) => {
      try {
        // Extract token from header
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') 
          ? authHeader.substring(7) 
          : req.headers['x-auth-token'];
        
        if (!token) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'No authentication token provided',
            correlationId: req.correlationId,
          });
        }
        
        // Verify JWT token
        let decoded;
        try {
          decoded = jwt.verify(token, this.jwtSecret, {
            algorithms: [this.jwtAlgorithm],
            issuer: this.jwtIssuer,
          });
        } catch (jwtError) {
          if (jwtError.name === 'TokenExpiredError') {
            return res.status(401).json({
              error: 'Token expired',
              message: 'Authentication token has expired',
              correlationId: req.correlationId,
            });
          }
          
          return res.status(401).json({
            error: 'Invalid token',
            message: 'Authentication token is invalid',
            correlationId: req.correlationId,
          });
        }
        
        // Verify user still exists and is active
        if (this.mongoClient) {
          const user = await this.verifyUserActive(decoded.sub || decoded.userId);
          if (!user) {
            return res.status(401).json({
              error: 'User not found',
              message: 'User account no longer exists or is inactive',
              correlationId: req.correlationId,
            });
          }
        }
        
        // Set user context in request
        req.user = {
          id: decoded.sub || decoded.userId,
          email: decoded.email,
          workspaceId: decoded.workspaceId,
          role: decoded.role || 'user',
          permissions: decoded.permissions || [],
        };
        
        // Log successful authentication
        this.logger.debug('User authenticated', {
          userId: req.user.id,
          correlationId: req.correlationId,
        });
        
        next();
      } catch (error) {
        this.logger.error('Authentication error', error);
        
        res.status(500).json({
          error: 'Authentication failed',
          message: 'An error occurred during authentication',
          correlationId: req.correlationId,
        });
      }
    };
  }
  
  /**
   * Authenticate service-to-service requests
   */
  authenticateService() {
    return async (req, res, next) => {
      try {
        // Check for service token
        const serviceToken = req.headers['x-service-token'];
        const serviceName = req.headers['x-service-name'];
        
        if (!serviceToken || !serviceName) {
          // Not a service request, try user authentication
          return this.authenticateUser()(req, res, next);
        }
        
        // Verify service token
        if (!this.serviceSecret) {
          this.logger.error('SERVICE_AUTH_SECRET not configured');
          return res.status(500).json({
            error: 'Service authentication not configured',
            correlationId: req.correlationId,
          });
        }
        
        let decoded;
        try {
          decoded = jwt.verify(serviceToken, this.serviceSecret, {
            algorithms: ['HS256'],
            issuer: 'ux-flow-engine',
          });
        } catch (jwtError) {
          return res.status(401).json({
            error: 'Invalid service token',
            message: 'Service authentication failed',
            correlationId: req.correlationId,
          });
        }
        
        // Verify service is allowed
        if (!this.allowedServices.has(serviceName)) {
          return res.status(403).json({
            error: 'Service not authorized',
            message: `Service ${serviceName} is not authorized to access this resource`,
            correlationId: req.correlationId,
          });
        }
        
        // Verify token is for this service
        if (decoded.target && decoded.target !== 'flow-service') {
          return res.status(403).json({
            error: 'Token not valid for this service',
            correlationId: req.correlationId,
          });
        }
        
        // Set service context in request
        req.service = {
          name: serviceName,
          authenticated: true,
          permissions: decoded.permissions || ['*'],
        };
        
        // For service requests, set a system user context
        req.user = {
          id: 'system',
          email: `${serviceName}@system`,
          workspaceId: decoded.workspaceId || 'system',
          role: 'service',
          permissions: ['*'],
        };
        
        this.logger.debug('Service authenticated', {
          serviceName,
          correlationId: req.correlationId,
        });
        
        next();
      } catch (error) {
        this.logger.error('Service authentication error', error);
        
        res.status(500).json({
          error: 'Service authentication failed',
          message: 'An error occurred during service authentication',
          correlationId: req.correlationId,
        });
      }
    };
  }
  
  /**
   * Optional authentication - doesn't fail if no token
   */
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') 
          ? authHeader.substring(7) 
          : req.headers['x-auth-token'];
        
        if (!token) {
          // No token, continue without user context
          req.user = null;
          return next();
        }
        
        // Try to verify token
        try {
          const decoded = jwt.verify(token, this.jwtSecret, {
            algorithms: [this.jwtAlgorithm],
            issuer: this.jwtIssuer,
          });
          
          req.user = {
            id: decoded.sub || decoded.userId,
            email: decoded.email,
            workspaceId: decoded.workspaceId,
            role: decoded.role || 'user',
            permissions: decoded.permissions || [],
          };
        } catch (jwtError) {
          // Invalid token, continue without user context
          req.user = null;
        }
        
        next();
      } catch (error) {
        // Error in optional auth, continue without user context
        req.user = null;
        next();
      }
    };
  }
  
  /**
   * Verify user is still active in database
   */
  async verifyUserActive(userId) {
    if (!this.mongoClient) {
      // Can't verify without database connection
      return true;
    }
    
    try {
      const db = this.mongoClient.getDb();
      const user = await db.collection('users').findOne({
        _id: this.mongoClient.createObjectId(userId),
        status: 'active',
      });
      
      return !!user;
    } catch (error) {
      this.logger.error('Failed to verify user status', error);
      // Fail open - allow if we can't verify
      return true;
    }
  }
  
  /**
   * Generate service token for outbound requests
   */
  generateServiceToken(targetService, workspaceId = null) {
    if (!this.serviceSecret) {
      throw new Error('SERVICE_AUTH_SECRET not configured');
    }
    
    const payload = {
      sub: 'flow-service',
      target: targetService,
      workspaceId,
      permissions: ['flow.read', 'flow.write'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    
    return jwt.sign(payload, this.serviceSecret, {
      algorithm: 'HS256',
      issuer: 'ux-flow-engine',
    });
  }
  
  /**
   * Create auth headers for service requests
   */
  getServiceAuthHeaders(targetService) {
    return {
      'X-Service-Token': this.generateServiceToken(targetService),
      'X-Service-Name': 'flow-service',
    };
  }
}

export { AuthenticationMiddleware };