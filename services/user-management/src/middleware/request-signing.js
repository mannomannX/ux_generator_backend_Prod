/**
 * Request Signing Middleware
 * Ensures integrity and authenticity of critical operations
 */

import crypto from 'crypto';

export class RequestSigner {
  constructor(logger, options = {}) {
    this.logger = logger;
    
    // Configuration
    this.algorithm = options.algorithm || 'sha256';
    this.signatureHeader = options.signatureHeader || 'x-signature';
    this.timestampHeader = options.timestampHeader || 'x-timestamp';
    this.nonceHeader = options.nonceHeader || 'x-nonce';
    this.maxTimeDrift = options.maxTimeDrift || 300000; // 5 minutes
    this.secret = options.secret || process.env.REQUEST_SIGNING_SECRET;
    
    if (!this.secret) {
      throw new Error('Request signing secret is required');
    }
    
    // Nonce storage to prevent replay attacks
    this.nonceCache = new Map();
    this.nonceCleanupInterval = setInterval(() => this.cleanupNonces(), 60000); // Clean every minute
  }

  /**
   * Generate signature for request
   */
  generateSignature(method, path, body, timestamp, nonce) {
    // Create canonical request string
    const canonicalRequest = this.createCanonicalRequest(method, path, body, timestamp, nonce);
    
    // Generate HMAC signature
    const hmac = crypto.createHmac(this.algorithm, this.secret);
    hmac.update(canonicalRequest);
    
    return hmac.digest('hex');
  }

  /**
   * Create canonical request string
   */
  createCanonicalRequest(method, path, body, timestamp, nonce) {
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce
    ];
    
    // Add body hash if present
    if (body && Object.keys(body).length > 0) {
      const bodyString = JSON.stringify(this.sortObject(body));
      const bodyHash = crypto.createHash(this.algorithm).update(bodyString).digest('hex');
      parts.push(bodyHash);
    }
    
    return parts.join('\n');
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  sortObject(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    
    const sorted = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      sorted[key] = this.sortObject(obj[key]);
    }
    
    return sorted;
  }

  /**
   * Middleware to verify request signatures
   */
  verifySignature(options = {}) {
    const { 
      required = true,
      skipPaths = [],
      criticalOnly = false 
    } = options;
    
    return async (req, res, next) => {
      // Skip verification for excluded paths
      if (skipPaths.includes(req.path)) {
        return next();
      }
      
      // Skip non-critical operations if configured
      if (criticalOnly && !this.isCriticalOperation(req)) {
        return next();
      }
      
      // Extract signature headers
      const signature = req.headers[this.signatureHeader];
      const timestamp = req.headers[this.timestampHeader];
      const nonce = req.headers[this.nonceHeader];
      
      // Check if signature is present
      if (!signature || !timestamp || !nonce) {
        if (required) {
          return res.status(401).json({
            error: {
              code: 'MISSING_SIGNATURE',
              message: 'Request signature is required'
            }
          });
        }
        return next();
      }
      
      try {
        // Verify timestamp is within acceptable range
        const requestTime = parseInt(timestamp);
        const currentTime = Date.now();
        
        if (Math.abs(currentTime - requestTime) > this.maxTimeDrift) {
          return res.status(401).json({
            error: {
              code: 'EXPIRED_SIGNATURE',
              message: 'Request signature has expired'
            }
          });
        }
        
        // Check for replay attack
        if (this.nonceCache.has(nonce)) {
          return res.status(401).json({
            error: {
              code: 'DUPLICATE_REQUEST',
              message: 'Duplicate request detected'
            }
          });
        }
        
        // Generate expected signature
        const expectedSignature = this.generateSignature(
          req.method,
          req.originalUrl || req.url,
          req.body,
          timestamp,
          nonce
        );
        
        // Constant-time comparison to prevent timing attacks
        if (!this.secureCompare(signature, expectedSignature)) {
          this.logger.warn('Invalid request signature', {
            path: req.path,
            method: req.method,
            ip: req.ip
          });
          
          return res.status(401).json({
            error: {
              code: 'INVALID_SIGNATURE',
              message: 'Invalid request signature'
            }
          });
        }
        
        // Store nonce to prevent replay
        this.nonceCache.set(nonce, {
          timestamp: requestTime,
          path: req.path
        });
        
        // Add signature info to request
        req.signatureVerified = true;
        req.signatureTimestamp = requestTime;
        
        next();
        
      } catch (error) {
        this.logger.error('Request signature verification failed', error);
        
        if (required) {
          return res.status(500).json({
            error: {
              code: 'SIGNATURE_VERIFICATION_ERROR',
              message: 'Failed to verify request signature'
            }
          });
        }
        
        next();
      }
    };
  }

  /**
   * Middleware to sign responses
   */
  signResponse() {
    return (req, res, next) => {
      // Store original json method
      const originalJson = res.json;
      
      // Override json method
      res.json = function(data) {
        // Generate response signature
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        
        // Create signature for response
        const responseString = JSON.stringify(data);
        const signature = crypto
          .createHmac(this.algorithm, this.secret)
          .update(`${timestamp}\n${nonce}\n${responseString}`)
          .digest('hex');
        
        // Add signature headers
        res.set({
          'X-Response-Signature': signature,
          'X-Response-Timestamp': timestamp,
          'X-Response-Nonce': nonce
        });
        
        // Call original json method
        return originalJson.call(res, data);
      }.bind(this);
      
      next();
    };
  }

  /**
   * Check if operation is critical
   */
  isCriticalOperation(req) {
    const criticalOperations = [
      { method: 'POST', path: /\/auth\/login$/ },
      { method: 'POST', path: /\/auth\/logout$/ },
      { method: 'POST', path: /\/users\/change-password$/ },
      { method: 'DELETE', path: /\/users\/account$/ },
      { method: 'POST', path: /\/api-keys$/ },
      { method: 'DELETE', path: /\/api-keys\/.*$/ },
      { method: 'POST', path: /\/workspaces$/ },
      { method: 'DELETE', path: /\/workspaces\/.*$/ },
      { method: 'PUT', path: /\/users\/.*\/role$/ },
      { method: 'POST', path: /\/auth\/reset-password$/ }
    ];
    
    return criticalOperations.some(op => 
      op.method === req.method && op.path.test(req.path)
    );
  }

  /**
   * Constant-time string comparison
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
   * Clean up old nonces
   */
  cleanupNonces() {
    const now = Date.now();
    const expired = [];
    
    for (const [nonce, data] of this.nonceCache.entries()) {
      if (now - data.timestamp > this.maxTimeDrift) {
        expired.push(nonce);
      }
    }
    
    for (const nonce of expired) {
      this.nonceCache.delete(nonce);
    }
  }

  /**
   * Destroy signer (cleanup)
   */
  destroy() {
    if (this.nonceCleanupInterval) {
      clearInterval(this.nonceCleanupInterval);
    }
    this.nonceCache.clear();
  }
}

/**
 * Client-side request signer for API clients
 */
export class RequestSignerClient {
  constructor(secret, options = {}) {
    this.secret = secret;
    this.algorithm = options.algorithm || 'sha256';
  }

  /**
   * Sign a request
   */
  signRequest(method, url, body = null) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Parse URL to get path
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    
    // Create canonical request
    const parts = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce
    ];
    
    if (body) {
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      const bodyHash = crypto.createHash(this.algorithm).update(bodyString).digest('hex');
      parts.push(bodyHash);
    }
    
    const canonicalRequest = parts.join('\n');
    
    // Generate signature
    const signature = crypto
      .createHmac(this.algorithm, this.secret)
      .update(canonicalRequest)
      .digest('hex');
    
    return {
      headers: {
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce
      }
    };
  }

  /**
   * Verify a response signature
   */
  verifyResponse(responseBody, headers) {
    const signature = headers['x-response-signature'];
    const timestamp = headers['x-response-timestamp'];
    const nonce = headers['x-response-nonce'];
    
    if (!signature || !timestamp || !nonce) {
      return false;
    }
    
    const responseString = typeof responseBody === 'string' 
      ? responseBody 
      : JSON.stringify(responseBody);
    
    const expectedSignature = crypto
      .createHmac(this.algorithm, this.secret)
      .update(`${timestamp}\n${nonce}\n${responseString}`)
      .digest('hex');
    
    return signature === expectedSignature;
  }
}

/**
 * Express middleware factory
 */
export function createRequestSigningMiddleware(logger, options) {
  const signer = new RequestSigner(logger, options);
  return signer.verifySignature(options);
}

export default {
  RequestSigner,
  RequestSignerClient,
  createRequestSigningMiddleware
};