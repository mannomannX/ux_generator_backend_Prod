// ==========================================
// SERVICES/API-GATEWAY/src/utils/validation.js
// ==========================================
import { MongoClient } from '@ux-flow/common';
import { ValidationError } from '../middleware/error-handler.js';

/**
 * Safely validates and converts ObjectId
 * @param {string} id - The ID to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {ObjectId} Valid ObjectId
 * @throws {ValidationError} If ID is invalid
 */
export function validateObjectId(id, fieldName = 'ID') {
  if (!id) {
    throw new ValidationError(`${fieldName} is required`);
  }

  if (typeof id !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  // Check if it's a valid ObjectId format (24 char hex string)
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }

  try {
    return MongoClient.createObjectId(id);
  } catch (error) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }
}

/**
 * Validates multiple ObjectIds
 * @param {Object} ids - Object with id values to validate
 * @returns {Object} Object with validated ObjectIds
 */
export function validateObjectIds(ids) {
  const validated = {};
  for (const [key, value] of Object.entries(ids)) {
    validated[key] = validateObjectId(value, key);
  }
  return validated;
}

/**
 * Sanitizes user input for safe database operations
 * @param {string} input - User input to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove control characters and limit length
  const sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .trim()
    .substring(0, maxLength);
  
  return sanitized;
}

/**
 * Sanitizes regex input to prevent ReDoS attacks
 * @param {string} pattern - Regex pattern to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized pattern
 */
export function sanitizeRegexPattern(pattern, maxLength = 100) {
  if (!pattern || typeof pattern !== 'string') {
    return '';
  }
  
  if (pattern.length > maxLength) {
    throw new ValidationError('Search pattern too long');
  }
  
  // Escape special regex characters to prevent injection
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates pagination parameters
 * @param {string|number} page - Page number
 * @param {string|number} limit - Items per page
 * @returns {Object} Validated pagination params
 */
export function validatePagination(page = 1, limit = 20) {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  
  if (isNaN(pageNum) || pageNum < 1) {
    throw new ValidationError('Page must be a positive integer');
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }
  
  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum
  };
}

/**
 * Validates project visibility values
 * @param {string} visibility - Visibility value to validate
 * @returns {string} Validated visibility
 */
export function validateVisibility(visibility) {
  const validValues = ['public', 'private', 'team'];
  
  if (!validValues.includes(visibility)) {
    throw new ValidationError('Visibility must be one of: public, private, team');
  }
  
  return visibility;
}

/**
 * Validates project status values
 * @param {string} status - Status value to validate
 * @returns {string} Validated status
 */
export function validateProjectStatus(status) {
  const validStatuses = ['active', 'archived', 'draft', 'completed'];
  
  if (!validStatuses.includes(status)) {
    throw new ValidationError('Status must be one of: active, archived, draft, completed');
  }
  
  return status;
}

/**
 * Validates workspace member role
 * @param {string} role - Role to validate
 * @returns {string} Validated role
 */
export function validateMemberRole(role) {
  const validRoles = ['owner', 'admin', 'editor', 'viewer'];
  
  if (!validRoles.includes(role)) {
    throw new ValidationError('Role must be one of: owner, admin, editor, viewer');
  }
  
  return role;
}