// ==========================================
// services/user-management/src/utils/validation.js
// ==========================================

import Joi from 'joi';

/**
 * Enhanced validation schemas for user management
 */

export const userUpdateSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).trim(),
  lastName: Joi.string().min(1).max(50).trim(),
  displayName: Joi.string().min(1).max(100).trim(),
  bio: Joi.string().max(500).allow('').trim(),
  preferences: Joi.object({
    theme: Joi.string().valid('light', 'dark', 'auto'),
    language: Joi.string().valid('en', 'de', 'fr', 'es'),
    notifications: Joi.object({
      email: Joi.boolean(),
      browser: Joi.boolean(),
      sms: Joi.boolean(),
    }),
    timezone: Joi.string(),
  }),
  role: Joi.string().valid('user', 'admin', 'super_admin'),
  permissions: Joi.array().items(Joi.string()),
  status: Joi.string().valid('active', 'suspended', 'inactive'),
  emailVerified: Joi.boolean(),
});

export const workspaceUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(50).trim(),
  description: Joi.string().max(500).allow('').trim(),
  settings: Joi.object({
    allowGuestAccess: Joi.boolean(),
    maxProjects: Joi.number().integer().min(1).max(1000),
    maxMembers: Joi.number().integer().min(1).max(100),
    allowPublicProjects: Joi.boolean(),
    requireApprovalForMembers: Joi.boolean(),
  }),
});

export const workspaceMemberSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('admin', 'member', 'viewer').default('member'),
  permissions: Joi.array().items(Joi.string()).default(['read_projects', 'write_projects']),
});

/**
 * Validation helper functions
 */
export class ValidationUtils {
  /**
   * Validate email format
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static validatePassword(password) {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const errors = [];
    
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUppercase) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowercase) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      errors.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength: this.calculatePasswordStrength(password),
    };
  }

  /**
   * Calculate password strength score (0-100)
   */
  static calculatePasswordStrength(password) {
    let score = 0;

    // Length bonus
    score += Math.min(password.length * 2, 20);

    // Character variety bonus
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^A-Za-z0-9]/.test(password)) score += 10;

    // Pattern penalties
    if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
    if (/123456|password|qwerty/i.test(password)) score -= 20; // Common patterns

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Sanitize user input
   */
  static sanitizeInput(input, options = {}) {
    if (typeof input !== 'string') return input;

    const {
      maxLength = null,
      allowHtml = false,
      trimWhitespace = true,
    } = options;

    let sanitized = input;

    if (trimWhitespace) {
      sanitized = sanitized.trim();
    }

    if (!allowHtml) {
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Validate MongoDB ObjectId
   */
  static isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
}