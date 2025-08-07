// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/routes/documents.js
// ==========================================
import express from 'express';
import { MongoClient, Logger } from '@ux-flow/common';

const logger = new Logger('documents-route');

const router = express.Router();

// Get all documents
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search, 
      category, 
      scope, 
      workspaceId, 
      projectId,
      sortBy = 'addedAt',
      sortOrder = 'desc'
    } = req.query;

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    // Build query
    const query = { status: { $ne: 'deleted' } };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (scope) {
      query.scope = scope;
    }

    if (workspaceId) {
      query.workspaceId = workspaceId;
    }

    if (projectId) {
      query.projectId = projectId;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const [documents, totalCount] = await Promise.all([
      documentsCollection
        .find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      documentsCollection.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      documents: documents.map(doc => ({
        id: doc._id.toString(),
        documentId: doc.documentId,
        title: doc.title,
        description: doc.description,
        scope: doc.scope,
        workspaceId: doc.workspaceId,
        projectId: doc.projectId,
        category: doc.category,
        tags: doc.tags,
        contentLength: doc.contentLength,
        addedBy: doc.addedBy,
        addedAt: doc.addedAt,
        updatedAt: doc.updatedAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
      filters: {
        search,
        category,
        scope,
        workspaceId,
        projectId,
        sortBy,
        sortOrder,
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get documents',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get specific document
router.get('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    const document = await documentsCollection.findOne({
      documentId,
      status: { $ne: 'deleted' },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        documentId,
        correlationId: req.correlationId,
      });
    }

    res.json({
      document: {
        id: document._id.toString(),
        documentId: document.documentId,
        title: document.title,
        description: document.description,
        scope: document.scope,
        workspaceId: document.workspaceId,
        projectId: document.projectId,
        category: document.category,
        tags: document.tags,
        contentLength: document.contentLength,
        addedBy: document.addedBy,
        addedAt: document.addedAt,
        updatedAt: document.updatedAt,
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get document',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Upload and index document
router.post('/', async (req, res) => {
  try {
    const { 
      title, 
      content, 
      description = '', 
      category = 'general', 
      tags = [], 
      scope = 'workspace',
      workspaceId,
      projectId 
    } = req.body;

    const userId = req.headers['x-user-id'];

    if (!title || !content) {
      return res.status(400).json({
        error: 'Title and content are required',
        correlationId: req.correlationId,
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required',
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

    // Generate document ID
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add document to knowledge base
    const result = await req.knowledgeManager.addDocument(
      content,
      {
        title,
        description,
        category,
        tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
        documentId,
        userId,
        workspaceId,
        projectId,
      },
      scope
    );

    // Store document metadata in MongoDB
    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    await documentsCollection.insertOne({
      documentId,
      title,
      description,
      scope,
      workspaceId,
      projectId,
      addedBy: userId,
      addedAt: new Date(),
      updatedAt: new Date(),
      contentLength: content.length,
      tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
      category,
      status: 'active',
      chunkCount: result.chunkCount,
    });

    res.status(201).json({
      message: 'Document uploaded and indexed successfully',
      document: {
        documentId,
        title,
        description,
        scope,
        workspaceId,
        projectId,
        category,
        tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
        contentLength: content.length,
        chunkCount: result.chunkCount,
        addedBy: userId,
        addedAt: new Date(),
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to upload document',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Update document metadata
router.patch('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { title, description, category, tags } = req.body;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required',
        correlationId: req.correlationId,
      });
    }

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    // Check if document exists
    const document = await documentsCollection.findOne({
      documentId,
      status: { $ne: 'deleted' },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        documentId,
        correlationId: req.correlationId,
      });
    }

    // Build update object
    const updates = {
      updatedAt: new Date(),
      updatedBy: userId,
    };

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [tags].filter(Boolean);

    // Update document metadata
    await documentsCollection.updateOne(
      { documentId },
      { $set: updates }
    );

    res.json({
      message: 'Document metadata updated successfully',
      documentId,
      updates: Object.keys(updates).filter(key => key !== 'updatedAt' && key !== 'updatedBy'),
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to update document',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Delete document
router.delete('/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { workspaceId, projectId } = req.query;
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required',
        correlationId: req.correlationId,
      });
    }

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    // Check if document exists
    const document = await documentsCollection.findOne({
      documentId,
      status: { $ne: 'deleted' },
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        documentId,
        correlationId: req.correlationId,
      });
    }

    // Soft delete in MongoDB
    await documentsCollection.updateOne(
      { documentId },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date(),
          deletedBy: userId,
        },
      }
    );

    // Remove from knowledge base
    await req.knowledgeManager.deleteDocument(
      documentId,
      document.scope,
      workspaceId || document.workspaceId,
      projectId || document.projectId
    );

    res.json({
      message: 'Document deleted successfully',
      documentId,
      deletedBy: userId,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete document',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Search documents by content
router.post('/search', async (req, res) => {
  try {
    const { 
      query, 
      scope, 
      workspaceId, 
      projectId, 
      nResults = 10,
      category,
      tags 
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Search query is required',
        correlationId: req.correlationId,
      });
    }

    // Perform knowledge search
    const searchResults = await req.knowledgeManager.queryKnowledge(query, {
      workspaceId,
      projectId,
      nResults: parseInt(nResults),
      includeGlobal: scope !== 'project' && scope !== 'workspace',
    });

    // Get document metadata for results
    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    const documentIds = [...new Set(searchResults
      .map(result => result.metadata?.originalDocId)
      .filter(Boolean))];

    let documentMetadata = [];
    if (documentIds.length > 0) {
      documentMetadata = await documentsCollection
        .find({ 
          documentId: { $in: documentIds },
          status: { $ne: 'deleted' }
        })
        .toArray();
    }

    // Combine search results with metadata
    const enrichedResults = searchResults.map(result => {
      const metadata = documentMetadata.find(doc => 
        doc.documentId === result.metadata?.originalDocId
      );

      return {
        content: result.content,
        relevanceScore: result.relevanceScore,
        source: result.source,
        document: metadata ? {
          documentId: metadata.documentId,
          title: metadata.title,
          description: metadata.description,
          category: metadata.category,
          tags: metadata.tags,
          scope: metadata.scope,
          addedAt: metadata.addedAt,
        } : null,
      };
    });

    // Apply additional filters if specified
    let filteredResults = enrichedResults;

    if (category) {
      filteredResults = filteredResults.filter(result => 
        result.document?.category === category
      );
    }

    if (tags && tags.length > 0) {
      const filterTags = Array.isArray(tags) ? tags : [tags];
      filteredResults = filteredResults.filter(result => 
        result.document?.tags?.some(tag => filterTags.includes(tag))
      );
    }

    res.json({
      query,
      results: filteredResults.slice(0, parseInt(nResults)),
      resultCount: filteredResults.length,
      totalMatches: searchResults.length,
      filters: {
        scope,
        workspaceId,
        projectId,
        category,
        tags,
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Document search failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Get document categories and tags
router.get('/metadata/categories', async (req, res) => {
  try {
    const { workspaceId, projectId, scope } = req.query;

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    // Build query
    const query = { status: { $ne: 'deleted' } };
    if (workspaceId) query.workspaceId = workspaceId;
    if (projectId) query.projectId = projectId;
    if (scope) query.scope = scope;

    // Get unique categories and tags
    const [categories, tags] = await Promise.all([
      documentsCollection.distinct('category', query),
      documentsCollection.distinct('tags', query),
    ]);

    // Get category counts
    const categoryCounts = await documentsCollection.aggregate([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    // Get tag counts
    const tagCounts = await documentsCollection.aggregate([
      { $match: query },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }, // Top 50 tags
    ]).toArray();

    res.json({
      categories: categoryCounts.map(cat => ({
        name: cat._id,
        count: cat.count,
      })),
      tags: tagCounts.map(tag => ({
        name: tag._id,
        count: tag.count,
      })),
      totalCategories: categories.length,
      totalTags: tags.length,
      filters: {
        workspaceId,
        projectId,
        scope,
      },
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get document metadata',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

// Bulk document operations
router.post('/bulk', async (req, res) => {
  try {
    const { 
      operation, 
      documentIds, 
      updates,
      scope = 'workspace',
      workspaceId,
      projectId 
    } = req.body;

    const userId = req.headers['x-user-id'];

    if (!operation || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        error: 'Operation and documentIds array are required',
        correlationId: req.correlationId,
      });
    }

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required',
        correlationId: req.correlationId,
      });
    }

    const db = req.knowledgeManager.mongoClient.getDb();
    const documentsCollection = db.collection('knowledge_documents');

    let result = {};

    switch (operation) {
      case 'delete':
        // Soft delete documents
        const deleteResult = await documentsCollection.updateMany(
          { 
            documentId: { $in: documentIds },
            status: { $ne: 'deleted' }
          },
          {
            $set: {
              status: 'deleted',
              deletedAt: new Date(),
              deletedBy: userId,
            },
          }
        );

        // Remove from knowledge base
        for (const documentId of documentIds) {
          try {
            await req.knowledgeManager.deleteDocument(
              documentId,
              scope,
              workspaceId,
              projectId
            );
          } catch (error) {
            // Continue with other deletions even if one fails
            logger.warn('Failed to delete document from knowledge base', { documentType: 'knowledge_document' }, error);
          }
        }

        result = {
          operation: 'delete',
          processedCount: deleteResult.modifiedCount,
          documentIds,
        };
        break;

      case 'update':
        if (!updates) {
          return res.status(400).json({
            error: 'Updates object is required for update operation',
            correlationId: req.correlationId,
          });
        }

        const updateData = {
          ...updates,
          updatedAt: new Date(),
          updatedBy: userId,
        };

        const updateResult = await documentsCollection.updateMany(
          { 
            documentId: { $in: documentIds },
            status: { $ne: 'deleted' }
          },
          { $set: updateData }
        );

        result = {
          operation: 'update',
          processedCount: updateResult.modifiedCount,
          documentIds,
          updates: Object.keys(updates),
        };
        break;

      default:
        return res.status(400).json({
          error: `Unsupported bulk operation: ${operation}`,
          supportedOperations: ['delete', 'update'],
          correlationId: req.correlationId,
        });
    }

    res.json({
      message: `Bulk ${operation} operation completed`,
      ...result,
      processedBy: userId,
    });

  } catch (error) {
    res.status(500).json({
      error: 'Bulk operation failed',
      message: error.message,
      correlationId: req.correlationId,
    });
  }
});

export default router;