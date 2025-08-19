import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ConnectionMode,
  SelectionMode,
  updateEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  getOutgoers,
  getIncomers,
  getConnectedEdges,
} from 'reactflow';
import 'reactflow/dist/style.css';
// import '@/styles/editor.css'; // Temporarily disabled
// @ts-ignore
import dagre from 'dagre';
import { 
  Search,
  Plus,
  Save,
  Download,
  Play,
  Pause,
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
  Command,
  Moon,
  Sun,
  Lock,
  Unlock,
  Copy,
  Clipboard,
  Trash2,
  MoreHorizontal,
  AlignHorizontal,
  AlignVertical,
  Users,
  MessageSquare,
  History,
  FileText,
  Square,
  Circle,
  Diamond,
  Hexagon,
  Link2,
  Activity,
  Code,
  Eye,
  EyeOff,
  Shuffle,
  GitBranch,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  HelpCircle,
  ChevronDown,
  LayoutGrid,
  Sparkles
} from 'lucide-react';
import { mockLoginFlow, mockGhostProposal } from '@/mocks/flowData';
import { UXFlowDocument, UXFlowNode } from '@/types/uxflow';

// Import custom nodes
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

// Modern color scheme
const theme = {
  light: {
    bg: '#ffffff',
    bgSecondary: '#f8fafc',
    border: '#e2e8f0',
    text: '#0f172a',
    textSecondary: '#64748b',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    nodeColors: {
      start: '#10b981',
      end: '#ef4444',
      screen: '#3b82f6',
      decision: '#f59e0b',
      condition: '#f59e0b',
      action: '#8b5cf6',
      note: '#fbbf24',
      subflow: '#6366f1',
    }
  },
  dark: {
    bg: '#0f172a',
    bgSecondary: '#1e293b',
    border: '#334155',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    nodeColors: {
      start: '#34d399',
      end: '#f87171',
      screen: '#60a5fa',
      decision: '#fbbf24',
      condition: '#fbbf24',
      action: '#a78bfa',
      note: '#fde047',
      subflow: '#818cf8',
    }
  }
};

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
}

function ContextMenu({ x, y, onClose, onAction }: ContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const menuItems = [
    { icon: Copy, label: 'Copy', shortcut: '⌘C', action: 'copy' },
    { icon: Clipboard, label: 'Paste', shortcut: '⌘V', action: 'paste' },
    { icon: Copy, label: 'Duplicate', shortcut: '⌘D', action: 'duplicate' },
    { divider: true },
    { icon: AlignHorizontal, label: 'Align Horizontal', action: 'align-h' },
    { icon: AlignVertical, label: 'Align Vertical', action: 'align-v' },
    { icon: Shuffle, label: 'Auto Layout', action: 'auto-layout' },
    { divider: true },
    { icon: Lock, label: 'Lock Position', action: 'lock' },
    { icon: Package, label: 'Group Selection', shortcut: '⌘G', action: 'group' },
    { divider: true },
    { icon: Trash2, label: 'Delete', shortcut: 'Del', action: 'delete', danger: true },
  ];

  return (
    <div
      className="context-menu absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[200px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, idx) => {
        if (item.divider) {
          return <div key={idx} className="h-px bg-gray-200 my-1" />;
        }
        return (
          <button
            key={idx}
            onClick={() => onAction(item.action!)}
            className={`
              w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
              hover:bg-gray-100 transition-colors
              ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'}
            `}
          >
            <div className="flex items-center gap-2">
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <kbd className="text-xs text-gray-500">{item.shortcut}</kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface NodePaletteItemProps {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description?: string;
}

function NodePaletteItem({ type, label, icon, color, description }: NodePaletteItemProps) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow', type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`
        ${color} rounded-lg p-3 cursor-move
        hover:shadow-lg transition-all duration-200
        border-2 border-transparent hover:border-blue-400
        group relative
      `}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-800">{label}</div>
          {description && (
            <div className="text-xs text-gray-600 mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover:opacity-5 rounded-lg transition-opacity" />
    </div>
  );
}

function CommandPalette({ isOpen, onClose, onCommand }: any) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const commands = [
    { category: 'Nodes', items: [
      { icon: '▶️', label: 'Add Start Node', command: 'add-start' },
      { icon: '⏹️', label: 'Add End Node', command: 'add-end' },
      { icon: '📱', label: 'Add Screen', command: 'add-screen' },
      { icon: '🔀', label: 'Add Decision', command: 'add-decision' },
      { icon: '⚙️', label: 'Add Action', command: 'add-action' },
    ]},
    { category: 'Layout', items: [
      { icon: '🎯', label: 'Auto Layout', command: 'auto-layout', shortcut: '⌘L' },
      { icon: '↔️', label: 'Align Horizontal', command: 'align-h' },
      { icon: '↕️', label: 'Align Vertical', command: 'align-v' },
      { icon: '🔲', label: 'Fit to Screen', command: 'fit-view', shortcut: '⌘0' },
    ]},
    { category: 'File', items: [
      { icon: '💾', label: 'Save Flow', command: 'save', shortcut: '⌘S' },
      { icon: '📤', label: 'Export as PNG', command: 'export-png' },
      { icon: '📤', label: 'Export as SVG', command: 'export-svg' },
      { icon: '🔗', label: 'Share Flow', command: 'share', shortcut: '⌘⇧S' },
    ]},
  ];

  const filteredCommands = commands.map(cat => ({
    ...cat,
    items: cat.items.filter(item => 
      item.label.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-32 z-50">
      <div className="command-palette bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a command or search..."
              className="w-full pl-10 pr-4 py-2 text-lg focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 px-2 py-1 rounded">
              ESC
            </kbd>
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCommands.map((category) => (
            <div key={category.category} className="mb-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-1">
                {category.category}
              </div>
              {category.items.map((item) => (
                <button
                  key={item.command}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded-lg flex items-center justify-between group"
                  onClick={() => {
                    onCommand(item.command);
                    onClose();
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <kbd className="text-xs bg-gray-100 group-hover:bg-white px-2 py-1 rounded">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Auto-layout using dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 180;
  const nodeHeight = 80;
  
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 150 });
  
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  
  dagre.layout(dagreGraph);
  
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
  
  return { nodes: layoutedNodes, edges };
};

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, zoomIn, zoomOut, zoomTo, getNodes, getEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [copiedNodes, setCopiedNodes] = useState<Node[]>([]);
  const edgeUpdateSuccessful = useRef(true);

  const currentTheme = darkMode ? theme.dark : theme.light;

  // Initialize with mock data
  useEffect(() => {
    const flowNodes: Node[] = mockLoginFlow.nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node,
      selected: false,
      draggable: true,
    }));

    const flowEdges: Edge[] = mockLoginFlow.edges.map(edge => ({
      ...edge,
      type: 'step',
      animated: false,
      style: {
        stroke: currentTheme.border,
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: currentTheme.border,
      },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.1, duration: 800 });
    }, 100);
  }, []);

  // Handle connections
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'step',
        style: { stroke: currentTheme.border, strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: currentTheme.border,
        },
      }, eds));
    },
    [currentTheme]
  );

  // Handle edge updates
  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeUpdateSuccessful.current = true;
    setEdges((els) => updateEdge(oldEdge, newConnection, els));
  }, []);

  const onEdgeUpdateEnd = useCallback((_: any, edge: Edge) => {
    if (!edgeUpdateSuccessful.current) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
    edgeUpdateSuccessful.current = true;
  }, []);

  // Selection handling
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodes(nodes);
  }, []);

  // Context menu
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  // Drag and drop
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

  // Auto layout
  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      getNodes(),
      getEdges(),
      'TB'
    );
    
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.1, duration: 800 });
    }, 50);
  }, [getNodes, getEdges, setNodes, setEdges, fitView]);

  // Context menu actions
  const handleContextMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'copy':
        setCopiedNodes(selectedNodes);
        break;
      case 'paste':
        if (copiedNodes.length > 0) {
          const newNodes = copiedNodes.map(node => ({
            ...node,
            id: `${node.id}-copy-${Date.now()}`,
            position: {
              x: node.position.x + 50,
              y: node.position.y + 50,
            },
          }));
          setNodes(nds => nds.concat(newNodes));
        }
        break;
      case 'duplicate':
        const duplicatedNodes = selectedNodes.map(node => ({
          ...node,
          id: `${node.id}-dup-${Date.now()}`,
          position: {
            x: node.position.x + 50,
            y: node.position.y + 50,
          },
        }));
        setNodes(nds => nds.concat(duplicatedNodes));
        break;
      case 'delete':
        setNodes(nds => nds.filter(n => !selectedNodes.find(sn => sn.id === n.id)));
        setEdges(eds => eds.filter(e => 
          !selectedNodes.find(n => n.id === e.source || n.id === e.target)
        ));
        break;
      case 'auto-layout':
        handleAutoLayout();
        break;
      case 'align-h':
        if (selectedNodes.length > 1) {
          const avgY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length;
          setNodes(nds => nds.map(n => {
            if (selectedNodes.find(sn => sn.id === n.id)) {
              return { ...n, position: { ...n.position, y: avgY } };
            }
            return n;
          }));
        }
        break;
      case 'align-v':
        if (selectedNodes.length > 1) {
          const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length;
          setNodes(nds => nds.map(n => {
            if (selectedNodes.find(sn => sn.id === n.id)) {
              return { ...n, position: { ...n.position, x: avgX } };
            }
            return n;
          }));
        }
        break;
    }
    setContextMenu(null);
  }, [selectedNodes, copiedNodes, setNodes, setEdges, handleAutoLayout]);

  // Command palette commands
  const handleCommand = useCallback((command: string) => {
    switch (command) {
      case 'add-start':
      case 'add-end':
      case 'add-screen':
      case 'add-decision':
      case 'add-action':
        const type = command.replace('add-', '');
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const position = project({ x: centerX, y: centerY });
        const newNode: Node = {
          id: `${type}-${Date.now()}`,
          type,
          position,
          data: { title: `New ${type}`, type: type as any },
        };
        setNodes(nds => nds.concat(newNode));
        break;
      case 'auto-layout':
        handleAutoLayout();
        break;
      case 'fit-view':
        fitView({ padding: 0.1, duration: 800 });
        break;
      case 'save':
        console.log('Saving flow...');
        break;
      case 'share':
        console.log('Sharing flow...');
        break;
    }
  }, [project, setNodes, handleAutoLayout, fitView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleCommand('save');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        handleAutoLayout();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodes.length > 0) {
        e.preventDefault();
        handleContextMenuAction('duplicate');
      }
      if (e.key === 'Delete' && selectedNodes.length > 0) {
        handleContextMenuAction('delete');
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
        fitView({ padding: 0.1 });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, handleAutoLayout, handleContextMenuAction, handleCommand, zoomIn, zoomOut, fitView]);

  const nodeColor = (node: Node) => {
    return currentTheme.nodeColors[node.type as keyof typeof currentTheme.nodeColors] || currentTheme.border;
  };

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Modern Top Bar */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-2 flex items-center justify-between z-20`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.location.href = '/dashboard'}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
          >
            <Home className="w-4 h-4" />
          </button>
          
          <div className="h-6 w-px bg-gray-300" />
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                E-Commerce Login Flow
              </span>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              Auto-saved
            </span>
          </div>

          {/* Collaborators */}
          <div className="flex -space-x-2">
            {['JD', 'AS', 'MK'].map((initials, idx) => (
              <div
                key={idx}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium border-2 border-white"
              >
                {initials}
              </div>
            ))}
            <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-medium border-2 border-white hover:bg-gray-200 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Command Palette */}
          <button 
            onClick={() => setCommandPaletteOpen(true)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Command className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className={`text-xs px-1.5 py-0.5 rounded ${darkMode ? 'bg-gray-800' : 'bg-white border'}`}>
              ⌘K
            </kbd>
          </button>

          {/* AI Assistant */}
          <button className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg flex items-center gap-2 text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Assist</span>
          </button>
          
          {/* Present Mode */}
          <button 
            onClick={() => setIsPresentMode(!isPresentMode)}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
              isPresentMode
                ? 'bg-green-500 text-white hover:bg-green-600'
                : darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {isPresentMode ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isPresentMode ? 'Exit' : 'Present'}</span>
          </button>
          
          {/* Share */}
          <button className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
            darkMode 
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}>
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>
          
          <div className="h-6 w-px bg-gray-300 mx-1" />
          
          {/* Save */}
          <button className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm">
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative">
        {/* Enhanced Sidebar */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-r shadow-lg overflow-hidden flex flex-col`}>
          {sidebarOpen && (
            <>
              {/* Sidebar Header */}
              <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    Elements
                  </h3>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search elements..."
                    className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      darkMode 
                        ? 'bg-gray-700 text-gray-200 placeholder-gray-400' 
                        : 'bg-gray-50 text-gray-800 placeholder-gray-500'
                    }`}
                  />
                </div>
              </div>

              {/* Node Palette */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Flow Control
                  </p>
                  <div className="space-y-2">
                    <NodePaletteItem
                      type="start"
                      label="Start"
                      icon="▶️"
                      color="bg-green-50 hover:bg-green-100 border-green-200"
                      description="Entry point"
                    />
                    <NodePaletteItem
                      type="end"
                      label="End"
                      icon="⏹️"
                      color="bg-red-50 hover:bg-red-100 border-red-200"
                      description="Exit point"
                    />
                  </div>
                </div>

                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Screens & Actions
                  </p>
                  <div className="space-y-2">
                    <NodePaletteItem
                      type="screen"
                      label="Screen"
                      icon="📱"
                      color="bg-blue-50 hover:bg-blue-100 border-blue-200"
                      description="UI screen or page"
                    />
                    <NodePaletteItem
                      type="action"
                      label="Action"
                      icon="⚙️"
                      color="bg-purple-50 hover:bg-purple-100 border-purple-200"
                      description="Background process"
                    />
                    <NodePaletteItem
                      type="subflow"
                      label="Sub Flow"
                      icon="🔗"
                      color="bg-indigo-50 hover:bg-indigo-100 border-indigo-200"
                      description="Nested flow"
                    />
                  </div>
                </div>

                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Logic
                  </p>
                  <div className="space-y-2">
                    <NodePaletteItem
                      type="decision"
                      label="Decision"
                      icon="🔀"
                      color="bg-yellow-50 hover:bg-yellow-100 border-yellow-200"
                      description="Yes/No branch"
                    />
                    <NodePaletteItem
                      type="condition"
                      label="Condition"
                      icon="❓"
                      color="bg-orange-50 hover:bg-orange-100 border-orange-200"
                      description="Multiple branches"
                    />
                  </div>
                </div>

                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Documentation
                  </p>
                  <div className="space-y-2">
                    <NodePaletteItem
                      type="note"
                      label="Note"
                      icon="📝"
                      color="bg-amber-50 hover:bg-amber-100 border-amber-200"
                      description="Add comments"
                    />
                  </div>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>15 nodes • 18 edges</span>
                  <button className="hover:text-gray-700 dark:hover:text-gray-300">
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Toggle Sidebar Button */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className={`absolute left-0 top-1/2 transform -translate-y-1/2 ${
              darkMode ? 'bg-gray-800' : 'bg-white'
            } border border-l-0 rounded-r-lg p-2 shadow-md hover:shadow-lg z-10 transition-all`}
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
            onEdgeUpdate={onEdgeUpdate}
            onEdgeUpdateStart={onEdgeUpdateStart}
            onEdgeUpdateEnd={onEdgeUpdateEnd}
            onSelectionChange={onSelectionChange}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            selectionMode={SelectionMode.Partial}
            fitView
            proOptions={{ hideAttribution: true }}
            className={darkMode ? 'dark' : ''}
            defaultEdgeOptions={{
              type: 'step',
              animated: false,
              style: { stroke: currentTheme.border, strokeWidth: 2 },
            }}
          >
            {showGrid && (
              <Background 
                variant={BackgroundVariant.Lines}
                gap={16}
                size={1}
                color={darkMode ? '#1e293b' : '#f1f5f9'}
              />
            )}
            
            <Controls 
              showZoom={true}
              showFitView={true}
              showInteractive={false}
              position="bottom-left"
              className="!shadow-lg !border !border-gray-200 dark:!border-gray-700 !rounded-lg overflow-hidden"
            />
            
            {showMinimap && (
              <MiniMap 
                nodeColor={nodeColor}
                position="bottom-right"
                pannable
                zoomable
                className="!shadow-lg !border !border-gray-200 dark:!border-gray-700 !rounded-lg"
              />
            )}
            
            {/* Floating Toolbar */}
            <Panel position="top-left" className="m-2">
              <div className={`${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              } rounded-lg shadow-lg border p-1 flex items-center gap-1`}>
                <button
                  onClick={() => zoomIn()}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  title="Zoom In (⌘+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => zoomOut()}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  title="Zoom Out (⌘-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fitView({ padding: 0.1 })}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  title="Fit View (⌘0)"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    showGrid ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
                  }`}
                  title="Toggle Grid"
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleAutoLayout}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                  title="Auto Layout (⌘L)"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowMinimap(!showMinimap)}
                  className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    showMinimap ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' : ''
                  }`}
                  title="Toggle Minimap"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </Panel>

            {/* Status Bar */}
            <Panel position="bottom-center" className="mb-2">
              <div className={`${
                darkMode ? 'bg-gray-800/90 text-gray-300' : 'bg-white/90 text-gray-600'
              } backdrop-blur rounded-full px-4 py-1.5 text-xs flex items-center gap-4 shadow-lg border ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <span>{nodes.length} nodes</span>
                <span>•</span>
                <span>{edges.length} connections</span>
                <span>•</span>
                <span>{selectedNodes.length} selected</span>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onAction={handleContextMenuAction}
          />
        )}

        {/* Command Palette */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onCommand={handleCommand}
        />
      </div>
    </div>
  );
}

export function ModernFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}