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
  getIncomers,
  getOutgoers,
  getConnectedEdges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Plus,
  Save,
  Play,
  Layers,
  ChevronLeft,
  ChevronRight,
  Home,
  Moon,
  Sun,
  Copy,
  Trash2,
  Pin,
  PinOff,
  LayoutGrid,
  Ghost,
  MessageSquare,
  Users,
  Sparkles,
  Command,
  Settings,
  Share2,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { mockLoginFlow } from '@/mocks/flowData';

// Custom node components
import { EnhancedScreenNode } from '@/components/nodes/EnhancedScreenNode';
import { DecisionNode } from '@/components/nodes/DecisionNode';
import { ConditionNode } from '@/components/nodes/ConditionNode';
import { ActionNode } from '@/components/nodes/ActionNode';
import { NoteNode } from '@/components/nodes/NoteNode';
import { SubFlowNode } from '@/components/nodes/SubFlowNode';
import { StartNode } from '@/components/nodes/StartNode';
import { EndNode } from '@/components/nodes/EndNode';

const nodeTypes = {
  screen: EnhancedScreenNode,
  decision: DecisionNode,
  condition: ConditionNode,
  action: ActionNode,
  note: NoteNode,
  subflow: SubFlowNode,
  start: StartNode,
  end: EndNode,
};

// EPIC 1: US-1.1 - Die unendliche Leinwand
function FlowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, zoomIn, zoomOut, zoomTo, getNodes, getEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [showGhostNodes, setShowGhostNodes] = useState(false);
  const [ghostNodes, setGhostNodes] = useState<Node[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [screenDetailsPanel, setScreenDetailsPanel] = useState<{ node: Node; open: boolean } | null>(null);
  const [presentMode, setPresentMode] = useState(false);
  const [collaborators] = useState([
    { id: '1', name: 'Alice', color: '#3B82F6', cursor: { x: 500, y: 300 } },
    { id: '2', name: 'Bob', color: '#10B981', cursor: { x: 800, y: 400 } },
  ]);

  // Initialize with mock data
  useEffect(() => {
    const flowNodes: Node[] = mockLoginFlow.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
    }));

    const flowEdges: Edge[] = mockLoginFlow.edges.map(edge => ({
      ...edge,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, [setNodes, setEdges, fitView]);

  // EPIC 1: US-1.2 - Node-Grundinteraktionen
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
      }, eds));
    },
    [setEdges]
  );

  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodes(nodes.map(n => n.id));
  }, []);

  // EPIC 1: US-1.2 - Inline Editing (Double click)
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    // EPIC 2: US-2.1 - Der erweiterbare Screen-Knoten
    if (node.type === 'screen') {
      setScreenDetailsPanel({ node, open: true });
    }
  }, []);

  // Context menu for nodes
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      // Show context menu with pin/unpin option
      const isPinned = pinnedNodes.has(node.id);
      // Would show actual context menu here
      console.log('Context menu for node:', node.id, 'Pinned:', isPinned);
    },
    [pinnedNodes]
  );

  // EPIC 1: US-1.2 - Duplicate nodes (Cmd+D)
  const duplicateSelectedNodes = useCallback(() => {
    const selectedNodeObjects = nodes.filter(n => selectedNodes.includes(n.id));
    const newNodes = selectedNodeObjects.map(node => ({
      ...node,
      id: `${node.id}-copy-${Date.now()}`,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
    }));
    setNodes(nds => nds.concat(newNodes));
  }, [nodes, selectedNodes, setNodes]);

  // EPIC 1: US-1.3 - Pin/Unpin nodes
  const togglePinNode = useCallback((nodeId: string) => {
    setPinnedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // EPIC 1: US-1.3 - Auto Layout
  const autoLayout = useCallback(() => {
    // Simple hierarchical layout
    const layoutedNodes = [...nodes];
    const levels: { [key: string]: number } = {};
    
    // Find start nodes
    const startNodes = layoutedNodes.filter(n => n.type === 'start');
    startNodes.forEach(n => levels[n.id] = 0);
    
    // Calculate levels
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach(edge => {
        if (levels[edge.source] !== undefined && levels[edge.target] === undefined) {
          levels[edge.target] = levels[edge.source] + 1;
          changed = true;
        }
      });
    }
    
    // Position nodes by level
    const levelNodes: { [key: number]: Node[] } = {};
    layoutedNodes.forEach(node => {
      const level = levels[node.id] || 0;
      if (!levelNodes[level]) levelNodes[level] = [];
      levelNodes[level].push(node);
    });
    
    // Update positions (except pinned nodes)
    Object.entries(levelNodes).forEach(([level, nodesInLevel]) => {
      const levelNum = parseInt(level);
      nodesInLevel.forEach((node, index) => {
        if (!pinnedNodes.has(node.id)) {
          node.position = {
            x: 200 + (index * 250),
            y: 100 + (levelNum * 200),
          };
        }
      });
    });
    
    setNodes(layoutedNodes);
    setTimeout(() => fitView({ padding: 0.2 }), 100);
  }, [nodes, edges, pinnedNodes, setNodes, fitView]);

  // EPIC 5: US-5.1 - Ghost Editor for AI suggestions
  const showAISuggestions = useCallback(() => {
    const ghostNode: Node = {
      id: 'ghost-1',
      type: 'screen',
      position: { x: 400, y: 300 },
      data: {
        title: 'AI Suggested: Password Reset',
        isGhost: true,
        style: { opacity: 0.5 },
      },
    };
    setGhostNodes([ghostNode]);
    setShowGhostNodes(true);
  }, []);

  const applyGhostNodes = useCallback(() => {
    const realNodes = ghostNodes.map(node => ({
      ...node,
      data: { ...node.data, isGhost: false, style: { opacity: 1 } },
    }));
    setNodes(nds => nds.concat(realNodes));
    setGhostNodes([]);
    setShowGhostNodes(false);
  }, [ghostNodes, setNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelectedNodes();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        autoLayout();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Saving flow...');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [duplicateSelectedNodes, autoLayout]);

  // Drag and drop new nodes
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');

      if (!type || !reactFlowBounds) return;

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { 
          title: `New ${type}`,
          type: type as any,
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

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Top Bar */}
      <div className={`h-14 px-4 flex items-center justify-between border-b ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.location.href = '/dashboard'}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <Home className="w-4 h-4" />
          </button>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-slate-600" />
          
          <span className="font-medium text-sm">E-Commerce Login Flow</span>
          
          {/* EPIC 4: US-4.1 - Live Collaborators */}
          <div className="flex -space-x-2">
            {collaborators.map((user) => (
              <div
                key={user.id}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white dark:border-slate-800"
                style={{ backgroundColor: user.color }}
              >
                {user.name[0]}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* EPIC 5: US-5.1 - AI Assistant */}
          <button
            onClick={showAISuggestions}
            className="px-3 py-1.5 bg-purple-500 text-white rounded-lg flex items-center gap-2 text-sm hover:bg-purple-600"
          >
            <Sparkles className="w-4 h-4" />
            AI Assist
          </button>
          
          {/* EPIC 3: US-3.3 - Present Mode */}
          <button
            onClick={() => setPresentMode(!presentMode)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm ${
              presentMode ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-slate-700'
            }`}
          >
            <Play className="w-4 h-4" />
            {presentMode ? 'Exit Present' : 'Present'}
          </button>
          
          <button className="px-3 py-1.5 bg-blue-500 text-white rounded-lg flex items-center gap-2 text-sm hover:bg-blue-600">
            <Save className="w-4 h-4" />
            Save
          </button>
          
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* Sidebar */}
        {!presentMode && (
          <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
          } border-r overflow-hidden`}>
            {sidebarOpen && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Elements</h3>
                  <button onClick={() => setSidebarOpen(false)}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-2">
                  {[
                    { type: 'start', label: 'Start', color: 'bg-green-100' },
                    { type: 'screen', label: 'Screen', color: 'bg-blue-100' },
                    { type: 'decision', label: 'Decision', color: 'bg-yellow-100' },
                    { type: 'condition', label: 'Condition', color: 'bg-orange-100' },
                    { type: 'action', label: 'Action', color: 'bg-purple-100' },
                    { type: 'note', label: 'Note', color: 'bg-gray-100' },
                    { type: 'end', label: 'End', color: 'bg-red-100' },
                  ].map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                      className={`${item.color} p-3 rounded-lg cursor-move hover:shadow-md transition-shadow`}
                    >
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!sidebarOpen && !presentMode && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 p-2 rounded-r-lg shadow-md z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Main Canvas - EPIC 1: US-1.1 */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={[...nodes, ...ghostNodes]}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background 
              variant={BackgroundVariant.Lines}
              gap={16}
              color={darkMode ? '#1e293b' : '#e5e7eb'}
            />
            
            {!presentMode && (
              <>
                <Controls />
                <MiniMap />
              </>
            )}
            
            {/* Custom Controls Panel */}
            <Panel position="top-left" className="m-2">
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-2 flex items-center gap-2">
                <button
                  onClick={() => autoLayout()}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  Layout optimieren
                </button>
                
                {selectedNodes.length > 0 && (
                  <>
                    <button
                      onClick={() => selectedNodes.forEach(id => togglePinNode(id))}
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                      title="Pin/Unpin selected nodes"
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      onClick={duplicateSelectedNodes}
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                      title="Duplicate (Cmd+D)"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </Panel>

            {/* EPIC 4: US-4.1 - Live Cursors */}
            {collaborators.map((user) => (
              <div
                key={user.id}
                className="absolute pointer-events-none z-50"
                style={{
                  left: user.cursor.x,
                  top: user.cursor.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div 
                  className="w-4 h-4 rounded-full border-2 border-white"
                  style={{ backgroundColor: user.color }}
                />
                <div 
                  className="absolute top-5 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name}
                </div>
              </div>
            ))}

            {/* Show pinned indicators */}
            {nodes.map(node => pinnedNodes.has(node.id) && (
              <div
                key={`pin-${node.id}`}
                className="absolute"
                style={{
                  left: node.position.x - 10,
                  top: node.position.y - 10,
                }}
              >
                <Pin className="w-4 h-4 text-blue-500" />
              </div>
            ))}
          </ReactFlow>
        </div>

        {/* EPIC 5: US-5.1 - Ghost nodes controls */}
        {showGhostNodes && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 z-50">
            <p className="text-sm mb-3">AI suggests adding a Password Reset flow</p>
            <div className="flex gap-2">
              <button
                onClick={applyGhostNodes}
                className="px-3 py-1.5 bg-green-500 text-white rounded text-sm"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setGhostNodes([]);
                  setShowGhostNodes(false);
                }}
                className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded text-sm"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* EPIC 2: US-2.1 - Screen Details Panel */}
        {screenDetailsPanel?.open && (
          <div className="absolute right-0 top-0 h-full w-96 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 shadow-xl z-40 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Screen Details</h3>
              <button onClick={() => setScreenDetailsPanel(null)}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={screenDetailsPanel.node.data.title}
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                  onChange={(e) => {
                    setNodes(nds => nds.map(n => 
                      n.id === screenDetailsPanel.node.id 
                        ? { ...n, data: { ...n.data, title: e.target.value } }
                        : n
                    ));
                  }}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Variants</label>
                <div className="mt-2 space-y-2">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Loading State</span>
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">TODO</span>
                    </div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Error State</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">DONE</span>
                    </div>
                  </div>
                  <button className="w-full p-2 border-2 border-dashed rounded-lg text-sm text-gray-500 hover:border-gray-400">
                    + Add Variant
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Figma Link</label>
                <div className="mt-2 p-3 border rounded-lg bg-gray-50 dark:bg-slate-900">
                  <p className="text-sm text-gray-500">No Figma design linked</p>
                  <button className="mt-2 text-sm text-blue-500 hover:underline">
                    Connect Figma Design
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UXFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}