// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/routes/knowledge.js
// ==========================================
import express from 'express';

const router = express.Router();

// Query knowledge base
router.post('/query', async (req, res) => {
  try {
    const { 
      query, 
      userId, 
      workspaceId, 
      projectId, 
      nResults = 5,
      includeGlobal = true 
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        correlationId: req.correlationId,
      });
    }

    const results = await req.knowledgeManager.queryKnowledge(query, {
      userId,
      workspaceId,
      projectId,
      nResults: parseInt(nResults),
      includeGlobal,
    });

    res.json({
      query,
      results,
      resultCount: results.length,
      sources: [...new Set(results.map(r => r.source))],
      queryOptions: {
        nResults: parseInt(nResults),
        includeGlobal,
        userId,
        workspaceId,
        projectId,
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Knowledge query failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get knowledge statistics
router.get('/stats', async (req, res) => {
  try {
    const { workspaceId, projectId } = req.query;
    
    const stats = await req.knowledgeManager.getStats();
    
    // Add filtered stats if workspace/project specified
    if (workspaceId || projectId) {
      const filteredCollections = {};
      
      Object.entries(stats.collectionDetails).forEach(([name, details]) => {
        const includeCollection = 
          (name === 'ux_global_knowledge') ||
          (workspaceId && name === `workspace_${workspaceId}`) ||
          (projectId && name === `project_${projectId}`);
        
        if (includeCollection) {
          filteredCollections[name] = details;
        }
      });
      
      stats.filteredCollections = filteredCollections;
    }

    res.json({
      message: 'Knowledge statistics retrieved successfully',
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get knowledge statistics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get advanced knowledge analytics
router.get('/stats/advanced', async (req, res) => {
  try {
    const { timeRange = '24h', includeDetails = 'false' } = req.query;
    
    const advancedStats = await req.knowledgeManager.getAdvancedStats({
      timeRange,
      includeDetails: includeDetails === 'true',
    });

    res.json({
      message: 'Advanced knowledge analytics retrieved successfully',
      ...advancedStats,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get advanced knowledge analytics',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Search within specific scope
router.post('/search/:scope', async (req, res) => {
  try {
    const { scope } = req.params;
    const { query, nResults = 10, workspaceId, projectId } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
        correlationId: req.correlationId,
      });
    }

    let collectionName;
    switch (scope) {
      case 'global':
        collectionName = 'ux_global_knowledge';
        break;
      case 'workspace':
        if (!workspaceId) {
          return res.status(400).json({
            error: 'workspaceId is required for workspace search',
            correlationId: req.correlationId,
          });
        }
        collectionName = `workspace_${workspaceId}`;
        break;
      case 'project':
        if (!projectId) {
          return res.status(400).json({
            error: 'projectId is required for project search',
            correlationId: req.correlationId,
          });
        }
        collectionName = `project_${projectId}`;
        break;
      default:
        return res.status(400).json({
          error: 'Invalid scope. Must be: global, workspace, or project',
          correlationId: req.correlationId,
        });
    }

    const results = await req.knowledgeManager.queryCollection(
      collectionName,
      query,
      parseInt(nResults)
    );

    res.json({
      scope,
      collectionName,
      query,
      results: results.map(r => ({
        content: r.document,
        metadata: r.metadata,
        relevanceScore: r.distance,
      })),
      resultCount: results.length,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Scoped search failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Add knowledge to specific scope
router.post('/add/:scope', async (req, res) => {
  try {
    const { scope } = req.params;
    const { content, metadata = {}, userId, workspaceId, projectId } = req.body;

    if (!content) {
      return res.status(400).json({
        error: 'Content is required',
        correlationId: req.correlationId,
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    // Validate scope requirements
    if (scope === 'workspace' && !workspaceId) {
      return res.status(400).json({
        error: 'workspaceId is required for workspace scope',
        correlationId: req.correlationId,
      });
    }

    if (scope === 'project' && !projectId) {
      return res.status(400).json({
        error: 'projectId is required for project scope',
        correlationId: req.correlationId,
      });
    }

    const result = await req.knowledgeManager.addDocument(
      content,
      {
        ...metadata,
        userId,
        workspaceId,
        projectId,
      },
      scope
    );

    res.status(201).json({
      message: 'Knowledge added successfully',
      docId: result.docId,
      chunkCount: result.chunkCount,
      scope,
      addedBy: userId,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to add knowledge',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Delete knowledge document
router.delete('/:scope/:docId', async (req, res) => {
  try {
    const { scope, docId } = req.params;
    const { userId, workspaceId, projectId } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    await req.knowledgeManager.deleteDocument(
      docId,
      scope,
      workspaceId,
      projectId
    );

    res.json({
      message: 'Knowledge document deleted successfully',
      docId,
      scope,
      deletedBy: userId,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete knowledge document',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Bulk operations
router.post('/bulk/add', async (req, res) => {
  try {
    const { documents, scope = 'global', userId, workspaceId, projectId } = req.body;

    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        error: 'documents array is required',
        correlationId: req.correlationId,
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        correlationId: req.correlationId,
      });
    }

    const results = [];
    const errors = [];

    for (const [index, doc] of documents.entries()) {
      try {
        const result = await req.knowledgeManager.addDocument(
          doc.content,
          {
            ...doc.metadata,
            userId,
            workspaceId,
            projectId,
          },
          scope
        );
        results.push({ index, ...result });
      } catch (error) {
        errors.push({ index, error: error.message });
      }
    }

    res.json({
      message: 'Bulk knowledge addition completed',
      totalDocuments: documents.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
      scope,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Bulk knowledge addition failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Health check for knowledge base
router.get('/health', async (req, res) => {
  try {
    const health = await req.knowledgeManager.healthCheck();
    const statusCode = health.status === 'ok' ? 200 : 503;
    
    res.status(statusCode).json({
      service: 'knowledge-service',
      ...health,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(503).json({
      service: 'knowledge-service',
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;