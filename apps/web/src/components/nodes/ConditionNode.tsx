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
  // Conditions can be in data.conditions or data.data.conditions
  const conditions = data.conditions || data.data?.conditions || [];
  
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
      {/* Universal Connection Handles - At diamond CORNERS (rotated 45 degrees) */}
      {/* Top corner (actually top-left of the rotated square) */}
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
      
      {/* Right corner (actually top-right of the rotated square) */}
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
      
      {/* Bottom corner (actually bottom-right of the rotated square) */}
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
      
      {/* Left corner (actually bottom-left of the rotated square) */}
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
      
      {/* Additional handles for condition branches - support legacy cond-* IDs */}
      {conditions.map((condition, index) => (
        <Handle
          key={condition.id}
          type="source"
          position={index === 0 ? Position.Right : index === 1 ? Position.Bottom : Position.Left}
          id={condition.id}
          className="!bg-amber-500 !w-3 !h-3 hover:!bg-amber-600"
          style={{ 
            opacity: 0.8,
            ...(index === 0 ? { top: '50%', right: '-14%', transform: 'translateY(-50%)' } :
               index === 1 ? { left: '50%', bottom: '-14%', transform: 'translateX(-50%)' } :
               { top: '50%', left: '-14%', transform: 'translateY(-50%)' })
          }}
        />
      ))}
      
      <div className="absolute inset-0 flex items-center justify-center transform -rotate-45">
        <div className="text-center p-2">
          <div className="font-semibold text-xs truncate">{data.title}</div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 truncate">{data.description}</div>
          )}
        </div>
      </div>

    </div>
  );
});