import { Node, Edge } from 'reactflow';

export function debugTreeLayout(nodes: Node[], edges: Edge[]) {
  console.group('🔍 Tree Layout Debug');
  
  // Find all nodes and their connections
  const nodeMap = new Map<string, Node>();
  nodes.forEach(n => nodeMap.set(n.id, n));
  
  // Analyze each node
  nodes.forEach(node => {
    const incomingEdges = edges.filter(e => e.target === node.id);
    const outgoingEdges = edges.filter(e => e.source === node.id);
    
    console.log(`📍 Node: ${node.id} (${node.type})`);
    console.log(`   Title: ${node.data?.title || 'No title'}`);
    console.log(`   Position: x=${node.position.x}, y=${node.position.y}`);
    console.log(`   Incoming edges (${incomingEdges.length}):`);
    incomingEdges.forEach(e => {
      const sourceNode = nodeMap.get(e.source);
      console.log(`     ← from ${e.source} (${sourceNode?.data?.title || 'Unknown'}) - Edge: ${e.id}`);
    });
    console.log(`   Outgoing edges (${outgoingEdges.length}):`);
    outgoingEdges.forEach(e => {
      const targetNode = nodeMap.get(e.target);
      console.log(`     → to ${e.target} (${targetNode?.data?.title || 'Unknown'}) - Edge: ${e.id}`);
    });
  });
  
  // Check for orphaned edges
  const orphanedEdges = edges.filter(e => 
    !nodeMap.has(e.source) || !nodeMap.has(e.target)
  );
  
  if (orphanedEdges.length > 0) {
    console.warn('⚠️ Orphaned edges found:', orphanedEdges);
  }
  
  // Check for self-loops
  const selfLoops = edges.filter(e => e.source === e.target);
  if (selfLoops.length > 0) {
    console.warn('🔄 Self-loop edges found:', selfLoops);
  }
  
  // Analyze frames
  const frameNodes = nodes.filter(n => n.type === 'frame');
  frameNodes.forEach(frame => {
    const containedNodes = frame.data?.data?.containedNodes || [];
    console.log(`📦 Frame: ${frame.id}`);
    console.log(`   Contains ${containedNodes.length} nodes:`, containedNodes);
    
    // Check which contained nodes actually exist
    const missingNodes = containedNodes.filter(id => !nodeMap.has(id));
    if (missingNodes.length > 0) {
      console.warn(`   ⚠️ Missing nodes in frame:`, missingNodes);
    }
  });
  
  console.groupEnd();
  
  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    orphanedEdges: orphanedEdges.length,
    selfLoops: selfLoops.length,
    frames: frameNodes.length
  };
}

export function analyzeNodeConnectivity(nodes: Node[], edges: Edge[]) {
  const connectivity = new Map<string, {
    node: Node,
    inDegree: number,
    outDegree: number,
    isRoot: boolean,
    isLeaf: boolean,
    isIsolated: boolean
  }>();
  
  nodes.forEach(node => {
    const incomingEdges = edges.filter(e => e.target === node.id);
    const outgoingEdges = edges.filter(e => e.source === node.id);
    
    connectivity.set(node.id, {
      node,
      inDegree: incomingEdges.length,
      outDegree: outgoingEdges.length,
      isRoot: incomingEdges.length === 0 && outgoingEdges.length > 0,
      isLeaf: incomingEdges.length > 0 && outgoingEdges.length === 0,
      isIsolated: incomingEdges.length === 0 && outgoingEdges.length === 0
    });
  });
  
  return connectivity;
}