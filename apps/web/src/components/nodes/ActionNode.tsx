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
      {/* Universal Connection Handles - All sides */}
      <Handle 
        type="target" 
        position={Position.Top}
        id="top"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="source" 
        position={Position.Top}
        id="top"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="left"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle 
        type="source" 
        position={Position.Left}
        id="left"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
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

      {/* Bottom and Right Handles */}
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="bottom"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Bottom}
        id="bottom"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="source" 
        position={Position.Right}
        id="right"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Right}
        id="right"
        className="!bg-gray-500 !w-3 !h-3 hover:!bg-blue-500 !border-2 !border-white !transition-colors"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
});