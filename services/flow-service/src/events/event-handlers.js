// ==========================================
// SERVICES/FLOW-SERVICE/src/events/event-handlers.js
// ==========================================
import { EventTypes } from '@ux-flow/common';

class EventHandlers {
  constructor(logger, eventEmitter, flowManager) {
    this.logger = logger;
    this.eventEmitter = eventEmitter;
    this.flowManager = flowManager;
  }

  setupAllHandlers() {
    // Flow update requests from Cognitive Core
    this.eventEmitter.on(EventTypes.FLOW_UPDATE_REQUESTED, 
      this.handleFlowUpdateRequest.bind(this)
    );

    // Flow validation requests
    this.eventEmitter.on(EventTypes.FLOW_VALIDATION_REQUESTED,
      this.handleFlowValidationRequest.bind(this)
    );

    // Project initialization requests from API Gateway
    this.eventEmitter.on('PROJECT_FLOW_INIT_REQUESTED',
      this.handleProjectFlowInit.bind(this)
    );

    // Project flow deletion requests
    this.eventEmitter.on('PROJECT_FLOW_DELETE_REQUESTED',
      this.handleProjectFlowDelete.bind(this)
    );

    this.logger.info('Flow Service event handlers setup completed');
  }

  async handleFlowUpdateRequest(data) {
    try {
      const { userId, projectId, workspaceId, transactions, originalPlan } = data;
      
      this.logger.info('Processing flow update request', {
        userId,
        projectId,
        transactionCount: transactions?.length || 0,
        correlationId: data.correlationId,
      });

      // Find the flow for this project
      let flow;
      try {
        flow = await this.flowManager.getFlow(null, projectId, workspaceId);
      } catch (error) {
        // If flow doesn't exist, create it first
        if (error.message.includes('not found')) {
          this.logger.info('Flow not found, creating new flow for project', { projectId });
          const createResult = await this.flowManager.createFlow(
            projectId,
            workspaceId,
            userId,
            { name: `Flow for Project ${projectId}` }
          );
          flow = createResult.flow;
        } else {
          throw error;
        }
      }

      // Apply transactions to update the flow
      const updatedFlow = await this.flowManager.updateFlow(
        flow.id,
        transactions,
        userId,
        projectId
      );

      // Emit success event back to API Gateway
      this.eventEmitter.emit(EventTypes.FLOW_UPDATED, {
        userId,
        projectId,
        workspaceId,
        flow: updatedFlow,
        transactionCount: transactions.length,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });

      this.logger.info('Flow update completed successfully', {
        userId,
        projectId,
        flowId: updatedFlow.id,
        newVersion: updatedFlow.metadata.version,
      });

    } catch (error) {
      this.logger.error('Failed to handle flow update request', error, {
        userId: data.userId,
        projectId: data.projectId,
        correlationId: data.correlationId,
      });

      // Emit error event
      this.eventEmitter.emit(EventTypes.FLOW_UPDATE_FAILED, {
        userId: data.userId,
        projectId: data.projectId,
        error: error.message,
        correlationId: data.correlationId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async handleFlowValidationRequest(data) {
    try {
      const { userId, projectId, flowData, transactions } = data;

      this.logger.info('Processing flow validation request', {
        userId,
        projectId,
        hasFlowData: !!flowData,
        hasTransactions: !!transactions,
      });

      let validationResult;

      if (flowData) {
        // Validate complete flow
        validationResult = this.flowManager.validationService.validateFlow(flowData);
      } else if (transactions) {
        // Validate transactions
        validationResult = this.flowManager.validationService.validateTransactions(transactions);
      } else {
        throw new Error('Either flowData or transactions must be provided for validation');
      }

      // Emit validation result
      this.eventEmitter.emit(EventTypes.FLOW_VALIDATION_COMPLETED, {
        userId,
        projectId,
        validation: validationResult,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });

      this.logger.info('Flow validation completed', {
        userId,
        projectId,
        isValid: validationResult.isValid,
        errorCount: validationResult.errors?.length || 0,
        warningCount: validationResult.warnings?.length || 0,
      });

    } catch (error) {
      this.logger.error('Failed to handle flow validation request', error, {
        userId: data.userId,
        projectId: data.projectId,
      });

      // Emit validation error
      this.eventEmitter.emit(EventTypes.FLOW_VALIDATION_COMPLETED, {
        userId: data.userId,
        projectId: data.projectId,
        validation: {
          isValid: false,
          errors: [error.message],
          warnings: [],
        },
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleProjectFlowInit(data) {
    try {
      const { projectId, workspaceId, userId, template = 'empty', name } = data;

      this.logger.info('Initializing flow for new project', {
        projectId,
        workspaceId,
        template,
        userId,
      });

      // Create flow for the project
      const result = await this.flowManager.createFlow(
        projectId,
        workspaceId,
        userId,
        {
          template,
          name: name || `Flow for ${projectId}`,
          description: 'Auto-generated flow for new project',
        }
      );

      // Emit success event
      this.eventEmitter.emit('PROJECT_FLOW_INITIALIZED', {
        projectId,
        workspaceId,
        flowId: result.flowId,
        flow: result.flow,
        template,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });

      this.logger.info('Project flow initialized successfully', {
        projectId,
        flowId: result.flowId,
        template,
      });

    } catch (error) {
      this.logger.error('Failed to initialize project flow', error, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });

      // Emit error event
      this.eventEmitter.emit('PROJECT_FLOW_INIT_FAILED', {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }

  async handleProjectFlowDelete(data) {
    try {
      const { projectId, workspaceId, userId } = data;

      this.logger.info('Deleting flow for project', {
        projectId,
        workspaceId,
        userId,
      });

      // Find and delete the flow
      const flow = await this.flowManager.getFlow(null, projectId, workspaceId);
      await this.flowManager.deleteFlow(flow.id, userId, projectId);

      // Emit success event
      this.eventEmitter.emit('PROJECT_FLOW_DELETED', {
        projectId,
        workspaceId,
        flowId: flow.id,
        deletedBy: userId,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });

      this.logger.info('Project flow deleted successfully', {
        projectId,
        flowId: flow.id,
        deletedBy: userId,
      });

    } catch (error) {
      this.logger.error('Failed to delete project flow', error, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });

      // Emit error event (but don't fail the project deletion)
      this.eventEmitter.emit('PROJECT_FLOW_DELETE_FAILED', {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
        error: error.message,
        timestamp: new Date().toISOString(),
        correlationId: data.correlationId,
      });
    }
  }
}

export { EventHandlers };