import { memo, FC, useState, useCallback } from 'react';
import { NodeProps, useReactFlow, Connection } from 'reactflow';
import { Plus } from 'lucide-react';

interface NodeWithAddButtonProps extends NodeProps {
  children: React.ReactNode;
}

export const NodeWithAddButton: FC<NodeWithAddButtonProps> = memo(({ 
  id, 
  selected, 
  children 
}) => {
  const [showAddButton, setShowAddButton] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { project, getNode, getEdges, setEdges, addEdges } = useReactFlow();

  const handleStartConnection = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsConnecting(true);
    
    // Create a temporary visual connection line
    const handleMouseMove = (e: MouseEvent) => {
      // Visual feedback could be added here
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const targetNodeElement = targetElement?.closest('.react-flow__node');
      
      if (targetNodeElement) {
        const targetNodeId = targetNodeElement.getAttribute('data-id');
        if (targetNodeId && targetNodeId !== id) {
          // Create new edge
          const newEdge = {
            id: `edge-${id}-${targetNodeId}-${Date.now()}`,
            source: id,
            target: targetNodeId,
            type: 'custom',
            style: {
              strokeWidth: 2,
              stroke: '#94a3b8',
            },
            data: {}
          };
          
          addEdges([newEdge]);
        }
      }
      
      // Cleanup
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsConnecting(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [id, addEdges]);

  return (
    <div 
      className="relative"
      onMouseEnter={() => !isConnecting && setShowAddButton(true)}
      onMouseLeave={() => !isConnecting && setShowAddButton(false)}
    >
      {children}
      
      {/* Add connection button */}
      {showAddButton && !isConnecting && (
        <button
          onMouseDown={handleStartConnection}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 z-50"
          title="Create new connection"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
      
      {/* Visual feedback when connecting */}
      {isConnecting && (
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-pulse z-50">
          <Plus className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  );
});

NodeWithAddButton.displayName = 'NodeWithAddButton';