import { Node, Edge } from 'reactflow';

interface TreeNode {
  id: string;
  children: string[];
  level: number;
  parent?: string;
}

export const treeLayoutFixed = (
  nodes: Node[],
  edges: Edge[],
  rootNodeId?: string
): { nodes: Node[]; edges: Edge[] } => {
  console.log('🌲 Fixed Tree Layout Starting');
  console.log(`  Total nodes: ${nodes.length}, Total edges: ${edges.length}`);
  
  // Create a map for quick node lookup
  const nodeMap = new Map<string, Node>();
  nodes.forEach(n => nodeMap.set(n.id, n));
  
  // Build adjacency lists
  const children: { [key: string]: string[] } = {};
  const parents: { [key: string]: string[] } = {};
  
  edges.forEach(edge => {
    if (!children[edge.source]) children[edge.source] = [];
    if (!parents[edge.target]) parents[edge.target] = [];
    
    children[edge.source].push(edge.target);
    parents[edge.target].push(edge.source);
  });
  
  // Find root nodes (nodes with no incoming edges)
  const rootNodes = nodes.filter(n => !parents[n.id] || parents[n.id].length === 0);
  console.log(`  Found ${rootNodes.length} root nodes:`, rootNodes.map(n => `${n.id} (${n.data?.title})`));
  
  // If no natural roots, use start nodes or specified root
  let actualRoots = rootNodes.length > 0 ? rootNodes : 
    nodes.filter(n => n.type === 'start');
  
  if (actualRoots.length === 0 && rootNodeId) {
    const specifiedRoot = nodes.find(n => n.id === rootNodeId);
    if (specifiedRoot) actualRoots = [specifiedRoot];
  }
  
  if (actualRoots.length === 0) {
    // Fallback: use nodes with most outgoing edges
    const outDegrees = nodes.map(n => ({
      node: n,
      outDegree: children[n.id]?.length || 0
    })).sort((a, b) => b.outDegree - a.outDegree);
    
    if (outDegrees.length > 0) {
      actualRoots = [outDegrees[0].node];
    }
  }
  
  console.log(`  Using roots:`, actualRoots.map(n => `${n.id} (${n.data?.title})`));
  
  // Calculate levels using BFS from all roots
  const levels: { [key: string]: number } = {};
  const visited = new Set<string>();
  const queue: { nodeId: string; level: number }[] = [];
  
  // Start with all roots at level 0
  actualRoots.forEach(root => {
    queue.push({ nodeId: root.id, level: 0 });
    levels[root.id] = 0;
    visited.add(root.id);
  });
  
  // BFS to assign levels
  while (queue.length > 0) {
    const { nodeId, level } = queue.shift()!;
    const nodeChildren = children[nodeId] || [];
    
    nodeChildren.forEach(childId => {
      if (!visited.has(childId)) {
        visited.add(childId);
        levels[childId] = level + 1;
        queue.push({ nodeId: childId, level: level + 1 });
      } else {
        // Node already visited - update level if this path gives a higher level
        // This ensures nodes appear at the deepest level they can be at
        if (level + 1 > levels[childId]) {
          levels[childId] = level + 1;
          // Re-process this node's children with the new level
          queue.push({ nodeId: childId, level: level + 1 });
        }
      }
    });
  }
  
  // Handle disconnected nodes (not reachable from any root)
  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      console.warn(`  ⚠️ Node ${node.id} (${node.data?.title}) not reachable from any root`);
      // Try to place based on its parents
      const nodeParents = parents[node.id] || [];
      if (nodeParents.length > 0) {
        const parentLevels = nodeParents.map(p => levels[p] || 0);
        levels[node.id] = Math.max(...parentLevels) + 1;
      } else {
        // No parents, place at level 0
        levels[node.id] = 0;
      }
      visited.add(node.id);
    }
  });
  
  // Group nodes by level
  const levelGroups: { [level: number]: Node[] } = {};
  nodes.forEach(node => {
    const level = levels[node.id] || 0;
    if (!levelGroups[level]) levelGroups[level] = [];
    levelGroups[level].push(node);
  });
  
  console.log('  Level distribution:');
  Object.entries(levelGroups).forEach(([level, nodes]) => {
    console.log(`    Level ${level}: ${nodes.length} nodes -`, nodes.map(n => n.data?.title || n.id).join(', '));
  });
  
  // Position nodes
  const HORIZONTAL_SPACING = 250;
  const VERTICAL_SPACING = 150;
  const layoutedNodes: Node[] = [];
  
  // Separate frame nodes and regular nodes
  const frameNodes = nodes.filter(n => n.type === 'frame');
  const regularNodes = nodes.filter(n => n.type !== 'frame');
  
  // Layout regular nodes
  Object.entries(levelGroups).forEach(([levelStr, levelNodes]) => {
    const level = parseInt(levelStr);
    const nonFrameNodes = levelNodes.filter(n => n.type !== 'frame');
    const levelWidth = nonFrameNodes.length * HORIZONTAL_SPACING;
    
    nonFrameNodes.forEach((node, index) => {
      const x = (index * HORIZONTAL_SPACING) - (levelWidth / 2) + 600;
      const y = level * VERTICAL_SPACING + 100;
      
      layoutedNodes.push({
        ...node,
        position: { x, y }
      });
    });
  });
  
  // Update frame positions based on their contained nodes
  frameNodes.forEach(frame => {
    const containedNodeIds = frame.data?.data?.containedNodes || [];
    const containedNodes = layoutedNodes.filter(n => containedNodeIds.includes(n.id));
    
    if (containedNodes.length > 0) {
      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      containedNodes.forEach(node => {
        const x = node.position.x;
        const y = node.position.y;
        const width = node.data?.size?.width || 180;
        const height = node.data?.size?.height || 80;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      });
      
      const padding = 40;
      layoutedNodes.push({
        ...frame,
        position: { x: minX - padding, y: minY - padding },
        data: {
          ...frame.data,
          size: {
            width: (maxX - minX) + (padding * 2),
            height: (maxY - minY) + (padding * 2)
          },
          // WICHTIG: containedNodes beibehalten!
          data: {
            ...frame.data?.data,
            containedNodes: containedNodeIds
          }
        }
      });
    } else {
      // Frame has no contained nodes, keep original position
      layoutedNodes.push(frame);
    }
  });
  
  // Sort nodes to ensure frames are first (rendered in background)
  const sortedNodes = [...layoutedNodes].sort((a, b) => {
    if (a.type === 'frame' && b.type !== 'frame') return -1;
    if (a.type !== 'frame' && b.type === 'frame') return 1;
    return 0;
  });
  
  // Keep all edges unchanged
  console.log('🌲 Tree Layout Complete');
  
  return { nodes: sortedNodes, edges };
};