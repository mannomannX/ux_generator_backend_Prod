import { FC, ReactNode } from 'react';
import { Handle, Position } from 'reactflow';

interface UniversalNodeWrapperProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Universal wrapper that provides flexible connection points for any node
 * Allows connections from/to any point on the node perimeter
 */
export const UniversalNodeWrapper: FC<UniversalNodeWrapperProps> = ({ 
  children, 
  className = '',
  style = {}
}) => {
  return (
    <div className={`relative ${className}`} style={style}>
      {children}
      
      {/* Invisible handles covering the entire node perimeter */}
      {/* These handles allow connections from/to any point */}
      
      {/* Top edge */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        className="!w-full !h-2 !bg-transparent !border-0 !opacity-0"
        style={{
          top: -4,
          left: 0,
          transform: 'none',
          pointerEvents: 'all'
        }}
        isConnectable={true}
      />
      
      {/* Bottom edge */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        className="!w-full !h-2 !bg-transparent !border-0 !opacity-0"
        style={{
          bottom: -4,
          left: 0,
          transform: 'none',
          pointerEvents: 'all'
        }}
        isConnectable={true}
      />
      
      {/* Left edge */}
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="!w-2 !h-full !bg-transparent !border-0 !opacity-0"
        style={{
          left: -4,
          top: 0,
          transform: 'none',
          pointerEvents: 'all'
        }}
        isConnectable={true}
      />
      
      {/* Right edge */}
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="!w-2 !h-full !bg-transparent !border-0 !opacity-0"
        style={{
          right: -4,
          top: 0,
          transform: 'none',
          pointerEvents: 'all'
        }}
        isConnectable={true}
      />
      
      {/* Visual connection indicator on hover */}
      <div className="absolute inset-0 rounded-lg pointer-events-none">
        <div className="w-full h-full rounded-lg border-2 border-transparent hover:border-blue-400 hover:border-opacity-50 transition-colors" />
      </div>
    </div>
  );
};