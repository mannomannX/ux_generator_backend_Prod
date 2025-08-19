import { useState } from 'react';
import { 
  Layers, 
  Plus, 
  Settings, 
  Filter, 
  User, 
  Monitor, 
  Smartphone,
  Tablet,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock
} from 'lucide-react';
import { UXFlowDocument, UXFlowNode, Frame, Persona } from '@/types/uxflow';

interface EnhancedSidebarProps {
  document: UXFlowDocument;
  selectedNode?: UXFlowNode;
  onAddNode: (type: string, position: { x: number; y: number }) => void;
  onUpdateNode: (nodeId: string, updates: Partial<UXFlowNode>) => void;
  onSelectNode: (nodeId: string) => void;
  onPersonaFilterChange: (personaId: string | undefined) => void;
  onResponsiveFilterChange: (filter: 'desktop' | 'mobile' | 'tablet' | undefined) => void;
  isPresentMode?: boolean;
}

export function EnhancedSidebar({
  document,
  selectedNode,
  onAddNode,
  onUpdateNode,
  onSelectNode,
  onPersonaFilterChange,
  onResponsiveFilterChange,
  isPresentMode = false
}: EnhancedSidebarProps) {
  const [activeTab, setActiveTab] = useState<'layers' | 'properties' | 'comments'>('layers');
  const [expandedFrames, setExpandedFrames] = useState<Set<string>>(new Set());
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
  const [lockedNodes, setLockedNodes] = useState<Set<string>>(new Set());
  const [selectedPersona, setSelectedPersona] = useState<string | undefined>();
  const [selectedResponsive, setSelectedResponsive] = useState<'desktop' | 'mobile' | 'tablet' | undefined>();

  const nodeTemplates = [
    { type: 'screen', icon: '⬜', label: 'Screen' },
    { type: 'decision', icon: '💎', label: 'Decision' },
    { type: 'condition', icon: '< >', label: 'Condition' },
    { type: 'action', icon: '⚙️', label: 'Action' },
    { type: 'note', icon: '🗒️', label: 'Note' },
    { type: 'subflow', icon: '🔗', label: 'SubFlow' },
  ];

  const toggleFrameExpanded = (frameId: string) => {
    const newExpanded = new Set(expandedFrames);
    if (newExpanded.has(frameId)) {
      newExpanded.delete(frameId);
    } else {
      newExpanded.add(frameId);
    }
    setExpandedFrames(newExpanded);
  };

  const toggleNodeVisibility = (nodeId: string) => {
    const newHidden = new Set(hiddenNodes);
    if (newHidden.has(nodeId)) {
      newHidden.delete(nodeId);
    } else {
      newHidden.add(nodeId);
    }
    setHiddenNodes(newHidden);
  };

  const toggleNodeLock = (nodeId: string) => {
    const newLocked = new Set(lockedNodes);
    if (newLocked.has(nodeId)) {
      newLocked.delete(nodeId);
    } else {
      newLocked.add(nodeId);
    }
    setLockedNodes(newLocked);
  };

  const handlePersonaFilter = (personaId: string | undefined) => {
    setSelectedPersona(personaId);
    onPersonaFilterChange(personaId);
  };

  const handleResponsiveFilter = (filter: 'desktop' | 'mobile' | 'tablet' | undefined) => {
    setSelectedResponsive(filter);
    onResponsiveFilterChange(filter);
  };

  const renderNodeItem = (node: UXFlowNode, indent: number = 0) => {
    const isHidden = hiddenNodes.has(node.id);
    const isLocked = lockedNodes.has(node.id);
    const isSelected = selectedNode?.id === node.id;

    return (
      <div
        key={node.id}
        className={`
          flex items-center gap-2 px-2 py-1 hover:bg-gray-100 cursor-pointer
          ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''}
          ${isHidden ? 'opacity-50' : ''}
        `}
        style={{ paddingLeft: `${indent * 16 + 8}px` }}
        onClick={() => onSelectNode(node.id)}
      >
        <span className="text-sm flex-1">{node.title}</span>
        <button
          className="p-1 hover:bg-gray-200 rounded"
          onClick={(e) => {
            e.stopPropagation();
            toggleNodeVisibility(node.id);
          }}
        >
          {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
        <button
          className="p-1 hover:bg-gray-200 rounded"
          onClick={(e) => {
            e.stopPropagation();
            toggleNodeLock(node.id);
          }}
        >
          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
      </div>
    );
  };

  const renderFrame = (frame: Frame) => {
    const isExpanded = expandedFrames.has(frame.id);
    const containedNodes = document.nodes.filter(n => frame.containedNodes.includes(n.id));

    return (
      <div key={frame.id} className="mb-2">
        <div
          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 cursor-pointer"
          onClick={() => toggleFrameExpanded(frame.id)}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Layers className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium flex-1">{frame.title}</span>
          <span className="text-xs text-gray-500">{containedNodes.length}</span>
        </div>
        {isExpanded && (
          <div className="ml-2">
            {containedNodes.map(node => renderNodeItem(node, 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-80 bg-white border-l shadow-lg flex flex-col h-full">
      {!isPresentMode && (
        <div className="p-4 border-b">
          <div className="text-sm font-semibold mb-3">Add Node</div>
          <div className="grid grid-cols-3 gap-2">
            {nodeTemplates.map(template => (
              <button
                key={template.type}
                className="flex flex-col items-center p-2 border rounded hover:bg-gray-50"
                onClick={() => onAddNode(template.type, { x: 100, y: 100 })}
              >
                <span className="text-lg">{template.icon}</span>
                <span className="text-xs mt-1">{template.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex border-b">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'layers' ? 'border-b-2 border-blue-500' : ''}`}
          onClick={() => setActiveTab('layers')}
        >
          <Layers className="w-4 h-4 inline mr-1" />
          Layers
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'properties' ? 'border-b-2 border-blue-500' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          <Settings className="w-4 h-4 inline mr-1" />
          Properties
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${activeTab === 'comments' ? 'border-b-2 border-blue-500' : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          <MessageSquare className="w-4 h-4 inline mr-1" />
          Comments
        </button>
      </div>

      <div className="p-4 border-b">
        <div className="text-sm font-semibold mb-2">Filters</div>
        
        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-1">Persona</div>
          <div className="flex gap-2">
            <button
              className={`px-2 py-1 text-xs rounded ${!selectedPersona ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              onClick={() => handlePersonaFilter(undefined)}
            >
              All
            </button>
            {document.metadata.personas?.map(persona => (
              <button
                key={persona.id}
                className={`px-2 py-1 text-xs rounded ${selectedPersona === persona.id ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
                onClick={() => handlePersonaFilter(persona.id)}
              >
                <User className="w-3 h-3 inline mr-1" />
                {persona.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-600 mb-1">Responsive</div>
          <div className="flex gap-2">
            <button
              className={`p-1 rounded ${selectedResponsive === 'desktop' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              onClick={() => handleResponsiveFilter(selectedResponsive === 'desktop' ? undefined : 'desktop')}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              className={`p-1 rounded ${selectedResponsive === 'tablet' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              onClick={() => handleResponsiveFilter(selectedResponsive === 'tablet' ? undefined : 'tablet')}
            >
              <Tablet className="w-4 h-4" />
            </button>
            <button
              className={`p-1 rounded ${selectedResponsive === 'mobile' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
              onClick={() => handleResponsiveFilter(selectedResponsive === 'mobile' ? undefined : 'mobile')}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'layers' && (
          <div className="p-4">
            {document.frames?.map(frame => renderFrame(frame))}
            
            <div className="mt-4">
              <div className="text-sm font-semibold mb-2">Ungrouped Nodes</div>
              {document.nodes
                .filter(node => !document.frames?.some(f => f.containedNodes.includes(node.id)))
                .map(node => renderNodeItem(node))}
            </div>
          </div>
        )}

        {activeTab === 'properties' && selectedNode && (
          <div className="p-4">
            <div className="mb-4">
              <label className="text-xs text-gray-600">Title</label>
              <input
                type="text"
                className="w-full px-2 py-1 border rounded mt-1"
                value={selectedNode.title}
                onChange={(e) => onUpdateNode(selectedNode.id, { title: e.target.value })}
                disabled={isPresentMode}
              />
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-600">Description</label>
              <textarea
                className="w-full px-2 py-1 border rounded mt-1"
                rows={3}
                value={selectedNode.description || ''}
                onChange={(e) => onUpdateNode(selectedNode.id, { description: e.target.value })}
                disabled={isPresentMode}
              />
            </div>

            {selectedNode.type === 'screen' && (
              <div className="mb-4">
                <label className="text-xs text-gray-600">Status</label>
                <select
                  className="w-full px-2 py-1 border rounded mt-1"
                  value={selectedNode.uiMetadata?.completionStatus || 'todo'}
                  onChange={(e) => onUpdateNode(selectedNode.id, {
                    uiMetadata: {
                      ...selectedNode.uiMetadata,
                      completionStatus: e.target.value as any
                    }
                  })}
                  disabled={isPresentMode}
                >
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            )}

            {selectedNode.type === 'condition' && (
              <div className="mb-4">
                <label className="text-xs text-gray-600">Conditions</label>
                <div className="mt-2 space-y-2">
                  {selectedNode.data?.conditions?.map((condition, index) => (
                    <div key={condition.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        className="flex-1 px-2 py-1 border rounded text-xs"
                        value={condition.label}
                        placeholder="Condition label"
                        disabled={isPresentMode}
                      />
                    </div>
                  ))}
                  {!isPresentMode && (
                    <button className="text-xs text-blue-500 hover:underline">
                      + Add Condition
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="p-4">
            <div className="text-sm text-gray-500 text-center py-8">
              No comments yet
            </div>
          </div>
        )}
      </div>
    </div>
  );
}