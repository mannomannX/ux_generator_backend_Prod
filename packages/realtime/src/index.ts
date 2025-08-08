import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';
import debounce from 'lodash.debounce';
import throttle from 'lodash.throttle';

export interface RealtimeConfig {
  url: string;
  auth?: {
    token?: string;
    workspaceId?: string;
  };
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  debounceDelays?: {
    cursorPosition?: number;
    nodePosition?: number;
    textEdit?: number;
    bulkOperation?: number;
  };
}

export interface UpdateBatch {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

export class RealtimeClient extends EventEmitter {
  private socket: Socket | null = null;
  private config: RealtimeConfig;
  private updateQueue: UpdateBatch[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  
  // Debounced/throttled functions
  private debouncedCursorUpdate: ReturnType<typeof throttle>;
  private debouncedNodePositionUpdate: ReturnType<typeof debounce>;
  private debouncedTextUpdate: ReturnType<typeof debounce>;
  private batchedUpdates: ReturnType<typeof debounce>;

  constructor(config: RealtimeConfig) {
    super();
    this.config = {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      debounceDelays: {
        cursorPosition: 50,
        nodePosition: 100,
        textEdit: 500,
        bulkOperation: 0,
      },
      ...config,
    };

    // Initialize debounced functions
    this.debouncedCursorUpdate = throttle(
      this.sendCursorPosition.bind(this),
      this.config.debounceDelays!.cursorPosition!
    );
    
    this.debouncedNodePositionUpdate = debounce(
      this.sendNodePosition.bind(this),
      this.config.debounceDelays!.nodePosition!
    );
    
    this.debouncedTextUpdate = debounce(
      this.sendTextUpdate.bind(this),
      this.config.debounceDelays!.textEdit!
    );
    
    this.batchedUpdates = debounce(
      this.flushUpdateQueue.bind(this),
      100
    );
  }

  connect(): void {
    if (this.socket?.connected) {
      console.warn('Already connected to realtime server');
      return;
    }

    this.socket = io(this.config.url, {
      auth: this.config.auth,
      reconnection: this.config.reconnection,
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      transports: ['websocket'],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
      console.log('Connected to realtime server');
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.emit('disconnected', reason);
      console.log('Disconnected from realtime server:', reason);
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
      console.error('Realtime connection error:', error);
    });

    // Flow updates
    this.socket.on('flow:update', (data) => {
      this.emit('flow:update', data);
    });

    this.socket.on('flow:node:added', (data) => {
      this.emit('flow:node:added', data);
    });

    this.socket.on('flow:node:updated', (data) => {
      this.emit('flow:node:updated', data);
    });

    this.socket.on('flow:node:deleted', (data) => {
      this.emit('flow:node:deleted', data);
    });

    this.socket.on('flow:edge:added', (data) => {
      this.emit('flow:edge:added', data);
    });

    this.socket.on('flow:edge:deleted', (data) => {
      this.emit('flow:edge:deleted', data);
    });

    // Collaboration events
    this.socket.on('user:joined', (data) => {
      this.emit('user:joined', data);
    });

    this.socket.on('user:left', (data) => {
      this.emit('user:left', data);
    });

    this.socket.on('user:cursor', (data) => {
      this.emit('user:cursor', data);
    });

    this.socket.on('user:selection', (data) => {
      this.emit('user:selection', data);
    });

    // AI events
    this.socket.on('ai:proposal', (data) => {
      this.emit('ai:proposal', data);
    });

    this.socket.on('ai:processing', (data) => {
      this.emit('ai:processing', data);
    });

    // Conflict resolution
    this.socket.on('conflict:detected', (data) => {
      this.emit('conflict:detected', data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  joinFlow(flowId: string): void {
    if (!this.socket?.connected) {
      console.error('Not connected to realtime server');
      return;
    }
    this.socket.emit('flow:join', { flowId });
  }

  leaveFlow(flowId: string): void {
    if (!this.socket?.connected) {
      console.error('Not connected to realtime server');
      return;
    }
    this.socket.emit('flow:leave', { flowId });
  }

  // Cursor updates (throttled)
  updateCursor(position: { x: number; y: number }): void {
    this.debouncedCursorUpdate(position);
  }

  private sendCursorPosition(position: { x: number; y: number }): void {
    if (!this.socket?.connected) return;
    this.socket.emit('user:cursor:update', position);
  }

  // Node position updates (debounced)
  updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    this.debouncedNodePositionUpdate(nodeId, position);
  }

  private sendNodePosition(nodeId: string, position: { x: number; y: number }): void {
    this.queueUpdate({
      id: nodeId,
      type: 'node:position',
      data: { position },
      timestamp: Date.now(),
    });
  }

  // Text updates (debounced)
  updateNodeText(nodeId: string, text: string): void {
    this.debouncedTextUpdate(nodeId, text);
  }

  private sendTextUpdate(nodeId: string, text: string): void {
    this.queueUpdate({
      id: nodeId,
      type: 'node:text',
      data: { text },
      timestamp: Date.now(),
    });
  }

  // Immediate updates (no debouncing)
  addNode(node: any): void {
    this.sendImmediate('flow:node:add', node);
  }

  deleteNode(nodeId: string): void {
    this.sendImmediate('flow:node:delete', { nodeId });
  }

  addEdge(edge: any): void {
    this.sendImmediate('flow:edge:add', edge);
  }

  deleteEdge(edgeId: string): void {
    this.sendImmediate('flow:edge:delete', { edgeId });
  }

  // Batch update system
  private queueUpdate(update: UpdateBatch): void {
    // Remove any existing update for the same ID and type
    this.updateQueue = this.updateQueue.filter(
      (u) => !(u.id === update.id && u.type === update.type)
    );
    
    this.updateQueue.push(update);
    this.batchedUpdates();
  }

  private flushUpdateQueue(): void {
    if (this.updateQueue.length === 0) return;
    if (!this.socket?.connected) {
      console.warn('Cannot flush updates: not connected');
      return;
    }

    const updates = [...this.updateQueue];
    this.updateQueue = [];

    // Group updates by type for efficient processing
    const groupedUpdates = updates.reduce((acc, update) => {
      if (!acc[update.type]) {
        acc[update.type] = [];
      }
      acc[update.type].push(update);
      return acc;
    }, {} as Record<string, UpdateBatch[]>);

    this.socket.emit('flow:batch:update', {
      updates: groupedUpdates,
      timestamp: Date.now(),
    });
  }

  private sendImmediate(event: string, data: any): void {
    if (!this.socket?.connected) {
      console.error('Cannot send update: not connected');
      return;
    }
    this.socket.emit(event, data);
  }

  // Selection management
  updateSelection(selectedIds: string[]): void {
    if (!this.socket?.connected) return;
    this.socket.emit('user:selection:update', { selectedIds });
  }

  // AI interaction
  requestAIProposal(prompt: string, context: any): void {
    if (!this.socket?.connected) return;
    this.socket.emit('ai:request', { prompt, context });
  }

  acceptAIProposal(proposalId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('ai:accept', { proposalId });
  }

  rejectAIProposal(proposalId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('ai:reject', { proposalId });
  }

  // Conflict resolution
  resolveConflict(conflictId: string, resolution: 'mine' | 'theirs' | 'merge'): void {
    if (!this.socket?.connected) return;
    this.socket.emit('conflict:resolve', { conflictId, resolution });
  }

  // Utility methods
  isConnected(): boolean {
    return this.connected;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Cleanup
  destroy(): void {
    this.debouncedCursorUpdate.cancel();
    this.debouncedNodePositionUpdate.cancel();
    this.debouncedTextUpdate.cancel();
    this.batchedUpdates.cancel();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    this.disconnect();
    this.removeAllListeners();
  }
}

// Export convenience factory function
export function createRealtimeClient(config: RealtimeConfig): RealtimeClient {
  return new RealtimeClient(config);
}

// Export types
export type { Socket } from 'socket.io-client';