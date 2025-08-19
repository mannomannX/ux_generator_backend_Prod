import { memo, FC } from 'react';
import { NodeProps } from 'reactflow';
import { FileText } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const NoteNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected }) => {
  return (
    <div
      className={`
        relative bg-yellow-50 rounded shadow-sm border p-3
        ${data.isGhost ? 'opacity-50 border-dashed' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200
      `}
      style={{
        width: data.size?.width || 200,
        height: data.size?.height || 100,
        backgroundColor: data.style?.backgroundColor || '#FEF3C7',
        borderColor: data.style?.borderColor || '#F59E0B',
        borderWidth: data.style?.borderWidth || 1,
        borderRadius: data.style?.borderRadius || 4
      }}
    >
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 text-yellow-600 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-800">
            {data.title}
          </div>
          {data.description && (
            <div className="text-xs text-gray-700 mt-1 break-words">
              {data.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});