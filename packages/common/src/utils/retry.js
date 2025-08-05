// ==========================================
// PACKAGES/COMMON/src/utils/retry.js
// ==========================================
class RetryUtils {
  static async withRetry(fn, options = {}) {
    const {
      maxRetries = 3,
      delay = 1000,
      backoffFactor = 2,
      shouldRetry = () => true,
      logger = console,
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt > maxRetries || !shouldRetry(error)) {
          throw error;
        }

        const waitTime = delay * Math.pow(backoffFactor, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${waitTime}ms`, {
          error: error.message,
          attempt,
          maxRetries,
        });

        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError;
  }

  // Specific retry for API calls
  static async retryApiCall(apiCall, options = {}) {
    return this.withRetry(apiCall, {
      ...options,
      shouldRetry: (error) => {
        // Retry on network errors or 5xx status codes
        return error.code === 'ECONNREFUSED' || 
               error.code === 'ETIMEDOUT' ||
               (error.response && error.response.status >= 500);
      },
    });
  }
}

export { RetryUtils };