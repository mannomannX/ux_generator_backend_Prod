import { FC, useState, useEffect, useRef } from 'react';
import { EdgeProps, EdgeLabelRenderer, BaseEdge, getSmoothStepPath, getBezierPath, getStraightPath, useReactFlow } from 'reactflow';
import { X, Tag, Minus, Home, Share2, Spline } from 'lucide-react';

interface CustomEdgeData {
  label?: string;
  onDelete?: () => void;
  onLabelChange?: (label: string) => void;
  onEdgeTypeChange?: (type: string) => void;
  activeEdgeId?: string | null;
  setActiveEdgeId?: (id: string | null) => void;
  edgeType?: 'smoothstep' | 'straight' | 'step' | 'bezier';
}

export const ImprovedCustomEdge: FC<EdgeProps<CustomEdgeData>> = ({
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
  data = {},
  selected
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(String(label || data?.label || ''));
  const [controlPoints, setControlPoints] = useState<{ x: number; y: number }[]>([]);
  const [isDragging, setIsDragging] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const showMenu = data?.activeEdgeId === id;
  const edgeType = data?.edgeType || 'smoothstep';
  const menuRef = useRef<HTMLDivElement>(null);
  const { getZoom, getViewport } = useReactFlow();
  
  // Calculate control points for step edges
  useEffect(() => {
    if (edgeType === 'step') {
      const midX = (sourceX + targetX) / 2;
      setControlPoints([
        { x: midX, y: sourceY },
        { x: midX, y: targetY }
      ]);
    }
  }, [edgeType, sourceX, sourceY, targetX, targetY]);

  // Handle control point dragging
  const handleControlPointMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(index);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging !== null && edgeType === 'step') {
        const svg = document.querySelector('.react-flow__edges svg') as SVGSVGElement;
        if (svg) {
          const pt = (svg as any).createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const svgP = pt.matrixTransform((svg as any).getScreenCTM()?.inverse());
          
          setControlPoints(prev => {
            const newPoints = [...prev];
            if (isDragging === 0) {
              // First control point - moves horizontally
              newPoints[0] = { x: svgP.x, y: sourceY };
              newPoints[1] = { x: svgP.x, y: targetY };
            }
            return newPoints;
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    if (isDragging !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, edgeType, sourceY, targetY]);
  
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
      if (controlPoints.length > 0) {
        // Create custom path with control points
        edgePath = `M ${sourceX},${sourceY} L ${controlPoints[0].x},${sourceY} L ${controlPoints[1].x},${targetY} L ${targetX},${targetY}`;
        labelX = controlPoints[0].x;
        labelY = (sourceY + targetY) / 2;
      } else {
        [edgePath, labelX, labelY] = getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 0,
        });
      }
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
  
  // Calculate screen position for menu
  useEffect(() => {
    if (showMenu && !isEditing) {
      const zoom = getZoom();
      const viewport = getViewport();
      
      // Convert canvas coordinates to screen coordinates
      const screenX = labelX * zoom + viewport.x;
      const screenY = labelY * zoom + viewport.y;
      
      setMenuPosition({ x: screenX, y: screenY });
    } else {
      setMenuPosition(null);
    }
  }, [showMenu, isEditing, labelX, labelY, getZoom, getViewport]);
  
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
  
  const handleLabelDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsEditing(true);
    setEditLabel(String(label || ''));
  };
  
  // Edge style icons
  const edgeStyleIcons = {
    smoothstep: <Share2 className="w-4 h-4" />,
    step: <Home className="w-4 h-4 rotate-90" />,
    straight: <Minus className="w-4 h-4" />,
    bezier: <Spline className="w-4 h-4" />
  };
  
  // Ensure edge always renders even if data is missing
  if (!edgePath) {
    return null;
  }
  
  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: selected || showMenu ? 3 : 2,
          stroke: selected || showMenu ? '#3B82F6' : style?.stroke || '#94a3b8',
          cursor: 'pointer'
        }}
      />
      
      {/* Control points for step edges */}
      {edgeType === 'step' && controlPoints.length > 0 && (selected || showMenu) && (
        <>
          <circle
            cx={controlPoints[0].x}
            cy={controlPoints[0].y}
            r={6}
            fill="#3B82F6"
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'ew-resize' }}
            onMouseDown={handleControlPointMouseDown(0)}
          />
          <circle
            cx={controlPoints[0].x}
            cy={controlPoints[0].y}
            r={12}
            fill="transparent"
            style={{ cursor: 'ew-resize' }}
            onMouseDown={handleControlPointMouseDown(0)}
          />
        </>
      )}
      
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
            <div className="bg-white px-2 py-1 rounded-lg shadow-lg border border-gray-200">
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
            className="nodrag nopan bg-white px-2 py-1 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={handleEdgeClick}
            onDoubleClick={handleLabelDoubleClick}
          >
            {label}
          </div>
        ) : null}
        
        {/* Compact Icon-based Context Menu (Screen-relative positioning) */}
        {showMenu && !isEditing && menuPosition && (
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: menuPosition.x,
              top: menuPosition.y - 40,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'all',
              zIndex: 10000
            }}
            className="nodrag nopan"
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-300 p-1 flex items-center gap-1">
              {/* Label Edit Button */}
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditLabel(String(label || ''));
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                title="Edit Label"
              >
                <Tag className="w-4 h-4 text-gray-700" />
              </button>
              
              {/* Edge Style Buttons */}
              {data?.onEdgeTypeChange && (
                <div className="flex items-center gap-1 border-l border-gray-200 pl-1 ml-1">
                  {Object.entries(edgeStyleIcons).map(([type, icon]) => (
                    <button
                      key={type}
                      onClick={() => data.onEdgeTypeChange?.(type)}
                      className={`p-2 rounded-md transition-colors ${
                        edgeType === type 
                          ? 'bg-blue-100 text-blue-600' 
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                      title={type.charAt(0).toUpperCase() + type.slice(1)}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Delete Button */}
              {data?.onDelete && (
                <button
                  onClick={handleDelete}
                  className="p-2 hover:bg-red-50 rounded-md transition-colors ml-1 border-l border-gray-200"
                  title="Delete Edge"
                >
                  <X className="w-4 h-4 text-red-600" />
                </button>
              )}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};