import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { EnhancedSidebar } from '@/components/sidebar/EnhancedSidebar';
import { UXFlowDocument, UXFlowNode, UXFlowEdge } from '@/types/uxflow';
import { mockFlowService, useMockMode } from '@/services/mockFlowService';
import { 
  Save, 
  Download, 
  Upload, 
  Play, 
  Ghost, 
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle
} from 'lucide-react';

export function EnhancedEditorPage() {
  const [document, setDocument] = useState<UXFlowDocument | null>(null);
  const [selectedNode, setSelectedNode] = useState<UXFlowNode | undefined>();
  const [ghostNodes, setGhostNodes] = useState<UXFlowNode[]>([]);
  const [ghostEdges, setGhostEdges] = useState<UXFlowEdge[]>([]);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPersonaFilter, setSelectedPersonaFilter] = useState<string | undefined>();
  const [selectedResponsiveFilter, setSelectedResponsiveFilter] = useState<'desktop' | 'mobile' | 'tablet' | undefined>();
  const [showGhostDialog, setShowGhostDialog] = useState(false);
  
  const isMockMode = useMockMode();

  useEffect(() => {
    loadInitialFlow();
    
    if (isMockMode) {
      mockFlowService.simulateCollaboratorUpdate((update) => {
        console.log('Collaborator update:', update);
      });
    }
  }, []);

  const loadInitialFlow = async () => {
    try {
      const flow = await mockFlowService.loadFlow('flow-1');
      setDocument(flow);
    } catch (error) {
      console.error('Failed to load flow:', error);
    }
  };

  const handleSave = async () => {
    if (!document) return;
    
    setIsSaving(true);
    try {
      await mockFlowService.saveFlow('flow-1', document);
      console.log('Flow saved successfully');
    } catch (error) {
      console.error('Failed to save flow:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: 'json' | 'pdf' | 'figma') => {
    if (!document) return;
    
    try {
      const blob = await mockFlowService.exportFlow('flow-1', format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${document.metadata.flowName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export flow:', error);
    }
  };

  const handleNodesChange = useCallback((nodes: UXFlowNode[]) => {
    if (!document) return;
    
    setDocument(prev => ({
      ...prev!,
      nodes
    }));
  }, [document]);

  const handleEdgesChange = useCallback((edges: UXFlowEdge[]) => {
    if (!document) return;
    
    setDocument(prev => ({
      ...prev!,
      edges
    }));
  }, [document]);

  const handleAddNode = useCallback((type: string, position: { x: number; y: number }) => {
    if (!document) return;
    
    const newNode: UXFlowNode = {
      id: `node-${Date.now()}`,
      type: type as any,
      title: `New ${type}`,
      position,
      size: { width: 180, height: 80 }
    };
    
    setDocument(prev => ({
      ...prev!,
      nodes: [...prev!.nodes, newNode]
    }));
  }, [document]);

  const handleUpdateNode = useCallback((nodeId: string, updates: Partial<UXFlowNode>) => {
    if (!document) return;
    
    setDocument(prev => ({
      ...prev!,
      nodes: prev!.nodes.map(node => 
        node.id === nodeId ? { ...node, ...updates } : node
      )
    }));
  }, [document]);

  const handleSelectNode = useCallback((nodeId: string) => {
    const node = document?.nodes.find(n => n.id === nodeId);
    setSelectedNode(node);
  }, [document]);

  const handleNodeDoubleClick = useCallback((node: UXFlowNode) => {
    setSelectedNode(node);
  }, []);

  const handleGenerateAI = async () => {
    setIsGhostMode(true);
    const proposal = await mockFlowService.generateAIProposal('Add password reset flow');
    setGhostNodes(proposal.nodes);
    setGhostEdges(proposal.edges);
    setShowGhostDialog(true);
  };

  const handleApplyGhost = () => {
    if (!document) return;
    
    setDocument(prev => ({
      ...prev!,
      nodes: [...prev!.nodes, ...ghostNodes],
      edges: [...prev!.edges, ...ghostEdges]
    }));
    
    setGhostNodes([]);
    setGhostEdges([]);
    setShowGhostDialog(false);
    setIsGhostMode(false);
  };

  const handleRejectGhost = () => {
    setGhostNodes([]);
    setGhostEdges([]);
    setShowGhostDialog(false);
    setIsGhostMode(false);
  };

  if (!document) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading flow...</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col bg-gray-50">
        <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">{document.metadata.flowName}</h1>
            <span className="text-sm text-gray-500">v{document.metadata.version}</span>
            {isMockMode && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                Mock Mode
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1.5 rounded flex items-center gap-2 ${
                isPresentMode 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => setIsPresentMode(!isPresentMode)}
            >
              <Play className="w-4 h-4" />
              {isPresentMode ? 'Exit Present' : 'Present'}
            </button>
            
            <button
              className={`px-3 py-1.5 rounded flex items-center gap-2 ${
                isGhostMode 
                  ? 'bg-purple-500 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={handleGenerateAI}
            >
              <Ghost className="w-4 h-4" />
              AI Suggest
            </button>
            
            <div className="border-l mx-2 h-6" />
            
            <button
              className="px-3 py-1.5 bg-blue-500 text-white rounded flex items-center gap-2 hover:bg-blue-600 disabled:opacity-50"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            
            <button
              className="px-3 py-1.5 bg-gray-100 rounded flex items-center gap-2 hover:bg-gray-200"
              onClick={() => handleExport('json')}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            
            <button className="p-1.5 bg-gray-100 rounded hover:bg-gray-200">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex">
          <div className="flex-1 relative">
            <FlowCanvas
              document={document}
              ghostNodes={ghostNodes}
              ghostEdges={ghostEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onNodeDoubleClick={handleNodeDoubleClick}
              selectedPersonaFilter={selectedPersonaFilter}
              selectedResponsiveFilter={selectedResponsiveFilter}
              isPresentMode={isPresentMode}
            />
            
            {showGhostDialog && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl p-4 z-50">
                <div className="mb-3">
                  <h3 className="font-semibold">AI Suggestion</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    The AI has suggested adding a password reset flow
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 bg-green-500 text-white rounded flex items-center gap-1 hover:bg-green-600"
                    onClick={handleApplyGhost}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply
                  </button>
                  <button
                    className="px-3 py-1.5 bg-gray-100 rounded flex items-center gap-1 hover:bg-gray-200"
                    onClick={() => {}}
                  >
                    Modify
                  </button>
                  <button
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded flex items-center gap-1 hover:bg-red-200"
                    onClick={handleRejectGhost}
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {!isPresentMode && (
            <EnhancedSidebar
              document={document}
              selectedNode={selectedNode}
              onAddNode={handleAddNode}
              onUpdateNode={handleUpdateNode}
              onSelectNode={handleSelectNode}
              onPersonaFilterChange={setSelectedPersonaFilter}
              onResponsiveFilterChange={setSelectedResponsiveFilter}
              isPresentMode={isPresentMode}
            />
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}