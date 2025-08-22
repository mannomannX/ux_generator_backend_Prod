import { useState, useCallback } from 'react';
import { Node, useReactFlow, useStore } from 'reactflow';
import { AlignmentGuide } from '@/components/canvas/AlignmentGuides';

const SNAP_THRESHOLD = 10; // Pixels within which nodes will snap

interface AlignmentResult {
  guides: AlignmentGuide[];
  snappedPosition: { x: number; y: number } | null;
}

export const useAlignmentGuides = () => {
  const { getNodes, getViewport } = useReactFlow();
  const transform = useStore((state) => state.transform);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const findAlignments = useCallback((
    draggedNode: Node,
    draggedPosition: { x: number; y: number }
  ): AlignmentResult => {
    const nodes = getNodes().filter(n => n.id !== draggedNode.id && n.type !== 'frame');
    const guides: AlignmentGuide[] = [];
    let snappedX = draggedPosition.x;
    let snappedY = draggedPosition.y;
    let hasSnappedX = false;
    let hasSnappedY = false;

    // Get viewport for coordinate transformation
    const viewport = getViewport();
    const zoom = viewport.zoom;
    const panX = viewport.x;
    const panY = viewport.y;

    const draggedWidth = draggedNode.width || 180;
    const draggedHeight = draggedNode.height || 80;

    // Calculate dragged node boundaries
    const draggedLeft = draggedPosition.x;
    const draggedRight = draggedPosition.x + draggedWidth;
    const draggedTop = draggedPosition.y;
    const draggedBottom = draggedPosition.y + draggedHeight;
    const draggedCenterX = draggedPosition.x + draggedWidth / 2;
    const draggedCenterY = draggedPosition.y + draggedHeight / 2;

    nodes.forEach(node => {
      if (!node.position) return;
      
      const nodeWidth = node.width || 180;
      const nodeHeight = node.height || 80;
      
      // Calculate node boundaries
      const nodeLeft = node.position.x;
      const nodeRight = node.position.x + nodeWidth;
      const nodeTop = node.position.y;
      const nodeBottom = node.position.y + nodeHeight;
      const nodeCenterX = node.position.x + nodeWidth / 2;
      const nodeCenterY = node.position.y + nodeHeight / 2;

      // Transform node position to screen coordinates for guide display
      const nodeScreenLeft = nodeLeft * zoom + panX;
      const nodeScreenRight = nodeRight * zoom + panX;
      const nodeScreenCenterX = nodeCenterX * zoom + panX;
      
      // Vertical alignments (left, center, right)
      if (!hasSnappedX) {
        // Left edge alignment
        if (Math.abs(draggedLeft - nodeLeft) < SNAP_THRESHOLD) {
          guides.push({
            type: 'vertical',
            position: nodeScreenLeft,
            nodes: [draggedNode.id, node.id]
          });
          snappedX = nodeLeft;
          hasSnappedX = true;
        }
        // Right edge alignment
        else if (Math.abs(draggedRight - nodeRight) < SNAP_THRESHOLD) {
          guides.push({
            type: 'vertical',
            position: nodeScreenRight,
            nodes: [draggedNode.id, node.id]
          });
          snappedX = nodeRight - draggedWidth;
          hasSnappedX = true;
        }
        // Center alignment
        else if (Math.abs(draggedCenterX - nodeCenterX) < SNAP_THRESHOLD) {
          guides.push({
            type: 'vertical',
            position: nodeScreenCenterX,
            nodes: [draggedNode.id, node.id]
          });
          snappedX = nodeCenterX - draggedWidth / 2;
          hasSnappedX = true;
        }
        // Left to right alignment
        else if (Math.abs(draggedLeft - nodeRight) < SNAP_THRESHOLD) {
          guides.push({
            type: 'vertical',
            position: nodeScreenRight,
            nodes: [draggedNode.id, node.id]
          });
          snappedX = nodeRight;
          hasSnappedX = true;
        }
        // Right to left alignment
        else if (Math.abs(draggedRight - nodeLeft) < SNAP_THRESHOLD) {
          guides.push({
            type: 'vertical',
            position: nodeScreenLeft,
            nodes: [draggedNode.id, node.id]
          });
          snappedX = nodeLeft - draggedWidth;
          hasSnappedX = true;
        }
      }

      // Transform node position to screen coordinates for guide display
      const nodeScreenTop = nodeTop * zoom + panY;
      const nodeScreenBottom = nodeBottom * zoom + panY;
      const nodeScreenCenterY = nodeCenterY * zoom + panY;
      
      // Horizontal alignments (top, middle, bottom)
      if (!hasSnappedY) {
        // Top edge alignment
        if (Math.abs(draggedTop - nodeTop) < SNAP_THRESHOLD) {
          guides.push({
            type: 'horizontal',
            position: nodeScreenTop,
            nodes: [draggedNode.id, node.id]
          });
          snappedY = nodeTop;
          hasSnappedY = true;
        }
        // Bottom edge alignment
        else if (Math.abs(draggedBottom - nodeBottom) < SNAP_THRESHOLD) {
          guides.push({
            type: 'horizontal',
            position: nodeScreenBottom,
            nodes: [draggedNode.id, node.id]
          });
          snappedY = nodeBottom - draggedHeight;
          hasSnappedY = true;
        }
        // Middle alignment
        else if (Math.abs(draggedCenterY - nodeCenterY) < SNAP_THRESHOLD) {
          guides.push({
            type: 'horizontal',
            position: nodeScreenCenterY,
            nodes: [draggedNode.id, node.id]
          });
          snappedY = nodeCenterY - draggedHeight / 2;
          hasSnappedY = true;
        }
        // Top to bottom alignment
        else if (Math.abs(draggedTop - nodeBottom) < SNAP_THRESHOLD) {
          guides.push({
            type: 'horizontal',
            position: nodeScreenBottom,
            nodes: [draggedNode.id, node.id]
          });
          snappedY = nodeBottom;
          hasSnappedY = true;
        }
        // Bottom to top alignment
        else if (Math.abs(draggedBottom - nodeTop) < SNAP_THRESHOLD) {
          guides.push({
            type: 'horizontal',
            position: nodeScreenTop,
            nodes: [draggedNode.id, node.id]
          });
          snappedY = nodeTop - draggedHeight;
          hasSnappedY = true;
        }
      }
    });

    return {
      guides,
      snappedPosition: (hasSnappedX || hasSnappedY) 
        ? { x: snappedX, y: snappedY }
        : null
    };
  }, [getNodes, getViewport]);

  const onNodeDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (!isDragging) return;
    
    const position = { x: node.position.x, y: node.position.y };
    const { guides } = findAlignments(node, position);
    
    // Debug logging
    if (guides.length > 0) {
      console.log('Alignment guides found:', guides);
    }
    
    setActiveGuides(guides);
  }, [isDragging, findAlignments]);

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    const position = { x: node.position.x, y: node.position.y };
    const { snappedPosition } = findAlignments(node, position);
    
    // Clear guides after a short delay for smooth transition
    setTimeout(() => {
      setActiveGuides([]);
      setIsDragging(false);
    }, 200);

    // Return the snapped position if any
    return snappedPosition || position;
  }, [findAlignments]);

  return {
    guides: activeGuides,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    findAlignments
  };
};