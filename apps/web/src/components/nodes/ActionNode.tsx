import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Settings } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const ActionNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected }) => {
  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-md border-2 p-3
        ${data.isGhost ? 'opacity-50 border-dashed' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200
      `}
      style={{
        width: data.size?.width || 160,
        height: data.size?.height || 60,
        backgroundColor: data.style?.backgroundColor || '#EDE9FE',
        borderColor: data.style?.borderColor || '#8B5CF6',
        borderRadius: data.style?.borderRadius || 8
      }}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-gray-400 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-purple-600" />
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-800 truncate">
            {data.title}
          </div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 truncate">
              {data.description}
            </div>
          )}
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
});