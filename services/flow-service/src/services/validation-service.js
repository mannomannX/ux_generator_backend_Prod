// ==========================================
// SERVICES/FLOW-SERVICE/src/services/validation-service.js
// ==========================================

class ValidationService {
  constructor(logger) {
    this.logger = logger;
    
    // Valid node types
    this.validNodeTypes = [
      'Start',
      'End', 
      'Screen',
      'Popup',
      'API Call',
      'Decision',
      'Component',
      'Note'
    ];

    // Valid edge trigger types
    this.validTriggerTypes = [
      'onLoad',
      'onClick',
      'onSubmit',
      'onSuccess',
      'onError',
      'if_true',
      'if_false',
      'onTimeout',
      'onSwipe',
      'onHover'
    ];
  }

  validateFlow(flow) {
    const errors = [];
    const warnings = [];

    try {
      // Basic structure validation
      this.validateBasicStructure(flow, errors);
      
      if (errors.length === 0) {
        // Detailed validation only if basic structure is valid
        this.validateNodes(flow, errors, warnings);
        this.validateEdges(flow, errors, warnings);
        this.validateConnectivity(flow, errors, warnings);
        this.validateBusinessLogic(flow, errors, warnings);
      }

      const isValid = errors.length === 0;

      this.logger.debug('Flow validation completed', {
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        nodeCount: flow.nodes?.length || 0,
        edgeCount: flow.edges?.length || 0,
      });

      return {
        isValid,
        errors,
        warnings,
        summary: {
          nodeCount: flow.nodes?.length || 0,
          edgeCount: flow.edges?.length || 0,
          startNodeCount: flow.nodes?.filter(n => n.type === 'Start').length || 0,
          endNodeCount: flow.nodes?.filter(n => n.type === 'End').length || 0,
        },
      };

    } catch (error) {
      this.logger.error('Flow validation failed', error);
      return {
        isValid: false,
        errors: ['Validation process failed: ' + error.message],
        warnings: [],
        summary: null,
      };
    }
  }

  validateBasicStructure(flow, errors) {
    // Check if flow exists
    if (!flow) {
      errors.push('Flow object is null or undefined');
      return;
    }

    // Check metadata
    if (!flow.metadata) {
      errors.push('Flow metadata is missing');
    } else {
      if (!flow.metadata.flowName) {
        errors.push('Flow name is required in metadata');
      }
      if (!flow.metadata.version) {
        errors.push('Flow version is required in metadata');
      }
    }

    // Check nodes array
    if (!Array.isArray(flow.nodes)) {
      errors.push('Flow must have a nodes array');
    }

    // Check edges array
    if (!Array.isArray(flow.edges)) {
      errors.push('Flow must have an edges array');
    }
  }

  validateNodes(flow, errors, warnings) {
    const nodeIds = new Set();
    let startNodeCount = 0;
    let endNodeCount = 0;

    for (let i = 0; i < flow.nodes.length; i++) {
      const node = flow.nodes[i];
      const nodeContext = `Node ${i + 1}`;

      // Check required fields
      if (!node.id) {
        errors.push(`${nodeContext}: Missing required field 'id'`);
        continue;
      }

      if (!node.type) {
        errors.push(`${nodeContext} (${node.id}): Missing required field 'type'`);
        continue;
      }

      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        errors.push(`${nodeContext} (${node.id}): Duplicate node ID`);
      } else {
        nodeIds.add(node.id);
      }

      // Validate node type
      if (!this.validNodeTypes.includes(node.type)) {
        errors.push(`${nodeContext} (${node.id}): Invalid node type '${node.type}'`);
      }

      // Count special nodes
      if (node.type === 'Start') startNodeCount++;
      if (node.type === 'End') endNodeCount++;

      // Validate node-specific requirements
      this.validateNodeSpecific(node, errors, warnings);

      // Check position (optional but recommended)
      if (!node.position) {
        warnings.push(`${nodeContext} (${node.id}): Missing position information`);
      } else if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        warnings.push(`${nodeContext} (${node.id}): Position must have numeric x and y coordinates`);
      }
    }

    // Flow-level node validation
    if (startNodeCount === 0) {
      errors.push('Flow must have at least one Start node');
    } else if (startNodeCount > 1) {
      warnings.push('Flow has multiple Start nodes, which may cause confusion');
    }

    if (endNodeCount === 0) {
      warnings.push('Flow should have at least one End node');
    }
  }

  validateNodeSpecific(node, errors, warnings) {
    const nodeContext = `Node (${node.id})`;

    switch (node.type) {
      case 'Screen':
      case 'Popup':
        if (!node.data) {
          warnings.push(`${nodeContext}: Screen/Popup nodes should have data object`);
        } else {
          if (!node.data.title) {
            warnings.push(`${nodeContext}: Screen/Popup should have a title`);
          }
          if (node.data.elements && !Array.isArray(node.data.elements)) {
            errors.push(`${nodeContext}: Elements must be an array`);
          }
        }
        break;

      case 'API Call':
        if (!node.data || !node.data.url) {
          errors.push(`${nodeContext}: API Call node must have a URL in data`);
        }
        if (node.data && !node.data.method) {
          warnings.push(`${nodeContext}: API Call should specify HTTP method`);
        }
        break;

      case 'Decision':
        if (!node.data || !node.data.condition) {
          errors.push(`${nodeContext}: Decision node must have a condition in data`);
        }
        break;

      case 'Component':
        if (!node.data || !node.data.componentId) {
          errors.push(`${nodeContext}: Component node must reference a componentId`);
        }
        break;
    }
  }

  validateEdges(flow, errors, warnings) {
    const edgeIds = new Set();
    const nodeIds = new Set(flow.nodes.map(node => node.id));

    for (let i = 0; i < flow.edges.length; i++) {
      const edge = flow.edges[i];
      const edgeContext = `Edge ${i + 1}`;

      // Check required fields
      if (!edge.id) {
        errors.push(`${edgeContext}: Missing required field 'id'`);
        continue;
      }

      if (!edge.source) {
        errors.push(`${edgeContext} (${edge.id}): Missing required field 'source'`);
        continue;
      }

      if (!edge.target) {
        errors.push(`${edgeContext} (${edge.id}): Missing required field 'target'`);
        continue;
      }

      // Check for duplicate IDs
      if (edgeIds.has(edge.id)) {
        errors.push(`${edgeContext} (${edge.id}): Duplicate edge ID`);
      } else {
        edgeIds.add(edge.id);
      }

      // Validate source and target node existence
      if (!nodeIds.has(edge.source)) {
        errors.push(`${edgeContext} (${edge.id}): Source node '${edge.source}' does not exist`);
      }

      if (!nodeIds.has(edge.target)) {
        errors.push(`${edgeContext} (${edge.id}): Target node '${edge.target}' does not exist`);
      }

      // Validate trigger (if present)
      if (edge.data && edge.data.trigger) {
        this.validateTrigger(edge.data.trigger, edgeContext, edge.id, warnings);
      } else {
        warnings.push(`${edgeContext} (${edge.id}): Missing trigger information`);
      }

      // Check for self-loops
      if (edge.source === edge.target) {
        warnings.push(`${edgeContext} (${edge.id}): Self-loop detected (node connects to itself)`);
      }
    }
  }

  validateTrigger(trigger, context, edgeId, warnings) {
    // Extract base trigger type (e.g., "onClick(button1)" -> "onClick")
    const baseTrigger = trigger.split('(')[0];
    
    if (!this.validTriggerTypes.includes(baseTrigger)) {
      warnings.push(`${context} (${edgeId}): Unknown trigger type '${baseTrigger}'`);
    }

    // Validate specific trigger formats
    if (baseTrigger === 'onClick' && !trigger.includes('(')) {
      warnings.push(`${context} (${edgeId}): onClick trigger should specify element ID: onClick(elementId)`);
    }
  }

  validateConnectivity(flow, errors, warnings) {
    const nodeIds = new Set(flow.nodes.map(node => node.id));
    const hasIncoming = new Set();
    const hasOutgoing = new Set();

    // Track incoming and outgoing connections
    for (const edge of flow.edges) {
      if (nodeIds.has(edge.source)) hasOutgoing.add(edge.source);
      if (nodeIds.has(edge.target)) hasIncoming.add(edge.target);
    }

    // Check for orphaned nodes
    for (const node of flow.nodes) {
      const hasIn = hasIncoming.has(node.id);
      const hasOut = hasOutgoing.has(node.id);

      if (node.type === 'Start') {
        if (hasIn) {
          warnings.push(`Start node (${node.id}) has incoming connections`);
        }
        if (!hasOut) {
          warnings.push(`Start node (${node.id}) has no outgoing connections`);
        }
      } else if (node.type === 'End') {
        if (!hasIn) {
          warnings.push(`End node (${node.id}) has no incoming connections`);
        }
        if (hasOut) {
          warnings.push(`End node (${node.id}) has outgoing connections`);
        }
      } else {
        if (!hasIn && !hasOut) {
          warnings.push(`Node (${node.id}) is completely disconnected`);
        } else if (!hasIn) {
          warnings.push(`Node (${node.id}) has no incoming connections (unreachable)`);
        } else if (!hasOut) {
          warnings.push(`Node (${node.id}) has no outgoing connections (dead end)`);
        }
      }
    }
  }

  validateBusinessLogic(flow, errors, warnings) {
    // Check for proper API Call -> Decision pattern
    for (const node of flow.nodes) {
      if (node.type === 'API Call') {
        const outgoingEdges = flow.edges.filter(edge => edge.source === node.id);
        const hasDecisionTarget = outgoingEdges.some(edge => {
          const targetNode = flow.nodes.find(n => n.id === edge.target);
          return targetNode && targetNode.type === 'Decision';
        });

        if (outgoingEdges.length > 0 && !hasDecisionTarget) {
          warnings.push(`API Call node (${node.id}) should typically connect to a Decision node for proper error handling`);
        }
      }
    }

    // Check for Decision nodes with proper branching
    for (const node of flow.nodes) {
      if (node.type === 'Decision') {
        const outgoingEdges = flow.edges.filter(edge => edge.source === node.id);
        const triggers = outgoingEdges.map(edge => edge.data?.trigger).filter(Boolean);
        
        const hasTrueCase = triggers.some(trigger => trigger === 'if_true');
        const hasFalseCase = triggers.some(trigger => trigger === 'if_false');

        if (!hasTrueCase || !hasFalseCase) {
          warnings.push(`Decision node (${node.id}) should have both if_true and if_false branches`);
        }
      }
    }
  }

  // Transaction validation
  validateTransaction(transaction) {
    const errors = [];

    if (!transaction || typeof transaction !== 'object') {
      errors.push('Transaction must be an object');
      return { isValid: false, errors };
    }

    if (!transaction.action) {
      errors.push('Transaction must have an action field');
    }

    if (!transaction.payload) {
      errors.push('Transaction must have a payload field');
    }

    const validActions = ['ADD_NODE', 'UPDATE_NODE', 'DELETE_NODE', 'ADD_EDGE', 'UPDATE_EDGE', 'DELETE_EDGE'];
    if (transaction.action && !validActions.includes(transaction.action)) {
      errors.push(`Invalid transaction action: ${transaction.action}`);
    }

    // Action-specific validation
    if (transaction.action && transaction.payload) {
      this.validateTransactionPayload(transaction.action, transaction.payload, errors);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  validateTransactionPayload(action, payload, errors) {
    switch (action) {
      case 'ADD_NODE':
      case 'UPDATE_NODE':
        if (!payload.id) {
          errors.push(`${action} requires payload.id`);
        }
        if (action === 'ADD_NODE' && !payload.type) {
          errors.push('ADD_NODE requires payload.type');
        }
        if (payload.type && !this.validNodeTypes.includes(payload.type)) {
          errors.push(`Invalid node type: ${payload.type}`);
        }
        break;

      case 'DELETE_NODE':
        if (!payload.id) {
          errors.push('DELETE_NODE requires payload.id');
        }
        break;

      case 'ADD_EDGE':
      case 'UPDATE_EDGE':
        if (!payload.id) {
          errors.push(`${action} requires payload.id`);
        }
        if (action === 'ADD_EDGE') {
          if (!payload.source) {
            errors.push('ADD_EDGE requires payload.source');
          }
          if (!payload.target) {
            errors.push('ADD_EDGE requires payload.target');
          }
        }
        break;

      case 'DELETE_EDGE':
        if (!payload.id) {
          errors.push('DELETE_EDGE requires payload.id');
        }
        break;
    }
  }

  // Batch transaction validation
  validateTransactions(transactions) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(transactions)) {
      errors.push('Transactions must be an array');
      return { isValid: false, errors, warnings };
    }

    for (let i = 0; i < transactions.length; i++) {
      const result = this.validateTransaction(transactions[i]);
      if (!result.isValid) {
        errors.push(`Transaction ${i + 1}: ${result.errors.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Health check for the validation service
  healthCheck() {
    return {
      status: 'ok',
      validNodeTypes: this.validNodeTypes.length,
      validTriggerTypes: this.validTriggerTypes.length,
    };
  }
}

export { ValidationService };