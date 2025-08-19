import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const StartNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected }) => {
  return (
    <div
      className={`
        relative w-16 h-16 rounded-full flex items-center justify-center
        ${data.isGhost ? 'opacity-50' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200 shadow-md
      `}
      style={{
        backgroundColor: data.style?.backgroundColor || '#10B981',
        borderColor: data.style?.borderColor || '#059669',
        borderWidth: 2,
        borderStyle: 'solid'
      }}
    >
      <Play className="w-6 h-6 text-white fill-white" />
      
      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-green-600 !w-3 !h-3"
      />
    </div>
  );
});