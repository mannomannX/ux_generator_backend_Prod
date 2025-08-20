import { memo, FC } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AlertTriangle, AlertCircle, Info, StickyNote } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const NoteNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected, id }) => {
  const priority = data.priority || 'normal';

  const getPriorityConfig = () => {
    switch (priority) {
      case 'critical':
        return {
          icon: <AlertTriangle className="w-4 h-4" />,
          bgColor: '#FEE2E2',
          borderColor: '#DC2626',
          iconColor: '#DC2626',
          label: 'Critical'
        };
      case 'important':
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          bgColor: '#FEF3C7',
          borderColor: '#F59E0B',
          iconColor: '#F59E0B',
          label: 'Important'
        };
      case 'info':
        return {
          icon: <Info className="w-4 h-4" />,
          bgColor: '#DBEAFE',
          borderColor: '#3B82F6',
          iconColor: '#3B82F6',
          label: 'Info'
        };
      default:
        return {
          icon: <StickyNote className="w-4 h-4" />,
          bgColor: '#FEF9C3',
          borderColor: '#CA8A04',
          iconColor: '#CA8A04',
          label: 'Note'
        };
    }
  };

  const config = getPriorityConfig();

  return (
    <div
      className={`
        relative rounded-lg shadow-md border-2 p-3
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200 cursor-pointer
      `}
      style={{
        width: 200,
        minHeight: 100,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        borderStyle: 'solid',
        borderWidth: 2
      }}
    >
      {/* Priority indicator */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div style={{ color: config.iconColor }}>
          {config.icon}
        </div>
      </div>

      {/* Content */}
      <div className="pr-8">
        <div className="text-xs font-medium mb-1" style={{ color: config.iconColor }}>
          {config.label}
        </div>
        <div className="text-sm text-gray-800 font-medium mb-2">
          {data.title || 'Note'}
        </div>
        <div className="text-xs text-gray-700 whitespace-pre-wrap">
          {data.description || 'Add your note here...'}
        </div>
      </div>

      {/* Handles for all sides */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="!bg-gray-400 !w-2 !h-2 opacity-0 hover:opacity-100"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!bg-gray-400 !w-2 !h-2 opacity-0 hover:opacity-100"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="!bg-blue-500 !w-2 !h-2 opacity-0 hover:opacity-100"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!bg-blue-500 !w-2 !h-2 opacity-0 hover:opacity-100"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
});

NoteNode.displayName = 'NoteNode';