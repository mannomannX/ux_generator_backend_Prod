// ==========================================
// FLOW SERVICE - Configurable Flow Limits
// ==========================================

export const flowLimits = {
  // Node limits - Based on OPEN_QUESTIONS_ANSWERS.md specifications
  MAX_NODES: parseInt(process.env.FLOW_MAX_NODES) || 1000, // Soft limit as per spec
  MAX_NODES_ENTERPRISE: parseInt(process.env.FLOW_MAX_NODES_ENTERPRISE) || 5000, // Enterprise can adjust
  
  // Edge limits  
  MAX_EDGES: parseInt(process.env.FLOW_MAX_EDGES) || 2000, // As per spec
  MAX_EDGES_ENTERPRISE: parseInt(process.env.FLOW_MAX_EDGES_ENTERPRISE) || 10000,
  
  // Size limits
  MAX_NODE_DATA_SIZE: parseInt(process.env.FLOW_MAX_NODE_DATA_SIZE) || 10240, // 10KB
  MAX_FLOW_SIZE: parseInt(process.env.FLOW_MAX_FLOW_SIZE) || 10485760, // 10MB as per spec
  
  // Versioning limits - Based on OPEN_QUESTIONS_ANSWERS.md
  MAX_VERSIONS_PER_FLOW: parseInt(process.env.FLOW_MAX_VERSIONS) || 100, // Hard limit as per spec
  VERSION_RETENTION_DAYS: parseInt(process.env.FLOW_VERSION_RETENTION_DAYS) || 90, // Auto-archive after this
  VERSION_RECOVERY_SLA_SECONDS: 3, // Rollback should complete within 3 seconds
  
  // Batch operation limits
  MAX_BATCH_SIZE: parseInt(process.env.FLOW_MAX_BATCH_SIZE) || 100,
  MAX_CONCURRENT_BATCH: parseInt(process.env.FLOW_MAX_CONCURRENT_BATCH) || 10,
  
  // Rate limits
  MAX_OPERATIONS_PER_MINUTE: parseInt(process.env.FLOW_MAX_OPS_PER_MIN) || 60,
  MAX_OPERATIONS_PER_HOUR: parseInt(process.env.FLOW_MAX_OPS_PER_HOUR) || 1000,
  
  // Complexity limits - Based on OPEN_QUESTIONS_ANSWERS.md
  MAX_NESTING_DEPTH: parseInt(process.env.FLOW_MAX_NESTING) || 10, // Max depth for sub-flows as per spec
  MAX_PARALLEL_BRANCHES: parseInt(process.env.FLOW_MAX_PARALLEL) || 20,
  
  // Soft limit warnings
  SOFT_LIMIT_WARNING: true, // Issue warning but continue processing
  ENFORCE_HARD_LIMITS: process.env.ENFORCE_HARD_LIMITS === 'true' || false,
  
  // Get limits for user tier
  getLimitsForTier(tier = 'free') {
    switch (tier) {
      case 'enterprise':
        return {
          maxNodes: this.MAX_NODES_ENTERPRISE,
          maxEdges: this.MAX_EDGES_ENTERPRISE,
          maxVersions: this.MAX_VERSIONS_PER_FLOW * 2, // Enterprise gets more versions
          maxBatchSize: this.MAX_BATCH_SIZE * 2,
          maxFlowSize: this.MAX_FLOW_SIZE * 2,
          canAdjustLimits: true // Enterprise can customize
        };
      case 'premium':
        return {
          maxNodes: this.MAX_NODES * 1.5,
          maxEdges: this.MAX_EDGES * 1.5,
          maxVersions: this.MAX_VERSIONS_PER_FLOW * 2,
          maxBatchSize: this.MAX_BATCH_SIZE * 2,
          maxFlowSize: this.MAX_FLOW_SIZE * 2
        };
      case 'pro':
        return {
          maxNodes: Math.floor(this.MAX_NODES * 1.5),
          maxEdges: Math.floor(this.MAX_EDGES * 1.5),
          maxVersions: Math.floor(this.MAX_VERSIONS_PER_FLOW * 1.5),
          maxBatchSize: Math.floor(this.MAX_BATCH_SIZE * 1.5),
          maxFlowSize: Math.floor(this.MAX_FLOW_SIZE * 1.5)
        };
      default: // free tier
        return {
          maxNodes: this.MAX_NODES,
          maxEdges: this.MAX_EDGES,
          maxVersions: Math.floor(this.MAX_VERSIONS_PER_FLOW / 2),
          maxBatchSize: Math.floor(this.MAX_BATCH_SIZE / 2),
          maxFlowSize: this.MAX_FLOW_SIZE
        };
    }
  }
};

export default flowLimits;