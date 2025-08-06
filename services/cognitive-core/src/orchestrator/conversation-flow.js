// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/conversation-flow.js
// ==========================================

import { EventTypes } from '@ux-flow/common';

/**
 * ConversationFlow manages the conversational state and flow between agents
 * Handles context management, conversation history, and flow state transitions
 */
class ConversationFlow {
  constructor(logger, eventEmitter, mongoClient, redisClient) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    
    // In-memory conversation state cache
    this.activeConversations = new Map();
    
    // Conversation flow states
    this.FLOW_STATES = {
      IDLE: 'idle',
      PROCESSING: 'processing', 
      WAITING_FOR_APPROVAL: 'waiting_for_approval',
      WAITING_FOR_CLARIFICATION: 'waiting_for_clarification',
      EXECUTING: 'executing',
      ERROR: 'error'
    };
  }

  /**
   * Initialize a new conversation flow
   */
  async initializeConversation(userId, projectId, sessionId) {
    const conversationId = `${userId}-${projectId}`;
    
    const conversationState = {
      conversationId,
      userId,
      projectId,
      sessionId,
      state: this.FLOW_STATES.IDLE,
      currentFlow: null,
      conversationHistory: [],
      context: {
        shortTerm: [],
        midTerm: [],
        longTerm: {},
        knowledgeContext: null
      },
      lastActivity: new Date(),
      createdAt: new Date()
    };

    // Store in cache and Redis
    this.activeConversations.set(conversationId, conversationState);
    await this.redisClient.set(
      `conversation:${conversationId}`, 
      conversationState, 
      3600 // 1 hour TTL
    );

    this.logger.info('Conversation initialized', {
      conversationId,
      userId,
      projectId,
      sessionId
    });

    return conversationState;
  }

  /**
   * Get conversation state with context enrichment
   */
  async getConversationState(userId, projectId) {
    const conversationId = `${userId}-${projectId}`;
    
    // Try cache first
    let conversation = this.activeConversations.get(conversationId);
    
    // Fallback to Redis
    if (!conversation) {
      conversation = await this.redisClient.get(`conversation:${conversationId}`);
      if (conversation) {
        this.activeConversations.set(conversationId, conversation);
      }
    }
    
    // Fallback to MongoDB
    if (!conversation) {
      conversation = await this.mongoClient.findDocument('conversations', {
        conversationId
      });
      
      if (conversation) {
        // Rebuild in-memory state
        this.activeConversations.set(conversationId, conversation);
        await this.redisClient.set(`conversation:${conversationId}`, conversation, 3600);
      }
    }

    // Initialize if not found
    if (!conversation) {
      conversation = await this.initializeConversation(userId, projectId, 'new-session');
    }

    return conversation;
  }

  /**
   * Update conversation state
   */
  async updateConversationState(conversationId, updates) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      this.logger.warn('Attempting to update non-existent conversation', {
        conversationId
      });
      return null;
    }

    // Apply updates
    const updatedConversation = {
      ...conversation,
      ...updates,
      lastActivity: new Date()
    };

    // Update cache
    this.activeConversations.set(conversationId, updatedConversation);
    
    // Update Redis
    await this.redisClient.set(
      `conversation:${conversationId}`, 
      updatedConversation, 
      3600
    );

    // Persist to MongoDB periodically or on important state changes
    if (this.shouldPersistToDatabase(updates)) {
      await this.persistConversationToDatabase(updatedConversation);
    }

    this.logger.debug('Conversation state updated', {
      conversationId,
      newState: updatedConversation.state,
      historyLength: updatedConversation.conversationHistory?.length || 0
    });

    return updatedConversation;
  }

  /**
   * Add message to conversation history
   */
  async addMessageToHistory(conversationId, message, role = 'user') {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const messageEntry = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      role, // 'user', 'assistant', 'system'
      content: message,
      timestamp: new Date(),
      metadata: {}
    };

    conversation.conversationHistory.push(messageEntry);
    
    // Maintain history size limit (last 50 messages)
    if (conversation.conversationHistory.length > 50) {
      conversation.conversationHistory = conversation.conversationHistory.slice(-50);
    }

    // Update context based on new message
    await this.updateContextFromMessage(conversation, messageEntry);
    
    await this.updateConversationState(conversationId, {
      conversationHistory: conversation.conversationHistory
    });

    return messageEntry;
  }

  /**
   * Build hierarchical context for agents
   */
  buildContextForAgents(conversation) {
    const context = conversation.context;
    
    // Build hierarchical memory structure
    const hierarchicalContext = this.buildHierarchicalContext(context);
    
    return {
      fullContext: hierarchicalContext,
      conversationId: conversation.conversationId,
      currentFlow: conversation.currentFlow,
      knowledgeContext: context.knowledgeContext,
      lastMessages: conversation.conversationHistory.slice(-10),
      conversationState: conversation.state
    };
  }

  /**
   * Build hierarchical context string for AI agents
   */
  buildHierarchicalContext(context) {
    let hierarchicalContext = '';
    
    // Long-term facts
    hierarchicalContext += '--- Langzeit-Fakten ---\n';
    if (Object.keys(context.longTerm).length > 0) {
      for (const [key, value] of Object.entries(context.longTerm)) {
        hierarchicalContext += `${key}: ${value}\n`;
      }
    } else {
      hierarchicalContext += 'Keine langfristigen Fakten verfügbar\n';
    }
    
    // Mid-term episodes
    hierarchicalContext += '\n--- Mittelfristige Zusammenfassung ---\n';
    if (context.midTerm.length > 0) {
      hierarchicalContext += context.midTerm.join('\n');
    } else {
      hierarchicalContext += 'Keine mittelfristigen Informationen verfügbar\n';
    }
    
    // Short-term memory
    hierarchicalContext += '\n--- Kurzzeitgedächtnis (letzte 5 Nachrichten) ---\n';
    if (context.shortTerm.length > 0) {
      hierarchicalContext += context.shortTerm.join('\n');
    } else {
      hierarchicalContext += 'Keine aktuellen Nachrichten im Kurzzeitgedächtnis\n';
    }
    
    return hierarchicalContext;
  }

  /**
   * Transition conversation state
   */
  async transitionState(conversationId, newState, metadata = {}) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const oldState = conversation.state;
    
    // Validate state transition
    if (!this.isValidStateTransition(oldState, newState)) {
      this.logger.warn('Invalid state transition attempted', {
        conversationId,
        from: oldState,
        to: newState
      });
      return false;
    }

    await this.updateConversationState(conversationId, {
      state: newState,
      stateTransition: {
        from: oldState,
        to: newState,
        timestamp: new Date(),
        metadata
      }
    });

    this.logger.info('Conversation state transition', {
      conversationId,
      from: oldState,
      to: newState,
      metadata
    });

    // Emit state change event
    this.eventEmitter.emit(EventTypes.CONVERSATION_STATE_CHANGED, {
      conversationId,
      userId: conversation.userId,
      projectId: conversation.projectId,
      oldState,
      newState,
      metadata
    });

    return true;
  }

  /**
   * Handle plan approval workflow
   */
  async handlePlanApproval(conversationId, approved, plan, feedback = null) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (approved) {
      await this.transitionState(conversationId, this.FLOW_STATES.EXECUTING, {
        plan,
        approvedAt: new Date()
      });
      
      // Add approval to context
      await this.addMessageToHistory(conversationId, 'Plan approved', 'system');
      
    } else {
      await this.transitionState(conversationId, this.FLOW_STATES.IDLE, {
        rejectedPlan: plan,
        feedback,
        rejectedAt: new Date()
      });
      
      // Add rejection with feedback to context
      const rejectionMessage = feedback ? 
        `Plan rejected: ${feedback}` : 
        'Plan rejected without feedback';
      await this.addMessageToHistory(conversationId, rejectionMessage, 'system');
    }

    return conversation;
  }

  /**
   * Clean up inactive conversations
   */
  async cleanupInactiveConversations() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    let cleanedCount = 0;

    for (const [conversationId, conversation] of this.activeConversations.entries()) {
      if (conversation.lastActivity < cutoff) {
        // Persist to database before cleanup
        await this.persistConversationToDatabase(conversation);
        
        // Remove from cache
        this.activeConversations.delete(conversationId);
        await this.redisClient.del(`conversation:${conversationId}`);
        
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up inactive conversations', {
        count: cleanedCount,
        remaining: this.activeConversations.size
      });
    }
  }

  /**
   * Private helper methods
   */

  updateContextFromMessage(conversation, messageEntry) {
    const context = conversation.context;
    
    // Add to short-term memory
    const shortTermEntry = `${messageEntry.role}: ${messageEntry.content}`;
    context.shortTerm.push(shortTermEntry);
    
    // Maintain short-term memory size
    if (context.shortTerm.length > 5) {
      // Move older entries to mid-term
      const oldEntries = context.shortTerm.splice(0, context.shortTerm.length - 5);
      context.midTerm.push(oldEntries.join('\n'));
    }
    
    // Maintain mid-term memory size
    if (context.midTerm.length > 10) {
      context.midTerm = context.midTerm.slice(-10);
    }
    
    // Extract long-term facts (entities, preferences, etc.)
    this.  extractLongTermFacts(messageEntry, context.longTerm);
  }

  extractLongTermFacts(messageEntry, longTermFacts) {
    // Simple pattern matching for extracting long-term facts
    const content = messageEntry.content.toLowerCase();
    
    // Extract preferences
    if (content.includes('ich bevorzuge') || content.includes('ich mag')) {
      const preference = messageEntry.content.match(/(?:bevorzuge|mag)\s+([^.!?]+)/i);
      if (preference) {
        longTermFacts.preferences = longTermFacts.preferences || [];
        longTermFacts.preferences.push(preference[1]);
      }
    }
    
    // Extract entities (screens, components mentioned)
    const entities = content.match(/(?:screen|button|form|component|element|seite|formular|schaltfläche)\w*/gi);
    if (entities) {
      longTermFacts.entities = longTermFacts.entities || {};
      entities.forEach(entity => {
        longTermFacts.entities[entity] = (longTermFacts.entities[entity] || 0) + 1;
      });
    }
    
    // Extract project context
    if (content.includes('projekt') || content.includes('app') || content.includes('website')) {
      const projectContext = messageEntry.content.match(/(?:projekt|app|website)\s+([^.!?]+)/i);
      if (projectContext) {
        longTermFacts.projectContext = projectContext[1];
      }
    }
  }

  isValidStateTransition(fromState, toState) {
    const validTransitions = {
      [this.FLOW_STATES.IDLE]: [
        this.FLOW_STATES.PROCESSING,
        this.FLOW_STATES.ERROR
      ],
      [this.FLOW_STATES.PROCESSING]: [
        this.FLOW_STATES.WAITING_FOR_APPROVAL,
        this.FLOW_STATES.WAITING_FOR_CLARIFICATION,
        this.FLOW_STATES.IDLE,
        this.FLOW_STATES.ERROR
      ],
      [this.FLOW_STATES.WAITING_FOR_APPROVAL]: [
        this.FLOW_STATES.EXECUTING,
        this.FLOW_STATES.IDLE,
        this.FLOW_STATES.ERROR
      ],
      [this.FLOW_STATES.WAITING_FOR_CLARIFICATION]: [
        this.FLOW_STATES.PROCESSING,
        this.FLOW_STATES.IDLE,
        this.FLOW_STATES.ERROR
      ],
      [this.FLOW_STATES.EXECUTING]: [
        this.FLOW_STATES.IDLE,
        this.FLOW_STATES.ERROR
      ],
      [this.FLOW_STATES.ERROR]: [
        this.FLOW_STATES.IDLE,
        this.FLOW_STATES.PROCESSING
      ]
    };

    return validTransitions[fromState]?.includes(toState) || false;
  }

  shouldPersistToDatabase(updates) {
    // Persist on state changes, plan approvals, or every 10 messages
    return !!(
      updates.state ||
      updates.stateTransition ||
      (updates.conversationHistory && updates.conversationHistory.length % 10 === 0)
    );
  }

  async persistConversationToDatabase(conversation) {
    try {
      await this.mongoClient.updateDocument(
        'conversations',
        { conversationId: conversation.conversationId },
        { $set: conversation },
        { upsert: true }
      );
      
      this.logger.debug('Conversation persisted to database', {
        conversationId: conversation.conversationId
      });
    } catch (error) {
      this.logger.error('Failed to persist conversation to database', error, {
        conversationId: conversation.conversationId
      });
    }
  }

  /**
   * Get conversation statistics
   */
  getConversationStats() {
    const stats = {
      activeConversations: this.activeConversations.size,
      stateDistribution: {},
      totalMessages: 0,
      averageSessionLength: 0
    };

    let totalSessionTime = 0;
    const now = new Date();

    for (const conversation of this.activeConversations.values()) {
      // State distribution
      stats.stateDistribution[conversation.state] = 
        (stats.stateDistribution[conversation.state] || 0) + 1;
      
      // Message count
      stats.totalMessages += conversation.conversationHistory?.length || 0;
      
      // Session length
      const sessionLength = now - new Date(conversation.createdAt);
      totalSessionTime += sessionLength;
    }

    if (this.activeConversations.size > 0) {
      stats.averageSessionLength = totalSessionTime / this.activeConversations.size;
    }

    return stats;
  }

  /**
   * Export conversation for analysis or backup
   */
  async exportConversation(conversationId) {
    const conversation = await this.getConversationState(
      conversationId.split('-')[0], // userId
      conversationId.split('-')[1]  // projectId
    );

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return {
      conversationId: conversation.conversationId,
      userId: conversation.userId,
      projectId: conversation.projectId,
      createdAt: conversation.createdAt,
      lastActivity: conversation.lastActivity,
      messageCount: conversation.conversationHistory?.length || 0,
      state: conversation.state,
      history: conversation.conversationHistory,
      context: conversation.context
    };
  }
}

export { ConversationFlow };