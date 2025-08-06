const crypto = require('crypto');

class ConsentManager {
  constructor(config = {}) {
    this.config = {
      consentTypes: config.consentTypes || [
        'necessary',
        'functional',
        'analytics',
        'marketing',
        'third_party'
      ],
      defaultConsents: config.defaultConsents || {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
        third_party: false
      },
      consentVersion: config.consentVersion || '1.0.0',
      cookieMaxAge: config.cookieMaxAge || 365 * 24 * 60 * 60 * 1000, // 1 year
      ...config
    };
    
    this.consents = new Map();
  }

  // Create consent record
  createConsentRecord(userId, consents, metadata = {}) {
    const record = {
      id: crypto.randomBytes(16).toString('hex'),
      userId,
      version: this.config.consentVersion,
      timestamp: new Date().toISOString(),
      consents: this.validateConsents(consents),
      metadata: {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        source: metadata.source || 'web',
        language: metadata.language || 'en',
        ...metadata
      },
      status: 'active',
      history: []
    };
    
    this.consents.set(userId, record);
    
    return record;
  }

  // Update consent
  updateConsent(userId, updates, metadata = {}) {
    const existing = this.consents.get(userId);
    
    if (!existing) {
      return this.createConsentRecord(userId, updates, metadata);
    }
    
    // Archive current state to history
    const historicalRecord = {
      timestamp: existing.timestamp,
      consents: { ...existing.consents },
      metadata: { ...existing.metadata }
    };
    
    existing.history.push(historicalRecord);
    
    // Update consent
    existing.timestamp = new Date().toISOString();
    existing.consents = {
      ...existing.consents,
      ...this.validateConsents(updates)
    };
    existing.metadata = {
      ...existing.metadata,
      ...metadata,
      lastUpdated: new Date().toISOString()
    };
    
    this.consents.set(userId, existing);
    
    return existing;
  }

  // Withdraw consent
  withdrawConsent(userId, consentTypes = null) {
    const existing = this.consents.get(userId);
    
    if (!existing) {
      throw new Error('No consent record found');
    }
    
    const withdrawal = {
      timestamp: new Date().toISOString(),
      types: consentTypes || Object.keys(existing.consents),
      previousConsents: { ...existing.consents }
    };
    
    if (consentTypes) {
      // Withdraw specific consents
      consentTypes.forEach(type => {
        if (type !== 'necessary') {
          existing.consents[type] = false;
        }
      });
    } else {
      // Withdraw all non-necessary consents
      Object.keys(existing.consents).forEach(type => {
        if (type !== 'necessary') {
          existing.consents[type] = false;
        }
      });
    }
    
    existing.withdrawals = existing.withdrawals || [];
    existing.withdrawals.push(withdrawal);
    existing.timestamp = new Date().toISOString();
    
    this.consents.set(userId, existing);
    
    return existing;
  }

  // Get consent record
  getConsentRecord(userId) {
    return this.consents.get(userId);
  }

  // Validate consents
  validateConsents(consents) {
    const validated = {};
    
    this.config.consentTypes.forEach(type => {
      if (consents[type] !== undefined) {
        validated[type] = Boolean(consents[type]);
      } else {
        validated[type] = this.config.defaultConsents[type] || false;
      }
    });
    
    // Necessary consent is always true
    validated.necessary = true;
    
    return validated;
  }

  // Check if user has given consent
  hasConsent(userId, consentType) {
    const record = this.consents.get(userId);
    
    if (!record) {
      return this.config.defaultConsents[consentType] || false;
    }
    
    return record.consents[consentType] || false;
  }

  // Get consent proof
  getConsentProof(userId) {
    const record = this.consents.get(userId);
    
    if (!record) {
      return null;
    }
    
    // Generate cryptographic proof
    const proof = {
      recordId: record.id,
      userId: record.userId,
      timestamp: record.timestamp,
      consents: record.consents,
      hash: this.generateConsentHash(record),
      signature: this.signConsentRecord(record)
    };
    
    return proof;
  }

  // Generate consent hash
  generateConsentHash(record) {
    const data = JSON.stringify({
      id: record.id,
      userId: record.userId,
      timestamp: record.timestamp,
      consents: record.consents
    });
    
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Sign consent record
  signConsentRecord(record) {
    // In production, use proper key management
    const privateKey = this.config.signingKey || 'default-signing-key';
    
    const data = this.generateConsentHash(record);
    const signature = crypto.createHmac('sha256', privateKey)
      .update(data)
      .digest('hex');
    
    return signature;
  }

  // Verify consent signature
  verifyConsentSignature(record, signature) {
    const expectedSignature = this.signConsentRecord(record);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Export consent records
  exportConsentRecords(userId = null) {
    if (userId) {
      const record = this.consents.get(userId);
      return record ? [record] : [];
    }
    
    return Array.from(this.consents.values());
  }

  // Generate consent cookie
  generateConsentCookie(consents) {
    const cookie = {
      version: this.config.consentVersion,
      consents: this.validateConsents(consents),
      timestamp: Date.now()
    };
    
    const encoded = Buffer.from(JSON.stringify(cookie)).toString('base64');
    
    return {
      name: 'gdpr_consent',
      value: encoded,
      options: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: this.config.cookieMaxAge,
        path: '/'
      }
    };
  }

  // Parse consent cookie
  parseConsentCookie(cookieValue) {
    try {
      const decoded = Buffer.from(cookieValue, 'base64').toString('utf8');
      const cookie = JSON.parse(decoded);
      
      // Validate cookie structure
      if (!cookie.version || !cookie.consents || !cookie.timestamp) {
        return null;
      }
      
      // Check if cookie is expired
      const age = Date.now() - cookie.timestamp;
      if (age > this.config.cookieMaxAge) {
        return null;
      }
      
      return cookie;
    } catch (error) {
      return null;
    }
  }

  // Generate consent banner data
  generateConsentBanner(userId = null) {
    const existingConsent = userId ? this.consents.get(userId) : null;
    
    return {
      version: this.config.consentVersion,
      categories: this.config.consentTypes.map(type => ({
        id: type,
        name: this.getConsentTypeName(type),
        description: this.getConsentTypeDescription(type),
        required: type === 'necessary',
        enabled: existingConsent ? 
          existingConsent.consents[type] : 
          this.config.defaultConsents[type]
      })),
      privacyPolicyUrl: this.config.privacyPolicyUrl || '/privacy',
      cookiePolicyUrl: this.config.cookiePolicyUrl || '/cookies',
      contactEmail: this.config.contactEmail || 'privacy@example.com'
    };
  }

  // Get consent type name
  getConsentTypeName(type) {
    const names = {
      necessary: 'Necessary Cookies',
      functional: 'Functional Cookies',
      analytics: 'Analytics Cookies',
      marketing: 'Marketing Cookies',
      third_party: 'Third-Party Cookies'
    };
    
    return names[type] || type;
  }

  // Get consent type description
  getConsentTypeDescription(type) {
    const descriptions = {
      necessary: 'Essential for the website to function properly. Cannot be disabled.',
      functional: 'Enable enhanced functionality and personalization.',
      analytics: 'Help us understand how visitors interact with our website.',
      marketing: 'Used to deliver personalized advertisements.',
      third_party: 'Set by third-party services integrated into our website.'
    };
    
    return descriptions[type] || '';
  }

  // Consent middleware for Express
  middleware() {
    return (req, res, next) => {
      // Parse consent from cookie
      const consentCookie = req.cookies?.gdpr_consent;
      
      if (consentCookie) {
        const parsed = this.parseConsentCookie(consentCookie);
        if (parsed) {
          req.gdprConsent = parsed.consents;
        }
      }
      
      // Add consent helpers to response
      res.locals.hasConsent = (type) => {
        return req.gdprConsent ? req.gdprConsent[type] : false;
      };
      
      res.locals.requireConsent = (type) => {
        if (!res.locals.hasConsent(type)) {
          res.status(403).json({
            error: 'Consent required',
            consentType: type,
            message: `User consent for ${type} is required for this operation`
          });
          return false;
        }
        return true;
      };
      
      next();
    };
  }

  // Audit log for consent changes
  createAuditLog(userId, action, details) {
    const log = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      details,
      hash: crypto.randomBytes(16).toString('hex')
    };
    
    // In production, store this in a database
    console.log('[CONSENT AUDIT]', log);
    
    return log;
  }

  // Statistics and reporting
  getConsentStatistics() {
    const stats = {
      totalRecords: this.consents.size,
      byType: {},
      bySource: {},
      recentUpdates: [],
      withdrawals: []
    };
    
    // Calculate statistics
    this.consents.forEach(record => {
      // Count by consent type
      Object.entries(record.consents).forEach(([type, granted]) => {
        if (!stats.byType[type]) {
          stats.byType[type] = { granted: 0, denied: 0 };
        }
        stats.byType[type][granted ? 'granted' : 'denied']++;
      });
      
      // Count by source
      const source = record.metadata.source || 'unknown';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;
      
      // Track recent updates
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (new Date(record.timestamp).getTime() > dayAgo) {
        stats.recentUpdates.push({
          userId: record.userId,
          timestamp: record.timestamp
        });
      }
      
      // Track withdrawals
      if (record.withdrawals && record.withdrawals.length > 0) {
        stats.withdrawals.push({
          userId: record.userId,
          count: record.withdrawals.length,
          latest: record.withdrawals[record.withdrawals.length - 1].timestamp
        });
      }
    });
    
    return stats;
  }

  // Clean up expired records
  cleanupExpiredRecords(retentionDays = 730) {
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const expired = [];
    
    this.consents.forEach((record, userId) => {
      const timestamp = new Date(record.timestamp).getTime();
      if (timestamp < cutoff) {
        expired.push(userId);
      }
    });
    
    expired.forEach(userId => {
      this.consents.delete(userId);
    });
    
    return expired.length;
  }
}

module.exports = ConsentManager;