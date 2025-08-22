import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { UXFlowNode } from '@/types/uxflow';

export const DecisionNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected, id }) => {
  return (
    <div 
      className={`
        relative transform rotate-45 w-20 h-20 
        ${data.isGhost ? 'opacity-50' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200
      `}
      style={{
        backgroundColor: data.style?.backgroundColor || '#FEF3C7',
        borderColor: data.style?.borderColor || '#F59E0B',
        borderWidth: data.style?.borderWidth || 2,
        borderStyle: 'solid'
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center transform -rotate-45">
        <div className="text-center p-2">
          <div className="font-semibold text-xs truncate">{data.title}</div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 truncate">{data.description}</div>
          )}
        </div>
      </div>

      {/* Universal Connection Handles - At diamond CORNERS */}
      {/* Top corner */}
      <Handle 
        type="source" 
        position={Position.Top}
        id="top"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '0%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Top}
        id="top"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '0%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      
      {/* Right corner */}
      <Handle 
        type="source" 
        position={Position.Right}
        id="right"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '50%', top: '0%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Right}
        id="right"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '50%', top: '0%', transform: 'translate(-50%, -50%)' }}
      />
      
      {/* Bottom corner */}
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="bottom"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '100%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Bottom}
        id="bottom"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '100%', top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      
      {/* Left corner */}
      <Handle 
        type="source" 
        position={Position.Left}
        id="left"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '50%', top: '100%', transform: 'translate(-50%, -50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="left"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors !z-10"
        style={{ left: '50%', top: '100%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
});