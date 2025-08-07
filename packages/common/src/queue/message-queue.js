// ==========================================
// PACKAGES/COMMON/src/queue/message-queue.js
// ==========================================

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Message Queue System
 * Redis-based message queue for async operations with job processing, retries, and dead letter queues
 */
export class MessageQueue extends EventEmitter {
  constructor(redisClient, logger, options = {}) {
    super();
    
    this.redisClient = redisClient;
    this.logger = logger;
    this.options = {
      defaultRetryAttempts: 3,
      defaultRetryDelay: 5000, // 5 seconds
      jobTimeout: 300000, // 5 minutes
      cleanupInterval: 3600000, // 1 hour
      maxQueueSize: 10000,
      processingConcurrency: 5,
      deadLetterQueueRetention: 86400000, // 24 hours
      ...options
    };

    this.queues = new Map(); // Queue configurations
    this.processors = new Map(); // Job processors
    this.activeJobs = new Map(); // Currently processing jobs
    this.scheduledJobs = new Map(); // Delayed jobs

    this.isProcessing = false;
    this.cleanupInterval = null;

    this.setupCleanup();
  }

  /**
   * Register a queue with configuration
   */
  registerQueue(queueName, config = {}) {
    const queueConfig = {
      name: queueName,
      retryAttempts: config.retryAttempts || this.options.defaultRetryAttempts,
      retryDelay: config.retryDelay || this.options.defaultRetryDelay,
      timeout: config.timeout || this.options.jobTimeout,
      concurrency: config.concurrency || this.options.processingConcurrency,
      priority: config.priority || 0,
      ...config
    };

    this.queues.set(queueName, queueConfig);
    this.logger.info('Queue registered', { queueName, config: queueConfig });

    return queueConfig;
  }

  /**
   * Register a job processor
   */
  registerProcessor(queueName, processor) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    this.processors.set(queueName, processor);
    this.logger.info('Processor registered', { queueName });

    // Start processing if not already started
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob(queueName, jobData, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not registered`);
    }

    const jobId = options.jobId || randomUUID();
    const now = Date.now();
    
    const job = {
      id: jobId,
      queue: queueName,
      data: jobData,
      attempts: 0,
      maxAttempts: options.retryAttempts || queue.retryAttempts,
      createdAt: now,
      scheduledAt: options.delay ? now + options.delay : now,
      priority: options.priority || queue.priority,
      timeout: options.timeout || queue.timeout,
      metadata: {
        source: options.source || 'unknown',
        correlationId: options.correlationId,
        userId: options.userId,
        ...options.metadata
      }
    };

    // Check queue size limit
    const queueSize = await this.getQueueSize(queueName);
    if (queueSize >= this.options.maxQueueSize) {
      throw new Error(`Queue '${queueName}' is full (max: ${this.options.maxQueueSize})`);
    }

    // Add to appropriate queue based on scheduling
    if (options.delay) {
      await this.scheduleJob(job);
    } else {
      await this.enqueueJob(job);
    }

    this.logger.info('Job added to queue', {
      jobId,
      queueName,
      scheduled: !!options.delay,
      delay: options.delay
    });

    this.emit('job_added', { job, queue: queueName });
    return jobId;
  }

  /**
   * Add job to immediate processing queue
   */
  async enqueueJob(job) {
    const queueKey = this.getQueueKey(job.queue);
    const jobData = JSON.stringify(job);

    // Add to sorted set with priority and timestamp
    const score = job.priority * 1000000 + job.scheduledAt;
    await this.redisClient.zadd(queueKey, score, jobData);
  }

  /**
   * Schedule job for later processing
   */
  async scheduleJob(job) {
    const delayedKey = this.getDelayedKey(job.queue);
    const jobData = JSON.stringify(job);

    await this.redisClient.zadd(delayedKey, job.scheduledAt, jobData);
    
    // Store in local map for cleanup
    this.scheduledJobs.set(job.id, job);
  }

  /**
   * Start job processing
   */
  startProcessing() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.logger.info('Starting message queue processing');

    // Process each registered queue
    for (const [queueName, queue] of this.queues.entries()) {
      for (let i = 0; i < queue.concurrency; i++) {
        this.processQueue(queueName);
      }
    }

    // Process scheduled jobs
    setInterval(() => {
      this.processScheduledJobs();
    }, 1000); // Check every second

    this.emit('processing_started');
  }

  /**
   * Stop job processing
   */
  async stopProcessing() {
    this.isProcessing = false;
    this.logger.info('Stopping message queue processing');

    // Wait for active jobs to complete
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      this.logger.info('Waiting for active jobs to complete', { 
        activeJobs: activeJobIds.length 
      });
      
      await Promise.allSettled(
        Array.from(this.activeJobs.values()).map(job => job.promise)
      );
    }

    this.emit('processing_stopped');
  }

  /**
   * Process a specific queue
   */
  async processQueue(queueName) {
    while (this.isProcessing) {
      try {
        const job = await this.dequeueJob(queueName);
        if (!job) {
          // No jobs available, wait a bit
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        await this.processJob(job);
      } catch (error) {
        this.logger.error('Queue processing error', error, { queueName });
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s on error
      }
    }
  }

  /**
   * Dequeue the next job from a queue
   */
  async dequeueJob(queueName) {
    const queueKey = this.getQueueKey(queueName);
    
    // Get highest priority job (lowest score)
    const results = await this.redisClient.zrange(queueKey, 0, 0);
    if (!results || results.length === 0) {
      return null;
    }

    const jobData = results[0];
    
    // Remove from queue atomically
    const removed = await this.redisClient.zrem(queueKey, jobData);
    if (removed === 0) {
      // Another worker got this job
      return null;
    }

    try {
      return JSON.parse(jobData);
    } catch (error) {
      this.logger.error('Failed to parse job data', error, { jobData });
      return null;
    }
  }

  /**
   * Process scheduled jobs
   */
  async processScheduledJobs() {
    const now = Date.now();
    
    for (const [queueName] of this.queues) {
      const delayedKey = this.getDelayedKey(queueName);
      
      // Get jobs ready to process
      const readyJobs = await this.redisClient.zrangebyscore(delayedKey, 0, now);
      
      for (const jobData of readyJobs) {
        try {
          const job = JSON.parse(jobData);
          
          // Move to immediate queue
          await this.enqueueJob(job);
          await this.redisClient.zrem(delayedKey, jobData);
          
          this.scheduledJobs.delete(job.id);
          
          this.logger.debug('Scheduled job moved to queue', {
            jobId: job.id,
            queueName: job.queue
          });
        } catch (error) {
          this.logger.error('Failed to process scheduled job', error, { jobData });
        }
      }
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    const processor = this.processors.get(job.queue);
    if (!processor) {
      this.logger.error('No processor found for queue', { 
        jobId: job.id, 
        queueName: job.queue 
      });
      return;
    }

    const startTime = Date.now();
    job.attempts += 1;
    job.startedAt = startTime;

    // Track active job
    const jobPromise = this.executeJob(job, processor);
    this.activeJobs.set(job.id, { job, promise: jobPromise });

    this.logger.info('Job processing started', {
      jobId: job.id,
      queueName: job.queue,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });

    try {
      const result = await jobPromise;
      
      const completedJob = {
        ...job,
        completedAt: Date.now(),
        duration: Date.now() - startTime,
        result,
        status: 'completed'
      };

      await this.handleJobSuccess(completedJob);
      
    } catch (error) {
      const failedJob = {
        ...job,
        failedAt: Date.now(),
        duration: Date.now() - startTime,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        status: 'failed'
      };

      await this.handleJobFailure(failedJob, error);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Execute job with timeout
   */
  async executeJob(job, processor) {
    return new Promise(async (resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Job timeout after ${job.timeout}ms`));
      }, job.timeout);

      try {
        const result = await processor(job.data, job);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle successful job completion
   */
  async handleJobSuccess(job) {
    this.logger.info('Job completed successfully', {
      jobId: job.id,
      queueName: job.queue,
      duration: job.duration,
      attempt: job.attempts
    });

    // Store completion record
    await this.storeJobResult(job);
    
    this.emit('job_completed', job);
  }

  /**
   * Handle job failure
   */
  async handleJobFailure(job, error) {
    this.logger.error('Job failed', error, {
      jobId: job.id,
      queueName: job.queue,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });

    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      await this.retryJob(job);
    } else {
      await this.moveToDeadLetterQueue(job);
    }

    this.emit('job_failed', { job, error });
  }

  /**
   * Retry a failed job
   */
  async retryJob(job) {
    const queue = this.queues.get(job.queue);
    const retryDelay = queue.retryDelay * Math.pow(2, job.attempts - 1); // Exponential backoff
    
    const retryJob = {
      ...job,
      scheduledAt: Date.now() + retryDelay,
      status: 'retrying'
    };

    await this.scheduleJob(retryJob);
    
    this.logger.info('Job scheduled for retry', {
      jobId: job.id,
      queueName: job.queue,
      attempt: job.attempts,
      retryDelay
    });

    this.emit('job_retrying', retryJob);
  }

  /**
   * Move job to dead letter queue
   */
  async moveToDeadLetterQueue(job) {
    const dlqKey = this.getDeadLetterKey(job.queue);
    const jobData = JSON.stringify({
      ...job,
      status: 'dead_letter',
      deadLetterAt: Date.now()
    });

    await this.redisClient.lpush(dlqKey, jobData);
    
    this.logger.error('Job moved to dead letter queue', {
      jobId: job.id,
      queueName: job.queue,
      attempts: job.attempts
    });

    this.emit('job_dead_letter', job);
  }

  /**
   * Store job completion result
   */
  async storeJobResult(job) {
    const resultKey = this.getResultKey(job.id);
    const resultData = JSON.stringify({
      jobId: job.id,
      queue: job.queue,
      status: job.status,
      result: job.result,
      completedAt: job.completedAt,
      duration: job.duration,
      attempts: job.attempts
    });

    // Store with expiration (24 hours)
    await this.redisClient.setex(resultKey, 86400, resultData);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    // Check if job is currently active
    if (this.activeJobs.has(jobId)) {
      return { status: 'processing', job: this.activeJobs.get(jobId).job };
    }

    // Check if job is scheduled
    if (this.scheduledJobs.has(jobId)) {
      return { status: 'scheduled', job: this.scheduledJobs.get(jobId) };
    }

    // Check completion results
    const resultKey = this.getResultKey(jobId);
    const resultData = await this.redisClient.get(resultKey);
    
    if (resultData) {
      return { status: 'completed', result: JSON.parse(resultData) };
    }

    // Check all queues for pending jobs
    for (const [queueName] of this.queues) {
      const queueKey = this.getQueueKey(queueName);
      const jobs = await this.redisClient.zrange(queueKey, 0, -1);
      
      for (const jobData of jobs) {
        try {
          const job = JSON.parse(jobData);
          if (job.id === jobId) {
            return { status: 'queued', job };
          }
        } catch (error) {
          continue;
        }
      }
    }

    // Check dead letter queues
    for (const [queueName] of this.queues) {
      const dlqKey = this.getDeadLetterKey(queueName);
      const deadJobs = await this.redisClient.lrange(dlqKey, 0, -1);
      
      for (const jobData of deadJobs) {
        try {
          const job = JSON.parse(jobData);
          if (job.id === jobId) {
            return { status: 'failed', job };
          }
        } catch (error) {
          continue;
        }
      }
    }

    return { status: 'not_found' };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    const queueKey = this.getQueueKey(queueName);
    const delayedKey = this.getDelayedKey(queueName);
    const dlqKey = this.getDeadLetterKey(queueName);

    const [pending, scheduled, deadLetter] = await Promise.all([
      this.redisClient.zcard(queueKey),
      this.redisClient.zcard(delayedKey),
      this.redisClient.llen(dlqKey)
    ]);

    const activeCount = Array.from(this.activeJobs.values())
      .filter(activeJob => activeJob.job.queue === queueName).length;

    return {
      queueName,
      pending,
      scheduled,
      active: activeCount,
      deadLetter,
      total: pending + scheduled + activeCount + deadLetter
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};
    
    for (const [queueName] of this.queues) {
      stats[queueName] = await this.getQueueStats(queueName);
    }

    return {
      queues: stats,
      system: {
        isProcessing: this.isProcessing,
        totalActiveJobs: this.activeJobs.size,
        totalScheduledJobs: this.scheduledJobs.size,
        registeredQueues: this.queues.size,
        registeredProcessors: this.processors.size
      }
    };
  }

  /**
   * Get queue size
   */
  async getQueueSize(queueName) {
    const queueKey = this.getQueueKey(queueName);
    return await this.redisClient.zcard(queueKey);
  }

  /**
   * Clear a queue
   */
  async clearQueue(queueName) {
    const queueKey = this.getQueueKey(queueName);
    const delayedKey = this.getDelayedKey(queueName);
    
    const [pendingCleared, scheduledCleared] = await Promise.all([
      this.redisClient.del(queueKey),
      this.redisClient.del(delayedKey)
    ]);

    this.logger.info('Queue cleared', { 
      queueName, 
      pendingCleared, 
      scheduledCleared 
    });

    return { pendingCleared, scheduledCleared };
  }

  /**
   * Setup cleanup processes
   */
  setupCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadLetterQueues();
    }, this.options.cleanupInterval);
  }

  /**
   * Clean up old dead letter queue entries
   */
  async cleanupDeadLetterQueues() {
    const cutoff = Date.now() - this.options.deadLetterQueueRetention;
    
    for (const [queueName] of this.queues) {
      const dlqKey = this.getDeadLetterKey(queueName);
      const deadJobs = await this.redisClient.lrange(dlqKey, 0, -1);
      
      let cleaned = 0;
      for (const jobData of deadJobs) {
        try {
          const job = JSON.parse(jobData);
          if (job.deadLetterAt && job.deadLetterAt < cutoff) {
            await this.redisClient.lrem(dlqKey, 1, jobData);
            cleaned++;
          }
        } catch (error) {
          // Remove malformed data
          await this.redisClient.lrem(dlqKey, 1, jobData);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        this.logger.info('Cleaned up dead letter queue', { queueName, cleaned });
      }
    }
  }

  /**
   * Redis key helpers
   */
  getQueueKey(queueName) {
    return `mq:queue:${queueName}`;
  }

  getDelayedKey(queueName) {
    return `mq:delayed:${queueName}`;
  }

  getDeadLetterKey(queueName) {
    return `mq:dlq:${queueName}`;
  }

  getResultKey(jobId) {
    return `mq:result:${jobId}`;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    this.logger.info('Shutting down message queue');
    
    await this.stopProcessing();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.removeAllListeners();
  }
}

// Job types for common async operations
export const JobTypes = {
  EMAIL_SEND: 'email_send',
  AI_PROCESSING: 'ai_processing',
  DATA_EXPORT: 'data_export',
  FILE_PROCESSING: 'file_processing',
  WEBHOOK_DELIVERY: 'webhook_delivery',
  REPORT_GENERATION: 'report_generation',
  BACKUP_CREATE: 'backup_create',
  ANALYTICS_UPDATE: 'analytics_update'
};

// Singleton instance
let globalMessageQueue = null;

export const initializeMessageQueue = (redisClient, logger, options = {}) => {
  if (globalMessageQueue) {
    globalMessageQueue.shutdown();
  }
  globalMessageQueue = new MessageQueue(redisClient, logger, options);
  return globalMessageQueue;
};

export const getMessageQueue = () => {
  if (!globalMessageQueue) {
    throw new Error('Message queue not initialized. Call initializeMessageQueue() first.');
  }
  return globalMessageQueue;
};