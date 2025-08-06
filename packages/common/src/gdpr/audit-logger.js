const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class AuditLogger {
  constructor(config = {}) {
    this.config = {
      logPath: config.logPath || process.env.AUDIT_LOG_PATH || './audit-logs',
      rotationSize: config.rotationSize || 100 * 1024 * 1024, // 100MB
      retentionDays: config.retentionDays || 2555, // 7 years for GDPR
      hashAlgorithm: config.hashAlgorithm || 'sha256',
      timestampFormat: config.timestampFormat || 'ISO',
      includeStackTrace: config.includeStackTrace !== false,
      encryptLogs: config.encryptLogs || false,
      encryptionKey: config.encryptionKey || process.env.AUDIT_ENCRYPTION_KEY,
      ...config
    };
    
    this.currentLogFile = null;
    this.logChain = [];
    this.initializeLogger();
  }

  // Initialize logger
  async initializeLogger() {
    // Create log directory if it doesn't exist
    await fs.mkdir(this.config.logPath, { recursive: true });
    
    // Load existing log chain
    await this.loadLogChain();
    
    // Set current log file
    await this.getCurrentLogFile();
  }

  // Log an audit event
  async log(event) {
    const auditEntry = await this.createAuditEntry(event);
    
    // Write to log file
    await this.writeToLog(auditEntry);
    
    // Update chain
    this.updateChain(auditEntry);
    
    // Check for rotation
    await this.checkRotation();
    
    return auditEntry;
  }

  // Create audit entry
  async createAuditEntry(event) {
    const entry = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: this.getTimestamp(),
      eventType: event.type,
      userId: event.userId || null,
      sessionId: event.sessionId || null,
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
      action: event.action,
      resource: event.resource || null,
      result: event.result || 'success',
      metadata: event.metadata || {},
      dataAccessed: event.dataAccessed || [],
      dataModified: event.dataModified || [],
      legalBasis: event.legalBasis || null,
      purpose: event.purpose || null,
      hash: null,
      previousHash: this.getLastHash(),
      signature: null
    };
    
    // Add stack trace if configured
    if (this.config.includeStackTrace && event.error) {
      entry.stackTrace = event.error.stack;
    }
    
    // Calculate hash
    entry.hash = this.calculateHash(entry);
    
    // Sign entry
    entry.signature = this.signEntry(entry);
    
    return entry;
  }

  // Write to log file
  async writeToLog(entry) {
    const logLine = JSON.stringify(entry) + '\n';
    
    // Encrypt if configured
    const data = this.config.encryptLogs ? 
      await this.encryptLogLine(logLine) : 
      logLine;
    
    // Append to current log file
    await fs.appendFile(this.currentLogFile, data);
  }

  // Calculate hash for entry
  calculateHash(entry) {
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      userId: entry.userId,
      action: entry.action,
      result: entry.result,
      previousHash: entry.previousHash
    });
    
    return crypto.createHash(this.config.hashAlgorithm)
      .update(data)
      .digest('hex');
  }

  // Sign entry
  signEntry(entry) {
    const signingKey = this.config.signingKey || 'default-audit-key';
    
    return crypto.createHmac('sha256', signingKey)
      .update(entry.hash)
      .digest('hex');
  }

  // Get last hash from chain
  getLastHash() {
    if (this.logChain.length === 0) {
      return '0'.repeat(64); // Genesis hash
    }
    
    return this.logChain[this.logChain.length - 1].hash;
  }

  // Update chain
  updateChain(entry) {
    this.logChain.push({
      hash: entry.hash,
      timestamp: entry.timestamp,
      file: this.currentLogFile
    });
  }

  // Load log chain
  async loadLogChain() {
    const chainFile = path.join(this.config.logPath, 'chain.json');
    
    try {
      const data = await fs.readFile(chainFile, 'utf8');
      this.logChain = JSON.parse(data);
    } catch (error) {
      // Chain doesn't exist yet
      this.logChain = [];
    }
  }

  // Save log chain
  async saveLogChain() {
    const chainFile = path.join(this.config.logPath, 'chain.json');
    await fs.writeFile(chainFile, JSON.stringify(this.logChain, null, 2));
  }

  // Get current log file
  async getCurrentLogFile() {
    const today = new Date().toISOString().split('T')[0];
    const logFileName = `audit-${today}.log`;
    this.currentLogFile = path.join(this.config.logPath, logFileName);
    
    // Create file if it doesn't exist
    try {
      await fs.access(this.currentLogFile);
    } catch {
      await fs.writeFile(this.currentLogFile, '');
    }
  }

  // Check for log rotation
  async checkRotation() {
    const stats = await fs.stat(this.currentLogFile);
    
    if (stats.size > this.config.rotationSize) {
      await this.rotateLog();
    }
  }

  // Rotate log file
  async rotateLog() {
    const timestamp = Date.now();
    const rotatedFile = `${this.currentLogFile}.${timestamp}`;
    
    // Rename current file
    await fs.rename(this.currentLogFile, rotatedFile);
    
    // Compress rotated file
    await this.compressLog(rotatedFile);
    
    // Create new log file
    await this.getCurrentLogFile();
    
    // Save chain
    await this.saveLogChain();
  }

  // Compress log file
  async compressLog(file) {
    const zlib = require('zlib');
    const stream = require('stream');
    const { promisify } = require('util');
    const pipeline = promisify(stream.pipeline);
    
    const gzip = zlib.createGzip();
    const source = require('fs').createReadStream(file);
    const destination = require('fs').createWriteStream(`${file}.gz`);
    
    await pipeline(source, gzip, destination);
    
    // Delete original file
    await fs.unlink(file);
  }

  // Encrypt log line
  async encryptLogLine(line) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.config.encryptionKey, 'hex'),
      iv
    );
    
    const encrypted = Buffer.concat([
      cipher.update(line, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Combine iv, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    return combined.toString('base64') + '\n';
  }

  // Decrypt log line
  async decryptLogLine(encryptedLine) {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }
    
    const combined = Buffer.from(encryptedLine.trim(), 'base64');
    
    const iv = combined.slice(0, 16);
    const tag = combined.slice(16, 32);
    const encrypted = combined.slice(32);
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.config.encryptionKey, 'hex'),
      iv
    );
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }

  // Search audit logs
  async search(criteria) {
    const results = [];
    const files = await this.getLogFiles();
    
    for (const file of files) {
      const entries = await this.readLogFile(file);
      
      for (const entry of entries) {
        if (this.matchesCriteria(entry, criteria)) {
          results.push(entry);
        }
      }
    }
    
    return results;
  }

  // Read log file
  async readLogFile(file) {
    const content = await fs.readFile(file, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const entries = [];
    
    for (const line of lines) {
      try {
        const decrypted = this.config.encryptLogs ? 
          await this.decryptLogLine(line) : 
          line;
        entries.push(JSON.parse(decrypted));
      } catch (error) {
        console.error('Failed to parse log line:', error);
      }
    }
    
    return entries;
  }

  // Check if entry matches criteria
  matchesCriteria(entry, criteria) {
    if (criteria.userId && entry.userId !== criteria.userId) {
      return false;
    }
    
    if (criteria.eventType && entry.eventType !== criteria.eventType) {
      return false;
    }
    
    if (criteria.startDate) {
      const entryDate = new Date(entry.timestamp);
      if (entryDate < new Date(criteria.startDate)) {
        return false;
      }
    }
    
    if (criteria.endDate) {
      const entryDate = new Date(entry.timestamp);
      if (entryDate > new Date(criteria.endDate)) {
        return false;
      }
    }
    
    if (criteria.action && entry.action !== criteria.action) {
      return false;
    }
    
    if (criteria.result && entry.result !== criteria.result) {
      return false;
    }
    
    return true;
  }

  // Get log files
  async getLogFiles() {
    const files = await fs.readdir(this.config.logPath);
    return files
      .filter(file => file.startsWith('audit-') && 
                     (file.endsWith('.log') || file.endsWith('.log.gz')))
      .map(file => path.join(this.config.logPath, file))
      .sort();
  }

  // Verify log integrity
  async verifyIntegrity() {
    const files = await this.getLogFiles();
    const results = {
      valid: true,
      errors: [],
      filesChecked: files.length,
      entriesChecked: 0
    };
    
    let previousHash = '0'.repeat(64);
    
    for (const file of files) {
      const entries = await this.readLogFile(file);
      
      for (const entry of entries) {
        results.entriesChecked++;
        
        // Verify hash chain
        if (entry.previousHash !== previousHash) {
          results.valid = false;
          results.errors.push({
            file,
            entryId: entry.id,
            error: 'Hash chain broken',
            expected: previousHash,
            actual: entry.previousHash
          });
        }
        
        // Verify entry hash
        const calculatedHash = this.calculateHash(entry);
        if (entry.hash !== calculatedHash) {
          results.valid = false;
          results.errors.push({
            file,
            entryId: entry.id,
            error: 'Entry hash mismatch',
            expected: calculatedHash,
            actual: entry.hash
          });
        }
        
        // Verify signature
        const expectedSignature = this.signEntry(entry);
        if (entry.signature !== expectedSignature) {
          results.valid = false;
          results.errors.push({
            file,
            entryId: entry.id,
            error: 'Signature mismatch'
          });
        }
        
        previousHash = entry.hash;
      }
    }
    
    return results;
  }

  // Clean up old logs
  async cleanup() {
    const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    const files = await this.getLogFiles();
    const deleted = [];
    
    for (const file of files) {
      const stats = await fs.stat(file);
      if (stats.mtime.getTime() < cutoff) {
        await fs.unlink(file);
        deleted.push(file);
      }
    }
    
    return deleted;
  }

  // Export logs for compliance
  async exportLogs(criteria, format = 'json') {
    const entries = await this.search(criteria);
    
    switch (format) {
      case 'json':
        return JSON.stringify(entries, null, 2);
      case 'csv':
        return this.entriesToCSV(entries);
      case 'pdf':
        return await this.entriesToPDF(entries);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // Convert entries to CSV
  entriesToCSV(entries) {
    if (entries.length === 0) return '';
    
    const headers = Object.keys(entries[0]);
    const rows = [headers.join(',')];
    
    for (const entry of entries) {
      const values = headers.map(header => {
        const value = entry[header];
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value || '').includes(',') ? 
          `"${String(value).replace(/"/g, '""')}"` : 
          String(value || '');
      });
      rows.push(values.join(','));
    }
    
    return rows.join('\n');
  }

  // Convert entries to PDF (placeholder)
  async entriesToPDF(entries) {
    // This would use a PDF generation library
    // For now, return a structured text format
    let pdf = 'AUDIT LOG REPORT\n';
    pdf += '=' .repeat(50) + '\n\n';
    
    for (const entry of entries) {
      pdf += `ID: ${entry.id}\n`;
      pdf += `Timestamp: ${entry.timestamp}\n`;
      pdf += `User: ${entry.userId || 'N/A'}\n`;
      pdf += `Action: ${entry.action}\n`;
      pdf += `Result: ${entry.result}\n`;
      pdf += '-'.repeat(30) + '\n\n';
    }
    
    return pdf;
  }

  // Get timestamp
  getTimestamp() {
    switch (this.config.timestampFormat) {
      case 'ISO':
        return new Date().toISOString();
      case 'unix':
        return Date.now();
      case 'custom':
        return this.config.customTimestamp();
      default:
        return new Date().toISOString();
    }
  }

  // Middleware for Express
  middleware() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      // Capture original end function
      const originalEnd = res.end;
      
      res.end = async function(...args) {
        // Call original end
        originalEnd.apply(res, args);
        
        // Log the request
        const auditEvent = {
          type: 'http_request',
          userId: req.user?.id || null,
          sessionId: req.session?.id || null,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          action: `${req.method} ${req.path}`,
          resource: req.path,
          result: res.statusCode < 400 ? 'success' : 'failure',
          metadata: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode: res.statusCode,
            duration: Date.now() - startTime,
            requestId: req.id || req.headers['x-request-id']
          }
        };
        
        // Add body for POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
          auditEvent.dataModified = Object.keys(req.body || {});
        }
        
        // Log the event
        await this.log(auditEvent);
      }.bind(this);
      
      next();
    };
  }
}

module.exports = AuditLogger;