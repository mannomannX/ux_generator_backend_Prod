import { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  BackgroundVariant,
  getIncomers,
  getOutgoers,
  getConnectedEdges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { EnhancedScreenNode } from '@/components/nodes/EnhancedScreenNode';
import { DecisionNode } from '@/components/nodes/DecisionNode';
import { ConditionNode } from '@/components/nodes/ConditionNode';
import { ActionNode } from '@/components/nodes/ActionNode';
import { NoteNode } from '@/components/nodes/NoteNode';
import { SubFlowNode } from '@/components/nodes/SubFlowNode';
import { StartNode } from '@/components/nodes/StartNode';
import { EndNode } from '@/components/nodes/EndNode';
import { FrameNode } from '@/components/nodes/FrameNode';
import { CustomEdge } from '@/components/edges/CustomEdge';
import { UXFlowDocument, UXFlowNode, UXFlowEdge } from '@/types/uxflow';

const nodeTypes = {
  screen: EnhancedScreenNode,
  decision: DecisionNode,
  condition: ConditionNode,
  action: ActionNode,
  note: NoteNode,
  subflow: SubFlowNode,
  start: StartNode,
  end: EndNode,
  frame: FrameNode,
};

const edgeTypes = {
  custom: CustomEdge,
  smoothstep: CustomEdge,
  straight: CustomEdge,
  step: CustomEdge,
  bezier: CustomEdge,
};

interface FlowCanvasProps {
  document: UXFlowDocument;
  ghostNodes?: UXFlowNode[];
  ghostEdges?: UXFlowEdge[];
  onNodesChange?: (nodes: UXFlowNode[]) => void;
  onEdgesChange?: (edges: UXFlowEdge[]) => void;
  onNodeDoubleClick?: (node: UXFlowNode) => void;
  onPaneClick?: () => void;
  onPaneContextMenu?: (event: React.MouseEvent) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  selectedPersonaFilter?: string;
  selectedResponsiveFilter?: 'desktop' | 'mobile' | 'tablet';
  isPresentMode?: boolean;
}

export function FlowCanvas({
  document,
  ghostNodes = [],
  ghostEdges = [],
  onNodesChange: onNodesChangeCallback,
  onEdgesChange: onEdgesChangeCallback,
  onNodeDoubleClick,
  onPaneClick,
  onPaneContextMenu,
  onNodeContextMenu,
  selectedPersonaFilter,
  selectedResponsiveFilter,
  isPresentMode = false
}: FlowCanvasProps) {
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setActiveEdgeId(null);
  }, []);

  const handleEdgeLabelChange = useCallback((edgeId: string, label: string) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id === edgeId) {
        return {
          ...e,
          label,
          data: {
            ...e.data,
            label
          }
        };
      }
      return e;
    }));
  }, []);

  const handleEdgeTypeChange = useCallback((edgeId: string, type: string) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id === edgeId) {
        return {
          ...e,
          data: {
            ...e.data,
            edgeType: type
          }
        };
      }
      return e;
    }));
  }, []);

  const convertToReactFlowFormat = useCallback((doc: UXFlowDocument) => {
    const rfNodes: Node[] = doc.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
      draggable: !isPresentMode && !node.isGhost,
      selectable: !isPresentMode,
      style: {
        width: node.size?.width,
        height: node.size?.height,
        ...node.style
      }
    }));

    const ghostRfNodes: Node[] = ghostNodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { ...node, isGhost: true },
      draggable: !isPresentMode,
      selectable: !isPresentMode,
      style: {
        width: node.size?.width,
        height: node.size?.height,
        opacity: 0.5,
        ...node.style
      }
    }));

    const rfEdges: Edge[] = doc.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
      type: 'custom',
      animated: edge.animated,
      style: edge.style,
      data: {
        edgeType: edge.type || 'smoothstep',
        label: edge.label,
        onDelete: () => handleDeleteEdge(edge.id),
        onLabelChange: (label: string) => handleEdgeLabelChange(edge.id, label),
        onEdgeTypeChange: (type: string) => handleEdgeTypeChange(edge.id, type),
        activeEdgeId,
        setActiveEdgeId
      }
    }));

    const ghostRfEdges: Edge[] = ghostEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
      type: 'custom',
      animated: true,
      style: {
        ...edge.style,
        strokeDasharray: '5 5',
        opacity: 0.5
      },
      data: {
        edgeType: edge.type || 'smoothstep',
        label: edge.label,
        onDelete: () => handleDeleteEdge(edge.id),
        onLabelChange: (label: string) => handleEdgeLabelChange(edge.id, label),
        onEdgeTypeChange: (type: string) => handleEdgeTypeChange(edge.id, type),
        activeEdgeId,
        setActiveEdgeId
      }
    }));

    return {
      nodes: [...rfNodes, ...ghostRfNodes],
      edges: [...rfEdges, ...ghostRfEdges]
    };
  }, [ghostNodes, ghostEdges, isPresentMode, handleDeleteEdge, handleEdgeLabelChange, handleEdgeTypeChange, activeEdgeId]);

  const filteredNodesAndEdges = useMemo(() => {
    let filteredNodes = nodes;
    let filteredEdges = edges;

    if (selectedPersonaFilter) {
      filteredNodes = nodes.filter(node => 
        !node.data.personaIds || 
        node.data.personaIds.length === 0 ||
        node.data.personaIds.includes(selectedPersonaFilter)
      );
      
      const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = edges.filter(edge => 
        filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
      );
    }

    if (selectedResponsiveFilter) {
      filteredNodes = filteredNodes.map(node => {
        if (node.type === 'screen' && node.data.uiMetadata?.responsiveVersion !== selectedResponsiveFilter) {
          return {
            ...node,
            style: {
              ...node.style,
              opacity: 0.3
            }
          };
        }
        return node;
      });
    }

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [nodes, edges, selectedPersonaFilter, selectedResponsiveFilter]);

  useEffect(() => {
    const { nodes: rfNodes, edges: rfEdges } = convertToReactFlowFormat(document);
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [document, convertToReactFlowFormat]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds);
      
      if (onNodesChangeCallback) {
        const uxFlowNodes = updatedNodes
          .filter(n => !n.data.isGhost)
          .map(n => ({
            ...n.data,
            position: n.position
          }));
        onNodesChangeCallback(uxFlowNodes);
      }
      
      return updatedNodes;
    });
  }, [onNodesChangeCallback]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      const updatedEdges = applyEdgeChanges(changes, eds);
      
      if (onEdgesChangeCallback) {
        const uxFlowEdges = updatedEdges
          .filter(e => !e.style?.opacity || e.style.opacity === 1)
          .map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: e.label || e.data?.label,
            type: e.data?.edgeType || 'smoothstep',
            style: e.style,
            animated: e.animated
          }));
        onEdgesChangeCallback(uxFlowEdges);
      }
      
      return updatedEdges;
    });
  }, [onEdgesChangeCallback]);

  const onConnect = useCallback((connection: Connection) => {
    if (isPresentMode) return;
    
    const newEdgeId = `edge-${connection.source}-${connection.target}-${Date.now()}`;
    setEdges((eds) => addEdge({
      ...connection,
      id: newEdgeId,
      type: 'custom',
      animated: false,
      data: {
        edgeType: 'smoothstep',
        label: '',
        onDelete: () => handleDeleteEdge(newEdgeId),
        onLabelChange: (label: string) => handleEdgeLabelChange(newEdgeId, label),
        onEdgeTypeChange: (type: string) => handleEdgeTypeChange(newEdgeId, type),
        activeEdgeId,
        setActiveEdgeId
      }
    }, eds));
  }, [isPresentMode, handleDeleteEdge, handleEdgeLabelChange, handleEdgeTypeChange, activeEdgeId]);

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodes(nodes.map(n => n.id));
  }, []);

  const handleNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onNodeDoubleClick && !isPresentMode) {
      onNodeDoubleClick(node.data);
    }
  }, [onNodeDoubleClick, isPresentMode]);

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    if (document.metadata.globalSettings?.snapToGrid) {
      const gridSize = document.metadata.globalSettings.gridSize || 20;
      const snappedPosition = {
        x: Math.round(node.position.x / gridSize) * gridSize,
        y: Math.round(node.position.y / gridSize) * gridSize
      };
      
      setNodes((nds) => nds.map((n) => {
        if (n.id === node.id) {
          return {
            ...n,
            position: snappedPosition
          };
        }
        return n;
      }));
    }
  }, [document.metadata.globalSettings]);

  const nodeColor = useCallback((node: Node) => {
    if (node.data.isGhost) return '#E0E7FF';
    
    switch (node.type) {
      case 'start': return '#10B981';
      case 'end': return '#EF4444';
      case 'screen': return '#F3F4F6';
      case 'decision': return '#FEF3C7';
      case 'condition': return '#FEF3C7';
      case 'action': return '#EDE9FE';
      case 'note': return '#FEF3C7';
      case 'subflow': return '#E0E7FF';
      default: return '#F3F4F6';
    }
  }, []);

  return (
    <ReactFlow
      nodes={filteredNodesAndEdges.nodes}
      edges={filteredNodesAndEdges.edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={onSelectionChange}
      onNodeDoubleClick={handleNodeDoubleClick}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
      onNodeContextMenu={onNodeContextMenu}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      snapToGrid={document.metadata.globalSettings?.snapToGrid}
      snapGrid={[
        document.metadata.globalSettings?.gridSize || 20,
        document.metadata.globalSettings?.gridSize || 20
      ]}
      defaultEdgeOptions={{
        type: 'custom',
        animated: false,
        style: {
          strokeWidth: 2
        },
        data: {
          edgeType: 'smoothstep',
          onDelete: () => {},
          onLabelChange: () => {},
          onEdgeTypeChange: () => {},
          activeEdgeId,
          setActiveEdgeId
        }
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background 
        variant={BackgroundVariant.Dots}
        gap={document.metadata.globalSettings?.gridSize || 20}
        size={1}
        color="#e5e7eb"
      />
      
      {!isPresentMode && document.metadata.globalSettings?.showControls !== false && (
        <Controls />
      )}
      
      {document.metadata.globalSettings?.showMinimap !== false && (
        <MiniMap 
          nodeColor={nodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      )}
      
      {!isPresentMode && (
        <Panel position="top-left" className="bg-white p-2 rounded-lg shadow-md">
          <div className="text-sm font-semibold">{document.metadata.flowName}</div>
          <div className="text-xs text-gray-500">v{document.metadata.version}</div>
        </Panel>
      )}
    </ReactFlow>
  );
}