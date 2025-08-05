// ==========================================
// PACKAGES/COMMON/src/events/index.js
// ==========================================
import EventEmitter from 'events';

// Centralized Event Type Definitions
export const EventTypes = {
  // User Interaction Events
  USER_MESSAGE_RECEIVED: 'user.message.received',
  USER_PLAN_APPROVED: 'user.plan.approved',
  USER_PLAN_REJECTED: 'user.plan.rejected',
  USER_FEEDBACK_RECEIVED: 'user.feedback.received',

  // Agent Events
  AGENT_TASK_STARTED: 'agent.task.started',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  AGENT_TASK_FAILED: 'agent.task.failed',

  // Knowledge Events
  KNOWLEDGE_QUERY_REQUESTED: 'knowledge.query.requested',
  KNOWLEDGE_RESPONSE_READY: 'knowledge.response.ready',
  KNOWLEDGE_INDEX_UPDATED: 'knowledge.index.updated',

  // Flow Events
  FLOW_UPDATE_REQUESTED: 'flow.update.requested',
  FLOW_UPDATED: 'flow.updated',
  FLOW_VALIDATION_REQUESTED: 'flow.validation.requested',
  FLOW_VALIDATION_COMPLETED: 'flow.validation.completed',

  // System Events
  SERVICE_HEALTH_CHECK: 'system.health.check',
  SERVICE_READY: 'system.service.ready',
  SERVICE_ERROR: 'system.service.error',

  // WebSocket Events
  CLIENT_CONNECTED: 'websocket.client.connected',
  CLIENT_DISCONNECTED: 'websocket.client.disconnected',
  BROADCAST_TO_ROOM: 'websocket.broadcast.room',
};

// Event Schema Validation
export const EventSchemas = {
  [EventTypes.USER_MESSAGE_RECEIVED]: {
    userId: 'string',
    projectId: 'string',
    message: 'string',
    timestamp: 'date',
  },
  [EventTypes.FLOW_UPDATE_REQUESTED]: {
    projectId: 'string',
    userId: 'string',
    transactions: 'array',
    timestamp: 'date',
  },
};

// Enhanced Event Emitter with Logging and Validation
class UXFlowEventEmitter extends EventEmitter {
  constructor(logger, serviceName = 'unknown') {
    super();
    this.logger = logger;
    this.serviceName = serviceName;
    this.setMaxListeners(50); // Support for multiple agents
  }

  emit(eventType, data = {}) {
    // Add metadata to all events
    const enrichedData = {
      ...data,
      emittedBy: this.serviceName,
      emittedAt: new Date().toISOString(),
      eventId: this.generateEventId(),
    };

    this.logger.debug(`Event emitted: ${eventType}`, {
      eventType,
      eventId: enrichedData.eventId,
      dataKeys: Object.keys(data),
    });

    return super.emit(eventType, enrichedData);
  }

  on(eventType, listener) {
    this.logger.debug(`Event listener registered: ${eventType}`, {
      eventType,
      listenerCount: this.listenerCount(eventType) + 1,
    });

    return super.on(eventType, listener);
  }

  generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Convenience methods for common event patterns
  emitAgentTaskStarted(agentName, taskId, taskDescription) {
    return this.emit(EventTypes.AGENT_TASK_STARTED, {
      agentName,
      taskId,
      taskDescription,
    });
  }

  emitAgentTaskCompleted(agentName, taskId, result) {
    return this.emit(EventTypes.AGENT_TASK_COMPLETED, {
      agentName,
      taskId,
      result,
    });
  }

  emitFlowUpdateRequested(projectId, userId, transactions) {
    return this.emit(EventTypes.FLOW_UPDATE_REQUESTED, {
      projectId,
      userId,
      transactions,
    });
  }
}

export { UXFlowEventEmitter as EventEmitter };