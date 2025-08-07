// ==========================================
// FLOW SERVICE - Batch Operations Handler
// ==========================================

import { flowLimits } from '../config/flow-limits.js';
import { ObjectId } from 'mongodb';
import { js2xml } from 'xml-js';
import yaml from 'js-yaml';

export class BatchOperations {
  constructor(logger, flowManager, validationService, mongoClient) {
    this.logger = logger;
    this.flowManager = flowManager;
    this.validationService = validationService;
    this.mongoClient = mongoClient;
  }

  /**
   * Process batch operations with transaction support
   */
  async processBatch(operations, userId, userTier = 'free') {
    const limits = flowLimits.getLimitsForTier(userTier);
    
    // Validate batch size
    if (operations.length > limits.maxBatchSize) {
      throw new Error(`Batch size ${operations.length} exceeds limit of ${limits.maxBatchSize}`);
    }

    const results = [];
    const errors = [];
    const session = this.mongoClient.client.startSession();

    try {
      await session.withTransaction(async () => {
        // Group operations by type for optimization
        const grouped = this.groupOperations(operations);
        
        // Process each group
        for (const [type, ops] of Object.entries(grouped)) {
          const groupResults = await this.processOperationGroup(
            type, 
            ops, 
            userId, 
            session
          );
          results.push(...groupResults);
        }
      });

      this.logger.info('Batch operations completed', {
        userId,
        totalOperations: operations.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

      return {
        success: true,
        results,
        summary: this.generateSummary(results)
      };

    } catch (error) {
      this.logger.error('Batch operation failed', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Group operations by type for optimization
   */
  groupOperations(operations) {
    const grouped = {};
    
    for (const op of operations) {
      if (!grouped[op.type]) {
        grouped[op.type] = [];
      }
      grouped[op.type].push(op);
    }
    
    return grouped;
  }

  /**
   * Process a group of operations of the same type
   */
  async processOperationGroup(type, operations, userId, session) {
    const results = [];
    
    switch (type) {
      case 'create':
        results.push(...await this.batchCreate(operations, userId, session));
        break;
      case 'update':
        results.push(...await this.batchUpdate(operations, userId, session));
        break;
      case 'delete':
        results.push(...await this.batchDelete(operations, userId, session));
        break;
      case 'clone':
        results.push(...await this.batchClone(operations, userId, session));
        break;
      case 'export':
        results.push(...await this.batchExport(operations, userId, session));
        break;
      default:
        results.push({
          operationId: operations[0].id,
          success: false,
          error: `Unknown operation type: ${type}`
        });
    }
    
    return results;
  }

  /**
   * Batch create flows
   */
  async batchCreate(operations, userId, session) {
    const results = [];
    const db = this.mongoClient.getDb();
    
    for (const op of operations) {
      try {
        // Validate flow data
        const validation = await this.validationService.validateFlow(op.data);
        if (!validation.isValid) {
          results.push({
            operationId: op.id,
            success: false,
            error: validation.errors.join(', ')
          });
          continue;
        }

        // Create flow
        const flow = {
          ...op.data,
          _id: new ObjectId(),
          metadata: {
            ...op.data.metadata,
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1
          }
        };

        await db.collection('flows').insertOne(flow, { session });
        
        results.push({
          operationId: op.id,
          success: true,
          flowId: flow._id.toString(),
          data: flow
        });

      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Batch update flows
   */
  async batchUpdate(operations, userId, session) {
    const results = [];
    const db = this.mongoClient.getDb();
    
    // Fetch all flows to update
    const flowIds = operations.map(op => new ObjectId(op.flowId));
    const flows = await db.collection('flows')
      .find({ _id: { $in: flowIds } })
      .toArray();
    
    const flowMap = new Map(flows.map(f => [f._id.toString(), f]));
    
    for (const op of operations) {
      try {
        const flow = flowMap.get(op.flowId);
        if (!flow) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Flow not found'
          });
          continue;
        }

        // Check permissions
        if (!this.canUserModifyFlow(flow, userId)) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Insufficient permissions'
          });
          continue;
        }

        // Apply updates
        const updatedFlow = { ...flow, ...op.updates };
        
        // Validate updated flow
        const validation = await this.validationService.validateFlow(updatedFlow);
        if (!validation.isValid) {
          results.push({
            operationId: op.id,
            success: false,
            error: validation.errors.join(', ')
          });
          continue;
        }

        // Update in database
        await db.collection('flows').updateOne(
          { _id: new ObjectId(op.flowId) },
          {
            $set: {
              ...op.updates,
              'metadata.updatedAt': new Date(),
              'metadata.updatedBy': userId
            },
            $inc: { 'metadata.version': 1 }
          },
          { session }
        );

        results.push({
          operationId: op.id,
          success: true,
          flowId: op.flowId
        });

      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Batch delete flows
   */
  async batchDelete(operations, userId, session) {
    const results = [];
    const db = this.mongoClient.getDb();
    
    for (const op of operations) {
      try {
        const flow = await db.collection('flows').findOne({
          _id: new ObjectId(op.flowId)
        });

        if (!flow) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Flow not found'
          });
          continue;
        }

        // Check permissions
        if (!this.canUserDeleteFlow(flow, userId)) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Insufficient permissions'
          });
          continue;
        }

        // Soft delete or hard delete based on option
        if (op.hardDelete) {
          await db.collection('flows').deleteOne(
            { _id: new ObjectId(op.flowId) },
            { session }
          );
        } else {
          await db.collection('flows').updateOne(
            { _id: new ObjectId(op.flowId) },
            {
              $set: {
                'metadata.deletedAt': new Date(),
                'metadata.deletedBy': userId,
                'metadata.isDeleted': true
              }
            },
            { session }
          );
        }

        results.push({
          operationId: op.id,
          success: true,
          flowId: op.flowId
        });

      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Batch clone flows
   */
  async batchClone(operations, userId, session) {
    const results = [];
    const db = this.mongoClient.getDb();
    
    for (const op of operations) {
      try {
        const sourceFlow = await db.collection('flows').findOne({
          _id: new ObjectId(op.sourceFlowId)
        });

        if (!sourceFlow) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Source flow not found'
          });
          continue;
        }

        // Check read permissions
        if (!this.canUserReadFlow(sourceFlow, userId)) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Insufficient permissions to read source flow'
          });
          continue;
        }

        // Create cloned flow
        const clonedFlow = {
          ...sourceFlow,
          _id: new ObjectId(),
          metadata: {
            ...sourceFlow.metadata,
            flowName: op.newName || `${sourceFlow.metadata.flowName} (Copy)`,
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            clonedFrom: sourceFlow._id
          }
        };

        delete clonedFlow.metadata.deletedAt;
        delete clonedFlow.metadata.isDeleted;

        await db.collection('flows').insertOne(clonedFlow, { session });

        results.push({
          operationId: op.id,
          success: true,
          sourceFlowId: op.sourceFlowId,
          newFlowId: clonedFlow._id.toString()
        });

      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Batch export flows
   */
  async batchExport(operations, userId, session) {
    const results = [];
    const db = this.mongoClient.getDb();
    
    for (const op of operations) {
      try {
        const flow = await db.collection('flows').findOne({
          _id: new ObjectId(op.flowId)
        });

        if (!flow) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Flow not found'
          });
          continue;
        }

        // Check read permissions
        if (!this.canUserReadFlow(flow, userId)) {
          results.push({
            operationId: op.id,
            success: false,
            error: 'Insufficient permissions'
          });
          continue;
        }

        // Export in requested format
        const exportedData = await this.exportFlow(flow, op.format || 'json');

        results.push({
          operationId: op.id,
          success: true,
          flowId: op.flowId,
          format: op.format || 'json',
          data: exportedData
        });

      } catch (error) {
        results.push({
          operationId: op.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Export flow in different formats
   */
  async exportFlow(flow, format) {
    switch (format) {
      case 'json':
        return JSON.stringify(flow, null, 2);
        
      case 'xml':
        return this.convertToXML(flow);
        
      case 'yaml':
        return this.convertToYAML(flow);
        
      case 'mermaid':
        return this.convertToMermaid(flow);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert flow to XML format with proper structure
   */
  convertToXML(flow) {
    const flowData = {
      _declaration: {
        _attributes: {
          version: '1.0',
          encoding: 'UTF-8'
        }
      },
      flow: {
        _attributes: {
          xmlns: 'http://uxflow.com/schema/flow',
          version: '1.0'
        },
        metadata: {
          name: { _text: flow.metadata?.flowName || 'Untitled' },
          version: { _text: String(flow.metadata?.version || 1) },
          description: { _text: flow.metadata?.description || '' },
          createdAt: { _text: flow.metadata?.createdAt || new Date().toISOString() },
          updatedAt: { _text: flow.metadata?.updatedAt || new Date().toISOString() },
          industry: { _text: flow.metadata?.industry || 'general' }
        },
        nodes: {
          node: flow.nodes.map(node => ({
            _attributes: {
              id: node.id,
              type: node.type
            },
            position: node.position ? {
              x: { _text: String(node.position.x) },
              y: { _text: String(node.position.y) }
            } : undefined,
            data: node.data ? {
              label: { _text: node.data.label || '' },
              description: { _text: node.data.description || '' },
              properties: node.data.properties ? {
                property: Object.entries(node.data.properties).map(([key, value]) => ({
                  _attributes: { name: key },
                  _text: String(value)
                }))
              } : undefined
            } : undefined
          }))
        },
        edges: {
          edge: flow.edges.map(edge => ({
            _attributes: {
              id: edge.id,
              source: edge.source,
              target: edge.target
            },
            data: edge.data ? {
              label: { _text: edge.data.label || '' },
              condition: { _text: edge.data.condition || '' },
              type: { _text: edge.data.type || 'default' }
            } : undefined
          }))
        }
      }
    };

    const options = {
      compact: false,
      ignoreComment: true,
      spaces: 2
    };

    return js2xml(flowData, options);
  }

  /**
   * Convert flow to YAML format with proper structure
   */
  convertToYAML(flow) {
    const yamlData = {
      flow: {
        metadata: {
          name: flow.metadata?.flowName || 'Untitled',
          version: flow.metadata?.version || 1,
          description: flow.metadata?.description || '',
          createdAt: flow.metadata?.createdAt || new Date().toISOString(),
          updatedAt: flow.metadata?.updatedAt || new Date().toISOString(),
          industry: flow.metadata?.industry || 'general',
          tags: flow.metadata?.tags || []
        },
        nodes: flow.nodes.map(node => ({
          id: node.id,
          type: node.type,
          position: node.position || { x: 0, y: 0 },
          data: {
            label: node.data?.label || '',
            description: node.data?.description || '',
            properties: node.data?.properties || {},
            style: node.data?.style || {}
          }
        })),
        edges: flow.edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          data: {
            label: edge.data?.label || '',
            condition: edge.data?.condition || '',
            type: edge.data?.type || 'default',
            animated: edge.data?.animated || false
          }
        }))
      }
    };

    return yaml.dump(yamlData, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    });
  }

  /**
   * Convert flow to Mermaid diagram format with enhanced styling
   */
  convertToMermaid(flow) {
    let mermaid = '%%{init: {"theme": "default", "themeVariables": {"primaryColor": "#fff"}}}%%\n';
    mermaid += 'graph TD\n';
    
    // Style definitions
    mermaid += '  classDef startEnd fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff\n';
    mermaid += '  classDef decision fill:#FF9800,stroke:#333,stroke-width:2px,color:#fff\n';
    mermaid += '  classDef process fill:#2196F3,stroke:#333,stroke-width:2px,color:#fff\n';
    mermaid += '  classDef action fill:#9C27B0,stroke:#333,stroke-width:2px,color:#fff\n\n';
    
    // Add nodes with proper escaping
    for (const node of flow.nodes) {
      const label = this.escapeMermaidLabel(node.data?.label || node.type);
      const nodeId = this.sanitizeMermaidId(node.id);
      
      switch (node.type) {
        case 'Start':
          mermaid += `  ${nodeId}((${label})):::startEnd\n`;
          break;
        case 'End':
          mermaid += `  ${nodeId}((${label})):::startEnd\n`;
          break;
        case 'Decision':
          mermaid += `  ${nodeId}{${label}}:::decision\n`;
          break;
        case 'Action':
          mermaid += `  ${nodeId}[[${label}]]:::action\n`;
          break;
        case 'Process':
          mermaid += `  ${nodeId}[${label}]:::process\n`;
          break;
        case 'Screen':
          mermaid += `  ${nodeId}[["${label}"]]:::process\n`;
          break;
        default:
          mermaid += `  ${nodeId}[${label}]\n`;
      }
    }
    
    mermaid += '\n';
    
    // Add edges with labels
    for (const edge of flow.edges) {
      const sourceId = this.sanitizeMermaidId(edge.source);
      const targetId = this.sanitizeMermaidId(edge.target);
      const label = edge.data?.label || edge.data?.condition || '';
      
      if (label) {
        const escapedLabel = this.escapeMermaidLabel(label);
        mermaid += `  ${sourceId} -->|${escapedLabel}| ${targetId}\n`;
      } else {
        mermaid += `  ${sourceId} --> ${targetId}\n`;
      }
    }
    
    // Add click events for interactivity (optional)
    mermaid += '\n';
    for (const node of flow.nodes) {
      const nodeId = this.sanitizeMermaidId(node.id);
      if (node.data?.description) {
        mermaid += `  click ${nodeId} callback "Node: ${node.data.description}"\n`;
      }
    }
    
    return mermaid;
  }

  /**
   * Helper to escape special characters in Mermaid labels
   */
  escapeMermaidLabel(label) {
    return label
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '&#124;')
      .replace(/\{/g, '&#123;')
      .replace(/\}/g, '&#125;')
      .replace(/\[/g, '&#91;')
      .replace(/\]/g, '&#93;')
      .replace(/\(/g, '&#40;')
      .replace(/\)/g, '&#41;')
      .replace(/\n/g, '<br/>');
  }

  /**
   * Helper to sanitize node IDs for Mermaid
   */
  sanitizeMermaidId(id) {
    // Replace special characters with underscores
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Permission check helpers
   */
  canUserReadFlow(flow, userId) {
    return flow.metadata?.createdBy === userId ||
           flow.metadata?.sharedWith?.includes(userId) ||
           flow.metadata?.isPublic === true;
  }

  canUserModifyFlow(flow, userId) {
    return flow.metadata?.createdBy === userId ||
           flow.metadata?.collaborators?.includes(userId);
  }

  canUserDeleteFlow(flow, userId) {
    return flow.metadata?.createdBy === userId;
  }

  /**
   * Generate summary of batch results
   */
  generateSummary(results) {
    const summary = {
      total: results.length,
      successful: 0,
      failed: 0,
      byType: {},
      errors: []
    };

    for (const result of results) {
      if (result.success) {
        summary.successful++;
      } else {
        summary.failed++;
        summary.errors.push({
          operationId: result.operationId,
          error: result.error
        });
      }
    }

    return summary;
  }
}

export default BatchOperations;