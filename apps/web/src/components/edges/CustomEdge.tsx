import { FC, useState, useEffect } from 'react';
import { EdgeProps, EdgeLabelRenderer, BaseEdge, getSmoothStepPath, getBezierPath, getStraightPath, getStepPath } from 'reactflow';
import { X, Edit3, Tag, GitBranch } from 'lucide-react';

interface CustomEdgeData {
  label?: string;
  onDelete?: () => void;
  onLabelChange?: (label: string) => void;
  onEdgeTypeChange?: (type: string) => void;
  activeEdgeId?: string | null;
  setActiveEdgeId?: (id: string | null) => void;
  edgeType?: 'smoothstep' | 'straight' | 'step' | 'bezier';
}

export const CustomEdge: FC<EdgeProps<CustomEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  data,
  selected
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(String(label || ''));
  const showMenu = data?.activeEdgeId === id;
  const edgeType = data?.edgeType || 'smoothstep';
  
  // Get path based on edge type
  let edgePath, labelX, labelY;
  
  switch (edgeType) {
    case 'straight':
      [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      break;
    case 'step':
      [edgePath, labelX, labelY] = getStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 0,
      });
      break;
    case 'bezier':
      [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });
      break;
    case 'smoothstep':
    default:
      [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 10,
      });
      break;
  }
  
  // Close menu when clicking elsewhere
  useEffect(() => {
    if (!showMenu) {
      setIsEditing(false);
    }
  }, [showMenu]);
  
  const handleDelete = () => {
    if (data?.onDelete) {
      data.onDelete();
    }
    if (data?.setActiveEdgeId) {
      data.setActiveEdgeId(null);
    }
  };
  
  const handleLabelSave = () => {
    if (data?.onLabelChange) {
      data.onLabelChange(String(editLabel));
    }
    setIsEditing(false);
    if (data?.setActiveEdgeId) {
      data.setActiveEdgeId(null);
    }
  };
  
  const handleEdgeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (data?.setActiveEdgeId) {
      data.setActiveEdgeId(showMenu ? null : id);
    }
  };
  
  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected || showMenu ? 3 : 2,
          stroke: selected || showMenu ? '#3B82F6' : style.stroke || '#94a3b8',
          cursor: 'pointer'
        }}
      />
      
      {/* Invisible wider click area for better UX */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ cursor: 'pointer' }}
        onClick={handleEdgeClick}
      />
      
      {/* Edge Label or Edit Input */}
      <EdgeLabelRenderer>
        {isEditing ? (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 1000
            }}
            className="nodrag nopan"
          >
            <div className="bg-white px-2 py-1 rounded shadow-lg border border-gray-200 flex items-center gap-1">
              <input
                type="text"
                value={String(editLabel)}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLabelSave();
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditLabel(String(label || ''));
                    if (data?.setActiveEdgeId) {
                      data.setActiveEdgeId(null);
                    }
                  }
                }}
                className="text-xs px-1 py-0.5 border rounded focus:outline-none focus:border-blue-500 w-24"
                autoFocus
                placeholder="Edge label..."
              />
              <button
                onClick={handleLabelSave}
                className="p-0.5 hover:bg-gray-100 rounded"
                title="Save"
              >
                <Edit3 className="w-3 h-3 text-gray-600" />
              </button>
            </div>
          </div>
        ) : label ? (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
              zIndex: 10
            }}
            className="nodrag nopan bg-white px-2 py-1 rounded shadow-sm border border-gray-200 cursor-pointer"
            onClick={handleEdgeClick}
          >
            {label}
          </div>
        ) : null}
        
        {/* Context Menu */}
        {showMenu && !isEditing && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 40}px)`,
              pointerEvents: 'all',
              zIndex: 1000
            }}
            className="nodrag nopan"
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-300 p-1">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditLabel(String(label || ''));
                }}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded text-sm w-full text-left"
              >
                <Tag className="w-4 h-4 text-gray-600" />
                <span>Add/Edit Label</span>
              </button>
              {data?.onEdgeTypeChange && (
                <div className="px-3 py-1.5">
                  <div className="text-xs text-gray-500 mb-1">Edge Type:</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['smoothstep', 'straight', 'step', 'bezier'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => data.onEdgeTypeChange(type)}
                        className={`px-2 py-1 text-xs rounded ${
                          edgeType === type ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {data?.onDelete && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 rounded text-sm w-full text-left text-red-600"
                >
                  <X className="w-4 h-4" />
                  <span>Delete Edge</span>
                </button>
              )}
              <button
                onClick={() => data?.setActiveEdgeId && data.setActiveEdgeId(null)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded text-sm w-full text-left text-gray-500"
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};