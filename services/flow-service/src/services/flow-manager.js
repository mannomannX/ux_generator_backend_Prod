// ==========================================
// SERVICES/FLOW-SERVICE/src/services/flow-manager.js
// ==========================================
import { MongoClient, EventTypes, CacheManager } from '@ux-flow/common';

class FlowManager {
  constructor(logger, mongoClient, redisClient, validationService, versioningService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.validationService = validationService;
    this.versioningService = versioningService;
    
    // Initialize enhanced cache manager
    this.cacheManager = new CacheManager(redisClient, logger, {
      keyPrefix: 'uxflow:flows',
      defaultTtl: 300, // 5 minutes
      enableMetrics: true,
    });

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

      // Store in database with atomic transaction
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      // Use MongoDB transaction for atomic operations
      const session = this.mongoClient.getClient().startSession();
      
      try {
        await session.withTransaction(async () => {
          // Update flow document
          const result = await flowsCollection.replaceOne(
            { _id: MongoClient.createObjectId(flowId) },
            updatedFlow,
            { session }
          );

          if (result.matchedCount === 0) {
            throw new Error('Flow not found for update');
          }

          // Create new version atomically
          await this.versioningService.createVersion(
            flowId,
            updatedFlow,
            userId,
            `Applied ${transactions.length} transaction(s)`,
            session
          );
        }, {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 5000
        });
      } finally {
        await session.endSession();
      }

      // Invalidate and update cache (outside transaction for performance)
      await this.invalidateFlowCache(flowId, projectId, updatedFlow.metadata.workspaceId);
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

      // Invalidate cache
      await this.invalidateFlowCache(flowId, projectId, null);

      this.logger.info('Flow deleted', { flowId, deletedBy: userId });

    } catch (error) {
      this.logger.error('Failed to delete flow', error, { flowId, userId });
      throw error;
    }
  }

  // Enhanced Cache management using CacheManager
  async cacheFlow(flowId, flow, ttl = null) {
    // Cache the complete flow data
    await this.cacheManager.set(flowId, flow, ttl, 'FLOWS');
    
    // Cache flow metadata for quick lookups and list operations
    const metadata = {
      id: flowId,
      name: flow.metadata?.flowName,
      projectId: flow.metadata?.projectId,
      workspaceId: flow.metadata?.workspaceId,
      version: flow.metadata?.version,
      updatedAt: flow.metadata?.updatedAt,
      nodeCount: flow.nodes?.length || 0,
      edgeCount: flow.edges?.length || 0,
    };
    
    await this.cacheManager.set(`meta:${flowId}`, metadata, ttl, 'FLOWS');
    
    // Cache project and workspace flow lists
    if (flow.metadata?.projectId) {
      await this.invalidateProjectFlowsList(flow.metadata.projectId);
    }
    if (flow.metadata?.workspaceId) {
      await this.invalidateWorkspaceFlowsList(flow.metadata.workspaceId);
    }
  }

  async getCachedFlow(flowId) {
    return await this.cacheManager.get(flowId, 'FLOWS');
  }

  async getCachedFlowMetadata(flowId) {
    return await this.cacheManager.get(`meta:${flowId}`, 'FLOWS');
  }

  async removeCachedFlow(flowId) {
    await this.cacheManager.del(flowId, 'FLOWS');
    await this.cacheManager.del(`meta:${flowId}`, 'FLOWS');
  }

  async invalidateFlowCache(flowId, projectId, workspaceId) {
    // Remove specific flow caches
    await this.removeCachedFlow(flowId);
    
    // Invalidate related caches
    if (projectId) {
      await this.invalidateProjectFlowsList(projectId);
    }
    if (workspaceId) {
      await this.invalidateWorkspaceFlowsList(workspaceId);
    }
    
    // Invalidate any API response caches that might contain this flow
    await this.cacheManager.invalidateByPattern('*', 'API_RESPONSES');
  }

  async invalidateProjectFlowsList(projectId) {
    await this.cacheManager.invalidateByPattern(`project:${projectId}:*`, 'FLOWS');
  }

  async invalidateWorkspaceFlowsList(workspaceId) {
    await this.cacheManager.invalidateByPattern(`workspace:${workspaceId}:*`, 'FLOWS');
  }

  // Utility methods
  incrementVersion(version) {
    const parts = version.split('.').map(Number);
    parts[2]++; // Increment patch version
    return parts.join('.');
  }

  async listFlows(options = {}) {
    try {
      const {
        projectId,
        workspaceId,
        userId,
        page = 1,
        limit = 20,
        sortBy = 'updatedAt',
        sortOrder = 'desc',
        filter = {},
        search,
      } = options;

      // Create cache key based on query parameters
      const cacheKey = `list:${JSON.stringify({
        projectId,
        workspaceId,
        userId,
        page,
        limit,
        sortBy,
        sortOrder,
        filter,
        search,
      })}`;
      
      // Try to get from cache first
      const cached = await this.cacheManager.get(cacheKey, 'FLOWS');
      if (cached) {
        this.logger.debug('Flows list retrieved from cache', { cacheKey });
        return cached;
      }

      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      // Build query
      const query = { 'metadata.status': { $ne: 'deleted' } };
      
      if (projectId) query['metadata.projectId'] = projectId;
      if (workspaceId) query['metadata.workspaceId'] = workspaceId;
      if (userId) query['metadata.createdBy'] = userId;
      
      // Apply additional filters
      if (filter.template) query['metadata.template'] = filter.template;
      if (filter.createdAfter) query['metadata.createdAt'] = { $gte: new Date(filter.createdAfter) };
      if (filter.createdBefore) {
        query['metadata.createdAt'] = { 
          ...query['metadata.createdAt'],
          $lte: new Date(filter.createdBefore),
        };
      }
      
      // Search functionality
      if (search) {
        query.$or = [
          { 'metadata.flowName': { $regex: search, $options: 'i' } },
          { 'metadata.description': { $regex: search, $options: 'i' } },
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sortOptions = { [`metadata.${sortBy}`]: sortOrder === 'desc' ? -1 : 1 };
      
      // Execute query with pagination
      const [flows, totalCount] = await Promise.all([
        flowsCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .toArray(),
        flowsCollection.countDocuments(query),
      ]);

      // Format results
      const formattedFlows = flows.map(flow => ({
        id: flow._id.toString(),
        name: flow.metadata.flowName,
        description: flow.metadata.description,
        version: flow.metadata.version,
        projectId: flow.metadata.projectId,
        workspaceId: flow.metadata.workspaceId,
        createdBy: flow.metadata.createdBy,
        createdAt: flow.metadata.createdAt,
        updatedAt: flow.metadata.updatedAt,
        nodeCount: flow.nodes?.length || 0,
        edgeCount: flow.edges?.length || 0,
      }));

      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      const result = {
        flows: formattedFlows,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
        },
        filters: {
          projectId,
          workspaceId,
          search,
          sortBy,
          sortOrder,
        },
      };

      // Cache the query result for future requests
      await this.cacheManager.set(cacheKey, result, null, 'FLOWS');

      this.logger.debug('Flows listed and cached', {
        totalCount,
        page,
        limit,
        resultCount: flows.length,
        projectId,
        workspaceId,
        cacheKey,
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to list flows', error, options);
      throw error;
    }
  }

  async getFlowStatistics(options = {}) {
    try {
      const { projectId, workspaceId, userId } = options;
      
      // Create cache key for statistics
      const cacheKey = `stats:${JSON.stringify({ projectId, workspaceId, userId })}`;
      
      // Try to get from cache first
      const cached = await this.cacheManager.get(cacheKey, 'FLOWS');
      if (cached) {
        this.logger.debug('Flow statistics retrieved from cache', { cacheKey });
        return cached;
      }
      
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      
      // Build base query
      const baseQuery = { 'metadata.status': { $ne: 'deleted' } };
      if (projectId) baseQuery['metadata.projectId'] = projectId;
      if (workspaceId) baseQuery['metadata.workspaceId'] = workspaceId;
      if (userId) baseQuery['metadata.createdBy'] = userId;

      // Aggregate statistics
      const pipeline = [
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalFlows: { $sum: 1 },
            totalNodes: { $sum: { $size: '$nodes' } },
            totalEdges: { $sum: { $size: '$edges' } },
            avgNodes: { $avg: { $size: '$nodes' } },
            avgEdges: { $avg: { $size: '$edges' } },
            oldestFlow: { $min: '$metadata.createdAt' },
            newestFlow: { $max: '$metadata.createdAt' },
            lastModified: { $max: '$metadata.updatedAt' },
          },
        },
      ];
      
      const [stats] = await flowsCollection.aggregate(pipeline).toArray();
      
      // Get node type distribution
      const nodeTypesPipeline = [
        { $match: baseQuery },
        { $unwind: '$nodes' },
        {
          $group: {
            _id: '$nodes.type',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ];
      
      const nodeTypes = await flowsCollection.aggregate(nodeTypesPipeline).toArray();
      
      // Get recent activity (flows created/updated in last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentActivityQuery = {
        ...baseQuery,
        'metadata.updatedAt': { $gte: weekAgo },
      };
      
      const recentActivity = await flowsCollection.countDocuments(recentActivityQuery);
      
      const result = {
        overview: {
          totalFlows: stats?.totalFlows || 0,
          totalNodes: stats?.totalNodes || 0,
          totalEdges: stats?.totalEdges || 0,
          averageNodes: Math.round((stats?.avgNodes || 0) * 10) / 10,
          averageEdges: Math.round((stats?.avgEdges || 0) * 10) / 10,
          recentActivity,
        },
        nodeTypes: nodeTypes.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        timeline: {
          oldestFlow: stats?.oldestFlow,
          newestFlow: stats?.newestFlow,
          lastModified: stats?.lastModified,
        },
        filters: { projectId, workspaceId, userId },
      };

      // Cache statistics result (shorter TTL since stats change more frequently)
      await this.cacheManager.set(cacheKey, result, 180, 'FLOWS'); // 3 minutes cache

      this.logger.debug('Flow statistics calculated and cached', {
        ...result.overview,
        cacheKey,
      });
      
      return result;

    } catch (error) {
      this.logger.error('Failed to get flow statistics', error, options);
      throw error;
    }
  }

  async duplicateFlow(flowId, options = {}) {
    try {
      const { projectId, workspaceId, userId, name } = options;
      
      if (!userId) {
        throw new Error('userId is required for flow duplication');
      }
      
      // Get original flow
      const originalFlow = await this.getFlow(flowId);
      
      // Create new flow data
      const duplicatedFlowData = {
        ...originalFlow,
        metadata: {
          ...originalFlow.metadata,
          flowName: name || `${originalFlow.metadata.flowName} (Copy)`,
          projectId: projectId || originalFlow.metadata.projectId,
          workspaceId: workspaceId || originalFlow.metadata.workspaceId,
          createdBy: userId,
          lastModifiedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: '1.0.0',
          duplicatedFrom: flowId,
        },
        _id: undefined, // Remove original ID
        id: undefined,
      };
      
      // Store duplicated flow
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');
      const result = await flowsCollection.insertOne(duplicatedFlowData);
      const newFlowId = result.insertedId.toString();
      
      // Create initial version for duplicated flow
      await this.versioningService.createVersion(
        newFlowId,
        duplicatedFlowData,
        userId,
        `Duplicated from flow ${flowId}`
      );
      
      // Cache the duplicated flow
      await this.cacheFlow(newFlowId, duplicatedFlowData);
      
      this.logger.info('Flow duplicated', {
        originalFlowId: flowId,
        newFlowId,
        duplicatedBy: userId,
      });
      
      return {
        flowId: newFlowId,
        flow: {
          ...duplicatedFlowData,
          id: newFlowId,
          _id: undefined,
        },
      };
      
    } catch (error) {
      this.logger.error('Failed to duplicate flow', error, { flowId, options });
      throw error;
    }
  }

  async createDatabaseIndexes() {
    try {
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');

      // Create compound indexes for common queries
      const indexes = [
        // Project and workspace queries
        { key: { 'metadata.projectId': 1, 'metadata.workspaceId': 1, 'metadata.status': 1 }, name: 'project_workspace_status' },
        
        // User queries
        { key: { 'metadata.createdBy': 1, 'metadata.status': 1 }, name: 'created_by_status' },
        
        // Sorting and filtering
        { key: { 'metadata.updatedAt': -1, 'metadata.status': 1 }, name: 'updated_at_status' },
        { key: { 'metadata.createdAt': -1, 'metadata.status': 1 }, name: 'created_at_status' },
        
        // Search optimization
        { key: { 'metadata.flowName': 'text', 'metadata.description': 'text' }, name: 'search_text' },
        
        // Template and version queries
        { key: { 'metadata.template': 1, 'metadata.status': 1 }, name: 'template_status' },
        { key: { 'metadata.version': 1 }, name: 'version' },
      ];

      for (const index of indexes) {
        try {
          await flowsCollection.createIndex(index.key, { name: index.name, background: true });
          this.logger.info('Database index created', { collection: 'flows', index: index.name });
        } catch (error) {
          if (!error.message.includes('already exists')) {
            this.logger.warn('Failed to create database index', error, { index: index.name });
          }
        }
      }

      this.logger.info('Flow service database indexes initialized');
      
    } catch (error) {
      this.logger.error('Failed to create database indexes', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      // Test MongoDB connection
      const db = this.mongoClient.getDb();
      await db.admin().ping();
      
      // Test Redis connection
      await this.redisClient.ping();
      
      // Get basic stats
      const flowsCollection = db.collection('flows');
      const flowCount = await flowsCollection.countDocuments({ 'metadata.status': { $ne: 'deleted' } });
      
      return {
        status: 'healthy',
        connections: {
          mongodb: 'connected',
          redis: 'connected',
        },
        stats: {
          totalFlows: flowCount,
          cacheStatus: 'active',
        },
        timestamp: new Date(),
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
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