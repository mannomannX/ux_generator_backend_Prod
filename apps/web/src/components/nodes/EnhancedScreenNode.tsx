import { memo, FC, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Monitor, Smartphone, Tablet, Image, CheckCircle, Clock, AlertCircle, Zap } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

export const EnhancedScreenNode: FC<NodeProps<UXFlowNode>> = memo(({ data, selected }) => {
  const [showVariants, setShowVariants] = useState(false);
  
  const getResponsiveIcon = () => {
    switch (data.uiMetadata?.responsiveVersion) {
      case 'mobile': return <Smartphone className="w-3 h-3" />;
      case 'tablet': return <Tablet className="w-3 h-3" />;
      default: return <Monitor className="w-3 h-3" />;
    }
  };

  const getStatusColor = () => {
    switch (data.uiMetadata?.completionStatus) {
      case 'done': return 'bg-green-500';
      case 'in-progress': return 'bg-yellow-500';
      case 'todo': return 'bg-gray-400';
      default: return 'bg-gray-300';
    }
  };

  const getStatusIcon = () => {
    switch (data.uiMetadata?.completionStatus) {
      case 'done': return <CheckCircle className="w-3 h-3 text-white" />;
      case 'in-progress': return <Clock className="w-3 h-3 text-white" />;
      case 'todo': return <AlertCircle className="w-3 h-3 text-white" />;
      default: return null;
    }
  };

  return (
    <div
      className={`
        relative bg-white rounded-lg shadow-md border-2 p-3
        ${data.isGhost ? 'opacity-50 border-dashed' : ''}
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        transition-all duration-200 cursor-pointer
      `}
      style={{
        width: data.size?.width || 180,
        height: data.size?.height || 80,
        backgroundColor: data.style?.backgroundColor || '#FFFFFF',
        borderColor: data.style?.borderColor || '#E5E7EB',
        borderRadius: data.style?.borderRadius || 8
      }}
      onDoubleClick={() => setShowVariants(!showVariants)}
    >
      <Handle 
        type="target" 
        position={Position.Top} 
        className="!bg-gray-400 !w-3 !h-3"
      />
      
      <div className="absolute top-1 left-1 flex items-center gap-1">
        <div className={`${getStatusColor()} rounded-full p-0.5`}>
          {getStatusIcon()}
        </div>
        <div className="bg-gray-100 rounded px-1 py-0.5">
          {getResponsiveIcon()}
        </div>
      </div>

      {data.uiMetadata?.screenshot && (
        <div className="absolute top-1 right-1">
          <Image className="w-4 h-4 text-green-600" />
        </div>
      )}

      <div className="flex flex-col items-center justify-center h-full">
        <div className="font-semibold text-sm text-gray-800 truncate max-w-full px-2">
          {data.title}
        </div>
        {data.description && (
          <div className="text-xs text-gray-600 mt-1 truncate max-w-full px-2">
            {data.description}
          </div>
        )}
        
        {data.personaIds && data.personaIds.length > 0 && (
          <div className="flex gap-1 mt-2">
            {data.personaIds.map(id => (
              <div 
                key={id}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: id === 'persona-1' ? '#3B82F6' : '#10B981' }}
              />
            ))}
          </div>
        )}
      </div>

      {data.uiMetadata?.variants && data.uiMetadata.variants.length > 0 && (
        <div className="absolute bottom-1 right-1 flex items-center gap-1">
          <Zap className="w-3 h-3 text-purple-600" />
          <span className="text-xs text-purple-600">{data.uiMetadata.variants.length}</span>
        </div>
      )}

      {showVariants && data.uiMetadata?.variants && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-lg border p-2 z-50">
          <div className="text-xs font-semibold mb-2">Screen Variants:</div>
          {data.uiMetadata.variants.map(variant => (
            <div key={variant.id} className="flex items-center gap-2 py-1">
              <div className={`w-2 h-2 rounded-full ${variant.screenshot ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-xs">{variant.name}</span>
            </div>
          ))}
        </div>
      )}

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!bg-blue-500 !w-3 !h-3"
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
});