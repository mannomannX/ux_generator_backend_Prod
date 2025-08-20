import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Link } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const SubFlowNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected }) => {
  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-md border-2 p-3 cursor-pointer
        ${data.isGhost ? 'opacity-50 border-dashed' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200 hover:shadow-lg
      `}
      style={{
        width: data.size?.width || 180,
        height: data.size?.height || 80,
        backgroundColor: data.style?.backgroundColor || '#E0E7FF',
        borderColor: data.style?.borderColor || '#6366F1',
        borderRadius: data.style?.borderRadius || 8
      }}
    >
      {/* Handles on all sides */}
      <Handle 
        type="target" 
        position={Position.Top}
        id="target-top"
        className="!bg-gray-400 !w-3 !h-3"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="target-left"
        className="!bg-gray-400 !w-3 !h-3"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
      
      <div className="flex items-center gap-2">
        <Link className="w-5 h-5 text-indigo-600" />
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-800 truncate">
            {data.title}
          </div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 truncate">
              {data.description}
            </div>
          )}
          {data.data?.subflowId && (
            <div className="text-xs text-indigo-600 mt-1">
              → {data.data.subflowId}
            </div>
          )}
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom}
        id="source-bottom"
        className="!bg-blue-500 !w-3 !h-3"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle 
        type="source" 
        position={Position.Right}
        id="source-right"
        className="!bg-blue-500 !w-3 !h-3"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
});