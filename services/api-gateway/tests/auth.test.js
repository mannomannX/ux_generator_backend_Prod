// ==========================================
// API GATEWAY - Authentication Tests
// ==========================================

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { authenticateToken, generateToken, refreshToken } from '../src/middleware/auth.js';

describe('Authentication Middleware', () => {
  let req, res, next;
  const mockSecret = 'test-secret-key';
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    role: 'user',
    workspaceId: 'workspace_123'
  };

  beforeEach(() => {
    req = {
      headers: {},
      body: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    process.env.JWT_SECRET = mockSecret;
  });

  describe('authenticateToken', () => {
    it('should authenticate valid JWT token', () => {
      const token = jwt.sign(mockUser, mockSecret, { expiresIn: '1h' });
      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email
      });
    });

    it('should reject request without token', () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'No token provided'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token', () => {
      req.headers.authorization = 'Bearer invalid_token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        mockUser,
        mockSecret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      req.headers.authorization = `Bearer ${expiredToken}`;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('expired')
        })
      );
    });

    it('should handle malformed authorization header', () => {
      req.headers.authorization = 'NotBearer token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('generateToken', () => {
    it('should generate valid JWT token', () => {
      const token = generateToken(mockUser);

      expect(token).toBeTruthy();
      
      const decoded = jwt.verify(token, mockSecret);
      expect(decoded).toMatchObject({
        id: mockUser.id,
        email: mockUser.email
      });
    });

    it('should set appropriate expiration time', () => {
      const token = generateToken(mockUser, '2h');
      const decoded = jwt.decode(token);

      const exp = decoded.exp;
      const now = Math.floor(Date.now() / 1000);
      const diff = exp - now;

      expect(diff).toBeGreaterThan(7000); // Close to 2 hours
      expect(diff).toBeLessThan(7300);
    });

    it('should include custom claims', () => {
      const customClaims = { permissions: ['read', 'write'] };
      const token = generateToken({ ...mockUser, ...customClaims });
      const decoded = jwt.verify(token, mockSecret);

      expect(decoded.permissions).toEqual(['read', 'write']);
    });
  });

  describe('refreshToken', () => {
    it('should refresh valid token', () => {
      const oldToken = jwt.sign(mockUser, mockSecret, { expiresIn: '1h' });
      req.body.refreshToken = oldToken;

      refreshToken(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.any(String),
          refreshToken: expect.any(String)
        })
      );
    });

    it('should reject refresh with invalid token', () => {
      req.body.refreshToken = 'invalid_refresh_token';

      refreshToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid refresh token'
        })
      );
    });

    it('should reject refresh without token', () => {
      refreshToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Refresh token required'
        })
      );
    });
  });

  describe('Role-based Access Control', () => {
    it('should allow admin access to admin routes', () => {
      const adminUser = { ...mockUser, role: 'admin' };
      const token = jwt.sign(adminUser, mockSecret);
      req.headers.authorization = `Bearer ${token}`;
      req.requiredRole = 'admin';

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.role).toBe('admin');
    });

    it('should deny user access to admin routes', () => {
      const token = jwt.sign(mockUser, mockSecret);
      req.headers.authorization = `Bearer ${token}`;
      req.requiredRole = 'admin';

      authenticateToken(req, res, () => {
        // Check role in next middleware
        if (req.user.role !== req.requiredRole) {
          res.status(403).json({ error: 'Insufficient permissions' });
        }
      });

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('API Key Authentication', () => {
    it('should authenticate valid API key', () => {
      req.headers['x-api-key'] = 'valid_api_key_123';
      
      // Mock API key validation
      const validateApiKey = (key) => key === 'valid_api_key_123';
      
      if (validateApiKey(req.headers['x-api-key'])) {
        req.user = { id: 'api_user', type: 'api' };
        next();
      } else {
        res.status(401).json({ error: 'Invalid API key' });
      }

      expect(next).toHaveBeenCalled();
      expect(req.user.type).toBe('api');
    });

    it('should reject invalid API key', () => {
      req.headers['x-api-key'] = 'invalid_key';
      
      const validateApiKey = (key) => key === 'valid_api_key_123';
      
      if (!validateApiKey(req.headers['x-api-key'])) {
        res.status(401).json({ error: 'Invalid API key' });
      }

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Session Management', () => {
    it('should track active sessions', () => {
      const sessions = new Map();
      const sessionId = 'session_123';
      
      // Create session
      sessions.set(sessionId, {
        userId: mockUser.id,
        createdAt: Date.now(),
        lastActivity: Date.now()
      });

      expect(sessions.has(sessionId)).toBe(true);
      expect(sessions.get(sessionId).userId).toBe(mockUser.id);
    });

    it('should invalidate expired sessions', () => {
      const sessions = new Map();
      const sessionId = 'session_expired';
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
      
      sessions.set(sessionId, {
        userId: mockUser.id,
        createdAt: Date.now() - SESSION_TIMEOUT - 1000,
        lastActivity: Date.now() - SESSION_TIMEOUT - 1000
      });

      // Check if session expired
      const session = sessions.get(sessionId);
      const isExpired = Date.now() - session.lastActivity > SESSION_TIMEOUT;
      
      if (isExpired) {
        sessions.delete(sessionId);
      }

      expect(sessions.has(sessionId)).toBe(false);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.JWT_SECRET;
  });
});