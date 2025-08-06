import crypto from 'crypto';

/**
 * Shared encryption utilities for all services
 * Provides consistent encryption/decryption across the platform
 */
class EncryptionUtils {
  constructor(config = {}) {
    this.config = {
      algorithm: config.algorithm || 'aes-256-gcm',
      keyDerivationIterations: config.keyDerivationIterations || 100000,
      saltLength: config.saltLength || 32,
      ivLength: config.ivLength || 16,
      tagLength: config.tagLength || 16,
      defaultSalt: config.defaultSalt || 'ux-flow-engine-salt'
    };
  }

  /**
   * Generate a cryptographically secure random key
   */
  generateKey(length = 32) {
    return crypto.randomBytes(length);
  }

  /**
   * Generate a random salt for key derivation
   */
  generateSalt(length = null) {
    return crypto.randomBytes(length || this.config.saltLength);
  }

  /**
   * Generate a random initialization vector
   */
  generateIV() {
    return crypto.randomBytes(this.config.ivLength);
  }

  /**
   * Derive a key from a password using PBKDF2
   */
  deriveKey(password, salt, keyLength = 32) {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.config.keyDerivationIterations,
      keyLength,
      'sha256'
    );
  }

  /**
   * Derive a key from a password using scrypt (more secure, memory-hard)
   */
  deriveKeyScrypt(password, salt, keyLength = 32) {
    return crypto.scryptSync(password, salt, keyLength);
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(data, key, options = {}) {
    // Ensure data is a Buffer
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Generate IV if not provided
    const iv = options.iv || this.generateIV();
    
    // Create cipher
    const cipher = crypto.createCipheriv(this.config.algorithm, key, iv);
    
    // Set additional authenticated data if provided
    if (options.aad) {
      cipher.setAAD(Buffer.from(options.aad));
    }
    
    // Encrypt the data
    const encrypted = Buffer.concat([
      cipher.update(dataBuffer),
      cipher.final()
    ]);
    
    // Get the authentication tag
    const authTag = cipher.getAuthTag();
    
    // Return encrypted data with metadata
    return {
      encrypted,
      iv,
      authTag,
      algorithm: this.config.algorithm,
      combined: Buffer.concat([iv, authTag, encrypted]) // For convenience
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(encryptedData, key, options = {}) {
    let iv, authTag, encrypted;
    
    if (encryptedData.combined) {
      // Extract from combined buffer
      const combined = encryptedData.combined;
      iv = combined.slice(0, this.config.ivLength);
      authTag = combined.slice(this.config.ivLength, this.config.ivLength + this.config.tagLength);
      encrypted = combined.slice(this.config.ivLength + this.config.tagLength);
    } else if (Buffer.isBuffer(encryptedData)) {
      // Assume it's a combined buffer
      iv = encryptedData.slice(0, this.config.ivLength);
      authTag = encryptedData.slice(this.config.ivLength, this.config.ivLength + this.config.tagLength);
      encrypted = encryptedData.slice(this.config.ivLength + this.config.tagLength);
    } else {
      // Use provided components
      iv = encryptedData.iv || options.iv;
      authTag = encryptedData.authTag || options.authTag;
      encrypted = encryptedData.encrypted;
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(this.config.algorithm, key, iv);
    
    // Set authentication tag
    decipher.setAuthTag(authTag);
    
    // Set additional authenticated data if provided
    if (options.aad) {
      decipher.setAAD(Buffer.from(options.aad));
    }
    
    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted;
  }

  /**
   * Encrypt data with password (combines key derivation and encryption)
   */
  encryptWithPassword(data, password, options = {}) {
    const salt = options.salt || this.generateSalt();
    const key = this.deriveKeyScrypt(password, salt, 32);
    const encryptionResult = this.encrypt(data, key, options);
    
    return {
      ...encryptionResult,
      salt,
      // Combined format: salt + iv + authTag + encrypted
      combined: Buffer.concat([
        salt,
        encryptionResult.iv,
        encryptionResult.authTag,
        encryptionResult.encrypted
      ])
    };
  }

  /**
   * Decrypt data with password
   */
  decryptWithPassword(encryptedData, password, options = {}) {
    let salt, iv, authTag, encrypted;
    
    if (Buffer.isBuffer(encryptedData)) {
      // Extract from combined buffer
      salt = encryptedData.slice(0, this.config.saltLength);
      iv = encryptedData.slice(this.config.saltLength, this.config.saltLength + this.config.ivLength);
      authTag = encryptedData.slice(
        this.config.saltLength + this.config.ivLength,
        this.config.saltLength + this.config.ivLength + this.config.tagLength
      );
      encrypted = encryptedData.slice(this.config.saltLength + this.config.ivLength + this.config.tagLength);
    } else {
      salt = encryptedData.salt || options.salt;
      iv = encryptedData.iv;
      authTag = encryptedData.authTag;
      encrypted = encryptedData.encrypted;
    }
    
    const key = this.deriveKeyScrypt(password, salt, 32);
    
    return this.decrypt({
      encrypted,
      iv,
      authTag
    }, key, options);
  }

  /**
   * Hash data using SHA-256
   */
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest();
  }

  /**
   * Hash data and return hex string
   */
  hashHex(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Create HMAC
   */
  hmac(data, key, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, key).update(data).digest();
  }

  /**
   * Create HMAC and return hex string
   */
  hmacHex(data, key, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, key).update(data).digest('hex');
  }

  /**
   * Compare two buffers in constant time (prevent timing attacks)
   */
  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Generate a secure random token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a UUID v4
   */
  generateUUID() {
    return crypto.randomUUID();
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptObject(obj, key, fieldsToEncrypt) {
    const encrypted = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (obj[field] !== undefined && obj[field] !== null) {
        const result = this.encrypt(JSON.stringify(obj[field]), key);
        encrypted[field] = {
          encrypted: result.encrypted.toString('base64'),
          iv: result.iv.toString('base64'),
          authTag: result.authTag.toString('base64')
        };
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptObject(obj, key, fieldsToDecrypt) {
    const decrypted = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (obj[field] && obj[field].encrypted) {
        const encryptedData = {
          encrypted: Buffer.from(obj[field].encrypted, 'base64'),
          iv: Buffer.from(obj[field].iv, 'base64'),
          authTag: Buffer.from(obj[field].authTag, 'base64')
        };
        
        const decryptedBuffer = this.decrypt(encryptedData, key);
        decrypted[field] = JSON.parse(decryptedBuffer.toString());
      }
    }
    
    return decrypted;
  }
}

export { EncryptionUtils };