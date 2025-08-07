// ==========================================
// SERVICES/FLOW-SERVICE/src/routes/flows.js
// ==========================================
import express from 'express';
import { MongoClient } from '@ux-flow/common';

const router = express.Router();

// Get flow by project ID
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({
        error: 'workspaceId query parameter is required',
        correlationId: req.correlationId,
      });
    }

    const flow = await req.flowManager.getFlow(null, projectId, workspaceId);

    res.json({
      flow,
      projectId,
      workspaceId,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Flow not found',
        projectId: req.params.projectId,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to retrieve flow',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get flow by flow ID
router.get('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { projectId, workspaceId } = req.query;

    const flow = await req.flowManager.getFlow(flowId, projectId, workspaceId);

    res.json({
      flow,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Flow not found',
        flowId: req.params.flowId,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to retrieve flow',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Create new flow
router.post('/', async (req, res) => {
  try {
    const { projectId, workspaceId, template, name, description } = req.body;
    const userId = req.headers['x-user-id']; // From API Gateway

    if (!projectId || !workspaceId || !userId) {
      return res.status(400).json({
        error: 'projectId, workspaceId, and userId are required',
        correlationId: req.correlationId,
      });
    }

    const result = await req.flowManager.createFlow(
      projectId,
      workspaceId,
      userId,
      { template, name, description }
    );

    res.status(201).json({
      message: 'Flow created successfully',
      flowId: result.flowId,
      flow: result.flow,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create flow',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Update flow with transactions
router.patch('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { transactions, projectId } = req.body;
    const userId = req.headers['x-user-id'];

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        error: 'transactions array is required',
        correlationId: req.correlationId,
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    // Validate transactions first
    const validation = req.validationService.validateTransactions(transactions);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Transaction validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    const updatedFlow = await req.flowManager.updateFlow(
      flowId,
      transactions,
      userId,
      projectId
    );

    res.json({
      message: 'Flow updated successfully',
      flow: updatedFlow,
      transactionCount: transactions.length,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Flow not found',
        flowId: req.params.flowId,
        correlationId: req.correlationId,
      });
    } else if (error.message.includes('validation failed')) {
      res.status(400).json({
        error: 'Flow validation failed',
        message: error.message,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to update flow',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Validate flow
router.post('/:flowId/validate', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { flowData, transactions } = req.body;

    let validation;

    if (flowData) {
      validation = req.validationService.validateFlow(flowData);
    } else if (transactions) {
      validation = req.validationService.validateTransactions(transactions);
    } else {
      // Validate current flow
      const flow = await req.flowManager.getFlow(flowId);
      validation = req.validationService.validateFlow(flow);
    }

    res.json({
      validation,
      flowId,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Delete flow
router.delete('/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { projectId } = req.query;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    await req.flowManager.deleteFlow(flowId, userId, projectId);

    res.json({
      message: 'Flow deleted successfully',
      flowId,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Flow not found',
        flowId: req.params.flowId,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to delete flow',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Export flow
router.get('/:flowId/export', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { format = 'json', includeVersions = false } = req.query;

    const flow = await req.flowManager.getFlow(flowId);
    
    const exportData = {
      flow,
      exportedAt: new Date().toISOString(),
      version: flow.metadata.version,
    };

    if (includeVersions === 'true') {
      const versions = await req.versioningService.getVersions(flowId, {
        includeData: false,
        limit: 100,
      });
      exportData.versions = versions.versions;
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="flow_${flowId}.json"`);
      res.json(exportData);
    } else {
      res.status(400).json({
        error: 'Unsupported export format',
        supportedFormats: ['json'],
        correlationId: req.correlationId,
      });
    }

  } catch (error) {
    res.status(500).json({
      error: 'Failed to export flow',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Import flow
router.post('/import', async (req, res) => {
  try {
    const { flowData, projectId, workspaceId, name } = req.body;
    const userId = req.headers['x-user-id'];

    if (!flowData || !projectId || !workspaceId || !userId) {
      return res.status(400).json({
        error: 'flowData, projectId, workspaceId, and userId are required',
        correlationId: req.correlationId,
      });
    }

    // Validate imported flow
    const validation = req.validationService.validateFlow(flowData);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Imported flow validation failed',
        details: validation.errors,
        correlationId: req.correlationId,
      });
    }

    // Create new flow from imported data
    const result = await req.flowManager.createFlow(
      projectId,
      workspaceId,
      userId,
      { name: name || 'Imported Flow' }
    );

    // Update with imported data
    const importedFlow = {
      ...flowData,
      metadata: {
        ...flowData.metadata,
        projectId,
        workspaceId,
        createdBy: userId,
        lastModifiedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        importedAt: new Date(),
      },
    };

    // Replace the flow with imported data
    const db = req.flowManager.mongoClient.getDb();
    await db.collection('flows').replaceOne(
      { _id: MongoClient.createObjectId(result.flowId) },
      importedFlow
    );

    res.status(201).json({
      message: 'Flow imported successfully',
      flowId: result.flowId,
      validation,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to import flow',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get flow statistics
router.get('/:flowId/stats', async (req, res) => {
  try {
    const { flowId } = req.params;

    const [flow, versionStats] = await Promise.all([
      req.flowManager.getFlow(flowId),
      req.versioningService.getVersionStats(flowId),
    ]);

    const validation = req.validationService.validateFlow(flow);

    const stats = {
      flowId,
      name: flow.metadata.flowName,
      version: flow.metadata.version,
      nodeCount: flow.nodes?.length || 0,
      edgeCount: flow.edges?.length || 0,
      nodeTypes: {},
      edgeTypes: {},
      validation: {
        isValid: validation.isValid,
        errorCount: validation.errors?.length || 0,
        warningCount: validation.warnings?.length || 0,
      },
      versions: versionStats,
      lastModified: flow.metadata.updatedAt,
      createdAt: flow.metadata.createdAt,
    };

    // Count node types
    if (flow.nodes) {
      for (const node of flow.nodes) {
        stats.nodeTypes[node.type] = (stats.nodeTypes[node.type] || 0) + 1;
      }
    }

    // Count edge trigger types
    if (flow.edges) {
      for (const edge of flow.edges) {
        const trigger = edge.data?.trigger || 'none';
        stats.edgeTypes[trigger] = (stats.edgeTypes[trigger] || 0) + 1;
      }
    }

    res.json(stats);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get flow statistics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// List flows with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const {
      projectId,
      workspaceId,
      page = '1',
      limit = '20',
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      search,
      template,
      createdAfter,
      createdBefore,
    } = req.query;

    const userId = req.headers['x-user-id'];

    const options = {
      projectId,
      workspaceId,
      userId: req.query.createdBy || (req.query.myFlows === 'true' ? userId : undefined),
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Cap at 100
      sortBy,
      sortOrder,
      search,
      filter: {
        template,
        createdAfter,
        createdBefore,
      },
    };

    const result = await req.flowManager.listFlows(options);

    res.json({
      message: 'Flows retrieved successfully',
      ...result,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to list flows',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get aggregate statistics
router.get('/stats/aggregate', async (req, res) => {
  try {
    const { projectId, workspaceId } = req.query;
    const userId = req.headers['x-user-id'];

    const options = {};
    if (projectId) options.projectId = projectId;
    if (workspaceId) options.workspaceId = workspaceId;
    if (req.query.myStats === 'true') options.userId = userId;

    const stats = await req.flowManager.getFlowStatistics(options);

    res.json({
      message: 'Flow statistics retrieved successfully',
      ...stats,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get flow statistics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Duplicate flow
router.post('/:flowId/duplicate', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { projectId, workspaceId, name } = req.body;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    const result = await req.flowManager.duplicateFlow(flowId, {
      projectId,
      workspaceId,
      userId,
      name,
    });

    res.status(201).json({
      message: 'Flow duplicated successfully',
      originalFlowId: flowId,
      newFlowId: result.flowId,
      flow: result.flow,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Original flow not found',
        flowId: req.params.flowId,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to duplicate flow',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

export default router;