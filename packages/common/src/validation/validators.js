// ==========================================
// PACKAGES/COMMON/src/validation/validators.js
// ==========================================
import Joi from 'joi';

class Validators {
  // Email validation
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Password strength validation
  static isValidPassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
      return false;
    }

    // At least one lowercase, one uppercase, one digit
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return hasLower && hasUpper && hasDigit;
  }

  // ObjectId validation (MongoDB)
  static isValidObjectId(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  // UUID validation
  static isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
  }

  // URL validation
  static isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Phone number validation (basic)
  static isValidPhoneNumber(phone) {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  // Workspace name validation
  static isValidWorkspaceName(name) {
    return (
      typeof name === 'string' &&
      name.length >= 2 &&
      name.length <= 50 &&
      /^[a-zA-Z0-9\s\-\_]+$/.test(name)
    );
  }

  // Project name validation
  static isValidProjectName(name) {
    return (
      typeof name === 'string' &&
      name.length >= 1 &&
      name.length <= 100 &&
      name.trim().length > 0
    );
  }

  // Flow name validation
  static isValidFlowName(name) {
    return (
      typeof name === 'string' &&
      name.length >= 1 &&
      name.length <= 100 &&
      name.trim().length > 0
    );
  }

  // Version string validation (semantic versioning)
  static isValidVersion(version) {
    if (!version || typeof version !== 'string') return false;
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9\-]+)?(\+[a-zA-Z0-9\-]+)?$/.test(version);
  }

  // Sanitize HTML (basic)
  static sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    return html
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // Sanitize for database queries
  static sanitizeForDB(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potential MongoDB injection patterns
    return input.replace(/[\$\.]/g, '');
  }

  // Validate array of IDs
  static validateIdArray(ids, type = 'objectId') {
    if (!Array.isArray(ids)) return false;
    
    const validator = type === 'uuid' ? Validators.isValidUUID : Validators.isValidObjectId;
    return ids.every(id => validator(id));
  }

  // Validate pagination parameters
  static validatePagination(page, limit) {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    return {
      page: pageNum > 0 ? pageNum : 1,
      limit: limitNum > 0 && limitNum <= 100 ? limitNum : 20,
    };
  }

  // Validate file upload
  static validateFileUpload(file, options = {}) {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf'],
    } = options;

    const errors = [];

    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors };
    }

    if (file.size > maxSize) {
      errors.push(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} not allowed`);
    }

    if (allowedExtensions.length > 0) {
      const extension = '.' + file.originalname.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        errors.push(`File extension ${extension} not allowed`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Clean and validate user input
  static cleanUserInput(input, options = {}) {
    const {
      maxLength = 1000,
      allowHtml = false,
      trimWhitespace = true,
    } = options;

    if (typeof input !== 'string') return input;

    let cleaned = input;

    if (trimWhitespace) {
      cleaned = cleaned.trim();
    }

    if (!allowHtml) {
      cleaned = Validators.sanitizeHtml(cleaned);
    }

    if (maxLength && cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
    }

    return cleaned;
  }
}

export { Validators };