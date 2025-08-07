// ==========================================
// SERVICES/FLOW-SERVICE/tests/unit/flow-manager.test.js
// ==========================================
import { jest } from '@jest/globals';
import { FlowManager } from '../../src/services/flow-manager.js';
import { MongoClient, CacheManager } from '@ux-flow/common';

// Mock dependencies
jest.mock('@ux-flow/common');
jest.mock('../../src/services/validation-service.js');
jest.mock('../../src/services/versioning-service.js');

describe('FlowManager', () => {
  let flowManager;
  let mockLogger;
  let mockMongoClient;
  let mockRedisClient;
  let mockValidationService;
  let mockVersioningService;
  let mockCacheManager;
  let mockDb;
  let mockCollection;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Setup mock collection
    mockCollection = {
      insertOne: jest.fn(),
      findOne: jest.fn(),
      replaceOne: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn(),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn(),
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn(),
      }),
      createIndex: jest.fn(),
    };

    // Setup mock database
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
      admin: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue('pong'),
      }),
    };

    // Setup mock MongoDB client
    mockMongoClient = {
      getDb: jest.fn().mockReturnValue(mockDb),
      connect: jest.fn(),
      disconnect: jest.fn(),
      healthCheck: jest.fn(),
    };

    // Setup mock Redis client
    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    // Setup mock CacheManager
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      invalidateByPattern: jest.fn(),
    };
    CacheManager.mockImplementation(() => mockCacheManager);

    // Setup mock validation service
    mockValidationService = {
      validateFlow: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    };

    // Setup mock versioning service
    mockVersioningService = {
      createVersion: jest.fn().mockResolvedValue(true),
    };

    // Create FlowManager instance
    flowManager = new FlowManager(
      mockLogger,
      mockMongoClient,
      mockRedisClient,
      mockValidationService,
      mockVersioningService
    );
  });

  describe('createFlow', () => {
    it('should create a new flow successfully', async () => {
      const projectId = 'project123';
      const workspaceId = 'workspace123';
      const userId = 'user123';
      const options = {
        template: 'basic',
        name: 'Test Flow',
        description: 'Test Description',
      };

      const mockInsertResult = {
        insertedId: { toString: () => 'flow123' },
      };

      mockCollection.insertOne.mockResolvedValue(mockInsertResult);

      const result = await flowManager.createFlow(projectId, workspaceId, userId, options);

      expect(mockValidationService.validateFlow).toHaveBeenCalled();
      expect(mockCollection.insertOne).toHaveBeenCalled();
      expect(mockVersioningService.createVersion).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(result.flowId).toBe('flow123');
      expect(result.flow.metadata.flowName).toBe('Test Flow');
    });

    it('should throw error when validation fails', async () => {
      mockValidationService.validateFlow.mockReturnValue({
        isValid: false,
        errors: ['Invalid flow structure'],
      });

      await expect(
        flowManager.createFlow('project123', 'workspace123', 'user123')
      ).rejects.toThrow('Flow validation failed: Invalid flow structure');
    });

    it('should use empty template when invalid template provided', async () => {
      const mockInsertResult = {
        insertedId: { toString: () => 'flow123' },
      };

      mockCollection.insertOne.mockResolvedValue(mockInsertResult);

      await flowManager.createFlow('project123', 'workspace123', 'user123', {
        template: 'invalid-template',
      });

      const insertCall = mockCollection.insertOne.mock.calls[0][0];
      expect(insertCall.metadata.flowName).toBe('New Flow');
      expect(insertCall.nodes).toHaveLength(1);
      expect(insertCall.nodes[0].type).toBe('Start');
    });
  });

  describe('getFlow', () => {
    it('should return cached flow when available', async () => {
      const flowId = 'flow123';
      const cachedFlow = {
        id: flowId,
        metadata: { flowName: 'Cached Flow' },
        nodes: [],
        edges: [],
      };

      mockCacheManager.get.mockResolvedValue(cachedFlow);

      const result = await flowManager.getFlow(flowId);

      expect(mockCacheManager.get).toHaveBeenCalledWith(flowId, 'FLOWS');
      expect(result).toBe(cachedFlow);
      expect(mockCollection.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from database when not cached', async () => {
      const flowId = 'flow123';
      const dbFlow = {
        _id: { toString: () => flowId },
        metadata: { flowName: 'DB Flow' },
        nodes: [],
        edges: [],
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockCollection.findOne.mockResolvedValue(dbFlow);
      MongoClient.createObjectId = jest.fn().mockReturnValue(flowId);

      const result = await flowManager.getFlow(flowId);

      expect(mockCollection.findOne).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(result.id).toBe(flowId);
      expect(result._id).toBeUndefined();
    });

    it('should throw error when flow not found', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCollection.findOne.mockResolvedValue(null);
      MongoClient.createObjectId = jest.fn().mockReturnValue('flow123');

      await expect(flowManager.getFlow('flow123')).rejects.toThrow('Flow not found');
    });
  });

  describe('updateFlow', () => {
    it('should update flow successfully', async () => {
      const flowId = 'flow123';
      const userId = 'user123';
      const transactions = [
        {
          action: 'ADD_NODE',
          payload: { id: 'node1', type: 'Screen', position: { x: 0, y: 0 } },
        },
      ];

      const currentFlow = {
        id: flowId,
        metadata: { version: '1.0.0' },
        nodes: [],
        edges: [],
      };

      const mockReplaceResult = { matchedCount: 1 };

      // Mock getFlow to return current flow
      jest.spyOn(flowManager, 'getFlow').mockResolvedValue(currentFlow);
      mockCollection.replaceOne.mockResolvedValue(mockReplaceResult);

      const result = await flowManager.updateFlow(flowId, transactions, userId);

      expect(flowManager.getFlow).toHaveBeenCalledWith(flowId, null);
      expect(mockCollection.replaceOne).toHaveBeenCalled();
      expect(mockVersioningService.createVersion).toHaveBeenCalled();
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('node1');
    });

    it('should throw error when flow not found for update', async () => {
      const flowId = 'flow123';
      const currentFlow = { id: flowId, metadata: { version: '1.0.0' }, nodes: [], edges: [] };
      
      jest.spyOn(flowManager, 'getFlow').mockResolvedValue(currentFlow);
      mockCollection.replaceOne.mockResolvedValue({ matchedCount: 0 });

      await expect(
        flowManager.updateFlow(flowId, [], 'user123')
      ).rejects.toThrow('Flow not found for update');
    });
  });

  describe('transaction operations', () => {
    let testFlow;

    beforeEach(() => {
      testFlow = {
        nodes: [
          { id: 'node1', type: 'Start', position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [],
      };
    });

    describe('applyAddNode', () => {
      it('should add node successfully', () => {
        const payload = {
          id: 'node2',
          type: 'Screen',
          position: { x: 100, y: 100 },
          data: { title: 'Screen 1' },
        };

        flowManager.applyAddNode(testFlow, payload);

        expect(testFlow.nodes).toHaveLength(2);
        expect(testFlow.nodes[1]).toMatchObject(payload);
      });

      it('should throw error when node already exists', () => {
        const payload = { id: 'node1', type: 'Screen' };

        expect(() => flowManager.applyAddNode(testFlow, payload)).toThrow(
          'Node with id node1 already exists'
        );
      });

      it('should throw error when payload is invalid', () => {
        expect(() => flowManager.applyAddNode(testFlow, {})).toThrow(
          'ADD_NODE requires id and type'
        );
      });
    });

    describe('applyUpdateNode', () => {
      it('should update node successfully', () => {
        const payload = {
          id: 'node1',
          position: { x: 50, y: 50 },
          data: { title: 'Updated Start' },
        };

        flowManager.applyUpdateNode(testFlow, payload);

        expect(testFlow.nodes[0].position).toEqual({ x: 50, y: 50 });
        expect(testFlow.nodes[0].data.title).toBe('Updated Start');
      });

      it('should throw error when node not found', () => {
        const payload = { id: 'nonexistent', position: { x: 0, y: 0 } };

        expect(() => flowManager.applyUpdateNode(testFlow, payload)).toThrow(
          'Node with id nonexistent not found'
        );
      });
    });

    describe('applyDeleteNode', () => {
      beforeEach(() => {
        testFlow.nodes.push({
          id: 'node2',
          type: 'Screen',
          position: { x: 100, y: 100 },
          data: {},
        });
        testFlow.edges.push({
          id: 'edge1',
          source: 'node1',
          target: 'node2',
          data: {},
        });
      });

      it('should delete node and connected edges', () => {
        flowManager.applyDeleteNode(testFlow, { id: 'node1' });

        expect(testFlow.nodes).toHaveLength(1);
        expect(testFlow.nodes[0].id).toBe('node2');
        expect(testFlow.edges).toHaveLength(0);
      });
    });

    describe('applyAddEdge', () => {
      beforeEach(() => {
        testFlow.nodes.push({
          id: 'node2',
          type: 'End',
          position: { x: 200, y: 200 },
          data: {},
        });
      });

      it('should add edge successfully', () => {
        const payload = {
          id: 'edge1',
          source: 'node1',
          target: 'node2',
          data: { trigger: 'onClick' },
        };

        flowManager.applyAddEdge(testFlow, payload);

        expect(testFlow.edges).toHaveLength(1);
        expect(testFlow.edges[0]).toMatchObject(payload);
      });

      it('should throw error when source node not found', () => {
        const payload = {
          id: 'edge1',
          source: 'nonexistent',
          target: 'node2',
        };

        expect(() => flowManager.applyAddEdge(testFlow, payload)).toThrow(
          'Source node nonexistent not found'
        );
      });
    });
  });

  describe('listFlows', () => {
    it('should return cached results when available', async () => {
      const options = { projectId: 'project123', page: 1, limit: 20 };
      const cachedResult = {
        flows: [{ id: 'flow1', name: 'Test Flow' }],
        pagination: { currentPage: 1, totalPages: 1, totalCount: 1 },
      };

      mockCacheManager.get.mockResolvedValue(cachedResult);

      const result = await flowManager.listFlows(options);

      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(result).toBe(cachedResult);
      expect(mockCollection.find).not.toHaveBeenCalled();
    });

    it('should query database when not cached', async () => {
      const options = { projectId: 'project123', page: 1, limit: 20 };
      const mockFlows = [
        {
          _id: { toString: () => 'flow1' },
          metadata: {
            flowName: 'Test Flow',
            projectId: 'project123',
            createdAt: new Date(),
          },
          nodes: [],
          edges: [],
        },
      ];

      mockCacheManager.get.mockResolvedValue(null);
      mockCollection.find().sort().skip().limit().toArray.mockResolvedValue(mockFlows);
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await flowManager.listFlows(options);

      expect(mockCollection.find).toHaveBeenCalled();
      expect(mockCollection.countDocuments).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(result.flows).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
    });

    it('should apply search filter correctly', async () => {
      const options = { search: 'test flow' };

      mockCacheManager.get.mockResolvedValue(null);
      mockCollection.find().sort().skip().limit().toArray.mockResolvedValue([]);
      mockCollection.countDocuments.mockResolvedValue(0);

      await flowManager.listFlows(options);

      const findCall = mockCollection.find.mock.calls[0][0];
      expect(findCall.$or).toBeDefined();
      expect(findCall.$or).toContainEqual({
        'metadata.flowName': { $regex: 'test flow', $options: 'i' },
      });
    });
  });

  describe('getFlowStatistics', () => {
    it('should return cached statistics when available', async () => {
      const options = { projectId: 'project123' };
      const cachedStats = {
        overview: { totalFlows: 5, totalNodes: 20 },
        nodeTypes: { Screen: 10, Start: 5, End: 5 },
      };

      mockCacheManager.get.mockResolvedValue(cachedStats);

      const result = await flowManager.getFlowStatistics(options);

      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(result).toBe(cachedStats);
    });

    it('should calculate statistics from database when not cached', async () => {
      const options = { projectId: 'project123' };
      const mockStats = [{
        _id: null,
        totalFlows: 3,
        totalNodes: 15,
        totalEdges: 10,
        avgNodes: 5.0,
        avgEdges: 3.33,
      }];

      const mockNodeTypes = [
        { _id: 'Screen', count: 8 },
        { _id: 'Start', count: 3 },
        { _id: 'End', count: 3 },
      ];

      mockCacheManager.get.mockResolvedValue(null);
      mockCollection.aggregate().toArray
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockNodeTypes);
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await flowManager.getFlowStatistics(options);

      expect(result.overview.totalFlows).toBe(3);
      expect(result.overview.totalNodes).toBe(15);
      expect(result.nodeTypes.Screen).toBe(8);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        180,
        'FLOWS'
      );
    });
  });

  describe('duplicateFlow', () => {
    it('should duplicate flow successfully', async () => {
      const originalFlow = {
        metadata: {
          flowName: 'Original Flow',
          projectId: 'project123',
          workspaceId: 'workspace123',
        },
        nodes: [{ id: 'node1', type: 'Start' }],
        edges: [],
      };

      const mockInsertResult = {
        insertedId: { toString: () => 'flow456' },
      };

      jest.spyOn(flowManager, 'getFlow').mockResolvedValue(originalFlow);
      mockCollection.insertOne.mockResolvedValue(mockInsertResult);

      const result = await flowManager.duplicateFlow('flow123', {
        userId: 'user123',
        name: 'Duplicated Flow',
      });

      expect(result.flowId).toBe('flow456');
      expect(result.flow.metadata.flowName).toBe('Duplicated Flow');
      expect(result.flow.metadata.duplicatedFrom).toBe('flow123');
      expect(mockVersioningService.createVersion).toHaveBeenCalled();
    });

    it('should throw error when userId is missing', async () => {
      await expect(
        flowManager.duplicateFlow('flow123', {})
      ).rejects.toThrow('userId is required for flow duplication');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all connections work', async () => {
      const result = await flowManager.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.connections.mongodb).toBe('connected');
      expect(result.connections.redis).toBe('connected');
      expect(result.stats.totalFlows).toBeDefined();
    });

    it('should return unhealthy status when database fails', async () => {
      mockDb.admin().ping.mockRejectedValue(new Error('DB Error'));

      const result = await flowManager.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('DB Error');
    });
  });
});