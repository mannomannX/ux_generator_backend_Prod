// ==========================================
// COGNITIVE CORE SERVICE - MongoDB Initialization Script
// ==========================================

// This script runs when MongoDB container starts up
// It creates the necessary collections and indexes for optimal performance

// Switch to the ux-flow-engine database
db = db.getSiblingDB('ux-flow-engine');

// Create collections with validation
db.createCollection('conversations', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['conversationId', 'userId', 'projectId', 'state'],
      properties: {
        conversationId: { bsonType: 'string' },
        userId: { bsonType: 'string' },
        projectId: { bsonType: 'string' },
        state: { 
          bsonType: 'string',
          enum: ['idle', 'processing', 'waiting_for_approval', 'waiting_for_clarification', 'executing', 'error']
        },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('agent_performance', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['agentName', 'taskId', 'executionTimeMs', 'success', 'timestamp'],
      properties: {
        agentName: { bsonType: 'string' },
        taskId: { bsonType: 'string' },
        executionTimeMs: { bsonType: 'number', minimum: 0 },
        success: { bsonType: 'bool' },
        timestamp: { bsonType: 'date' }
      }
    }
  }
});

db.createCollection('provider_metrics', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['provider', 'date', 'metrics'],
      properties: {
        provider: { 
          bsonType: 'string',
          enum: ['google-gemini', 'openai', 'claude']
        },
        date: { bsonType: 'date' },
        metrics: { bsonType: 'object' }
      }
    }
  }
});

// Create indexes for optimal query performance

// Conversations collection indexes
db.conversations.createIndex({ 'conversationId': 1 }, { unique: true });
db.conversations.createIndex({ 'userId': 1, 'projectId': 1 });
db.conversations.createIndex({ 'state': 1 });
db.conversations.createIndex({ 'lastActivity': -1 });
db.conversations.createIndex({ 'createdAt': -1 });

// Agent performance indexes
db.agent_performance.createIndex({ 'agentName': 1, 'timestamp': -1 });
db.agent_performance.createIndex({ 'taskId': 1 });
db.agent_performance.createIndex({ 'success': 1, 'timestamp': -1 });
db.agent_performance.createIndex({ 'executionTimeMs': 1 });
db.agent_performance.createIndex({ 'aiProvider': 1, 'timestamp': -1 });

// Provider metrics indexes
db.provider_metrics.createIndex({ 'provider': 1, 'date': -1 });
db.provider_metrics.createIndex({ 'date': -1 });

// Create TTL index for automatic cleanup of old performance data (90 days)
db.agent_performance.createIndex(
  { 'timestamp': 1 }, 
  { expireAfterSeconds: 7776000 } // 90 days
);

// Create TTL index for automatic cleanup of old provider metrics (180 days)
db.provider_metrics.createIndex(
  { 'createdAt': 1 }, 
  { expireAfterSeconds: 15552000 } // 180 days
);

// Insert some initial data for development
db.conversations.insertOne({
  conversationId: 'demo-user-demo-project',
  userId: 'demo-user',
  projectId: 'demo-project',
  sessionId: 'demo-session',
  state: 'idle',
  lastMessage: 'Welcome to UX-Flow-Engine!',
  lastResponse: {
    type: 'message',
    message: 'Hello! I\'m ready to help you design amazing UX flows.',
    metadata: {}
  },
  classification: {
    intent: 'general_conversation',
    sentiment: 'positive',
    tasks: [],
    questions: []
  },
  context: {
    shortTerm: ['Welcome message'],
    midTerm: [],
    longTerm: {
      preferences: ['friendly_conversation'],
      entities: {},
      projectContext: 'Demo project for testing'
    },
    knowledgeContext: 'Basic UX principles available',
    currentFlow: { nodes: [], edges: [] }
  },
  conversationHistory: [
    {
      id: 'msg_demo_001',
      role: 'system',
      content: 'Conversation initialized',
      timestamp: new Date(),
      metadata: {
        aiProvider: 'google-gemini',
        processingTime: 0
      }
    }
  ],
  agentHistory: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivity: new Date()
});

print('MongoDB initialization completed successfully!');
print('Collections created: conversations, agent_performance, provider_metrics');
print('Indexes created for optimal query performance');
print('Demo data inserted for development');
print('TTL indexes set for automatic cleanup of old data');