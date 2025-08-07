/**
 * Asynchronous Queue for Embedding Generation
 * Manages background processing of embedding requests with priority support
 */

import { EventEmitter } from 'events';
import { CONFIG } from '../config/constants.js';
import { ErrorFactory } from './errors.js';

/**
 * Priority queue for managing embedding generation tasks
 */
export class EmbeddingQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.concurrency = options.concurrency || CONFIG.PERFORMANCE.LIMITS.MAX_CONCURRENT_OPERATIONS;
    this.maxQueueSize = options.maxQueueSize || CONFIG.PERFORMANCE.LIMITS.MAX_QUEUE_SIZE;
    this.timeout = options.timeout || CONFIG.PERFORMANCE.TIMEOUTS.EMBEDDING;
    
    this.queue = [];
    this.processing = new Map();
    this.results = new Map();
    this.errors = new Map();
    this.workers = [];
    
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      avgProcessingTime: 0,
      currentQueueSize: 0
    };
    
    this.isRunning = false;
  }

  /**
   * Start the queue processing
   */
  start() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // Create workers
    for (let i = 0; i < this.concurrency; i++) {
      this.workers.push(this.createWorker(i));
    }
    
    this.emit('started');
  }

  /**
   * Stop the queue processing
   */
  async stop() {
    this.isRunning = false;
    
    // Wait for current processing to complete
    await Promise.all(Array.from(this.processing.values()));
    
    this.emit('stopped');
  }

  /**
   * Create a worker to process tasks
   */
  createWorker(workerId) {
    return (async () => {
      while (this.isRunning) {
        const task = this.dequeue();
        
        if (!task) {
          // No tasks available, wait a bit
          await this.sleep(100);
          continue;
        }
        
        await this.processTask(task, workerId);
      }
    })();
  }

  /**
   * Add a task to the queue
   */
  async enqueue(task, options = {}) {
    if (this.queue.length >= this.maxQueueSize) {
      throw ErrorFactory.databaseOperation(
        'queue_full',
        `Queue size limit reached: ${this.maxQueueSize}`
      );
    }
    
    const taskId = this.generateTaskId();
    const priority = options.priority || 0;
    
    const queueItem = {
      id: taskId,
      task,
      priority,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries || 3
    };
    
    // Add to queue based on priority
    if (priority > 0) {
      // Find insertion point for priority queue
      const insertIndex = this.queue.findIndex(item => item.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(queueItem);
      } else {
        this.queue.splice(insertIndex, 0, queueItem);
      }
    } else {
      this.queue.push(queueItem);
    }
    
    this.stats.enqueued++;
    this.stats.currentQueueSize = this.queue.length;
    
    this.emit('enqueued', { taskId, priority, queueSize: this.queue.length });
    
    // Return promise that resolves when task is completed
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.results.has(taskId)) {
          clearInterval(checkInterval);
          const result = this.results.get(taskId);
          this.results.delete(taskId);
          resolve(result);
        } else if (this.errors.has(taskId)) {
          clearInterval(checkInterval);
          const error = this.errors.get(taskId);
          this.errors.delete(taskId);
          reject(error);
        }
      }, 100);
      
      // Timeout handling
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Task ${taskId} timed out after ${this.timeout}ms`));
      }, this.timeout);
    });
  }

  /**
   * Remove a task from the queue
   */
  dequeue() {
    const task = this.queue.shift();
    if (task) {
      this.stats.currentQueueSize = this.queue.length;
    }
    return task;
  }

  /**
   * Process a single task
   */
  async processTask(queueItem, workerId) {
    const { id, task, retries, maxRetries } = queueItem;
    const startTime = Date.now();
    
    try {
      this.processing.set(id, task);
      this.emit('processing', { taskId: id, workerId });
      
      // Execute the task
      const result = await this.executeTask(task);
      
      // Store result
      this.results.set(id, result);
      this.processing.delete(id);
      
      // Update stats
      this.stats.processed++;
      const processingTime = Date.now() - startTime;
      this.stats.avgProcessingTime = 
        (this.stats.avgProcessingTime * (this.stats.processed - 1) + processingTime) / 
        this.stats.processed;
      
      this.emit('completed', { taskId: id, workerId, processingTime });
      
    } catch (error) {
      this.processing.delete(id);
      
      if (retries < maxRetries) {
        // Retry the task
        queueItem.retries++;
        await this.sleep(Math.pow(2, retries) * 1000); // Exponential backoff
        this.queue.unshift(queueItem); // Add back to front of queue
        
        this.emit('retry', { taskId: id, attempt: retries + 1, maxRetries });
      } else {
        // Max retries reached
        this.errors.set(id, error);
        this.stats.failed++;
        
        this.emit('failed', { taskId: id, error: error.message });
      }
    }
  }

  /**
   * Execute the actual task
   */
  async executeTask(task) {
    if (typeof task === 'function') {
      return await task();
    } else if (task.fn && typeof task.fn === 'function') {
      return await task.fn(...(task.args || []));
    } else {
      throw new Error('Invalid task format');
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      processing: this.processing.size,
      waiting: this.queue.length,
      throughput: this.stats.processed > 0 
        ? (this.stats.processed / (Date.now() - this.startTime) * 1000).toFixed(2) + ' tasks/sec'
        : '0 tasks/sec'
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.stats.currentQueueSize = 0;
    this.emit('cleared');
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Async embedding generator using queue
 */
export class AsyncEmbeddingGenerator {
  constructor(embeddingManager, logger, options = {}) {
    this.embeddingManager = embeddingManager;
    this.logger = logger;
    
    this.queue = new EmbeddingQueue({
      concurrency: options.concurrency || 5,
      maxQueueSize: options.maxQueueSize || 1000,
      timeout: options.timeout || 30000
    });
    
    // Set up event listeners
    this.queue.on('completed', ({ taskId, processingTime }) => {
      this.logger.debug('Embedding task completed', { taskId, processingTime });
    });
    
    this.queue.on('failed', ({ taskId, error }) => {
      this.logger.error('Embedding task failed', { taskId, error });
    });
    
    this.queue.on('retry', ({ taskId, attempt }) => {
      this.logger.warn('Retrying embedding task', { taskId, attempt });
    });
    
    // Start the queue
    this.queue.start();
  }

  /**
   * Generate embedding asynchronously
   */
  async generateEmbeddingAsync(text, options = {}) {
    const task = {
      fn: async () => {
        return await this.embeddingManager.generateEmbedding(text, options);
      }
    };
    
    return await this.queue.enqueue(task, options);
  }

  /**
   * Generate batch embeddings asynchronously
   */
  async generateBatchEmbeddingsAsync(texts, options = {}) {
    const batchSize = options.batchSize || CONFIG.BATCH.MAX_SIZE.EMBEDDINGS;
    const results = [];
    
    // Split into batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const task = {
        fn: async () => {
          return await this.embeddingManager.generateBatchEmbeddings(batch, options);
        }
      };
      
      const batchResults = await this.queue.enqueue(task, {
        ...options,
        priority: options.priority || 0
      });
      
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Process document embeddings with progress tracking
   */
  async processDocumentEmbeddings(documents, options = {}) {
    const total = documents.length;
    const results = [];
    const errors = [];
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      
      try {
        const embedding = await this.generateEmbeddingAsync(
          doc.content || doc.text,
          {
            ...options,
            priority: doc.priority || 0
          }
        );
        
        results.push({
          documentId: doc.id,
          embedding: embedding.embedding,
          provider: embedding.provider
        });
        
        // Report progress
        if (options.onProgress) {
          options.onProgress({
            current: i + 1,
            total,
            percentage: ((i + 1) / total * 100).toFixed(2)
          });
        }
      } catch (error) {
        errors.push({
          documentId: doc.id,
          error: error.message
        });
        
        if (options.stopOnError) {
          throw error;
        }
      }
    }
    
    return { results, errors };
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      isRunning: this.queue.isRunning,
      stats: this.queue.getStats()
    };
  }

  /**
   * Stop the async generator
   */
  async stop() {
    await this.queue.stop();
  }
}

/**
 * Batch processor for parallel processing
 */
export class BatchProcessor {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.batchSize = options.batchSize || 10;
  }

  /**
   * Process items in parallel batches
   */
  async processBatches(items, processor, options = {}) {
    const results = [];
    const errors = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      // Process batch items in parallel
      const batchPromises = batch.map(async (item, index) => {
        try {
          const result = await processor(item);
          return { success: true, result, index: i + index };
        } catch (error) {
          return { success: false, error, index: i + index };
        }
      });
      
      // Wait for batch to complete with concurrency limit
      const batchResults = await this.processWithConcurrency(
        batchPromises,
        this.concurrency
      );
      
      // Collect results
      for (const batchResult of batchResults) {
        if (batchResult.success) {
          results[batchResult.index] = batchResult.result;
        } else {
          errors.push({
            index: batchResult.index,
            error: batchResult.error
          });
        }
      }
      
      // Report progress
      if (options.onProgress) {
        options.onProgress({
          processed: Math.min(i + this.batchSize, items.length),
          total: items.length,
          errors: errors.length
        });
      }
    }
    
    return { results, errors };
  }

  /**
   * Process promises with concurrency limit
   */
  async processWithConcurrency(promises, limit) {
    const results = [];
    const executing = [];
    
    for (const promise of promises) {
      const p = Promise.resolve(promise);
      results.push(p);
      
      if (limit <= promises.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
    }
    
    return Promise.all(results);
  }
}

export default {
  EmbeddingQueue,
  AsyncEmbeddingGenerator,
  BatchProcessor
};