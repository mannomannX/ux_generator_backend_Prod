// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/security/embedding-security.js
// Embedding poisoning detection and prevention
// ==========================================

import { Logger } from '@ux-flow/common';
import crypto from 'crypto';

class EmbeddingSecurity {
  constructor(logger = new Logger('EmbeddingSecurity')) {
    this.logger = logger;
    
    // Embedding constraints
    this.constraints = {
      minDimensions: 128,
      maxDimensions: 4096,
      minValue: -100,
      maxValue: 100,
      maxL2Norm: 10,
      minL2Norm: 0.01,
      maxCosineSimilarity: 0.999,
      minCosineSimilarity: -0.999,
    };
    
    // Anomaly detection thresholds
    this.anomalyThresholds = {
      zeroRatio: 0.5, // Max ratio of zero values
      spikeRatio: 0.1, // Max ratio of extreme values
      entropyMin: 0.1, // Minimum entropy
      varianceMin: 0.001, // Minimum variance
      outlierStdDev: 4, // Standard deviations for outlier detection
    };
    
    // Differential privacy parameters
    this.privacyParams = {
      epsilon: 1.0, // Privacy budget
      delta: 1e-5, // Privacy parameter
      sensitivity: 2.0, // L2 sensitivity
      mechanism: 'laplace', // Noise mechanism
    };
    
    // Cache for known good embeddings
    this.trustedEmbeddings = new Map();
    this.maxCacheSize = 1000;
  }
  
  /**
   * Validate embedding vector
   */
  validateEmbedding(embedding, metadata = {}) {
    const validation = {
      valid: true,
      issues: [],
      sanitized: null,
      metadata: {},
    };
    
    try {
      // Check if embedding is an array
      if (!Array.isArray(embedding)) {
        validation.valid = false;
        validation.issues.push('Embedding must be an array');
        return validation;
      }
      
      // Check dimensions
      if (embedding.length < this.constraints.minDimensions) {
        validation.valid = false;
        validation.issues.push(`Embedding has too few dimensions (${embedding.length} < ${this.constraints.minDimensions})`);
        return validation;
      }
      
      if (embedding.length > this.constraints.maxDimensions) {
        validation.valid = false;
        validation.issues.push(`Embedding has too many dimensions (${embedding.length} > ${this.constraints.maxDimensions})`);
        return validation;
      }
      
      // Validate all values are numbers
      const nonNumbers = embedding.filter(v => typeof v !== 'number' || isNaN(v) || !isFinite(v));
      if (nonNumbers.length > 0) {
        validation.valid = false;
        validation.issues.push(`Embedding contains ${nonNumbers.length} non-numeric values`);
        return validation;
      }
      
      // Check value ranges
      const outOfRange = embedding.filter(v => v < this.constraints.minValue || v > this.constraints.maxValue);
      if (outOfRange.length > 0) {
        validation.issues.push(`${outOfRange.length} values out of range [${this.constraints.minValue}, ${this.constraints.maxValue}]`);
      }
      
      // Calculate statistics
      const stats = this.calculateStatistics(embedding);
      validation.metadata.statistics = stats;
      
      // Check for anomalies
      const anomalies = this.detectAnomalies(embedding, stats);
      if (anomalies.length > 0) {
        validation.issues.push(...anomalies);
        validation.metadata.anomalies = anomalies;
      }
      
      // Check L2 norm
      if (stats.l2Norm < this.constraints.minL2Norm || stats.l2Norm > this.constraints.maxL2Norm) {
        validation.issues.push(`L2 norm out of range: ${stats.l2Norm}`);
      }
      
      // Sanitize embedding
      validation.sanitized = this.sanitizeEmbedding(embedding);
      
      // Calculate hash for integrity
      validation.metadata.hash = this.calculateEmbeddingHash(validation.sanitized);
      
      // Check against known good embeddings if provided
      if (metadata.checkTrusted && !this.isTrustedEmbedding(validation.sanitized)) {
        validation.issues.push('Embedding does not match trusted patterns');
      }
      
    } catch (error) {
      validation.valid = false;
      validation.issues.push(`Validation error: ${error.message}`);
      this.logger.error('Embedding validation failed', error);
    }
    
    return validation;
  }
  
  /**
   * Calculate embedding statistics
   */
  calculateStatistics(embedding) {
    const n = embedding.length;
    
    // Basic statistics
    const sum = embedding.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    
    const squaredDiffs = embedding.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(variance);
    
    // L2 norm
    const l2Norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    
    // Min and max
    const min = Math.min(...embedding);
    const max = Math.max(...embedding);
    
    // Zero count
    const zeroCount = embedding.filter(v => v === 0).length;
    const zeroRatio = zeroCount / n;
    
    // Entropy (simplified)
    const uniqueValues = new Set(embedding);
    const entropy = Math.log2(uniqueValues.size) / Math.log2(n);
    
    // Spike detection
    const spikeThreshold = mean + (3 * stdDev);
    const spikeCount = embedding.filter(v => Math.abs(v - mean) > spikeThreshold).length;
    const spikeRatio = spikeCount / n;
    
    return {
      dimensions: n,
      mean,
      variance,
      stdDev,
      l2Norm,
      min,
      max,
      zeroCount,
      zeroRatio,
      entropy,
      spikeCount,
      spikeRatio,
    };
  }
  
  /**
   * Detect anomalies in embedding
   */
  detectAnomalies(embedding, stats) {
    const anomalies = [];
    
    // Check zero ratio
    if (stats.zeroRatio > this.anomalyThresholds.zeroRatio) {
      anomalies.push(`High zero ratio: ${stats.zeroRatio.toFixed(3)}`);
    }
    
    // Check spike ratio
    if (stats.spikeRatio > this.anomalyThresholds.spikeRatio) {
      anomalies.push(`High spike ratio: ${stats.spikeRatio.toFixed(3)}`);
    }
    
    // Check entropy
    if (stats.entropy < this.anomalyThresholds.entropyMin) {
      anomalies.push(`Low entropy: ${stats.entropy.toFixed(3)}`);
    }
    
    // Check variance
    if (stats.variance < this.anomalyThresholds.varianceMin) {
      anomalies.push(`Low variance: ${stats.variance.toFixed(6)}`);
    }
    
    // Check for repeated patterns
    const patterns = this.detectRepeatedPatterns(embedding);
    if (patterns.length > 0) {
      anomalies.push(`Repeated patterns detected: ${patterns.length}`);
    }
    
    // Check for outliers
    const outliers = this.detectOutliers(embedding, stats);
    if (outliers.length > 0) {
      anomalies.push(`${outliers.length} outliers detected`);
    }
    
    return anomalies;
  }
  
  /**
   * Detect repeated patterns in embedding
   */
  detectRepeatedPatterns(embedding, windowSize = 10) {
    const patterns = [];
    const seen = new Map();
    
    for (let i = 0; i <= embedding.length - windowSize; i++) {
      const window = embedding.slice(i, i + windowSize);
      const key = window.join(',');
      
      if (seen.has(key)) {
        patterns.push({ start: i, pattern: window });
      } else {
        seen.set(key, i);
      }
    }
    
    return patterns;
  }
  
  /**
   * Detect outliers using z-score
   */
  detectOutliers(embedding, stats) {
    const outliers = [];
    const threshold = this.anomalyThresholds.outlierStdDev;
    
    embedding.forEach((value, index) => {
      const zScore = Math.abs((value - stats.mean) / stats.stdDev);
      if (zScore > threshold) {
        outliers.push({ index, value, zScore });
      }
    });
    
    return outliers;
  }
  
  /**
   * Sanitize embedding vector
   */
  sanitizeEmbedding(embedding) {
    return embedding.map(value => {
      // Clamp values to valid range
      let sanitized = Math.max(this.constraints.minValue, Math.min(this.constraints.maxValue, value));
      
      // Round to reasonable precision
      sanitized = Math.round(sanitized * 1000000) / 1000000;
      
      // Replace NaN or Infinity with 0
      if (isNaN(sanitized) || !isFinite(sanitized)) {
        sanitized = 0;
      }
      
      return sanitized;
    });
  }
  
  /**
   * Apply differential privacy to embedding
   */
  applyDifferentialPrivacy(embedding, epsilon = this.privacyParams.epsilon) {
    const noised = embedding.map(value => {
      // Add Laplace noise
      const scale = this.privacyParams.sensitivity / epsilon;
      const noise = this.laplacianNoise(scale);
      return value + noise;
    });
    
    // Normalize to maintain magnitude
    const originalNorm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    const noisedNorm = Math.sqrt(noised.reduce((sum, v) => sum + v * v, 0));
    
    if (noisedNorm > 0) {
      const scaleFactor = originalNorm / noisedNorm;
      return noised.map(v => v * scaleFactor);
    }
    
    return noised;
  }
  
  /**
   * Generate Laplacian noise
   */
  laplacianNoise(scale) {
    const u = Math.random() - 0.5;
    return scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }
  
  /**
   * Calculate cosine similarity between embeddings
   */
  cosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have same dimensions');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (norm1 * norm2);
  }
  
  /**
   * Detect embedding poisoning attempts
   */
  detectPoisoning(embedding, referenceEmbeddings) {
    const issues = [];
    
    // Check similarity to reference embeddings
    for (const reference of referenceEmbeddings) {
      const similarity = this.cosineSimilarity(embedding, reference);
      
      // Check for exact matches (potential replay)
      if (similarity > this.constraints.maxCosineSimilarity) {
        issues.push(`Exact match detected (similarity: ${similarity})`);
      }
      
      // Check for inverse (potential adversarial)
      if (similarity < this.constraints.minCosineSimilarity) {
        issues.push(`Inverse pattern detected (similarity: ${similarity})`);
      }
    }
    
    // Check for adversarial patterns
    const adversarialPatterns = this.detectAdversarialPatterns(embedding);
    if (adversarialPatterns.length > 0) {
      issues.push(...adversarialPatterns);
    }
    
    return issues;
  }
  
  /**
   * Detect adversarial patterns
   */
  detectAdversarialPatterns(embedding) {
    const patterns = [];
    
    // Check for high-frequency noise
    let signChanges = 0;
    for (let i = 1; i < embedding.length; i++) {
      if (Math.sign(embedding[i]) !== Math.sign(embedding[i - 1])) {
        signChanges++;
      }
    }
    
    const signChangeRatio = signChanges / embedding.length;
    if (signChangeRatio > 0.4) {
      patterns.push(`High-frequency noise detected (${signChangeRatio.toFixed(2)})`);
    }
    
    // Check for gradient patterns
    const gradients = [];
    for (let i = 1; i < embedding.length; i++) {
      gradients.push(embedding[i] - embedding[i - 1]);
    }
    
    const gradientMean = gradients.reduce((a, b) => a + b, 0) / gradients.length;
    const gradientStd = Math.sqrt(
      gradients.reduce((sum, g) => sum + Math.pow(g - gradientMean, 2), 0) / gradients.length
    );
    
    if (gradientStd > 1) {
      patterns.push(`High gradient variation detected (${gradientStd.toFixed(2)})`);
    }
    
    return patterns;
  }
  
  /**
   * Calculate embedding hash for integrity
   */
  calculateEmbeddingHash(embedding) {
    const data = Buffer.from(new Float32Array(embedding).buffer);
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Check if embedding matches trusted patterns
   */
  isTrustedEmbedding(embedding) {
    const hash = this.calculateEmbeddingHash(embedding);
    return this.trustedEmbeddings.has(hash);
  }
  
  /**
   * Add embedding to trusted cache
   */
  addTrustedEmbedding(embedding) {
    const hash = this.calculateEmbeddingHash(embedding);
    
    // Limit cache size
    if (this.trustedEmbeddings.size >= this.maxCacheSize) {
      const firstKey = this.trustedEmbeddings.keys().next().value;
      this.trustedEmbeddings.delete(firstKey);
    }
    
    this.trustedEmbeddings.set(hash, {
      timestamp: Date.now(),
      dimensions: embedding.length,
    });
  }
  
  /**
   * Generate secure embedding metadata
   */
  generateMetadata(embedding) {
    const stats = this.calculateStatistics(embedding);
    const hash = this.calculateEmbeddingHash(embedding);
    
    return {
      hash,
      dimensions: embedding.length,
      timestamp: Date.now(),
      statistics: {
        mean: stats.mean,
        stdDev: stats.stdDev,
        l2Norm: stats.l2Norm,
      },
      version: '1.0',
    };
  }
}

export { EmbeddingSecurity };