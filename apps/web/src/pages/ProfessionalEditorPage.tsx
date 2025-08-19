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
  getConnectedEdges
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Search,
  Plus,
  Save,
  Download,
  Play,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  Home,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
  Share2,
  Command
} from 'lucide-react';
import { mockLoginFlow } from '@/mocks/flowData';
import { UXFlowDocument, UXFlowNode } from '@/types/uxflow';
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

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, zoomIn, zoomOut, zoomTo } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
    
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
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

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type || !reactFlowBounds) {
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `node-${Date.now()}`,
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, zoomTo]);

  const nodeColor = (node: Node) => {
    switch (node.type) {
      case 'start': return '#10b981';
      case 'end': return '#ef4444';
      case 'screen': return '#3b82f6';
      case 'decision': return '#f59e0b';
      case 'condition': return '#f59e0b';
      case 'action': return '#8b5cf6';
      case 'note': return '#fbbf24';
      case 'subflow': return '#6366f1';
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
            <span className="text-sm font-medium">E-Commerce Login Flow</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Auto-saved</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCommandPaletteOpen(true)}
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
          
          <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-2 text-sm">
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* Left Sidebar - Node Palette */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-white border-r shadow-sm overflow-hidden`}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Elements</h3>
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
                placeholder="Search elements..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Flow Control</p>
              {[
                { type: 'start', label: 'Start', icon: '▶️', color: 'bg-green-100 border-green-300' },
                { type: 'end', label: 'End', icon: '⏹️', color: 'bg-red-100 border-red-300' },
              ].map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                  className={`${item.color} border-2 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </div>
              ))}
              
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-4">Screens & Actions</p>
              {[
                { type: 'screen', label: 'Screen', icon: '📱', color: 'bg-blue-100 border-blue-300' },
                { type: 'action', label: 'Action', icon: '⚙️', color: 'bg-purple-100 border-purple-300' },
                { type: 'subflow', label: 'Sub Flow', icon: '🔗', color: 'bg-indigo-100 border-indigo-300' },
              ].map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                  className={`${item.color} border-2 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </div>
              ))}
              
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-4">Logic</p>
              {[
                { type: 'decision', label: 'Decision', icon: '🔀', color: 'bg-yellow-100 border-yellow-300' },
                { type: 'condition', label: 'Condition', icon: '❓', color: 'bg-orange-100 border-orange-300' },
              ].map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                  className={`${item.color} border-2 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </div>
              ))}
              
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-4">Documentation</p>
              {[
                { type: 'note', label: 'Note', icon: '📝', color: 'bg-yellow-50 border-yellow-300' },
              ].map((item) => (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/reactflow', item.type)}
                  className={`${item.color} border-2 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Toggle Sidebar Button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white border border-l-0 rounded-r-lg p-2 shadow-sm hover:shadow-md z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Main Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
            <Controls 
              showZoom={true}
              showFitView={true}
              showInteractive={false}
              position="bottom-left"
            />
            <MiniMap 
              nodeColor={nodeColor}
              position="bottom-right"
              pannable
              zoomable
            />
            
            <Panel position="top-left" className="bg-white rounded-lg shadow-sm p-2 m-2">
              <div className="flex items-center gap-1">
                <button className="p-1.5 hover:bg-gray-100 rounded" title="Zoom In">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded" title="Zoom Out">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded" title="Fit View">
                  <Maximize2 className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <button className="p-1.5 hover:bg-gray-100 rounded" title="Toggle Grid">
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button className="p-1.5 hover:bg-gray-100 rounded" title="Layers">
                  <Layers className="w-4 h-4" />
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right Sidebar - Properties */}
        {selectedNode && (
          <div className="w-80 bg-white border-l shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Properties</h3>
              <button 
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</label>
                <p className="mt-1 text-sm font-medium capitalize">{selectedNode.type}</p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Title</label>
                <input
                  type="text"
                  value={selectedNode.data.title || ''}
                  onChange={(e) => {
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === selectedNode.id
                          ? { ...node, data: { ...node.data, title: e.target.value } }
                          : node
                      )
                    );
                  }}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
                <textarea
                  value={selectedNode.data.description || ''}
                  onChange={(e) => {
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === selectedNode.id
                          ? { ...node, data: { ...node.data, description: e.target.value } }
                          : node
                      )
                    );
                  }}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Position</label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedNode.position.x)}
                      className="w-full px-2 py-1 border rounded text-sm"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedNode.position.y)}
                      className="w-full px-2 py-1 border rounded text-sm"
                      readOnly
                    />
                  </div>
                </div>
              </div>
              
              {selectedNode.type === 'screen' && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</label>
                  <select 
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedNode.data.uiMetadata?.completionStatus || 'todo'}
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Command Palette Modal */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-32 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Type a command or search..."
                className="w-full text-lg focus:outline-none"
                autoFocus
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {['Add Screen', 'Add Decision', 'Auto Layout', 'Export as PNG', 'Share Flow'].map((cmd) => (
                <button
                  key={cmd}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 rounded"
                  onClick={() => setCommandPaletteOpen(false)}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfessionalEditorPage() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}