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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Plus,
  Search,
  Play,
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
  Users,
  Save,
  Eye,
  Layers,
  MessageSquare,
  Copy,
  Trash,
  Edit3,
  Link2,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Clock
} from 'lucide-react';

// Custom Screen Node Component
const ScreenNode = ({ data, selected }: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(data.label || 'Screen');

  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '12px',
      backgroundColor: selected ? '#EBF5FF' : '#FFFFFF',
      border: `2px solid ${selected ? '#2563EB' : '#D1D5DB'}`,
      minWidth: '160px',
      boxShadow: selected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease',
      cursor: 'pointer'
    }}>
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

// Custom Decision Node Component
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

// Custom Start Node
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

// Custom End Node
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

// Define node types outside component to avoid re-creation
const nodeTypes = {
  screen: ScreenNode,
  decision: DecisionNode,
  start: StartNode,
  end: EndNode,
};

// Main Editor Component
function FlowEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

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
          status: 'done'
        },
      },
      {
        id: '3',
        type: 'decision',
        position: { x: 450, y: 100 },
        data: { label: 'Valid?' },
      },
      {
        id: '4',
        type: 'screen',
        position: { x: 650, y: 50 },
        data: { 
          label: 'Dashboard',
          description: 'Main application screen',
          status: 'in-progress'
        },
      },
      {
        id: '5',
        type: 'screen',
        position: { x: 650, y: 200 },
        data: { 
          label: 'Error Screen',
          description: 'Show error message',
          status: 'todo'
        },
      },
      {
        id: '6',
        type: 'end',
        position: { x: 850, y: 100 },
        data: { label: 'End' },
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
        sourceHandle: 'yes',
        label: 'Yes',
        type: 'smoothstep',
        style: { stroke: '#10B981', strokeWidth: 2 },
        labelStyle: { fill: '#10B981', fontWeight: 700, fontSize: 12 },
      },
      {
        id: 'e3-5',
        source: '3',
        target: '5',
        sourceHandle: 'no',
        label: 'No',
        type: 'smoothstep',
        style: { stroke: '#EF4444', strokeWidth: 2 },
        labelStyle: { fill: '#EF4444', fontWeight: 700, fontSize: 12 },
      },
      {
        id: 'e4-6',
        source: '4',
        target: '6',
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
        data: { label: `New ${type}` },
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
        setShowCommandPalette(true);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setShowAddMenu(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: darkMode ? '#0F172A' : '#F8FAFC' }}>
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

          {/* Collaborators */}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background 
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color={darkMode ? '#1E293B' : '#E2E8F0'}
          />
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
              return '#3B82F6';
            }}
          />
        </ReactFlow>

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
      </div>
    </div>
  );
}

export function WorkingFlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}