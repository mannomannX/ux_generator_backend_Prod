import { Node, Edge, Position } from 'reactflow';

/**
 * Determines the best handle positions for connecting two nodes
 * to minimize edge crossing and create clean layouts
 */
export function getSmartHandlePositions(
  sourceNode: Node,
  targetNode: Node
): { sourceHandle: string; targetHandle: string } {
  const sourceX = sourceNode.position.x;
  const sourceY = sourceNode.position.y;
  const sourceWidth = sourceNode.width || sourceNode.data?.size?.width || 180;
  const sourceHeight = sourceNode.height || sourceNode.data?.size?.height || 80;
  
  const targetX = targetNode.position.x;
  const targetY = targetNode.position.y;
  const targetWidth = targetNode.width || targetNode.data?.size?.width || 180;
  const targetHeight = targetNode.height || targetNode.data?.size?.height || 80;
  
  // Calculate centers
  const sourceCenterX = sourceX + sourceWidth / 2;
  const sourceCenterY = sourceY + sourceHeight / 2;
  const targetCenterX = targetX + targetWidth / 2;
  const targetCenterY = targetY + targetHeight / 2;
  
  // Calculate relative position
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;
  
  // Determine optimal connection points
  let sourceHandle = 'source-right';
  let targetHandle = 'target-left';
  
  // Horizontal distance is more significant
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX > 0) {
      // Target is to the right
      sourceHandle = 'source-right';
      targetHandle = 'target-left';
    } else {
      // Target is to the left
      sourceHandle = 'source-left';
      targetHandle = 'target-right';
    }
  } else {
    // Vertical distance is more significant
    if (deltaY > 0) {
      // Target is below
      sourceHandle = 'source-bottom';
      targetHandle = 'target-top';
    } else {
      // Target is above
      sourceHandle = 'source-top';
      targetHandle = 'target-bottom';
    }
  }
  
  return { sourceHandle, targetHandle };
}

/**
 * Updates edge connections to use smart routing
 */
export function updateEdgeWithSmartRouting(
  edge: Edge,
  nodes: Node[]
): Edge {
  const sourceNode = nodes.find(n => n.id === edge.source);
  const targetNode = nodes.find(n => n.id === edge.target);
  
  if (!sourceNode || !targetNode) {
    return edge;
  }
  
  const { sourceHandle, targetHandle } = getSmartHandlePositions(sourceNode, targetNode);
  
  return {
    ...edge,
    sourceHandle,
    targetHandle,
    type: 'smoothstep' // Use smoothstep for better routing around obstacles
  };
}

/**
 * Optimizes all edges in a flow for better visual appearance
 */
export function optimizeEdgeRouting(edges: Edge[], nodes: Node[]): Edge[] {
  return edges.map(edge => updateEdgeWithSmartRouting(edge, nodes));
}

/**
 * Checks if two edges would likely cross based on their node positions
 */
export function wouldEdgesCross(
  edge1: { source: Node; target: Node },
  edge2: { source: Node; target: Node }
): boolean {
  // Simple line intersection check
  const line1 = {
    x1: edge1.source.position.x,
    y1: edge1.source.position.y,
    x2: edge1.target.position.x,
    y2: edge1.target.position.y
  };
  
  const line2 = {
    x1: edge2.source.position.x,
    y1: edge2.source.position.y,
    x2: edge2.target.position.x,
    y2: edge2.target.position.y
  };
  
  // Check if line segments intersect
  const denominator = (line1.x1 - line1.x2) * (line2.y1 - line2.y2) - 
                     (line1.y1 - line1.y2) * (line2.x1 - line2.x2);
  
  if (Math.abs(denominator) < 0.0001) {
    return false; // Lines are parallel
  }
  
  const t = ((line1.x1 - line2.x1) * (line2.y1 - line2.y2) - 
            (line1.y1 - line2.y1) * (line2.x1 - line2.x2)) / denominator;
  
  const u = -((line1.x1 - line1.x2) * (line1.y1 - line2.y1) - 
             (line1.y1 - line1.y2) * (line1.x1 - line2.x1)) / denominator;
  
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}