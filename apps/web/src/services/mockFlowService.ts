import { UXFlowDocument, UXFlowNode, UXFlowEdge, AIProposal } from '@/types/uxflow';
import { mockLoginFlow, mockOnboardingFlow, mockGhostProposal } from '@/mocks/flowData';

class MockFlowService {
  private flows: Map<string, UXFlowDocument> = new Map();
  private currentFlowId: string | null = null;

  constructor() {
    this.flows.set('flow-1', mockLoginFlow);
    this.flows.set('flow-2', mockOnboardingFlow);
  }

  async loadFlow(flowId: string): Promise<UXFlowDocument> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const flow = this.flows.get(flowId);
        if (flow) {
          this.currentFlowId = flowId;
          resolve(JSON.parse(JSON.stringify(flow)));
        } else {
          reject(new Error('Flow not found'));
        }
      }, 500);
    });
  }

  async saveFlow(flowId: string, flow: UXFlowDocument): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.flows.set(flowId, JSON.parse(JSON.stringify(flow)));
        console.log('Flow saved:', flowId);
        resolve();
      }, 300);
    });
  }

  async createFlow(name: string): Promise<{ id: string; flow: UXFlowDocument }> {
    return new Promise((resolve) => {
      const id = `flow-${Date.now()}`;
      const newFlow: UXFlowDocument = {
        metadata: {
          flowName: name,
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          globalSettings: {
            gridSize: 20,
            snapToGrid: true,
            theme: 'light',
            showMinimap: true,
            showControls: true
          }
        },
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            title: 'Start',
            position: { x: 100, y: 200 }
          }
        ],
        edges: []
      };
      
      this.flows.set(id, newFlow);
      setTimeout(() => {
        resolve({ id, flow: newFlow });
      }, 300);
    });
  }

  async deleteFlow(flowId: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.flows.delete(flowId);
        resolve();
      }, 200);
    });
  }

  async listFlows(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const list = Array.from(this.flows.entries()).map(([id, flow]) => ({
          id,
          name: flow.metadata.flowName,
          updatedAt: flow.metadata.updatedAt
        }));
        resolve(list);
      }, 300);
    });
  }

  async exportFlow(flowId: string, format: 'json' | 'pdf' | 'figma'): Promise<Blob> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const flow = this.flows.get(flowId);
        if (!flow) {
          reject(new Error('Flow not found'));
          return;
        }

        switch (format) {
          case 'json':
            const json = JSON.stringify(flow, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            resolve(blob);
            break;
          case 'pdf':
          case 'figma':
            resolve(new Blob(['Mock export data'], { type: 'text/plain' }));
            break;
        }
      }, 500);
    });
  }

  async generateAIProposal(prompt: string): Promise<{ nodes: UXFlowNode[]; edges: UXFlowEdge[] }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('AI Prompt:', prompt);
        resolve(mockGhostProposal);
      }, 1500);
    });
  }

  async applyAIProposal(proposal: AIProposal): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Applying AI proposal:', proposal);
        resolve();
      }, 300);
    });
  }

  simulateCollaboratorUpdate(callback: (update: any) => void) {
    const collaborators = [
      { userId: 'user-2', userName: 'Alice', color: '#3B82F6' },
      { userId: 'user-3', userName: 'Bob', color: '#10B981' }
    ];

    setInterval(() => {
      const collaborator = collaborators[Math.floor(Math.random() * collaborators.length)];
      const update = {
        type: 'cursor',
        ...collaborator,
        position: {
          x: Math.random() * 1000,
          y: Math.random() * 600
        },
        timestamp: Date.now()
      };
      callback(update);
    }, 2000);

    setTimeout(() => {
      callback({
        type: 'node_update',
        nodeId: 'screen-login',
        changes: {
          title: 'Login Form (Updated by Alice)',
          style: { backgroundColor: '#DBEAFE' }
        },
        userId: 'user-2',
        userName: 'Alice'
      });
    }, 5000);
  }
}

export const mockFlowService = new MockFlowService();

export function useMockMode(): boolean {
  return !import.meta.env.VITE_API_URL || import.meta.env.VITE_USE_MOCK === 'true';
}