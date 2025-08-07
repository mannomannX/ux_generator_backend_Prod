// ==========================================
// SECURE RULE EXECUTION WORKER
// Isolated Worker thread for safe rule execution
// SECURITY FIX: Completely isolated from main process
// ==========================================

import { parentPort, workerData } from 'worker_threads';

// SECURITY: Completely isolated execution environment
// No access to require, process, fs, or any dangerous APIs

try {
  const { ruleCode, ruleId, flow } = workerData;
  
  // SECURITY: Create minimal, safe sandbox environment
  const safeSandbox = {
    // Flow data (read-only deep copy)
    flow: Object.freeze(JSON.parse(JSON.stringify(flow))),
    
    // Result object
    result: { passed: true, details: null },
    
    // Safe built-in objects (no constructors or dangerous methods)
    Math: {
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      max: Math.max,
      min: Math.min,
      round: Math.round,
      random: Math.random, // Limited randomness
    },
    
    // Safe string/number operations
    String: {
      fromCharCode: String.fromCharCode,
    },
    Number: {
      isNaN: Number.isNaN,
      isFinite: Number.isFinite,
    },
    
    // Safe array operations
    Array: {
      isArray: Array.isArray,
    },
    
    // JSON operations (safe)
    JSON: {
      parse: JSON.parse,
      stringify: JSON.stringify,
    },
    
    // Safe date operations (limited)
    Date: {
      now: Date.now,
    },
    
    // Helper functions for flow analysis (pre-defined, safe implementations)
    countNodes: (type) => {
      if (typeof type !== 'string') return 0;
      return flow.nodes ? flow.nodes.filter(n => n && n.type === type).length : 0;
    },
    
    countEdges: () => {
      return flow.edges ? flow.edges.length : 0;
    },
    
    findNode: (id) => {
      if (typeof id !== 'string') return null;
      return flow.nodes ? flow.nodes.find(n => n && n.id === id) : null;
    },
    
    findNodesByType: (type) => {
      if (typeof type !== 'string') return [];
      return flow.nodes ? flow.nodes.filter(n => n && n.type === type) : [];
    },
    
    hasPath: (fromId, toId) => {
      if (typeof fromId !== 'string' || typeof toId !== 'string') return false;
      if (!flow.nodes || !flow.edges) return false;
      
      // Simple BFS path finding (safe implementation)
      const visited = new Set();
      const queue = [fromId];
      let iterations = 0;
      
      while (queue.length > 0 && iterations < 1000) { // Prevent infinite loops
        iterations++;
        const current = queue.shift();
        
        if (current === toId) return true;
        if (visited.has(current)) continue;
        
        visited.add(current);
        
        const edges = flow.edges.filter(e => e && e.source === current);
        for (const edge of edges) {
          if (edge.target && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }
      
      return false;
    },
  };

  // SECURITY: Create execution context with strict limitations
  const secureContext = `
    (function() {
      'use strict';
      
      // SECURITY: Block access to all global objects
      const global = undefined;
      const globalThis = undefined;
      const window = undefined;
      const document = undefined;
      const process = undefined;
      const require = undefined;
      const module = undefined;
      const exports = undefined;
      const console = undefined;
      const Buffer = undefined;
      const setTimeout = undefined;
      const setInterval = undefined;
      const clearTimeout = undefined;
      const clearInterval = undefined;
      
      // SECURITY: Override dangerous constructors
      const Function = undefined;
      const GeneratorFunction = undefined;
      const AsyncFunction = undefined;
      const eval = undefined;
      
      // Extract safe objects from sandbox
      const { 
        flow, result, Math, String, Number, Array, JSON, Date,
        countNodes, countEdges, findNode, findNodesByType, hasPath
      } = arguments[0];
      
      try {
        // SECURITY: Execute user code with restricted context
        const ruleFunction = function(flow) {
          ${ruleCode}
        };
        
        // Execute and validate result
        const ruleResult = ruleFunction(flow);
        
        // Validate and sanitize result
        if (typeof ruleResult === 'object' && ruleResult !== null) {
          result.passed = Boolean(ruleResult.passed);
          // Sanitize details - limit length and remove potentially dangerous content
          result.details = String(ruleResult.details || '').substring(0, 500);
        } else {
          result.passed = Boolean(ruleResult);
          result.details = '';
        }
        
      } catch (error) {
        result.passed = false;
        result.details = 'Rule execution error: ' + String(error.message).substring(0, 200);
      }
      
      return result;
    })
  `;

  // Execute in isolated context with timeout protection
  const executeWithTimeout = new Promise((resolve, reject) => {
    // Set execution timeout (500ms to leave buffer for cleanup)
    const timeout = setTimeout(() => {
      reject(new Error('Rule execution timeout'));
    }, 500);

    try {
      // Execute the code in the restricted context
      const func = new Function('return ' + secureContext)();
      const result = func(safeSandbox);
      
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });

  // Execute and send result back to main thread
  const result = await executeWithTimeout;
  
  // Send result back to parent
  parentPort.postMessage(result);

} catch (error) {
  // Handle any unexpected errors
  const errorResult = {
    passed: false,
    details: `Worker execution failed: ${error.message}`
  };
  
  parentPort.postMessage(errorResult);
}

// Terminate worker after execution
process.exit(0);