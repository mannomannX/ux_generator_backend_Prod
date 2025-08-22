import { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Controls,
  Background,
  MiniMap,
  Panel,
  BackgroundVariant,
  useReactFlow,
  Node,
  Edge,
  Connection,
  ConnectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  applyEdgeChanges,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Search,
  Plus,
  Save,
  Play,
  Layers,
  ChevronLeft,
  ChevronRight,
  Home,
  Share2,
  Square,
  GitBranch,
  Activity,
  StickyNote,
  FolderOpen,
  PlayCircle,
  StopCircle,
  Box,
  X,
  Trash2,
  Edit3,
  Copy,
  MessageSquare,
  Lock,
  Unlock,
  Settings,
  Check,
  Shuffle,
  ArrowRight,
  ArrowDown,
  Layout,
  Figma,
  Monitor,
  Smartphone,
  Tablet,
  Clock,
  CheckCircle,
  Circle,
  AlertCircle,
  Hash,
  Type,
  FileText,
  Palette,
  ExternalLink
} from 'lucide-react';
import { completeExampleFlow } from '@/mocks/completeFlowExample';
import { autoLayout, smartLayout, compactLayout } from '@/utils/autoLayoutOptimized';
import { treeLayoutFixed } from '@/utils/treeLayoutFixed';
import { testAllLayouts } from '@/utils/testLayouts';
import { analyzeHandleUsage, getBestHandle } from '@/utils/handleManager';
// Removed smart edge routing imports that were causing edges to disappear
import { EnhancedScreenNode } from '@/components/nodes/EnhancedScreenNode';
import { ScreenNode } from '@/components/nodes/ScreenNode';
import { DecisionNode } from '@/components/nodes/DecisionNode';
import { ConditionNode } from '@/components/nodes/ConditionNode';
import { ActionNode } from '@/components/nodes/ActionNode';
import { NoteNode } from '@/components/nodes/NoteNode';
import { SubFlowNode } from '@/components/nodes/SubFlowNode';
import { StartNode } from '@/components/nodes/StartNode';
import { EndNode } from '@/components/nodes/EndNode';
import { FrameNode } from '@/components/nodes/FrameNode';
import { EnhancedCustomEdge } from '@/components/edges/EnhancedCustomEdge';
import { ConnectionLine } from '@/components/edges/ConnectionLine';
import { AlignmentGuides } from '@/components/canvas/AlignmentGuides';
import { useAlignmentGuides } from '@/hooks/useAlignmentGuides';

const nodeTypes = {
  screen: ScreenNode,
  'enhanced-screen': EnhancedScreenNode,
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
  custom: EnhancedCustomEdge,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: {
    strokeWidth: 2,
    stroke: '#94a3b8',
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#94a3b8',
  },
};

// Node type definitions for adding new nodes
const nodeTypeDefinitions = [
  { 
    category: 'Flow Control',
    items: [
      { type: 'start', label: 'Start', icon: PlayCircle, color: 'bg-green-100 border-green-400', description: 'Entry point of the flow' },
      { type: 'end', label: 'End', icon: StopCircle, color: 'bg-red-100 border-red-400', description: 'Exit point of the flow' },
    ]
  },
  {
    category: 'Screens & Pages',
    items: [
      { type: 'screen', label: 'Screen', icon: Square, color: 'bg-blue-100 border-blue-400', description: 'UI screen or page' },
      { type: 'enhanced-screen', label: 'Enhanced Screen', icon: Layers, color: 'bg-indigo-100 border-indigo-400', description: 'Screen with advanced properties' },
      { type: 'frame', label: 'Frame', icon: Box, color: 'bg-gray-100 border-gray-400', description: 'Container for grouping nodes' },
    ]
  },
  {
    category: 'Logic & Actions',
    items: [
      { type: 'decision', label: 'Decision', icon: GitBranch, color: 'bg-yellow-100 border-yellow-400', description: 'User or system decision point' },
      { type: 'condition', label: 'Condition', icon: Activity, color: 'bg-orange-100 border-orange-400', description: 'Conditional logic based on data' },
      { type: 'action', label: 'Action', icon: Activity, color: 'bg-purple-100 border-purple-400', description: 'System action or API call' },
      { type: 'subflow', label: 'SubFlow', icon: FolderOpen, color: 'bg-emerald-100 border-emerald-400', description: 'Link to another flow' },
    ]
  },
  {
    category: 'Documentation',
    items: [
      { type: 'note', label: 'Note', icon: StickyNote, color: 'bg-amber-100 border-amber-400', description: 'Add comments and documentation' },
    ]
  }
];

// Comment interface
interface Comment {
  id: string;
  nodeId: string;
  text: string;
  author: string;
  timestamp: string;
  resolved: boolean;
}

// Helper function to sort nodes with frames in background
const sortNodesWithFramesInBackground = (nodes: Node[]) => {
  return [...nodes].sort((a, b) => {
    if (a.type === 'frame' && b.type !== 'frame') return -1;
    if (a.type !== 'frame' && b.type === 'frame') return 1;
    return 0;
  });
};

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, zoomIn, zoomOut, zoomTo, getViewport, getZoom } = useReactFlow();
  const [nodes, setNodesBase, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  
  // Wrap setNodes to always sort with frames in background
  const setNodes = useCallback((nodesOrUpdater: Node[] | ((nodes: Node[]) => Node[])) => {
    if (typeof nodesOrUpdater === 'function') {
      setNodesBase(currentNodes => {
        const updatedNodes = nodesOrUpdater(currentNodes);
        return sortNodesWithFramesInBackground(updatedNodes);
      });
    } else {
      setNodesBase(sortNodesWithFramesInBackground(nodesOrUpdater));
    }
  }, [setNodesBase]);
  
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: Node | null } | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  
  // Store the connection start to track drag direction
  const connectionStartRef = useRef<{ nodeId: string | null; handleId: string | null; handleType: string | null }>({ 
    nodeId: null, 
    handleId: null, 
    handleType: null 
  });
  
  // Alignment guides hook
  const { guides, onNodeDragStart, onNodeDrag, onNodeDragStop, findAlignments } = useAlignmentGuides();

  // Delete edge
  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges(edges => edges.filter(e => e.id !== edgeId));
  }, [setEdges]);
  
  // Handle edge label change
  const handleEdgeLabelChange = useCallback((edgeId: string, label: string) => {
    setEdges(edges => edges.map(edge => 
      edge.id === edgeId 
        ? { ...edge, label } 
        : edge
    ));
  }, [setEdges]);
  
  // Handle edge type change
  const handleEdgeTypeChange = useCallback((edgeId: string, type: string) => {
    setEdges(edges => edges.map(edge => 
      edge.id === edgeId 
        ? { ...edge, data: { ...edge.data, edgeType: type } } 
        : edge
    ));
  }, [setEdges]);
  
  // Handle edge color change (also handles bidirectional toggle and line style)
  const handleEdgeColorChange = useCallback((edgeId: string, colorOrMode: string) => {
    setEdges((edges: Edge[]) => edges.map((edge): Edge => {
      if (edge.id === edgeId) {
        if (colorOrMode === 'bidirectional' || colorOrMode === 'unidirectional') {
          // Toggle bidirectional mode
          return {
            ...edge,
            data: {
              ...edge.data,
              bidirectional: colorOrMode === 'bidirectional'
            }
          } as Edge;
        } else if (colorOrMode === 'solid' || colorOrMode === 'dashed') {
          // Toggle line style (solid/dashed)
          return {
            ...edge,
            data: {
              ...edge.data,
              animated: colorOrMode === 'dashed'  // Use animated property for dashed style
            }
          } as Edge;
        } else {
          // Change color
          return {
            ...edge,
            style: {
              ...edge.style,
              stroke: colorOrMode
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: colorOrMode,
            },
            data: {
              ...edge.data,
              color: colorOrMode
            }
          } as Edge;
        }
      }
      return edge;
    }));
  }, [setEdges]);


  // Initialize with complete example flow
  useEffect(() => {
    // Run layout tests in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Running layout tests...');
      testAllLayouts();
    }
    
    const flowNodes: Node[] = completeExampleFlow.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
      selected: false,
      selectable: node.type !== 'frame', // Frame nodes not directly selectable
    }));

    const flowEdges: Edge[] = completeExampleFlow.edges.map(edge => ({
      ...edge,
      type: 'custom',
      style: {
        ...defaultEdgeOptions.style,
        ...edge.style,
      },
      markerEnd: edge.style?.stroke ? {
        ...defaultEdgeOptions.markerEnd,
        color: edge.style.stroke,
      } : defaultEdgeOptions.markerEnd,
      data: {
        color: edge.style?.stroke || '#94a3b8',
        bidirectional: false,
        edgeType: 'smoothstep'
      }
    }));

    // Sort nodes so frame nodes are rendered first (in the background)
    setNodes(sortNodesWithFramesInBackground(flowNodes));
    setEdges(flowEdges);

    // Fit view after loading
    setTimeout(() => fitView({ padding: 0.2 }), 100);
  }, [setNodes, setEdges, fitView]);
  
  // Update edge data with callbacks only when activeEdgeId changes
  useEffect(() => {
    setEdges(edges => edges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        onDelete: edge.data?.onDelete || (() => handleDeleteEdge(edge.id)),
        onLabelChange: edge.data?.onLabelChange || ((label: string) => handleEdgeLabelChange(edge.id, label)),
        onEdgeTypeChange: edge.data?.onEdgeTypeChange || ((type: string) => handleEdgeTypeChange(edge.id, type)),
        onColorChange: edge.data?.onColorChange || ((color: string) => handleEdgeColorChange(edge.id, color)),
        activeEdgeId,
        setActiveEdgeId,
        edgeType: edge.data?.edgeType || 'smoothstep',
        label: edge.data?.label || edge.label
      }
    })));
  }, [activeEdgeId, handleDeleteEdge, handleEdgeLabelChange, handleEdgeTypeChange, handleEdgeColorChange, setActiveEdgeId]); // Update when handlers or activeEdgeId change

  const onConnectionStart = useCallback(
    (event: any, { nodeId, handleId, handleType }: any) => {
      console.log('Connection started from:', { nodeId, handleId, handleType });
      connectionStartRef.current = { nodeId, handleId, handleType };
    },
    []
  );

  const onConnectionEnd = useCallback(() => {
    // Reset the connection start when connection ends
    connectionStartRef.current = { nodeId: null, handleId: null, handleType: null };
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      // Prevent self-loops
      if (params.source === params.target) {
        console.warn('Cannot create edge from node to itself');
        return;
      }
      
      // DEBUG: Check what React Flow gives us and what we tracked
      console.log('onConnect params:', {
        source: params.source,
        sourceHandle: params.sourceHandle,
        target: params.target,
        targetHandle: params.targetHandle
      });
      console.log('Connection started from:', connectionStartRef.current);
      
      const edgeId = `edge-${Date.now()}`;
      
      // EXPERIMENT: Da wir bidirektionale Handles haben, könnte React Flow
      // die Richtung anders interpretieren als erwartet.
      // Lass uns einfach IMMER source und target vertauschen
      let actualSource = params.target;  // Vertausche immer
      let actualTarget = params.source;  // Vertausche immer
      let actualSourceHandle = params.targetHandle;
      let actualTargetHandle = params.sourceHandle;
      
      console.log('ALWAYS swapping source/target:', {
        original: { source: params.source, target: params.target },
        swapped: { source: actualSource, target: actualTarget }
      });
      
      // Use the corrected handles
      const sourceHandle = actualSourceHandle;
      const targetHandle = actualTargetHandle;
      
      // Create the new edge - ensure arrow points in drag direction
      const newEdge = {
        ...params,
        ...defaultEdgeOptions,
        type: 'custom',
        id: edgeId,
        source: actualSource,  // Where we started dragging FROM (corrected)
        target: actualTarget,  // Where we dragged TO (corrected)
        sourceHandle,
        targetHandle,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8'
        },
        data: {
          onDelete: () => handleDeleteEdge(edgeId),
          onLabelChange: (label: string) => handleEdgeLabelChange(edgeId, label),
          onEdgeTypeChange: (type: string) => handleEdgeTypeChange(edgeId, type),
          onColorChange: (color: string) => handleEdgeColorChange(edgeId, color),
          activeEdgeId,
          setActiveEdgeId,
          edgeType: 'smoothstep',
          sourceHandle,
          targetHandle
        }
      };
      
      console.log('Creating edge with:', {
        source: newEdge.source,
        target: newEdge.target,
        markerEnd: 'at target'
      });
      
      // Direct add without smart routing (which was causing edges to disappear)
      setEdges((eds) => addEdge(newEdge, eds));
      
      // Reset connection start
      connectionStartRef.current = { nodeId: null, handleId: null, handleType: null };
    },
    [nodes, edges, setEdges, handleDeleteEdge, handleEdgeLabelChange, handleEdgeTypeChange, handleEdgeColorChange, activeEdgeId, setActiveEdgeId]
  );
  
  // Custom edge change handler that preserves edge data
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((currentEdges) => {
      // Apply changes
      let newEdges = applyEdgeChanges(changes, currentEdges);
      
      // Ensure all edges have their handlers
      newEdges = newEdges.map(edge => {
        // If edge already has complete data, just update activeEdgeId
        if (edge.data?.onDelete) {
          return {
            ...edge,
            data: {
              ...edge.data,
              activeEdgeId,
              setActiveEdgeId
            }
          };
        }
        
        // Otherwise, add all handlers
        return {
          ...edge,
          type: 'custom',
          data: {
            ...edge.data,
            onDelete: () => handleDeleteEdge(edge.id),
            onLabelChange: (label: string) => handleEdgeLabelChange(edge.id, label),
            onEdgeTypeChange: (type: string) => handleEdgeTypeChange(edge.id, type),
            onColorChange: (color: string) => handleEdgeColorChange(edge.id, color),
            activeEdgeId,
            setActiveEdgeId,
            edgeType: edge.data?.edgeType || 'smoothstep',
            label: edge.data?.label || edge.label || ''
          }
        };
      });
      
      return newEdges;
    });
  }, [handleDeleteEdge, handleEdgeLabelChange, handleEdgeTypeChange, handleEdgeColorChange, activeEdgeId, setActiveEdgeId, setEdges]);

  // Enhanced node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    
    // Don't select frame nodes directly unless clicked on border
    if (node.type === 'frame') {
      return;
    }
    
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Multi-select with Shift/Cmd/Ctrl
      setNodes(nds =>
        nds.map(n => {
          if (n.id === node.id) {
            // Toggle selection of clicked node
            return { ...n, selected: !n.selected };
          }
          // Keep other selections when shift is pressed
          return n;
        })
      );
      
      setSelectedNodes(prev => {
        const isSelected = prev.find(n => n.id === node.id);
        if (isSelected) {
          return prev.filter(n => n.id !== node.id);
        }
        return [...prev, node];
      });
    } else {
      // Single select - clear all other selections including edges
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          selected: n.id === node.id
        }))
      );
      
      // Deselect all edges when selecting a node
      setEdges(eds => eds.map(e => ({ ...e, selected: false })));
      
      setSelectedNodes([node]);
      setDetailsPanelOpen(true);
    }
  }, [setNodes, setEdges]);

  // Update selected nodes when nodes change
  useEffect(() => {
    if (selectedNodes.length > 0) {
      const updatedSelectedNodes = selectedNodes.map(selectedNode => {
        const currentNode = nodes.find(n => n.id === selectedNode.id);
        return currentNode || selectedNode;
      }).filter(Boolean);
      
      // Only update if there's an actual change
      const hasChanged = updatedSelectedNodes.some((node, index) => 
        node !== selectedNodes[index] || JSON.stringify(node.data) !== JSON.stringify(selectedNodes[index]?.data)
      );
      
      if (hasChanged) {
        setSelectedNodes(updatedSelectedNodes);
      }
    }
  }, [nodes]);

  // Context menu
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      node
    });
  }, []);

  // Close context menu and layout menu
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setShowLayoutMenu(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Delete selected nodes
  const deleteSelectedNodes = useCallback(() => {
    const nodesToDelete = selectedNodes.length > 0 ? selectedNodes : nodes.filter(n => n.selected);
    const nodeIds = nodesToDelete.map(n => n.id);
    
    setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
    setEdges(eds => eds.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
    setSelectedNodes([]);
    setDetailsPanelOpen(false);
  }, [selectedNodes, nodes, setNodes, setEdges]);

  // Copy node
  const copyNode = useCallback((node: Node) => {
    setCopiedNode(node);
  }, []);

  // Paste node
  const pasteNode = useCallback(() => {
    if (!copiedNode) return;
    
    const viewport = getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    
    const newNode: Node = {
      ...copiedNode,
      id: `${copiedNode.type}-${Date.now()}`,
      position: { 
        x: centerX, 
        y: centerY 
      },
      data: {
        ...copiedNode.data,
        title: `${copiedNode.data.title} (Copy)`
      },
      selected: false
    };
    
    setNodes(nds => sortNodesWithFramesInBackground([...nds, newNode]));
  }, [copiedNode, getViewport, setNodes]);

  // Duplicate node
  const duplicateNode = useCallback((node: Node) => {
    const newNode: Node = {
      ...node,
      id: `${node.type}-${Date.now()}`,
      position: { 
        x: node.position.x + 50, 
        y: node.position.y + 50 
      },
      data: {
        ...node.data,
        title: `${node.data.title} (Copy)`
      },
      selected: false
    };
    
    setNodes(nds => sortNodesWithFramesInBackground([...nds, newNode]));
  }, [setNodes]);

  // Start editing node title
  const startEditingNode = useCallback((node: Node) => {
    setEditingNode(node.id);
    setEditingTitle(node.data.title || '');
    setContextMenu(null);
  }, []);

  // Save node title
  const saveNodeTitle = useCallback(() => {
    if (editingNode) {
      setNodes(nds =>
        nds.map(n =>
          n.id === editingNode
            ? { ...n, data: { ...n.data, title: editingTitle } }
            : n
        )
      );
      setEditingNode(null);
      setEditingTitle('');
    }
  }, [editingNode, editingTitle, setNodes]);

  // Add comment to node
  const addComment = useCallback((nodeId: string) => {
    if (!newComment.trim()) return;
    
    const comment: Comment = {
      id: `comment-${Date.now()}`,
      nodeId,
      text: newComment,
      author: 'Current User',
      timestamp: new Date().toISOString(),
      resolved: false
    };
    
    setComments(prev => [...prev, comment]);
    setNewComment('');
  }, [newComment]);

  // Toggle comment resolution
  const toggleCommentResolved = useCallback((commentId: string) => {
    setComments(prev =>
      prev.map(c =>
        c.id === commentId ? { ...c, resolved: !c.resolved } : c
      )
    );
  }, []);

  // Layout functions - all are now frame-aware
  const applyAutoLayout = useCallback((type: 'smart' | 'tree' | 'compact' | 'horizontal' | 'vertical' = 'smart') => {
    let layoutResult: { nodes: Node[]; edges: Edge[] };
    
    switch(type) {
      case 'smart':
        layoutResult = smartLayout(nodes, edges);
        break;
      case 'tree':
        layoutResult = treeLayoutFixed(nodes, edges);
        break;
      case 'compact':
        layoutResult = compactLayout(nodes, edges);
        break;
      case 'horizontal':
        layoutResult = autoLayout(nodes, edges, { direction: 'LR' });
        break;
      case 'vertical':
        layoutResult = autoLayout(nodes, edges, { direction: 'TB' });
        break;
      default:
        layoutResult = smartLayout(nodes, edges);
    }
    
    // Apply optimized layout with smart handle assignments and maintain frame sorting
    setNodes(sortNodesWithFramesInBackground(layoutResult.nodes));
    
    // Update edges with optimized handles and preserve ALL existing edges
    setEdges(currentEdges => {
      console.log(`📊 Updating edges after ${type} layout`);
      console.log(`  Current edges: ${currentEdges.length}`);
      console.log(`  Layout edges: ${layoutResult.edges.length}`);
      
      // Update only the handle positions from layout, keep all edge data
      const updatedEdges = currentEdges.map(existingEdge => {
        const layoutEdge = layoutResult.edges.find(e => e.id === existingEdge.id);
        
        // Check if source and target nodes still exist
        const sourceExists = layoutResult.nodes.find(n => n.id === existingEdge.source);
        const targetExists = layoutResult.nodes.find(n => n.id === existingEdge.target);
        
        if (!sourceExists || !targetExists) {
          console.warn(`⚠️ Edge ${existingEdge.id} references missing nodes:`, {
            source: existingEdge.source,
            sourceExists: !!sourceExists,
            target: existingEdge.target,
            targetExists: !!targetExists
          });
        }
        
        if (layoutEdge) {
          console.log(`  Edge ${existingEdge.id}: ${existingEdge.source} -> ${existingEdge.target}`);
          console.log(`    Handles: ${layoutEdge.sourceHandle || 'default'} -> ${layoutEdge.targetHandle || 'default'}`);
          
          return {
            ...existingEdge,
            sourceHandle: layoutEdge.sourceHandle,
            targetHandle: layoutEdge.targetHandle,
            data: {
              ...existingEdge.data,
              sourceHandle: layoutEdge.sourceHandle,
              targetHandle: layoutEdge.targetHandle
            }
          };
        }
        // Keep edges that weren't in layout result unchanged
        console.log(`  Edge ${existingEdge.id} not in layout result, keeping unchanged`);
        return existingEdge;
      });
      
      console.log(`  Final edges: ${updatedEdges.length}`);
      return updatedEdges;
    });
    
    setTimeout(() => fitView({ padding: 0.1, duration: 800 }), 50);
    setShowLayoutMenu(false);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  // Add node functionality
  const handleAddNode = useCallback((type: string) => {
    const viewport = getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: centerX - 90, y: centerY - 40 },
      data: { 
        title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        type: type as any,
        description: type === 'note' ? 'Add your note here...' : `${type} description`,
        size: { width: 180, height: 80 },
        style: {
          backgroundColor: '#F3F4F6',
          borderColor: '#9CA3AF',
          borderWidth: 2,
          borderRadius: 8
        }
      },
    };

    setNodes((nds) => sortNodesWithFramesInBackground(nds.concat(newNode)));
    setShowAddNodeMenu(false);
  }, [getViewport, setNodes]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      
      if (!type || !reactFlowWrapper.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { 
          title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
          type: type as any,
          description: type === 'note' ? 'Add your note here...' : `${type} description`,
          size: { width: 180, height: 80 },
        },
      };

      setNodes((nds) => sortNodesWithFramesInBackground(nds.concat(newNode)));
    },
    [project, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing
      if (editingNode || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Saving flow...');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        if (selectedNodes.length === 1) {
          copyNode(selectedNodes[0]);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        pasteNode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedNodes.length === 1) {
          duplicateNode(selectedNodes[0]);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setSelectedNodes(nodes);
      }
      // Delete is now handled by ReactFlow's onNodesDelete and onEdgesDelete
      if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault();
        zoomIn();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        zoomTo(1);
      }
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        setShowAddNodeMenu(true);
      }
      if (e.key === 'l' && !e.metaKey && !e.ctrlKey) {
        applyAutoLayout('smart');
      }
      if (e.key === 'Escape') {
        setSelectedNodes([]);
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        setDetailsPanelOpen(false);
        setShowAddNodeMenu(false);
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, nodes, edges, editingNode, copyNode, pasteNode, duplicateNode, deleteSelectedNodes, applyAutoLayout, setNodes, setEdges, zoomIn, zoomOut, zoomTo]);

  const nodeColor = (node: Node) => {
    switch (node.type) {
      case 'start': return '#10b981';
      case 'end': return '#ef4444';
      case 'screen': return '#3b82f6';
      case 'enhanced-screen': return '#6366f1';
      case 'decision': return '#f59e0b';
      case 'condition': return '#f97316';
      case 'action': return '#8b5cf6';
      case 'note': return '#fbbf24';
      case 'subflow': return '#10b981';
      case 'frame': return '#6b7280';
      default: return '#94a3b8';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden" onClick={() => setActiveEdgeId(null)}>
      {/* Top Toolbar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button className="p-1.5 hover:bg-gray-100 rounded">
            <Home className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Complete Flow Example - All Features</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Auto-saved</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAddNodeMenu(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 text-sm"
          >
            <Plus className="w-3 h-3" />
            Add Node
            <kbd className="text-xs bg-blue-700 px-1 rounded">A</kbd>
          </button>
          
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowLayoutMenu(!showLayoutMenu);
              }}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 text-sm"
            >
              <Layout className="w-3 h-3" />
              Auto Layout
            </button>
            
            {showLayoutMenu && (
              <div 
                className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg py-2 z-50 min-w-[180px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    applyAutoLayout('smart');
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                >
                  <Shuffle className="w-3 h-3" />
                  Smart Layout
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    applyAutoLayout('horizontal');
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                >
                  <ArrowRight className="w-3 h-3" />
                  Horizontal Flow
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    applyAutoLayout('vertical');
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                >
                  <ArrowDown className="w-3 h-3" />
                  Vertical Flow
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    applyAutoLayout('tree');
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                >
                  <GitBranch className="w-3 h-3" />
                  Tree Layout
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    applyAutoLayout('compact');
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                >
                  <Layers className="w-3 h-3" />
                  Compact
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setShowComments(!showComments)}
            className={`px-3 py-1.5 ${showComments ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'} hover:bg-gray-200 rounded flex items-center gap-2 text-sm`}
          >
            <MessageSquare className="w-3 h-3" />
            Comments
            {comments.length > 0 && (
              <span className="text-xs bg-blue-600 text-white px-1.5 rounded-full">{comments.length}</span>
            )}
          </button>
          
          <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 text-sm">
            <Play className="w-3 h-3" />
            Present
          </button>
          
          <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 text-sm">
            <Share2 className="w-3 h-3" />
            Share
          </button>
          
          <div className="h-4 w-px bg-gray-300 mx-2" />
          
          <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 text-sm">
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative overflow-hidden">
        {/* Left Sidebar - Node Palette */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 bg-white border-r shadow-sm overflow-hidden flex flex-col`}>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Node Palette</h3>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search nodes..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-6">
              {nodeTypeDefinitions.map((category) => (
                <div key={category.category}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    {category.category}
                  </p>
                  <div className="space-y-2">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.type}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                          onClick={() => handleAddNode(item.type)}
                          className={`${item.color} border-2 rounded-lg p-3 cursor-move hover:shadow-md transition-all group`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5" />
                            <div className="flex-1">
                              <span className="text-sm font-medium block">{item.label}</span>
                              <span className="text-xs text-gray-600">{item.description}</span>
                            </div>
                            <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white border border-l-0 rounded-r-lg p-2 shadow-md hover:bg-gray-50 z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectionStart={onConnectionStart}
            onConnectionEnd={onConnectionEnd}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={(event, node) => {
              const snappedPosition = onNodeDragStop(event, node);
              // Update node position to snapped position
              setNodes(nds => nds.map(n => 
                n.id === node.id 
                  ? { ...n, position: snappedPosition }
                  : n
              ));
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            elevateEdgesOnSelect={true}
            connectionMode={ConnectionMode.Loose}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineComponent={ConnectionLine}
            connectionLineStyle={{ strokeDasharray: '5 5', stroke: '#94a3b8' }}
            edgesUpdatable={false}
            onEdgeClick={(event, edge) => {
              event.stopPropagation();
              
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                // Multi-select edges with Shift/Cmd/Ctrl
                setEdges(eds =>
                  eds.map(e => {
                    if (e.id === edge.id) {
                      return { ...e, selected: !e.selected };
                    }
                    return e;
                  })
                );
              } else {
                // Single select - clear node selections and select only this edge
                setNodes(nds =>
                  nds.map(n => ({ ...n, selected: false }))
                );
                setSelectedNodes([]); // Clear selected nodes array
                setEdges(eds =>
                  eds.map(e => ({
                    ...e,
                    selected: e.id === edge.id
                  }))
                );
              }
            }}
            fitView
            attributionPosition="bottom-left"
            deleteKeyCode="Delete"
            onNodesDelete={(nodesToDelete) => {
              // Custom delete handler for nodes
              const nodeIds = nodesToDelete.map(n => n.id);
              setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
              setEdges(eds => eds.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
              setSelectedNodes([]);
              setDetailsPanelOpen(false);
            }}
            onEdgesDelete={(edgesToDelete) => {
              // Custom delete handler for edges
              const edgeIds = edgesToDelete.map(e => e.id);
              setEdges(eds => eds.filter(e => !edgeIds.includes(e.id)));
            }}
            multiSelectionKeyCode={['Meta', 'Control']}
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1}
              color="#e5e7eb"
            />
            <AlignmentGuides guides={guides} />
            <Controls 
              className="bg-white border-2 border-gray-200 rounded-lg shadow-lg"
              showInteractive={false}
            />
            <MiniMap 
              nodeColor={nodeColor}
              className="bg-white border-2 border-gray-200 rounded-lg shadow-lg"
              maskColor="rgba(0, 0, 0, 0.1)"
            />
            
            {/* Stats Panel */}
            <Panel position="top-left" className="bg-white rounded-lg shadow-lg p-3 m-2">
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Nodes: {nodes.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Edges: {edges.length}</span>
                </div>
                {selectedNodes.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span>Selected: {selectedNodes.length}</span>
                  </div>
                )}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right Details Panel */}
        {detailsPanelOpen && selectedNodes.length > 0 && (
          <div className="w-96 bg-gradient-to-b from-gray-50 to-white border-l shadow-xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedNodes[0].type === 'start' ? 'bg-green-100' :
                      selectedNodes[0].type === 'end' ? 'bg-red-100' :
                      selectedNodes[0].type === 'screen' || selectedNodes[0].type === 'enhanced-screen' ? 'bg-blue-100' :
                      selectedNodes[0].type === 'decision' ? 'bg-yellow-100' :
                      selectedNodes[0].type === 'action' ? 'bg-purple-100' :
                      selectedNodes[0].type === 'note' ? 'bg-amber-100' :
                      'bg-gray-100'
                    }`}>
                      {
                        selectedNodes[0].type === 'start' ? <PlayCircle className="w-5 h-5 text-green-600" /> :
                        selectedNodes[0].type === 'end' ? <StopCircle className="w-5 h-5 text-red-600" /> :
                        selectedNodes[0].type === 'screen' || selectedNodes[0].type === 'enhanced-screen' ? <Square className="w-5 h-5 text-blue-600" /> :
                        selectedNodes[0].type === 'decision' ? <GitBranch className="w-5 h-5 text-yellow-600" /> :
                        selectedNodes[0].type === 'action' ? <Activity className="w-5 h-5 text-purple-600" /> :
                        selectedNodes[0].type === 'note' ? <StickyNote className="w-5 h-5 text-amber-600" /> :
                        <Box className="w-5 h-5 text-gray-600" />
                      }
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Selected Node</p>
                      <p className="font-semibold capitalize">{selectedNodes[0]?.type?.replace('-', ' ') || 'Unknown'}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setDetailsPanelOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {selectedNodes.length === 1 ? (
                <div className="space-y-6">
                  {/* Basic Info Section */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Hash className="w-4 h-4 text-gray-400" />
                      <h4 className="font-medium text-sm">Basic Information</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Type className="w-3 h-3" />
                          Title
                        </label>
                        {editingNode === selectedNodes[0].id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onBlur={saveNodeTitle}
                              onKeyDown={(e) => e.key === 'Enter' && saveNodeTitle()}
                              className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <button
                              onClick={saveNodeTitle}
                              className="p-1.5 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                            >
                              <Check className="w-4 h-4 text-green-600" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <p className="font-medium text-gray-900 flex-1">{selectedNodes[0].data.title}</p>
                            <button
                              onClick={() => startEditingNode(selectedNodes[0])}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded-lg transition-all"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <FileText className="w-3 h-3" />
                          Description
                        </label>
                        <textarea
                          value={selectedNodes[0].data.description || ''}
                          onChange={(e) => {
                            const nodeId = selectedNodes[0].id;
                            setNodes(nds =>
                              nds.map(n =>
                                n.id === nodeId
                                  ? { ...n, data: { ...n.data, description: e.target.value } }
                                  : n
                              )
                            );
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={3}
                          placeholder="Add a description..."
                        />
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Hash className="w-3 h-3" />
                          Node ID
                        </label>
                        <p className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{selectedNodes[0].id}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* UI & Design Section */}
                  {(selectedNodes[0].type === 'screen' || selectedNodes[0].type === 'enhanced-screen') && (
                    <div className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Palette className="w-4 h-4 text-gray-400" />
                        <h4 className="font-medium text-sm">UI & Design</h4>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1 mb-2">
                            <Figma className="w-3 h-3" />
                            Figma Link
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={selectedNodes[0].data.uiMetadata?.figmaLink || ''}
                              onChange={(e) => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, figmaLink: e.target.value } } }
                                      : n
                                  )
                                );
                              }}
                              placeholder="https://figma.com/file/..."
                              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {selectedNodes[0].data.uiMetadata?.figmaLink && (
                              <a
                                href={selectedNodes[0].data.uiMetadata.figmaLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-4 h-4 text-purple-600" />
                              </a>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Responsive Version</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, responsiveVersion: 'desktop' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.responsiveVersion === 'desktop' 
                                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <Monitor className="w-4 h-4" />
                              <span className="text-xs">Desktop</span>
                            </button>
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, responsiveVersion: 'tablet' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.responsiveVersion === 'tablet' 
                                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <Tablet className="w-4 h-4" />
                              <span className="text-xs">Tablet</span>
                            </button>
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, responsiveVersion: 'mobile' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.responsiveVersion === 'mobile' 
                                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <Smartphone className="w-4 h-4" />
                              <span className="text-xs">Mobile</span>
                            </button>
                          </div>
                        </div>
                        
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">Completion Status</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, completionStatus: 'todo' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.completionStatus === 'todo' 
                                  ? 'bg-gray-100 border-gray-400 text-gray-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <Circle className="w-3 h-3" />
                              <span className="text-xs">Todo</span>
                            </button>
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, completionStatus: 'in-progress' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.completionStatus === 'in-progress' 
                                  ? 'bg-yellow-50 border-yellow-300 text-yellow-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              <span className="text-xs">In Progress</span>
                            </button>
                            <button
                              onClick={() => {
                                const nodeId = selectedNodes[0].id;
                                setNodes(nds =>
                                  nds.map(n =>
                                    n.id === nodeId
                                      ? { ...n, data: { ...n.data, uiMetadata: { ...n.data.uiMetadata, completionStatus: 'done' } } }
                                      : n
                                  )
                                );
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center gap-1 ${
                                selectedNodes[0].data.uiMetadata?.completionStatus === 'done' 
                                  ? 'bg-green-50 border-green-300 text-green-700' 
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <CheckCircle className="w-3 h-3" />
                              <span className="text-xs">Done</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Comments Section */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400" />
                        <h4 className="font-medium text-sm">Comments</h4>
                      </div>
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                        {comments.filter(c => c.nodeId === selectedNodes[0].id).length}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                      {comments
                        .filter(c => c.nodeId === selectedNodes[0].id)
                        .map(comment => (
                          <div 
                            key={comment.id} 
                            className={`p-3 bg-gray-50 rounded-lg border border-gray-100 ${comment.resolved ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className={`text-sm ${comment.resolved ? 'line-through text-gray-500' : 'text-gray-700'}`}>
                                  {comment.text}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {comment.author} • {new Date(comment.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleCommentResolved(comment.id)}
                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                              >
                                {comment.resolved ? 
                                  <CheckCircle className="w-4 h-4 text-green-600" /> : 
                                  <Circle className="w-4 h-4 text-gray-400" />
                                }
                              </button>
                            </div>
                          </div>
                        ))}
                      {comments.filter(c => c.nodeId === selectedNodes[0].id).length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">No comments yet</p>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addComment(selectedNodes[0].id)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => addComment(selectedNodes[0].id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="w-4 h-4 text-gray-400" />
                      <h4 className="font-medium text-sm">Quick Actions</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => copyNode(selectedNodes[0])}
                        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Copy className="w-4 h-4" />
                        Copy
                      </button>
                      <button
                        onClick={() => duplicateNode(selectedNodes[0])}
                        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      <button
                        onClick={() => {
                          const nodeId = selectedNodes[0].id;
                          setNodes(nds =>
                            nds.map(n =>
                              n.id === nodeId
                                ? { ...n, data: { ...n.data, locked: !n.data.locked } }
                                : n
                            )
                          );
                        }}
                        className="px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        {selectedNodes[0].data.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        {selectedNodes[0].data.locked ? 'Unlock' : 'Lock'}
                      </button>
                      <button
                        onClick={deleteSelectedNodes}
                        className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Layers className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-blue-900">{selectedNodes.length} nodes selected</p>
                        <p className="text-xs text-blue-700">Hold Cmd/Ctrl to select multiple</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <h4 className="font-medium text-sm mb-3">Bulk Actions</h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          selectedNodes.forEach(node => duplicateNode(node));
                        }}
                        className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate All
                      </button>
                      <button
                        onClick={deleteSelectedNodes}
                        className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete All Selected
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="absolute bg-white border rounded-lg shadow-lg py-2 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                if (contextMenu.node) startEditingNode(contextMenu.node);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
            >
              <Edit3 className="w-3 h-3" />
              Rename
            </button>
            <button
              onClick={() => {
                if (contextMenu.node) duplicateNode(contextMenu.node);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
            >
              <Copy className="w-3 h-3" />
              Duplicate
            </button>
            <button
              onClick={() => {
                if (contextMenu.node) copyNode(contextMenu.node);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
            <hr className="my-1" />
            <button
              onClick={() => {
                if (contextMenu.node) {
                  setSelectedNodes([contextMenu.node]);
                  deleteSelectedNodes();
                }
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 text-red-600 flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}

        {/* Add Node Menu Modal */}
        {showAddNodeMenu && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Add Node</h2>
                <button
                  onClick={() => setShowAddNodeMenu(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                {nodeTypeDefinitions.map((category) => (
                  <div key={category.category}>
                    <h3 className="text-sm font-medium text-gray-700 mb-3">{category.category}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {category.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.type}
                            onClick={() => {
                              handleAddNode(item.type);
                              setShowAddNodeMenu(false);
                            }}
                            className={`${item.color} border-2 rounded-lg p-4 text-left hover:shadow-lg transition-all`}
                          >
                            <div className="flex items-start gap-3">
                              <Icon className="w-6 h-6 mt-1" />
                              <div>
                                <div className="font-medium">{item.label}</div>
                                <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comments Panel */}
        {showComments && (
          <div className="absolute top-16 right-4 w-80 bg-white border rounded-lg shadow-lg z-40 max-h-96 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">All Comments ({comments.length})</h3>
                <button 
                  onClick={() => setShowComments(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {comments.length === 0 ? (
                <p className="text-sm text-gray-500">No comments yet. Select a node to add comments.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map(comment => {
                    const node = nodes.find(n => n.id === comment.nodeId);
                    return (
                      <div key={comment.id} className="border-b pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500 mb-1">
                              On: <span className="font-medium">{node?.data.title || 'Unknown Node'}</span>
                            </p>
                            <p className={`text-sm ${comment.resolved ? 'line-through text-gray-400' : ''}`}>
                              {comment.text}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {comment.author} • {new Date(comment.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleCommentResolved(comment.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {comment.resolved ? <Check className="w-3 h-3 text-green-600" /> : <AlertCircle className="w-3 h-3 text-gray-400" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FullFeaturedFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}