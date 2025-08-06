const EventEmitter = require('events');

/**
 * AI Queue Manager
 * 
 * Manages request queuing with:
 * - Priority-based processing
 * - User tier differentiation
 * - Batch processing for free users
 * - Request deduplication
 * - Queue overflow protection
 */
class AIQueueManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrency: config.maxConcurrency || 10,
      maxQueueSize: config.maxQueueSize || 1000,
      timeout: config.timeout || 30000,
      batchInterval: config.batchInterval || 5000,
      deduplicationWindow: config.deduplicationWindow || 1000,
      ...config
    };

    // Priority queues for different user tiers
    this.queues = {
      priority: {
        items: [],
        processing: 0,
        maxConcurrency: Math.floor(this.config.maxConcurrency * 0.5)
      },
      standard: {
        items: [],
        processing: 0,
        maxConcurrency: Math.floor(this.config.maxConcurrency * 0.3)
      },
      batch: {
        items: [],
        processing: 0,
        maxConcurrency: Math.floor(this.config.maxConcurrency * 0.2)
      }
    };

    // Request deduplication
    this.pendingRequests = new Map();
    this.recentHashes = new Map();

    // Batch processing for free tier
    this.batchQueue = [];
    this.batchTimer = null;

    // Statistics
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalBatched: 0,
      totalDeduplicated: 0,
      avgWaitTime: 0,
      avgProcessingTime: 0
    };

    // Processing state
    this.isProcessing = false;
    this.processingInterval = null;

    this.initialize();
  }

  initialize() {
    // Start batch processing timer
    this.startBatchProcessor();

    // Start queue processor
    this.startQueueProcessor();

    // Monitor queue health
    this.monitorQueues();
  }

  /**
   * Enqueue a request based on priority
   */
  async enqueue(request) {
    const startTime = Date.now();
    
    // Check for duplicate requests
    const hash = this.hashRequest(request);
    if (this.recentHashes.has(hash)) {
      this.stats.totalDeduplicated++;
      return this.recentHashes.get(hash);
    }

    // Check queue capacity
    if (this.getTotalQueueSize() >= this.config.maxQueueSize) {
      throw new Error('Queue capacity exceeded. Please try again later.');
    }

    // Determine queue based on user tier
    const queueName = this.selectQueueName(request.userTier);
    const priority = this.calculatePriority(request);

    // Create job wrapper
    const job = {
      id: this.generateJobId(),
      request,
      priority,
      startTime,
      status: 'queued',
      retries: 0,
      resolve: null,
      reject: null
    };

    // Create promise for this job
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });

    // Add to appropriate queue
    this.queues[queueName].items.push(job);
    this.queues[queueName].items.sort((a, b) => b.priority - a.priority);

    this.stats.totalEnqueued++;

    // Store for deduplication
    this.recentHashes.set(hash, promise);
    
    // Clean up after deduplication window
    setTimeout(() => {
      this.recentHashes.delete(hash);
    }, this.config.deduplicationWindow);

    // Trigger processing
    this.processQueues();

    return promise;
  }

  /**
   * Start queue processor
   */
  startQueueProcessor() {
    this.processingInterval = setInterval(() => {
      this.processQueues();
    }, 100);
  }

  /**
   * Process all queues
   */
  async processQueues() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process each queue
      for (const [queueName, queue] of Object.entries(this.queues)) {
        while (queue.processing < queue.maxConcurrency && queue.items.length > 0) {
          const job = queue.items.shift();
          queue.processing++;
          this.processJob(job, queueName);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  async processJob(job, queueName) {
    job.status = 'processing';
    job.processingStartTime = Date.now();
    
    // Update wait time statistics
    const waitTime = job.processingStartTime - job.startTime;
    this.updateStats('waitTime', waitTime);

    try {
      // Execute the actual AI request
      const result = await this.executeRequest(job.request);
      
      job.status = 'completed';
      job.completionTime = Date.now();
      
      // Update processing time statistics
      const processingTime = job.completionTime - job.processingStartTime;
      this.updateStats('processingTime', processingTime);
      
      this.stats.totalProcessed++;
      
      this.emit('job-completed', {
        jobId: job.id,
        duration: job.completionTime - job.startTime,
        waitTime,
        processingTime
      });

      job.resolve(result);

    } catch (error) {
      job.status = 'failed';
      job.error = error;
      
      // Retry logic
      if (job.retries < 3) {
        job.retries++;
        job.status = 'retrying';
        this.queues[queueName].items.unshift(job);
      } else {
        this.emit('job-failed', {
          jobId: job.id,
          error: error.message,
          retries: job.retries
        });
        
        job.reject(error);
      }
    } finally {
      this.queues[queueName].processing--;
    }
  }

  /**
   * Execute the actual request (placeholder - integrates with AI providers)
   */
  async executeRequest(request) {
    // This would integrate with the actual AI provider
    // For now, simulate processing
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          content: `Processed request for ${request.agent}`,
          timestamp: Date.now()
        });
      }, Math.random() * 1000 + 500);
    });
  }

  /**
   * Select queue name based on user tier
   */
  selectQueueName(userTier) {
    switch (userTier) {
      case 'enterprise':
      case 'pro':
        return 'priority';
      case 'basic':
        return 'standard';
      case 'free':
      default:
        return 'batch';
    }
  }

  /**
   * Calculate request priority
   */
  calculatePriority(request) {
    let priority = 0;
    
    // User tier priority
    const tierPriorities = {
      enterprise: 100,
      pro: 75,
      basic: 50,
      free: 25
    };
    priority += tierPriorities[request.userTier] || 0;
    
    // Request type priority
    if (request.critical) priority += 50;
    if (request.realtime) priority += 25;
    if (request.background) priority -= 25;
    
    // Age-based priority boost (prevent starvation)
    const age = Date.now() - (request.timestamp || Date.now());
    priority += Math.min(age / 1000, 50); // Max 50 points for old requests
    
    return priority;
  }

  /**
   * Batch processing for free tier
   */
  async processBatch() {
    if (this.batchQueue.length === 0) return;
    
    const batch = this.batchQueue.splice(0, 10); // Process 10 at a time
    this.stats.totalBatched += batch.length;
    
    // Process batch requests
    const results = await Promise.allSettled(
      batch.map(item => this.executeRequest(item.request))
    );
    
    // Resolve individual promises
    results.forEach((result, index) => {
      const item = batch[index];
      if (result.status === 'fulfilled') {
        item.resolve(result.value);
      } else {
        item.reject(result.reason);
      }
    });
    
    this.emit('batch-processed', {
      size: batch.length,
      timestamp: Date.now()
    });
  }

  /**
   * Start batch processor
   */
  startBatchProcessor() {
    this.batchTimer = setInterval(() => {
      this.processBatch();
    }, this.config.batchInterval);
  }

  /**
   * Add request to batch queue
   */
  addToBatch(request) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        request,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      // Process immediately if batch is full
      if (this.batchQueue.length >= 10) {
        this.processBatch();
      }
    });
  }

  /**
   * Hash request for deduplication
   */
  hashRequest(request) {
    const key = `${request.agent}:${request.prompt}:${request.userTier}`;
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get total queue size
   */
  getTotalQueueSize() {
    return Object.values(this.queues).reduce(
      (total, queue) => total + queue.items.length + queue.processing,
      0
    ) + this.batchQueue.length;
  }

  /**
   * Monitor queue health
   */
  monitorQueues() {
    setInterval(() => {
      const status = {
        priority: {
          size: this.queues.priority.items.length,
          processing: this.queues.priority.processing
        },
        standard: {
          size: this.queues.standard.items.length,
          processing: this.queues.standard.processing
        },
        batch: {
          size: this.queues.batch.items.length,
          processing: this.queues.batch.processing,
          batchQueueSize: this.batchQueue.length
        },
        total: this.getTotalQueueSize()
      };
      
      // Emit warning if queues are getting full
      if (status.total > this.config.maxQueueSize * 0.8) {
        this.emit('queue-warning', {
          message: 'Queue approaching capacity',
          usage: status.total / this.config.maxQueueSize
        });
      }
      
      this.emit('queue-status', status);
    }, 10000); // Every 10 seconds
  }

  /**
   * Update statistics
   */
  updateStats(type, value) {
    switch (type) {
      case 'waitTime':
        const totalWait = this.stats.avgWaitTime * this.stats.totalProcessed + value;
        this.stats.avgWaitTime = totalWait / (this.stats.totalProcessed + 1);
        break;
      case 'processingTime':
        const totalProcessing = this.stats.avgProcessingTime * this.stats.totalProcessed + value;
        this.stats.avgProcessingTime = totalProcessing / (this.stats.totalProcessed + 1);
        break;
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      ...this.stats,
      queues: {
        priority: {
          size: this.queues.priority.items.length,
          processing: this.queues.priority.processing
        },
        standard: {
          size: this.queues.standard.items.length,
          processing: this.queues.standard.processing
        },
        batch: {
          size: this.queues.batch.items.length,
          processing: this.queues.batch.processing,
          batchQueueSize: this.batchQueue.length
        }
      },
      totalQueueSize: this.getTotalQueueSize(),
      capacity: this.config.maxQueueSize,
      utilization: this.getTotalQueueSize() / this.config.maxQueueSize
    };
  }

  /**
   * Clear all queues
   */
  async clearQueues() {
    this.queues.priority.items = [];
    this.queues.standard.items = [];
    this.queues.batch.items = [];
    this.batchQueue = [];
    this.pendingRequests.clear();
    this.recentHashes.clear();
  }

  /**
   * Pause processing
   */
  pauseProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Resume processing
   */
  resumeProcessing() {
    if (!this.processingInterval) {
      this.startQueueProcessor();
    }
    if (!this.batchTimer) {
      this.startBatchProcessor();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    const queueSize = this.getTotalQueueSize();
    const isHealthy = queueSize < this.config.maxQueueSize * 0.9;
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      queueSize,
      maxQueueSize: this.config.maxQueueSize,
      utilization: queueSize / this.config.maxQueueSize,
      stats: this.stats
    };
  }

  /**
   * Graceful cleanup
   */
  async cleanup() {
    // Stop accepting new requests
    this.pauseProcessing();
    
    // Wait for pending requests to complete
    const waitForEmpty = () => {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.getTotalQueueSize() === 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    };
    
    await waitForEmpty();
    
    // Process remaining batch
    await this.processBatch();
    
    // Clear all intervals
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    this.emit('cleanup-complete');
  }
}

module.exports = AIQueueManager;