import { memo, FC, useState, useCallback, useEffect, useRef } from 'react';
import { NodeProps, useReactFlow } from 'reactflow';
import { Lock, Unlock } from 'lucide-react';
import { UXFlowNode } from '@/types/uxflow';

interface FrameNodeData extends UXFlowNode {
  locked?: boolean;
}

interface FrameNodeProps extends NodeProps {
  data: FrameNodeData;
}

export const FrameNode: FC<FrameNodeProps> = memo(({ 
  data, 
  selected, 
  id,
  xPos,
  yPos,
  dragging,
  isConnectable,
  ...props
}) => {
  const { getNodes, setNodes, getZoom } = useReactFlow();
  const [isResizing, setIsResizing] = useState(false);
  const [isLocked, setIsLocked] = useState(data.locked || false);
  const [showLockButton, setShowLockButton] = useState(false);
  const [frameSize, setFrameSize] = useState({
    width: data.size?.width || 600,
    height: data.size?.height || 400
  });
  
  // Sync frame size with data
  useEffect(() => {
    if (data.size?.width && data.size?.height) {
      setFrameSize({
        width: data.size.width,
        height: data.size.height
      });
    }
  }, [data.size]);
  const [containedNodes, setContainedNodes] = useState<string[]>(
    data.data?.containedNodes || []
  );
  
  // Store previous position for calculating delta
  const prevPosition = useRef({ x: xPos || 0, y: yPos || 0 });
  const isDraggingRef = useRef(false);
  const dragStartNodesRef = useRef<string[]>([]);

  // Update contained nodes based on position and size
  useEffect(() => {
    // Don't update while dragging, resizing or if locked
    if (isLocked || isResizing || dragging) return;
    
    const nodes = getNodes();
    const frameX = xPos || 0;
    const frameY = yPos || 0;
    const frameRight = frameX + frameSize.width;
    const frameBottom = frameY + frameSize.height;
    
    const newContainedNodes: string[] = [];
    
    nodes.forEach(node => {
      if (node.id === id || node.type === 'frame') return;
      
      const nodeX = node.position.x;
      const nodeY = node.position.y;
      const nodeWidth = node.data?.size?.width || 180;
      const nodeHeight = node.data?.size?.height || 80;
      const nodeRight = nodeX + nodeWidth;
      const nodeBottom = nodeY + nodeHeight;
      
      // Check if node is fully contained within frame
      if (
        nodeX >= frameX &&
        nodeY >= frameY &&
        nodeRight <= frameRight &&
        nodeBottom <= frameBottom
      ) {
        newContainedNodes.push(node.id);
      }
    });
    
    if (JSON.stringify(newContainedNodes) !== JSON.stringify(containedNodes)) {
      setContainedNodes(newContainedNodes);
      
      // Update the frame node data
      setNodes(nodes => nodes.map(n => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              data: {
                ...n.data.data,
                containedNodes: newContainedNodes
              }
            }
          };
        }
        return n;
      }));
    }
  }, [xPos, yPos, frameSize, isLocked, isResizing, dragging, getNodes, setNodes, id]);

  // Move contained nodes with frame
  useEffect(() => {
    if (!dragging) {
      isDraggingRef.current = false;
      dragStartNodesRef.current = [];
      return;
    }
    
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      prevPosition.current = { x: xPos || 0, y: yPos || 0 };
      // Freeze the contained nodes at the start of dragging
      dragStartNodesRef.current = [...containedNodes];
      return;
    }
    
    const deltaX = (xPos || 0) - prevPosition.current.x;
    const deltaY = (yPos || 0) - prevPosition.current.y;
    
    if (deltaX === 0 && deltaY === 0) return;
    
    // Move only the nodes that were contained at the start of dragging
    setNodes(nodes => nodes.map(node => {
      if (dragStartNodesRef.current.includes(node.id)) {
        return {
          ...node,
          position: {
            x: node.position.x + deltaX,
            y: node.position.y + deltaY
          }
        };
      }
      return node;
    }));
    
    prevPosition.current = { x: xPos || 0, y: yPos || 0 };
  }, [xPos, yPos, dragging, containedNodes, setNodes]);

  const handleResize = useCallback((direction: string) => (event: React.MouseEvent) => {
    if (isLocked) return;
    
    event.stopPropagation();
    event.preventDefault();
    setIsResizing(true);

    const zoom = getZoom();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = frameSize.width;
    const startHeight = frameSize.height;
    const startPosX = xPos || 0;
    const startPosY = yPos || 0;

    const handleMouseMove = (e: MouseEvent) => {
      // Adjust delta values by zoom level for 1:1 cursor tracking
      const deltaX = (e.clientX - startX) / zoom;
      const deltaY = (e.clientY - startY) / zoom;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPosX;
      let newY = startPosY;

      switch (direction) {
        // Corners
        case 'se':
          newWidth = Math.max(200, startWidth + deltaX);
          newHeight = Math.max(150, startHeight + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(200, startWidth - deltaX);
          newHeight = Math.max(150, startHeight + deltaY);
          newX = startPosX + deltaX;
          break;
        case 'ne':
          newWidth = Math.max(200, startWidth + deltaX);
          newHeight = Math.max(150, startHeight - deltaY);
          newY = startPosY + deltaY;
          break;
        case 'nw':
          newWidth = Math.max(200, startWidth - deltaX);
          newHeight = Math.max(150, startHeight - deltaY);
          newX = startPosX + deltaX;
          newY = startPosY + deltaY;
          break;
        // Sides
        case 'e':
          newWidth = Math.max(200, startWidth + deltaX);
          break;
        case 'w':
          newWidth = Math.max(200, startWidth - deltaX);
          newX = startPosX + deltaX;
          break;
        case 's':
          newHeight = Math.max(150, startHeight + deltaY);
          break;
        case 'n':
          newHeight = Math.max(150, startHeight - deltaY);
          newY = startPosY + deltaY;
          break;
      }

      // Update frame size immediately for instant visual feedback
      setFrameSize({ width: newWidth, height: newHeight });
      
      // Then update the node data for persistence
      if (direction.includes('w') || direction.includes('n')) {
        setNodes(nodes => nodes.map(n => {
          if (n.id === id) {
            return {
              ...n,
              position: {
                x: direction.includes('w') ? newX : n.position.x,
                y: direction.includes('n') ? newY : n.position.y
              },
              data: {
                ...n.data,
                size: { width: newWidth, height: newHeight }
              }
            };
          }
          return n;
        }));
      } else {
        // Only update size
        setNodes(nodes => nodes.map(n => {
          if (n.id === id) {
            return {
              ...n,
              data: {
                ...n.data,
                size: { width: newWidth, height: newHeight }
              }
            };
          }
          return n;
        }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [frameSize, isLocked, id, setNodes, xPos, yPos, getZoom]);

  const toggleLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLocked(!isLocked);
    setNodes(nodes => nodes.map(n => {
      if (n.id === id) {
        return {
          ...n,
          data: {
            ...n.data,
            locked: !isLocked
          }
        };
      }
      return n;
    }));
  }, [isLocked, id, setNodes]);

  const containedNodesCount = containedNodes.length;

  return (
    <>
      {/* Frame label outside the frame */}
      <div 
        className="absolute flex items-center gap-2 select-none"
        style={{
          top: -25,
          left: 0,
          pointerEvents: 'none'
        }}
      >
        <div className="text-sm font-medium text-blue-600">
          {data.title || 'Frame'}
        </div>
        <div className="text-xs text-gray-500">
          ({containedNodesCount} nodes)
        </div>
      </div>

      {/* Lock button - show on hover or when selected */}
      {(showLockButton || selected) && (
        <button
          onClick={toggleLock}
          className="absolute p-1 bg-white hover:bg-gray-100 rounded shadow-sm transition-opacity z-10"
          style={{
            top: -25,
            right: 0,
            pointerEvents: 'auto'
          }}
          title={isLocked ? 'Unlock frame' : 'Lock frame'}
        >
          {isLocked ? (
            <Lock className="w-3 h-3 text-gray-600" />
          ) : (
            <Unlock className="w-3 h-3 text-gray-600" />
          )}
        </button>
      )}

      <div
        id={`frame-${id}`}
        className={`
          relative rounded-lg border-2 border-dashed
          ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
          ${isResizing ? 'select-none' : ''}
        `}
        style={{
          width: frameSize.width,
          height: frameSize.height,
          backgroundColor: data.style?.backgroundColor || 'rgba(147, 197, 253, 0.05)',
          borderColor: data.style?.borderColor || '#3B82F6',
          borderRadius: data.style?.borderRadius || 8,
          pointerEvents: 'none',
          zIndex: -10
        }}
      >
        {/* Border areas for hover detection */}
        <div 
          className="nodrag nopan absolute inset-x-0 top-0 h-4"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => setShowLockButton(true)}
          onMouseLeave={() => setShowLockButton(false)}
        />
        <div 
          className="nodrag nopan absolute inset-x-0 bottom-0 h-4"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => setShowLockButton(true)}
          onMouseLeave={() => setShowLockButton(false)}
        />
        <div 
          className="nodrag nopan absolute inset-y-0 left-0 w-4"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => setShowLockButton(true)}
          onMouseLeave={() => setShowLockButton(false)}
        />
        <div 
          className="nodrag nopan absolute inset-y-0 right-0 w-4"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => setShowLockButton(true)}
          onMouseLeave={() => setShowLockButton(false)}
        />

      {/* Resize handles */}
      {!isLocked && (
        <>
          {/* Corners */}
          <div
            onMouseDown={handleResize('se')}
            className="nodrag nopan absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ borderRadius: '0 0 6px 0', pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('sw')}
            className="nodrag nopan absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ borderRadius: '0 0 0 6px', pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('ne')}
            className="nodrag nopan absolute top-0 right-0 w-4 h-4 cursor-ne-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ borderRadius: '0 6px 0 0', pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('nw')}
            className="nodrag nopan absolute top-0 left-0 w-4 h-4 cursor-nw-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ borderRadius: '6px 0 0 0', pointerEvents: 'auto' }}
          />
          
          {/* Sides */}
          <div
            onMouseDown={handleResize('e')}
            className="nodrag nopan absolute top-4 bottom-4 right-0 w-2 cursor-ew-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('w')}
            className="nodrag nopan absolute top-4 bottom-4 left-0 w-2 cursor-ew-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('s')}
            className="nodrag nopan absolute left-4 right-4 bottom-0 h-2 cursor-ns-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ pointerEvents: 'auto' }}
          />
          <div
            onMouseDown={handleResize('n')}
            className="nodrag nopan absolute left-4 right-4 top-0 h-2 cursor-ns-resize bg-blue-500 opacity-0 hover:opacity-50"
            style={{ pointerEvents: 'auto' }}
          />
        </>
      )}
      </div>
    </>
  );
});

FrameNode.displayName = 'FrameNode';