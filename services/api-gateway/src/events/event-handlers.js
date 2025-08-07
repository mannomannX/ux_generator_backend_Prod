// ==========================================
// API GATEWAY - Event Handlers
// ==========================================

import { Logger } from '@ux-flow/common';

export class EventHandlers {
  constructor(logger, eventEmitter, gatewayManager, websocketService) {
    this.logger = logger || new Logger('gateway-events');
    this.eventEmitter = eventEmitter;
    this.gatewayManager = gatewayManager;
    this.websocketService = websocketService;
  }

  setupAllHandlers() {
    this.setupServiceEventHandlers();
    this.setupWebSocketEventHandlers();
    this.setupAuthEventHandlers();
    this.setupFlowEventHandlers();
    this.setupBillingEventHandlers();
    this.logger.info('All event handlers registered');
  }

  setupServiceEventHandlers() {
    // Service health events
    this.eventEmitter.on('service.health.changed', async (data) => {
      const { serviceName, status, previousStatus } = data;
      
      this.logger.info(`Service health changed: ${serviceName}`, {
        from: previousStatus,
        to: status
      });

      // Notify administrators via WebSocket
      this.websocketService?.broadcast({
        type: 'service.health',
        service: serviceName,
        status,
        timestamp: new Date().toISOString()
      });

      // If service is down, trigger alerts
      if (status === 'unhealthy' || status === 'unreachable') {
        await this.handleServiceDown(serviceName);
      }
    });

    // Circuit breaker events
    this.eventEmitter.on('circuit.opened', (data) => {
      const { serviceName, errorRate } = data;
      
      this.logger.warn(`Circuit breaker opened for ${serviceName}`, {
        errorRate
      });

      // Notify connected clients
      this.websocketService?.broadcast({
        type: 'service.circuit.open',
        service: serviceName,
        message: 'Service temporarily unavailable'
      });
    });

    this.eventEmitter.on('circuit.closed', (data) => {
      const { serviceName } = data;
      
      this.logger.info(`Circuit breaker closed for ${serviceName}`);

      // Notify connected clients
      this.websocketService?.broadcast({
        type: 'service.circuit.closed',
        service: serviceName,
        message: 'Service restored'
      });
    });
  }

  setupWebSocketEventHandlers() {
    // WebSocket connection events
    this.eventEmitter.on('websocket.connected', (data) => {
      const { clientId, userId, workspaceId } = data;
      
      // Track connection metrics
      this.updateMetrics('websocket.connections', 1);
      
      // Send initial data to client
      this.sendInitialData(clientId, userId, workspaceId);
    });

    this.eventEmitter.on('websocket.disconnected', (data) => {
      const { clientId, userId, code, reason } = data;
      
      // Track disconnection metrics
      this.updateMetrics('websocket.connections', -1);
      
      // Clean up any client-specific resources
      this.cleanupClientResources(clientId);
    });

    // Flow collaboration events
    this.eventEmitter.on('flow.update', async (data) => {
      const { clientId, userId, flowId, changes } = data;
      
      try {
        // Forward to flow service
        const response = await this.gatewayManager.routeRequest(
          'flow-service',
          `/api/flows/${flowId}/update`,
          {
            method: 'PATCH',
            body: JSON.stringify(changes),
            headers: {
              'X-User-Id': userId,
              'X-Client-Id': clientId
            }
          }
        );

        // Broadcast update to other clients in the same flow
        this.websocketService?.broadcastToRoom(`flow:${flowId}`, {
          type: 'flow.updated',
          flowId,
          changes,
          userId,
          timestamp: new Date().toISOString()
        }, clientId);
      } catch (error) {
        this.logger.error('Flow update failed', error);
        
        // Notify client of failure
        this.websocketService?.sendToClient(clientId, {
          type: 'flow.update.failed',
          error: error.message
        });
      }
    });
  }

  setupAuthEventHandlers() {
    // Authentication events
    this.eventEmitter.on('auth.login', (data) => {
      const { userId, email, ip } = data;
      
      this.logger.info('User logged in', { userId, email, ip });
      
      // Track login metrics
      this.updateMetrics('auth.logins', 1);
    });

    this.eventEmitter.on('auth.logout', (data) => {
      const { userId, sessionId } = data;
      
      this.logger.info('User logged out', { userId, sessionId });
      
      // Close WebSocket connections for this session
      this.websocketService?.disconnectSession(sessionId);
    });

    this.eventEmitter.on('auth.failed', (data) => {
      const { email, reason, ip } = data;
      
      this.logger.warn('Authentication failed', { email, reason, ip });
      
      // Track failed attempts
      this.updateMetrics('auth.failures', 1);
    });

    this.eventEmitter.on('auth.locked', (data) => {
      const { userId, reason, duration } = data;
      
      this.logger.warn('Account locked', { userId, reason, duration });
      
      // Disconnect all sessions for locked user
      this.websocketService?.disconnectUser(userId);
    });
  }

  setupFlowEventHandlers() {
    // Flow events from flow-service
    this.eventEmitter.on('flow.created', (data) => {
      const { flowId, projectId, userId, name } = data;
      
      this.logger.info('Flow created', { flowId, projectId, userId, name });
      
      // Notify workspace members
      this.notifyWorkspace(data.workspaceId, {
        type: 'flow.created',
        flow: {
          id: flowId,
          name,
          projectId,
          createdBy: userId
        }
      });
    });

    this.eventEmitter.on('flow.deleted', (data) => {
      const { flowId, projectId, userId } = data;
      
      this.logger.info('Flow deleted', { flowId, projectId, userId });
      
      // Notify workspace members
      this.notifyWorkspace(data.workspaceId, {
        type: 'flow.deleted',
        flowId,
        deletedBy: userId
      });
    });

    this.eventEmitter.on('flow.shared', (data) => {
      const { flowId, sharedWith, sharedBy, permissions } = data;
      
      this.logger.info('Flow shared', { flowId, sharedWith, sharedBy });
      
      // Notify recipients
      for (const userId of sharedWith) {
        this.websocketService?.sendToUser(userId, {
          type: 'flow.shared',
          flow: {
            id: flowId,
            sharedBy,
            permissions
          }
        });
      }
    });
  }

  setupBillingEventHandlers() {
    // Billing events from billing-service
    this.eventEmitter.on('billing.subscription.changed', (data) => {
      const { workspaceId, planId, previousPlan } = data;
      
      this.logger.info('Subscription changed', { workspaceId, planId, previousPlan });
      
      // Notify workspace members
      this.notifyWorkspace(workspaceId, {
        type: 'subscription.changed',
        plan: planId,
        previousPlan
      });
    });

    this.eventEmitter.on('billing.credits.low', (data) => {
      const { workspaceId, balance, threshold } = data;
      
      this.logger.warn('Low credit balance', { workspaceId, balance });
      
      // Notify workspace admins
      this.notifyWorkspaceAdmins(workspaceId, {
        type: 'credits.low',
        balance,
        threshold,
        message: 'Credit balance is running low'
      });
    });

    this.eventEmitter.on('billing.payment.failed', (data) => {
      const { workspaceId, amount, reason } = data;
      
      this.logger.error('Payment failed', { workspaceId, amount, reason });
      
      // Notify workspace admins
      this.notifyWorkspaceAdmins(workspaceId, {
        type: 'payment.failed',
        amount,
        reason,
        action: 'Please update your payment method'
      });
    });
  }

  async handleServiceDown(serviceName) {
    // Log incident
    this.logger.error(`Service down: ${serviceName}`);
    
    // Notify administrators
    this.websocketService?.broadcast({
      type: 'alert',
      severity: 'critical',
      service: serviceName,
      message: `Service ${serviceName} is down`,
      timestamp: new Date().toISOString()
    });
    
    // Trigger failover if configured
    if (this.gatewayManager.hasFailover(serviceName)) {
      await this.gatewayManager.activateFailover(serviceName);
    }
  }

  async sendInitialData(clientId, userId, workspaceId) {
    try {
      // Send service status
      const serviceStatuses = this.gatewayManager.getAllServiceStatuses();
      
      this.websocketService?.sendToClient(clientId, {
        type: 'initial.data',
        services: serviceStatuses,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to send initial data', error);
    }
  }

  cleanupClientResources(clientId) {
    // Clean up any temporary data or subscriptions
    // This could include removing from temporary caches, etc.
  }

  notifyWorkspace(workspaceId, message) {
    if (this.websocketService) {
      this.websocketService.broadcastToWorkspace(workspaceId, message);
    }
  }

  async notifyWorkspaceAdmins(workspaceId, message) {
    // Get workspace admins
    try {
      const response = await this.gatewayManager.routeRequest(
        'user-management',
        `/api/workspaces/${workspaceId}/admins`,
        { method: 'GET' }
      );
      
      const admins = response.admins || [];
      
      // Notify each admin
      for (const admin of admins) {
        this.websocketService?.sendToUser(admin.id, message);
      }
    } catch (error) {
      this.logger.error('Failed to notify workspace admins', error);
    }
  }

  updateMetrics(metric, value) {
    // Update internal metrics
    // This could be sent to a metrics service like Prometheus
    this.logger.debug('Metric updated', { metric, value });
  }
}

export default EventHandlers;