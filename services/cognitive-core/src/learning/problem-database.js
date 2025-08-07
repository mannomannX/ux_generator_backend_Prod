/**
 * Problem Database
 * 
 * Central storage system for all detected system weaknesses and prompt improvement suggestions.
 * Stores analysis results from the Analyst Agent and manages the approval workflow.
 * 
 * MongoDB Collection: prompt_suggestions
 */

class ProblemDatabase {
  constructor(logger, mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    
    // Collection names
    this.COLLECTION_NAME = 'prompt_suggestions';
    this.DATABASE_NAME = 'learning';
    
    // Status constants
    this.STATUS = {
      NEW: 'new',
      APPROVED: 'approved', 
      REJECTED: 'rejected',
      IMPLEMENTED: 'implemented'
    };
    
    // Statistics
    this.stats = {
      totalSuggestions: 0,
      newSuggestions: 0,
      approvedSuggestions: 0,
      rejectedSuggestions: 0,
      implementedSuggestions: 0
    };
  }

  /**
   * Initialize the problem database
   */
  async initialize() {
    try {
      await this.ensureCollection();
      await this.updateStatistics();
      
      this.logger.info('Problem database initialized', {
        collection: this.COLLECTION_NAME,
        database: this.DATABASE_NAME,
        totalSuggestions: this.stats.totalSuggestions
      });
    } catch (error) {
      this.logger.error('Failed to initialize problem database', error);
      throw error;
    }
  }

  /**
   * Store a new problem suggestion from analysis
   */
  async storeProblemSuggestion(analysisResult) {
    try {
      const collection = this.getCollection();
      
      const suggestion = {
        _id: this.generateSuggestionId(),
        
        // Core problem data
        sourceAgent: analysisResult.sourceAgent,
        detectedProblem: analysisResult.detectedProblem,
        confidence: analysisResult.confidence || 0.8,
        
        // Evidence from learning episode
        evidence: {
          episodeId: analysisResult.episodeId,
          originalPlan: analysisResult.evidence.originalPlan,
          userFeedback: analysisResult.evidence.userFeedback,
          successfulPlan: analysisResult.evidence.successfulPlan,
          classification: analysisResult.evidence.classification
        },
        
        // Status and workflow
        status: this.STATUS.NEW,
        priority: this.calculatePriority(analysisResult),
        
        // Generated prompt suggestion (will be filled by Prompt Optimizer)
        suggestedPrompt: null,
        
        // Timestamps
        createdAt: new Date(),
        reviewedAt: null,
        implementedAt: null,
        
        // Analysis metadata
        analysisMetadata: analysisResult.analysisMetadata,
        
        // Admin review data
        reviewData: {
          reviewedBy: null,
          reviewNotes: null,
          rejectionReason: null
        },
        
        // Implementation tracking
        implementationData: {
          implementedBy: null,
          implementationNotes: null,
          promptFilePath: null,
          oldPromptHash: null,
          newPromptHash: null
        }
      };

      const result = await collection.insertOne(suggestion);
      
      if (result.acknowledged) {
        this.stats.totalSuggestions++;
        this.stats.newSuggestions++;
        
        this.logger.info('Problem suggestion stored', {
          suggestionId: suggestion._id,
          sourceAgent: suggestion.sourceAgent,
          episodeId: analysisResult.episodeId,
          priority: suggestion.priority
        });
        
        return suggestion._id;
      } else {
        throw new Error('Failed to store suggestion in database');
      }
    } catch (error) {
      this.logger.error('Failed to store problem suggestion', error, {
        episodeId: analysisResult.episodeId
      });
      throw error;
    }
  }

  /**
   * Get suggestions by status for admin review
   */
  async getSuggestionsByStatus(status, limit = 50, offset = 0) {
    try {
      const collection = this.getCollection();
      
      const suggestions = await collection.find({ status })
        .sort({ createdAt: 1 }) // Oldest first
        .limit(limit)
        .skip(offset)
        .toArray();

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get suggestions by status', error, { status });
      return [];
    }
  }

  /**
   * Get all new suggestions for admin review
   */
  async getNewSuggestions(limit = 20) {
    return this.getSuggestionsByStatus(this.STATUS.NEW, limit);
  }

  /**
   * Get approved suggestions ready for prompt optimization
   */
  async getApprovedSuggestions(limit = 10) {
    try {
      const collection = this.getCollection();
      
      // Get approved suggestions that don't have a suggested prompt yet
      const suggestions = await collection.find({
        status: this.STATUS.APPROVED,
        suggestedPrompt: null
      })
        .sort({ reviewedAt: 1 }) // Oldest approvals first
        .limit(limit)
        .toArray();

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get approved suggestions', error);
      return [];
    }
  }

  /**
   * Get suggestions ready for implementation
   */
  async getSuggestionsForImplementation(limit = 10) {
    try {
      const collection = this.getCollection();
      
      // Get approved suggestions that have a suggested prompt but aren't implemented
      const suggestions = await collection.find({
        status: this.STATUS.APPROVED,
        suggestedPrompt: { $ne: null },
        'implementationData.implementedBy': null
      })
        .sort({ reviewedAt: 1 })
        .limit(limit)
        .toArray();

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get suggestions for implementation', error);
      return [];
    }
  }

  /**
   * Approve a suggestion
   */
  async approveSuggestion(suggestionId, adminId, reviewNotes = null) {
    try {
      const collection = this.getCollection();
      
      const result = await collection.updateOne(
        { _id: suggestionId, status: this.STATUS.NEW },
        {
          $set: {
            status: this.STATUS.APPROVED,
            reviewedAt: new Date(),
            'reviewData.reviewedBy': adminId,
            'reviewData.reviewNotes': reviewNotes
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.stats.newSuggestions--;
        this.stats.approvedSuggestions++;
        
        this.logger.info('Suggestion approved', {
          suggestionId,
          adminId,
          reviewNotes: reviewNotes?.substring(0, 50)
        });
        
        return true;
      } else {
        this.logger.warn('Failed to approve suggestion - not found or wrong status', {
          suggestionId
        });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to approve suggestion', error, { suggestionId });
      return false;
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(suggestionId, adminId, rejectionReason) {
    try {
      const collection = this.getCollection();
      
      const result = await collection.updateOne(
        { _id: suggestionId, status: this.STATUS.NEW },
        {
          $set: {
            status: this.STATUS.REJECTED,
            reviewedAt: new Date(),
            'reviewData.reviewedBy': adminId,
            'reviewData.rejectionReason': rejectionReason
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.stats.newSuggestions--;
        this.stats.rejectedSuggestions++;
        
        this.logger.info('Suggestion rejected', {
          suggestionId,
          adminId,
          reason: rejectionReason?.substring(0, 50)
        });
        
        return true;
      } else {
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to reject suggestion', error, { suggestionId });
      return false;
    }
  }

  /**
   * Store optimized prompt for a suggestion
   */
  async storeSuggestedPrompt(suggestionId, suggestedPrompt, optimizerMetadata = {}) {
    try {
      const collection = this.getCollection();
      
      const result = await collection.updateOne(
        { _id: suggestionId, status: this.STATUS.APPROVED },
        {
          $set: {
            suggestedPrompt,
            'analysisMetadata.optimizedAt': new Date(),
            'analysisMetadata.optimizerMetadata': optimizerMetadata
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.logger.info('Suggested prompt stored', {
          suggestionId,
          promptLength: suggestedPrompt?.length || 0
        });
        return true;
      } else {
        this.logger.warn('Failed to store suggested prompt - suggestion not found or wrong status', {
          suggestionId
        });
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to store suggested prompt', error, { suggestionId });
      return false;
    }
  }

  /**
   * Mark suggestion as implemented
   */
  async markAsImplemented(suggestionId, implementedBy, implementationData) {
    try {
      const collection = this.getCollection();
      
      const result = await collection.updateOne(
        { _id: suggestionId, status: this.STATUS.APPROVED },
        {
          $set: {
            status: this.STATUS.IMPLEMENTED,
            implementedAt: new Date(),
            'implementationData.implementedBy': implementedBy,
            'implementationData.implementationNotes': implementationData.notes,
            'implementationData.promptFilePath': implementationData.filePath,
            'implementationData.oldPromptHash': implementationData.oldPromptHash,
            'implementationData.newPromptHash': implementationData.newPromptHash
          }
        }
      );

      if (result.modifiedCount > 0) {
        this.stats.approvedSuggestions--;
        this.stats.implementedSuggestions++;
        
        this.logger.info('Suggestion marked as implemented', {
          suggestionId,
          implementedBy,
          filePath: implementationData.filePath
        });
        
        return true;
      } else {
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to mark suggestion as implemented', error, { suggestionId });
      return false;
    }
  }

  /**
   * Get suggestion details by ID
   */
  async getSuggestion(suggestionId) {
    try {
      const collection = this.getCollection();
      const suggestion = await collection.findOne({ _id: suggestionId });
      
      return suggestion;
    } catch (error) {
      this.logger.error('Failed to get suggestion', error, { suggestionId });
      return null;
    }
  }

  /**
   * Get suggestions for a specific agent
   */
  async getSuggestionsByAgent(agentName, status = null, limit = 20) {
    try {
      const collection = this.getCollection();
      
      const query = { sourceAgent: agentName };
      if (status) {
        query.status = status;
      }
      
      const suggestions = await collection.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get suggestions by agent', error, { agentName });
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics() {
    await this.updateStatistics();
    return { ...this.stats };
  }

  /**
   * Update internal statistics
   */
  async updateStatistics() {
    try {
      const collection = this.getCollection();
      
      const [total, newCount, approved, rejected, implemented] = await Promise.all([
        collection.countDocuments(),
        collection.countDocuments({ status: this.STATUS.NEW }),
        collection.countDocuments({ status: this.STATUS.APPROVED }),
        collection.countDocuments({ status: this.STATUS.REJECTED }),
        collection.countDocuments({ status: this.STATUS.IMPLEMENTED })
      ]);

      this.stats = {
        totalSuggestions: total,
        newSuggestions: newCount,
        approvedSuggestions: approved,
        rejectedSuggestions: rejected,
        implementedSuggestions: implemented
      };
    } catch (error) {
      this.logger.error('Failed to update statistics', error);
    }
  }

  /**
   * Search suggestions by problem description
   */
  async searchSuggestions(searchTerm, limit = 20) {
    try {
      const collection = this.getCollection();
      
      const suggestions = await collection.find({
        $or: [
          { detectedProblem: { $regex: searchTerm, $options: 'i' } },
          { sourceAgent: { $regex: searchTerm, $options: 'i' } },
          { 'evidence.userFeedback': { $regex: searchTerm, $options: 'i' } }
        ]
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to search suggestions', error, { searchTerm });
      return [];
    }
  }

  /**
   * Private helper methods
   */

  getCollection() {
    return this.mongoClient.db(this.DATABASE_NAME).collection(this.COLLECTION_NAME);
  }

  async ensureCollection() {
    try {
      const db = this.mongoClient.db(this.DATABASE_NAME);
      const collection = db.collection(this.COLLECTION_NAME);
      
      // Create indexes for efficient queries
      await Promise.all([
        collection.createIndex({ status: 1 }),
        collection.createIndex({ sourceAgent: 1 }),
        collection.createIndex({ createdAt: -1 }),
        collection.createIndex({ reviewedAt: 1 }),
        collection.createIndex({ priority: -1 }),
        collection.createIndex({ 'evidence.episodeId': 1 }),
        // Text index for search functionality
        collection.createIndex({
          detectedProblem: 'text',
          'evidence.userFeedback': 'text',
          sourceAgent: 'text'
        })
      ]);
      
      this.logger.debug('Problem database collection and indexes ensured');
    } catch (error) {
      this.logger.error('Failed to ensure collection', error);
      throw error;
    }
  }

  generateSuggestionId() {
    return `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  calculatePriority(analysisResult) {
    // Calculate priority based on confidence and problem severity
    const confidence = analysisResult.confidence || 0.8;
    const problemLength = analysisResult.detectedProblem?.length || 0;
    
    // Higher confidence and more detailed problems get higher priority
    let priority = Math.round(confidence * 10);
    
    if (problemLength > 100) priority += 1;
    if (problemLength > 200) priority += 1;
    
    // Certain agents might be more critical
    const criticalAgents = ['architect', 'planner', 'validator'];
    if (criticalAgents.includes(analysisResult.sourceAgent?.toLowerCase())) {
      priority += 1;
    }
    
    return Math.min(priority, 10); // Cap at 10
  }
}

module.exports = { ProblemDatabase };