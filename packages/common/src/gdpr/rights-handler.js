const crypto = require('crypto');

class RightsHandler {
  constructor(config = {}) {
    this.config = {
      responseTimeLimit: config.responseTimeLimit || 30 * 24 * 60 * 60 * 1000, // 30 days
      verificationRequired: config.verificationRequired !== false,
      exportFormats: config.exportFormats || ['json', 'csv', 'pdf'],
      dataStores: config.dataStores || [],
      ...config
    };
    
    this.requests = new Map();
  }

  // Handle data access request (GDPR Article 15)
  async handleAccessRequest(userId, requestDetails) {
    const request = this.createRequest('access', userId, requestDetails);
    
    // Verify user identity if required
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, requestDetails.verificationData);
    }
    
    // Collect all personal data
    const personalData = await this.collectPersonalData(userId);
    
    // Generate response
    const response = {
      requestId: request.id,
      userId,
      timestamp: new Date().toISOString(),
      dataCategories: this.categorizeData(personalData),
      purposes: await this.getProcessingPurposes(userId),
      recipients: await this.getDataRecipients(userId),
      retentionPeriods: await this.getRetentionPeriods(userId),
      rights: this.getUserRights(),
      data: personalData
    };
    
    request.status = 'completed';
    request.response = response;
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return response;
  }

  // Handle rectification request (GDPR Article 16)
  async handleRectificationRequest(userId, corrections) {
    const request = this.createRequest('rectification', userId, { corrections });
    
    // Verify user identity
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, corrections.verificationData);
    }
    
    const results = [];
    
    // Apply corrections
    for (const correction of corrections.items) {
      try {
        const result = await this.applyCorrection(userId, correction);
        results.push({
          field: correction.field,
          oldValue: result.oldValue,
          newValue: correction.newValue,
          status: 'corrected',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        results.push({
          field: correction.field,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    request.status = 'completed';
    request.results = results;
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return results;
  }

  // Handle erasure request (GDPR Article 17 - Right to be forgotten)
  async handleErasureRequest(userId, requestDetails) {
    const request = this.createRequest('erasure', userId, requestDetails);
    
    // Verify user identity
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, requestDetails.verificationData);
    }
    
    // Check for legal obligations to retain data
    const retentionCheck = await this.checkLegalRetention(userId);
    if (retentionCheck.mustRetain) {
      request.status = 'rejected';
      request.reason = retentionCheck.reason;
      this.requests.set(request.id, request);
      
      throw new Error(`Cannot delete data: ${retentionCheck.reason}`);
    }
    
    // Perform erasure
    const erasureResult = await this.erasePersonalData(userId, requestDetails);
    
    request.status = 'completed';
    request.results = erasureResult;
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return erasureResult;
  }

  // Handle portability request (GDPR Article 20)
  async handlePortabilityRequest(userId, format = 'json') {
    const request = this.createRequest('portability', userId, { format });
    
    // Verify user identity
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, { format });
    }
    
    // Collect portable data
    const portableData = await this.collectPortableData(userId);
    
    // Format data
    const formatted = await this.formatDataForExport(portableData, format);
    
    request.status = 'completed';
    request.format = format;
    request.dataSize = Buffer.byteLength(formatted);
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return {
      requestId: request.id,
      format,
      data: formatted,
      metadata: {
        exportDate: new Date().toISOString(),
        userId,
        format,
        recordCount: Object.keys(portableData).length
      }
    };
  }

  // Handle restriction request (GDPR Article 18)
  async handleRestrictionRequest(userId, restrictions) {
    const request = this.createRequest('restriction', userId, { restrictions });
    
    // Verify user identity
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, restrictions.verificationData);
    }
    
    // Apply processing restrictions
    const results = await this.applyProcessingRestrictions(userId, restrictions);
    
    request.status = 'completed';
    request.restrictions = results;
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return results;
  }

  // Handle objection request (GDPR Article 21)
  async handleObjectionRequest(userId, objections) {
    const request = this.createRequest('objection', userId, { objections });
    
    // Verify user identity
    if (this.config.verificationRequired) {
      await this.verifyIdentity(userId, objections.verificationData);
    }
    
    // Process objections
    const results = [];
    
    for (const objection of objections.items) {
      const result = await this.processObjection(userId, objection);
      results.push(result);
    }
    
    request.status = 'completed';
    request.results = results;
    request.completedAt = new Date().toISOString();
    
    this.requests.set(request.id, request);
    
    return results;
  }

  // Create request record
  createRequest(type, userId, details) {
    const request = {
      id: crypto.randomBytes(16).toString('hex'),
      type,
      userId,
      timestamp: new Date().toISOString(),
      status: 'pending',
      details,
      deadline: new Date(Date.now() + this.config.responseTimeLimit).toISOString()
    };
    
    this.requests.set(request.id, request);
    
    return request;
  }

  // Verify user identity
  async verifyIdentity(userId, verificationData) {
    // Implement identity verification logic
    // This could include:
    // - Email verification
    // - Security questions
    // - Document verification
    // - Two-factor authentication
    
    if (!verificationData) {
      throw new Error('Identity verification required');
    }
    
    // Placeholder verification
    return true;
  }

  // Collect all personal data
  async collectPersonalData(userId) {
    const data = {};
    
    // Collect from all configured data stores
    for (const store of this.config.dataStores) {
      const storeData = await store.getPersonalData(userId);
      Object.assign(data, storeData);
    }
    
    return data;
  }

  // Collect portable data
  async collectPortableData(userId) {
    const data = {};
    
    // Only collect data provided by the user or generated through their activity
    for (const store of this.config.dataStores) {
      if (store.supportsPortability) {
        const storeData = await store.getPortableData(userId);
        Object.assign(data, storeData);
      }
    }
    
    return data;
  }

  // Erase personal data
  async erasePersonalData(userId, options = {}) {
    const results = {
      erased: [],
      anonymized: [],
      retained: [],
      errors: []
    };
    
    for (const store of this.config.dataStores) {
      try {
        const storeResult = await store.erasePersonalData(userId, options);
        
        if (storeResult.erased) {
          results.erased.push(...storeResult.erased);
        }
        if (storeResult.anonymized) {
          results.anonymized.push(...storeResult.anonymized);
        }
        if (storeResult.retained) {
          results.retained.push(...storeResult.retained);
        }
      } catch (error) {
        results.errors.push({
          store: store.name,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Apply correction to data
  async applyCorrection(userId, correction) {
    const store = this.findDataStore(correction.dataStore);
    
    if (!store) {
      throw new Error(`Data store ${correction.dataStore} not found`);
    }
    
    return await store.correctData(userId, correction.field, correction.newValue);
  }

  // Apply processing restrictions
  async applyProcessingRestrictions(userId, restrictions) {
    const results = [];
    
    for (const restriction of restrictions.items) {
      const store = this.findDataStore(restriction.dataStore);
      
      if (store) {
        const result = await store.restrictProcessing(userId, restriction);
        results.push({
          dataStore: restriction.dataStore,
          processingType: restriction.processingType,
          restricted: true,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return results;
  }

  // Process objection
  async processObjection(userId, objection) {
    const store = this.findDataStore(objection.dataStore);
    
    if (!store) {
      return {
        processingType: objection.processingType,
        status: 'failed',
        reason: 'Data store not found'
      };
    }
    
    // Check for compelling legitimate grounds
    const legitimateGrounds = await store.checkLegitimateGrounds(
      userId,
      objection.processingType
    );
    
    if (legitimateGrounds.hasGrounds) {
      return {
        processingType: objection.processingType,
        status: 'rejected',
        reason: legitimateGrounds.reason
      };
    }
    
    // Stop the processing
    await store.stopProcessing(userId, objection.processingType);
    
    return {
      processingType: objection.processingType,
      status: 'accepted',
      stoppedAt: new Date().toISOString()
    };
  }

  // Check legal retention requirements
  async checkLegalRetention(userId) {
    // Check various legal requirements
    const checks = [
      this.checkFinancialRetention(userId),
      this.checkLegalClaims(userId),
      this.checkRegulatoryRequirements(userId)
    ];
    
    const results = await Promise.all(checks);
    
    for (const result of results) {
      if (result.mustRetain) {
        return result;
      }
    }
    
    return { mustRetain: false };
  }

  // Check financial retention requirements
  async checkFinancialRetention(userId) {
    // Check for financial/tax obligations
    // Typically 7-10 years depending on jurisdiction
    
    return { mustRetain: false };
  }

  // Check for legal claims
  async checkLegalClaims(userId) {
    // Check if data is needed for legal claims
    
    return { mustRetain: false };
  }

  // Check regulatory requirements
  async checkRegulatoryRequirements(userId) {
    // Check industry-specific regulations
    
    return { mustRetain: false };
  }

  // Format data for export
  async formatDataForExport(data, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(data);
      case 'xml':
        return this.convertToXML(data);
      case 'pdf':
        return await this.convertToPDF(data);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  // Convert to CSV
  convertToCSV(data) {
    const rows = [];
    
    // Flatten nested objects
    const flattened = this.flattenObject(data);
    
    // Create header
    rows.push(Object.keys(flattened).join(','));
    
    // Add values
    rows.push(Object.values(flattened).map(v => 
      typeof v === 'string' && v.includes(',') ? `"${v}"` : v
    ).join(','));
    
    return rows.join('\n');
  }

  // Convert to XML
  convertToXML(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<personal-data>\n';
    
    const buildXML = (obj, indent = '  ') => {
      let result = '';
      
      for (const [key, value] of Object.entries(obj)) {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        if (typeof value === 'object' && value !== null) {
          result += `${indent}<${safeKey}>\n`;
          result += buildXML(value, indent + '  ');
          result += `${indent}</${safeKey}>\n`;
        } else {
          result += `${indent}<${safeKey}>${this.escapeXML(value)}</${safeKey}>\n`;
        }
      }
      
      return result;
    };
    
    xml += buildXML(data);
    xml += '</personal-data>';
    
    return xml;
  }

  // Convert to PDF (placeholder)
  async convertToPDF(data) {
    // This would use a PDF library
    let pdf = 'PERSONAL DATA EXPORT\n';
    pdf += '=' .repeat(50) + '\n\n';
    pdf += JSON.stringify(data, null, 2);
    
    return pdf;
  }

  // Flatten nested object
  flattenObject(obj, prefix = '') {
    const flattened = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }
    
    return flattened;
  }

  // Escape XML
  escapeXML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Find data store
  findDataStore(name) {
    return this.config.dataStores.find(store => store.name === name);
  }

  // Categorize data
  categorizeData(data) {
    const categories = {
      identification: [],
      contact: [],
      financial: [],
      behavioral: [],
      preferences: [],
      technical: []
    };
    
    // Categorize based on field names
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase();
      
      if (lower.includes('name') || lower.includes('id')) {
        categories.identification.push(key);
      } else if (lower.includes('email') || lower.includes('phone') || lower.includes('address')) {
        categories.contact.push(key);
      } else if (lower.includes('payment') || lower.includes('card') || lower.includes('billing')) {
        categories.financial.push(key);
      } else if (lower.includes('preference') || lower.includes('setting')) {
        categories.preferences.push(key);
      } else if (lower.includes('ip') || lower.includes('device') || lower.includes('browser')) {
        categories.technical.push(key);
      } else {
        categories.behavioral.push(key);
      }
    }
    
    return categories;
  }

  // Get processing purposes
  async getProcessingPurposes(userId) {
    return [
      'Service provision',
      'Legal compliance',
      'Legitimate interests',
      'Contract fulfillment',
      'Consent-based processing'
    ];
  }

  // Get data recipients
  async getDataRecipients(userId) {
    return [
      { name: 'Internal teams', type: 'internal' },
      { name: 'Payment processors', type: 'processor' },
      { name: 'Analytics providers', type: 'processor' },
      { name: 'Cloud storage providers', type: 'processor' }
    ];
  }

  // Get retention periods
  async getRetentionPeriods(userId) {
    return {
      accountData: '3 years after account closure',
      transactionData: '7 years for tax purposes',
      communicationData: '1 year',
      analyticsData: '2 years',
      marketingData: 'Until consent withdrawn'
    };
  }

  // Get user rights
  getUserRights() {
    return [
      { right: 'access', description: 'Right to access your personal data' },
      { right: 'rectification', description: 'Right to correct inaccurate data' },
      { right: 'erasure', description: 'Right to be forgotten' },
      { right: 'portability', description: 'Right to data portability' },
      { right: 'restriction', description: 'Right to restrict processing' },
      { right: 'objection', description: 'Right to object to processing' },
      { right: 'automated', description: 'Rights related to automated decision-making' }
    ];
  }

  // Get request status
  getRequestStatus(requestId) {
    return this.requests.get(requestId);
  }

  // Get all requests for user
  getUserRequests(userId) {
    const userRequests = [];
    
    this.requests.forEach(request => {
      if (request.userId === userId) {
        userRequests.push(request);
      }
    });
    
    return userRequests;
  }
}

module.exports = RightsHandler;