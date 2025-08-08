import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import debounce from 'lodash.debounce';
import throttle from 'lodash.throttle';
import { toast } from 'sonner';
import { useFlowStore } from '@/store/flow';
import { useRealtimeStore } from '@/store/realtime';
import { useAIStore } from '@/store/ai';
import { Sidebar } from '@/components/editor/Sidebar';
import { Toolbar } from '@/components/editor/Toolbar';
import { NodePanel } from '@/components/editor/NodePanel';
import { GhostNodes } from '@/components/editor/GhostNodes';
import { CollaborationCursors } from '@/components/editor/CollaborationCursors';
import { AIChat } from '@/components/editor/AIChat';
import { ScreenNode } from '@/components/nodes/ScreenNode';
import { DecisionNode } from '@/components/nodes/DecisionNode';
import { ActionNode } from '@/components/nodes/ActionNode';
import { NoteNode } from '@/components/nodes/NoteNode';
import { SubFlowNode } from '@/components/nodes/SubFlowNode';
import { StartNode } from '@/components/nodes/StartNode';
import { EndNode } from '@/components/nodes/EndNode';

const nodeTypes = {
  screen: ScreenNode,
  decision: DecisionNode,
  action: ActionNode,
  note: NoteNode,
  subflow: SubFlowNode,
  start: StartNode,
  end: EndNode,
};

// Debounce configuration for different update types
const DEBOUNCE_DELAYS = {
  nodePosition: 100,    // Node dragging
  textEditing: 500,     // Text changes
  bulkOperations: 0,    // Add/delete nodes (immediate)
  autoSave: 5000,       // Background auto-save
};

function FlowEditor() {
  const { flowId } = useParams<{ flowId: string }>();
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  
  const {
    currentFlow,
    loadFlow,
    saveFlow,
    updateNodePosition,
    updateNodeData,
    addNode: addFlowNode,
    deleteNode: deleteFlowNode,
    isPinned,
  } = useFlowStore();
  
  const {
    connect,
    disconnect,
    sendCursorPosition,
    sendNodeUpdate,
    collaborators,
    isConnected,
  } = useRealtimeStore();
  
  const {
    ghostNodes,
    ghostEdges,
    showGhostMode,
    applyGhostProposal,
    rejectGhostProposal,
  } = useAIStore();

  // Load flow on mount
  useEffect(() => {
    if (flowId) {
      loadFlow(flowId);
      connect(flowId);
    }
    return () => {
      disconnect();
    };
  }, [flowId]);

  // Sync flow state with React Flow
  useEffect(() => {
    if (currentFlow) {
      setNodes(currentFlow.nodes || []);
      setEdges(currentFlow.edges || []);
    }
  }, [currentFlow]);

  // Debounced position update
  const debouncedPositionUpdate = useCallback(
    debounce((nodeId: string, position: { x: number; y: number }) => {
      if (!isPinned(nodeId)) {
        updateNodePosition(nodeId, position);
        sendNodeUpdate({
          type: 'UPDATE_NODE_POSITION',
          nodeId,
          position,
        });
      }
    }, DEBOUNCE_DELAYS.nodePosition),
    [isPinned, updateNodePosition, sendNodeUpdate]
  );

  // Debounced text update
  const debouncedTextUpdate = useCallback(
    debounce((nodeId: string, data: any) => {
      updateNodeData(nodeId, data);
      sendNodeUpdate({
        type: 'UPDATE_NODE_DATA',
        nodeId,
        data,
      });
    }, DEBOUNCE_DELAYS.textEditing),
    [updateNodeData, sendNodeUpdate]
  );

  // Auto-save
  const autoSave = useCallback(
    debounce(() => {
      if (currentFlow && flowId) {
        saveFlow(flowId).then(() => {
          toast.success('Flow auto-saved');
        }).catch((error) => {
          toast.error('Failed to auto-save flow');
          console.error(error);
        });
      }
    }, DEBOUNCE_DELAYS.autoSave),
    [currentFlow, flowId, saveFlow]
  );

  // Throttled cursor position updates
  const throttledCursorUpdate = useCallback(
    throttle((position: { x: number; y: number }) => {
      sendCursorPosition(position);
    }, 50),
    [sendCursorPosition]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      
      // Handle position changes with debouncing
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && change.dragging === false) {
          debouncedPositionUpdate(change.id, change.position);
        }
      });
      
      // Trigger auto-save
      autoSave();
    },
    [debouncedPositionUpdate, autoSave]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      autoSave();
    },
    [autoSave]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      sendNodeUpdate({
        type: 'ADD_EDGE',
        edge: connection,
      });
      autoSave();
    },
    [sendNodeUpdate, autoSave]
  );

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Open node editor panel
      setSelectedNodes([node.id]);
    },
    []
  );

  const onPaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      throttledCursorUpdate(position);
    },
    [throttledCursorUpdate]
  );

  const handleAddNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const newNode = addFlowNode(type, position);
      sendNodeUpdate({
        type: 'ADD_NODE',
        node: newNode,
      });
      // Immediate save for structural changes
      saveFlow(flowId!);
    },
    [addFlowNode, sendNodeUpdate, saveFlow, flowId]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteFlowNode(nodeId);
      sendNodeUpdate({
        type: 'DELETE_NODE',
        nodeId,
      });
      // Immediate save for structural changes
      saveFlow(flowId!);
    },
    [deleteFlowNode, sendNodeUpdate, saveFlow, flowId]
  );

  const handleApplyGhostProposal = useCallback(() => {
    applyGhostProposal();
    toast.success('AI proposal applied');
    saveFlow(flowId!);
  }, [applyGhostProposal, saveFlow, flowId]);

  const handleRejectGhostProposal = useCallback(() => {
    rejectGhostProposal();
    toast.info('AI proposal rejected');
  }, [rejectGhostProposal]);

  return (
    <div className="h-screen flex">
      <Sidebar 
        onAddNode={handleAddNode}
        selectedNodes={selectedNodes}
        onUpdateNodeData={debouncedTextUpdate}
      />
      
      <div className="flex-1 relative">
        <Toolbar 
          onSave={() => saveFlow(flowId!)}
          onExport={() => {/* TODO */}}
          onToggleGhostMode={() => {/* TODO */}}
        />
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneMouseMove={onPaneMouseMove}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant="dots" gap={20} size={1} />
          <Controls />
          <MiniMap />
          
          {/* Ghost nodes overlay */}
          {showGhostMode && (
            <GhostNodes 
              nodes={ghostNodes}
              edges={ghostEdges}
              onApply={handleApplyGhostProposal}
              onReject={handleRejectGhostProposal}
            />
          )}
          
          {/* Collaboration cursors */}
          {isConnected && (
            <CollaborationCursors collaborators={collaborators} />
          )}
        </ReactFlow>
        
        {/* Node editor panel */}
        {selectedNodes.length > 0 && (
          <NodePanel
            nodeId={selectedNodes[0]}
            onClose={() => setSelectedNodes([])}
            onUpdate={debouncedTextUpdate}
            onDelete={handleDeleteNode}
          />
        )}
      </div>
      
      {/* AI Chat sidebar */}
      <AIChat flowId={flowId!} />
    </div>
  );
}

export function EditorPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}