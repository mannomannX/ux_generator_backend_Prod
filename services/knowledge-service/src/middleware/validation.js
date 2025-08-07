// ==========================================
// KNOWLEDGE SERVICE - Validation Middleware
// ==========================================

import Joi from 'joi';

// Validation schemas
const schemas = {
  storeKnowledge: Joi.object({
    content: Joi.string().min(1).max(10000).required(),
    type: Joi.string().valid('concept', 'pattern', 'principle', 'example', 'conversation').required(),
    category: Joi.string().max(100).required(),
    tags: Joi.array().items(Joi.string()).max(20).optional(),
    metadata: Joi.object().optional(),
    source: Joi.string().optional()
  }),

  searchKnowledge: Joi.object({
    query: Joi.string().min(1).max(500).required(),
    category: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    limit: Joi.number().integer().min(1).max(100).default(10),
    threshold: Joi.number().min(0).max(1).default(0.7),
    includeMetadata: Joi.boolean().default(true)
  }),

  ragQuery: Joi.object({
    query: Joi.string().min(1).max(1000).required(),
    context: Joi.string().max(5000).optional(),
    maxSources: Joi.number().integer().min(1).max(10).default(5),
    temperature: Joi.number().min(0).max(1).default(0.7),
    model: Joi.string().valid('gpt-4', 'gpt-3.5-turbo', 'claude', 'gemini').optional()
  }),

  extractConcepts: Joi.object({
    text: Joi.string().min(1).max(10000).required(),
    language: Joi.string().default('en'),
    minConfidence: Joi.number().min(0).max(1).default(0.5)
  }),

  learnFromConversation: Joi.object({
    messages: Joi.array().items(Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system').required(),
      content: Joi.string().required(),
      timestamp: Joi.date().optional()
    })).min(1).required(),
    outcome: Joi.string().valid('successful', 'failed', 'partial').required(),
    rating: Joi.number().min(1).max(5).optional(),
    metadata: Joi.object().optional()
  }),

  uxPattern: Joi.object({
    component: Joi.string().required(),
    name: Joi.string().required(),
    description: Joi.string().required(),
    implementation: Joi.object().optional(),
    bestPractices: Joi.array().items(Joi.string()).optional(),
    examples: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }),

  updateRelevance: Joi.object({
    knowledgeId: Joi.string().required(),
    useful: Joi.boolean().required(),
    rating: Joi.number().min(1).max(5).optional(),
    feedback: Joi.string().max(500).optional()
  }),

  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    sort: Joi.string().valid('relevance', 'date', 'rating').default('relevance'),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

// Validation middleware factory
export const validateRequest = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    
    if (!schema) {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Invalid validation schema'
      });
    }

    // Determine what to validate
    const toValidate = req.method === 'GET' ? req.query : req.body;
    
    const { error, value } = schema.validate(toValidate, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        errors,
        correlationId: req.correlationId
      });
    }

    // Replace with validated values
    if (req.method === 'GET') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Validate knowledge quality
export const validateKnowledgeQuality = async (req, res, next) => {
  const { content, type } = req.body;
  
  if (!content) {
    return next();
  }

  // Check content length based on type
  const minLengths = {
    concept: 20,
    pattern: 50,
    principle: 30,
    example: 10,
    conversation: 100
  };

  const minLength = minLengths[type] || 10;
  
  if (content.length < minLength) {
    return res.status(400).json({
      error: 'Content too short',
      message: `Content for type '${type}' should be at least ${minLength} characters`,
      correlationId: req.correlationId
    });
  }

  // Check for duplicate content
  if (req.knowledgeManager) {
    const isDuplicate = await req.knowledgeManager.checkDuplicate(content);
    
    if (isDuplicate) {
      return res.status(409).json({
        error: 'Duplicate content',
        message: 'Similar knowledge already exists',
        correlationId: req.correlationId
      });
    }
  }

  next();
};

// Validate search parameters
export const validateSearchParams = (req, res, next) => {
  const { query, category, tags } = req.query;
  
  // Ensure at least one search criterion
  if (!query && !category && !tags) {
    return res.status(400).json({
      error: 'Invalid search',
      message: 'At least one search criterion required (query, category, or tags)',
      correlationId: req.correlationId
    });
  }

  // Validate category if provided
  if (category) {
    const validCategories = [
      'design', 'ux', 'patterns', 'components', 
      'accessibility', 'performance', 'security', 
      'best-practices', 'examples', 'concepts'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category',
        message: `Category must be one of: ${validCategories.join(', ')}`,
        correlationId: req.correlationId
      });
    }
  }

  next();
};

// Sanitize knowledge content
export const sanitizeKnowledge = (req, res, next) => {
  if (req.body.content) {
    // Remove potential script tags and dangerous content
    req.body.content = req.body.content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  if (req.body.metadata) {
    // Sanitize metadata
    req.body.metadata = JSON.parse(
      JSON.stringify(req.body.metadata)
        .replace(/<script/gi, '&lt;script')
        .replace(/<\/script/gi, '&lt;/script')
    );
  }

  next();
};

// Rate limit knowledge operations
export const rateLimitKnowledge = {
  store: (req, res, next) => {
    // Implement rate limiting for storing knowledge
    // Could use Redis to track requests per user
    next();
  },
  
  search: (req, res, next) => {
    // More lenient rate limit for searches
    next();
  },
  
  rag: (req, res, next) => {
    // Strict rate limit for RAG queries (expensive operation)
    next();
  }
};

export default {
  validateRequest,
  validateKnowledgeQuality,
  validateSearchParams,
  sanitizeKnowledge,
  rateLimitKnowledge
};