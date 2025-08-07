// ==========================================
// FLOW SERVICE - Configurable Flow Limits
// ==========================================

export const flowLimits = {
  // Node limits
  MAX_NODES: parseInt(process.env.FLOW_MAX_NODES) || 500,
  MAX_NODES_PREMIUM: parseInt(process.env.FLOW_MAX_NODES_PREMIUM) || 2000,
  
  // Edge limits  
  MAX_EDGES: parseInt(process.env.FLOW_MAX_EDGES) || 1000,
  MAX_EDGES_PREMIUM: parseInt(process.env.FLOW_MAX_EDGES_PREMIUM) || 5000,
  
  // Size limits
  MAX_NODE_DATA_SIZE: parseInt(process.env.FLOW_MAX_NODE_DATA_SIZE) || 10240, // 10KB
  MAX_FLOW_SIZE: parseInt(process.env.FLOW_MAX_FLOW_SIZE) || 5242880, // 5MB
  
  // Versioning limits
  MAX_VERSIONS_PER_FLOW: parseInt(process.env.FLOW_MAX_VERSIONS) || 100,
  VERSION_RETENTION_DAYS: parseInt(process.env.FLOW_VERSION_RETENTION_DAYS) || 90,
  
  // Batch operation limits
  MAX_BATCH_SIZE: parseInt(process.env.FLOW_MAX_BATCH_SIZE) || 100,
  MAX_CONCURRENT_BATCH: parseInt(process.env.FLOW_MAX_CONCURRENT_BATCH) || 10,
  
  // Rate limits
  MAX_OPERATIONS_PER_MINUTE: parseInt(process.env.FLOW_MAX_OPS_PER_MIN) || 60,
  MAX_OPERATIONS_PER_HOUR: parseInt(process.env.FLOW_MAX_OPS_PER_HOUR) || 1000,
  
  // Complexity limits
  MAX_NESTING_DEPTH: parseInt(process.env.FLOW_MAX_NESTING) || 10,
  MAX_PARALLEL_BRANCHES: parseInt(process.env.FLOW_MAX_PARALLEL) || 20,
  
  // Get limits for user tier
  getLimitsForTier(tier = 'free') {
    switch (tier) {
      case 'premium':
      case 'enterprise':
        return {
          maxNodes: this.MAX_NODES_PREMIUM,
          maxEdges: this.MAX_EDGES_PREMIUM,
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