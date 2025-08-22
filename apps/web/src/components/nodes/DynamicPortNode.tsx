import { memo, FC, useState, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { UXFlowNode } from '@/types/uxflow';

interface PortConfig {
  id: string;
  position: Position;
  type: 'source' | 'target' | 'both';
  active: boolean;
}

export const DynamicPortNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected, id }) => {
  const { getEdges } = useReactFlow();
  const edges = getEdges();
  
  // Determine which ports are active based on connected edges
  const getActivePorts = useCallback(() => {
    const ports: PortConfig[] = [
      { id: 'top', position: Position.Top, type: 'both', active: false },
      { id: 'right', position: Position.Right, type: 'both', active: false },
      { id: 'bottom', position: Position.Bottom, type: 'both', active: false },
      { id: 'left', position: Position.Left, type: 'both', active: false },
    ];
    
    // Check which ports have connections
    edges.forEach(edge => {
      if (edge.source === id) {
        const handleId = edge.sourceHandle || 'right';
        const port = ports.find(p => p.id === handleId);
        if (port) {
          port.active = true;
          port.type = port.type === 'target' ? 'both' : 'source';
        }
      }
      if (edge.target === id) {
        const handleId = edge.targetHandle || 'left';
        const port = ports.find(p => p.id === handleId);
        if (port) {
          port.active = true;
          port.type = port.type === 'source' ? 'both' : 'target';
        }
      }
    });
    
    // Ensure at least one input and one output port
    const hasInput = ports.some(p => p.active && (p.type === 'target' || p.type === 'both'));
    const hasOutput = ports.some(p => p.active && (p.type === 'source' || p.type === 'both'));
    
    if (!hasInput) {
      // Activate left as default input
      const leftPort = ports.find(p => p.id === 'left');
      if (leftPort) {
        leftPort.active = true;
        leftPort.type = leftPort.type === 'source' ? 'both' : 'target';
      }
    }
    
    if (!hasOutput) {
      // Activate right as default output
      const rightPort = ports.find(p => p.id === 'right');
      if (rightPort) {
        rightPort.active = true;
        rightPort.type = rightPort.type === 'target' ? 'both' : 'source';
      }
    }
    
    return ports;
  }, [edges, id]);
  
  const ports = getActivePorts();
  
  const getHandleStyle = (port: PortConfig) => {
    const baseStyle = {
      width: 12,
      height: 12,
      border: '2px solid white',
      transition: 'all 0.2s ease',
    };
    
    if (port.active) {
      if (port.type === 'source') {
        return { ...baseStyle, backgroundColor: '#10B981' }; // Green for output
      } else if (port.type === 'target') {
        return { ...baseStyle, backgroundColor: '#3B82F6' }; // Blue for input
      } else {
        return { ...baseStyle, backgroundColor: '#8B5CF6' }; // Purple for both
      }
    }
    
    return { ...baseStyle, backgroundColor: '#94A3B8', opacity: 0.5 };
  };
  
  const getHandlePosition = (position: Position) => {
    switch (position) {
      case Position.Top:
        return { left: '50%', top: -6, transform: 'translateX(-50%)' };
      case Position.Right:
        return { right: -6, top: '50%', transform: 'translateY(-50%)' };
      case Position.Bottom:
        return { left: '50%', bottom: -6, transform: 'translateX(-50%)' };
      case Position.Left:
        return { left: -6, top: '50%', transform: 'translateY(-50%)' };
      default:
        return {};
    }
  };
  
  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-md border-2 p-3
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200 cursor-pointer
      `}
      style={{
        width: data.size?.width || 180,
        height: data.size?.height || 80,
        backgroundColor: data.style?.backgroundColor || '#FFFFFF',
        borderColor: data.style?.borderColor || '#E5E7EB',
        borderRadius: data.style?.borderRadius || 8
      }}
    >
      {/* Dynamic Handles for all 4 directions */}
      {ports.map(port => (
        <Handle
          key={port.id}
          type={port.type === 'both' ? 'source' : port.type}
          position={port.position}
          id={port.id}
          style={{
            ...getHandleStyle(port),
            ...getHandlePosition(port.position),
            zIndex: port.active ? 10 : 5,
          }}
          className="hover:scale-125"
        />
      ))}
      
      {/* Bidirectional handles for ports that support both */}
      {ports.filter(p => p.type === 'both').map(port => (
        <Handle
          key={`${port.id}-target`}
          type="target"
          position={port.position}
          id={port.id}
          style={{
            ...getHandleStyle(port),
            ...getHandlePosition(port.position),
            zIndex: port.active ? 10 : 5,
          }}
          className="hover:scale-125"
        />
      ))}
      
      <div className="flex flex-col items-center justify-center h-full">
        <div className="font-semibold text-sm text-gray-800 truncate max-w-full px-2">
          {data.title}
        </div>
        {data.description && (
          <div className="text-xs text-gray-600 mt-1 truncate max-w-full px-2">
            {data.description}
          </div>
        )}
      </div>
      
      {/* Port indicators when selected */}
      {selected && (
        <div className="absolute -top-8 left-0 right-0 flex justify-center">
          <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded">
            {ports.filter(p => p.active).map(p => {
              const icon = p.type === 'source' ? '→' : p.type === 'target' ? '←' : '↔';
              return `${p.id}:${icon}`;
            }).join(' ')}
          </div>
        </div>
      )}
    </div>
  );
});