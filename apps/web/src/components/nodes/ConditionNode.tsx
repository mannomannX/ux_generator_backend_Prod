import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronRight } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

interface ConditionNodeData extends UXFlowNode {
  conditions?: Array<{
    id: string;
    label: string;
    targetNodeId?: string;
  }>;
}

export const ConditionNode: FC<NodeProps<ConditionNodeData>> = memo(({ data, selected }) => {
  const conditions = data.data?.conditions || [];
  
  return (
    <div 
      className={`
        relative transform rotate-45 w-24 h-24 
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
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-gray-400 !w-2 !h-2"
        style={{ left: '50%', top: '-25%' }}
      />
      
      <div className="absolute inset-0 flex items-center justify-center transform -rotate-45">
        <div className="text-center p-2">
          <div className="font-semibold text-xs truncate">{data.title}</div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 truncate">{data.description}</div>
          )}
        </div>
      </div>

      {conditions.map((condition, index) => (
        <Handle
          key={condition.id}
          type="source"
          position={Position.Right}
          id={condition.id}
          className="!bg-blue-500 !w-2 !h-2"
          style={{ 
            right: '-25%',
            top: `${25 + (index * 25)}%`,
            transform: 'rotate(-45deg)'
          }}
        >
          <div 
            className="absolute text-xs bg-white px-1 rounded shadow-sm whitespace-nowrap"
            style={{ 
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%) rotate(-45deg)'
            }}
          >
            {condition.label}
          </div>
        </Handle>
      ))}

      {conditions.length === 0 && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!bg-green-500 !w-2 !h-2"
            style={{ right: '-25%', top: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!bg-red-500 !w-2 !h-2"
            style={{ bottom: '-25%', left: '50%' }}
          />
        </>
      )}
    </div>
  );
});