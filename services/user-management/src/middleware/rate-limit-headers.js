/**
 * Rate Limit Headers Middleware
 * Adds rate limit information headers to all responses
 */

/**
 * Middleware to add rate limit headers to successful responses
 */
export const addRateLimitHeaders = (req, res, next) => {
  // Add rate limit info to successful requests if available
  if (req.rateLimit) {
    res.setHeader('RateLimit-Limit', req.rateLimit.limit);
    res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
    res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
    
    // Add warning header if approaching limit
    if (req.rateLimit.remaining < req.rateLimit.limit * 0.2) {
      res.setHeader('X-RateLimit-Warning', 'Approaching rate limit');
    }
  }
  
  next();
};

/**
 * Middleware factory for custom rate limit headers
 */
export const createRateLimitHeadersMiddleware = (options = {}) => {
  const {
    includeWarning = true,
    warningThreshold = 0.2,
    includeDraft = false, // Include draft-7 headers
  } = options;
  
  return (req, res, next) => {
    // Hook into res.end to add headers just before response is sent
    const originalEnd = res.end;
    
    res.end = function(...args) {
      if (req.rateLimit) {
        // Standard headers (draft-7)
        if (includeDraft) {
          res.setHeader('RateLimit', `limit=${req.rateLimit.limit}, remaining=${req.rateLimit.remaining}, reset=${req.rateLimit.resetTime}`);
          res.setHeader('RateLimit-Policy', `${req.rateLimit.limit};w=${req.rateLimit.windowMs / 1000}`);
        }
        
        // Common headers
        res.setHeader('RateLimit-Limit', req.rateLimit.limit);
        res.setHeader('RateLimit-Remaining', req.rateLimit.remaining);
        res.setHeader('RateLimit-Reset', new Date(req.rateLimit.resetTime).toISOString());
        
        // Add warning if approaching limit
        if (includeWarning && req.rateLimit.remaining < req.rateLimit.limit * warningThreshold) {
          const percentageUsed = Math.round((1 - req.rateLimit.remaining / req.rateLimit.limit) * 100);
          res.setHeader('X-RateLimit-Warning', `${percentageUsed}% of rate limit used`);
        }
        
        // Add custom headers for monitoring
        res.setHeader('X-RateLimit-Used', req.rateLimit.limit - req.rateLimit.remaining);
        res.setHeader('X-RateLimit-Window', req.rateLimit.windowMs / 1000); // in seconds
      }
      
      originalEnd.apply(res, args);
    };
    
    next();
  };
};

export default {
  addRateLimitHeaders,
  createRateLimitHeadersMiddleware
};