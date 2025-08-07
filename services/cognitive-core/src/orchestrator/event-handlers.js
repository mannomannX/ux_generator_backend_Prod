// ==========================================
// SERVICES/COGNITIVE-CORE/src/orchestrator/event-handlers.js
// ==========================================
import { 
  EventTypes, 
  InterServiceEvents,
  ServiceChannels
} from '@ux-flow/common';

class EventHandlers {
  constructor(logger, eventBus, orchestrator, serviceRegistry) {
    this.logger = logger;
    this.eventBus = eventBus; // Redis Event Bus
    this.orchestrator = orchestrator;
    this.serviceRegistry = serviceRegistry;
  }

  setupAllHandlers() {
    // AI Processing requests (from API Gateway)
    this.eventBus.on(InterServiceEvents.REQUEST_AI_PROCESSING, 
      this.handleAIProcessingRequest.bind(this)
    );

    // Plan approval handling
    this.eventBus.on(EventTypes.USER_PLAN_APPROVED, 
      this.handlePlanApproval.bind(this)
    );

    // Knowledge query handling
    this.eventBus.on(EventTypes.KNOWLEDGE_QUERY_REQUESTED,
      this.handleKnowledgeQuery.bind(this)
    );

    // Flow update handling
    this.eventBus.on(EventTypes.FLOW_UPDATE_REQUESTED,
      this.handleFlowUpdate.bind(this)
    );
    
    // Image processing requests
    this.eventBus.on(EventTypes.IMAGE_UPLOAD_RECEIVED,
      this.handleImageProcessing.bind(this)
    );

    this.logger.info('Event handlers setup completed');
  }

  async handleAIProcessingRequest(data) {
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

      // Send response back to API Gateway
      await this.eventBus.publishToService(
        'api-gateway',
        InterServiceEvents.RESPONSE_AI_PROCESSING,
        {
        userId,
        projectId,
        response,
        originalRequestId: data.requestId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to handle user message', error, data);
      
      // Send error back to API Gateway
      await this.eventBus.broadcast('SERVICE_ERROR', {
        service: 'cognitive-core',
        error: error.message,
        userId: data.userId,
        projectId: data.projectId,
        originalRequest: data
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
          // Send flow update request to Flow Service
          await this.eventBus.publishToService(
            'flow-service',
            InterServiceEvents.REQUEST_FLOW_UPDATE,
            {
            userId,
            projectId,
            transactions,
            originalPlan: plan,
            requestId: `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          });
        } else {
          // Send validation error back to API Gateway
          await this.eventBus.publishToService(
            'api-gateway',
            'FLOW_VALIDATION_ERROR',
            {
            userId,
            projectId,
            status: 'error',
            issues: validation.issues,
            timestamp: new Date().toISOString()
          });
        }
      }

    } catch (error) {
      this.logger.error('Failed to handle plan approval', error, data);
    }
  }

  async handleKnowledgeQuery(data) {
    try {
      this.logger.info('Knowledge query received, forwarding to knowledge service', data);
      
      // Forward to Knowledge Service via Redis Event Bus
      await this.eventBus.publishToService(
        'knowledge-service',
        InterServiceEvents.REQUEST_KNOWLEDGE_QUERY,
        {
          ...data,
          requestId: `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      );
    } catch (error) {
      this.logger.error('Failed to forward knowledge query', error);
    }
  }

  async handleFlowUpdate(data) {
    try {
      this.logger.info('Flow update request received, forwarding to flow service', data);
      
      // Forward to Flow Service via Redis Event Bus
      await this.eventBus.publishToService(
        'flow-service',
        InterServiceEvents.REQUEST_FLOW_UPDATE,
        {
          ...data,
          requestId: `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      );
    } catch (error) {
      this.logger.error('Failed to forward flow update request', error);
    }
  }
  
  async handleImageProcessing(data) {
    try {
      const { userId, projectId, imageData, mimeType } = data;
      
      this.logger.info('Processing image upload', {
        userId,
        projectId,
        imageSize: imageData?.length || 0
      });

      // Process image with vision-capable AI model
      const response = await this.orchestrator.processImageMessage(
        userId,
        projectId,
        imageData,
        mimeType
      );

      // Send response back to API Gateway
      await this.eventBus.publishToService(
        'api-gateway',
        InterServiceEvents.RESPONSE_AI_PROCESSING,
        {
          userId,
          projectId,
          response,
          type: 'image_analysis',
          timestamp: new Date().toISOString()
        }
      );

    } catch (error) {
      this.logger.error('Failed to process image', error);
      
      // Send error response
      await this.eventBus.publishToService(
        'api-gateway',
        'SERVICE_ERROR',
        {
          service: 'cognitive-core',
          error: error.message,
          userId: data.userId,
          projectId: data.projectId,
          type: 'image_processing_error'
        }
      );
    }
  }
}

export { EventHandlers };