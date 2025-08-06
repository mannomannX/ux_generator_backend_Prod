// ==========================================
// SERVICES/FLOW-SERVICE/src/routes/versions.js
// ==========================================
import express from 'express';

const router = express.Router();

// Get all versions for a flow
router.get('/flow/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { page = 1, limit = 20, includeData = false } = req.query;

    const result = await req.versioningService.getVersions(flowId, {
      page: parseInt(page),
      limit: parseInt(limit),
      includeData: includeData === 'true',
    });

    res.json(result);

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get flow versions',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get specific version
router.get('/flow/:flowId/version/:versionNumber', async (req, res) => {
  try {
    const { flowId, versionNumber } = req.params;

    const version = await req.versioningService.getVersion(flowId, parseInt(versionNumber));

    res.json({
      version,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Version not found',
        flowId: req.params.flowId,
        versionNumber: req.params.versionNumber,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to get flow version',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Create manual version (snapshot)
router.post('/flow/:flowId/snapshot', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { description } = req.body;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    // Get current flow
    const flow = await req.flowManager.getFlow(flowId);

    // Create version
    const result = await req.versioningService.createVersion(
      flowId,
      flow,
      userId,
      description || 'Manual snapshot'
    );

    res.status(201).json({
      message: 'Snapshot created successfully',
      version: result,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create snapshot',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Restore flow to specific version
router.post('/flow/:flowId/restore/:versionNumber', async (req, res) => {
  try {
    const { flowId, versionNumber } = req.params;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    const restoredFlow = await req.versioningService.restoreVersion(
      flowId,
      parseInt(versionNumber),
      userId
    );

    res.json({
      message: 'Flow restored successfully',
      restoredToVersion: parseInt(versionNumber),
      flow: restoredFlow,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Version not found',
        flowId: req.params.flowId,
        versionNumber: req.params.versionNumber,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to restore flow version',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Compare two versions
router.get('/flow/:flowId/compare/:versionA/:versionB', async (req, res) => {
  try {
    const { flowId, versionA, versionB } = req.params;

    const comparison = await req.versioningService.compareVersions(
      flowId,
      parseInt(versionA),
      parseInt(versionB)
    );

    res.json({
      comparison,
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'One or both versions not found',
        flowId: req.params.flowId,
        versionA: req.params.versionA,
        versionB: req.params.versionB,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to compare versions',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

// Get version statistics
router.get('/flow/:flowId/stats', async (req, res) => {
  try {
    const { flowId } = req.params;

    const stats = await req.versioningService.getVersionStats(flowId);

    res.json({
      flowId,
      stats,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get version statistics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Delete old versions (cleanup)
router.delete('/flow/:flowId/cleanup', async (req, res) => {
  try {
    const { flowId } = req.params;
    const { keepVersions = 10 } = req.query;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    const result = await req.versioningService.deleteVersions(
      flowId,
      parseInt(keepVersions)
    );

    res.json({
      message: 'Version cleanup completed',
      deletedCount: result.deletedCount,
      deletedVersions: result.deletedVersions,
      keptVersions: parseInt(keepVersions),
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to cleanup versions',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Export version as JSON
router.get('/flow/:flowId/version/:versionNumber/export', async (req, res) => {
  try {
    const { flowId, versionNumber } = req.params;
    const { format = 'json' } = req.query;

    const version = await req.versioningService.getVersion(flowId, parseInt(versionNumber));

    const exportData = {
      flowId,
      version: {
        number: version.versionNumber,
        description: version.description,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
      },
      flowData: version.flowData,
      exportedAt: new Date().toISOString(),
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 
        `attachment; filename="flow_${flowId}_v${versionNumber}.json"`
      );
      res.json(exportData);
    } else {
      res.status(400).json({
        error: 'Unsupported export format',
        supportedFormats: ['json'],
        correlationId: req.correlationId,
      });
    }

  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: 'Version not found',
        flowId: req.params.flowId,
        versionNumber: req.params.versionNumber,
        correlationId: req.correlationId,
      });
    } else {
      res.status(500).json({
        error: 'Failed to export version',
        message: error.message,
        correlationId: req.correlationId,
      });
    }
  }
});

export default router;