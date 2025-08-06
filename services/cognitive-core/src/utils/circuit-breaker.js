// ==========================================
// COGNITIVE CORE SERVICE - Circuit Breaker Implementation
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by monitoring service health and failing fast
 * when dependencies are unhealthy
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 60000, // 1 minute
      timeout: options.timeout || 30000, // 30 seconds
      monitoringPeriod: options.monitoringPeriod || 10000, // 10 seconds
      volumeThreshold: options.volumeThreshold || 10, // Minimum calls before opening
      errorThresholdPercentage: options.errorThresholdPercentage || 50,
      logger: options.logger || console,
      eventEmitter: options.eventEmitter || null
    };

    // Circuit states: CLOSED, OPEN, HALF_OPEN
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;

    // Metrics for monitoring period
    this.metrics = {
      totalCalls: 0,
      failures: 0,
      successes: 0,
      timeouts: 0,
      rejections: 0,
      averageResponseTime: 0
    };

    // Rolling window for error rate calculation
    this.recentCalls = [];
    this.windowSize = 100; // Last 100 calls

    this.logger = this.options.logger;
    this.eventEmitter = this.options.eventEmitter;

    this.logger.info(`Circuit breaker '${this.name}' initialized`, {
      failureThreshold: this.options.failureThreshold,
      recoveryTimeout: this.options.recoveryTimeout,
      timeout: this.options.timeout
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    this.metrics.totalCalls++;
    this.requestCount++;

    // Check if circuit is OPEN
    if (this.state === 'OPEN') {
      if (this.canAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.logger.info(`Circuit breaker '${this.name}' transitioning to HALF_OPEN`);
        this.emitEvent('HALF_OPEN');
      } else {
        this.metrics.rejections++;
        this.logger.warn(`Circuit breaker '${this.name}' is OPEN, rejecting call`);
        return this.handleRejection(fallback);
      }
    }

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn, this.options.timeout);
      const responseTime = Date.now() - startTime;

      // Success handling
      this.onSuccess(responseTime);
      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.onFailure(error, responseTime);
      
      // If fallback is provided, try it
      if (fallback && typeof fallback === 'function') {
        try {
          this.logger.info(`Circuit breaker '${this.name}' executing fallback`);
          return await fallback();
        } catch (fallbackError) {
          this.logger.error(`Circuit breaker '${this.name}' fallback failed`, fallbackError);
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.metrics.timeouts++;
        reject(new Error(`Circuit breaker '${this.name}' timeout after ${timeout}ms`));
      }, timeout);

      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  onSuccess(responseTime) {
    this.successCount++;
    this.metrics.successes++;
    this.failureCount = 0; // Reset failure count on success
    this.updateAverageResponseTime(responseTime);
    this.addToWindow(true, responseTime);

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.logger.info(`Circuit breaker '${this.name}' recovered, transitioning to CLOSED`);
      this.emitEvent('CLOSED');
    }
  }

  /**
   * Handle failed execution
   */
  onFailure(error, responseTime) {
    this.failureCount++;
    this.metrics.failures++;
    this.lastFailureTime = Date.now();
    this.addToWindow(false, responseTime);

    this.logger.error(`Circuit breaker '${this.name}' recorded failure`, error, {
      failureCount: this.failureCount,
      state: this.state,
      errorRate: this.getErrorRate()
    });

    // Check if circuit should open
    if (this.shouldOpen()) {
      this.open();
    } else if (this.state === 'HALF_OPEN') {
      // Failed during half-open, go back to open
      this.open();
    }
  }

  /**
   * Check if circuit should open based on failure conditions
   */
  shouldOpen() {
    // Don't open if we haven't reached minimum volume threshold
    if (this.requestCount < this.options.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    if (this.failureCount >= this.options.failureThreshold) {
      return true;
    }

    // Check error rate threshold
    const errorRate = this.getErrorRate();
    if (errorRate >= this.options.errorThresholdPercentage) {
      return true;
    }

    return false;
  }

  /**
   * Open the circuit
   */
  open() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.options.recoveryTimeout;
    
    this.logger.warn(`Circuit breaker '${this.name}' opened`, {
      failureCount: this.failureCount,
      errorRate: this.getErrorRate(),
      nextAttempt: new Date(this.nextAttempt)
    });
    
    this.emitEvent('OPEN');
  }

  /**
   * Check if we can attempt to reset the circuit
   */
  canAttemptReset() {
    return Date.now() >= this.nextAttempt;
  }

  /**
   * Handle rejection when circuit is open
   */
  async handleRejection(fallback) {
    if (fallback && typeof fallback === 'function') {
      try {
        this.logger.info(`Circuit breaker '${this.name}' using fallback while OPEN`);
        return await fallback();
      } catch (fallbackError) {
        this.logger.error(`Circuit breaker '${this.name}' fallback failed while OPEN`, fallbackError);
        throw new Error(`Circuit breaker '${this.name}' is OPEN and fallback failed`);
      }
    }

    throw new Error(`Circuit breaker '${this.name}' is OPEN - service unavailable`);
  }

  /**
   * Add call result to rolling window
   */
  addToWindow(success, responseTime) {
    this.recentCalls.push({
      success,
      responseTime,
      timestamp: Date.now()
    });

    // Maintain window size
    if (this.recentCalls.length > this.windowSize) {
      this.recentCalls.shift();
    }
  }

  /**
   * Calculate current error rate based on recent calls
   */
  getErrorRate() {
    if (this.recentCalls.length === 0) return 0;

    const failures = this.recentCalls.filter(call => !call.success).length;
    return (failures / this.recentCalls.length) * 100;
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(responseTime) {
    const totalSuccesses = this.metrics.successes;
    if (totalSuccesses === 1) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (totalSuccesses - 1) + responseTime) / totalSuccesses;
    }
  }

  /**
   * Emit circuit breaker events
   */
  emitEvent(eventType) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(EventTypes.CIRCUIT_BREAKER_STATE_CHANGED, {
        circuitBreakerName: this.name,
        state: eventType,
        failureCount: this.failureCount,
        errorRate: this.getErrorRate(),
        metrics: this.getMetrics(),
        timestamp: new Date()
      });
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics() {
    return {
      name: this.name,
      state: this.state,
      totalCalls: this.metrics.totalCalls,
      successes: this.metrics.successes,
      failures: this.metrics.failures,
      timeouts: this.metrics.timeouts,
      rejections: this.metrics.rejections,
      failureCount: this.failureCount,
      errorRate: this.getErrorRate(),
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      nextAttempt: this.nextAttempt ? new Date(this.nextAttempt) : null,
      uptime: this.getUptime()
    };
  }

  /**
   * Calculate uptime percentage
   */
  getUptime() {
    const totalCalls = this.metrics.totalCalls;
    if (totalCalls === 0) return 100;
    
    const successful = this.metrics.successes;
    return Math.round((successful / totalCalls) * 100 * 100) / 100; // Two decimal places
  }

  /**
   * Get health status
   */
  getHealth() {
    return {
      name: this.name,
      healthy: this.state === 'CLOSED',
      state: this.state,
      errorRate: this.getErrorRate(),
      uptime: this.getUptime(),
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null
    };
  }

  /**
   * Reset circuit breaker (for testing or manual recovery)
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.recentCalls = [];
    
    // Reset metrics but keep historical totals
    this.metrics = {
      ...this.metrics,
      failures: 0,
      rejections: 0
    };

    this.logger.info(`Circuit breaker '${this.name}' manually reset`);
    this.emitEvent('RESET');
  }

  /**
   * Force open circuit (for testing or maintenance)
   */
  forceOpen() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.options.recoveryTimeout;
    
    this.logger.warn(`Circuit breaker '${this.name}' manually opened`);
    this.emitEvent('FORCED_OPEN');
  }

  /**
   * Force close circuit (for testing or manual recovery)
   */
  forceClose() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.nextAttempt = null;
    
    this.logger.info(`Circuit breaker '${this.name}' manually closed`);
    this.emitEvent('FORCED_CLOSED');
  }
}

/**
 * Circuit Breaker Factory for creating configured instances
 */
class CircuitBreakerFactory {
  constructor(logger, eventEmitter) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.breakers = new Map();
  }

  /**
   * Create or get circuit breaker
   */
  getBreaker(name, options = {}) {
    if (this.breakers.has(name)) {
      return this.breakers.get(name);
    }

    const breaker = new CircuitBreaker(name, {
      ...options,
      logger: this.logger,
      eventEmitter: this.eventEmitter
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers() {
    return Array.from(this.breakers.values());
  }

  /**
   * Get circuit breaker metrics for all breakers
   */
  getAllMetrics() {
    const metrics = {};
    for (const [name, breaker] of this.breakers.entries()) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Get health status for all breakers
   */
  getOverallHealth() {
    const breakers = this.getAllBreakers();
    const totalBreakers = breakers.length;
    const healthyBreakers = breakers.filter(b => b.getHealth().healthy).length;
    
    return {
      totalBreakers,
      healthyBreakers,
      unhealthyBreakers: totalBreakers - healthyBreakers,
      overallHealth: totalBreakers === 0 ? 100 : (healthyBreakers / totalBreakers) * 100,
      breakers: breakers.map(b => b.getHealth())
    };
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    this.logger.info('All circuit breakers reset');
  }
}

export { CircuitBreaker, CircuitBreakerFactory };