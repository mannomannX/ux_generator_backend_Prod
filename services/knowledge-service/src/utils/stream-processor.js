/**
 * Stream Processor for Large Operations
 * Handles streaming of large datasets to prevent memory overload
 */

import { Transform, Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { CONFIG } from '../config/constants.js';
import { ErrorFactory } from './errors.js';

const pipelineAsync = promisify(pipeline);

/**
 * Chunk stream for processing large texts
 */
export class ChunkStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.chunkSize = options.chunkSize || CONFIG.RAG.CHUNKING.SIZE;
    this.chunkOverlap = options.chunkOverlap || CONFIG.RAG.CHUNKING.OVERLAP;
    this.buffer = '';
    this.chunkIndex = 0;
  }

  _transform(chunk, encoding, callback) {
    try {
      this.buffer += chunk.toString();
      
      while (this.buffer.length >= this.chunkSize) {
        const chunkEnd = this.chunkSize;
        const chunkText = this.buffer.substring(0, chunkEnd);
        
        this.push({
          index: this.chunkIndex++,
          text: chunkText,
          start: this.chunkIndex * (this.chunkSize - this.chunkOverlap),
          end: this.chunkIndex * (this.chunkSize - this.chunkOverlap) + chunkText.length
        });
        
        // Keep overlap for next chunk
        this.buffer = this.buffer.substring(chunkEnd - this.chunkOverlap);
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    if (this.buffer.length > 0) {
      this.push({
        index: this.chunkIndex++,
        text: this.buffer,
        start: this.chunkIndex * (this.chunkSize - this.chunkOverlap),
        end: this.chunkIndex * (this.chunkSize - this.chunkOverlap) + this.buffer.length
      });
    }
    callback();
  }
}

/**
 * Batch stream for processing items in batches
 */
export class BatchStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.batchSize = options.batchSize || CONFIG.BATCH.MAX_SIZE.DOCUMENTS;
    this.batch = [];
    this.processBatch = options.processBatch || (async (batch) => batch);
  }

  async _transform(item, encoding, callback) {
    try {
      this.batch.push(item);
      
      if (this.batch.length >= this.batchSize) {
        const processedBatch = await this.processBatch(this.batch);
        this.push(processedBatch);
        this.batch = [];
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }

  async _flush(callback) {
    try {
      if (this.batch.length > 0) {
        const processedBatch = await this.processBatch(this.batch);
        this.push(processedBatch);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

/**
 * Embedding stream for generating embeddings in streaming fashion
 */
export class EmbeddingStream extends Transform {
  constructor(embeddingManager, options = {}) {
    super({ objectMode: true });
    this.embeddingManager = embeddingManager;
    this.provider = options.provider;
    this.batchSize = options.batchSize || CONFIG.BATCH.MAX_SIZE.EMBEDDINGS;
    this.buffer = [];
  }

  async _transform(chunk, encoding, callback) {
    try {
      this.buffer.push(chunk);
      
      if (this.buffer.length >= this.batchSize) {
        const embeddings = await this.embeddingManager.generateBatchEmbeddings(
          this.buffer.map(item => item.text),
          { provider: this.provider }
        );
        
        for (let i = 0; i < this.buffer.length; i++) {
          this.push({
            ...this.buffer[i],
            embedding: embeddings[i].embedding,
            embeddingProvider: embeddings[i].provider
          });
        }
        
        this.buffer = [];
      }
      
      callback();
    } catch (error) {
      callback(error);
    }
  }

  async _flush(callback) {
    try {
      if (this.buffer.length > 0) {
        const embeddings = await this.embeddingManager.generateBatchEmbeddings(
          this.buffer.map(item => item.text),
          { provider: this.provider }
        );
        
        for (let i = 0; i < this.buffer.length; i++) {
          this.push({
            ...this.buffer[i],
            embedding: embeddings[i].embedding,
            embeddingProvider: embeddings[i].provider
          });
        }
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
}

/**
 * Progress stream for tracking processing progress
 */
export class ProgressStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.total = options.total || 0;
    this.processed = 0;
    this.onProgress = options.onProgress || (() => {});
    this.reportInterval = options.reportInterval || 100;
  }

  _transform(chunk, encoding, callback) {
    this.processed++;
    
    if (this.processed % this.reportInterval === 0 || this.processed === this.total) {
      this.onProgress({
        processed: this.processed,
        total: this.total,
        percentage: this.total > 0 ? (this.processed / this.total * 100).toFixed(2) : 0
      });
    }
    
    this.push(chunk);
    callback();
  }
}

/**
 * Stream processor for handling large document operations
 */
export class StreamProcessor {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Process large document with streaming
   */
  async processLargeDocument(document, processor, options = {}) {
    return new Promise((resolve, reject) => {
      const results = [];
      const errors = [];
      
      // Create readable stream from document
      const readable = Readable.from(document);
      
      // Create processing pipeline
      const chunkStream = new ChunkStream({
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap
      });
      
      const processStream = new Transform({
        objectMode: true,
        async transform(chunk, encoding, callback) {
          try {
            const result = await processor(chunk);
            this.push(result);
            callback();
          } catch (error) {
            errors.push({ chunk: chunk.index, error: error.message });
            callback(); // Continue processing despite errors
          }
        }
      });
      
      const collectStream = new Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          results.push(chunk);
          callback();
        }
      });
      
      // Set up pipeline
      readable
        .pipe(chunkStream)
        .pipe(processStream)
        .pipe(collectStream)
        .on('finish', () => {
          if (errors.length > 0) {
            this.logger.warn('Stream processing completed with errors', { errors });
          }
          resolve({ results, errors });
        })
        .on('error', reject);
    });
  }

  /**
   * Process documents in streaming batches
   */
  async processBatchStream(documents, processor, options = {}) {
    const batchSize = options.batchSize || CONFIG.BATCH.MAX_SIZE.DOCUMENTS;
    const results = [];
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      
      // Process batch
      const batchResults = await Promise.allSettled(
        batch.map(doc => processor(doc))
      );
      
      // Collect results and handle errors
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          this.logger.error('Batch processing error', {
            document: batch[j].id,
            error: result.reason
          });
          
          if (options.stopOnError) {
            throw ErrorFactory.databaseOperation('batch_processing', result.reason);
          }
        }
      }
      
      // Report progress
      if (options.onProgress) {
        options.onProgress({
          processed: Math.min(i + batchSize, documents.length),
          total: documents.length,
          percentage: ((Math.min(i + batchSize, documents.length) / documents.length) * 100).toFixed(2)
        });
      }
      
      // Yield control to prevent blocking
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return results;
  }

  /**
   * Stream search results with pagination
   */
  async *streamSearchResults(searchFn, query, options = {}) {
    const pageSize = options.pageSize || 100;
    let page = 0;
    let hasMore = true;
    
    while (hasMore) {
      const results = await searchFn(query, {
        ...options,
        skip: page * pageSize,
        limit: pageSize
      });
      
      if (results.length < pageSize) {
        hasMore = false;
      }
      
      for (const result of results) {
        yield result;
      }
      
      page++;
      
      // Prevent infinite loops
      if (page > 1000) {
        this.logger.warn('Stream search reached maximum pages', { query, page });
        break;
      }
    }
  }

  /**
   * Create transform stream for custom processing
   */
  createTransformStream(transformFn, options = {}) {
    return new Transform({
      objectMode: true,
      highWaterMark: options.highWaterMark || 16,
      async transform(chunk, encoding, callback) {
        try {
          const result = await transformFn(chunk);
          if (result !== undefined && result !== null) {
            this.push(result);
          }
          callback();
        } catch (error) {
          if (options.skipErrors) {
            this.emit('error-skipped', { chunk, error });
            callback();
          } else {
            callback(error);
          }
        }
      }
    });
  }

  /**
   * Memory-efficient array processing
   */
  async processArrayInChunks(array, processor, chunkSize = 100) {
    const results = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      const chunk = array.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(processor));
      results.push(...chunkResults);
      
      // Allow garbage collection
      if (i % (chunkSize * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
        
        if (global.gc) {
          global.gc();
        }
      }
    }
    
    return results;
  }

  /**
   * Stream JSON array parsing for large files
   */
  createJSONStreamParser() {
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    
    return new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const str = chunk.toString();
        
        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          buffer += char;
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{' || char === '[') {
              depth++;
            } else if (char === '}' || char === ']') {
              depth--;
              
              if (depth === 1 && buffer.trim().endsWith('}')) {
                // Complete JSON object found
                try {
                  const obj = JSON.parse(buffer.trim().slice(0, -1));
                  this.push(obj);
                  buffer = '';
                } catch (error) {
                  // Continue buffering
                }
              }
            }
          }
        }
        
        callback();
      }
    });
  }
}

/**
 * Create a memory-monitored stream
 */
export class MemoryMonitorStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true });
    this.maxMemory = options.maxMemory || CONFIG.PERFORMANCE.LIMITS.MAX_MEMORY_USAGE;
    this.checkInterval = options.checkInterval || 100;
    this.processed = 0;
  }

  _transform(chunk, encoding, callback) {
    this.processed++;
    
    if (this.processed % this.checkInterval === 0) {
      const memUsage = process.memoryUsage();
      
      if (memUsage.heapUsed > this.maxMemory) {
        callback(new Error(`Memory limit exceeded: ${memUsage.heapUsed} > ${this.maxMemory}`));
        return;
      }
    }
    
    this.push(chunk);
    callback();
  }
}

export default {
  ChunkStream,
  BatchStream,
  EmbeddingStream,
  ProgressStream,
  StreamProcessor,
  MemoryMonitorStream
};