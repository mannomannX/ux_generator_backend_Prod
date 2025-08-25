import { FC, useState, useEffect, useRef } from 'react';
import { EdgeProps, EdgeLabelRenderer, BaseEdge, getSmoothStepPath, getBezierPath, getStraightPath, useReactFlow, MarkerType, Connection, Position } from 'reactflow';
import { X, Tag, Minus, Home, Share2, Spline, Palette, ArrowRight, ArrowUpDown, GripVertical, Trash2, Check } from 'lucide-react';

interface CustomEdgeData {
  label?: string;
  onDelete?: () => void;
  onLabelChange?: (label: string) => void;
  onEdgeTypeChange?: (type: string) => void;
  onColorChange?: (color: string) => void;
  activeEdgeId?: string | null;
  setActiveEdgeId?: (id: string | null) => void;
  edgeType?: 'smoothstep' | 'straight' | 'bezier';
  color?: string;
  bidirectional?: boolean;
  animated?: boolean;
}

const edgeColors = [
  { name: 'Gray', value: '#94a3b8' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Yellow', value: '#F59E0B' },
  { name: 'Indigo', value: '#6366F1' }
];

export const EnhancedCustomEdge: FC<EdgeProps<CustomEdgeData>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart,
  label,
  data = {},
  selected,
  source,
  target,
  sourceHandleId,
  targetHandleId
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(String(label || data?.label || ''));
  const [isDraggingEndpoint, setIsDraggingEndpoint] = useState<'source' | 'target' | null>(null);
  const [dragPreviewPoint, setDragPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; handleId: string; x: number; y: number } | null>(null);
  const [hoveredEndpoint, setHoveredEndpoint] = useState<'source' | 'target' | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const showMenu = selected;
  const edgeType = data?.edgeType || 'smoothstep';
  const edgeColor = data?.color || style?.stroke || '#94a3b8';
  const isBidirectional = data?.bidirectional || false;
  const menuRef = useRef<HTMLDivElement>(null);
  const { getZoom, getViewport, getNodes, setEdges, getEdges, screenToFlowPosition } = useReactFlow();
  
  // Store the last drag position for final update
  const lastDragPosition = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Handle endpoint dragging for reconnecting edges
      if (isDraggingEndpoint) {
        const point = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        
        // Set preview point for visual feedback
        setDragPreviewPoint(point);
        lastDragPosition.current = point;
        
        // Find the closest node and handle for snapping
        const nodes = getNodes();
        let closestNode = null;
        let closestDistance = Infinity;
        let closestHandleId = null;
        let snapPoint = null;
        
        nodes.forEach(node => {
          if (node.position && node.width && node.height) {
            // Check each handle position
            const handles = [
              { id: 'top', x: node.position.x + node.width / 2, y: node.position.y },
              { id: 'right', x: node.position.x + node.width, y: node.position.y + node.height / 2 },
              { id: 'bottom', x: node.position.x + node.width / 2, y: node.position.y + node.height },
              { id: 'left', x: node.position.x, y: node.position.y + node.height / 2 }
            ];
            
            handles.forEach(handle => {
              const distance = Math.sqrt(
                Math.pow(handle.x - point.x, 2) + 
                Math.pow(handle.y - point.y, 2)
              );
              
              // Snap if within 50px of a handle
              if (distance < 50 && distance < closestDistance) {
                closestDistance = distance;
                closestNode = node;
                closestHandleId = handle.id;
                snapPoint = { x: handle.x, y: handle.y };
              }
            });
          }
        });
        
        // Set snap target for visual feedback
        if (closestNode && snapPoint) {
          setSnapTarget({
            nodeId: closestNode.id,
            handleId: closestHandleId,
            x: snapPoint.x,
            y: snapPoint.y
          });
        } else {
          setSnapTarget(null);
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Finalize edge connection
      if (isDraggingEndpoint) {
        const finalPoint = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const nodes = getNodes();
        
        // Find the closest node and handle at release position
        let closestNode = null;
        let closestDistance = Infinity;
        let closestHandleId = null;
        
        nodes.forEach(node => {
          if (node.position && node.width && node.height) {
            // Check each handle position
            const handles = [
              { id: 'top', x: node.position.x + node.width / 2, y: node.position.y },
              { id: 'right', x: node.position.x + node.width, y: node.position.y + node.height / 2 },
              { id: 'bottom', x: node.position.x + node.width / 2, y: node.position.y + node.height },
              { id: 'left', x: node.position.x, y: node.position.y + node.height / 2 }
            ];
            
            handles.forEach(handle => {
              const distance = Math.sqrt(
                Math.pow(handle.x - finalPoint.x, 2) + 
                Math.pow(handle.y - finalPoint.y, 2)
              );
              
              // Accept connections within 80px
              if (distance < 80 && distance < closestDistance) {
                closestDistance = distance;
                closestNode = node;
                closestHandleId = handle.id;
              }
            });
          }
        });
        
        // Update the edge if we found a valid target
        if (closestNode && closestHandleId) {
          setEdges(edges => {
            const updatedEdges = edges.map(edge => {
              if (edge.id === id) {
                const updatedEdge = { ...edge };
                
                if (isDraggingEndpoint === 'source') {
                  updatedEdge.source = closestNode.id;
                  updatedEdge.sourceHandle = closestHandleId;
                  if (updatedEdge.data) {
                    updatedEdge.data = {
                      ...updatedEdge.data,
                      sourceHandle: closestHandleId
                    };
                  }
                } else {
                  updatedEdge.target = closestNode.id;
                  updatedEdge.targetHandle = closestHandleId;
                  if (updatedEdge.data) {
                    updatedEdge.data = {
                      ...updatedEdge.data,
                      targetHandle: closestHandleId
                    };
                  }
                }
                
                return updatedEdge;
              }
              return edge;
            });
            
            return updatedEdges;
          });
        }
      }
      
      // Reset all drag states
      setIsDraggingEndpoint(null);
      setDragPreviewPoint(null);
      setSnapTarget(null);
      lastDragPosition.current = null;
    };

    if (isDraggingEndpoint !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingEndpoint, edgeType, sourceY, targetY, getNodes, setEdges, screenToFlowPosition, id, snapTarget]);
  
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
  
  // Close color picker when menu closes
  useEffect(() => {
    if (!showMenu) {
      setShowColorPicker(false);
    }
  }, [showMenu]);
  
  const handleDelete = () => {
    if (data?.onDelete) {
      data.onDelete();
    }
  };
  
  const handleLabelSave = () => {
    if (data?.onLabelChange) {
      data.onLabelChange(String(editLabel));
    }
    setIsEditing(false);
  };
  
  const handleColorChange = (color: string) => {
    if (data?.onColorChange) {
      data.onColorChange(color);
    }
  };
  
  const handleLabelDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setIsEditing(true);
    setEditLabel(String(label || data?.label || ''));
  };
  
  // Edge style icons
  const edgeStyleIcons = {
    smoothstep: <Share2 className="w-4 h-4" />,
    straight: <Minus className="w-4 h-4" />,
    bezier: <Spline className="w-4 h-4" />
  };
  
  // Create unique marker IDs based on edge ID and color
  const markerEndId = `arrow-${id}-end-${edgeColor.replace('#', '')}`;
  const markerStartId = isBidirectional ? `arrow-${id}-start-${edgeColor.replace('#', '')}` : undefined;
  
  // Ensure edge always renders even if data is missing
  if (!edgePath) {
    return null;
  }
  
  return (
    <>
      {/* Define SVG markers for arrow heads */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <marker
            id={markerEndId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 L 2 5 Z"
              fill={edgeColor}
              stroke={edgeColor}
            />
          </marker>
          {isBidirectional && (
            <marker
              id={markerStartId}
              markerWidth="10"
              markerHeight="10"
              refX="2"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M 10 0 L 0 5 L 10 10 L 8 5 Z"
                fill={edgeColor}
                stroke={edgeColor}
              />
            </marker>
          )}
        </defs>
      </svg>
      
      {/* Original edge - completely hidden while dragging */}
      <BaseEdge
        path={edgePath}
        markerEnd={isDraggingEndpoint ? undefined : `url(#${markerEndId})`}
        markerStart={isDraggingEndpoint ? undefined : (isBidirectional ? `url(#${markerStartId})` : undefined)}
        style={{
          ...style,
          strokeWidth: selected || showMenu ? 3 : 2,
          stroke: isDraggingEndpoint ? 'transparent' : (selected || showMenu ? (edgeColor === '#94a3b8' ? '#3B82F6' : edgeColor) : edgeColor),
          cursor: 'pointer',
          strokeDasharray: data?.animated ? '5 5' : undefined,
          opacity: isDraggingEndpoint ? 0 : 1,
        }}
      />
      
      {/* Drag preview when dragging endpoints - COMPLETELY CUSTOM */}
      {isDraggingEndpoint && dragPreviewPoint && (
        <g>
          {/* Define arrow marker for target dragging */}
          {isDraggingEndpoint === 'target' && (
            <defs>
              <marker
                id={`drag-preview-arrow-${id}`}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 L 2 5 Z"
                  fill={snapTarget ? "#10B981" : "#3B82F6"}
                  stroke={snapTarget ? "#10B981" : "#3B82F6"}
                />
              </marker>
            </defs>
          )}
          
          {/* Preview line - use snap point if available and proper edge type */}
          {(() => {
            const previewX = snapTarget ? snapTarget.x : dragPreviewPoint.x;
            const previewY = snapTarget ? snapTarget.y : dragPreviewPoint.y;
            let previewPath = '';
            
            // Determine the position based on snap target handle
            const getPositionFromHandle = (handleId: string) => {
              switch(handleId) {
                case 'top': return Position.Top;
                case 'right': return Position.Right;
                case 'bottom': return Position.Bottom;
                case 'left': return Position.Left;
                default: return Position.Right;
              }
            };
            
            if (isDraggingEndpoint === 'source') {
              // SOURCE DRAG: Line from NEW position to CURRENT target
              const newSourcePosition = snapTarget ? getPositionFromHandle(snapTarget.handleId) : sourcePosition;
              
              switch (edgeType) {
                case 'straight':
                  previewPath = `M ${previewX},${previewY} L ${targetX},${targetY}`;
                  break;
                case 'bezier':
                  const [bezierPath] = getBezierPath({
                    sourceX: previewX,
                    sourceY: previewY,
                    sourcePosition: newSourcePosition,
                    targetX,
                    targetY,
                    targetPosition
                  });
                  previewPath = bezierPath;
                  break;
                case 'smoothstep':
                default:
                  const [smoothPath] = getSmoothStepPath({
                    sourceX: previewX,
                    sourceY: previewY,
                    sourcePosition: newSourcePosition,
                    targetX,
                    targetY,
                    targetPosition,
                    borderRadius: 10
                  });
                  previewPath = smoothPath;
                  break;
              }
              
              // NO ARROW for source dragging
              return (
                <path
                  d={previewPath}
                  fill="none"
                  stroke={snapTarget ? "#10B981" : "#3B82F6"}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  opacity={0.7}
                />
              );
            } else {
              // TARGET DRAG: Line from CURRENT source to NEW position
              const newTargetPosition = snapTarget ? getPositionFromHandle(snapTarget.handleId) : targetPosition;
              
              switch (edgeType) {
                case 'straight':
                  previewPath = `M ${sourceX},${sourceY} L ${previewX},${previewY}`;
                  break;
                case 'bezier':
                  const [bezierPath] = getBezierPath({
                    sourceX,
                    sourceY,
                    sourcePosition,
                    targetX: previewX,
                    targetY: previewY,
                    targetPosition: newTargetPosition
                  });
                  previewPath = bezierPath;
                  break;
                case 'smoothstep':
                default:
                  const [smoothPath] = getSmoothStepPath({
                    sourceX,
                    sourceY,
                    sourcePosition,
                    targetX: previewX,
                    targetY: previewY,
                    targetPosition: newTargetPosition,
                    borderRadius: 10
                  });
                  previewPath = smoothPath;
                  break;
              }
              
              // WITH ARROW for target dragging
              return (
                <path
                  d={previewPath}
                  fill="none"
                  stroke={snapTarget ? "#10B981" : "#3B82F6"}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  markerEnd={`url(#drag-preview-arrow-${id})`}
                  opacity={0.7}
                />
              );
            }
          })()}
          
          {/* Visual indicator at drag position */}
          <circle
            cx={snapTarget ? snapTarget.x : dragPreviewPoint.x}
            cy={snapTarget ? snapTarget.y : dragPreviewPoint.y}
            r={snapTarget ? 8 : 6}
            fill="white"
            stroke={snapTarget ? "#10B981" : "#3B82F6"}
            strokeWidth={3}
          />
          
          {/* Snap indicator */}
          {snapTarget && (
            <circle
              cx={snapTarget.x}
              cy={snapTarget.y}
              r={12}
              fill="none"
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="2 2"
              opacity={0.5}
            >
              <animate
                attributeName="r"
                from="12"
                to="16"
                dur="0.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      )}
      
      {/* Edge endpoint grabbers with visual and interactive elements combined */}
      {(selected || showMenu) && (
        <>
          {/* Source endpoint (start - NO arrow here) */}
          <g>
            {/* Visible circles first */}
            <circle
              cx={sourceX}
              cy={sourceY}
              r={8}
              fill={hoveredEndpoint === 'source' ? "#3B82F6" : "#6B7280"}
              stroke="white"
              strokeWidth={2}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={sourceX}
              cy={sourceY}
              r={3}
              fill="white"
              style={{ pointerEvents: 'none' }}
            />
            {/* Grab area on top - SAME EXACT POSITION */}
            <circle
              cx={sourceX}
              cy={sourceY}
              r={20}
              fill="transparent"
              stroke="transparent"
              strokeWidth={0}
              style={{ cursor: 'grab' }}
              pointerEvents="all"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingEndpoint('source');
              }}
              onMouseEnter={() => setHoveredEndpoint('source')}
              onMouseLeave={() => setHoveredEndpoint(null)}
            />
          </g>
          
          {/* Target endpoint (end - WITH arrow) */}
          <g>
            {/* Visible circles first */}
            <circle
              cx={targetX}
              cy={targetY}
              r={8}
              fill={hoveredEndpoint === 'target' ? "#3B82F6" : "#6B7280"}
              stroke="white"
              strokeWidth={2}
              opacity={0.9}
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={targetX}
              cy={targetY}
              r={3}
              fill="white"
              style={{ pointerEvents: 'none' }}
            />
            {/* Grab area on top - SAME EXACT POSITION */}
            <circle
              cx={targetX}
              cy={targetY}
              r={20}
              fill="transparent"
              stroke="transparent"
              strokeWidth={0}
              style={{ cursor: 'grab' }}
              pointerEvents="all"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingEndpoint('target');
              }}
              onMouseEnter={() => setHoveredEndpoint('target')}
              onMouseLeave={() => setHoveredEndpoint(null)}
            />
          </g>
        </>
      )}
      
      {/* Invisible wider click area for better UX - ALWAYS active */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onDoubleClick={(e) => {
          if (!label) {
            e.stopPropagation();
            setIsEditing(true);
            setEditLabel('');
          }
        }}
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
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLabelSave();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditing(false);
                    setEditLabel(String(label || data?.label || ''));
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
              
              {/* Edge Style Toggle (Solid/Dashed) */}
              <button
                onClick={() => {
                  if (data?.onColorChange) {
                    // Toggle between solid and dashed
                    data.onColorChange(data?.animated ? 'solid' : 'dashed');
                  }
                }}
                className={`p-2 rounded-md transition-colors ml-1 border-l border-gray-200 ${
                  data?.animated 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                title={data?.animated ? "Dashed Line" : "Solid Line"}
              >
                {data?.animated ? (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <line x1="0" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="2"/>
                    <line x1="5" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="2"/>
                    <line x1="10" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="2"/>
                    <line x1="15" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <line x1="0" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                )}
              </button>
              
              {/* Bidirectional Toggle */}
              <button
                onClick={() => {
                  if (data?.onColorChange) {
                    // Use color change handler to toggle bidirectional
                    data.onColorChange(isBidirectional ? 'unidirectional' : 'bidirectional');
                  }
                }}
                className={`p-2 rounded-md transition-colors ml-1 border-l border-gray-200 ${
                  isBidirectional 
                    ? 'bg-purple-100 text-purple-600' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                title={isBidirectional ? "Bidirectional" : "Unidirectional"}
              >
                {isBidirectional ? <ArrowUpDown className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
              
              {/* Color Picker Button */}
              {data?.onColorChange && (
                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors ml-1 border-l border-gray-200"
                    title="Edge Color"
                  >
                    <Palette className="w-4 h-4" style={{ color: edgeColor }} />
                  </button>
                  
                  {showColorPicker && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-white rounded-lg shadow-xl border border-gray-300 p-2">
                      <div className="flex items-center gap-1">
                        {edgeColors.map(color => (
                          <button
                            key={color.value}
                            onClick={() => {
                              handleColorChange(color.value);
                              setShowColorPicker(false);
                            }}
                            className="relative w-6 h-6 rounded hover:scale-110 transition-transform border-2"
                            style={{ 
                              backgroundColor: color.value,
                              borderColor: edgeColor === color.value ? '#3B82F6' : '#e5e7eb'
                            }}
                            title={color.name}
                          >
                            {edgeColor === color.value && (
                              <Check className="w-3 h-3 text-white absolute inset-0 m-auto drop-shadow" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Delete Button */}
              {data?.onDelete && (
                <button
                  onClick={handleDelete}
                  className="p-2 hover:bg-red-50 rounded-md transition-colors ml-1 border-l border-gray-200"
                  title="Delete Edge"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              )}
              
              {/* Close Menu Button */}
              <button
                onClick={() => {
                  // Deselect the edge
                  setEdges(edges => edges.map(e => 
                    e.id === id ? { ...e, selected: false } : e
                  ));
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors ml-1 border-l border-gray-200"
                title="Close Menu"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};