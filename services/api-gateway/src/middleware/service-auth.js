/**
 * Fixed Service-to-Service Authentication with Proper Nonce Handling
 */

import crypto from 'crypto';
import { AuthenticationError } from './error-handler.js';

/**
 * Service-to-service authentication middleware with improved security
 */
export class ServiceAuthenticator {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.serviceSecrets = new Map();
    this.localNonceCache = new Map(); // Fallback for when Redis is unavailable
    this.loadServiceSecrets();
    this.startNonceCleanup();
  }

  loadServiceSecrets() {
    // Load service secrets from environment or secure storage
    const services = [
      'flow-service',
      'cognitive-core',
      'knowledge-service',
      'user-management',
      'billing-service'
    ];

    for (const serviceName of services) {
      const envKey = `${serviceName.toUpperCase().replace('-', '_')}_SECRET`;
      const secretKey = process.env[envKey];
      
      if (secretKey) {
        // Validate secret strength
        if (secretKey.length < 32) {
          this.logger.warn(`Weak secret for service ${serviceName} - should be at least 32 characters`);
        }
        this.serviceSecrets.set(serviceName, secretKey);
      } else {
        // Generate a default secret for development (not for production!)
        if (process.env.NODE_ENV !== 'production') {
          const defaultSecret = crypto.randomBytes(32).toString('hex');
          this.serviceSecrets.set(serviceName, defaultSecret);
          this.logger.warn(`Generated temporary secret for ${serviceName} (development only)`);
        } else {
          this.logger.error(`No secret configured for service: ${serviceName}`);
        }
      }
    }
  }

  /**
   * Generate service authentication token with body signature
   */
  generateServiceToken(fromService, toService, payload = {}, requestBody = null) {
    const secret = this.serviceSecrets.get(fromService);
    if (!secret) {
      throw new Error(`No secret configured for service: ${fromService}`);
    }

    const tokenData = {
      fromService,
      toService,
      payload,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
      version: '2.0' // Version for compatibility
    };

    // Add body hash if request body is provided
    if (requestBody !== null) {
      const bodyString = typeof requestBody === 'string' 
        ? requestBody 
        : JSON.stringify(requestBody);
      tokenData.bodyHash = crypto
        .createHash('sha256')
        .update(bodyString)
        .digest('hex');
    }

    const signature = this.signPayload(JSON.stringify(tokenData), secret);
    
    return {
      token: Buffer.from(JSON.stringify(tokenData)).toString('base64'),
      signature,
      bodyHash: tokenData.bodyHash
    };
  }

  /**
   * Verify service authentication token with enhanced security
   */
  async verifyServiceToken(token, signature, expectedFromService, requestBody = null) {
    try {
      // Decode token
      const tokenData = JSON.parse(Buffer.from(token, 'base64').toString());
      const { fromService, toService, timestamp, nonce, bodyHash, version } = tokenData;

      // Verify service identity
      if (fromService !== expectedFromService) {
        throw new Error(`Invalid service identity: expected ${expectedFromService}, got ${fromService}`);
      }

      // Check timestamp (token valid for 5 minutes)
      const maxAge = 5 * 60 * 1000; // 5 minutes
      const tokenAge = Date.now() - timestamp;
      if (tokenAge > maxAge) {
        throw new Error(`Service token expired (age: ${Math.floor(tokenAge / 1000)}s)`);
      }

      // Check for future timestamps (clock skew tolerance: 30 seconds)
      if (tokenAge < -30000) {
        throw new Error('Service token timestamp is in the future (clock skew?)');
      }

      // Verify body hash if present
      if (bodyHash && requestBody !== null) {
        const actualBodyHash = crypto
          .createHash('sha256')
          .update(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody))
          .digest('hex');
        
        if (bodyHash !== actualBodyHash) {
          throw new Error('Request body has been tampered with');
        }
      }

      // Check nonce for replay attack prevention
      const isReplay = await this.checkNonce(fromService, nonce);
      if (isReplay) {
        throw new Error('Service token already used (replay attack detected)');
      }

      // Verify signature
      const secret = this.serviceSecrets.get(fromService);
      if (!secret) {
        throw new Error(`No secret configured for service: ${fromService}`);
      }

      const expectedSignature = this.signPayload(JSON.stringify(tokenData), secret);
      
      // Constant-time comparison to prevent timing attacks
      if (!this.secureCompare(signature, expectedSignature)) {
        throw new Error('Invalid service token signature');
      }

      // Mark nonce as used
      await this.markNonceAsUsed(fromService, nonce, maxAge);

      return tokenData;
    } catch (error) {
      this.logger?.warn('Service token verification failed', {
        error: error.message,
        expectedFromService
      });
      throw new AuthenticationError(`Service authentication failed: ${error.message}`);
    }
  }

  /**
   * Check if nonce has been used (with Redis fallback)
   */
  async checkNonce(serviceName, nonce) {
    const nonceKey = `service:nonce:${serviceName}:${nonce}`;
    
    // Try Redis first
    if (this.redisClient) {
      try {
        const exists = await this.redisClient.exists(nonceKey);
        return exists > 0;
      } catch (error) {
        this.logger.warn('Redis unavailable for nonce check, using local cache', error.message);
      }
    }
    
    // Fallback to local cache
    const localKey = `${serviceName}:${nonce}`;
    return this.localNonceCache.has(localKey);
  }

  /**
   * Mark nonce as used (with Redis fallback)
   */
  async markNonceAsUsed(serviceName, nonce, maxAge) {
    const nonceKey = `service:nonce:${serviceName}:${nonce}`;
    const ttl = Math.ceil(maxAge / 1000) + 60; // Add buffer
    
    // Try Redis first
    if (this.redisClient) {
      try {
        await this.redisClient.set(nonceKey, '1', 'EX', ttl);
        return;
      } catch (error) {
        this.logger.warn('Redis unavailable for nonce storage, using local cache', error.message);
      }
    }
    
    // Fallback to local cache
    const localKey = `${serviceName}:${nonce}`;
    const expiry = Date.now() + (ttl * 1000);
    this.localNonceCache.set(localKey, expiry);
  }

  /**
   * Clean up expired nonces from local cache
   */
  cleanupLocalNonces() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, expiry] of this.localNonceCache.entries()) {
      if (expiry < now) {
        expired.push(key);
      }
    }
    
    for (const key of expired) {
      this.localNonceCache.delete(key);
    }
    
    if (expired.length > 0) {
      this.logger.debug(`Cleaned up ${expired.length} expired nonces from local cache`);
    }
  }

  /**
   * Start periodic nonce cleanup
   */
  startNonceCleanup() {
    // Clean up local nonces every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupLocalNonces();
    }, 60000);
  }

  /**
   * Sign payload with HMAC
   */
  signPayload(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  secureCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Middleware for service-to-service authentication
   */
  requireServiceAuth(expectedFromService, options = {}) {
    const { requireBodyVerification = false } = options;
    
    return async (req, res, next) => {
      try {
        const authHeader = req.headers['x-service-auth'];
        const signatureHeader = req.headers['x-service-signature'];

        if (!authHeader || !signatureHeader) {
          throw new AuthenticationError('Service authentication headers missing');
        }

        // Get request body for verification if required
        let requestBody = null;
        if (requireBodyVerification && req.body) {
          requestBody = req.body;
        }

        const tokenData = await this.verifyServiceToken(
          authHeader,
          signatureHeader,
          expectedFromService,
          requestBody
        );

        // Attach service info to request
        req.serviceAuth = {
          fromService: tokenData.fromService,
          toService: tokenData.toService,
          payload: tokenData.payload,
          timestamp: tokenData.timestamp,
          version: tokenData.version
        };

        this.logger?.info('Service authenticated', {
          fromService: tokenData.fromService,
          toService: tokenData.toService,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        this.logger?.error('Service authentication failed', {
          error: error.message,
          expectedFromService,
          correlationId: req.correlationId
        });

        res.status(401).json({
          error: 'Service authentication failed',
          message: error.message,
          correlationId: req.correlationId
        });
      }
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.localNonceCache.clear();
  }
}

/**
 * HTTP client for making authenticated service-to-service calls
 */
export class ServiceClient {
  constructor(serviceName, authenticator, logger) {
    this.serviceName = serviceName;
    this.authenticator = authenticator;
    this.logger = logger;
    this.serviceUrls = new Map([
      ['flow-service', process.env.FLOW_SERVICE_URL || 'http://localhost:3002'],
      ['cognitive-core', process.env.COGNITIVE_CORE_URL || 'http://localhost:3001'],
      ['knowledge-service', process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:3005'],
      ['user-management', process.env.USER_MANAGEMENT_URL || 'http://localhost:3004'],
      ['billing-service', process.env.BILLING_SERVICE_URL || 'http://localhost:3006']
    ]);
  }

  /**
   * Make authenticated HTTP request to another service
   */
  async request(targetService, method, path, data = null, options = {}) {
    const url = `${this.serviceUrls.get(targetService)}${path}`;
    
    try {
      // Generate token with body signature for write operations
      const includeBodySignature = data && ['POST', 'PUT', 'PATCH'].includes(method);
      const { token, signature } = this.authenticator.generateServiceToken(
        this.serviceName,
        targetService,
        { method, path },
        includeBodySignature ? data : null
      );

      const headers = {
        'Content-Type': 'application/json',
        'X-Service-Auth': token,
        'X-Service-Signature': signature,
        'X-Request-ID': options.correlationId || crypto.randomBytes(8).toString('hex'),
        ...options.headers
      };

      const requestOptions = {
        method,
        headers,
        timeout: options.timeout || 30000
      };

      if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
        requestOptions.body = JSON.stringify(data);
      }

      this.logger?.debug('Making service request', {
        fromService: this.serviceName,
        toService: targetService,
        method,
        path,
        correlationId: options.correlationId
      });

      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Service request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const responseData = await response.json();
      
      this.logger?.debug('Service request successful', {
        fromService: this.serviceName,
        toService: targetService,
        method,
        path,
        status: response.status,
        correlationId: options.correlationId
      });

      return responseData;
    } catch (error) {
      this.logger?.error('Service request failed', {
        fromService: this.serviceName,
        toService: targetService,
        method,
        path,
        error: error.message,
        correlationId: options.correlationId
      });
      throw error;
    }
  }

  /**
   * Convenience methods for common HTTP operations
   */
  async get(targetService, path, options = {}) {
    return this.request(targetService, 'GET', path, null, options);
  }

  async post(targetService, path, data, options = {}) {
    return this.request(targetService, 'POST', path, data, options);
  }

  async put(targetService, path, data, options = {}) {
    return this.request(targetService, 'PUT', path, data, options);
  }

  async patch(targetService, path, data, options = {}) {
    return this.request(targetService, 'PATCH', path, data, options);
  }

  async delete(targetService, path, options = {}) {
    return this.request(targetService, 'DELETE', path, null, options);
  }

  /**
   * Health check for a service
   */
  async healthCheck(targetService) {
    try {
      const response = await this.get(targetService, '/health', { timeout: 5000 });
      return { healthy: true, ...response };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}

export default {
  ServiceAuthenticator,
  ServiceClient
};