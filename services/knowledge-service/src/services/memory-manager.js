// ==========================================
// SERVICES/KNOWLEDGE-SERVICE/src/services/memory-manager.js
// ==========================================
import { MongoClient } from '@ux-flow/common';

class MemoryManager {
  constructor(logger, mongoClient, redisClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;

    // Memory configuration
    this.config = {
      shortTermThreshold: 5,      // Keep last 5 messages in short-term
      midTermEpisodeSize: 10,     // Summarize every 10 messages into mid-term
      longTermFactThreshold: 50,  // Extract facts every 50 messages for long-term
      maxMidTermEpisodes: 20,     // Keep max 20 mid-term episodes before summarizing to long-term
      cacheExpiryMinutes: 30,     // Cache context for 30 minutes
    };

    // Track memory processing per conversation
    this.processingQueue = new Map();
  }

  async getConversationContext(projectId, userId, workspaceId) {
    try {
      const contextKey = `context:${projectId}:${userId}`;
      
      // Try cache first
      const cachedContext = await this.getCachedContext(contextKey);
      if (cachedContext) {
        this.logger.debug('Context retrieved from cache', { projectId, userId });
        return cachedContext;
      }

      // Build context from memory layers
      const context = await this.buildHierarchicalContext(projectId, userId, workspaceId);
      
      // Cache the result
      await this.cacheContext(contextKey, context);

      this.logger.info('Context built and cached', {
        projectId,
        userId,
        shortTermMessages: context.shortTerm.messages?.length || 0,
        midTermEpisodes: context.midTerm.episodes?.length || 0,
        longTermFacts: Object.keys(context.longTerm.facts || {}).length,
      });

      return context;

    } catch (error) {
      this.logger.error('Failed to get conversation context', error, { projectId, userId });
      throw error;
    }
  }

  async buildHierarchicalContext(projectId, userId, workspaceId) {
    const db = this.mongoClient.getDb();
    
    // Get all conversation messages
    const conversationsCollection = db.collection('conversations');
    const messages = await conversationsCollection
      .find({ 
        projectId, 
        userId,
        workspaceId 
      })
      .sort({ timestamp: 1 })
      .toArray();

    if (messages.length === 0) {
      return this.getEmptyContext();
    }

    // Build memory layers
    const shortTerm = await this.buildShortTermMemory(messages);
    const midTerm = await this.buildMidTermMemory(projectId, userId, messages);
    const longTerm = await this.buildLongTermMemory(projectId, userId, messages);

    // Get agent decision history
    const agentHistory = await this.getAgentDecisionHistory(projectId, userId);

    return {
      projectId,
      userId,
      workspaceId,
      totalMessages: messages.length,
      shortTerm,
      midTerm,
      longTerm,
      agentHistory,
      lastUpdated: new Date(),
    };
  }

  async buildShortTermMemory(messages) {
    // Keep last N messages as-is for immediate context
    const recentMessages = messages.slice(-this.config.shortTermThreshold);
    
    return {
      level: 'short-term',
      messages: recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        messageId: msg._id.toString(),
      })),
      summary: this.generateShortTermSummary(recentMessages),
    };
  }

  async buildMidTermMemory(projectId, userId, allMessages) {
    const db = this.mongoClient.getDb();
    const episodesCollection = db.collection('memory_episodes');

    // Get existing episodes
    const existingEpisodes = await episodesCollection
      .find({ projectId, userId })
      .sort({ episodeNumber: 1 })
      .toArray();

    // Calculate how many messages we've already processed
    const processedMessageCount = existingEpisodes.reduce((sum, ep) => sum + ep.messageCount, 0);
    const unprocessedMessages = allMessages.slice(processedMessageCount);

    // Create new episodes from unprocessed messages
    const newEpisodes = [];
    for (let i = 0; i < unprocessedMessages.length; i += this.config.midTermEpisodeSize) {
      const episodeMessages = unprocessedMessages.slice(i, i + this.config.midTermEpisodeSize);
      
      if (episodeMessages.length >= this.config.midTermEpisodeSize || i + episodeMessages.length === unprocessedMessages.length) {
        const episodeNumber = existingEpisodes.length + newEpisodes.length + 1;
        const episode = await this.createMidTermEpisode(
          projectId, 
          userId, 
          episodeNumber, 
          episodeMessages
        );
        newEpisodes.push(episode);
      }
    }

    // Store new episodes
    if (newEpisodes.length > 0) {
      await episodesCollection.insertMany(newEpisodes);
    }

    // Get all episodes (existing + new)
    const allEpisodes = [...existingEpisodes, ...newEpisodes];

    return {
      level: 'mid-term',
      episodes: allEpisodes.map(ep => ({
        episodeNumber: ep.episodeNumber,
        summary: ep.summary,
        keyDecisions: ep.keyDecisions,
        agentActions: ep.agentActions,
        timespan: {
          start: ep.startTime,
          end: ep.endTime,
        },
        messageCount: ep.messageCount,
      })),
      totalEpisodes: allEpisodes.length,
    };
  }

  async buildLongTermMemory(projectId, userId, allMessages) {
    const db = this.mongoClient.getDb();
    const factsCollection = db.collection('memory_facts');

    // Get existing facts
    const existingFacts = await factsCollection.findOne({ projectId, userId });
    
    if (!existingFacts) {
      // Create initial facts if enough messages
      if (allMessages.length >= this.config.longTermFactThreshold) {
        const facts = await this.extractLongTermFacts(projectId, userId, allMessages);
        await factsCollection.insertOne(facts);
        return facts;
      } else {
        return this.getEmptyLongTermMemory(projectId, userId);
      }
    }

    // Update facts if we have new messages
    const lastProcessedCount = existingFacts.processedMessageCount || 0;
    const newMessages = allMessages.slice(lastProcessedCount);

    if (newMessages.length >= this.config.longTermFactThreshold) {
      const updatedFacts = await this.updateLongTermFacts(existingFacts, newMessages, allMessages.length);
      await factsCollection.replaceOne({ projectId, userId }, updatedFacts);
      return updatedFacts;
    }

    return existingFacts;
  }

  async createMidTermEpisode(projectId, userId, episodeNumber, messages) {
    // Analyze messages to extract key information
    const summary = await this.summarizeEpisode(messages);
    const keyDecisions = this.extractKeyDecisions(messages);
    const agentActions = this.extractAgentActions(messages);

    return {
      projectId,
      userId,
      episodeNumber,
      summary,
      keyDecisions,
      agentActions,
      messageCount: messages.length,
      startTime: messages[0].timestamp,
      endTime: messages[messages.length - 1].timestamp,
      createdAt: new Date(),
    };
  }

  async summarizeEpisode(messages) {
    // Create a concise summary of what happened in this episode
    const dialogue = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    // Simple pattern-based summarization (in production, you'd use an AI model)
    const patterns = {
      flowCreation: /creat|build|add.*flow|new.*flow/i,
      flowModification: /modify|update|change|edit.*flow/i,
      planning: /plan|strategy|approach|step/i,
      validation: /valid|check|verify|test/i,
      completion: /done|finish|complete|success/i,
    };

    const detectedActions = [];
    for (const [action, pattern] of Object.entries(patterns)) {
      if (pattern.test(dialogue)) {
        detectedActions.push(action);
      }
    }

    return {
      mainActions: detectedActions,
      description: this.generateEpisodeDescription(messages, detectedActions),
      outcome: this.determineEpisodeOutcome(messages),
    };
  }

  extractKeyDecisions(messages) {
    const decisions = [];
    
    for (const msg of messages) {
      // Look for decision patterns in assistant messages
      if (msg.role === 'assistant') {
        if (msg.content.includes('plan') || msg.content.includes('approach')) {
          decisions.push({
            type: 'strategy_decision',
            content: msg.content.substring(0, 200),
            timestamp: msg.timestamp,
          });
        }
        if (msg.content.includes('approved') || msg.content.includes('rejected')) {
          decisions.push({
            type: 'approval_decision',
            content: msg.content.substring(0, 200),
            timestamp: msg.timestamp,
          });
        }
      }
      
      // Look for user decisions
      if (msg.role === 'user') {
        if (msg.content.includes('yes') || msg.content.includes('approve') || msg.content.includes('go ahead')) {
          decisions.push({
            type: 'user_approval',
            content: msg.content.substring(0, 200),
            timestamp: msg.timestamp,
          });
        }
      }
    }

    return decisions;
  }

  extractAgentActions(messages) {
    const actions = [];
    
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        // Extract agent actions from assistant messages
        const actionPatterns = {
          'plan_created': /created.*plan|plan.*generated/i,
          'flow_updated': /updated.*flow|flow.*modified/i,
          'validation_performed': /validated|checked|verified/i,
          'suggestion_provided': /suggest|recommend|advise/i,
        };

        for (const [actionType, pattern] of Object.entries(actionPatterns)) {
          if (pattern.test(msg.content)) {
            actions.push({
              type: actionType,
              timestamp: msg.timestamp,
              agent: this.inferAgentFromContent(msg.content),
            });
          }
        }
      }
    }

    return actions;
  }

  async extractLongTermFacts(projectId, userId, allMessages) {
    const facts = {
      projectId,
      userId,
      processedMessageCount: allMessages.length,
      entities: {},
      preferences: {},
      patterns: {},
      flowEvolution: [],
      agentBehavior: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Extract entities (nodes, features, etc.)
    for (const msg of allMessages) {
      if (msg.role === 'user') {
        this.extractEntitiesFromMessage(msg.content, facts.entities);
      }
    }

    // Extract user preferences
    facts.preferences = this.extractUserPreferences(allMessages);

    // Extract behavioral patterns
    facts.patterns = this.extractBehavioralPatterns(allMessages);

    // Track flow evolution
    facts.flowEvolution = this.extractFlowEvolution(allMessages);

    // Analyze agent behavior
    facts.agentBehavior = this.analyzeAgentBehavior(allMessages);

    return facts;
  }

  async updateLongTermFacts(existingFacts, newMessages, totalMessageCount) {
    const updatedFacts = { ...existingFacts };
    updatedFacts.processedMessageCount = totalMessageCount;
    updatedFacts.updatedAt = new Date();

    // Update entities with new information
    for (const msg of newMessages) {
      if (msg.role === 'user') {
        this.extractEntitiesFromMessage(msg.content, updatedFacts.entities);
      }
    }

    // Update patterns and behavior
    const newPatterns = this.extractBehavioralPatterns(newMessages);
    updatedFacts.patterns = this.mergePatterns(updatedFacts.patterns, newPatterns);

    return updatedFacts;
  }

  async getAgentDecisionHistory(projectId, userId) {
    // Get agent decision tracking from a separate collection
    const db = this.mongoClient.getDb();
    const decisionsCollection = db.collection('agent_decisions');

    const decisions = await decisionsCollection
      .find({ projectId, userId })
      .sort({ timestamp: -1 })
      .limit(20) // Last 20 decisions
      .toArray();

    return {
      recentDecisions: decisions.map(decision => ({
        agent: decision.agent,
        decision: decision.decision,
        reasoning: decision.reasoning,
        outcome: decision.outcome,
        timestamp: decision.timestamp,
      })),
      agentPerformance: this.calculateAgentPerformance(decisions),
    };
  }

  // Helper methods
  generateShortTermSummary(messages) {
    if (messages.length === 0) return 'No recent activity';
    
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    
    return `Recent activity: ${lastUserMessage?.content.substring(0, 100) || 'No user input'}... 
           Latest response: ${lastAssistantMessage?.content.substring(0, 100) || 'No assistant response'}...`;
  }

  generateEpisodeDescription(messages, actions) {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    
    return `Episode with ${userMessages} user messages and ${assistantMessages} assistant responses. 
            Main activities: ${actions.join(', ') || 'general conversation'}.`;
  }

  determineEpisodeOutcome(messages) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant') {
      if (lastMessage.content.includes('success') || lastMessage.content.includes('completed')) {
        return 'success';
      }
      if (lastMessage.content.includes('error') || lastMessage.content.includes('failed')) {
        return 'error';
      }
    }
    return 'in_progress';
  }

  inferAgentFromContent(content) {
    const agentPatterns = {
      'manager': /coordinat|manag|plan/i,
      'planner': /step|plan|sequence/i,
      'architect': /build|creat|implement/i,
      'validator': /check|valid|verify/i,
      'ux_expert': /ux|user.*experience|design.*principle/i,
    };

    for (const [agent, pattern] of Object.entries(agentPatterns)) {
      if (pattern.test(content)) {
        return agent;
      }
    }
    return 'unknown';
  }

  extractEntitiesFromMessage(content, entities) {
    // Extract screen names, flow elements, etc.
    const screenMatches = content.match(/screen\s+["']?(\w+)["']?/gi) || [];
    const buttonMatches = content.match(/button\s+["']?(\w+)["']?/gi) || [];
    
    for (const match of screenMatches) {
      const screenName = match.replace(/screen\s+["']?/i, '').replace(/["']?$/, '');
      entities[`screen_${screenName.toLowerCase()}`] = {
        type: 'screen',
        name: screenName,
        mentions: (entities[`screen_${screenName.toLowerCase()}`]?.mentions || 0) + 1,
      };
    }

    for (const match of buttonMatches) {
      const buttonName = match.replace(/button\s+["']?/i, '').replace(/["']?$/, '');
      entities[`button_${buttonName.toLowerCase()}`] = {
        type: 'button',
        name: buttonName,
        mentions: (entities[`button_${buttonName.toLowerCase()}`]?.mentions || 0) + 1,
      };
    }
  }

  extractUserPreferences(messages) {
    // Analyze user messages for preferences
    const preferences = {
      communication_style: 'detailed', // vs 'concise'
      flow_complexity: 'moderate',     // vs 'simple', 'complex'
      approval_pattern: 'thorough',    // vs 'quick'
    };

    const userMessages = messages.filter(m => m.role === 'user');
    
    // Analyze communication style
    const avgMessageLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
    if (avgMessageLength < 50) preferences.communication_style = 'concise';
    if (avgMessageLength > 200) preferences.communication_style = 'detailed';

    return preferences;
  }

  extractBehavioralPatterns(messages) {
    return {
      peak_activity_hours: this.findPeakActivityHours(messages),
      common_request_types: this.categorizeRequests(messages),
      feedback_patterns: this.analyzeFeedbackPatterns(messages),
    };
  }

  extractFlowEvolution(messages) {
    // Track how the flow evolved over time
    const evolution = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && (msg.content.includes('updated') || msg.content.includes('created'))) {
        evolution.push({
          timestamp: msg.timestamp,
          action: msg.content.includes('created') ? 'creation' : 'modification',
          description: msg.content.substring(0, 100),
        });
      }
    }
    return evolution;
  }

  analyzeAgentBehavior(messages) {
    // Analyze which agents were most active and successful
    const agentStats = {};
    
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const agent = this.inferAgentFromContent(msg.content);
        if (!agentStats[agent]) {
          agentStats[agent] = { actions: 0, successes: 0, errors: 0 };
        }
        agentStats[agent].actions++;
        
        if (msg.content.includes('success')) agentStats[agent].successes++;
        if (msg.content.includes('error')) agentStats[agent].errors++;
      }
    }

    return agentStats;
  }

  calculateAgentPerformance(decisions) {
    const performance = {};
    
    for (const decision of decisions) {
      if (!performance[decision.agent]) {
        performance[decision.agent] = { total: 0, successes: 0, failures: 0 };
      }
      performance[decision.agent].total++;
      
      if (decision.outcome === 'success') {
        performance[decision.agent].successes++;
      } else if (decision.outcome === 'failure') {
        performance[decision.agent].failures++;
      }
    }

    // Calculate success rates
    for (const agent in performance) {
      const stats = performance[agent];
      stats.successRate = stats.total > 0 ? stats.successes / stats.total : 0;
    }

    return performance;
  }

  findPeakActivityHours(messages) {
    const hourCounts = new Array(24).fill(0);
    
    for (const msg of messages) {
      const hour = new Date(msg.timestamp).getHours();
      hourCounts[hour]++;
    }

    const maxCount = Math.max(...hourCounts);
    return hourCounts.map((count, hour) => ({ hour, activity: count / maxCount }))
                   .filter(h => h.activity > 0.7)
                   .map(h => h.hour);
  }

  categorizeRequests(messages) {
    const categories = {
      creation: 0,
      modification: 0,
      question: 0,
      approval: 0,
    };

    const userMessages = messages.filter(m => m.role === 'user');
    
    for (const msg of userMessages) {
      const content = msg.content.toLowerCase();
      if (content.includes('create') || content.includes('build') || content.includes('new')) {
        categories.creation++;
      } else if (content.includes('change') || content.includes('modify') || content.includes('update')) {
        categories.modification++;
      } else if (content.includes('?') || content.includes('how') || content.includes('what')) {
        categories.question++;
      } else if (content.includes('yes') || content.includes('approve') || content.includes('ok')) {
        categories.approval++;
      }
    }

    return categories;
  }

  analyzeFeedbackPatterns(messages) {
    let positiveCount = 0;
    let negativeCount = 0;
    
    const userMessages = messages.filter(m => m.role === 'user');
    
    for (const msg of userMessages) {
      const content = msg.content.toLowerCase();
      if (content.includes('good') || content.includes('great') || content.includes('perfect')) {
        positiveCount++;
      } else if (content.includes('no') || content.includes('wrong') || content.includes('bad')) {
        negativeCount++;
      }
    }

    return {
      positive: positiveCount,
      negative: negativeCount,
      ratio: positiveCount + negativeCount > 0 ? positiveCount / (positiveCount + negativeCount) : 0,
    };
  }

  mergePatterns(existing, newPatterns) {
    return {
      peak_activity_hours: [...new Set([...existing.peak_activity_hours, ...newPatterns.peak_activity_hours])],
      common_request_types: this.mergeObjectCounts(existing.common_request_types, newPatterns.common_request_types),
      feedback_patterns: this.mergeFeedbackPatterns(existing.feedback_patterns, newPatterns.feedback_patterns),
    };
  }

  mergeObjectCounts(obj1, obj2) {
    const merged = { ...obj1 };
    for (const key in obj2) {
      merged[key] = (merged[key] || 0) + obj2[key];
    }
    return merged;
  }

  mergeFeedbackPatterns(pattern1, pattern2) {
    return {
      positive: pattern1.positive + pattern2.positive,
      negative: pattern1.negative + pattern2.negative,
      ratio: (pattern1.positive + pattern2.positive) / 
             (pattern1.positive + pattern2.positive + pattern1.negative + pattern2.negative),
    };
  }

  getEmptyContext() {
    return {
      projectId: null,
      userId: null,
      workspaceId: null,
      totalMessages: 0,
      shortTerm: { level: 'short-term', messages: [], summary: 'No conversation history' },
      midTerm: { level: 'mid-term', episodes: [], totalEpisodes: 0 },
      longTerm: { level: 'long-term', facts: {}, patterns: {}, evolution: [] },
      agentHistory: { recentDecisions: [], agentPerformance: {} },
      lastUpdated: new Date(),
    };
  }

  getEmptyLongTermMemory(projectId, userId) {
    return {
      projectId,
      userId,
      processedMessageCount: 0,
      entities: {},
      preferences: {},
      patterns: {},
      flowEvolution: [],
      agentBehavior: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Cache management
  async cacheContext(key, context) {
    try {
      await this.redisClient.set(key, context, this.config.cacheExpiryMinutes * 60);
    } catch (error) {
      this.logger.warn('Failed to cache context', error);
    }
  }

  async getCachedContext(key) {
    try {
      return await this.redisClient.get(key);
    } catch (error) {
      this.logger.warn('Failed to get cached context', error);
      return null;
    }
  }

  async invalidateCache(projectId, userId) {
    try {
      const contextKey = `context:${projectId}:${userId}`;
      await this.redisClient.del(contextKey);
    } catch (error) {
      this.logger.warn('Failed to invalidate cache', error);
    }
  }

  // Health check
  healthCheck() {
    return {
      status: 'ok',
      memoryLevels: this.getMemoryLevels(),
      processingQueue: this.processingQueue.size,
      config: this.config,
    };
  }

  getMemoryLevels() {
    return ['short-term', 'mid-term', 'long-term'];
  }

  // Public method to record agent decisions
  async recordAgentDecision(projectId, userId, agentName, decision, reasoning, outcome = null) {
    try {
      const db = this.mongoClient.getDb();
      const decisionsCollection = db.collection('agent_decisions');

      await decisionsCollection.insertOne({
        projectId,
        userId,
        agent: agentName,
        decision,
        reasoning,
        outcome,
        timestamp: new Date(),
      });

      // Invalidate cache to force refresh
      await this.invalidateCache(projectId, userId);

    } catch (error) {
      this.logger.error('Failed to record agent decision', error);
    }
  }
}

export { MemoryManager };