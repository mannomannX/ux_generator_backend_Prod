// ==========================================
// FLOW SERVICE - Business Rules Engine
// Industry-specific and custom validation rules
// ==========================================

import vm from 'vm';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BusinessRulesEngine {
  constructor(logger, mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Built-in UX best practice rules
    this.builtInRules = this.initializeBuiltInRules();
    
    // Cache for workspace-specific rules
    this.workspaceRules = new Map();
  }

  /**
   * Initialize built-in UX best practice rules
   */
  initializeBuiltInRules() {
    return {
      // Critical rules that block saving
      critical: [
        {
          id: 'no_orphaned_nodes',
          name: 'No Orphaned Nodes',
          description: 'All nodes must be connected to the flow',
          severity: 'error',
          check: (flow) => this.checkOrphanedNodes(flow)
        },
        {
          id: 'single_start_node',
          name: 'Single Start Node',
          description: 'Flow must have exactly one start node',
          severity: 'error',
          check: (flow) => this.checkSingleStartNode(flow)
        },
        {
          id: 'reachable_end_nodes',
          name: 'Reachable End Nodes',
          description: 'All paths must lead to an end node',
          severity: 'error',
          check: (flow) => this.checkReachableEndNodes(flow)
        },
        {
          id: 'no_circular_dependencies',
          name: 'No Circular Dependencies',
          description: 'Flow must not contain circular paths',
          severity: 'error',
          check: (flow) => this.checkCircularDependencies(flow)
        }
      ],
      
      // Warning rules that allow saving but show issues
      warnings: [
        {
          id: 'max_complexity',
          name: 'Complexity Check',
          description: 'Flow complexity should be manageable',
          severity: 'warning',
          check: (flow) => this.checkComplexity(flow)
        },
        {
          id: 'decision_paths',
          name: 'Decision Path Coverage',
          description: 'All decision nodes should have multiple paths',
          severity: 'warning',
          check: (flow) => this.checkDecisionPaths(flow)
        },
        {
          id: 'node_naming',
          name: 'Node Naming Convention',
          description: 'Nodes should have descriptive names',
          severity: 'warning',
          check: (flow) => this.checkNodeNaming(flow)
        },
        {
          id: 'screen_to_end_path',
          name: 'Screen to End Path',
          description: 'Every screen node should have a path to an end node',
          severity: 'warning',
          check: (flow) => this.checkScreenToEndPath(flow)
        }
      ],
      
      // Industry-specific rules
      ecommerce: [
        {
          id: 'checkout_flow',
          name: 'E-commerce Checkout Requirements',
          description: 'Checkout must include cart, shipping, payment, confirmation',
          severity: 'warning',
          check: (flow) => this.checkEcommerceFlow(flow)
        },
        {
          id: 'payment_security',
          name: 'Payment Security Check',
          description: 'Payment nodes must be properly secured',
          severity: 'error',
          check: (flow) => this.checkPaymentSecurity(flow)
        }
      ],
      
      saas: [
        {
          id: 'onboarding_completeness',
          name: 'SaaS Onboarding Completeness',
          description: 'Onboarding should include registration, verification, setup',
          severity: 'warning',
          check: (flow) => this.checkSaasOnboarding(flow)
        },
        {
          id: 'authentication_flow',
          name: 'Authentication Flow Check',
          description: 'Proper authentication and authorization paths',
          severity: 'error',
          check: (flow) => this.checkAuthenticationFlow(flow)
        }
      ],
      
      mobile: [
        {
          id: 'mobile_navigation',
          name: 'Mobile Navigation Patterns',
          description: 'Follow mobile UX navigation best practices',
          severity: 'warning',
          check: (flow) => this.checkMobileNavigation(flow)
        },
        {
          id: 'offline_capability',
          name: 'Offline Capability Check',
          description: 'Critical paths should work offline',
          severity: 'warning',
          check: (flow) => this.checkOfflineCapability(flow)
        }
      ]
    };
  }

  /**
   * Validate flow against all applicable rules
   */
  async validateFlow(flow, workspaceId, options = {}) {
    const results = {
      isValid: true,
      errors: [],
      warnings: [],
      info: []
    };

    try {
      // Apply critical rules
      for (const rule of this.builtInRules.critical) {
        const result = await rule.check(flow);
        if (!result.passed) {
          results.isValid = false;
          results.errors.push({
            ruleId: rule.id,
            name: rule.name,
            description: rule.description,
            details: result.details
          });
        }
      }

      // Apply warning rules unless in draft mode
      if (!options.isDraft) {
        for (const rule of this.builtInRules.warnings) {
          const result = await rule.check(flow);
          if (!result.passed) {
            results.warnings.push({
              ruleId: rule.id,
              name: rule.name,
              description: rule.description,
              details: result.details
            });
          }
        }
      }

      // Apply industry-specific rules if specified
      if (flow.metadata?.industry) {
        const industryRules = this.builtInRules[flow.metadata.industry];
        if (industryRules) {
          for (const rule of industryRules) {
            const result = await rule.check(flow);
            if (!result.passed) {
              if (rule.severity === 'error') {
                results.isValid = false;
                results.errors.push({
                  ruleId: rule.id,
                  name: rule.name,
                  description: rule.description,
                  details: result.details
                });
              } else {
                results.warnings.push({
                  ruleId: rule.id,
                  name: rule.name,
                  description: rule.description,
                  details: result.details
                });
              }
            }
          }
        }
      }

      // Apply workspace-specific custom rules
      if (workspaceId && !options.skipCustomRules) {
        const customResults = await this.applyWorkspaceRules(flow, workspaceId);
        results.errors.push(...customResults.errors);
        results.warnings.push(...customResults.warnings);
        if (customResults.errors.length > 0) {
          results.isValid = false;
        }
      }

    } catch (error) {
      this.logger.error('Business rule validation failed', error);
      results.warnings.push({
        ruleId: 'validation_error',
        name: 'Validation Error',
        description: 'Some validation rules could not be applied',
        details: error.message
      });
    }

    return results;
  }

  /**
   * Check for orphaned nodes
   */
  checkOrphanedNodes(flow) {
    const connectedNodes = new Set();
    
    // Add start node
    const startNode = flow.nodes.find(n => n.type === 'Start');
    if (startNode) {
      connectedNodes.add(startNode.id);
    }
    
    // Add all nodes connected by edges
    flow.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });
    
    // Find orphaned nodes
    const orphaned = flow.nodes.filter(node => !connectedNodes.has(node.id));
    
    return {
      passed: orphaned.length === 0,
      details: orphaned.length > 0 ? 
        `Found ${orphaned.length} orphaned node(s): ${orphaned.map(n => n.id).join(', ')}` : 
        null
    };
  }

  /**
   * Check for single start node
   */
  checkSingleStartNode(flow) {
    const startNodes = flow.nodes.filter(n => n.type === 'Start');
    
    return {
      passed: startNodes.length === 1,
      details: startNodes.length === 0 ? 
        'No start node found' : 
        startNodes.length > 1 ? 
        `Multiple start nodes found: ${startNodes.map(n => n.id).join(', ')}` : 
        null
    };
  }

  /**
   * Check if all paths reach an end node
   */
  checkReachableEndNodes(flow) {
    const endNodes = flow.nodes.filter(n => n.type === 'End');
    
    if (endNodes.length === 0) {
      return {
        passed: false,
        details: 'No end nodes found in flow'
      };
    }
    
    // Build adjacency list
    const graph = new Map();
    flow.nodes.forEach(node => graph.set(node.id, []));
    flow.edges.forEach(edge => {
      if (graph.has(edge.source)) {
        graph.get(edge.source).push(edge.target);
      }
    });
    
    // Check if any node can reach an end node
    const canReachEnd = (nodeId, visited = new Set()) => {
      if (endNodes.some(n => n.id === nodeId)) return true;
      if (visited.has(nodeId)) return false;
      
      visited.add(nodeId);
      const neighbors = graph.get(nodeId) || [];
      
      return neighbors.some(neighbor => canReachEnd(neighbor, visited));
    };
    
    // Find nodes that cannot reach an end
    const unreachable = flow.nodes.filter(node => 
      node.type !== 'End' && !canReachEnd(node.id)
    );
    
    return {
      passed: unreachable.length === 0,
      details: unreachable.length > 0 ? 
        `Nodes cannot reach end: ${unreachable.map(n => n.id).join(', ')}` : 
        null
    };
  }

  /**
   * Check for circular dependencies
   */
  checkCircularDependencies(flow) {
    const graph = new Map();
    flow.nodes.forEach(node => graph.set(node.id, []));
    flow.edges.forEach(edge => {
      if (graph.has(edge.source)) {
        graph.get(edge.source).push(edge.target);
      }
    });
    
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];
    
    const hasCycle = (nodeId, path = []) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, [...path])) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart).concat(neighbor));
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    // Check all unvisited nodes
    for (const node of flow.nodes) {
      if (!visited.has(node.id)) {
        hasCycle(node.id);
      }
    }
    
    return {
      passed: cycles.length === 0,
      details: cycles.length > 0 ? 
        `Found circular dependencies: ${cycles.map(c => c.join(' -> ')).join('; ')}` : 
        null
    };
  }

  /**
   * Check flow complexity
   */
  checkComplexity(flow) {
    const nodeCount = flow.nodes.length;
    const edgeCount = flow.edges.length;
    const complexity = edgeCount - nodeCount + 1; // Cyclomatic complexity
    
    const maxComplexity = 20;
    
    return {
      passed: complexity <= maxComplexity,
      details: complexity > maxComplexity ? 
        `Flow complexity (${complexity}) exceeds recommended maximum (${maxComplexity})` : 
        null
    };
  }

  /**
   * Check decision node paths
   */
  checkDecisionPaths(flow) {
    const decisionNodes = flow.nodes.filter(n => n.type === 'Decision');
    const issues = [];
    
    decisionNodes.forEach(node => {
      const outgoingEdges = flow.edges.filter(e => e.source === node.id);
      if (outgoingEdges.length < 2) {
        issues.push(`Decision node '${node.id}' has only ${outgoingEdges.length} outgoing path(s)`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Check node naming conventions
   */
  checkNodeNaming(flow) {
    const issues = [];
    
    flow.nodes.forEach(node => {
      const label = node.data?.label || '';
      if (!label || label.length < 3) {
        issues.push(`Node '${node.id}' has no descriptive label`);
      }
      if (label.toLowerCase() === node.type.toLowerCase()) {
        issues.push(`Node '${node.id}' uses generic label '${label}'`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Check screen to end path
   */
  checkScreenToEndPath(flow) {
    const screenNodes = flow.nodes.filter(n => n.type === 'Screen');
    const endNodes = flow.nodes.filter(n => n.type === 'End');
    
    if (endNodes.length === 0) {
      return { passed: true }; // Checked elsewhere
    }
    
    // Build graph
    const graph = new Map();
    flow.nodes.forEach(node => graph.set(node.id, []));
    flow.edges.forEach(edge => {
      if (graph.has(edge.source)) {
        graph.get(edge.source).push(edge.target);
      }
    });
    
    // Check path from each screen to any end
    const hasPathToEnd = (nodeId, visited = new Set()) => {
      if (endNodes.some(n => n.id === nodeId)) return true;
      if (visited.has(nodeId)) return false;
      
      visited.add(nodeId);
      const neighbors = graph.get(nodeId) || [];
      return neighbors.some(neighbor => hasPathToEnd(neighbor, visited));
    };
    
    const issues = [];
    screenNodes.forEach(node => {
      if (!hasPathToEnd(node.id)) {
        issues.push(`Screen '${node.data?.label || node.id}' has no path to end`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Check e-commerce specific flow requirements
   */
  checkEcommerceFlow(flow) {
    const requiredScreenTypes = ['catalog', 'cart', 'payment', 'confirmation'];
    const foundTypes = new Set();
    
    flow.nodes.forEach(node => {
      if (node.data?.screenType) {
        foundTypes.add(node.data.screenType);
      }
    });
    
    const missing = requiredScreenTypes.filter(type => !foundTypes.has(type));
    
    return {
      passed: missing.length === 0,
      details: missing.length > 0 ? 
        `Missing e-commerce screens: ${missing.join(', ')}` : 
        null
    };
  }

  /**
   * Check payment security
   */
  checkPaymentSecurity(flow) {
    const paymentNodes = flow.nodes.filter(n => 
      n.data?.screenType === 'payment' || 
      n.data?.label?.toLowerCase().includes('payment')
    );
    
    const issues = [];
    paymentNodes.forEach(node => {
      if (!node.data?.secure) {
        issues.push(`Payment node '${node.id}' not marked as secure`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Check SaaS onboarding flow
   */
  checkSaasOnboarding(flow) {
    const requiredSteps = ['registration', 'verification', 'profile', 'workspace'];
    const foundSteps = new Set();
    
    flow.nodes.forEach(node => {
      const label = (node.data?.label || '').toLowerCase();
      requiredSteps.forEach(step => {
        if (label.includes(step)) {
          foundSteps.add(step);
        }
      });
    });
    
    const missing = requiredSteps.filter(step => !foundSteps.has(step));
    
    return {
      passed: missing.length <= 1, // Allow one missing step
      details: missing.length > 1 ? 
        `Missing onboarding steps: ${missing.join(', ')}` : 
        null
    };
  }

  /**
   * Check authentication flow
   */
  checkAuthenticationFlow(flow) {
    const authNodes = flow.nodes.filter(n => 
      n.data?.label?.toLowerCase().includes('login') ||
      n.data?.label?.toLowerCase().includes('auth')
    );
    
    const issues = [];
    authNodes.forEach(node => {
      const outgoing = flow.edges.filter(e => e.source === node.id);
      if (outgoing.length < 2) {
        issues.push(`Auth node '${node.id}' missing success/failure paths`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Check mobile navigation patterns
   */
  checkMobileNavigation(flow) {
    // Check for back navigation
    const screenNodes = flow.nodes.filter(n => n.type === 'Screen');
    const issues = [];
    
    screenNodes.forEach(node => {
      const incoming = flow.edges.filter(e => e.target === node.id);
      const outgoing = flow.edges.filter(e => e.source === node.id);
      
      // Most screens should have back navigation
      if (incoming.length > 0 && outgoing.length > 0) {
        const hasBackPath = outgoing.some(edge => {
          const targetNode = incoming.find(e => e.source === edge.target);
          return targetNode !== undefined;
        });
        
        if (!hasBackPath && !node.data?.noBackButton) {
          issues.push(`Screen '${node.data?.label || node.id}' missing back navigation`);
        }
      }
    });
    
    return {
      passed: issues.length <= 2, // Allow some screens without back
      details: issues.length > 2 ? 
        `Mobile navigation issues: ${issues.slice(0, 3).join('; ')}...` : 
        null
    };
  }

  /**
   * Check offline capability
   */
  checkOfflineCapability(flow) {
    const criticalNodes = flow.nodes.filter(n => 
      n.data?.critical || 
      n.data?.label?.toLowerCase().includes('critical')
    );
    
    const issues = [];
    criticalNodes.forEach(node => {
      if (!node.data?.offlineCapable) {
        issues.push(`Critical node '${node.data?.label || node.id}' not offline capable`);
      }
    });
    
    return {
      passed: issues.length === 0,
      details: issues.length > 0 ? issues.join('; ') : null
    };
  }

  /**
   * Apply workspace-specific custom rules
   */
  async applyWorkspaceRules(flow, workspaceId) {
    const results = {
      errors: [],
      warnings: []
    };

    try {
      // Load workspace rules if not cached
      if (!this.workspaceRules.has(workspaceId)) {
        await this.loadWorkspaceRules(workspaceId);
      }

      const rules = this.workspaceRules.get(workspaceId) || [];
      
      for (const rule of rules) {
        try {
          // Execute custom rule in a secure sandbox
          const result = await this.executeRuleInSandbox(rule, flow);
          
          if (!result.passed) {
            if (rule.severity === 'error') {
              results.errors.push({
                ruleId: rule.id,
                name: rule.name,
                description: rule.description,
                details: result.details
              });
            } else {
              results.warnings.push({
                ruleId: rule.id,
                name: rule.name,
                description: rule.description,
                details: result.details
              });
            }
          }
        } catch (error) {
          this.logger.error('Custom rule execution failed', error, { ruleId: rule.id });
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to apply workspace rules', error);
    }

    return results;
  }

  /**
   * Execute custom rule in a SECURE isolated Worker thread
   * SECURITY FIX: Replaced dangerous code injection with Worker thread isolation
   */
  async executeRuleInSandbox(rule, flow) {
    return new Promise((resolve, reject) => {
      // Validate rule code before execution
      if (!this.validateRuleCode(rule.code)) {
        resolve({
          passed: false,
          details: 'Rule code contains prohibited patterns'
        });
        return;
      }

      const workerData = {
        ruleCode: rule.code,
        ruleId: rule.id,
        flow: JSON.parse(JSON.stringify(flow)) // Deep clone for isolation
      };

      // Create isolated Worker thread for rule execution
      const worker = new Worker(
        new URL('./rule-execution-worker.js', import.meta.url),
        { 
          workerData,
          resourceLimits: {
            maxOldGenerationSizeMb: 50, // Limit memory to 50MB
            maxYoungGenerationSizeMb: 10
          }
        }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve({
          passed: false,
          details: `Rule execution timeout after 1000ms: ${rule.id}`
        });
      }, 1000);

      worker.on('message', (result) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(result);
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        worker.terminate();
        this.logger.warn('Rule execution worker error', { 
          ruleId: rule.id, 
          error: error.message 
        });
        resolve({
          passed: false,
          details: `Worker execution error: ${error.message}`
        });
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          this.logger.warn('Rule execution worker exited abnormally', { 
            ruleId: rule.id, 
            exitCode: code 
          });
          resolve({
            passed: false,
            details: `Worker exited with code: ${code}`
          });
        }
      });
    });
  }

  /**
   * Validate rule code for security threats
   * SECURITY: Block dangerous patterns before execution
   */
  validateRuleCode(code) {
    if (!code || typeof code !== 'string') {
      return false;
    }

    // Blocked patterns that indicate potential security threats
    const dangerousPatterns = [
      /require\s*\(/i,           // Module loading
      /import\s+/i,              // ES6 imports
      /process\./i,              // Process access
      /global\./i,               // Global access
      /globalThis\./i,           // Global access
      /Function\s*\(/i,          // Function constructor
      /eval\s*\(/i,              // eval() calls
      /setTimeout\s*\(/i,        // setTimeout
      /setInterval\s*\(/i,       // setInterval
      /fetch\s*\(/i,             // Network requests
      /XMLHttpRequest/i,         // AJAX requests
      /WebSocket/i,              // WebSocket access
      /document\./i,             // DOM access
      /window\./i,               // Window access
      /this\s*\./i,              // This context access
      /prototype\./i,            // Prototype pollution
      /constructor/i,            // Constructor access
      /__proto__/i,              // Proto access
      /Buffer\s*\(/i,            // Buffer access
      /fs\./i,                   // File system
      /path\./i,                 // Path module
      /os\./i,                   // OS module
      /child_process/i,          // Process spawning
      /cluster/i,                // Cluster access
      /worker_threads/i,         // Worker access
      /crypto\./i,               // Crypto module
      /http\./i,                 // HTTP module
      /https\./i,                // HTTPS module
      /net\./i,                  // Net module
      /url\./i,                  // URL module
      /vm\./i,                   // VM module access
    ];

    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        this.logger.warn('Rule code blocked due to dangerous pattern', { 
          pattern: pattern.source 
        });
        return false;
      }
    }

    // Additional validation - check code length
    if (code.length > 10000) {
      this.logger.warn('Rule code blocked due to excessive length');
      return false;
    }

    // Check for suspicious string patterns
    const suspiciousStrings = [
      'child_process',
      'spawn',
      'exec',
      'execFile',
      'fork',
      '../',
      '/etc/',
      '/proc/',
      '/sys/',
      'rm -rf',
      'del /s',
      'format c:',
    ];

    const lowerCode = code.toLowerCase();
    for (const suspicious of suspiciousStrings) {
      if (lowerCode.includes(suspicious)) {
        this.logger.warn('Rule code blocked due to suspicious string', { 
          string: suspicious 
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Load workspace-specific rules from database
   */
  async loadWorkspaceRules(workspaceId) {
    try {
      const db = this.mongoClient.getDb();
      const rules = await db.collection('workspace_rules')
        .find({ workspaceId, enabled: true })
        .toArray();
      
      // Validate rules before caching
      const validRules = rules.filter(rule => {
        if (!rule.code || typeof rule.code !== 'string') {
          this.logger.warn('Invalid rule skipped', { ruleId: rule.id });
          return false;
        }
        // Basic validation - no obvious malicious patterns
        const dangerousPatterns = [
          'require', 'import', 'process', 'child_process', 
          'fs', 'eval', 'Function', '__proto__', 'constructor',
          'setTimeout', 'setInterval', 'setImmediate'
        ];
        const codeStr = rule.code.toLowerCase();
        for (const pattern of dangerousPatterns) {
          if (codeStr.includes(pattern)) {
            this.logger.warn('Dangerous rule pattern detected', { 
              ruleId: rule.id, 
              pattern 
            });
            return false;
          }
        }
        return true;
      });
      
      this.workspaceRules.set(workspaceId, validRules);
      
    } catch (error) {
      this.logger.error('Failed to load workspace rules', error);
      this.workspaceRules.set(workspaceId, []);
    }
  }

  /**
   * Create custom rule for workspace (Enterprise feature)
   */
  async createWorkspaceRule(workspaceId, rule) {
    try {
      const db = this.mongoClient.getDb();
      
      const newRule = {
        ...rule,
        workspaceId,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection('workspace_rules').insertOne(newRule);
      
      // Clear cache to reload rules
      this.workspaceRules.delete(workspaceId);
      
      return newRule;
      
    } catch (error) {
      this.logger.error('Failed to create workspace rule', error);
      throw error;
    }
  }
}

export default BusinessRulesEngine;