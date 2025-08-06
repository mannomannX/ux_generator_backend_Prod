// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/services/knowledge-manager.js
// ==========================================
import { ChromaClient } from 'chromadb';
import fs from 'fs';
import path from 'path';

class KnowledgeManager {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.chromaClient = null;
    this.collections = new Map(); // Cache for ChromaDB collections
    this.isInitialized = false;
    
    // Collection naming strategy
    this.GLOBAL_COLLECTION = 'ux_global_knowledge';
    this.WORKSPACE_PREFIX = 'workspace_';
    this.PROJECT_PREFIX = 'project_';
  }

  async initialize() {
    try {
      // Initialize ChromaDB client
      this.chromaClient = new ChromaClient({
        path: process.env.CHROMADB_URL || 'http://localhost:8000',
        fetchOptions: {
          timeout: 30000,
        },
      });

      // Test connection
      await this.chromaClient.heartbeat();
      this.logger.info('ChromaDB connection established');

      // Initialize global knowledge collection
      await this.initializeGlobalKnowledge();

      this.isInitialized = true;
      this.logger.info('Knowledge Manager initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Knowledge Manager', error);
      throw error;
    }
  }

  async initializeGlobalKnowledge() {
    try {
      // Get or create global knowledge collection
      const collection = await this.chromaClient.getOrCreateCollection({
        name: this.GLOBAL_COLLECTION,
        metadata: { type: 'global_ux_knowledge' },
      });

      this.collections.set(this.GLOBAL_COLLECTION, collection);

      // Index global UX principles if not already done
      await this.indexGlobalPrinciples(collection);

    } catch (error) {
      this.logger.error('Failed to initialize global knowledge', error);
      throw error;
    }
  }

  async indexGlobalPrinciples(collection) {
    try {
      // Check if already indexed
      const existingDocs = await collection.get({ limit: 1 });
      if (existingDocs.ids.length > 0) {
        this.logger.info('Global UX principles already indexed');
        return;
      }

      // Load UX principles from files
      const principlesDir = path.join(process.cwd(), 'src', 'knowledge_base', 'ux_principles');
      
      if (!fs.existsSync(principlesDir)) {
        this.logger.warn('UX principles directory not found, creating sample principles');
        await this.createSamplePrinciples(collection);
        return;
      }

      const files = fs.readdirSync(principlesDir);
      const documents = [];
      const ids = [];
      const metadatas = [];

      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.txt')) {
          const filePath = path.join(principlesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Split into chunks for better retrieval
          const chunks = this.chunkText(content, 500);
          
          chunks.forEach((chunk, index) => {
            const docId = `global_${file}_chunk_${index}`;
            documents.push(chunk);
            ids.push(docId);
            metadatas.push({
              source: 'global_principle',
              filename: file,
              chunkIndex: index,
              category: this.extractCategory(file),
            });
          });
        }
      }

      if (documents.length > 0) {
        await collection.add({
          ids,
          documents,
          metadatas,
        });

        this.logger.info('Global UX principles indexed', {
          fileCount: files.length,
          chunkCount: documents.length,
        });
      }

    } catch (error) {
      this.logger.error('Failed to index global principles', error);
      throw error;
    }
  }

  async createSamplePrinciples(collection) {
    const samplePrinciples = [
      {
        id: 'global_usability_heuristics',
        content: `Nielsen's Usability Heuristics:
1. Visibility of system status - Users should always know what's happening
2. Match between system and real world - Use familiar language and concepts
3. User control and freedom - Provide clear exits and undo functionality
4. Consistency and standards - Follow platform conventions
5. Error prevention - Design to prevent problems before they occur`,
        metadata: { source: 'global_principle', category: 'usability', type: 'heuristics' },
      },
      {
        id: 'global_accessibility_guidelines',
        content: `Web Accessibility Guidelines (WCAG):
- Perceivable: Information must be presentable in ways users can perceive
- Operable: Interface components must be operable by all users
- Understandable: Information and UI operation must be understandable
- Robust: Content must be robust enough for various assistive technologies`,
        metadata: { source: 'global_principle', category: 'accessibility', type: 'guidelines' },
      },
      {
        id: 'global_ui_patterns',
        content: `Common UI Patterns:
- Navigation: Tabs, breadcrumbs, mega menus, hamburger menus
- Forms: Progressive disclosure, inline validation, smart defaults
- Feedback: Loading indicators, success/error messages, progress bars
- Layout: Card layouts, list views, grid systems, responsive design`,
        metadata: { source: 'global_principle', category: 'ui_patterns', type: 'patterns' },
      },
    ];

    const ids = samplePrinciples.map(p => p.id);
    const documents = samplePrinciples.map(p => p.content);
    const metadatas = samplePrinciples.map(p => p.metadata);

    await collection.add({ ids, documents, metadatas });
    
    this.logger.info('Sample UX principles created', { count: samplePrinciples.length });
  }

  async queryKnowledge(query, options = {}) {
    try {
      const {
        userId,
        workspaceId,
        projectId,
        nResults = 5,
        includeGlobal = true,
      } = options;

      let allResults = [];

      // Query global knowledge if enabled
      if (includeGlobal) {
        const globalResults = await this.queryCollection(
          this.GLOBAL_COLLECTION,
          query,
          Math.ceil(nResults * 0.6) // 60% from global
        );
        allResults.push(...globalResults);
      }

      // Query workspace knowledge
      if (workspaceId) {
        const workspaceResults = await this.queryWorkspaceKnowledge(
          workspaceId,
          query,
          Math.ceil(nResults * 0.3) // 30% from workspace
        );
        allResults.push(...workspaceResults);
      }

      // Query project-specific knowledge
      if (projectId) {
        const projectResults = await this.queryProjectKnowledge(
          projectId,
          query,
          Math.ceil(nResults * 0.1) // 10% from project
        );
        allResults.push(...projectResults);
      }

      // Sort by relevance and limit results
      allResults.sort((a, b) => b.distance - a.distance);
      const topResults = allResults.slice(0, nResults);

      // Format for consumption
      const formattedResults = topResults.map(result => ({
        content: result.document,
        metadata: result.metadata,
        relevanceScore: result.distance,
        source: result.metadata?.source || 'unknown',
      }));

      this.logger.debug('Knowledge query completed', {
        query: query.substring(0, 50),
        resultCount: formattedResults.length,
        sources: [...new Set(formattedResults.map(r => r.source))],
      });

      return formattedResults;

    } catch (error) {
      this.logger.error('Knowledge query failed', error, { query, options });
      throw error;
    }
  }

  async queryCollection(collectionName, query, nResults) {
    try {
      const collection = await this.getCollection(collectionName);
      if (!collection) return [];

      const results = await collection.query({
        queryTexts: [query],
        nResults,
        include: ['documents', 'metadatas', 'distances'],
      });

      if (!results.documents || !results.documents[0]) return [];

      return results.documents[0].map((doc, index) => ({
        document: doc,
        metadata: results.metadatas?.[0]?.[index] || {},
        distance: results.distances?.[0]?.[index] || 0,
      }));

    } catch (error) {
      this.logger.warn('Failed to query collection', error, { collectionName });
      return [];
    }
  }

  async queryWorkspaceKnowledge(workspaceId, query, nResults) {
    const collectionName = `${this.WORKSPACE_PREFIX}${workspaceId}`;
    return await this.queryCollection(collectionName, query, nResults);
  }

  async queryProjectKnowledge(projectId, query, nResults) {
    const collectionName = `${this.PROJECT_PREFIX}${projectId}`;
    return await this.queryCollection(collectionName, query, nResults);
  }

  async addDocument(content, metadata, scope = 'global') {
    try {
      const { workspaceId, projectId, userId } = metadata;
      
      let collectionName;
      if (scope === 'workspace' && workspaceId) {
        collectionName = `${this.WORKSPACE_PREFIX}${workspaceId}`;
      } else if (scope === 'project' && projectId) {
        collectionName = `${this.PROJECT_PREFIX}${projectId}`;
      } else {
        collectionName = this.GLOBAL_COLLECTION;
      }

      const collection = await this.getOrCreateCollection(collectionName, scope);
      
      // Generate unique ID
      const docId = `${scope}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Chunk large documents
      const chunks = this.chunkText(content, 500);
      
      const ids = [];
      const documents = [];
      const metadatas = [];

      chunks.forEach((chunk, index) => {
        ids.push(`${docId}_chunk_${index}`);
        documents.push(chunk);
        metadatas.push({
          ...metadata,
          originalDocId: docId,
          chunkIndex: index,
          totalChunks: chunks.length,
          addedAt: new Date().toISOString(),
          addedBy: userId,
        });
      });

      await collection.add({ ids, documents, metadatas });

      this.logger.info('Document added to knowledge base', {
        docId,
        scope,
        collectionName,
        chunkCount: chunks.length,
        addedBy: userId,
      });

      return { docId, chunkCount: chunks.length };

    } catch (error) {
      this.logger.error('Failed to add document', error, { scope, metadata });
      throw error;
    }
  }

  async deleteDocument(docId, scope = 'global', workspaceId = null, projectId = null) {
    try {
      let collectionName;
      if (scope === 'workspace' && workspaceId) {
        collectionName = `${this.WORKSPACE_PREFIX}${workspaceId}`;
      } else if (scope === 'project' && projectId) {
        collectionName = `${this.PROJECT_PREFIX}${projectId}`;
      } else {
        collectionName = this.GLOBAL_COLLECTION;
      }

      const collection = await this.getCollection(collectionName);
      if (!collection) {
        this.logger.warn('Collection not found for document deletion', { collectionName, docId });
        return;
      }

      // Find all chunks for this document
      const existing = await collection.get({
        where: { originalDocId: docId },
        include: ['metadatas'],
      });

      if (existing.ids.length > 0) {
        await collection.delete({ ids: existing.ids });
        
        this.logger.info('Document deleted from knowledge base', {
          docId,
          scope,
          collectionName,
          deletedChunks: existing.ids.length,
        });
      }

    } catch (error) {
      this.logger.error('Failed to delete document', error, { docId, scope });
      throw error;
    }
  }

  async getOrCreateCollection(collectionName, scope) {
    if (this.collections.has(collectionName)) {
      return this.collections.get(collectionName);
    }

    const collection = await this.chromaClient.getOrCreateCollection({
      name: collectionName,
      metadata: { 
        scope,
        createdAt: new Date().toISOString(),
      },
    });

    this.collections.set(collectionName, collection);
    return collection;
  }

  async getCollection(collectionName) {
    if (this.collections.has(collectionName)) {
      return this.collections.get(collectionName);
    }

    try {
      const collection = await this.chromaClient.getCollection({ name: collectionName });
      this.collections.set(collectionName, collection);
      return collection;
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  // Utility methods
  chunkText(text, maxChunkSize = 500) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  extractCategory(filename) {
    const name = filename.toLowerCase();
    if (name.includes('usability') || name.includes('heuristic')) return 'usability';
    if (name.includes('accessibility') || name.includes('a11y')) return 'accessibility';
    if (name.includes('pattern') || name.includes('component')) return 'ui_patterns';
    if (name.includes('principle') || name.includes('guideline')) return 'principles';
    return 'general';
  }

  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'error', message: 'Not initialized' };
      }

      await this.chromaClient.heartbeat();
      
      const globalCollection = this.collections.get(this.GLOBAL_COLLECTION);
      const globalCount = globalCollection ? (await globalCollection.count()) : 0;

      return {
        status: 'ok',
        chromaDbConnected: true,
        collectionsLoaded: this.collections.size,
        globalDocuments: globalCount,
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        chromaDbConnected: false,
      };
    }
  }

  async getStats() {
    try {
      const stats = {
        totalCollections: this.collections.size,
        collectionDetails: {},
      };

      for (const [name, collection] of this.collections) {
        try {
          const count = await collection.count();
          stats.collectionDetails[name] = { documentCount: count };
        } catch (error) {
          stats.collectionDetails[name] = { error: error.message };
        }
      }

      return stats;

    } catch (error) {
      this.logger.error('Failed to get knowledge stats', error);
      throw error;
    }
  }
}

export { KnowledgeManager };