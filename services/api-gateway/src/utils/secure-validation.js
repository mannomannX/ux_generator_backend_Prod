/**
 * Secure Validation Utilities to Prevent NoSQL Injection
 */

import { ObjectId } from 'mongodb';

/**
 * Validate and sanitize MongoDB ObjectId
 * Prevents NoSQL injection by ensuring the ID is a valid ObjectId string
 */
export function validateObjectId(id, fieldName = 'ID') {
  if (!id) {
    throw new Error(`${fieldName} is required`);
  }

  // Remove any whitespace
  const trimmedId = String(id).trim();
  
  // Check if it's a valid 24-character hex string
  if (!/^[a-f\d]{24}$/i.test(trimmedId)) {
    throw new Error(`Invalid ${fieldName} format`);
  }

  // Try to create an ObjectId to ensure it's valid
  try {
    return new ObjectId(trimmedId);
  } catch (error) {
    throw new Error(`Invalid ${fieldName}: ${error.message}`);
  }
}

/**
 * Safely create MongoDB ObjectId
 * Returns null if invalid instead of throwing
 */
export function safeObjectId(id) {
  if (!id) return null;
  
  try {
    const trimmedId = String(id).trim();
    if (!/^[a-f\d]{24}$/i.test(trimmedId)) {
      return null;
    }
    return new ObjectId(trimmedId);
  } catch {
    return null;
  }
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page, limit) {
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
  
  return {
    page: validatedPage,
    limit: validatedLimit,
    skip: (validatedPage - 1) * validatedLimit
  };
}

/**
 * Sanitize string input to prevent injection
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (!input) return '';
  
  // Convert to string and trim
  let sanitized = String(input).trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  // SECURITY FIX: Complete NoSQL injection patterns including dangerous operators
  const dangerousPatterns = [
    /\$where/gi,
    /\$regex/gi,
    /\$options/gi,
    /\$expr/gi,
    /\$jsonSchema/gi,
    /\$mod/gi,
    /\$text/gi,
    /\$geoNear/gi,
    /\$near/gi,
    /\$function/gi,
    /\$eval/gi,           // Server-side JavaScript execution
    /\$javascript/gi,     // JavaScript execution
    /\$accumulator/gi,    // Custom accumulator functions
    /\$let/gi,            // Variable binding
    /\$map/gi,            // Array mapping with expressions
    /\$reduce/gi,         // Array reduction operations
    /\$filter/gi,         // Array filtering with expressions
    /\$switch/gi,         // Conditional expressions
    /\$cond/gi,           // Conditional expressions
    /\$ifNull/gi,         // Null condition expressions
    /\$dateFromString/gi, // Date parsing expressions
    /\$objectToArray/gi,  // Object manipulation
    /\$arrayToObject/gi,  // Array manipulation
    /\$mergeObjects/gi,   // Object merging
    /\$replaceAll/gi,     // String replacement operations
    /\$split/gi,          // String splitting operations
    /\$trim/gi,           // String trimming operations
    /\$group/gi,          // Aggregation grouping
    /\$project/gi,        // Field projection
    /\$unwind/gi,         // Array unwinding
    /\$lookup/gi,         // Collection joins
    /\$graphLookup/gi,    // Recursive lookups
    /\$facet/gi,          // Multi-faceted aggregation
    /\$bucket/gi,         // Bucketing operations
    /\$sample/gi,         // Random sampling
    /\$unionWith/gi,      // Union operations
    /\$merge/gi,          // Output merge operations
    /\$out/gi,            // Output operations
    /\$addFields/gi,      // Field addition operations
    /\$set/gi,            // Field setting operations
    /\$unset/gi,          // Field removal operations
    /\$replaceRoot/gi,    // Root replacement operations
    /\$replaceWith/gi,    // Document replacement operations
    /\.\$\[/g,            // Array operators
    /\$\[/g,              // Positional operators
    /\$slice/gi,          // Array slicing
    /\$push/gi,           // Array push operations
    /\$pull/gi,           // Array pull operations
    /\$pullAll/gi,        // Array pull all operations
    /\$pop/gi,            // Array pop operations
    /\$addToSet/gi,       // Add to set operations
    /\$each/gi,           // Each modifier
    /\$sort/gi,           // Sort operations in updates
    /\$position/gi,       // Position modifier
  ];
  
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  return sanitized;
}

/**
 * Sanitize and validate regex pattern for safe usage
 */
export function sanitizeRegexPattern(pattern) {
  if (!pattern) return null;
  
  // Remove potentially dangerous regex constructs
  let safe = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .substring(0, 100); // Limit length to prevent ReDoS
  
  // Additional safety: remove lookaheads/lookbehinds
  safe = safe.replace(/\(\?[=!<]/g, '');
  
  return safe;
}

/**
 * Build safe MongoDB query from user input
 */
export function buildSafeQuery(baseQuery = {}, userFilters = {}) {
  const safeQuery = { ...baseQuery };
  
  // Whitelist of allowed filter fields
  const allowedFields = [
    'status', 
    'visibility', 
    'type', 
    'priority',
    'category',
    'tags'
  ];
  
  for (const [key, value] of Object.entries(userFilters)) {
    // Only allow whitelisted fields
    if (!allowedFields.includes(key)) {
      continue;
    }
    
    // Sanitize the value based on type
    if (typeof value === 'string') {
      safeQuery[key] = sanitizeInput(value, 100);
    } else if (Array.isArray(value)) {
      // Sanitize array values
      safeQuery[key] = { 
        $in: value.map(v => sanitizeInput(String(v), 100)) 
      };
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      safeQuery[key] = value;
    }
    // Ignore objects to prevent operator injection
  }
  
  return safeQuery;
}

/**
 * Validate sort parameters
 */
export function validateSort(sortField, sortOrder) {
  // Whitelist of allowed sort fields
  const allowedSortFields = [
    'createdAt',
    'updatedAt',
    'name',
    'title',
    'priority',
    'status',
    'date'
  ];
  
  const field = allowedSortFields.includes(sortField) ? sortField : 'createdAt';
  const order = sortOrder === 'asc' ? 1 : -1;
  
  return { [field]: order };
}

/**
 * Validate and sanitize email
 */
export function validateEmail(email) {
  if (!email) return null;
  
  const trimmed = String(email).trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  if (!emailRegex.test(trimmed)) {
    throw new Error('Invalid email format');
  }
  
  // Additional safety checks
  if (trimmed.length > 254) {
    throw new Error('Email too long');
  }
  
  // Check for suspicious patterns
  if (trimmed.includes('$') || trimmed.includes('{') || trimmed.includes('}')) {
    throw new Error('Invalid characters in email');
  }
  
  return trimmed;
}

/**
 * Validate array of IDs
 */
export function validateIdArray(ids, fieldName = 'IDs') {
  if (!Array.isArray(ids)) {
    throw new Error(`${fieldName} must be an array`);
  }
  
  if (ids.length > 100) {
    throw new Error(`Too many ${fieldName} (max 100)`);
  }
  
  const validIds = [];
  for (const id of ids) {
    try {
      validIds.push(validateObjectId(id, fieldName));
    } catch (error) {
      // Skip invalid IDs or throw based on requirements
      continue;
    }
  }
  
  return validIds;
}

/**
 * Validate enum value
 */
export function validateEnum(value, allowedValues, fieldName = 'value') {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `Invalid ${fieldName}. Must be one of: ${allowedValues.join(', ')}`
    );
  }
  return value;
}

/**
 * Sanitize object to remove dangerous keys
 */
export function sanitizeObject(obj, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return {}; // Prevent deep nesting attacks
  }
  
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
  }
  
  const sanitized = {};
  // SECURITY FIX: Complete dangerous keys list including all MongoDB operators
  const dangerousKeys = [
    '$where',
    '$regex', 
    '$options',
    '$expr',
    '$function',
    '$eval',
    '$javascript',
    '$accumulator',
    '$let',
    '$map',
    '$reduce',
    '$filter',
    '$switch',
    '$cond',
    '$ifNull',
    '$dateFromString',
    '$objectToArray',
    '$arrayToObject',
    '$mergeObjects',
    '$replaceAll',
    '$split',
    '$trim',
    '$group',
    '$project',
    '$unwind',
    '$lookup',
    '$graphLookup',
    '$facet',
    '$bucket',
    '$sample',
    '$unionWith',
    '$merge',
    '$out',
    '$addFields',
    '$set',
    '$unset',
    '$replaceRoot',
    '$replaceWith',
    '$slice',
    '$push',
    '$pull',
    '$pullAll',
    '$pop',
    '$addToSet',
    '$each',
    '$sort',
    '$position',
    '__proto__',
    'constructor',
    'prototype'
  ];
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip dangerous keys
    if (dangerousKeys.some(dangerous => key.includes(dangerous))) {
      continue;
    }
    
    // Skip keys starting with $
    if (key.startsWith('$')) {
      continue;
    }
    
    // Recursively sanitize nested objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Create text search query safely
 */
export function createTextSearchQuery(searchTerm, fields = ['name', 'description']) {
  if (!searchTerm) return null;
  
  // Sanitize search term
  const sanitized = sanitizeInput(searchTerm, 100);
  if (!sanitized) return null;
  
  // Escape special regex characters
  const escaped = sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Build OR query for multiple fields
  const conditions = fields.map(field => ({
    [field]: { 
      $regex: escaped, 
      $options: 'i' 
    }
  }));
  
  return { $or: conditions };
}

/**
 * Validate date range
 */
export function validateDateRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  
  if (start && isNaN(start.getTime())) {
    throw new Error('Invalid start date');
  }
  
  if (end && isNaN(end.getTime())) {
    throw new Error('Invalid end date');
  }
  
  if (start && end && start > end) {
    throw new Error('Start date must be before end date');
  }
  
  // Prevent queries for dates too far in the past or future
  const now = new Date();
  const maxPast = new Date(now.getFullYear() - 10, 0, 1);
  const maxFuture = new Date(now.getFullYear() + 10, 11, 31);
  
  if (start && start < maxPast) {
    throw new Error('Start date too far in the past');
  }
  
  if (end && end > maxFuture) {
    throw new Error('End date too far in the future');
  }
  
  return { start, end };
}

/**
 * Validate numeric range
 */
export function validateNumericRange(min, max, fieldName = 'value') {
  const minNum = min !== undefined ? Number(min) : null;
  const maxNum = max !== undefined ? Number(max) : null;
  
  if (minNum !== null && isNaN(minNum)) {
    throw new Error(`Invalid minimum ${fieldName}`);
  }
  
  if (maxNum !== null && isNaN(maxNum)) {
    throw new Error(`Invalid maximum ${fieldName}`);
  }
  
  if (minNum !== null && maxNum !== null && minNum > maxNum) {
    throw new Error(`Minimum ${fieldName} must be less than maximum`);
  }
  
  return { min: minNum, max: maxNum };
}

export default {
  validateObjectId,
  safeObjectId,
  validatePagination,
  sanitizeInput,
  sanitizeRegexPattern,
  buildSafeQuery,
  validateSort,
  validateEmail,
  validateIdArray,
  validateEnum,
  sanitizeObject,
  createTextSearchQuery,
  validateDateRange,
  validateNumericRange
};