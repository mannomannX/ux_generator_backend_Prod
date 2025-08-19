import { create } from 'zustand';
import { UXFlowDocument, UXFlowNode, UXFlowEdge } from '@/types/uxflow';

interface FlowStore {
  currentFlow: UXFlowDocument | null;
  selectedNodes: string[];
  selectedEdges: string[];
  isPinned: (nodeId: string) => boolean;
  pinnedNodes: Set<string>;
  
  loadFlow: (flowId: string) => Promise<void>;
  saveFlow: (flowId: string) => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  addNode: (type: string, position: { x: number; y: number }) => UXFlowNode;
  deleteNode: (nodeId: string) => void;
  pinNode: (nodeId: string) => void;
  unpinNode: (nodeId: string) => void;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  currentFlow: null,
  selectedNodes: [],
  selectedEdges: [],
  pinnedNodes: new Set(),
  
  isPinned: (nodeId: string) => get().pinnedNodes.has(nodeId),
  
  loadFlow: async (flowId: string) => {
    // Mock implementation - replace with API call
    console.log('Loading flow:', flowId);
  },
  
  saveFlow: async (flowId: string) => {
    // Mock implementation - replace with API call
    console.log('Saving flow:', flowId);
  },
  
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => {
    set((state) => {
      if (!state.currentFlow) return state;
      
      return {
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.map(node =>
            node.id === nodeId ? { ...node, position } : node
          )
        }
      };
    });
  },
  
  updateNodeData: (nodeId: string, data: any) => {
    set((state) => {
      if (!state.currentFlow) return state;
      
      return {
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.map(node =>
            node.id === nodeId ? { ...node, ...data } : node
          )
        }
      };
    });
  },
  
  addNode: (type: string, position: { x: number; y: number }) => {
    const newNode: UXFlowNode = {
      id: `node-${Date.now()}`,
      type: type as any,
      title: `New ${type}`,
      position,
      size: { width: 180, height: 80 }
    };
    
    set((state) => {
      if (!state.currentFlow) return state;
      
      return {
        currentFlow: {
          ...state.currentFlow,
          nodes: [...state.currentFlow.nodes, newNode]
        }
      };
    });
    
    return newNode;
  },
  
  deleteNode: (nodeId: string) => {
    set((state) => {
      if (!state.currentFlow) return state;
      
      return {
        currentFlow: {
          ...state.currentFlow,
          nodes: state.currentFlow.nodes.filter(node => node.id !== nodeId),
          edges: state.currentFlow.edges.filter(
            edge => edge.source !== nodeId && edge.target !== nodeId
          )
        }
      };
    });
  },
  
  pinNode: (nodeId: string) => {
    set((state) => {
      const newPinned = new Set(state.pinnedNodes);
      newPinned.add(nodeId);
      return { pinnedNodes: newPinned };
    });
  },
  
  unpinNode: (nodeId: string) => {
    set((state) => {
      const newPinned = new Set(state.pinnedNodes);
      newPinned.delete(nodeId);
      return { pinnedNodes: newPinned };
    });
  }
}));