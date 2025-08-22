import { Node, Edge } from 'reactflow';

export type HandleType = 'source' | 'target' | 'both';
export type HandlePosition = 'top' | 'right' | 'bottom' | 'left';

interface HandleUsage {
  nodeId: string;
  handleId: string;
  type: HandleType;
  position: HandlePosition;
}

/**
 * Analyzes edges to determine which handles are used as sources and which as targets
 */
export function analyzeHandleUsage(edges: Edge[]): Map<string, HandleUsage> {
  const handleUsage = new Map<string, HandleUsage>();
  
  edges.forEach(edge => {
    // Track source handle usage
    if (edge.source && edge.sourceHandle) {
      const sourceKey = `${edge.source}-${edge.sourceHandle}`;
      const existing = handleUsage.get(sourceKey);
      
      if (!existing || existing.type === 'source') {
        handleUsage.set(sourceKey, {
          nodeId: edge.source,
          handleId: edge.sourceHandle,
          type: 'source',
          position: edge.sourceHandle as HandlePosition
        });
      } else if (existing.type === 'target') {
        // Handle is used as both source and target - mark it
        existing.type = 'both';
      }
    }
    
    // Track target handle usage
    if (edge.target && edge.targetHandle) {
      const targetKey = `${edge.target}-${edge.targetHandle}`;
      const existing = handleUsage.get(targetKey);
      
      if (!existing || existing.type === 'target') {
        handleUsage.set(targetKey, {
          nodeId: edge.target,
          handleId: edge.targetHandle,
          type: 'target',
          position: edge.targetHandle as HandlePosition
        });
      } else if (existing.type === 'source') {
        // Handle is used as both source and target - mark it
        existing.type = 'both';
      }
    }
  });
  
  return handleUsage;
}

/**
 * Gets available handles for a node that aren't already in use
 */
export function getAvailableHandles(
  nodeId: string,
  nodeType: string | undefined,
  handleUsage: Map<string, HandleUsage>,
  forConnection: 'source' | 'target'
): HandlePosition[] {
  const allHandles: HandlePosition[] = ['top', 'right', 'bottom', 'left'];
  const availableHandles: HandlePosition[] = [];
  
  // Special case for condition nodes with specific handles
  if (nodeType === 'condition' && forConnection === 'source') {
    // Condition nodes have special cond-1, cond-2, cond-3 handles
    return ['right', 'bottom', 'left'];
  }
  
  allHandles.forEach(handle => {
    const key = `${nodeId}-${handle}`;
    const usage = handleUsage.get(key);
    
    if (!usage) {
      // Handle not used at all - available
      availableHandles.push(handle);
    } else if (usage.type === 'both') {
      // Handle used for both - not ideal but allowed if necessary
      availableHandles.push(handle);
    } else if (usage.type !== forConnection) {
      // Handle used for opposite connection type - don't use
      // Skip this handle
    } else {
      // Handle used for same connection type - available
      availableHandles.push(handle);
    }
  });
  
  return availableHandles;
}

/**
 * Determines the best handle for a connection based on node positions and existing usage
 */
export function getBestHandle(
  sourceNode: Node,
  targetNode: Node,
  handleUsage: Map<string, HandleUsage>,
  connectionType: 'source' | 'target'
): string {
  const nodeId = connectionType === 'source' ? sourceNode.id : targetNode.id;
  const nodeType = connectionType === 'source' ? sourceNode.type : targetNode.type;
  const availableHandles = getAvailableHandles(nodeId, nodeType, handleUsage, connectionType);
  
  if (availableHandles.length === 0) {
    // No handles available - fallback to any handle
    return connectionType === 'source' ? 'right' : 'left';
  }
  
  // Calculate relative position
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  // Determine preferred handle based on direction
  let preferredHandle: HandlePosition;
  
  if (connectionType === 'source') {
    // For source, point towards target
    if (absDx > absDy) {
      preferredHandle = dx > 0 ? 'right' : 'left';
    } else {
      preferredHandle = dy > 0 ? 'bottom' : 'top';
    }
  } else {
    // For target, point towards source
    if (absDx > absDy) {
      preferredHandle = dx > 0 ? 'left' : 'right';
    } else {
      preferredHandle = dy > 0 ? 'top' : 'bottom';
    }
  }
  
  // Check if preferred handle is available
  if (availableHandles.includes(preferredHandle)) {
    return preferredHandle;
  }
  
  // Find next best handle based on angle
  const angle = Math.atan2(dy, dx);
  const angleDeg = (angle * 180 / Math.PI + 360) % 360;
  
  // Priority order based on angle
  let priorities: HandlePosition[] = [];
  
  if (angleDeg >= 315 || angleDeg < 45) {
    // Target is to the right
    priorities = connectionType === 'source' 
      ? ['right', 'bottom', 'top', 'left']
      : ['left', 'top', 'bottom', 'right'];
  } else if (angleDeg >= 45 && angleDeg < 135) {
    // Target is below
    priorities = connectionType === 'source'
      ? ['bottom', 'right', 'left', 'top']
      : ['top', 'left', 'right', 'bottom'];
  } else if (angleDeg >= 135 && angleDeg < 225) {
    // Target is to the left
    priorities = connectionType === 'source'
      ? ['left', 'bottom', 'top', 'right']
      : ['right', 'top', 'bottom', 'left'];
  } else {
    // Target is above
    priorities = connectionType === 'source'
      ? ['top', 'left', 'right', 'bottom']
      : ['bottom', 'right', 'left', 'top'];
  }
  
  // Return first available handle from priorities
  for (const handle of priorities) {
    if (availableHandles.includes(handle)) {
      return handle;
    }
  }
  
  // Fallback to first available
  return availableHandles[0];
}

/**
 * Optimizes handle assignments for all edges to minimize crossings
 */
export function optimizeHandleAssignments(
  nodes: Node[],
  edges: Edge[]
): Edge[] {
  const handleUsage = analyzeHandleUsage(edges);
  
  return edges.map(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) {
      return edge;
    }
    
    // Keep special handles like cond-1, cond-2, cond-3
    if (edge.sourceHandle && edge.sourceHandle.startsWith('cond-')) {
      return edge;
    }
    
    // Get best handles for this connection
    const bestSourceHandle = edge.sourceHandle || getBestHandle(sourceNode, targetNode, handleUsage, 'source');
    const bestTargetHandle = edge.targetHandle || getBestHandle(sourceNode, targetNode, handleUsage, 'target');
    
    return {
      ...edge,
      sourceHandle: bestSourceHandle,
      targetHandle: bestTargetHandle
    };
  });
}