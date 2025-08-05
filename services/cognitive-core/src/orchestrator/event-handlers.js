// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/event-handlers.js
// ==========================================
import { EventTypes } from '@ux-flow/common';

class EventHandlers {
  constructor(logger, eventEmitter, orchestrator) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.orchestrator = orchestrator;
  }

  setupAllHandlers() {
    // User message handling
    this.eventEmitter.on(EventTypes.USER_MESSAGE_RECEIVED, 
      this.handleUserMessage.bind(this)
    );

    // Plan approval handling
    this.eventEmitter.on(EventTypes.USER_PLAN_APPROVED, 
      this.handlePlanApproval.bind(this)
    );

    // Knowledge query handling
    this.eventEmitter.on(EventTypes.KNOWLEDGE_QUERY_REQUESTED,
      this.handleKnowledgeQuery.bind(this)
    );

    // Flow update handling
    this.eventEmitter.on(EventTypes.FLOW_UPDATE_REQUESTED,
      this.handleFlowUpdate.bind(this)
    );

    this.logger.info('Event handlers setup completed');
  }

  async handleUserMessage(data) {
    try {
      const { userId, projectId, message, qualityMode } = data;
      
      this.logger.info('Processing user message', {
        userId,
        projectId,
        messageLength: message.length,
        qualityMode,
      });

      const response = await this.orchestrator.processUserMessage(
        userId,
        projectId,
        message,
        qualityMode
      );

      // Emit response ready event
      this.eventEmitter.emit(EventTypes.USER_RESPONSE_READY, {
        userId,
        projectId,
        response,
        originalEventId: data.eventId,
      });

    } catch (error) {
      this.logger.error('Failed to handle user message', error, data);
      
      // Emit error event
      this.eventEmitter.emit(EventTypes.SERVICE_ERROR, {
        service: 'cognitive-core',
        error: error.message,
        originalEvent: data,
      });
    }
  }

  async handlePlanApproval(data) {
    try {
      const { userId, projectId, plan, approved } = data;
      
      this.logger.info('Processing plan approval', {
        userId,
        projectId,
        approved,
        planSteps: plan?.length || 0,
      });

      if (approved) {
        // Generate transactions using architect
        const transactions = await this.orchestrator.invokeAgent('architect', plan, {
          currentFlow: data.currentFlow,
          qualityMode: 'pro',
        });

        // Validate transactions
        const validation = await this.orchestrator.invokeAgent('validator', transactions, {
          currentFlow: data.currentFlow,
          qualityMode: 'pro',
        });

        if (validation.status === 'OK') {
          // Emit flow update request
          this.eventEmitter.emit(EventTypes.FLOW_UPDATE_REQUESTED, {
            userId,
            projectId,
            transactions,
            originalPlan: plan,
          });
        } else {
          // Emit validation error
          this.eventEmitter.emit(EventTypes.FLOW_VALIDATION_COMPLETED, {
            userId,
            projectId,
            status: 'error',
            issues: validation.issues,
          });
        }
      }

    } catch (error) {
      this.logger.error('Failed to handle plan approval', error, data);
    }
  }

  async handleKnowledgeQuery(data) {
    // Forward to knowledge service - implementation depends on service communication
    this.logger.info('Knowledge query received, forwarding to knowledge service', data);
    
    // This would typically publish to a Redis channel that the knowledge service listens to
    await this.orchestrator.redisClient.publish('knowledge.query', data);
  }

  async handleFlowUpdate(data) {
    // Forward to flow service - implementation depends on service communication
    this.logger.info('Flow update request received, forwarding to flow service', data);
    
    // This would typically publish to a Redis channel that the flow service listens to
    await this.orchestrator.redisClient.publish('flow.update', data);
  }
}

export { EventHandlers };