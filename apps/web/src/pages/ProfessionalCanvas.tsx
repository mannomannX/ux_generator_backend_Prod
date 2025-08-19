import { useState, useEffect, useCallback, useRef, memo } from 'react';
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
  NodeToolbar,
  Position,
  getRectOfNodes,
  getTransformForBounds,
  useKeyPress,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import { 
  MousePointer2,
  Hand,
  Plus,
  Search,
  Play,
  Share2,
  Download,
  Settings,
  Command,
  Sparkles,
  MessageCircle,
  Users,
  History,
  ChevronDown,
  Moon,
  Sun,
  Layout,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Palette,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  Zap,
  Box,
  Circle,
  Diamond,
  Hexagon,
  FileText,
  GitBranch,
  ArrowRight,
  MoreVertical,
  X,
  Check,
  Copy,
  Trash2,
  Edit3,
  Link2,
  Image,
  Folder,
  Star,
  Heart,
  Flag,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Layers,
  Move,
  Maximize2,
  Filter,
  SlidersHorizontal,
  Package,
  Code,
  Database,
  Cloud,
  Cpu,
  Activity,
  BarChart,
  PieChart,
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  Watch,
  Headphones,
  Camera,
  Mic,
  Video,
  Wifi,
  Bluetooth,
  Battery,
  Power
} from 'lucide-react';

// Professional color palette
const colors = {
  canvas: {
    light: '#FAFBFC',
    dark: '#0D1117',
    grid: '#E1E4E8',
    gridDark: '#161B22'
  },
  ui: {
    background: '#FFFFFF',
    backgroundDark: '#161B22',
    surface: '#F6F8FA',
    surfaceDark: '#0D1117',
    border: '#D0D7DE',
    borderDark: '#30363D',
    borderHover: '#1F6FEB',
  },
  text: {
    primary: '#24292F',
    primaryDark: '#C9D1D9',
    secondary: '#57606A',
    secondaryDark: '#8B949E',
    muted: '#6E7781',
    mutedDark: '#484F58',
  },
  accent: {
    primary: '#0969DA',
    primaryHover: '#0860CA',
    success: '#1A7F37',
    warning: '#9A6700',
    danger: '#CF222E',
    purple: '#8250DF',
    pink: '#BF3989',
    orange: '#FB8500',
    teal: '#1B7C83',
  },
  nodes: {
    start: { bg: '#D4F4DD', border: '#1A7F37', text: '#0A3D1B' },
    end: { bg: '#FFEBE9', border: '#CF222E', text: '#82071E' },
    screen: { bg: '#DDF4FF', border: '#0969DA', text: '#0A3069' },
    decision: { bg: '#FFF8C5', border: '#9A6700', text: '#633C01' },
    action: { bg: '#FBEFFF', border: '#8250DF', text: '#4B1E7F' },
    note: { bg: '#FFF8DC', border: '#D4A574', text: '#8B6914' },
    subflow: { bg: '#E7F3FF', border: '#58A6FF', text: '#0A3069' },
  }
};

// Custom styled nodes
const StyledScreenNode = memo(({ data, selected }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.title);

  return (
    <div className={`
      relative group transition-all duration-200 cursor-pointer
      ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
    `}>
      <div className={`
        px-4 py-3 rounded-xl border-2 min-w-[180px]
        bg-gradient-to-br from-white to-blue-50
        border-blue-400 shadow-sm hover:shadow-lg
        transition-all duration-200
        ${data.isGhost ? 'opacity-60' : ''}
      `}>
        {/* Status indicator */}
        <div className="absolute -top-2 -right-2 flex gap-1">
          {data.uiMetadata?.completionStatus === 'done' && (
            <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          {data.uiMetadata?.screenshot && (
            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
              <Image className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        {/* Node content */}
        <div className="flex items-center gap-2 mb-1">
          <Monitor className="w-4 h-4 text-blue-600" />
          {isEditing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
              className="flex-1 bg-transparent border-b border-blue-400 outline-none text-sm font-medium"
              autoFocus
            />
          ) : (
            <h3 
              className="flex-1 text-sm font-medium text-gray-800"
              onDoubleClick={() => setIsEditing(true)}
            >
              {title}
            </h3>
          )}
        </div>

        {data.description && (
          <p className="text-xs text-gray-600 line-clamp-2">{data.description}</p>
        )}

        {/* Variants indicator */}
        {data.uiMetadata?.variants && data.uiMetadata.variants.length > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <Layers className="w-3 h-3 text-gray-500" />
            <span className="text-xs text-gray-500">{data.uiMetadata.variants.length} variants</span>
          </div>
        )}

        {/* Hover toolbar */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-white rounded-lg shadow-lg border px-1 py-1 flex gap-1">
            <button className="p-1 hover:bg-gray-100 rounded">
              <Edit3 className="w-3 h-3" />
            </button>
            <button className="p-1 hover:bg-gray-100 rounded">
              <Copy className="w-3 h-3" />
            </button>
            <button className="p-1 hover:bg-gray-100 rounded">
              <Link2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Connection handles */}
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-400 rounded-full" />
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-blue-400 rounded-full" />
      <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-400 rounded-full" />
      <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-3 h-3 bg-white border-2 border-blue-400 rounded-full" />
    </div>
  );
});

// Floating node palette
const FloatingNodePalette = ({ onClose, onAddNode }: any) => {
  const nodeTypes = [
    { type: 'start', icon: Play, label: 'Start', color: 'green', description: 'Entry point of the flow' },
    { type: 'screen', icon: Monitor, label: 'Screen', color: 'blue', description: 'UI screen or page' },
    { type: 'decision', icon: GitBranch, label: 'Decision', color: 'yellow', description: 'Conditional branch' },
    { type: 'action', icon: Zap, label: 'Action', color: 'purple', description: 'Background process' },
    { type: 'note', icon: FileText, label: 'Note', color: 'gray', description: 'Documentation' },
    { type: 'end', icon: CheckCircle, label: 'End', color: 'red', description: 'Exit point' },
  ];

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
      <div className="bg-white rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Add Element</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search elements..."
              className="w-full pl-9 pr-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="p-2 grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
          {nodeTypes.map((node) => {
            const Icon = node.icon;
            return (
              <button
                key={node.type}
                onClick={() => {
                  onAddNode(node.type);
                  onClose();
                }}
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all group text-left"
              >
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center
                  ${node.color === 'green' && 'bg-green-100 text-green-600'}
                  ${node.color === 'blue' && 'bg-blue-100 text-blue-600'}
                  ${node.color === 'yellow' && 'bg-yellow-100 text-yellow-600'}
                  ${node.color === 'purple' && 'bg-purple-100 text-purple-600'}
                  ${node.color === 'red' && 'bg-red-100 text-red-600'}
                  ${node.color === 'gray' && 'bg-gray-100 text-gray-600'}
                  group-hover:scale-110 transition-transform
                `}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-800">{node.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{node.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Command palette
const CommandPalette = ({ isOpen, onClose }: any) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 animate-in fade-in duration-200">
      <div className="absolute left-1/2 top-20 -translate-x-1/2 w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border">
          <div className="p-4 border-b">
            <div className="relative">
              <Command className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Type a command or search..."
                className="w-full pl-10 pr-10 py-3 text-lg focus:outline-none"
                autoFocus
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-gray-100 rounded">ESC</kbd>
            </div>
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">Quick Actions</div>
              {['Add Screen', 'Add Decision', 'Auto Layout', 'Export as PNG', 'Share Flow'].map((action) => (
                <button
                  key={action}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 flex items-center justify-between group"
                  onClick={onClose}
                >
                  <span className="text-sm">{action}</span>
                  <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Canvas Component
function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, getNodes, setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showNodePalette, setShowNodePalette] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const spacePressed = useKeyPress('Space');

  // Initialize with mock data
  useEffect(() => {
    const initialNodes: Node[] = [
      {
        id: '1',
        type: 'screen',
        position: { x: 250, y: 100 },
        data: { 
          title: 'Login Screen',
          description: 'User authentication',
          uiMetadata: { completionStatus: 'done', screenshot: true }
        },
      },
      {
        id: '2',
        type: 'screen',
        position: { x: 500, y: 100 },
        data: { 
          title: 'Dashboard',
          description: 'Main application view',
          uiMetadata: { variants: [1, 2, 3] }
        },
      },
      {
        id: '3',
        type: 'screen',
        position: { x: 750, y: 100 },
        data: { 
          title: 'Profile',
          description: 'User profile settings',
        },
      },
    ];

    const initialEdges: Edge[] = [
      {
        id: 'e1-2',
        source: '1',
        target: '2',
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#0969DA', strokeWidth: 2 },
      },
      {
        id: 'e2-3',
        source: '2',
        target: '3',
        type: 'smoothstep',
        style: { stroke: '#0969DA', strokeWidth: 2 },
      },
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowNodePalette(false);
      }
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        setShowNodePalette(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Tool switching based on space key
  useEffect(() => {
    setTool(spacePressed ? 'pan' : 'select');
  }, [spacePressed]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#0969DA', strokeWidth: 2 },
      }, eds));
    },
    [setEdges]
  );

  const addNode = useCallback((type: string) => {
    const position = project({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: 'screen', // Using screen for all for now
      position,
      data: { title: `New ${type}` },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [project, setNodes]);

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark' : ''}`}>
      {/* Modern Header Bar */}
      <header className={`
        h-14 px-4 flex items-center justify-between border-b
        ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white/80 backdrop-blur border-gray-200'}
      `}>
        <div className="flex items-center gap-4">
          {/* Logo/Home */}
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <Box className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />

          {/* Project name with dropdown */}
          <button className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <span className="font-medium text-sm">E-Commerce Flow</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          {/* Live collaboration avatars */}
          <div className="flex items-center -space-x-2">
            {['JD', 'AS', 'MK', '+3'].map((name, i) => (
              <div
                key={i}
                className={`
                  w-8 h-8 rounded-full border-2 border-white dark:border-gray-900
                  flex items-center justify-center text-xs font-medium
                  ${i === 3 ? 'bg-gray-200 text-gray-600' : `bg-gradient-to-br from-blue-400 to-blue-600 text-white`}
                `}
              >
                {name}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Action buttons */}
          <button className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <Share2 className="w-4 h-4 inline mr-2" />
            Share
          </button>
          
          <button className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors">
            <Play className="w-4 h-4 inline mr-2" />
            Present
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-2" />

          {/* Settings */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div className="flex-1 relative bg-gray-50 dark:bg-gray-950" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={{ screen: StyledScreenNode }}
          fitView
          proOptions={{ hideAttribution: true }}
          connectionMode={ConnectionMode.Loose}
          panOnDrag={tool === 'pan'}
          selectionOnDrag={tool === 'select'}
        >
          <Background 
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color={darkMode ? '#1e293b' : '#e5e7eb'}
          />
          
          {/* Minimal controls */}
          <Panel position="bottom-left" className="flex gap-2 m-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg border dark:border-gray-800 p-1 flex gap-1">
              <button
                className={`p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
                onClick={() => setTool('select')}
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button
                className={`p-2 rounded-lg transition-colors ${tool === 'pan' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
                onClick={() => setTool('pan')}
              >
                <Hand className="w-4 h-4" />
              </button>
            </div>
          </Panel>

          {/* Floating add button */}
          <Panel position="bottom-center" className="m-4">
            <button
              onClick={() => setShowNodePalette(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all hover:scale-105 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Add Node</span>
              <kbd className="px-1.5 py-0.5 text-xs bg-blue-700 rounded">A</kbd>
            </button>
          </Panel>

          {/* AI Assistant */}
          <Panel position="bottom-right" className="m-4">
            <button className="p-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl shadow-lg hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </button>
          </Panel>
        </ReactFlow>

        {/* Floating panels */}
        {showNodePalette && (
          <FloatingNodePalette 
            onClose={() => setShowNodePalette(false)}
            onAddNode={addNode}
          />
        )}

        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
        />

        {/* Tool indicator */}
        {tool === 'pan' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-blue-600 text-white rounded-full text-sm font-medium shadow-lg">
            <Hand className="w-4 h-4 inline mr-2" />
            Pan Mode (Hold Space)
          </div>
        )}
      </div>
    </div>
  );
}

export function ProfessionalCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}