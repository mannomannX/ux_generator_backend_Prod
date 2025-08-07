/**
 * Circuit Breaker for External Service Protection
 * Prevents cascading failures when external services are unavailable
 */

import { EventEmitter } from 'events';
import { ErrorFactory } from './errors.js';

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failures exceeded threshold, blocking calls
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  constructor(name, options = {}) {
    super();
    
    this.name = name;
    this.state = CircuitState.CLOSED;
    
    // Configuration
    this.config = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000, // 60 seconds
      resetTimeout: options.resetTimeout || 30000, // 30 seconds
      volumeThreshold: options.volumeThreshold || 10, // Minimum calls before opening
      errorThresholdPercentage: options.errorThresholdPercentage || 50,
      ...options
    };
    
    // Statistics
    this.stats = {
      failures: 0,
      successes: 0,
      totalCalls: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: null,
      lastSuccessTime: null
    };
    
    // Rolling window for percentage-based threshold
    this.rollingWindow = [];
    this.windowSize = options.windowSize || 100;
    
    // Timer for reset
    this.resetTimer = null;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        this.emit('rejected', { name: this.name, state: this.state });
        
        if (fallback) {
          return await fallback();
        }
        
        throw ErrorFactory.embeddingProvider(
          this.name,
          `Circuit breaker is OPEN for ${this.name}`
        );
      }
    }
    
    try {
      // Execute the function with timeout
      const result = await this.executeWithTimeout(fn, this.config.timeout);
      
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure(error);
      
      if (fallback) {
        return await fallback();
      }
      
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeout) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
      
      try {
        const result = await fn();
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.stats.successes++;
    this.stats.totalCalls++;
    this.stats.consecutiveSuccesses++;
    this.stats.consecutiveFailures = 0;
    this.stats.lastSuccessTime = Date.now();
    
    // Update rolling window
    this.updateRollingWindow(true);
    
    // Check state transitions
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
    
    this.emit('success', {
      name: this.name,
      state: this.state,
      stats: this.getStats()
    });
  }

  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.stats.failures++;
    this.stats.totalCalls++;
    this.stats.consecutiveFailures++;
    this.stats.consecutiveSuccesses = 0;
    this.stats.lastFailureTime = Date.now();
    
    // Update rolling window
    this.updateRollingWindow(false);
    
    // Check state transitions
    if (this.state === CircuitState.CLOSED) {
      if (this.shouldOpen()) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    }
    
    this.emit('failure', {
      name: this.name,
      state: this.state,
      error: error.message,
      stats: this.getStats()
    });
  }

  /**
   * Check if circuit should open
   */
  shouldOpen() {
    // Check volume threshold
    if (this.stats.totalCalls < this.config.volumeThreshold) {
      return false;
    }
    
    // Check consecutive failures
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }
    
    // Check error percentage
    const errorPercentage = this.calculateErrorPercentage();
    return errorPercentage >= this.config.errorThresholdPercentage;
  }

  /**
   * Check if should attempt reset
   */
  shouldAttemptReset() {
    if (!this.stats.lastFailureTime) {
      return true;
    }
    
    const timeSinceLastFailure = Date.now() - this.stats.lastFailureTime;
    return timeSinceLastFailure >= this.config.resetTimeout;
  }

  /**
   * Transition to OPEN state
   */
  transitionToOpen() {
    this.state = CircuitState.OPEN;
    
    // Set timer for automatic reset attempt
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.resetTimeout);
    
    this.emit('open', {
      name: this.name,
      stats: this.getStats()
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  transitionToHalfOpen() {
    this.state = CircuitState.HALF_OPEN;
    this.stats.consecutiveSuccesses = 0;
    this.stats.consecutiveFailures = 0;
    
    this.emit('half-open', {
      name: this.name,
      stats: this.getStats()
    });
  }

  /**
   * Transition to CLOSED state
   */
  transitionToClosed() {
    this.state = CircuitState.CLOSED;
    this.stats.failures = 0;
    this.stats.successes = 0;
    this.stats.consecutiveFailures = 0;
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    this.emit('closed', {
      name: this.name,
      stats: this.getStats()
    });
  }

  /**
   * Update rolling window for percentage calculation
   */
  updateRollingWindow(success) {
    this.rollingWindow.push({
      success,
      timestamp: Date.now()
    });
    
    // Remove old entries
    if (this.rollingWindow.length > this.windowSize) {
      this.rollingWindow.shift();
    }
  }

  /**
   * Calculate error percentage
   */
  calculateErrorPercentage() {
    if (this.rollingWindow.length === 0) {
      return 0;
    }
    
    const failures = this.rollingWindow.filter(w => !w.success).length;
    return (failures / this.rollingWindow.length) * 100;
  }

  /**
   * Force open the circuit
   */
  forceOpen() {
    this.transitionToOpen();
  }

  /**
   * Force close the circuit
   */
  forceClosed() {
    this.transitionToClosed();
  }

  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      failures: 0,
      successes: 0,
      totalCalls: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: null,
      lastSuccessTime: null
    };
    
    this.rollingWindow = [];
    this.transitionToClosed();
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      state: this.state,
      ...this.stats,
      errorPercentage: this.calculateErrorPercentage().toFixed(2) + '%'
    };
  }

  /**
   * Get health status
   */
  getHealth() {
    return {
      name: this.name,
      healthy: this.state === CircuitState.CLOSED,
      state: this.state,
      stats: this.getStats()
    };
  }
}

/**
 * Circuit breaker factory for managing multiple breakers
 */
export class CircuitBreakerFactory {
  constructor(logger) {
    this.logger = logger;
    this.breakers = new Map();
  }

  /**
   * Create or get circuit breaker
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(name, options);
      
      // Set up logging
      breaker.on('open', (data) => {
        this.logger.warn('Circuit breaker opened', data);
      });
      
      breaker.on('half-open', (data) => {
        this.logger.info('Circuit breaker half-open', data);
      });
      
      breaker.on('closed', (data) => {
        this.logger.info('Circuit breaker closed', data);
      });
      
      this.breakers.set(name, breaker);
    }
    
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker
   */
  async execute(name, fn, options = {}) {
    const breaker = this.getBreaker(name, options);
    return await breaker.execute(fn, options.fallback);
  }

  /**
   * Get all breakers status
   */
  getAllStatus() {
    const status = {};
    
    for (const [name, breaker] of this.breakers.entries()) {
      status[name] = breaker.getHealth();
    }
    
    return status;
  }

  /**
   * Reset all breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Force open a specific breaker
   */
  forceOpen(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.forceOpen();
    }
  }

  /**
   * Force close a specific breaker
   */
  forceClosed(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.forceClosed();
    }
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.factor = options.factor || 2;
    this.jitter = options.jitter || true;
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(fn, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Calculate delay with exponential backoff
   */
  calculateDelay(attempt) {
    let delay = Math.min(
      this.initialDelay * Math.pow(this.factor, attempt),
      this.maxDelay
    );
    
    if (this.jitter) {
      // Add random jitter (±25%)
      const jitterAmount = delay * 0.25;
      delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default {
  CircuitBreaker,
  CircuitBreakerFactory,
  RetryManager,
  CircuitState
};