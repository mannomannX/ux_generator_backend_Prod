// ==========================================
// SERVICES/FLOW-SERVICE/src/services/flow-manager.js
// ==========================================
import { MongoClient, EventTypes } from '@ux-flow/common';

class FlowManager {
  constructor(logger, mongoClient, redisClient, validationService, versioningService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.validationService = validationService;
    this.versioningService = versioningService;

    // Flow templates
    this.templates = {
      empty: this.getEmptyFlowTemplate(),
      basic: this.getBasicFlowTemplate(),
      ecommerce: this.getEcommerceFlowTemplate(),
    };
  }

  async createFlow(projectId, workspaceId, userId, options = {}) {
    try {
      const { template = 'empty', name = 'New Flow', description = '' } = options;
      
      // Get template
      const flowTemplate = this.templates[template] || this.templates.empty;
      
      // Create flow document
      const flowData = {
        ...flowTemplate,
        metadata: {
          ...flowTemplate.metadata,
          flowName: name,
          description,
          projectId,
          workspaceId,
          createdBy: userId,
          lastModifiedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
        },
      };

      // Validate flow structure
      const validation = this.validationService.validateFlow(flowData);
      if (!validation.isValid) {
        throw new Error(`Flow validation failed: ${validation.errors.join(', ')}`);
      }

      // Store in database
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      const result = await flowsCollection.insertOne(flowData);
      const flowId = result.insertedId.toString();

      // Create initial version
      await this.versioningService.createVersion(
        flowId, 
        flowData, 
        userId, 
        'Initial version'
      );

      // Cache the flow
      await this.cacheFlow(flowId, flowData);

      this.logger.info('Flow created', {
        flowId,
        projectId,
        workspaceId,
        template,
        createdBy: userId,
      });

      return {
        flowId,
        flow: {
          ...flowData,
          id: flowId,
          _id: undefined,
        },
      };

    } catch (error) {
      this.logger.error('Failed to create flow', error, { projectId, workspaceId, userId });
      throw error;
    }
  }

  async getFlow(flowId, projectId = null, workspaceId = null) {
    try {
      // Try cache first
      const cachedFlow = await this.getCachedFlow(flowId);
      if (cachedFlow) {
        this.logger.debug('Flow retrieved from cache', { flowId });
        return cachedFlow;
      }

      // Get from database
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      const query = { _id: MongoClient.createObjectId(flowId) };
      if (projectId) query['metadata.projectId'] = projectId;
      if (workspaceId) query['metadata.workspaceId'] = workspaceId;

      const flow = await flowsCollection.findOne(query);
      
      if (!flow) {
        throw new Error('Flow not found');
      }

      // Cache for future requests
      await this.cacheFlow(flowId, flow);

      this.logger.debug('Flow retrieved from database', { flowId });

      return {
        ...flow,
        id: flow._id.toString(),
        _id: undefined,
      };

    } catch (error) {
      this.logger.error('Failed to get flow', error, { flowId, projectId });
      throw error;
    }
  }

  async updateFlow(flowId, transactions, userId, projectId = null) {
    try {
      // Get current flow
      const currentFlow = await this.getFlow(flowId, projectId);
      
      // Apply transactions
      const updatedFlow = await this.applyTransactions(currentFlow, transactions);
      
      // Validate updated flow
      const validation = this.validationService.validateFlow(updatedFlow);
      if (!validation.isValid) {
        throw new Error(`Flow validation failed: ${validation.errors.join(', ')}`);
      }

      // Update metadata
      updatedFlow.metadata.lastModifiedBy = userId;
      updatedFlow.metadata.updatedAt = new Date();
      updatedFlow.metadata.version = this.incrementVersion(currentFlow.metadata.version);

      // Store in database
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      const result = await flowsCollection.replaceOne(
        { _id: MongoClient.createObjectId(flowId) },
        updatedFlow
      );

      if (result.matchedCount === 0) {
        throw new Error('Flow not found for update');
      }

      // Create new version
      await this.versioningService.createVersion(
        flowId,
        updatedFlow,
        userId,
        `Applied ${transactions.length} transaction(s)`
      );

      // Update cache
      await this.cacheFlow(flowId, updatedFlow);

      this.logger.info('Flow updated', {
        flowId,
        transactionCount: transactions.length,
        updatedBy: userId,
        newVersion: updatedFlow.metadata.version,
      });

      return {
        ...updatedFlow,
        id: flowId,
        _id: undefined,
      };

    } catch (error) {
      this.logger.error('Failed to update flow', error, { flowId, userId });
      throw error;
    }
  }

  async applyTransactions(flow, transactions) {
    const updatedFlow = JSON.parse(JSON.stringify(flow)); // Deep clone

    for (const transaction of transactions) {
      const { action, payload } = transaction;

      switch (action) {
        case 'ADD_NODE':
          this.applyAddNode(updatedFlow, payload);
          break;
          
        case 'UPDATE_NODE':
          this.applyUpdateNode(updatedFlow, payload);
          break;
          
        case 'DELETE_NODE':
          this.applyDeleteNode(updatedFlow, payload);
          break;
          
        case 'ADD_EDGE':
          this.applyAddEdge(updatedFlow, payload);
          break;
          
        case 'UPDATE_EDGE':
          this.applyUpdateEdge(updatedFlow, payload);
          break;
          
        case 'DELETE_EDGE':
          this.applyDeleteEdge(updatedFlow, payload);
          break;
          
        default:
          this.logger.warn('Unknown transaction action', { action, payload });
      }
    }

    return updatedFlow;
  }

  applyAddNode(flow, payload) {
    if (!payload.id || !payload.type) {
      throw new Error('ADD_NODE requires id and type');
    }

    // Check if node already exists
    if (flow.nodes.find(node => node.id === payload.id)) {
      throw new Error(`Node with id ${payload.id} already exists`);
    }

    flow.nodes.push({
      id: payload.id,
      type: payload.type,
      position: payload.position || { x: 0, y: 0 },
      data: payload.data || {},
    });
  }

  applyUpdateNode(flow, payload) {
    if (!payload.id) {
      throw new Error('UPDATE_NODE requires id');
    }

    const nodeIndex = flow.nodes.findIndex(node => node.id === payload.id);
    if (nodeIndex === -1) {
      throw new Error(`Node with id ${payload.id} not found`);
    }

    // Merge the updates
    if (payload.position) flow.nodes[nodeIndex].position = payload.position;
    if (payload.data) flow.nodes[nodeIndex].data = { ...flow.nodes[nodeIndex].data, ...payload.data };
    if (payload.type) flow.nodes[nodeIndex].type = payload.type;
  }

  applyDeleteNode(flow, payload) {
    if (!payload.id) {
      throw new Error('DELETE_NODE requires id');
    }

    // Remove node
    flow.nodes = flow.nodes.filter(node => node.id !== payload.id);
    
    // Remove connected edges
    flow.edges = flow.edges.filter(
      edge => edge.source !== payload.id && edge.target !== payload.id
    );
  }

  applyAddEdge(flow, payload) {
    if (!payload.id || !payload.source || !payload.target) {
      throw new Error('ADD_EDGE requires id, source, and target');
    }

    // Check if edge already exists
    if (flow.edges.find(edge => edge.id === payload.id)) {
      throw new Error(`Edge with id ${payload.id} already exists`);
    }

    // Verify source and target nodes exist
    if (!flow.nodes.find(node => node.id === payload.source)) {
      throw new Error(`Source node ${payload.source} not found`);
    }
    if (!flow.nodes.find(node => node.id === payload.target)) {
      throw new Error(`Target node ${payload.target} not found`);
    }

    flow.edges.push({
      id: payload.id,
      source: payload.source,
      target: payload.target,
      data: payload.data || {},
    });
  }

  applyUpdateEdge(flow, payload) {
    if (!payload.id) {
      throw new Error('UPDATE_EDGE requires id');
    }

    const edgeIndex = flow.edges.findIndex(edge => edge.id === payload.id);
    if (edgeIndex === -1) {
      throw new Error(`Edge with id ${payload.id} not found`);
    }

    // Merge the updates
    if (payload.data) {
      flow.edges[edgeIndex].data = { ...flow.edges[edgeIndex].data, ...payload.data };
    }
  }

  applyDeleteEdge(flow, payload) {
    if (!payload.id) {
      throw new Error('DELETE_EDGE requires id');
    }

    flow.edges = flow.edges.filter(edge => edge.id !== payload.id);
  }

  async deleteFlow(flowId, userId, projectId = null) {
    try {
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      const query = { _id: MongoClient.createObjectId(flowId) };
      if (projectId) query['metadata.projectId'] = projectId;

      // Soft delete
      const result = await flowsCollection.updateOne(query, {
        $set: {
          'metadata.deletedAt': new Date(),
          'metadata.deletedBy': userId,
          'metadata.status': 'deleted',
        },
      });

      if (result.matchedCount === 0) {
        throw new Error('Flow not found');
      }

      // Remove from cache
      await this.removeCachedFlow(flowId);

      this.logger.info('Flow deleted', { flowId, deletedBy: userId });

    } catch (error) {
      this.logger.error('Failed to delete flow', error, { flowId, userId });
      throw error;
    }
  }

  // Cache management
  async cacheFlow(flowId, flow) {
    try {
      await this.redisClient.set(
        `flow:${flowId}`,
        flow,
        300 // 5 minutes TTL
      );
    } catch (error) {
      this.logger.warn('Failed to cache flow', error, { flowId });
    }
  }

  async getCachedFlow(flowId) {
    try {
      return await this.redisClient.get(`flow:${flowId}`);
    } catch (error) {
      this.logger.warn('Failed to get cached flow', error, { flowId });
      return null;
    }
  }

  async removeCachedFlow(flowId) {
    try {
      await this.redisClient.del(`flow:${flowId}`);
    } catch (error) {
      this.logger.warn('Failed to remove cached flow', error, { flowId });
    }
  }

  // Utility methods
  incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2]++; // Increment patch version
    return parts.join('.');
  }

  // Flow templates
  getEmptyFlowTemplate() {
    return {
      metadata: {
        flowName: 'New Flow',
        version: '1.0.0',
      },
      nodes: [
        {
          id: 'start',
          type: 'Start',
          position: { x: 250, y: 50 },
          data: {},
        },
      ],
      edges: [],
    };
  }

  getBasicFlowTemplate() {
    return {
      metadata: {
        flowName: 'Basic Flow',
        version: '1.0.0',
      },
      nodes: [
        {
          id: 'start',
          type: 'Start',
          position: { x: 250, y: 50 },
          data: {},
        },
        {
          id: 'screen_1',
          type: 'Screen',
          position: { x: 250, y: 200 },
          data: {
            title: 'Home Screen',
            elements: [],
          },
        },
        {
          id: 'end',
          type: 'End',
          position: { x: 250, y: 350 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'e_start_screen1',
          source: 'start',
          target: 'screen_1',
          data: { trigger: 'onLoad' },
        },
        {
          id: 'e_screen1_end',
          source: 'screen_1',
          target: 'end',
          data: { trigger: 'onComplete' },
        },
      ],
    };
  }

  getEcommerceFlowTemplate() {
    return {
      metadata: {
        flowName: 'E-commerce Flow',
        version: '1.0.0',
      },
      nodes: [
        {
          id: 'start',
          type: 'Start',
          position: { x: 50, y: 50 },
          data: {},
        },
        {
          id: 'homepage',
          type: 'Screen',
          position: { x: 50, y: 200 },
          data: {
            title: 'Homepage',
            elements: [
              { type: 'button', id: 'browse_products', text: 'Browse Products' },
              { type: 'button', id: 'login', text: 'Login' },
            ],
          },
        },
        {
          id: 'product_list',
          type: 'Screen',
          position: { x: 300, y: 200 },
          data: {
            title: 'Product List',
            elements: [
              { type: 'list', id: 'products' },
              { type: 'button', id: 'add_to_cart', text: 'Add to Cart' },
            ],
          },
        },
        {
          id: 'cart',
          type: 'Screen',
          position: { x: 550, y: 200 },
          data: {
            title: 'Shopping Cart',
            elements: [
              { type: 'list', id: 'cart_items' },
              { type: 'button', id: 'checkout', text: 'Checkout' },
            ],
          },
        },
      ],
      edges: [
        {
          id: 'e_start_home',
          source: 'start',
          target: 'homepage',
          data: { trigger: 'onLoad' },
        },
        {
          id: 'e_home_products',
          source: 'homepage',
          target: 'product_list',
          data: { trigger: 'onClick(browse_products)' },
        },
        {
          id: 'e_products_cart',
          source: 'product_list',
          target: 'cart',
          data: { trigger: 'onClick(add_to_cart)' },
        },
      ],
    };
  }
}

export { FlowManager };