// ==========================================
// PACKAGES/COMMON/src/auth/jwt-utils.js
// ==========================================
import jwt from 'jsonwebtoken';

class JWTUtils {
  static sign(payload, options = {}) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    const defaultOptions = {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'ux-flow-engine',
      audience: 'ux-flow-users',
    };

    return jwt.sign(payload, secret, { ...defaultOptions, ...options });
  }

  static verify(token) {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET environment variable is required');
      }

      return jwt.verify(token, secret, {
        issuer: 'ux-flow-engine',
        audience: 'ux-flow-users',
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return null; // Token expired
      }
      if (error.name === 'JsonWebTokenError') {
        return null; // Invalid token
      }
      throw error; // Other errors (missing secret, etc.)
    }
  }

  static decode(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      return null;
    }
  }

  static refresh(token, newPayload = {}) {
    try {
      const decoded = JWTUtils.verify(token);
      if (!decoded) {
        throw new Error('Invalid or expired token');
      }

      // Create new token with updated payload
      const payload = {
        ...decoded,
        ...newPayload,
        iat: undefined, // Remove issued at
        exp: undefined, // Remove expiration
      };

      return JWTUtils.sign(payload);
    } catch (error) {
      throw new Error('Failed to refresh token: ' + error.message);
    }
  }

  static getTokenInfo(token) {
    const decoded = JWTUtils.decode(token);
    if (!decoded) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = decoded.payload;

    return {
      userId: payload.userId,
      email: payload.email,
      workspaceId: payload.workspaceId,
      role: payload.role,
      permissions: payload.permissions,
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: new Date(payload.exp * 1000),
      isExpired: payload.exp < now,
      timeToExpiry: payload.exp - now,
    };
  }

  static createWorkspaceToken(userId, workspaceId, role = 'user', permissions = []) {
    return JWTUtils.sign({
      userId,
      workspaceId,
      role,
      permissions,
      tokenType: 'workspace_access',
    });
  }

  static createServiceToken(serviceName, permissions = []) {
    return JWTUtils.sign(
      {
        serviceName,
        permissions,
        tokenType: 'service_access',
      },
      { expiresIn: '1h' } // Shorter expiry for service tokens
    );
  }

  static validateServiceToken(token, requiredService = null) {
    const decoded = JWTUtils.verify(token);
    if (!decoded || decoded.tokenType !== 'service_access') {
      return false;
    }

    if (requiredService && decoded.serviceName !== requiredService) {
      return false;
    }

    return decoded;
  }
}

export { JWTUtils };