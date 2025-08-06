const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class DataProtection {
  constructor(config = {}) {
    this.config = {
      encryptionAlgorithm: config.encryptionAlgorithm || 'aes-256-gcm',
      keyDerivationIterations: config.keyDerivationIterations || 100000,
      saltLength: config.saltLength || 32,
      ivLength: config.ivLength || 16,
      tagLength: config.tagLength || 16,
      encryptionKey: config.encryptionKey || process.env.ENCRYPTION_KEY,
      dataRetentionDays: config.dataRetentionDays || 365,
      anonymizationSalt: config.anonymizationSalt || process.env.ANONYMIZATION_SALT,
      ...config
    };
    
    this.encryptionKey = null;
    this.initializeEncryption();
  }

  // Initialize encryption
  initializeEncryption() {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    // Derive encryption key
    const salt = crypto.createHash('sha256')
      .update('gdpr-encryption-salt')
      .digest();
    
    this.encryptionKey = crypto.pbkdf2Sync(
      this.config.encryptionKey,
      salt,
      this.config.keyDerivationIterations,
      32,
      'sha256'
    );
  }

  // Encrypt personal data
  encryptPersonalData(data) {
    if (!data) return null;
    
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const iv = crypto.randomBytes(this.config.ivLength);
    const cipher = crypto.createCipheriv(
      this.config.encryptionAlgorithm,
      this.encryptionKey,
      iv
    );
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Combine iv, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    return {
      encrypted: combined.toString('base64'),
      algorithm: this.config.encryptionAlgorithm,
      version: 1
    };
  }

  // Decrypt personal data
  decryptPersonalData(encryptedData) {
    if (!encryptedData || !encryptedData.encrypted) return null;
    
    const combined = Buffer.from(encryptedData.encrypted, 'base64');
    
    // Extract components
    const iv = combined.slice(0, this.config.ivLength);
    const tag = combined.slice(
      this.config.ivLength,
      this.config.ivLength + this.config.tagLength
    );
    const encrypted = combined.slice(
      this.config.ivLength + this.config.tagLength
    );
    
    const decipher = crypto.createDecipheriv(
      encryptedData.algorithm || this.config.encryptionAlgorithm,
      this.encryptionKey,
      iv
    );
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    const text = decrypted.toString('utf8');
    
    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // Pseudonymize data
  pseudonymize(data, fields = []) {
    const pseudonymized = { ...data };
    const mapping = {};
    
    fields.forEach(field => {
      if (data[field]) {
        const pseudonym = this.generatePseudonym(data[field]);
        pseudonymized[field] = pseudonym;
        mapping[field] = {
          original: data[field],
          pseudonym
        };
      }
    });
    
    return {
      data: pseudonymized,
      mapping: this.encryptPersonalData(mapping)
    };
  }

  // Generate pseudonym
  generatePseudonym(value) {
    const hash = crypto.createHmac('sha256', this.config.anonymizationSalt || 'default-salt')
      .update(String(value))
      .digest('hex');
    
    return `PSEUDO_${hash.substring(0, 16).toUpperCase()}`;
  }

  // Anonymize data (irreversible)
  anonymize(data, fields = []) {
    const anonymized = { ...data };
    
    fields.forEach(field => {
      if (anonymized[field]) {
        anonymized[field] = this.anonymizeField(field, anonymized[field]);
      }
    });
    
    return anonymized;
  }

  // Anonymize specific field
  anonymizeField(fieldName, value) {
    const fieldType = this.detectFieldType(fieldName, value);
    
    switch (fieldType) {
      case 'email':
        return this.anonymizeEmail(value);
      case 'phone':
        return this.anonymizePhone(value);
      case 'name':
        return this.anonymizeName(value);
      case 'address':
        return this.anonymizeAddress(value);
      case 'ip':
        return this.anonymizeIp(value);
      case 'date':
        return this.anonymizeDate(value);
      default:
        return this.anonymizeGeneric(value);
    }
  }

  // Detect field type
  detectFieldType(fieldName, value) {
    const lowerField = fieldName.toLowerCase();
    
    if (lowerField.includes('email')) return 'email';
    if (lowerField.includes('phone') || lowerField.includes('mobile')) return 'phone';
    if (lowerField.includes('name')) return 'name';
    if (lowerField.includes('address') || lowerField.includes('street')) return 'address';
    if (lowerField.includes('ip')) return 'ip';
    if (lowerField.includes('date') || lowerField.includes('time')) return 'date';
    
    // Check value patterns
    if (typeof value === 'string') {
      if (value.includes('@')) return 'email';
      if (/^\+?\d{10,}$/.test(value)) return 'phone';
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return 'ip';
    }
    
    return 'generic';
  }

  // Anonymize email
  anonymizeEmail(email) {
    const parts = email.split('@');
    if (parts.length !== 2) return '***@***.***';
    
    const username = parts[0];
    const domain = parts[1];
    
    const anonymizedUsername = username.charAt(0) + 
                               '*'.repeat(Math.max(3, username.length - 2)) +
                               (username.length > 1 ? username.charAt(username.length - 1) : '');
    
    const domainParts = domain.split('.');
    const anonymizedDomain = domainParts[0].charAt(0) + 
                            '*'.repeat(Math.max(3, domainParts[0].length - 1)) +
                            '.' + domainParts.slice(1).join('.');
    
    return `${anonymizedUsername}@${anonymizedDomain}`;
  }

  // Anonymize phone
  anonymizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return '***-***-****';
    
    return digits.substring(0, 3) + '-***-**' + digits.substring(digits.length - 2);
  }

  // Anonymize name
  anonymizeName(name) {
    const parts = name.split(' ');
    return parts.map(part => 
      part.charAt(0) + '*'.repeat(Math.max(2, part.length - 1))
    ).join(' ');
  }

  // Anonymize address
  anonymizeAddress(address) {
    return '*** Street, City, Country';
  }

  // Anonymize IP
  anonymizeIp(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return '***.***.***.***';
    
    return `${parts[0]}.${parts[1]}.***.***`;
  }

  // Anonymize date
  anonymizeDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-01-01`;
  }

  // Anonymize generic
  anonymizeGeneric(value) {
    if (typeof value === 'string') {
      return '*'.repeat(Math.min(value.length, 10));
    }
    return '***';
  }

  // Data minimization
  minimizeData(data, requiredFields) {
    const minimized = {};
    
    requiredFields.forEach(field => {
      if (data[field] !== undefined) {
        minimized[field] = data[field];
      }
    });
    
    return minimized;
  }

  // Check data retention
  checkDataRetention(createdAt) {
    const retentionPeriod = this.config.dataRetentionDays * 24 * 60 * 60 * 1000;
    const dataAge = Date.now() - new Date(createdAt).getTime();
    
    return {
      shouldDelete: dataAge > retentionPeriod,
      daysRemaining: Math.max(0, Math.ceil((retentionPeriod - dataAge) / (24 * 60 * 60 * 1000))),
      retentionPeriodDays: this.config.dataRetentionDays
    };
  }

  // Export personal data (for data portability)
  async exportPersonalData(userId, format = 'json') {
    const exportData = {
      exportDate: new Date().toISOString(),
      userId,
      format,
      data: {}
    };
    
    // Collect all personal data from different sources
    // This would integrate with your data stores
    
    switch (format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      case 'csv':
        return this.convertToCSV(exportData.data);
      case 'xml':
        return this.convertToXML(exportData.data);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Convert data to CSV
  convertToCSV(data) {
    // Implementation of CSV conversion
    const lines = [];
    const headers = Object.keys(data);
    lines.push(headers.join(','));
    
    // Add data rows
    // This is a simplified implementation
    
    return lines.join('\n');
  }

  // Convert data to XML
  convertToXML(data) {
    // Implementation of XML conversion
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<data>\n';
    
    for (const [key, value] of Object.entries(data)) {
      xml += `  <${key}>${this.escapeXML(value)}</${key}>\n`;
    }
    
    xml += '</data>';
    return xml;
  }

  // Escape XML special characters
  escapeXML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Secure data deletion
  async secureDelete(data) {
    // Overwrite memory
    if (typeof data === 'object') {
      for (const key in data) {
        if (typeof data[key] === 'string') {
          const length = data[key].length;
          data[key] = crypto.randomBytes(length).toString('hex').substring(0, length);
        }
        data[key] = null;
        delete data[key];
      }
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    return true;
  }

  // Data breach notification
  async notifyDataBreach(breachInfo) {
    const notification = {
      timestamp: new Date().toISOString(),
      type: 'data_breach',
      severity: breachInfo.severity || 'high',
      affectedUsers: breachInfo.affectedUsers || [],
      dataTypes: breachInfo.dataTypes || [],
      description: breachInfo.description,
      actions: breachInfo.actions || []
    };
    
    // Log breach
    console.error('[DATA BREACH]', notification);
    
    // Notify authorities (would integrate with reporting APIs)
    // This is where you'd integrate with GDPR breach notification services
    
    // Notify affected users
    for (const userId of notification.affectedUsers) {
      await this.notifyUser(userId, notification);
    }
    
    return notification;
  }

  // Notify user
  async notifyUser(userId, notification) {
    // Implementation would send email/notification to user
    console.log(`Notifying user ${userId} about:`, notification);
  }

  // Data Processing Agreement (DPA) validation
  validateDPA(processor, agreement) {
    const requiredClauses = [
      'dataProcessingPurpose',
      'dataCategories',
      'retentionPeriod',
      'securityMeasures',
      'subProcessors',
      'dataTransfers',
      'auditRights',
      'liabilityTerms'
    ];
    
    const missingClauses = requiredClauses.filter(
      clause => !agreement[clause]
    );
    
    return {
      valid: missingClauses.length === 0,
      missingClauses,
      processor,
      agreement
    };
  }
}

module.exports = DataProtection;