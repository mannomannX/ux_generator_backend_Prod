import { memo, FC, ReactNode } from 'react';
import { NodeProps } from 'reactflow';
import { Layers } from 'lucide-react';
import { Frame } from '@/types/uxflow';

interface FrameNodeProps extends NodeProps {
  data: Frame & {
    children?: ReactNode;
  };
}

export const FrameNode: FC<FrameNodeProps> = memo(({ data, selected }) => {
  return (
    <div
      className={`
        relative rounded-lg p-4
        ${selected ? 'ring-2 ring-blue-500' : ''}
        transition-all duration-200
      `}
      style={{
        width: data.size.width,
        height: data.size.height,
        backgroundColor: data.style?.backgroundColor || 'rgba(59, 130, 246, 0.05)',
        border: `${data.style?.borderWidth || 2}px dashed ${data.style?.borderColor || '#3B82F6'}`,
        borderRadius: data.style?.borderRadius || 12
      }}
    >
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-white px-3 py-1 rounded-md shadow-sm">
        <Layers className="w-4 h-4 text-blue-600" />
        <span className="font-semibold text-sm text-gray-800">{data.title}</span>
      </div>
      
      <div className="absolute top-2 right-2 text-xs text-gray-500">
        {data.containedNodes.length} nodes
      </div>

      {data.children}
    </div>
  );
});