const { Transform } = require('stream');
const EventEmitter = require('events');

/**
 * Stream Optimizer for AI Responses
 * 
 * Improves perceived performance by:
 * - Streaming responses as they arrive
 * - Progressive rendering
 * - Early partial results
 * - Chunking for better UX
 */
class StreamOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      chunkSize: config.chunkSize || 50, // tokens per chunk
      streamDelay: config.streamDelay || 50, // ms between chunks for UX
      enableProgressive: config.enableProgressive !== false,
      enableEarlyHints: config.enableEarlyHints !== false,
      bufferSize: config.bufferSize || 1000,
      ...config
    };

    this.activeStreams = new Map();
    this.metrics = {
      totalStreams: 0,
      activeStreams: 0,
      avgTimeToFirstByte: 0,
      avgCompletionTime: 0
    };
  }

  /**
   * Create optimized stream for AI response
   */
  createStream(requestId, options = {}) {
    const streamConfig = {
      ...this.config,
      ...options,
      requestId,
      startTime: Date.now(),
      firstByteTime: null,
      chunks: [],
      buffer: ''
    };

    // Create transform stream for processing
    const transformer = new Transform({
      transform: (chunk, encoding, callback) => {
        this.processChunk(streamConfig, chunk, callback);
      },
      flush: (callback) => {
        this.finalizeStream(streamConfig, callback);
      }
    });

    // Store stream reference
    this.activeStreams.set(requestId, {
      config: streamConfig,
      transformer,
      status: 'active'
    });

    this.metrics.activeStreams++;
    this.metrics.totalStreams++;

    // Set up event handlers
    transformer.on('error', (error) => {
      this.handleStreamError(requestId, error);
    });

    transformer.on('end', () => {
      this.handleStreamEnd(requestId);
    });

    return transformer;
  }

  /**
   * Process incoming chunk
   */
  processChunk(config, chunk, callback) {
    try {
      const text = chunk.toString();
      config.buffer += text;

      // Record time to first byte
      if (!config.firstByteTime && text.length > 0) {
        config.firstByteTime = Date.now();
        const ttfb = config.firstByteTime - config.startTime;
        this.updateMetrics('ttfb', ttfb);
        
        // Send early hint if enabled
        if (this.config.enableEarlyHints) {
          this.sendEarlyHint(config.requestId);
        }
      }

      // Process buffer into meaningful chunks
      const processedChunks = this.intelligentChunking(config.buffer);
      
      for (const processedChunk of processedChunks) {
        // Apply streaming delay for better UX
        if (this.config.streamDelay > 0) {
          setTimeout(() => {
            callback(null, processedChunk);
          }, this.config.streamDelay);
        } else {
          callback(null, processedChunk);
        }
        
        config.chunks.push(processedChunk);
      }

      // Keep remainder in buffer
      config.buffer = this.getBufferRemainder(config.buffer, processedChunks);

    } catch (error) {
      callback(error);
    }
  }

  /**
   * Intelligent chunking for better readability
   */
  intelligentChunking(buffer) {
    const chunks = [];
    
    if (buffer.length < this.config.chunkSize) {
      return chunks; // Wait for more data
    }

    // Split by natural boundaries
    const boundaries = [
      { pattern: /\.\s+/g, priority: 1 },      // Sentences
      { pattern: /,\s+/g, priority: 2 },       // Clauses
      { pattern: /\s+/g, priority: 3 },        // Words
      { pattern: /(.{50,100})/g, priority: 4 } // Fallback to character count
    ];

    let processedText = buffer;
    let lastChunkEnd = 0;

    // Try to find natural breaking points
    for (const boundary of boundaries) {
      const matches = Array.from(processedText.matchAll(boundary.pattern));
      
      if (matches.length > 0) {
        for (const match of matches) {
          const chunkEnd = match.index + match[0].length;
          
          if (chunkEnd - lastChunkEnd >= this.config.chunkSize) {
            chunks.push(processedText.substring(lastChunkEnd, chunkEnd));
            lastChunkEnd = chunkEnd;
            
            // Break if we've processed enough
            if (lastChunkEnd > buffer.length - this.config.chunkSize) {
              break;
            }
          }
        }
        
        if (chunks.length > 0) break;
      }
    }

    return chunks;
  }

  /**
   * Get remaining buffer after chunking
   */
  getBufferRemainder(buffer, chunks) {
    const processedLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return buffer.substring(processedLength);
  }

  /**
   * Send early hint about response
   */
  sendEarlyHint(requestId) {
    this.emit('early-hint', {
      requestId,
      hint: 'Response streaming started',
      timestamp: Date.now()
    });
  }

  /**
   * Finalize stream
   */
  finalizeStream(config, callback) {
    // Process any remaining buffer
    if (config.buffer.length > 0) {
      callback(null, config.buffer);
      config.chunks.push(config.buffer);
      config.buffer = '';
    }

    // Calculate final metrics
    const completionTime = Date.now() - config.startTime;
    this.updateMetrics('completion', completionTime);

    // Mark stream as complete
    const stream = this.activeStreams.get(config.requestId);
    if (stream) {
      stream.status = 'complete';
      stream.completionTime = completionTime;
    }

    callback();
  }

  /**
   * Handle stream error
   */
  handleStreamError(requestId, error) {
    const stream = this.activeStreams.get(requestId);
    if (stream) {
      stream.status = 'error';
      stream.error = error;
    }

    this.emit('stream-error', {
      requestId,
      error: error.message
    });

    this.metrics.activeStreams--;
  }

  /**
   * Handle stream end
   */
  handleStreamEnd(requestId) {
    const stream = this.activeStreams.get(requestId);
    if (stream && stream.status === 'active') {
      stream.status = 'complete';
    }

    this.metrics.activeStreams--;

    // Clean up after delay
    setTimeout(() => {
      this.activeStreams.delete(requestId);
    }, 60000); // Keep for 1 minute for debugging
  }

  /**
   * Update metrics
   */
  updateMetrics(type, value) {
    switch (type) {
      case 'ttfb':
        const currentAvgTTFB = this.metrics.avgTimeToFirstByte;
        const totalTTFB = currentAvgTTFB * (this.metrics.totalStreams - 1) + value;
        this.metrics.avgTimeToFirstByte = totalTTFB / this.metrics.totalStreams;
        break;
        
      case 'completion':
        const currentAvgCompletion = this.metrics.avgCompletionTime;
        const totalCompletion = currentAvgCompletion * (this.metrics.totalStreams - 1) + value;
        this.metrics.avgCompletionTime = totalCompletion / this.metrics.totalStreams;
        break;
    }
  }

  /**
   * Progressive response builder
   * Builds response progressively for better UX
   */
  createProgressiveResponse(requestId) {
    return {
      metadata: {
        requestId,
        startTime: Date.now(),
        status: 'streaming'
      },
      sections: [],
      
      addSection: function(type, content) {
        this.sections.push({
          type,
          content,
          timestamp: Date.now()
        });
        return this;
      },
      
      getPartial: function() {
        return {
          ...this.metadata,
          sections: this.sections,
          partial: true
        };
      },
      
      finalize: function() {
        this.metadata.status = 'complete';
        this.metadata.endTime = Date.now();
        this.metadata.duration = this.metadata.endTime - this.metadata.startTime;
        return {
          ...this.metadata,
          sections: this.sections,
          partial: false
        };
      }
    };
  }

  /**
   * Stream multiplexer for parallel AI calls
   */
  createMultiplexer(requestIds) {
    const multiplexer = new EventEmitter();
    const streams = new Map();
    const results = new Map();
    let completed = 0;

    for (const requestId of requestIds) {
      const stream = this.createStream(requestId);
      streams.set(requestId, stream);
      results.set(requestId, []);

      stream.on('data', (chunk) => {
        results.get(requestId).push(chunk);
        multiplexer.emit('partial', {
          requestId,
          chunk,
          progress: completed / requestIds.length
        });
      });

      stream.on('end', () => {
        completed++;
        if (completed === requestIds.length) {
          multiplexer.emit('complete', {
            results: Object.fromEntries(results)
          });
        }
      });

      stream.on('error', (error) => {
        multiplexer.emit('error', {
          requestId,
          error
        });
      });
    }

    return {
      multiplexer,
      streams
    };
  }

  /**
   * Adaptive streaming based on network conditions
   */
  adaptToNetworkConditions(bandwidth) {
    if (bandwidth < 1000) {
      // Low bandwidth: larger chunks, less frequent
      this.config.chunkSize = 200;
      this.config.streamDelay = 200;
    } else if (bandwidth < 5000) {
      // Medium bandwidth: balanced
      this.config.chunkSize = 100;
      this.config.streamDelay = 100;
    } else {
      // High bandwidth: smaller chunks, more frequent
      this.config.chunkSize = 50;
      this.config.streamDelay = 50;
    }

    this.emit('adaptive-config', {
      bandwidth,
      chunkSize: this.config.chunkSize,
      streamDelay: this.config.streamDelay
    });
  }

  /**
   * Create formatted stream for specific output types
   */
  createFormattedStream(requestId, format) {
    const baseStream = this.createStream(requestId);
    
    switch (format) {
      case 'markdown':
        return this.createMarkdownStream(baseStream);
      case 'json':
        return this.createJSONStream(baseStream);
      case 'html':
        return this.createHTMLStream(baseStream);
      default:
        return baseStream;
    }
  }

  /**
   * Create markdown-formatted stream
   */
  createMarkdownStream(baseStream) {
    const mdStream = new Transform({
      transform: (chunk, encoding, callback) => {
        // Format chunk as markdown
        const formatted = this.formatAsMarkdown(chunk.toString());
        callback(null, formatted);
      }
    });

    baseStream.pipe(mdStream);
    return mdStream;
  }

  /**
   * Create JSON-formatted stream
   */
  createJSONStream(baseStream) {
    const jsonStream = new Transform({
      transform: (chunk, encoding, callback) => {
        try {
          const json = {
            type: 'chunk',
            content: chunk.toString(),
            timestamp: Date.now()
          };
          callback(null, JSON.stringify(json) + '\n');
        } catch (error) {
          callback(error);
        }
      }
    });

    baseStream.pipe(jsonStream);
    return jsonStream;
  }

  /**
   * Create HTML-formatted stream
   */
  createHTMLStream(baseStream) {
    const htmlStream = new Transform({
      transform: (chunk, encoding, callback) => {
        const escaped = this.escapeHtml(chunk.toString());
        const formatted = `<div class="stream-chunk">${escaped}</div>\n`;
        callback(null, formatted);
      }
    });

    baseStream.pipe(htmlStream);
    return htmlStream;
  }

  /**
   * Format text as markdown
   */
  formatAsMarkdown(text) {
    // Basic markdown formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '**$1**')  // Bold
      .replace(/\*(.*?)\*/g, '*$1*')        // Italic
      .replace(/```(.*?)```/gs, '```$1```') // Code blocks
      .replace(/`(.*?)`/g, '`$1`');         // Inline code
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
  }

  /**
   * Get stream statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      streams: Array.from(this.activeStreams.entries()).map(([id, stream]) => ({
        id,
        status: stream.status,
        duration: stream.completionTime || (Date.now() - stream.config.startTime),
        chunks: stream.config.chunks.length
      }))
    };
  }

  /**
   * Optimize for mobile devices
   */
  optimizeForMobile() {
    this.config.chunkSize = 30;
    this.config.streamDelay = 100;
    this.config.bufferSize = 500;
    
    this.emit('mobile-optimized', this.config);
  }

  /**
   * Reset stream for request
   */
  resetStream(requestId) {
    const stream = this.activeStreams.get(requestId);
    if (stream) {
      stream.transformer.destroy();
      this.activeStreams.delete(requestId);
      this.metrics.activeStreams--;
    }
  }

  /**
   * Cleanup old streams
   */
  cleanup() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [requestId, stream] of this.activeStreams) {
      if (stream.status === 'complete' || stream.status === 'error') {
        const age = now - (stream.completionTime || stream.config.startTime);
        if (age > timeout) {
          this.activeStreams.delete(requestId);
        }
      }
    }
  }
}

module.exports = StreamOptimizer;