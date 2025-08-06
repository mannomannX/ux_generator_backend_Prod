const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SecretsManager {
  constructor(config = {}) {
    this.config = {
      algorithm: config.algorithm || 'aes-256-gcm',
      keyDerivationIterations: config.keyDerivationIterations || 100000,
      saltLength: config.saltLength || 32,
      tagLength: config.tagLength || 16,
      ivLength: config.ivLength || 16,
      keyLength: config.keyLength || 32,
      secretsPath: config.secretsPath || process.env.SECRETS_PATH || '/etc/secrets',
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 3600000, // 1 hour
      ...config
    };
    
    this.cache = new Map();
    this.masterKey = null;
  }

  // Initialize with master key
  async initialize(masterKey) {
    if (!masterKey) {
      // Try to load from environment
      masterKey = process.env.MASTER_KEY;
      
      if (!masterKey) {
        // Try to load from file
        const keyPath = process.env.MASTER_KEY_PATH || '/etc/secrets/master.key';
        try {
          masterKey = await fs.readFile(keyPath, 'utf8');
        } catch (error) {
          throw new Error('Master key not found');
        }
      }
    }
    
    // Validate master key
    if (masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters');
    }
    
    // Derive encryption key from master key
    const salt = crypto.createHash('sha256').update('secrets-manager-salt').digest();
    this.masterKey = crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.config.keyDerivationIterations,
      this.config.keyLength,
      'sha256'
    );
    
    // Clear master key from memory
    masterKey = null;
  }

  // Encrypt a secret
  encrypt(plaintext) {
    if (!this.masterKey) {
      throw new Error('Secrets manager not initialized');
    }
    
    const iv = crypto.randomBytes(this.config.ivLength);
    const cipher = crypto.createCipheriv(this.config.algorithm, this.masterKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Combine iv, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    return combined.toString('base64');
  }

  // Decrypt a secret
  decrypt(ciphertext) {
    if (!this.masterKey) {
      throw new Error('Secrets manager not initialized');
    }
    
    const combined = Buffer.from(ciphertext, 'base64');
    
    // Extract components
    const iv = combined.slice(0, this.config.ivLength);
    const tag = combined.slice(this.config.ivLength, this.config.ivLength + this.config.tagLength);
    const encrypted = combined.slice(this.config.ivLength + this.config.tagLength);
    
    const decipher = crypto.createDecipheriv(this.config.algorithm, this.masterKey, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  }

  // Store a secret
  async storeSecret(name, value, metadata = {}) {
    const encrypted = this.encrypt(value);
    
    const secret = {
      name,
      value: encrypted,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        version: metadata.version || 1
      }
    };
    
    // Store in file system
    const filePath = path.join(this.config.secretsPath, `${name}.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(secret, null, 2));
    
    // Update cache
    if (this.config.cacheEnabled) {
      this.cache.set(name, {
        value,
        timestamp: Date.now()
      });
    }
    
    return secret.metadata;
  }

  // Retrieve a secret
  async getSecret(name) {
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(name);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.value;
      }
    }
    
    // Load from file system
    const filePath = path.join(this.config.secretsPath, `${name}.json`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const secret = JSON.parse(content);
      const decrypted = this.decrypt(secret.value);
      
      // Update cache
      if (this.config.cacheEnabled) {
        this.cache.set(name, {
          value: decrypted,
          timestamp: Date.now()
        });
      }
      
      return decrypted;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // List all secrets
  async listSecrets() {
    try {
      const files = await fs.readdir(this.config.secretsPath);
      const secrets = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.config.secretsPath, file);
          const content = await fs.readFile(filePath, 'utf8');
          const secret = JSON.parse(content);
          
          secrets.push({
            name: secret.name,
            metadata: secret.metadata
          });
        }
      }
      
      return secrets;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  // Delete a secret
  async deleteSecret(name) {
    const filePath = path.join(this.config.secretsPath, `${name}.json`);
    
    try {
      await fs.unlink(filePath);
      
      // Remove from cache
      if (this.config.cacheEnabled) {
        this.cache.delete(name);
      }
      
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  // Rotate a secret
  async rotateSecret(name, newValue) {
    const filePath = path.join(this.config.secretsPath, `${name}.json`);
    
    try {
      // Load existing secret
      const content = await fs.readFile(filePath, 'utf8');
      const secret = JSON.parse(content);
      
      // Create backup
      const backupPath = path.join(
        this.config.secretsPath,
        'backups',
        `${name}_${Date.now()}.json`
      );
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, content);
      
      // Update secret
      secret.value = this.encrypt(newValue);
      secret.metadata.rotatedAt = new Date().toISOString();
      secret.metadata.version = (secret.metadata.version || 1) + 1;
      
      // Save updated secret
      await fs.writeFile(filePath, JSON.stringify(secret, null, 2));
      
      // Update cache
      if (this.config.cacheEnabled) {
        this.cache.set(name, {
          value: newValue,
          timestamp: Date.now()
        });
      }
      
      return secret.metadata;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Secret doesn't exist, create it
        return await this.storeSecret(name, newValue);
      }
      throw error;
    }
  }

  // Batch operations
  async getSecrets(names) {
    const secrets = {};
    
    for (const name of names) {
      secrets[name] = await this.getSecret(name);
    }
    
    return secrets;
  }

  // Environment variable integration
  async loadToEnv(prefix = '') {
    const secrets = await this.listSecrets();
    
    for (const secret of secrets) {
      const value = await this.getSecret(secret.name);
      const envName = prefix + secret.name.toUpperCase().replace(/-/g, '_');
      process.env[envName] = value;
    }
  }

  // AWS Secrets Manager integration (optional)
  async syncWithAWS() {
    // This would integrate with AWS Secrets Manager
    // Implementation depends on AWS SDK
  }

  // HashiCorp Vault integration (optional)
  async syncWithVault() {
    // This would integrate with HashiCorp Vault
    // Implementation depends on Vault SDK
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Secure random token generation
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate API key
  generateApiKey() {
    const prefix = 'sk_live_';
    const token = this.generateToken(32);
    return prefix + token;
  }

  // Generate secure password
  generatePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  // Validate secret strength
  validateSecretStrength(secret, type = 'password') {
    const rules = {
      password: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true
      },
      apiKey: {
        minLength: 32,
        pattern: /^[a-zA-Z0-9_-]+$/
      },
      token: {
        minLength: 32,
        pattern: /^[a-fA-F0-9]+$/
      }
    };
    
    const rule = rules[type];
    if (!rule) {
      throw new Error(`Unknown secret type: ${type}`);
    }
    
    if (secret.length < rule.minLength) {
      return {
        valid: false,
        message: `Must be at least ${rule.minLength} characters`
      };
    }
    
    if (rule.pattern && !rule.pattern.test(secret)) {
      return {
        valid: false,
        message: 'Invalid format'
      };
    }
    
    if (type === 'password') {
      const checks = [
        { test: /[A-Z]/, message: 'Must contain uppercase letter' },
        { test: /[a-z]/, message: 'Must contain lowercase letter' },
        { test: /[0-9]/, message: 'Must contain number' },
        { test: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/, message: 'Must contain special character' }
      ];
      
      for (const check of checks) {
        if (!check.test.test(secret)) {
          return {
            valid: false,
            message: check.message
          };
        }
      }
    }
    
    return { valid: true };
  }
}

module.exports = SecretsManager;