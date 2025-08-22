import React from 'react';
import { ConnectionLineComponentProps, getSmoothStepPath } from 'reactflow';

export const ConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionLineStyle,
  connectionLineType
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 10
  });

  return (
    <g>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id="connection-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 L 2 5 Z"
            fill="#94a3b8"
            stroke="#94a3b8"
          />
        </marker>
      </defs>
      
      {/* Dashed preview line with arrow */}
      <path
        d={edgePath}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={2}
        strokeDasharray="5 5"
        markerEnd="url(#connection-arrow)"
        style={{
          opacity: 0.6,
          ...connectionLineStyle
        }}
      />
      
      {/* Visual indicator at target position */}
      <circle
        cx={toX}
        cy={toY}
        r={4}
        fill="#3B82F6"
        stroke="white"
        strokeWidth={2}
        style={{
          opacity: 0.8
        }}
      />
    </g>
  );
};