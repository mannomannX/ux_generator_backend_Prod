import { create } from 'zustand';
import { CollaboratorCursor } from '@/types/uxflow';

interface RealtimeStore {
  isConnected: boolean;
  collaborators: CollaboratorCursor[];
  
  connect: (flowId: string) => void;
  disconnect: () => void;
  sendCursorPosition: (position: { x: number; y: number }) => void;
  sendNodeUpdate: (update: any) => void;
}

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  isConnected: false,
  collaborators: [],
  
  connect: (flowId: string) => {
    console.log('Connecting to realtime:', flowId);
    set({ isConnected: true });
  },
  
  disconnect: () => {
    console.log('Disconnecting from realtime');
    set({ isConnected: false, collaborators: [] });
  },
  
  sendCursorPosition: (position: { x: number; y: number }) => {
    // Mock implementation
    console.log('Cursor position:', position);
  },
  
  sendNodeUpdate: (update: any) => {
    // Mock implementation
    console.log('Node update:', update);
  }
}));