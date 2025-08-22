import React from 'react';

export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number;
  nodes: string[]; // IDs of aligned nodes
}

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
}

export const AlignmentGuides: React.FC<AlignmentGuidesProps> = ({ guides }) => {
  if (guides.length === 0) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      {guides.map((guide, index) => {
        const key = `${guide.type}-${guide.position}-${index}`;
        
        if (guide.type === 'vertical') {
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: `${guide.position}px`,
                top: 0,
                width: '2px',
                height: '100%',
                backgroundColor: '#3B82F6',
                opacity: 0.5,
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)'
              }}
            />
          );
        } else {
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                left: 0,
                top: `${guide.position}px`,
                width: '100%',
                height: '2px',
                backgroundColor: '#3B82F6',
                opacity: 0.5,
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)'
              }}
            />
          );
        }
      })}
    </div>
  );
};