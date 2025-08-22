import dagre from 'dagre';
import { Node, Edge } from 'reactflow';
import { debugTreeLayout, analyzeNodeConnectivity } from './debugLayout';

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

interface LayoutOptions {
  direction?: LayoutDirection;
  nodeSpacing?: number;
  rankSpacing?: number;
  animate?: boolean;
}

const defaultOptions: Required<LayoutOptions> = {
  direction: 'LR',
  nodeSpacing: 100,
  rankSpacing: 200,
  animate: true,
};

// Helper to determine optimal handle positions based on layout direction and node positions
const getOptimalHandlePositions = (
  sourceNode: Node,
  targetNode: Node,
  direction: LayoutDirection
): { sourceHandle?: string; targetHandle?: string } => {
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  // For horizontal layouts (LR/RL)
  if (direction === 'LR' || direction === 'RL') {
    // Check if nodes are roughly aligned horizontally
    if (absDy < 50) {
      // Nodes are horizontally aligned, use side handles
      return {
        sourceHandle: dx > 0 ? 'right' : 'left',
        targetHandle: dx > 0 ? 'left' : 'right'
      };
    }
    
    // Check diagonal connections
    if (absDx > absDy * 1.5) {
      // Primarily horizontal connection
      return {
        sourceHandle: dx > 0 ? 'right' : 'left',
        targetHandle: dx > 0 ? 'left' : 'right'
      };
    } else if (absDy > absDx * 0.7) {
      // More vertical than horizontal - use top/bottom handles
      return {
        sourceHandle: dy > 0 ? 'bottom' : 'top',
        targetHandle: dy > 0 ? 'top' : 'bottom'
      };
    } else {
      // Mixed diagonal - choose based on quadrant
      if (dx > 0 && dy > 0) {
        // Target is bottom-right
        return { sourceHandle: 'right', targetHandle: 'top' };
      } else if (dx > 0 && dy < 0) {
        // Target is top-right
        return { sourceHandle: 'right', targetHandle: 'bottom' };
      } else if (dx < 0 && dy > 0) {
        // Target is bottom-left
        return { sourceHandle: 'left', targetHandle: 'top' };
      } else {
        // Target is top-left
        return { sourceHandle: 'left', targetHandle: 'bottom' };
      }
    }
  }
  
  // For vertical layouts (TB/BT)
  if (direction === 'TB' || direction === 'BT') {
    // Check if nodes are roughly aligned vertically
    if (absDx < 50) {
      // Nodes are vertically aligned, use top/bottom handles
      return {
        sourceHandle: dy > 0 ? 'bottom' : 'top',
        targetHandle: dy > 0 ? 'top' : 'bottom'
      };
    }
    
    // Check diagonal connections
    if (absDy > absDx * 1.5) {
      // Primarily vertical connection
      return {
        sourceHandle: dy > 0 ? 'bottom' : 'top',
        targetHandle: dy > 0 ? 'top' : 'bottom'
      };
    } else if (absDx > absDy * 0.7) {
      // More horizontal than vertical - use side handles
      return {
        sourceHandle: dx > 0 ? 'right' : 'left',
        targetHandle: dx > 0 ? 'left' : 'right'
      };
    } else {
      // Mixed diagonal - choose based on quadrant
      if (dx > 0 && dy > 0) {
        // Target is bottom-right
        return { sourceHandle: 'bottom', targetHandle: 'left' };
      } else if (dx > 0 && dy < 0) {
        // Target is top-right
        return { sourceHandle: 'top', targetHandle: 'left' };
      } else if (dx < 0 && dy > 0) {
        // Target is bottom-left
        return { sourceHandle: 'bottom', targetHandle: 'right' };
      } else {
        // Target is top-left
        return { sourceHandle: 'top', targetHandle: 'right' };
      }
    }
  }
  
  // Default based on direction
  switch (direction) {
    case 'LR':
      return { sourceHandle: 'right', targetHandle: 'left' };
    case 'RL':
      return { sourceHandle: 'left', targetHandle: 'right' };
    case 'TB':
      return { sourceHandle: 'bottom', targetHandle: 'top' };
    case 'BT':
      return { sourceHandle: 'top', targetHandle: 'bottom' };
    default:
      return { sourceHandle: 'right', targetHandle: 'left' };
  }
};

export const autoLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } => {
  const { direction, nodeSpacing, rankSpacing } = { ...defaultOptions, ...options };
  
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
  
  const layoutedNodes: Node[] = [];
  
  // Layout each frame's contents
  frameNodes.forEach(frame => {
    const containedNodes = nodesInFrames[frame.id] || [];
    
    if (containedNodes.length > 0) {
      // Create sub-graph for frame contents
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));
      dagreGraph.setGraph({
        rankdir: direction,
        nodesep: nodeSpacing * 0.7,
        ranksep: rankSpacing * 0.7,
        marginx: 20,
        marginy: 20,
      });
      
      // Add nodes
      containedNodes.forEach(node => {
        const width = node.data?.size?.width || 180;
        const height = node.data?.size?.height || 80;
        dagreGraph.setNode(node.id, { width, height });
      });
      
      // Add internal edges
      edges.forEach(edge => {
        const sourceInFrame = containedNodes.some(n => n.id === edge.source);
        const targetInFrame = containedNodes.some(n => n.id === edge.target);
        if (sourceInFrame && targetInFrame) {
          dagreGraph.setEdge(edge.source, edge.target);
        }
      });
      
      dagre.layout(dagreGraph);
      
      // Position nodes within frame
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const tempNodes = containedNodes.map(node => {
        const nodePos = dagreGraph.node(node.id);
        const width = node.data?.size?.width || 180;
        const height = node.data?.size?.height || 80;
        const x = nodePos.x - width / 2;
        const y = nodePos.y - height / 2;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
        
        return { ...node, position: { x, y } };
      });
      
      // Adjust frame size and position nodes
      const padding = 40;
      frame.position = { x: minX - padding, y: minY - padding };
      const updatedFrame = {
        ...frame,
        data: {
          ...frame.data,
          size: {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2
          },
          // Preserve containedNodes data
          data: {
            ...frame.data?.data,
            containedNodes: containedNodeIds
          }
        }
      };
      
      layoutedNodes.push(updatedFrame);
      layoutedNodes.push(...tempNodes);
    } else {
      // Even if frame has no nodes, preserve its data structure
      const frameWithData = {
        ...frame,
        data: {
          ...frame.data,
          data: {
            ...frame.data?.data,
            containedNodes: containedNodeIds || []
          }
        }
      };
      layoutedNodes.push(frameWithData);
    }
  });
  
  // Layout free nodes
  if (freeNodes.length > 0) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: nodeSpacing,
      ranksep: rankSpacing,
      marginx: 50,
      marginy: 50,
    });
    
    freeNodes.forEach(node => {
      const width = node.data?.size?.width || 180;
      const height = node.data?.size?.height || 80;
      dagreGraph.setNode(node.id, { width, height });
    });
    
    edges.forEach(edge => {
      const sourceIsFree = freeNodes.some(n => n.id === edge.source);
      const targetIsFree = freeNodes.some(n => n.id === edge.target);
      if (sourceIsFree && targetIsFree) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });
    
    dagre.layout(dagreGraph);
    
    // Offset free nodes to avoid overlap with frames
    const frameMaxX = frameNodes.reduce((max, frame) => {
      return Math.max(max, (frame.position?.x || 0) + (frame.data?.size?.width || 0));
    }, 0);
    
    const offset = frameMaxX > 0 ? frameMaxX + 100 : 0;
    
    freeNodes.forEach(node => {
      const nodePos = dagreGraph.node(node.id);
      const width = node.data?.size?.width || 180;
      const height = node.data?.size?.height || 80;
      
      layoutedNodes.push({
        ...node,
        position: {
          x: nodePos.x - width / 2 + offset,
          y: nodePos.y - height / 2,
        },
      });
    });
  }
  
  // Update edges with optimal handle positions - but keep original handles if specified
  const optimizedEdges = edges.map(edge => {
    const sourceNode = layoutedNodes.find(n => n.id === edge.source);
    const targetNode = layoutedNodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      // Keep specific handles like 'cond-1', 'cond-2' if they exist
      if (edge.sourceHandle && edge.sourceHandle.startsWith('cond-')) {
        return edge; // Keep edge unchanged
      }
      
      const handles = getOptimalHandlePositions(sourceNode, targetNode, direction);
      return {
        ...edge,
        sourceHandle: edge.sourceHandle || handles.sourceHandle,
        targetHandle: edge.targetHandle || handles.targetHandle,
        data: {
          ...edge.data,
          sourceHandle: edge.sourceHandle || handles.sourceHandle,
          targetHandle: edge.targetHandle || handles.targetHandle
        }
      };
    }
    
    // IMPORTANT: Always return the edge even if nodes aren't found
    return edge;
  });
  
  // Sort nodes to ensure frames are first (rendered in background)
  const sortedNodes = [...layoutedNodes].sort((a, b) => {
    if (a.type === 'frame' && b.type !== 'frame') return -1;
    if (a.type !== 'frame' && b.type === 'frame') return 1;
    return 0;
  });
  
  return { nodes: sortedNodes, edges: optimizedEdges };
};

// Smart layout that groups related nodes and respects frames
export const smartLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } => {
  // Group nodes by type for better organization
  const nodeGroups: { [key: string]: Node[] } = {};
  
  nodes.forEach(node => {
    const type = node.type || 'default';
    if (!nodeGroups[type]) {
      nodeGroups[type] = [];
    }
    nodeGroups[type].push(node);
  });

  // Priority order for node types (left to right)
  const typePriority = ['start', 'screen', 'decision', 'condition', 'action', 'subflow', 'end', 'note', 'frame'];
  
  // Sort nodes based on their connections and type
  const sortedNodes = nodes.sort((a, b) => {
    const aPriority = typePriority.indexOf(a.type || 'default');
    const bPriority = typePriority.indexOf(b.type || 'default');
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Secondary sort by number of connections
    const aConnections = edges.filter(e => e.source === a.id || e.target === a.id).length;
    const bConnections = edges.filter(e => e.source === b.id || e.target === b.id).length;
    
    return bConnections - aConnections;
  });

  return autoLayout(sortedNodes, edges, options);
};

// Circular layout for subflows or grouped nodes
export const circularLayout = (
  nodes: Node[],
  centerNode?: Node,
  radius: number = 300
): Node[] => {
  if (nodes.length === 0) return nodes;
  
  const angleStep = (2 * Math.PI) / (nodes.length - (centerNode ? 1 : 0));
  let currentAngle = 0;
  
  const centerX = centerNode ? centerNode.position.x : 500;
  const centerY = centerNode ? centerNode.position.y : 300;
  
  return nodes.map((node) => {
    if (centerNode && node.id === centerNode.id) {
      return {
        ...node,
        position: { x: centerX, y: centerY }
      };
    }
    
    const x = centerX + radius * Math.cos(currentAngle);
    const y = centerY + radius * Math.sin(currentAngle);
    currentAngle += angleStep;
    
    return {
      ...node,
      position: { x, y }
    };
  });
};

// Tree layout for hierarchical flows with frame support
export const treeLayout = (
  nodes: Node[],
  edges: Edge[],
  rootNodeId?: string
): { nodes: Node[]; edges: Edge[] } => {
  // Debug output
  console.log('🌳 Tree Layout Started');
  debugTreeLayout(nodes, edges);
  const connectivity = analyzeNodeConnectivity(nodes, edges);
  // Separate frame nodes and regular nodes
  const frameNodes = nodes.filter(n => n.type === 'frame');
  const regularNodes = nodes.filter(n => n.type !== 'frame');
  
  // Build frame containment
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
  
  const layoutedNodes: Node[] = [];
  
  // Apply tree layout to each frame's contents
  frameNodes.forEach(frame => {
    const containedNodes = nodesInFrames[frame.id] || [];
    
    if (containedNodes.length > 0) {
      // Debug: Log what's in this frame
      console.log(`📦 Processing frame ${frame.id} with ${containedNodes.length} nodes`);
      
      // For tree layout, we need to consider ALL edges, not just internal ones
      // Find nodes that are entry points to the frame (have external incoming edges)
      const entryNodes = containedNodes.filter(n => {
        const externalIncoming = edges.some(e => 
          e.target === n.id && !containedNodes.some(cn => cn.id === e.source)
        );
        return externalIncoming || n.type === 'start';
      });
      
      // If no entry nodes, find nodes with no incoming edges at all
      const rootCandidates = entryNodes.length > 0 ? entryNodes : 
        containedNodes.filter(n => !edges.some(e => e.target === n.id));
      
      const frameRootNode = rootCandidates[0] || containedNodes[0];
      
      console.log(`  Entry nodes: ${entryNodes.map(n => n.id).join(', ')}`);
      console.log(`  Root node: ${frameRootNode?.id} (${frameRootNode?.data?.title})`);
      
      
      if (frameRootNode) {
        // Build tree for frame contents
        const tree: { [key: string]: string[] } = {};
        const visited = new Set<string>();
        const levels: { [key: string]: number } = {};
        
        const buildTree = (nodeId: string, level: number = 0) => {
          if (visited.has(nodeId)) {
            // Node already visited - update level if this path is longer
            if (level > levels[nodeId]) {
              levels[nodeId] = level;
            }
            return;
          }
          visited.add(nodeId);
          levels[nodeId] = level;
          
          const children = edges
            .filter(e => e.source === nodeId && containedNodes.some(n => n.id === e.target))
            .map(e => e.target);
          
          if (children.length > 0) {
            tree[nodeId] = children;
            children.forEach(child => buildTree(child, level + 1));
          }
        };
        
        buildTree(frameRootNode.id);
        
        // Process ALL nodes in frame, ensuring they all get positioned
        containedNodes.forEach(node => {
          if (!visited.has(node.id)) {
            // This node wasn't reached by tree traversal
            // Check if it has any incoming edges at all
            const incomingEdges = edges.filter(e => e.target === node.id);
            
            if (incomingEdges.length > 0) {
              // Has incoming edges - calculate level based on all parents
              const parentLevels = incomingEdges.map(e => {
                const sourceInFrame = containedNodes.some(n => n.id === e.source);
                if (sourceInFrame) {
                  // Parent is in frame, use its level
                  return levels[e.source] || 0;
                } else {
                  // Parent is outside frame - this node should be at level 0
                  return -1;
                }
              });
              levels[node.id] = Math.max(...parentLevels) + 1;
            } else {
              // No incoming edges at all - place at level 0
              levels[node.id] = 0;
            }
            visited.add(node.id);
          }
        });
        
        // Calculate positions
        const levelNodes: { [key: number]: string[] } = {};
        Object.entries(levels).forEach(([nodeId, level]) => {
          if (!levelNodes[level]) {
            levelNodes[level] = [];
          }
          levelNodes[level].push(nodeId);
        });
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        const tempNodes = containedNodes.map(node => {
          const level = levels[node.id] || 0;
          const nodesInLevel = levelNodes[level] || [];
          const indexInLevel = nodesInLevel.indexOf(node.id);
          const levelWidth = nodesInLevel.length * 200;
          
          const x = (indexInLevel * 200) - (levelWidth / 2) + 400;
          const y = level * 120 + 50;
          const width = node.data?.size?.width || 180;
          const height = node.data?.size?.height || 80;
          
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + width);
          maxY = Math.max(maxY, y + height);
          
          return { ...node, position: { x, y } };
        });
        
        // Adjust frame
        const padding = 40;
        const updatedFrame = {
          ...frame,
          position: { x: minX - padding, y: minY - padding },
          data: {
            ...frame.data,
            size: {
              width: maxX - minX + padding * 2,
              height: maxY - minY + padding * 2
            },
            // Preserve containedNodes data
            data: {
              ...frame.data?.data,
              containedNodes: containedNodeIds
            }
          }
        };
        
        layoutedNodes.push(updatedFrame);
        layoutedNodes.push(...tempNodes);
      } else {
        // If no root, use compact layout for frame contents
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({
          rankdir: 'TB',
          nodesep: 50,
          ranksep: 80,
        });
        
        containedNodes.forEach(node => {
          const width = node.data?.size?.width || 180;
          const height = node.data?.size?.height || 80;
          dagreGraph.setNode(node.id, { width, height });
        });
        
        edges.forEach(edge => {
          if (containedNodes.some(n => n.id === edge.source) && containedNodes.some(n => n.id === edge.target)) {
            dagreGraph.setEdge(edge.source, edge.target);
          }
        });
        
        dagre.layout(dagreGraph);
        
        // Preserve frame data
        const frameWithData = {
          ...frame,
          data: {
            ...frame.data,
            data: {
              ...frame.data?.data,
              containedNodes: containedNodeIds
            }
          }
        };
        layoutedNodes.push(frameWithData);
        containedNodes.forEach(node => {
          const nodePos = dagreGraph.node(node.id);
          const width = node.data?.size?.width || 180;
          const height = node.data?.size?.height || 80;
          layoutedNodes.push({
            ...node,
            position: {
              x: frame.position.x + nodePos.x - width / 2 + 40,
              y: frame.position.y + nodePos.y - height / 2 + 40,
            },
          });
        });
      }
    } else {
      // Even if frame has no nodes, preserve its data structure
      const frameWithData = {
        ...frame,
        data: {
          ...frame.data,
          data: {
            ...frame.data?.data,
            containedNodes: containedNodeIds || []
          }
        }
      };
      layoutedNodes.push(frameWithData);
    }
  });
  
  // Apply tree layout to free nodes
  if (freeNodes.length > 0) {
    const freeRootNode = rootNodeId 
      ? freeNodes.find(n => n.id === rootNodeId)
      : freeNodes.find(n => n.type === 'start') || 
        freeNodes.find(n => !edges.some(e => e.target === n.id && freeNodes.some(fn => fn.id === e.source)));
    
    if (freeRootNode) {
      const tree: { [key: string]: string[] } = {};
      const visited = new Set<string>();
      const levels: { [key: string]: number } = {};
      
      const buildTree = (nodeId: string, level: number = 0) => {
        if (visited.has(nodeId)) {
          // Node already visited - update level if this path is longer
          if (level > levels[nodeId]) {
            levels[nodeId] = level;
          }
          return;
        }
        visited.add(nodeId);
        levels[nodeId] = level;
        
        const children = edges
          .filter(e => e.source === nodeId && freeNodes.some(n => n.id === e.target))
          .map(e => e.target);
        
        if (children.length > 0) {
          tree[nodeId] = children;
          children.forEach(child => buildTree(child, level + 1));
        }
      };
      
      buildTree(freeRootNode.id);
      
      // Also process nodes that have incoming edges but weren't reached by tree traversal
      freeNodes.forEach(node => {
        if (!visited.has(node.id)) {
          // Find the maximum level of all parents
          const parentEdges = edges.filter(e => e.target === node.id && freeNodes.some(n => n.id === e.source));
          if (parentEdges.length > 0) {
            const maxParentLevel = Math.max(...parentEdges.map(e => levels[e.source] || 0));
            levels[node.id] = maxParentLevel + 1;
            visited.add(node.id);
          }
        }
      });
      
      const levelNodes: { [key: number]: string[] } = {};
      Object.entries(levels).forEach(([nodeId, level]) => {
        if (!levelNodes[level]) {
          levelNodes[level] = [];
        }
        levelNodes[level].push(nodeId);
      });
      
      // Offset free nodes
      const frameMaxX = frameNodes.reduce((max, frame) => {
        return Math.max(max, (frame.position?.x || 0) + (frame.data?.size?.width || 0));
      }, 0);
      const offset = frameMaxX > 0 ? frameMaxX + 100 : 0;
      
      freeNodes.forEach(node => {
        const level = levels[node.id] || 0;
        const nodesInLevel = levelNodes[level] || [];
        const indexInLevel = nodesInLevel.indexOf(node.id);
        const levelWidth = nodesInLevel.length * 250;
        
        layoutedNodes.push({
          ...node,
          position: {
            x: (indexInLevel * 250) - (levelWidth / 2) + 500 + offset,
            y: level * 150 + 100
          }
        });
      });
    }
  }
  
  // Update edges with optimal handles for tree layout
  const optimizedEdges = edges.map(edge => {
    const sourceNode = layoutedNodes.find(n => n.id === edge.source);
    const targetNode = layoutedNodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      // Keep specific handles like 'cond-1', 'cond-2' if they exist
      if (edge.sourceHandle && edge.sourceHandle.startsWith('cond-')) {
        return edge; // Keep edge unchanged
      }
      
      const handles = getOptimalHandlePositions(sourceNode, targetNode, 'TB');
      return {
        ...edge,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        data: {
          ...edge.data,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle
        }
      };
    }
    
    // IMPORTANT: Always return the edge even if nodes aren't found
    return edge;
  });
  
  // Sort nodes to ensure frames are first (rendered in background)
  const sortedNodes = [...layoutedNodes].sort((a, b) => {
    if (a.type === 'frame' && b.type !== 'frame') return -1;
    if (a.type !== 'frame' && b.type === 'frame') return 1;
    return 0;
  });
  
  return { nodes: sortedNodes, edges: optimizedEdges };
};

// Compact layout that minimizes space and respects frames
export const compactLayout = (
  nodes: Node[],
  edges: Edge[]
): { nodes: Node[]; edges: Edge[] } => {
  // Use frame-aware autoLayout with compact spacing
  return autoLayout(nodes, edges, {
    direction: 'TB',
    nodeSpacing: 50,
    rankSpacing: 100,
  });
};