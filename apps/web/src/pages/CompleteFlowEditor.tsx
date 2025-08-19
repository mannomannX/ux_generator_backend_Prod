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
  Handle,
  Position,
  NodeProps,
  useKeyPress,
  getIncomers,
  getOutgoers,
  getConnectedEdges,
} from 'reactflow';
import 'reactflow/dist/style.css';
// @ts-ignore
import dagre from 'dagre';
import { 
  Plus,
  Search,
  Play,
  Pause,
  Share2,
  Download,
  Settings,
  Command,
  Sparkles,
  Moon,
  Sun,
  X,
  Monitor,
  GitBranch,
  Zap,
  FileText,
  CheckCircle,
  Circle,
  Square,
  Home,
  ChevronDown,
  ChevronRight,
  Users,
  Save,
  Eye,
  Layers,
  MessageSquare,
  Copy,
  Trash2,
  Edit3,
  Link2,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Clock,
  Pin,
  PinOff,
  Hand,
  MousePointer,
  Layout,
  Ghost,
  Figma,
  MoreVertical,
  Package,
  Hexagon,
  ArrowRight,
  Filter,
  User,
  Smartphone,
  Tablet,
  Activity,
  ChevronLeft,
  PlusCircle,
  MinusCircle,
  Hash,
  MessageCircle,
  HelpCircle
} from 'lucide-react';

// ==================== CUSTOM NODE COMPONENTS ====================

// EPIC 2: US-2.1 - Enhanced Screen Node with variants support
const ScreenNode = ({ data, selected }: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.label || 'Screen');

  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '12px',
      backgroundColor: selected ? '#EBF5FF' : '#FFFFFF',
      border: `2px solid ${selected ? '#2563EB' : '#D1D5DB'}`,
      minWidth: '180px',
      boxShadow: selected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      position: 'relative'
    }}>
      {/* Pin indicator - EPIC 1: US-1.3 */}
      {data.isPinned && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          backgroundColor: '#3B82F6',
          borderRadius: '50%',
          padding: '4px',
          display: 'flex'
        }}>
          <Pin style={{ width: '12px', height: '12px', color: 'white' }} />
        </div>
      )}

      {/* Comment indicator - EPIC 4: US-4.2 */}
      {data.comments && data.comments.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          left: '-8px',
          backgroundColor: '#F59E0B',
          borderRadius: '50%',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '24px',
          height: '24px'
        }}>
          <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
            {data.comments.length}
          </span>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#2563EB',
          border: '2px solid white',
          top: '-5px'
        }}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Monitor style={{ width: '16px', height: '16px', color: '#2563EB' }} />
        {isEditing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontWeight: '600',
              fontSize: '14px',
              padding: 0,
              margin: 0,
              width: '100%'
            }}
            autoFocus
          />
        ) : (
          <div 
            onDoubleClick={() => setIsEditing(true)}
            style={{ fontWeight: '600', fontSize: '14px', color: '#1F2937' }}
          >
            {title}
          </div>
        )}
      </div>
      
      {data.description && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
          {data.description}
        </div>
      )}

      {/* Figma link indicator - EPIC 3: US-3.2 */}
      {data.figmaLink && (
        <div style={{ 
          marginTop: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px'
        }}>
          <Figma style={{ width: '12px', height: '12px', color: '#A855F7' }} />
          <span style={{ fontSize: '11px', color: '#A855F7' }}>Linked</span>
        </div>
      )}

      {/* Variants indicator - EPIC 2: US-2.1 */}
      {data.variants && data.variants.length > 0 && (
        <div style={{ 
          marginTop: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px'
        }}>
          <Layers style={{ width: '12px', height: '12px', color: '#6B7280' }} />
          <span style={{ fontSize: '11px', color: '#6B7280' }}>
            {data.variants.length} variants
          </span>
        </div>
      )}

      {/* Status indicator */}
      {data.status && (
        <div style={{ 
          marginTop: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          fontSize: '11px',
          color: data.status === 'done' ? '#059669' : data.status === 'in-progress' ? '#D97706' : '#6B7280'
        }}>
          {data.status === 'done' ? <CheckCircle style={{ width: '12px', height: '12px' }} /> :
           data.status === 'in-progress' ? <Clock style={{ width: '12px', height: '12px' }} /> :
           <AlertCircle style={{ width: '12px', height: '12px' }} />}
          <span>{data.status}</span>
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#2563EB',
          border: '2px solid white',
          bottom: '-5px'
        }}
      />
    </div>
  );
};

// EPIC 2: US-2.2 - Intelligent Condition Node with multiple outputs
const ConditionNode = ({ data, selected }: NodeProps) => {
  const conditions = data.conditions || [
    { id: 'cond1', label: 'First Login', color: '#10B981' },
    { id: 'cond2', label: 'Standard Login', color: '#3B82F6' },
    { id: 'cond3', label: 'Failed Login', color: '#EF4444' }
  ];

  return (
    <div style={{
      width: '120px',
      height: '120px',
      transform: 'rotate(45deg)',
      backgroundColor: selected ? '#FEF3C7' : '#FFFFFF',
      border: `2px solid ${selected ? '#F59E0B' : '#FCD34D'}`,
      boxShadow: selected ? '0 4px 12px rgba(245, 158, 11, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '12px',
      transition: 'all 0.2s ease',
      position: 'relative'
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#F59E0B',
          border: '2px solid white',
          top: '-20px',
          left: '50%',
          transform: 'translate(-50%, 0) rotate(-45deg)'
        }}
      />
      
      <div style={{
        transform: 'rotate(-45deg)',
        textAlign: 'center',
        padding: '8px'
      }}>
        <Hash style={{ width: '20px', height: '20px', color: '#F59E0B', margin: '0 auto' }} />
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400E', marginTop: '4px' }}>
          {data.label || 'Condition'}
        </div>
      </div>
      
      {/* Multiple condition outputs */}
      {conditions.map((condition, index) => (
        <Handle
          key={condition.id}
          type="source"
          position={Position.Right}
          id={condition.id}
          style={{
            width: '10px',
            height: '10px',
            backgroundColor: condition.color,
            border: '2px solid white',
            right: '-20px',
            top: `${25 + (index * 30)}%`,
            transform: 'rotate(-45deg)'
          }}
        />
      ))}
    </div>
  );
};

// Decision Node
const DecisionNode = ({ data, selected }: NodeProps) => {
  return (
    <div style={{
      width: '100px',
      height: '100px',
      transform: 'rotate(45deg)',
      backgroundColor: selected ? '#FEF3C7' : '#FFFFFF',
      border: `2px solid ${selected ? '#F59E0B' : '#FCD34D'}`,
      boxShadow: selected ? '0 4px 12px rgba(245, 158, 11, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      transition: 'all 0.2s ease'
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#F59E0B',
          border: '2px solid white',
          top: '-20px',
          left: '50%',
          transform: 'translate(-50%, 0) rotate(-45deg)'
        }}
      />
      
      <div style={{
        transform: 'rotate(-45deg)',
        textAlign: 'center',
        padding: '8px'
      }}>
        <GitBranch style={{ width: '20px', height: '20px', color: '#F59E0B', margin: '0 auto' }} />
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400E', marginTop: '4px' }}>
          {data.label || 'Decision'}
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        id="yes"
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#10B981',
          border: '2px solid white',
          right: '-20px',
          top: '50%',
          transform: 'translate(0, -50%) rotate(-45deg)'
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#EF4444',
          border: '2px solid white',
          bottom: '-20px',
          left: '50%',
          transform: 'translate(-50%, 0) rotate(-45deg)'
        }}
      />
    </div>
  );
};

// Action Node
const ActionNode = ({ data, selected }: NodeProps) => {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '12px',
      backgroundColor: selected ? '#F3E8FF' : '#FFFFFF',
      border: `2px solid ${selected ? '#8B5CF6' : '#C4B5FD'}`,
      minWidth: '160px',
      boxShadow: selected ? '0 4px 12px rgba(139, 92, 246, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease'
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#8B5CF6',
          border: '2px solid white',
          top: '-5px'
        }}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Zap style={{ width: '16px', height: '16px', color: '#8B5CF6' }} />
        <div style={{ fontWeight: '600', fontSize: '14px', color: '#1F2937' }}>
          {data.label || 'Action'}
        </div>
      </div>
      
      {data.description && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
          {data.description}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#8B5CF6',
          border: '2px solid white',
          bottom: '-5px'
        }}
      />
    </div>
  );
};

// Note Node
const NoteNode = ({ data }: NodeProps) => {
  return (
    <div style={{
      padding: '12px',
      borderRadius: '8px',
      backgroundColor: '#FEF3C7',
      border: '2px dashed #FCD34D',
      minWidth: '200px',
      maxWidth: '300px'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <FileText style={{ width: '16px', height: '16px', color: '#D97706', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: '600', fontSize: '12px', color: '#92400E', marginBottom: '4px' }}>
            {data.label || 'Note'}
          </div>
          {data.description && (
            <div style={{ fontSize: '11px', color: '#78350F' }}>
              {data.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// SubFlow Node
const SubFlowNode = ({ data, selected }: NodeProps) => {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '12px',
      backgroundColor: selected ? '#E0E7FF' : '#FFFFFF',
      border: `2px solid ${selected ? '#6366F1' : '#A5B4FC'}`,
      minWidth: '180px',
      boxShadow: selected ? '0 4px 12px rgba(99, 102, 241, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease'
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#6366F1',
          border: '2px solid white',
          top: '-5px'
        }}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Package style={{ width: '16px', height: '16px', color: '#6366F1' }} />
        <div style={{ fontWeight: '600', fontSize: '14px', color: '#1F2937' }}>
          {data.label || 'SubFlow'}
        </div>
        <Link2 style={{ width: '14px', height: '14px', color: '#6366F1', marginLeft: 'auto' }} />
      </div>
      
      {data.description && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
          {data.description}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#6366F1',
          border: '2px solid white',
          bottom: '-5px'
        }}
      />
    </div>
  );
};

// Start Node
const StartNode = ({ selected }: NodeProps) => {
  return (
    <div style={{
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      backgroundColor: selected ? '#D1FAE5' : '#FFFFFF',
      border: `3px solid ${selected ? '#059669' : '#10B981'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: selected ? '0 4px 12px rgba(16, 185, 129, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease'
    }}>
      <Play style={{ width: '24px', height: '24px', color: '#059669', marginLeft: '4px' }} />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#10B981',
          border: '2px solid white',
          bottom: '-5px'
        }}
      />
    </div>
  );
};

// End Node
const EndNode = ({ selected }: NodeProps) => {
  return (
    <div style={{
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      backgroundColor: selected ? '#FEE2E2' : '#FFFFFF',
      border: `3px solid ${selected ? '#DC2626' : '#EF4444'}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: selected ? '0 4px 12px rgba(239, 68, 68, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease'
    }}>
      <Square style={{ width: '20px', height: '20px', color: '#DC2626', fill: '#DC2626' }} />
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: '10px',
          height: '10px',
          backgroundColor: '#EF4444',
          border: '2px solid white',
          top: '-5px'
        }}
      />
    </div>
  );
};

// Define node types outside component
const nodeTypes = {
  screen: ScreenNode,
  decision: DecisionNode,
  condition: ConditionNode,
  action: ActionNode,
  note: NoteNode,
  subflow: SubFlowNode,
  start: StartNode,
  end: EndNode,
};

// ==================== HELPER FUNCTIONS ====================

// EPIC 1: US-1.3 - Auto Layout with dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB', pinnedNodes: Set<string>) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 150 });

  nodes.forEach((node) => {
    if (!pinnedNodes.has(node.id)) {
      dagreGraph.setNode(node.id, { width: 180, height: 80 });
    }
  });

  edges.forEach((edge) => {
    if (!pinnedNodes.has(edge.source) && !pinnedNodes.has(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    if (pinnedNodes.has(node.id)) {
      return node; // Keep pinned nodes in place
    }
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - 90,
          y: nodeWithPosition.y - 40,
        },
      };
    }
    return node;
  });

  return { nodes: layoutedNodes, edges };
};

// ==================== MAIN EDITOR COMPONENT ====================

function FlowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView, getNodes, getEdges, setNodes: setRFNodes, setEdges: setRFEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [pinnedNodes, setPinnedNodes] = useState<Set<string>>(new Set());
  const [showGhostNodes, setShowGhostNodes] = useState(false);
  const [ghostNodes, setGhostNodes] = useState<Node[]>([]);
  const [showScreenPanel, setShowScreenPanel] = useState<Node | null>(null);
  const [comments, setComments] = useState<Map<string, any[]>>(new Map());
  const [collaborators] = useState([
    { id: '1', name: 'Alice', color: '#3B82F6', cursor: { x: 400, y: 300 } },
    { id: '2', name: 'Bob', color: '#10B981', cursor: { x: 600, y: 200 } },
  ]);
  const [personaFilter, setPersonaFilter] = useState<string | null>(null);
  const [responsiveFilter, setResponsiveFilter] = useState<'desktop' | 'mobile' | 'tablet' | null>(null);

  // EPIC 1: US-1.1 - Space+Drag for panning
  const spacePressed = useKeyPress(' ');
  const [tool, setTool] = useState<'select' | 'pan'>('select');

  useEffect(() => {
    setTool(spacePressed ? 'pan' : 'select');
  }, [spacePressed]);

  // Initialize with sample flow
  useEffect(() => {
    const initialNodes: Node[] = [
      {
        id: '1',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { label: 'Start' },
      },
      {
        id: '2',
        type: 'screen',
        position: { x: 250, y: 100 },
        data: { 
          label: 'Login Screen',
          description: 'User enters credentials',
          status: 'done',
          variants: ['Loading', 'Error', 'Success'],
          figmaLink: 'https://figma.com/...',
          isPinned: false,
          comments: []
        },
      },
      {
        id: '3',
        type: 'condition',
        position: { x: 450, y: 100 },
        data: { 
          label: 'User Type',
          conditions: [
            { id: 'first', label: 'First Login', color: '#10B981' },
            { id: 'returning', label: 'Returning User', color: '#3B82F6' },
            { id: 'error', label: 'Invalid', color: '#EF4444' }
          ]
        },
      },
      {
        id: '4',
        type: 'screen',
        position: { x: 650, y: 50 },
        data: { 
          label: 'Onboarding',
          description: 'First time user flow',
          status: 'in-progress',
          isPinned: true,
          comments: [{ id: '1', text: 'Need UX review' }]
        },
      },
      {
        id: '5',
        type: 'screen',
        position: { x: 650, y: 150 },
        data: { 
          label: 'Dashboard',
          description: 'Main application screen',
          status: 'done',
          isPinned: false
        },
      },
      {
        id: '6',
        type: 'screen',
        position: { x: 650, y: 250 },
        data: { 
          label: 'Error Screen',
          description: 'Show error message',
          status: 'todo',
          isPinned: false
        },
      },
      {
        id: '7',
        type: 'action',
        position: { x: 850, y: 150 },
        data: { 
          label: 'Log Analytics',
          description: 'Track user login'
        },
      },
      {
        id: '8',
        type: 'end',
        position: { x: 1050, y: 150 },
        data: { label: 'End' },
      },
      {
        id: '9',
        type: 'note',
        position: { x: 450, y: 300 },
        data: { 
          label: 'Security Note',
          description: 'Implement 2FA for enterprise users. Rate limiting required for failed attempts.'
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
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      },
      {
        id: 'e2-3',
        source: '2',
        target: '3',
        type: 'smoothstep',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      },
      {
        id: 'e3-4',
        source: '3',
        target: '4',
        sourceHandle: 'first',
        label: 'First Login',
        type: 'smoothstep',
        style: { stroke: '#10B981', strokeWidth: 2 },
        labelStyle: { fill: '#10B981', fontWeight: 700, fontSize: 12 },
      },
      {
        id: 'e3-5',
        source: '3',
        target: '5',
        sourceHandle: 'returning',
        label: 'Returning',
        type: 'smoothstep',
        style: { stroke: '#3B82F6', strokeWidth: 2 },
        labelStyle: { fill: '#3B82F6', fontWeight: 700, fontSize: 12 },
      },
      {
        id: 'e3-6',
        source: '3',
        target: '6',
        sourceHandle: 'error',
        label: 'Invalid',
        type: 'smoothstep',
        style: { stroke: '#EF4444', strokeWidth: 2 },
        labelStyle: { fill: '#EF4444', fontWeight: 700, fontSize: 12 },
      },
      {
        id: 'e4-7',
        source: '4',
        target: '7',
        type: 'smoothstep',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      },
      {
        id: 'e5-7',
        source: '5',
        target: '7',
        type: 'smoothstep',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      },
      {
        id: 'e7-8',
        source: '7',
        target: '8',
        type: 'smoothstep',
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      },
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, [setNodes, setEdges, fitView]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      }, eds));
    },
    [setEdges]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: `New ${type}`, isPinned: false },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [project, setNodes]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // EPIC 1: US-1.2 - Multi-select
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodes(nodes);
  }, []);

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
    
    setNodes(nds => nds.map(node => 
      node.id === nodeId 
        ? { ...node, data: { ...node.data, isPinned: !node.data.isPinned } }
        : node
    ));
  }, [setNodes]);

  // EPIC 1: US-1.3 - Auto Layout
  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      getNodes(),
      getEdges(),
      'TB',
      pinnedNodes
    );
    
    setRFNodes(layoutedNodes);
    setRFEdges(layoutedEdges);
    
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 50);
  }, [getNodes, getEdges, setRFNodes, setRFEdges, fitView, pinnedNodes]);

  // EPIC 1: US-1.2 - Duplicate nodes
  const duplicateSelectedNodes = useCallback(() => {
    const newNodes = selectedNodes.map(node => ({
      ...node,
      id: `${node.id}-copy-${Date.now()}`,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
      data: { ...node.data, isPinned: false }
    }));
    setNodes(nds => nds.concat(newNodes));
  }, [selectedNodes, setNodes]);

  // EPIC 5: US-5.1 - Ghost Editor for AI suggestions
  const showAISuggestions = useCallback(() => {
    const ghostNode: Node = {
      id: 'ghost-1',
      type: 'screen',
      position: { x: 400, y: 400 },
      data: {
        label: 'Password Reset',
        description: 'AI Suggested: Add password reset flow',
        status: 'todo',
        isGhost: true
      },
      style: { opacity: 0.6 }
    };
    setGhostNodes([ghostNode]);
    setShowGhostNodes(true);
  }, []);

  const applyGhostNodes = useCallback(() => {
    const realNodes = ghostNodes.map(node => ({
      ...node,
      style: { opacity: 1 },
      data: { ...node.data, isGhost: false }
    }));
    setNodes(nds => nds.concat(realNodes));
    setGhostNodes([]);
    setShowGhostNodes(false);
  }, [ghostNodes, setNodes]);

  // EPIC 2: US-2.1 - Open screen details panel
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'screen') {
      setShowScreenPanel(node);
    }
  }, []);

  // EPIC 4: US-4.2 - Add comment to node
  const addCommentToNode = useCallback((nodeId: string, comment: string) => {
    setNodes(nds => nds.map(node => {
      if (node.id === nodeId) {
        const currentComments = node.data.comments || [];
        return {
          ...node,
          data: {
            ...node.data,
            comments: [...currentComments, { id: Date.now().toString(), text: comment }]
          }
        };
      }
      return node;
    }));
  }, [setNodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodes.length > 0) {
        e.preventDefault();
        duplicateSelectedNodes();
      }
      // Auto Layout
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        handleAutoLayout();
      }
      // Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        console.log('Saving flow...');
      }
      // Delete
      if (e.key === 'Delete' && selectedNodes.length > 0) {
        const nodeIds = selectedNodes.map(n => n.id);
        setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
        setEdges(eds => eds.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
      }
      // Escape
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowAddMenu(false);
        setShowScreenPanel(null);
      }
      // Add node
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        setShowAddMenu(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, duplicateSelectedNodes, handleAutoLayout, setNodes, setEdges]);

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      backgroundColor: darkMode ? '#0F172A' : '#F8FAFC' 
    }}>
      {/* Header */}
      <div style={{
        height: '56px',
        backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
        borderBottom: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button style={{
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Home style={{ width: '20px', height: '20px', color: darkMode ? '#CBD5E1' : '#475569' }} />
          </button>
          
          <div style={{ height: '24px', width: '1px', backgroundColor: darkMode ? '#334155' : '#E2E8F0' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: darkMode ? '#F1F5F9' : '#1E293B' }}>
              E-Commerce Flow
            </span>
            <ChevronDown style={{ width: '16px', height: '16px', color: darkMode ? '#94A3B8' : '#64748B' }} />
          </div>

          {/* EPIC 4: US-4.1 - Live Collaborators */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '16px' }}>
            {['JD', 'AS', 'MK'].map((initials, i) => (
              <div key={i} style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'][i],
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: '600',
                marginLeft: i > 0 ? '-8px' : '0',
                border: '2px solid white',
                zIndex: 3 - i
              }}>
                {initials}
              </div>
            ))}
          </div>

          {/* Persona Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
            <User style={{ width: '16px', height: '16px', color: '#6B7280' }} />
            <select 
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
              onChange={(e) => setPersonaFilter(e.target.value || null)}
            >
              <option value="">All Personas</option>
              <option value="new-user">New User</option>
              <option value="returning">Returning User</option>
            </select>
          </div>

          {/* Responsive Filter */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { icon: Monitor, value: 'desktop' },
              { icon: Tablet, value: 'tablet' },
              { icon: Smartphone, value: 'mobile' }
            ].map(({ icon: Icon, value }) => (
              <button
                key={value}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: responsiveFilter === value ? '#3B82F6' : 'transparent',
                  color: responsiveFilter === value ? 'white' : '#6B7280',
                  cursor: 'pointer',
                  display: 'flex'
                }}
                onClick={() => setResponsiveFilter(responsiveFilter === value ? null : value as any)}
              >
                <Icon style={{ width: '16px', height: '16px' }} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* EPIC 5: US-5.1 - AI Assistant */}
          <button 
            onClick={showAISuggestions}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Sparkles style={{ width: '16px', height: '16px' }} />
            AI Assist
          </button>
          
          {/* EPIC 3: US-3.3 - Present Mode */}
          <button
            onClick={() => setPresentMode(!presentMode)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: presentMode ? '#10B981' : '#3B82F6',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
          >
            {presentMode ? <Pause style={{ width: '16px', height: '16px' }} /> : <Play style={{ width: '16px', height: '16px' }} />}
            {presentMode ? 'Exit Present' : 'Present'}
          </button>
          
          <button style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#3B82F6',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3B82F6'}
          >
            <Save style={{ width: '16px', height: '16px' }} />
            Save
          </button>
          
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {darkMode ? 
              <Sun style={{ width: '20px', height: '20px', color: '#FCD34D' }} /> : 
              <Moon style={{ width: '20px', height: '20px', color: '#64748B' }} />
            }
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={[...nodes, ...ghostNodes]}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDoubleClick={onNodeDoubleClick}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          panOnDrag={tool === 'pan'}
          selectionOnDrag={tool === 'select'}
          multiSelectionKeyCode="Shift"
        >
          <Background 
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color={darkMode ? '#1E293B' : '#E2E8F0'}
          />
          
          {!presentMode && (
            <>
              <Controls 
                style={{
                  button: {
                    backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
                    border: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
                    color: darkMode ? '#CBD5E1' : '#64748B',
                  }
                }}
              />
              <MiniMap 
                style={{
                  backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
                  border: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
                }}
                nodeColor={(n) => {
                  if (n.type === 'start') return '#10B981';
                  if (n.type === 'end') return '#EF4444';
                  if (n.type === 'decision') return '#F59E0B';
                  if (n.type === 'condition') return '#EC4899';
                  if (n.type === 'action') return '#8B5CF6';
                  if (n.type === 'subflow') return '#6366F1';
                  return '#3B82F6';
                }}
              />
            </>
          )}
        </ReactFlow>

        {/* Tool indicator - EPIC 1: US-1.1 */}
        {tool === 'pan' && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            backgroundColor: '#3B82F6',
            color: 'white',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            zIndex: 10
          }}>
            <Hand style={{ width: '16px', height: '16px' }} />
            Pan Mode (Hold Space)
          </div>
        )}

        {/* Control Panel */}
        {!presentMode && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: '12px',
            border: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            zIndex: 10
          }}>
            <button
              onClick={handleAutoLayout}
              style={{
                padding: '8px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Auto Layout (⌘L)"
            >
              <Layout style={{ width: '18px', height: '18px', color: darkMode ? '#CBD5E1' : '#475569' }} />
            </button>
            
            {selectedNodes.length > 0 && (
              <>
                <div style={{ height: '1px', backgroundColor: darkMode ? '#334155' : '#E2E8F0', margin: '4px 0' }} />
                
                <button
                  onClick={() => selectedNodes.forEach(n => togglePinNode(n.id))}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Pin/Unpin"
                >
                  <Pin style={{ width: '18px', height: '18px', color: darkMode ? '#CBD5E1' : '#475569' }} />
                </button>
                
                <button
                  onClick={duplicateSelectedNodes}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Duplicate (⌘D)"
                >
                  <Copy style={{ width: '18px', height: '18px', color: darkMode ? '#CBD5E1' : '#475569' }} />
                </button>
                
                <button
                  onClick={() => {
                    const nodeIds = selectedNodes.map(n => n.id);
                    setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
                    setEdges(eds => eds.filter(e => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)));
                  }}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Delete (Del)"
                >
                  <Trash2 style={{ width: '18px', height: '18px', color: '#EF4444' }} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Floating Add Button */}
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: '#3B82F6',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            transition: 'all 0.2s',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2563EB';
            e.currentTarget.style.transform = 'translateX(-50%) translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3B82F6';
            e.currentTarget.style.transform = 'translateX(-50%) translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
          }}
        >
          <Plus style={{ width: '20px', height: '20px' }} />
          Add Node
          <kbd style={{ 
            padding: '2px 6px', 
            backgroundColor: 'rgba(255,255,255,0.2)', 
            borderRadius: '4px',
            fontSize: '11px'
          }}>A</kbd>
        </button>

        {/* Add Menu */}
        {showAddMenu && (
          <div style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: '12px',
            border: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            padding: '12px',
            zIndex: 20,
            minWidth: '200px'
          }}>
            {[
              { type: 'screen', label: 'Screen', icon: Monitor, color: '#3B82F6' },
              { type: 'decision', label: 'Decision', icon: GitBranch, color: '#F59E0B' },
              { type: 'condition', label: 'Condition', icon: Hash, color: '#EC4899' },
              { type: 'action', label: 'Action', icon: Zap, color: '#8B5CF6' },
              { type: 'subflow', label: 'SubFlow', icon: Package, color: '#6366F1' },
              { type: 'note', label: 'Note', icon: FileText, color: '#FCD34D' },
              { type: 'start', label: 'Start', icon: Play, color: '#10B981' },
              { type: 'end', label: 'End', icon: CheckCircle, color: '#EF4444' },
            ].map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', item.type);
                  setShowAddMenu(false);
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '4px',
                  cursor: 'move',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'background-color 0.2s',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = darkMode ? '#334155' : '#F1F5F9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <item.icon style={{ width: '18px', height: '18px', color: item.color }} />
                <span style={{ fontSize: '14px', color: darkMode ? '#F1F5F9' : '#1E293B' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* EPIC 5: US-5.1 - Ghost nodes dialog */}
        {showGhostNodes && (
          <div style={{
            position: 'absolute',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'white',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            padding: '16px',
            zIndex: 30,
            minWidth: '300px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Ghost style={{ width: '20px', height: '20px', color: '#8B5CF6' }} />
              <span style={{ fontWeight: '600' }}>AI Suggestion</span>
            </div>
            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '16px' }}>
              The AI suggests adding a password reset flow for better user experience.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={applyGhostNodes}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#10B981',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Apply
              </button>
              <button
                onClick={() => {
                  // Allow adjusting position
                  console.log('Adjust ghost nodes');
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: 'white',
                  color: '#6B7280',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Adjust
              </button>
              <button
                onClick={() => {
                  setGhostNodes([]);
                  setShowGhostNodes(false);
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#EF4444',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* EPIC 2: US-2.1 - Screen Details Panel */}
        {showScreenPanel && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '400px',
            height: '100%',
            backgroundColor: darkMode ? '#1E293B' : '#FFFFFF',
            borderLeft: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
            boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.1)',
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '16px',
              borderBottom: `1px solid ${darkMode ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: darkMode ? '#F1F5F9' : '#1E293B' }}>
                Screen Details
              </h3>
              <button
                onClick={() => setShowScreenPanel(null)}
                style={{
                  padding: '4px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer'
                }}
              >
                <X style={{ width: '20px', height: '20px', color: '#6B7280' }} />
              </button>
            </div>
            
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={showScreenPanel.data.label}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setNodes(nds => nds.map(n => 
                      n.id === showScreenPanel.id 
                        ? { ...n, data: { ...n.data, label: newValue } }
                        : n
                    ));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  Description
                </label>
                <textarea
                  value={showScreenPanel.data.description || ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setNodes(nds => nds.map(n => 
                      n.id === showScreenPanel.id 
                        ? { ...n, data: { ...n.data, description: newValue } }
                        : n
                    ));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    fontSize: '14px',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              {/* Variants */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#6B7280' }}>
                    Variants
                  </label>
                  <button
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: '#3B82F6',
                      color: 'white',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus style={{ width: '12px', height: '12px' }} />
                  </button>
                </div>
                {(showScreenPanel.data.variants || []).map((variant: string, index: number) => (
                  <div key={index} style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #E2E8F0',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '14px' }}>{variant}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#FEF3C7',
                        fontSize: '11px',
                        color: '#92400E'
                      }}>TODO</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Figma Link - EPIC 3: US-3.2 */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  Figma Design
                </label>
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F9FAFB'
                }}>
                  {showScreenPanel.data.figmaLink ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Figma style={{ width: '16px', height: '16px', color: '#A855F7' }} />
                      <span style={{ fontSize: '12px', color: '#A855F7' }}>Design linked</span>
                      <Link2 style={{ width: '14px', height: '14px', color: '#6B7280', marginLeft: 'auto', cursor: 'pointer' }} />
                    </div>
                  ) : (
                    <button style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px dashed #D1D5DB',
                      backgroundColor: 'transparent',
                      color: '#6B7280',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}>
                      Connect Figma Design
                    </button>
                  )}
                </div>
              </div>
              
              {/* Comments - EPIC 4: US-4.2 */}
              <div>
                <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>
                  Comments
                </label>
                {(showScreenPanel.data.comments || []).map((comment: any, index: number) => (
                  <div key={index} style={{
                    padding: '8px',
                    borderRadius: '6px',
                    backgroundColor: '#F9FAFB',
                    marginBottom: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: '#3B82F6',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: '600'
                      }}>JD</div>
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>2 hours ago</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#1F2937' }}>{comment.text}</p>
                  </div>
                ))}
                <button
                  onClick={() => addCommentToNode(showScreenPanel.id, 'New comment')}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid #E2E8F0',
                    backgroundColor: 'white',
                    color: '#6B7280',
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <MessageCircle style={{ width: '14px', height: '14px' }} />
                  Add Comment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EPIC 4: US-4.1 - Live Cursors */}
        {!presentMode && collaborators.map(user => (
          <div
            key={user.id}
            style={{
              position: 'absolute',
              left: user.cursor.x,
              top: user.cursor.y,
              pointerEvents: 'none',
              zIndex: 50,
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: user.color,
              border: '2px solid white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }} />
            <div style={{
              position: 'absolute',
              top: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '2px 8px',
              backgroundColor: user.color,
              color: 'white',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap'
            }}>
              {user.name}
            </div>
          </div>
        ))}

        {/* Command Palette - EPIC: Command Palette */}
        {showCommandPalette && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '100px',
            zIndex: 100
          }}>
            <div style={{
              width: '600px',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Command style={{ width: '20px', height: '20px', color: '#6B7280' }} />
                <input
                  type="text"
                  placeholder="Type a command or search..."
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '16px'
                  }}
                  autoFocus
                />
                <kbd style={{
                  padding: '4px 8px',
                  backgroundColor: '#F3F4F6',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#6B7280'
                }}>ESC</kbd>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {[
                  { icon: Plus, label: 'Add Screen', shortcut: 'S' },
                  { icon: Layout, label: 'Auto Layout', shortcut: '⌘L' },
                  { icon: Copy, label: 'Duplicate Selected', shortcut: '⌘D' },
                  { icon: Save, label: 'Save Flow', shortcut: '⌘S' },
                  { icon: Play, label: 'Present Mode', shortcut: 'P' },
                  { icon: Sparkles, label: 'AI Suggestions', shortcut: '⌘G' },
                  { icon: Figma, label: 'Connect Figma', shortcut: 'F' },
                ].map((item, index) => (
                  <button
                    key={index}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    onClick={() => setShowCommandPalette(false)}
                  >
                    <item.icon style={{ width: '18px', height: '18px', color: '#6B7280' }} />
                    <span style={{ flex: 1, textAlign: 'left', fontSize: '14px' }}>{item.label}</span>
                    <kbd style={{
                      padding: '2px 6px',
                      backgroundColor: '#F3F4F6',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#6B7280'
                    }}>{item.shortcut}</kbd>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CompleteFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}