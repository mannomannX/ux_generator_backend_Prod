// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/events/event-handlers.js
// ==========================================
import { EventTypes } from '@ux-flow/common';

class EventHandlers {
  constructor(logger, eventEmitter, knowledgeManager) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.knowledgeManager = knowledgeManager;
  }

  setupAllHandlers() {
    // Knowledge query requests from Cognitive Core
    this.eventEmitter.on(EventTypes.KNOWLEDGE_QUERY_REQUESTED, 
      this.handleKnowledgeQuery.bind(this)
    );

    // Knowledge indexing requests
    this.eventEmitter.on('KNOWLEDGE_INDEX_REQUESTED',
      this.handleKnowledgeIndexing.bind(this)
    );

    // Document management events
    this.eventEmitter.on('DOCUMENT_ADDED',
      this.handleDocumentAdded.bind(this)
    );

    this.eventEmitter.on('DOCUMENT_DELETED',
      this.handleDocumentDeleted.bind(this)
    );

    // Project/Workspace events for knowledge isolation
    this.eventEmitter.on('PROJECT_CREATED',
      this.handleProjectCreated.bind(this)
    );

    this.eventEmitter.on('WORKSPACE_CREATED',
      this.handleWorkspaceCreated.bind(this)
    );

    this.logger.info('Knowledge Service event handlers setup completed');
  }

  async handleKnowledgeQuery(data) {
    try {
      const { 
        query, 
        userId, 
        workspaceId, 
        projectId, 
        nResults = 5,
        includeGlobal = true,
        context = '',
        correlationId 
      } = data;

      this.logger.info('Processing knowledge query', {
        query: query.substring(0, 50) + '...',
        userId,
        workspaceId,
        projectId,
        nResults,
        correlationId,
      });

      // Execute knowledge search
      const results = await this.knowledgeManager.queryKnowledge(query, {
        userId,
        workspaceId,
        projectId,
        nResults,
        includeGlobal,
      });

      // Format results for Cognitive Core consumption
      const knowledgeContext = this.formatKnowledgeContext(results, query);

      // Emit response back to Cognitive Core
      this.eventEmitter.emit(EventTypes.KNOWLEDGE_RESPONSE_READY, {
        query,
        userId,
        workspaceId,
        projectId,
        knowledgeContext,
        resultCount: results.length,
        sources: [...new Set(results.map(r => r.source))],
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('Knowledge query completed', {
        query: query.substring(0, 30),
        resultCount: results.length,
        userId,
        correlationId,
      });

    } catch (error) {
      this.logger.error('Failed to handle knowledge query', error, {
        query: data.query?.substring(0, 50),
        userId: data.userId,
        correlationId: data.correlationId,
      });

      // Emit error response
      this.eventEmitter.emit(EventTypes.KNOWLEDGE_RESPONSE_READY, {
        query: data.query,
        userId: data.userId,
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        knowledgeContext: 'Knowledge retrieval failed. Proceeding without additional context.',
        resultCount: 0,
        sources: [],
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleKnowledgeIndexing(data) {
    try {
      const { 
        content, 
        metadata, 
        scope = 'global',
        userId,
        workspaceId,
        projectId,
        correlationId 
      } = data;

      this.logger.info('Processing knowledge indexing request', {
        scope,
        contentLength: content.length,
        userId,
        workspaceId,
        projectId,
        correlationId,
      });

      // Add document to knowledge base
      const result = await this.knowledgeManager.addDocument(
        content,
        {
          ...metadata,
          userId,
          workspaceId,
          projectId,
        },
        scope
      );

      // Emit success event
      this.eventEmitter.emit('KNOWLEDGE_INDEXED', {
        docId: result.docId,
        scope,
        chunkCount: result.chunkCount,
        userId,
        workspaceId,
        projectId,
        timestamp: new Date().toISOString(),
        correlationId,
      });

      this.logger.info('Knowledge indexing completed', {
        docId: result.docId,
        scope,
        chunkCount: result.chunkCount,
        userId,
      });

    } catch (error) {
      this.logger.error('Failed to handle knowledge indexing', error, {
        scope: data.scope,
        userId: data.userId,
        correlationId: data.correlationId,
      });

      // Emit error event
      this.eventEmitter.emit('KNOWLEDGE_INDEX_FAILED', {
        scope: data.scope,
        userId: data.userId,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleDocumentAdded(data) {
    try {
      const { documentId, content, metadata, scope, userId } = data;

      this.logger.info('Processing document addition', {
        documentId,
        scope,
        contentLength: content.length,
        userId,
      });

      // Index the document
      await this.knowledgeManager.addDocument(content, metadata, scope);

      // Store document metadata in MongoDB for management
      const db = this.knowledgeManager.mongoClient.getDb();
      const documentsCollection = db.collection('knowledge_documents');

      await documentsCollection.insertOne({
        documentId,
        title: metadata.title || 'Untitled Document',
        description: metadata.description || '',
        scope,
        workspaceId: metadata.workspaceId,
        projectId: metadata.projectId,
        addedBy: userId,
        addedAt: new Date(),
        contentLength: content.length,
        tags: metadata.tags || [],
        category: metadata.category || 'general',
      });

      this.logger.info('Document added and indexed', {
        documentId,
        scope,
        userId,
      });

    } catch (error) {
      this.logger.error('Failed to handle document addition', error, {
        documentId: data.documentId,
        userId: data.userId,
      });
    }
  }

  async handleDocumentDeleted(data) {
    try {
      const { documentId, scope, workspaceId, projectId, userId } = data;

      this.logger.info('Processing document deletion', {
        documentId,
        scope,
        workspaceId,
        projectId,
        userId,
      });

      // Remove from knowledge base
      await this.knowledgeManager.deleteDocument(
        documentId,
        scope,
        workspaceId,
        projectId
      );

      // Remove from MongoDB
      const db = this.knowledgeManager.mongoClient.getDb();
      const documentsCollection = db.collection('knowledge_documents');

      await documentsCollection.updateOne(
        { documentId },
        {
          $set: {
            deletedAt: new Date(),
            deletedBy: userId,
            status: 'deleted',
          },
        }
      );

      this.logger.info('Document deleted and removed from index', {
        documentId,
        scope,
        userId,
      });

    } catch (error) {
      this.logger.error('Failed to handle document deletion', error, {
        documentId: data.documentId,
        userId: data.userId,
      });
    }
  }

  async handleProjectCreated(data) {
    try {
      const { projectId, workspaceId, userId, projectName } = data;

      this.logger.info('Setting up knowledge space for new project', {
        projectId,
        workspaceId,
        userId,
        projectName,
      });

      // Pre-create project knowledge collection if needed
      // This ensures isolation and performance
      const collectionName = `project_${projectId}`;
      await this.knowledgeManager.getOrCreateCollection(collectionName, 'project');

      // Add initial project-specific knowledge if available
      const initialKnowledge = `Project: ${projectName}
Created by: ${userId}
Workspace: ${workspaceId}
This is a UX flow design project. Focus on user experience best practices and design patterns relevant to this project.`;

      await this.knowledgeManager.addDocument(
        initialKnowledge,
        {
          title: 'Project Information',
          category: 'project_meta',
          projectId,
          workspaceId,
          userId,
        },
        'project'
      );

      this.logger.info('Project knowledge space initialized', {
        projectId,
        collectionName,
      });

    } catch (error) {
      this.logger.error('Failed to setup project knowledge space', error, {
        projectId: data.projectId,
        userId: data.userId,
      });
    }
  }

  async handleWorkspaceCreated(data) {
    try {
      const { workspaceId, userId, workspaceName, settings } = data;

      this.logger.info('Setting up knowledge space for new workspace', {
        workspaceId,
        userId,
        workspaceName,
      });

      // Pre-create workspace knowledge collection
      const collectionName = `workspace_${workspaceId}`;
      await this.knowledgeManager.getOrCreateCollection(collectionName, 'workspace');

      // Add initial workspace-specific knowledge
      const initialKnowledge = `Workspace: ${workspaceName}
Created by: ${userId}
This workspace contains UX flow design projects. Team members can share design patterns, components, and best practices specific to this organization.`;

      await this.knowledgeManager.addDocument(
        initialKnowledge,
        {
          title: 'Workspace Information',
          category: 'workspace_meta',
          workspaceId,
          userId,
        },
        'workspace'
      );

      this.logger.info('Workspace knowledge space initialized', {
        workspaceId,
        collectionName,
      });

    } catch (error) {
      this.logger.error('Failed to setup workspace knowledge space', error, {
        workspaceId: data.workspaceId,
        userId: data.userId,
      });
    }
  }

  // Helper method to format knowledge context for AI consumption
  formatKnowledgeContext(results, originalQuery) {
    if (!results || results.length === 0) {
      return 'No relevant knowledge found for this query. Proceed with general UX best practices.';
    }

    let context = `--- RELEVANT UX KNOWLEDGE (Query: ${originalQuery}) ---\n\n`;

    // Group results by source
    const groupedResults = {};
    results.forEach(result => {
      const source = result.source || 'unknown';
      if (!groupedResults[source]) {
        groupedResults[source] = [];
      }
      groupedResults[source].push(result);
    });

    // Format each source section
    Object.entries(groupedResults).forEach(([source, sourceResults]) => {
      context += `## ${source.toUpperCase()} KNOWLEDGE:\n`;
      
      sourceResults.forEach((result, index) => {
        const relevanceIndicator = result.relevanceScore > 0.8 ? '[HIGH RELEVANCE] ' : 
                                  result.relevanceScore > 0.6 ? '[MEDIUM RELEVANCE] ' : '[LOW RELEVANCE] ';
        
        context += `${index + 1}. ${relevanceIndicator}${result.content}\n\n`;
      });
    });

    context += '--- END KNOWLEDGE CONTEXT ---\n';
    
    return context;
  }
}

export { EventHandlers };