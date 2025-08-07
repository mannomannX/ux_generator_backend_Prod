// ==========================================
// SERVICES/API-GATEWAY/src/middleware/service-auth.js
// ==========================================
import crypto from 'crypto';
import { AuthenticationError } from './error-handler.js';

/**
 * Service-to-service authentication middleware
 */
export class ServiceAuthenticator {
  constructor(logger, redisClient) {
    this.logger = logger;
    this.redisClient = redisClient;
    this.serviceSecrets = new Map();
    this.loadServiceSecrets();
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
      const secretKey = process.env[`${serviceName.toUpperCase().replace('-', '_')}_SECRET`];
      if (secretKey) {
        this.serviceSecrets.set(serviceName, secretKey);
      }
    }
  }

  /**
   * Generate service authentication token
   */
  generateServiceToken(fromService, toService, payload = {}) {
    const secret = this.serviceSecrets.get(fromService);
    if (!secret) {
      throw new Error(`No secret configured for service: ${fromService}`);
    }

    const tokenData = {
      fromService,
      toService,
      payload,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const signature = this.signPayload(JSON.stringify(tokenData), secret);
    
    return {
      token: Buffer.from(JSON.stringify(tokenData)).toString('base64'),
      signature
    };
  }

  /**
   * Verify service authentication token
   */
  async verifyServiceToken(token, signature, expectedFromService) {
    try {
      const tokenData = JSON.parse(Buffer.from(token, 'base64').toString());
      const { fromService, toService, timestamp, nonce } = tokenData;

      // Verify service identity
      if (fromService !== expectedFromService) {
        throw new Error(`Invalid service identity: ${fromService}`);
      }

      // Check timestamp (token valid for 5 minutes)
      const maxAge = 5 * 60 * 1000; // 5 minutes
      if (Date.now() - timestamp > maxAge) {
        throw new Error('Service token expired');
      }

      // Check nonce for replay attack prevention
      const nonceKey = `service:nonce:${fromService}:${nonce}`;
      const usedNonce = await this.redisClient?.get(nonceKey);
      if (usedNonce) {
        throw new Error('Service token already used (replay attack)');
      }

      // Verify signature
      const secret = this.serviceSecrets.get(fromService);
      if (!secret) {
        throw new Error(`No secret configured for service: ${fromService}`);
      }

      const expectedSignature = this.signPayload(JSON.stringify(tokenData), secret);
      if (signature !== expectedSignature) {
        throw new Error('Invalid service token signature');
      }

      // Mark nonce as used
      if (this.redisClient) {
        await this.redisClient.set(nonceKey, '1', 'EX', 600); // 10 minutes
      }

      return tokenData;
    } catch (error) {
      this.logger?.warn('Service token verification failed', {
        error: error.message,
        expectedFromService
      });
      throw new AuthenticationError('Service authentication failed');
    }
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
   * Middleware for service-to-service authentication
   */
  requireServiceAuth(expectedFromService) {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers['x-service-auth'];
        const signatureHeader = req.headers['x-service-signature'];

        if (!authHeader || !signatureHeader) {
          throw new AuthenticationError('Service authentication headers missing');
        }

        const tokenData = await this.verifyServiceToken(
          authHeader,
          signatureHeader,
          expectedFromService
        );

        // Attach service info to request
        req.serviceAuth = {
          fromService: tokenData.fromService,
          toService: tokenData.toService,
          payload: tokenData.payload,
          timestamp: tokenData.timestamp
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
          message: 'Invalid or missing service authentication',
          correlationId: req.correlationId
        });
      }
    };
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
      const { token, signature } = this.authenticator.generateServiceToken(
        this.serviceName,
        targetService,
        { method, path }
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

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
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
        throw new Error(`Service request failed: ${response.status} ${response.statusText}`);
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
}