import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

interface LayoutOptions {
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
  animate?: boolean;
}

/**
 * Frame-aware auto layout that respects frame boundaries
 */
export const frameAwareLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] => {
  const { direction = 'LR', nodeSpacing = 100, rankSpacing = 200 } = options;
  
  // Separate frame nodes and regular nodes
  const frameNodes = nodes.filter(n => n.type === 'frame');
  const regularNodes = nodes.filter(n => n.type !== 'frame');
  
  // Build frame containment map
  const frameContainment: { [frameId: string]: string[] } = {};
  frameNodes.forEach(frame => {
    const containedNodeIds = frame.data?.data?.containedNodes || [];
    frameContainment[frame.id] = containedNodeIds;
  });
  
  // Group nodes by frame
  const nodesInFrames: { [frameId: string]: Node[] } = {};
  const freeNodes: Node[] = [];
  
  regularNodes.forEach(node => {
    let isInFrame = false;
    for (const frameId in frameContainment) {
      if (frameContainment[frameId].includes(node.id)) {
        if (!nodesInFrames[frameId]) {
          nodesInFrames[frameId] = [];
        }
        nodesInFrames[frameId].push(node);
        isInFrame = true;
        break;
      }
    }
    if (!isInFrame) {
      freeNodes.push(node);
    }
  });
  
  // Layout nodes within each frame
  const layoutedFrameNodes: Node[] = [];
  frameNodes.forEach(frame => {
    const containedNodes = nodesInFrames[frame.id] || [];
    
    if (containedNodes.length > 0) {
      // Create a sub-graph for nodes within this frame
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({
        rankdir: direction,
        nodesep: nodeSpacing * 0.7, // Tighter spacing within frames
        ranksep: rankSpacing * 0.7,
        marginx: 20,
        marginy: 20,
      });
      
      // Add nodes to sub-graph
      containedNodes.forEach(node => {
        const width = node.data?.size?.width || 180;
        const height = node.data?.size?.height || 80;
        dagreGraph.setNode(node.id, { width, height });
      });
      
      // Add edges that are within this frame
      edges.forEach(edge => {
        const sourceInFrame = containedNodes.some(n => n.id === edge.source);
        const targetInFrame = containedNodes.some(n => n.id === edge.target);
        if (sourceInFrame && targetInFrame) {
          dagreGraph.setEdge(edge.source, edge.target);
        }
      });
      
      // Calculate layout
      dagre.layout(dagreGraph);
      
      // Apply positions relative to frame
      const frameX = frame.position.x;
      const frameY = frame.position.y;
      const framePadding = 40;
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      const layoutedNodesInFrame = containedNodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const width = node.data?.size?.width || 180;
        const height = node.data?.size?.height || 80;
        
        const x = nodeWithPosition.x - width / 2;
        const y = nodeWithPosition.y - height / 2;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
        
        return {
          ...node,
          position: { x, y }
        };
      });
      
      // Adjust frame size and position nodes within it
      const frameWidth = maxX - minX + framePadding * 2;
      const frameHeight = maxY - minY + framePadding * 2;
      
      // Update frame size
      const updatedFrame = {
        ...frame,
        data: {
          ...frame.data,
          size: { width: frameWidth, height: frameHeight }
        }
      };
      layoutedFrameNodes.push(updatedFrame);
      
      // Position nodes within frame
      layoutedNodesInFrame.forEach(node => {
        layoutedFrameNodes.push({
          ...node,
          position: {
            x: frameX + node.position.x - minX + framePadding,
            y: frameY + node.position.y - minY + framePadding
          }
        });
      });
    } else {
      // Frame has no nodes, keep as is
      layoutedFrameNodes.push(frame);
    }
  });
  
  // Layout free nodes (not in any frame)
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSpacing,
    ranksep: rankSpacing,
    marginx: 50,
    marginy: 50,
  });
  
  // Add free nodes
  freeNodes.forEach(node => {
    const width = node.data?.size?.width || 180;
    const height = node.data?.size?.height || 80;
    dagreGraph.setNode(node.id, { width, height });
  });
  
  // Add frames as nodes to ensure proper spacing
  layoutedFrameNodes.filter(n => n.type === 'frame').forEach(frame => {
    const width = frame.data?.size?.width || 600;
    const height = frame.data?.size?.height || 400;
    dagreGraph.setNode(frame.id, { width, height });
  });
  
  // Add edges
  edges.forEach(edge => {
    const sourceIsFree = freeNodes.some(n => n.id === edge.source);
    const targetIsFree = freeNodes.some(n => n.id === edge.target);
    const sourceIsFrame = frameNodes.some(n => n.id === edge.source);
    const targetIsFrame = frameNodes.some(n => n.id === edge.target);
    
    // Add edge if it connects free nodes or frames
    if ((sourceIsFree || sourceIsFrame) && (targetIsFree || targetIsFrame)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });
  
  // Calculate layout
  dagre.layout(dagreGraph);
  
  // Apply positions to free nodes and update frame positions
  const finalNodes: Node[] = [];
  
  // Update frame positions
  layoutedFrameNodes.forEach(node => {
    if (node.type === 'frame') {
      const graphNode = dagreGraph.node(node.id);
      if (graphNode) {
        const width = node.data?.size?.width || 600;
        const height = node.data?.size?.height || 400;
        finalNodes.push({
          ...node,
          position: {
            x: graphNode.x - width / 2,
            y: graphNode.y - height / 2
          }
        });
        
        // Update contained nodes positions
        const frameOffset = {
          x: graphNode.x - width / 2 - node.position.x,
          y: graphNode.y - height / 2 - node.position.y
        };
        
        layoutedFrameNodes.filter(n => 
          n.type !== 'frame' && frameContainment[node.id]?.includes(n.id)
        ).forEach(containedNode => {
          finalNodes.push({
            ...containedNode,
            position: {
              x: containedNode.position.x + frameOffset.x,
              y: containedNode.position.y + frameOffset.y
            }
          });
        });
      } else {
        finalNodes.push(node);
      }
    }
  });
  
  // Add free nodes
  freeNodes.forEach(node => {
    const graphNode = dagreGraph.node(node.id);
    if (graphNode) {
      const width = node.data?.size?.width || 180;
      const height = node.data?.size?.height || 80;
      finalNodes.push({
        ...node,
        position: {
          x: graphNode.x - width / 2,
          y: graphNode.y - height / 2
        }
      });
    } else {
      finalNodes.push(node);
    }
  });
  
  return finalNodes;
};

/**
 * Optimize edge routing to minimize overlaps
 */
export const optimizeEdgeRouting = (edges: Edge[], nodes: Node[]): Edge[] => {
  // Create node position map for quick lookup
  const nodePositions: { [id: string]: { x: number; y: number; width: number; height: number } } = {};
  nodes.forEach(node => {
    nodePositions[node.id] = {
      x: node.position.x,
      y: node.position.y,
      width: node.data?.size?.width || 180,
      height: node.data?.size?.height || 80
    };
  });
  
  return edges.map(edge => {
    const source = nodePositions[edge.source];
    const target = nodePositions[edge.target];
    
    if (!source || !target) return edge;
    
    // Determine best connection points
    const sourceCenterX = source.x + source.width / 2;
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;
    
    const dx = targetCenterX - sourceCenterX;
    const dy = targetCenterY - sourceCenterY;
    
    // Choose edge type based on relative positions
    let edgeType = 'smoothstep';
    if (Math.abs(dx) > Math.abs(dy) * 2) {
      // Horizontal connection
      edgeType = 'smoothstep';
    } else if (Math.abs(dy) > Math.abs(dx) * 2) {
      // Vertical connection
      edgeType = 'smoothstep';
    } else {
      // Diagonal - use bezier for smoother curves
      edgeType = 'bezier';
    }
    
    return {
      ...edge,
      type: edgeType,
      style: {
        ...edge.style,
        strokeWidth: 2
      }
    };
  });
};