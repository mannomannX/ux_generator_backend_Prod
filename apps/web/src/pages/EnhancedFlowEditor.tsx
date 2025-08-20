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
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
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
  Command,
  Square,
  GitBranch,
  Activity,
  StickyNote,
  FolderOpen,
  PlayCircle,
  StopCircle,
  Box,
  X
} from 'lucide-react';
import { completeExampleFlow } from '@/mocks/completeFlowExample';
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

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, zoomIn, zoomOut, zoomTo, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false);

  // Initialize with complete example flow
  useEffect(() => {
    const flowNodes: Node[] = completeExampleFlow.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
    }));

    const flowEdges: Edge[] = completeExampleFlow.edges.map(edge => ({
      ...edge,
      type: edge.type || 'smoothstep',
      style: {
        ...defaultEdgeOptions.style,
        ...edge.style,
      },
      markerEnd: edge.style?.stroke ? {
        ...defaultEdgeOptions.markerEnd,
        color: edge.style.stroke,
      } : defaultEdgeOptions.markerEnd,
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);

    // Fit view after loading
    setTimeout(() => fitView({ padding: 0.2 }), 100);
  }, [setNodes, setEdges, fitView]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        ...defaultEdgeOptions,
      }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, _node: Node) => {
    // Handle node selection if needed
  }, []);

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

    setNodes((nds) => nds.concat(newNode));
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

      setNodes((nds) => nds.concat(newNode));
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
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Saving...');
      }
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
      // Add node shortcut
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        setShowAddNodeMenu(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, zoomTo]);

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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top Toolbar */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button className="p-1.5 hover:bg-gray-100 rounded">
            <Home className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Complete Flow Example - All Node Types</span>
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
          
          <button 
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2 text-sm"
          >
            <Command className="w-3 h-3" />
            <span>Commands</span>
            <kbd className="text-xs bg-white px-1 rounded border">⌘K</kbd>
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

      <div className="flex-1 flex relative">
        {/* Left Sidebar - Node Palette */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 bg-white border-r shadow-sm overflow-hidden`}>
          <div className="p-4 h-full overflow-y-auto">
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
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            attributionPosition="bottom-left"
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={20} 
              size={1}
              color="#e5e7eb"
            />
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
              </div>
            </Panel>
          </ReactFlow>
        </div>

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
      </div>
    </div>
  );
}

export default function EnhancedFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}