import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

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

export const autoLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] => {
  const { direction, nodeSpacing, rankSpacing } = { ...defaultOptions, ...options };
  
  // Create a new directed graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  // Set graph properties
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSpacing,
    ranksep: rankSpacing,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to the graph
  nodes.forEach((node) => {
    const width = node.data?.size?.width || 180;
    const height = node.data?.size?.height || 80;
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to the graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate the layout
  dagre.layout(dagreGraph);

  // Apply the calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // Center the node position (dagre uses center coordinates)
    const width = node.data?.size?.width || 180;
    const height = node.data?.size?.height || 80;
    
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return layoutedNodes;
};

// Smart layout that groups related nodes
export const smartLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] => {
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

// Tree layout for hierarchical flows
export const treeLayout = (
  nodes: Node[],
  edges: Edge[],
  rootNodeId?: string
): Node[] => {
  // Find root node (start node or node with no incoming edges)
  const rootNode = rootNodeId 
    ? nodes.find(n => n.id === rootNodeId)
    : nodes.find(n => n.type === 'start') || 
      nodes.find(n => !edges.some(e => e.target === n.id));
  
  if (!rootNode) {
    return autoLayout(nodes, edges, { direction: 'TB' });
  }
  
  // Build tree structure
  const tree: { [key: string]: string[] } = {};
  const visited = new Set<string>();
  const levels: { [key: string]: number } = {};
  
  const buildTree = (nodeId: string, level: number = 0) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    levels[nodeId] = level;
    
    const children = edges
      .filter(e => e.source === nodeId)
      .map(e => e.target);
    
    if (children.length > 0) {
      tree[nodeId] = children;
      children.forEach(child => buildTree(child, level + 1));
    }
  };
  
  buildTree(rootNode.id);
  
  // Calculate positions based on tree structure
  const levelNodes: { [key: number]: string[] } = {};
  Object.entries(levels).forEach(([nodeId, level]) => {
    if (!levelNodes[level]) {
      levelNodes[level] = [];
    }
    levelNodes[level].push(nodeId);
  });
  
  const layoutedNodes = nodes.map(node => {
    const level = levels[node.id] || 0;
    const nodesInLevel = levelNodes[level] || [];
    const indexInLevel = nodesInLevel.indexOf(node.id);
    const levelWidth = nodesInLevel.length * 250;
    
    return {
      ...node,
      position: {
        x: (indexInLevel * 250) - (levelWidth / 2) + 500,
        y: level * 150 + 100
      }
    };
  });
  
  return layoutedNodes;
};

// Compact layout that minimizes space
export const compactLayout = (
  nodes: Node[],
  edges: Edge[]
): Node[] => {
  return autoLayout(nodes, edges, {
    direction: 'TB',
    nodeSpacing: 50,
    rankSpacing: 100,
  });
};