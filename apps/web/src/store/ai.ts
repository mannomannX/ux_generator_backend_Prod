import { create } from 'zustand';
import { UXFlowNode, UXFlowEdge } from '@/types/uxflow';

interface AIStore {
  ghostNodes: UXFlowNode[];
  ghostEdges: UXFlowEdge[];
  showGhostMode: boolean;
  
  setGhostProposal: (nodes: UXFlowNode[], edges: UXFlowEdge[]) => void;
  applyGhostProposal: () => void;
  rejectGhostProposal: () => void;
  toggleGhostMode: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  ghostNodes: [],
  ghostEdges: [],
  showGhostMode: false,
  
  setGhostProposal: (nodes: UXFlowNode[], edges: UXFlowEdge[]) => {
    set({ ghostNodes: nodes, ghostEdges: edges, showGhostMode: true });
  },
  
  applyGhostProposal: () => {
    // In a real implementation, this would merge ghost nodes into the main flow
    set({ ghostNodes: [], ghostEdges: [], showGhostMode: false });
  },
  
  rejectGhostProposal: () => {
    set({ ghostNodes: [], ghostEdges: [], showGhostMode: false });
  },
  
  toggleGhostMode: () => {
    set((state) => ({ showGhostMode: !state.showGhostMode }));
  }
}));