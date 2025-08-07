import { Logger } from '@ux-flow/common';
import crypto from 'crypto';

export class FlowValidator {
  constructor(logger = new Logger('FlowValidator')) {
    this.logger = logger;
    
    // Flow constraints
    this.maxNodes = 1000;
    this.maxEdges = 2000;
    this.maxNodeDataSize = 10000; // bytes
    this.maxFlowSize = 5000000; // 5MB
    this.maxNameLength = 255;
    this.maxDescriptionLength = 5000;
    
    // Valid node and edge types
    this.validNodeTypes = [
      'Start', 'End', 'Screen', 'Decision', 'Action', 
      'Form', 'API', 'Database', 'Email', 'Notification',
      'Process', 'Loop', 'Condition', 'Error', 'Success'
    ];
    
    this.validEdgeTypes = [
      'default', 'conditional', 'error', 'success', 
      'timeout', 'cancel', 'retry', 'fallback'
    ];
    
    // Dangerous patterns in flow data
    this.dangerousPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\(/gi,
      /Function\(/gi,
      /setTimeout\(/gi,
      /setInterval\(/gi,
      /document\./gi,
      /window\./gi,
      /\$\{.*\}/g, // Template injection
      /\{\{.*\}\}/g // Template injection
    ];
  }
  
  validateFlow(flow) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      sanitized: null
    };
    
    try {
      // Check basic structure
      if (!flow || typeof flow !== 'object') {
        validation.valid = false;
        validation.errors.push('Flow must be a valid object');
        return validation;
      }
      
      // Check flow size
      const flowSize = JSON.stringify(flow).length;
      if (flowSize > this.maxFlowSize) {
        validation.valid = false;
        validation.errors.push(`Flow size exceeds maximum of ${this.maxFlowSize} bytes`);
        return validation;
      }
      
      // Validate metadata
      const metadataValidation = this.validateMetadata(flow.metadata);
      if (!metadataValidation.valid) {
        validation.errors.push(...metadataValidation.errors);
        validation.valid = false;
      }
      
      // Validate nodes
      const nodesValidation = this.validateNodes(flow.nodes);
      if (!nodesValidation.valid) {
        validation.errors.push(...nodesValidation.errors);
        validation.valid = false;
      }
      validation.warnings.push(...nodesValidation.warnings);
      
      // Validate edges
      const edgesValidation = this.validateEdges(flow.edges, flow.nodes);
      if (!edgesValidation.valid) {
        validation.errors.push(...edgesValidation.errors);
        validation.valid = false;
      }
      validation.warnings.push(...edgesValidation.warnings);
      
      // Check for cycles (which might be intentional but worth warning)
      const cycles = this.detectCycles(flow.nodes, flow.edges);
      if (cycles.length > 0) {
        validation.warnings.push(`Detected ${cycles.length} cycle(s) in the flow`);
      }
      
      // Check for orphaned nodes
      const orphans = this.findOrphanedNodes(flow.nodes, flow.edges);
      if (orphans.length > 0) {
        validation.warnings.push(`Found ${orphans.length} orphaned node(s): ${orphans.join(', ')}`);
      }
      
      // Sanitize the flow
      validation.sanitized = this.sanitizeFlow(flow);
      
    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Flow validation error: ${error.message}`);
      this.logger.error('Flow validation failed', error);
    }
    
    return validation;
  }
  
  validateMetadata(metadata) {
    const validation = { valid: true, errors: [] };
    
    if (!metadata || typeof metadata !== 'object') {
      validation.errors.push('Flow metadata is required');
      validation.valid = false;
      return validation;
    }
    
    // Validate flow name
    if (!metadata.flowName || typeof metadata.flowName !== 'string') {
      validation.errors.push('Flow name is required');
      validation.valid = false;
    } else if (metadata.flowName.length > this.maxNameLength) {
      validation.errors.push(`Flow name exceeds maximum length of ${this.maxNameLength}`);
      validation.valid = false;
    } else if (this.containsDangerousContent(metadata.flowName)) {
      validation.errors.push('Flow name contains potentially dangerous content');
      validation.valid = false;
    }
    
    // Validate description if present
    if (metadata.description) {
      if (metadata.description.length > this.maxDescriptionLength) {
        validation.errors.push(`Description exceeds maximum length of ${this.maxDescriptionLength}`);
        validation.valid = false;
      }
      if (this.containsDangerousContent(metadata.description)) {
        validation.errors.push('Description contains potentially dangerous content');
        validation.valid = false;
      }
    }
    
    // Validate version
    if (metadata.version && !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
      validation.errors.push('Invalid version format (expected: x.y.z)');
      validation.valid = false;
    }
    
    return validation;
  }
  
  validateNodes(nodes) {
    const validation = { valid: true, errors: [], warnings: [] };
    
    if (!Array.isArray(nodes)) {
      validation.errors.push('Nodes must be an array');
      validation.valid = false;
      return validation;
    }
    
    if (nodes.length === 0) {
      validation.errors.push('Flow must have at least one node');
      validation.valid = false;
      return validation;
    }
    
    if (nodes.length > this.maxNodes) {
      validation.errors.push(`Number of nodes exceeds maximum of ${this.maxNodes}`);
      validation.valid = false;
      return validation;
    }
    
    const nodeIds = new Set();
    let startNodeCount = 0;
    let endNodeCount = 0;
    
    for (const node of nodes) {
      // Check node structure
      if (!node.id || !node.type) {
        validation.errors.push('Each node must have an id and type');
        validation.valid = false;
        continue;
      }
      
      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        validation.errors.push(`Duplicate node ID: ${node.id}`);
        validation.valid = false;
      }
      nodeIds.add(node.id);
      
      // Validate node type
      if (!this.validNodeTypes.includes(node.type)) {
        validation.warnings.push(`Unknown node type: ${node.type}`);
      }
      
      // Count start and end nodes
      if (node.type === 'Start') startNodeCount++;
      if (node.type === 'End') endNodeCount++;
      
      // Validate node data
      if (node.data) {
        const dataSize = JSON.stringify(node.data).length;
        if (dataSize > this.maxNodeDataSize) {
          validation.errors.push(`Node ${node.id} data exceeds maximum size of ${this.maxNodeDataSize} bytes`);
          validation.valid = false;
        }
        
        if (this.containsDangerousContent(JSON.stringify(node.data))) {
          validation.errors.push(`Node ${node.id} contains potentially dangerous content`);
          validation.valid = false;
        }
      }
      
      // Validate position
      if (node.position) {
        if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          validation.warnings.push(`Node ${node.id} has invalid position`);
        }
      }
    }
    
    // Validate start and end nodes
    if (startNodeCount === 0) {
      validation.warnings.push('Flow has no Start node');
    }
    if (startNodeCount > 1) {
      validation.warnings.push('Flow has multiple Start nodes');
    }
    if (endNodeCount === 0) {
      validation.warnings.push('Flow has no End node');
    }
    
    return validation;
  }
  
  validateEdges(edges, nodes) {
    const validation = { valid: true, errors: [], warnings: [] };
    
    if (!Array.isArray(edges)) {
      validation.errors.push('Edges must be an array');
      validation.valid = false;
      return validation;
    }
    
    if (edges.length > this.maxEdges) {
      validation.errors.push(`Number of edges exceeds maximum of ${this.maxEdges}`);
      validation.valid = false;
      return validation;
    }
    
    const nodeIds = new Set(nodes.map(n => n.id));
    const edgeIds = new Set();
    
    for (const edge of edges) {
      // Check edge structure
      if (!edge.id || !edge.source || !edge.target) {
        validation.errors.push('Each edge must have an id, source, and target');
        validation.valid = false;
        continue;
      }
      
      // Check for duplicate IDs
      if (edgeIds.has(edge.id)) {
        validation.errors.push(`Duplicate edge ID: ${edge.id}`);
        validation.valid = false;
      }
      edgeIds.add(edge.id);
      
      // Validate source and target exist
      if (!nodeIds.has(edge.source)) {
        validation.errors.push(`Edge ${edge.id} has invalid source: ${edge.source}`);
        validation.valid = false;
      }
      if (!nodeIds.has(edge.target)) {
        validation.errors.push(`Edge ${edge.id} has invalid target: ${edge.target}`);
        validation.valid = false;
      }
      
      // Check for self-loops
      if (edge.source === edge.target) {
        validation.warnings.push(`Edge ${edge.id} is a self-loop`);
      }
      
      // Validate edge type
      if (edge.type && !this.validEdgeTypes.includes(edge.type)) {
        validation.warnings.push(`Unknown edge type: ${edge.type}`);
      }
      
      // Validate edge label
      if (edge.label && this.containsDangerousContent(edge.label)) {
        validation.errors.push(`Edge ${edge.id} label contains potentially dangerous content`);
        validation.valid = false;
      }
    }
    
    return validation;
  }
  
  detectCycles(nodes, edges) {
    const cycles = [];
    const adjacencyList = {};
    
    // Build adjacency list
    nodes.forEach(node => {
      adjacencyList[node.id] = [];
    });
    
    edges.forEach(edge => {
      if (adjacencyList[edge.source]) {
        adjacencyList[edge.source].push(edge.target);
      }
    });
    
    // DFS to detect cycles
    const visited = new Set();
    const recursionStack = new Set();
    
    const hasCycle = (nodeId, path = []) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      for (const neighbor of adjacencyList[nodeId] || []) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, [...path])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        hasCycle(node.id);
      }
    }
    
    return cycles;
  }
  
  findOrphanedNodes(nodes, edges) {
    const connectedNodes = new Set();
    
    edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });
    
    const orphans = nodes
      .filter(node => !connectedNodes.has(node.id) && node.type !== 'Start')
      .map(node => node.id);
    
    return orphans;
  }
  
  containsDangerousContent(content) {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(content)) {
        this.logger.warn('Dangerous content detected', { pattern: pattern.source });
        return true;
      }
    }
    
    return false;
  }
  
  sanitizeFlow(flow) {
    const sanitized = JSON.parse(JSON.stringify(flow)); // Deep clone
    
    // Sanitize metadata
    if (sanitized.metadata) {
      if (sanitized.metadata.flowName) {
        sanitized.metadata.flowName = this.sanitizeString(sanitized.metadata.flowName);
      }
      if (sanitized.metadata.description) {
        sanitized.metadata.description = this.sanitizeString(sanitized.metadata.description);
      }
    }
    
    // Sanitize nodes
    if (Array.isArray(sanitized.nodes)) {
      sanitized.nodes.forEach(node => {
        if (node.label) {
          node.label = this.sanitizeString(node.label);
        }
        if (node.data) {
          node.data = this.sanitizeObject(node.data);
        }
      });
    }
    
    // Sanitize edges
    if (Array.isArray(sanitized.edges)) {
      sanitized.edges.forEach(edge => {
        if (edge.label) {
          edge.label = this.sanitizeString(edge.label);
        }
        if (edge.data) {
          edge.data = this.sanitizeObject(edge.data);
        }
      });
    }
    
    return sanitized;
  }
  
  sanitizeString(str) {
    if (!str || typeof str !== 'string') {
      return str;
    }
    
    // Remove dangerous patterns
    let sanitized = str;
    for (const pattern of this.dangerousPatterns) {
      sanitized = sanitized.replace(pattern, '');
    }
    
    // Escape HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    
    return sanitized;
  }
  
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeString(key);
      
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      } else if (Array.isArray(value)) {
        sanitized[sanitizedKey] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        );
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
    
    return sanitized;
  }
  
  generateFlowHash(flow) {
    // Generate a unique hash for the flow for integrity checking
    const flowString = JSON.stringify(flow);
    return crypto.createHash('sha256').update(flowString).digest('hex');
  }
  
  validateFlowIntegrity(flow, expectedHash) {
    const actualHash = this.generateFlowHash(flow);
    return actualHash === expectedHash;
  }
  
  getValidationMetrics() {
    return {
      maxNodes: this.maxNodes,
      maxEdges: this.maxEdges,
      maxNodeDataSize: this.maxNodeDataSize,
      maxFlowSize: this.maxFlowSize,
      validNodeTypes: this.validNodeTypes.length,
      validEdgeTypes: this.validEdgeTypes.length,
      dangerousPatterns: this.dangerousPatterns.length
    };
  }
}