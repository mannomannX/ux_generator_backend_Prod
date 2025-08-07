/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures in distributed systems
 */

export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.timeout = options.timeout || 10000; // 10 seconds
    this.threshold = options.threshold || 5; // failures before opening
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    this.minimumRequests = options.minimumRequests || 10;
    this.errorThresholdPercentage = options.errorThresholdPercentage || 50;
    
    // Circuit states
    this.states = {
      CLOSED: 'CLOSED',
      OPEN: 'OPEN',
      HALF_OPEN: 'HALF_OPEN'
    };
    
    this.state = this.states.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
    this.requests = [];
    this.lastStateChange = Date.now();
    
    // Callbacks
    this.onOpen = options.onOpen || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onHalfOpen = options.onHalfOpen || (() => {});
    
    this.logger = options.logger || console;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback) {
    // Check if circuit is open
    if (this.state === this.states.OPEN) {
      if (Date.now() < this.nextAttempt) {
        // Circuit is still open
        this.logger.warn(`Circuit breaker ${this.name} is OPEN`);
        
        if (fallback) {
          return await fallback();
        }
        
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      
      // Try half-open state
      this.transitionTo(this.states.HALF_OPEN);
    }

    // Track request
    const requestStart = Date.now();
    
    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      
      // Record success
      this.recordSuccess(Date.now() - requestStart);
      
      return result;
    } catch (error) {
      // Record failure
      this.recordFailure(Date.now() - requestStart, error);
      
      // Use fallback if available
      if (fallback) {
        return await fallback();
      }
      
      throw error;
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn) {
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${this.timeout}ms`));
      }, this.timeout);

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
   * Record successful request
   */
  recordSuccess(responseTime) {
    this.failures = 0;
    this.successes++;
    
    // Add to request history
    this.addRequest({
      timestamp: Date.now(),
      success: true,
      responseTime
    });

    // Check if we should close the circuit
    if (this.state === this.states.HALF_OPEN) {
      if (this.successes >= this.minimumRequests) {
        this.transitionTo(this.states.CLOSED);
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure(responseTime, error) {
    this.failures++;
    this.successes = 0;
    
    // Add to request history
    this.addRequest({
      timestamp: Date.now(),
      success: false,
      responseTime,
      error: error.message
    });

    // Check if we should open the circuit
    if (this.state === this.states.CLOSED) {
      const errorRate = this.calculateErrorRate();
      
      if (this.failures >= this.threshold || errorRate > this.errorThresholdPercentage) {
        this.transitionTo(this.states.OPEN);
      }
    } else if (this.state === this.states.HALF_OPEN) {
      // Single failure in half-open state opens the circuit
      this.transitionTo(this.states.OPEN);
    }
  }

  /**
   * Add request to history
   */
  addRequest(request) {
    const now = Date.now();
    
    // Remove old requests outside monitoring period
    this.requests = this.requests.filter(
      req => now - req.timestamp < this.monitoringPeriod
    );
    
    this.requests.push(request);
  }

  /**
   * Calculate error rate
   */
  calculateErrorRate() {
    if (this.requests.length < this.minimumRequests) {
      return 0;
    }

    const failures = this.requests.filter(req => !req.success).length;
    return (failures / this.requests.length) * 100;
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    
    this.logger.info(`Circuit breaker ${this.name} transitioned from ${oldState} to ${newState}`);

    switch (newState) {
      case this.states.OPEN:
        this.nextAttempt = Date.now() + this.resetTimeout;
        this.onOpen();
        break;
      
      case this.states.CLOSED:
        this.failures = 0;
        this.successes = 0;
        this.onClose();
        break;
      
      case this.states.HALF_OPEN:
        this.failures = 0;
        this.successes = 0;
        this.onHalfOpen();
        break;
    }
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      errorRate: this.calculateErrorRate(),
      totalRequests: this.requests.length,
      lastStateChange: this.lastStateChange,
      nextAttempt: this.state === this.states.OPEN ? this.nextAttempt : null
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = this.states.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.requests = [];
    this.lastStateChange = Date.now();
    this.nextAttempt = Date.now();
    
    this.logger.info(`Circuit breaker ${this.name} has been reset`);
  }

  /**
   * Force open the circuit
   */
  open() {
    this.transitionTo(this.states.OPEN);
  }

  /**
   * Force close the circuit
   */
  close() {
    this.transitionTo(this.states.CLOSED);
  }
}

/**
 * Circuit Breaker Manager for multiple breakers
 */
export class CircuitBreakerManager {
  constructor(logger) {
    this.breakers = new Map();
    this.logger = logger;
  }

  /**
   * Create or get a circuit breaker
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({
        ...options,
        name,
        logger: this.logger
      }));
    }
    
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker
   */
  async execute(name, fn, fallback, options = {}) {
    const breaker = this.getBreaker(name, options);
    return await breaker.execute(fn, fallback);
  }

  /**
   * Get all circuit breakers status
   */
  getAllStatus() {
    const status = {};
    
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Health check
   */
  healthCheck() {
    const status = this.getAllStatus();
    const openBreakers = Object.values(status).filter(s => s.state === 'OPEN');
    
    return {
      healthy: openBreakers.length === 0,
      totalBreakers: this.breakers.size,
      openBreakers: openBreakers.length,
      status
    };
  }
}

export default CircuitBreakerManager;