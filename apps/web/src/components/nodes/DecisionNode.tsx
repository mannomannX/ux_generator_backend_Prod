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

      {/* Minimal handles for React Flow connection system */}
      <Handle 
        type="source" 
        position={Position.Right}
        className="!w-1 !h-1 !bg-transparent !border-0"
        style={{ opacity: 0 }}
        isConnectable={true}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        className="!w-1 !h-1 !bg-transparent !border-0"
        style={{ opacity: 0 }}
        isConnectable={true}
      />
    </div>
  );
});