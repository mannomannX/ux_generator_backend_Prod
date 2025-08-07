/**
 * Unit Tests for Security Utils
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SecurityUtils } from '../../src/utils/security.js';

describe('SecurityUtils', () => {
  describe('generateSecureToken', () => {
    it('should generate a token of default length', () => {
      const token = SecurityUtils.generateSecureToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate a token of specified length', () => {
      const token = SecurityUtils.generateSecureToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = SecurityUtils.generateSecureToken();
      const token2 = SecurityUtils.generateSecureToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('generateResetToken', () => {
    it('should generate reset token with expiration', () => {
      const result = SecurityUtils.generateResetToken();
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(result.token).toHaveLength(64);
      expect(result.expiresAt).toBeInstanceOf(Date);
      
      // Should expire in 1 hour
      const expectedExpiry = Date.now() + 60 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });
  });

  describe('generateVerificationToken', () => {
    it('should generate verification token with expiration', () => {
      const result = SecurityUtils.generateVerificationToken();
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresAt');
      expect(result.token).toHaveLength(64);
      expect(result.expiresAt).toBeInstanceOf(Date);
      
      // Should expire in 24 hours
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'TestPassword123!';
      const hash = await SecurityUtils.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are ~60 chars
    });

    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await SecurityUtils.hashPassword(password);
      const hash2 = await SecurityUtils.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const password = 'TestPassword123!';
      const hash = await SecurityUtils.hashPassword(password);
      
      const result = await SecurityUtils.comparePassword(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await SecurityUtils.hashPassword(password);
      
      const result = await SecurityUtils.comparePassword(wrongPassword, hash);
      expect(result).toBe(false);
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with default prefix', () => {
      const key = SecurityUtils.generateApiKey();
      
      expect(key).toMatch(/^uxf_[a-f0-9]{48}$/);
    });

    it('should generate API key with custom prefix', () => {
      const key = SecurityUtils.generateApiKey('custom');
      
      expect(key).toMatch(/^custom_[a-f0-9]{48}$/);
    });

    it('should generate unique API keys', () => {
      const key1 = SecurityUtils.generateApiKey();
      const key2 = SecurityUtils.generateApiKey();
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateRateLimitKey', () => {
    it('should generate rate limit key', () => {
      const key = SecurityUtils.generateRateLimitKey('user123', '/api/users');
      
      expect(key).toBe('rate_limit:/api/users:user123');
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate correlation ID', () => {
      const id = SecurityUtils.generateCorrelationId();
      
      expect(id).toMatch(/^user_\d+_[a-z0-9]{9}$/);
    });

    it('should generate unique correlation IDs', () => {
      const id1 = SecurityUtils.generateCorrelationId();
      const id2 = SecurityUtils.generateCorrelationId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask default sensitive fields', () => {
      const data = {
        email: 'user@example.com',
        password: 'secret123',
        token: 'jwt-token-here',
        secret: 'api-secret',
        name: 'John Doe'
      };
      
      const masked = SecurityUtils.maskSensitiveData(data);
      
      expect(masked.email).toBe('user@example.com');
      expect(masked.name).toBe('John Doe');
      expect(masked.password).toBe('***masked***');
      expect(masked.token).toBe('***masked***');
      expect(masked.secret).toBe('***masked***');
    });

    it('should mask custom sensitive fields', () => {
      const data = {
        apiKey: 'key-123',
        creditCard: '4111111111111111',
        ssn: '123-45-6789'
      };
      
      const masked = SecurityUtils.maskSensitiveData(data, ['apiKey', 'creditCard', 'ssn']);
      
      expect(masked.apiKey).toBe('***masked***');
      expect(masked.creditCard).toBe('***masked***');
      expect(masked.ssn).toBe('***masked***');
    });

    it('should handle non-object input', () => {
      expect(SecurityUtils.maskSensitiveData(null)).toBe(null);
      expect(SecurityUtils.maskSensitiveData('string')).toBe('string');
      expect(SecurityUtils.maskSensitiveData(123)).toBe(123);
    });

    it('should not mutate original object', () => {
      const data = { password: 'secret' };
      const masked = SecurityUtils.maskSensitiveData(data);
      
      expect(data.password).toBe('secret');
      expect(masked.password).toBe('***masked***');
    });
  });

  describe('generateSessionId', () => {
    it('should generate session ID with prefix', () => {
      const id = SecurityUtils.generateSessionId();
      
      expect(id).toMatch(/^sess_[a-f0-9]{32}$/);
    });

    it('should generate unique session IDs', () => {
      const id1 = SecurityUtils.generateSessionId();
      const id2 = SecurityUtils.generateSessionId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('isValidIP', () => {
    describe('IPv4 validation', () => {
      it('should validate correct IPv4 addresses', () => {
        expect(SecurityUtils.isValidIP('192.168.1.1')).toBe(true);
        expect(SecurityUtils.isValidIP('10.0.0.0')).toBe(true);
        expect(SecurityUtils.isValidIP('172.16.254.1')).toBe(true);
        expect(SecurityUtils.isValidIP('127.0.0.1')).toBe(true);
        expect(SecurityUtils.isValidIP('255.255.255.255')).toBe(true);
        expect(SecurityUtils.isValidIP('0.0.0.0')).toBe(true);
      });

      it('should reject invalid IPv4 addresses', () => {
        expect(SecurityUtils.isValidIP('256.1.1.1')).toBe(false);
        expect(SecurityUtils.isValidIP('192.168.1.256')).toBe(false);
        expect(SecurityUtils.isValidIP('192.168.1')).toBe(false);
        expect(SecurityUtils.isValidIP('192.168.1.1.1')).toBe(false);
        expect(SecurityUtils.isValidIP('192.168.-1.1')).toBe(false);
        expect(SecurityUtils.isValidIP('192.168.01.1')).toBe(true); // Leading zeros are valid
        expect(SecurityUtils.isValidIP('999.999.999.999')).toBe(false);
      });
    });

    describe('IPv6 validation', () => {
      it('should validate correct IPv6 addresses', () => {
        expect(SecurityUtils.isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
        expect(SecurityUtils.isValidIP('2001:db8:85a3::8a2e:370:7334')).toBe(true);
        expect(SecurityUtils.isValidIP('::1')).toBe(true);
        expect(SecurityUtils.isValidIP('::')).toBe(true);
        expect(SecurityUtils.isValidIP('fe80::1')).toBe(true);
        expect(SecurityUtils.isValidIP('::ffff:192.168.1.1')).toBe(true);
      });

      it('should reject invalid IPv6 addresses', () => {
        expect(SecurityUtils.isValidIP('gggg::1')).toBe(false);
        expect(SecurityUtils.isValidIP('2001:0db8:85a3::8a2e:370g:7334')).toBe(false);
        expect(SecurityUtils.isValidIP('02001:0db8:0000:0000:0000:0000:0000:0000')).toBe(false);
      });
    });

    it('should reject non-IP strings', () => {
      expect(SecurityUtils.isValidIP('localhost')).toBe(false);
      expect(SecurityUtils.isValidIP('example.com')).toBe(false);
      expect(SecurityUtils.isValidIP('not an ip')).toBe(false);
      expect(SecurityUtils.isValidIP('')).toBe(false);
    });
  });

  describe('isLocalhost', () => {
    it('should identify localhost addresses', () => {
      expect(SecurityUtils.isLocalhost('127.0.0.1')).toBe(true);
      expect(SecurityUtils.isLocalhost('::1')).toBe(true);
      expect(SecurityUtils.isLocalhost('localhost')).toBe(true);
    });

    it('should reject non-localhost addresses', () => {
      expect(SecurityUtils.isLocalhost('192.168.1.1')).toBe(false);
      expect(SecurityUtils.isLocalhost('10.0.0.1')).toBe(false);
      expect(SecurityUtils.isLocalhost('example.com')).toBe(false);
    });
  });

  describe('generate2FASecret', () => {
    it('should generate base32 encoded secret', () => {
      const secret = SecurityUtils.generate2FASecret();
      
      // Base32 characters only
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThan(20);
    });

    it('should generate unique secrets', () => {
      const secret1 = SecurityUtils.generate2FASecret();
      const secret2 = SecurityUtils.generate2FASecret();
      
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('generateTimeBasedId', () => {
    it('should generate time-based ID', () => {
      const id = SecurityUtils.generateTimeBasedId();
      
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]{9}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = SecurityUtils.generateTimeBasedId();
      const id2 = SecurityUtils.generateTimeBasedId();
      
      expect(id1).not.toBe(id2);
    });

    it('should have increasing timestamp component', () => {
      const id1 = SecurityUtils.generateTimeBasedId();
      
      // Small delay to ensure different timestamp
      jest.advanceTimersByTime(10);
      
      const id2 = SecurityUtils.generateTimeBasedId();
      
      const timestamp1 = id1.split('_')[0];
      const timestamp2 = id2.split('_')[0];
      
      // Later ID should have greater or equal timestamp (base36)
      expect(parseInt(timestamp2, 36)).toBeGreaterThanOrEqual(parseInt(timestamp1, 36));
    });
  });
});

export default describe;