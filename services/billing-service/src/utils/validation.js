// ==========================================
// BILLING SERVICE - Validation Utilities
// ==========================================

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
    const { ObjectId } = require('mongodb');
    return new ObjectId(id);
  } catch (error) {
    throw new ValidationError(`Invalid ${fieldName} format`);
  }
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {string} Validated email
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }

  if (email.length > 254) {
    throw new ValidationError('Email is too long');
  }

  return email.toLowerCase().trim();
}

/**
 * Validates subscription tier
 * @param {string} tier - Tier to validate
 * @returns {string} Validated tier
 */
export function validateSubscriptionTier(tier) {
  const validTiers = ['free', 'basic', 'premium', 'enterprise'];
  
  if (!validTiers.includes(tier)) {
    throw new ValidationError(`Invalid subscription tier. Must be one of: ${validTiers.join(', ')}`);
  }
  
  return tier;
}

/**
 * Validates billing interval
 * @param {string} interval - Interval to validate
 * @returns {string} Validated interval
 */
export function validateBillingInterval(interval) {
  const validIntervals = ['month', 'year'];
  
  if (!validIntervals.includes(interval)) {
    throw new ValidationError(`Invalid billing interval. Must be one of: ${validIntervals.join(', ')}`);
  }
  
  return interval;
}

/**
 * Validates currency code
 * @param {string} currency - Currency code to validate
 * @returns {string} Validated currency
 */
export function validateCurrency(currency) {
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
  
  if (!validCurrencies.includes(currency?.toUpperCase())) {
    throw new ValidationError(`Invalid currency. Must be one of: ${validCurrencies.join(', ')}`);
  }
  
  return currency.toUpperCase();
}

/**
 * Validates amount (in cents)
 * @param {number} amount - Amount in cents
 * @param {number} min - Minimum amount (default: 50 cents)
 * @param {number} max - Maximum amount (default: 100000000 cents = $1M)
 * @returns {number} Validated amount
 */
export function validateAmount(amount, min = 50, max = 100000000) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ValidationError('Amount must be a valid number');
  }

  if (amount < min) {
    throw new ValidationError(`Amount must be at least ${min} cents`);
  }

  if (amount > max) {
    throw new ValidationError(`Amount cannot exceed ${max} cents`);
  }

  if (!Number.isInteger(amount)) {
    throw new ValidationError('Amount must be a whole number (in cents)');
  }

  return amount;
}

/**
 * Validates credit amount
 * @param {number} credits - Number of credits
 * @returns {number} Validated credits
 */
export function validateCreditAmount(credits) {
  if (typeof credits !== 'number' || isNaN(credits)) {
    throw new ValidationError('Credits must be a valid number');
  }

  if (credits < 0) {
    throw new ValidationError('Credits cannot be negative');
  }

  if (credits > 1000000) {
    throw new ValidationError('Credit amount too large');
  }

  return Math.floor(credits);
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
 * Validates date range
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @returns {Object} Validated date range
 */
export function validateDateRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (startDate && (isNaN(start.getTime()))) {
    throw new ValidationError('Invalid start date format');
  }

  if (endDate && (isNaN(end.getTime()))) {
    throw new ValidationError('Invalid end date format');
  }

  if (start && end && start > end) {
    throw new ValidationError('Start date must be before end date');
  }

  // Limit range to prevent excessive queries
  if (start && end && (end - start) > 365 * 24 * 60 * 60 * 1000) {
    throw new ValidationError('Date range cannot exceed 365 days');
  }

  return { start, end };
}

/**
 * Validates webhook event type
 * @param {string} eventType - Stripe event type
 * @returns {string} Validated event type
 */
export function validateWebhookEventType(eventType) {
  if (!eventType || typeof eventType !== 'string') {
    throw new ValidationError('Event type is required');
  }

  // Basic validation for Stripe event format
  if (!/^[a-z_]+\.[a-z_]+$/.test(eventType)) {
    throw new ValidationError('Invalid event type format');
  }

  return eventType;
}

/**
 * Sanitizes user input to prevent injection attacks
 * @param {string} input - Input to sanitize
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .trim()
    .substring(0, maxLength);
}

/**
 * Validates subscription status
 * @param {string} status - Subscription status
 * @returns {string} Validated status
 */
export function validateSubscriptionStatus(status) {
  const validStatuses = [
    'active', 'inactive', 'past_due', 'canceled', 
    'unpaid', 'trialing', 'incomplete', 'incomplete_expired'
  ];
  
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid subscription status. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  return status;
}