import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

/**
 * Genius Auto-Layout Algorithm
 * 
 * A next-generation layout algorithm that creates perfect, professional layouts
 * with consistent spacing, no overlaps, and intelligent directional flow.
 */

export type LayoutMode = 'vertical' | 'horizontal' | 'compact' | 'tree' | 'smart' | 'mixed';

interface LayoutOptions {
  mode?: LayoutMode;
  minNodeSpacing?: number;     // Minimum space between nodes
  optimalNodeSpacing?: number; // Optimal space between nodes
  rankSpacing?: number;        // Space between ranks/levels
  compactness?: number;        // 0-1, how compact the layout should be
  animate?: boolean;
  respectPinned?: boolean;
  avoidOverlaps?: boolean;
  smartDirections?: boolean;   // Intelligent handle selection
  edgeBuffer?: number;         // Minimum distance between edges and nodes
}

interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface EdgePath {
  source: NodeBounds;
  target: NodeBounds;
  sourceHandle: string;
  targetHandle: string;
  points: { x: number; y: number }[];
  length: number;
  crossings: number;
  quality: number; // 0-1, higher is better
}

interface HandleAssignment {
  nodeId: string;
  incoming: Map<string, Edge[]>; // handle -> edges using it for incoming
  outgoing: Map<string, Edge[]>; // handle -> edges using it for outgoing
  availableHandles: string[];
}

interface LayoutAnalysis {
  flowDirection: 'vertical' | 'horizontal' | 'mixed';
  density: number;
  branchingFactor: number;
  depth: number;
  width: number;
  hasBackEdges: boolean;
  hasCycles: boolean;
  connectedComponents: Set<string>[];
}

const defaultOptions: Required<LayoutOptions> = {
  mode: 'smart',
  minNodeSpacing: 80,  // Reduced for tighter layout
  optimalNodeSpacing: 120,  // More reasonable spacing
  rankSpacing: 140,  // Much less vertical spacing
  compactness: 0.7,  // Slightly more compact
  animate: true,
  respectPinned: true,
  avoidOverlaps: true,
  smartDirections: true,
  edgeBuffer: 35,  // Reasonable edge buffer
};

export class GeniusAutoLayout {
  private nodes: Node[];
  private edges: Edge[];
  private options: Required<LayoutOptions>;
  private nodeBounds: Map<string, NodeBounds> = new Map();
  private adjacencyList: Map<string, Set<string>> = new Map();
  private layoutAnalysis: LayoutAnalysis | null = null;
  private frameHierarchy: Map<string, Set<string>> = new Map();
  private originalFrameContents: Map<string, Set<string>> = new Map(); // Store original frame contents
  private nodeDepths: Map<string, number> = new Map();
  private randomSeed: number = 12345; // Deterministic seed for consistent results

  constructor(nodes: Node[], edges: Edge[], options: LayoutOptions = {}) {
    this.nodes = nodes;
    this.edges = edges;
    this.options = { ...defaultOptions, ...options };
    this.initialize();
  }

  private initialize(): void {
    // Build node bounds with type-specific sizing
    this.nodes.forEach(node => {
      const { width, height } = this.getNodeDimensions(node);
      this.nodeBounds.set(node.id, {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width,
        height,
        centerX: node.position.x + width / 2,
        centerY: node.position.y + height / 2,
      });
    });

    // Build adjacency list
    this.nodes.forEach(node => {
      this.adjacencyList.set(node.id, new Set());
    });
    this.edges.forEach(edge => {
      this.adjacencyList.get(edge.source)?.add(edge.target);
    });

    // Build frame hierarchy
    this.buildFrameHierarchy();

    // Analyze layout
    this.layoutAnalysis = this.analyzeGraph();
  }

  private buildFrameHierarchy(): void {
    const frames = this.nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const frameBounds = this.nodeBounds.get(frame.id)!;
      const contained = new Set<string>();
      
      // Check if frame already has stored contents from previous runs
      if (frame.data?.containedNodes) {
        // Use stored contents to ensure consistency
        frame.data.containedNodes.forEach((nodeId: string) => {
          if (this.nodes.find(n => n.id === nodeId)) {
            contained.add(nodeId);
          }
        });
      } else {
        // First time - determine contents based on position
        this.nodes.forEach(node => {
          if (node.id === frame.id || node.type === 'frame') return;
          const nodeBounds = this.nodeBounds.get(node.id)!;
          
          // Use full bounds check for initial determination
          const nodeLeft = nodeBounds.x;
          const nodeRight = nodeBounds.x + nodeBounds.width;
          const nodeTop = nodeBounds.y;
          const nodeBottom = nodeBounds.y + nodeBounds.height;
          
          const frameLeft = frameBounds.x;
          const frameRight = frameBounds.x + frameBounds.width;
          const frameTop = frameBounds.y;
          const frameBottom = frameBounds.y + frameBounds.height;
          
          // Node is inside if it's mostly within frame bounds (80% overlap)
          const overlapX = Math.max(0, Math.min(nodeRight, frameRight) - Math.max(nodeLeft, frameLeft));
          const overlapY = Math.max(0, Math.min(nodeBottom, frameBottom) - Math.max(nodeTop, frameTop));
          const nodeArea = nodeBounds.width * nodeBounds.height;
          const overlapArea = overlapX * overlapY;
          
          if (overlapArea > nodeArea * 0.8) {
            contained.add(node.id);
          }
        });
      }
      
      // Store both in hierarchy and as original contents
      this.frameHierarchy.set(frame.id, contained);
      this.originalFrameContents.set(frame.id, new Set(contained));
    });
  }

  // Removed unused method isNodeInBounds

  private analyzeGraph(): LayoutAnalysis {
    // Find flow direction
    const flowDirection = this.detectFlowDirection();
    
    // Calculate metrics
    const density = this.edges.length / (this.nodes.length * (this.nodes.length - 1) / 2);
    const branchingFactor = this.calculateBranchingFactor();
    const { depth, width } = this.calculateDepthAndWidth();
    const hasBackEdges = this.detectBackEdges();
    const hasCycles = this.detectCycles();
    const connectedComponents = this.findConnectedComponents();

    return {
      flowDirection,
      density,
      branchingFactor,
      depth,
      width,
      hasBackEdges,
      hasCycles,
      connectedComponents,
    };
  }

  private detectFlowDirection(): 'vertical' | 'horizontal' | 'mixed' {
    let verticalEdges = 0;
    let horizontalEdges = 0;

    this.edges.forEach(edge => {
      const source = this.nodeBounds.get(edge.source);
      const target = this.nodeBounds.get(edge.target);
      
      if (!source || !target) return;
      
      const dx = Math.abs(target.centerX - source.centerX);
      const dy = Math.abs(target.centerY - source.centerY);
      
      if (dy > dx) verticalEdges++;
      else horizontalEdges++;
    });

    const ratio = verticalEdges / (verticalEdges + horizontalEdges);
    if (ratio > 0.7) return 'vertical';
    if (ratio < 0.3) return 'horizontal';
    return 'mixed';
  }

  private calculateBranchingFactor(): number {
    let totalBranches = 0;
    let nodesWithBranches = 0;

    this.adjacencyList.forEach((targets) => {
      if (targets.size > 1) {
        totalBranches += targets.size;
        nodesWithBranches++;
      }
    });

    return nodesWithBranches > 0 ? totalBranches / nodesWithBranches : 1;
  }

  private calculateDepthAndWidth(): { depth: number; width: number } {
    const levels = this.calculateNodeLevels();
    const levelCounts = new Map<number, number>();

    levels.forEach(level => {
      levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
    });

    const depth = Math.max(...Array.from(levelCounts.keys())) + 1;
    const width = Math.max(...Array.from(levelCounts.values()));

    return { depth, width };
  }

  private calculateNodeLevels(): Map<string, number> {
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    
    // Find roots (nodes with no incoming edges)
    const roots = this.nodes.filter(node => {
      return !this.edges.some(edge => edge.target === node.id);
    });

    // BFS from roots
    const queue: { id: string; level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
    
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);
      levels.set(id, level);
      this.nodeDepths.set(id, level);
      
      const targets = this.adjacencyList.get(id) || new Set();
      targets.forEach(targetId => {
        if (!visited.has(targetId)) {
          queue.push({ id: targetId, level: level + 1 });
        }
      });
    }

    // Handle disconnected nodes
    this.nodes.forEach(node => {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0);
        this.nodeDepths.set(node.id, 0);
      }
    });

    return levels;
  }

  private detectBackEdges(): boolean {
    const levels = this.nodeDepths;
    
    return this.edges.some(edge => {
      const sourceLevel = levels.get(edge.source) || 0;
      const targetLevel = levels.get(edge.target) || 0;
      return targetLevel <= sourceLevel;
    });
  }

  private detectCycles(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const targets = this.adjacencyList.get(nodeId) || new Set();
      for (const target of targets) {
        if (!visited.has(target)) {
          if (hasCycleDFS(target)) return true;
        } else if (recursionStack.has(target)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const node of this.nodes) {
      if (!visited.has(node.id) && hasCycleDFS(node.id)) {
        return true;
      }
    }
    
    return false;
  }

  private findConnectedComponents(): Set<string>[] {
    const visited = new Set<string>();
    const components: Set<string>[] = [];
    
    const dfs = (nodeId: string, component: Set<string>) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      component.add(nodeId);
      
      // Check both directions
      this.edges.forEach(edge => {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          dfs(edge.target, component);
        }
        if (edge.target === nodeId && !visited.has(edge.source)) {
          dfs(edge.source, component);
        }
      });
    };
    
    this.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const component = new Set<string>();
        dfs(node.id, component);
        components.push(component);
      }
    });
    
    return components;
  }

  public execute(): { nodes: Node[]; edges: Edge[] } {
    console.log('[UltimateLayout] Starting SMART layout algorithm');
    
    // Only handle 'smart' mode with the new algorithm
    if (this.options.mode !== 'smart') {
      // Fallback to simple layout for other modes
      return this.executeLegacyLayout(this.options.mode);
    }
    
    // ========================================================================
    // PHASE 1: Smart Initial Placement (SIP)
    // ========================================================================
    console.log('[Phase 1] Smart Initial Placement');
    const graphAnalysis = this.performGraphAnalysis();
    const hierarchy = this.buildNodeHierarchy(graphAnalysis);
    let layoutedNodes = this.calculateCompactPositions(hierarchy, graphAnalysis);
    layoutedNodes = this.optimizeFrameInternalLayouts(layoutedNodes, graphAnalysis);
    
    // ========================================================================
    // PHASE 2: Handle Assignment System (HAS)
    // ========================================================================
    console.log('[Phase 2] Handle Assignment with STRICT separation');
    const handleManager = this.createHandleManager(layoutedNodes);
    const prioritizedEdges = this.prioritizeEdges(this.edges, graphAnalysis);
    let assignedEdges = this.assignOptimalHandles(prioritizedEdges, layoutedNodes, handleManager);
    
    // ========================================================================
    // PHASE 3: Collision Detection & Resolution (CDR)
    // ========================================================================
    console.log('[Phase 3] Collision Detection & Resolution');
    let iteration = 0;
    const maxIterations = 10;
    
    while (iteration < maxIterations) {
      const collisions = this.detectAllCollisionTypes(layoutedNodes, assignedEdges);
      
      if (collisions.length === 0) {
        console.log(`[Phase 3] No collisions after ${iteration} iterations!`);
        break;
      }
      
      console.log(`[Phase 3] Iteration ${iteration}: ${collisions.length} collisions found`);
      const resolution = this.resolveCollisionsSmartly(collisions, layoutedNodes, assignedEdges, handleManager);
      layoutedNodes = resolution.nodes;
      assignedEdges = resolution.edges;
      
      iteration++;
    }
    
    // ========================================================================
    // PHASE 4: Quality Metrics & Refinement (QMR)
    // ========================================================================
    console.log('[Phase 4] Quality Refinement');
    const quality = this.calculateLayoutQuality(layoutedNodes, assignedEdges);
    console.log(`[Phase 4] Quality Score: ${quality.totalScore.toFixed(2)}`);
    
    if (quality.totalScore < 0.8) {
      const refined = this.refineLayout(layoutedNodes, assignedEdges, quality);
      layoutedNodes = refined.nodes;
      assignedEdges = refined.edges;
    }
    
    // Final polish
    layoutedNodes = this.enforceFrameBoundaries(layoutedNodes);
    layoutedNodes = this.autoSizeFrames(layoutedNodes);
    layoutedNodes = this.centerLayout(layoutedNodes);
    layoutedNodes = this.alignToGrid(layoutedNodes);
    
    console.log('[UltimateLayout] Smart layout complete!');
    return {
      nodes: layoutedNodes,
      edges: assignedEdges,
    };
  }
  
  // Fallback for non-smart modes
  private executeLegacyLayout(mode: LayoutMode): { nodes: Node[]; edges: Edge[] } {
    let layoutedNodes = this.applyLayout(mode);
    layoutedNodes = this.enforceMinimumSpacing(layoutedNodes);
    layoutedNodes = this.preventNodeOverlaps(layoutedNodes);
    let optimizedEdges = this.optimizeAllEdgeHandles(layoutedNodes);
    return { nodes: layoutedNodes, edges: optimizedEdges };
  }
  
  // ========================================================================
  // PASS 2: Holistic Handle Optimization 
  // ========================================================================
  private optimizeHandlesHolistically(nodes: Node[], edges: Edge[]): Edge[] {
    console.log('[Pass 2] Starting STRICT handle optimization - NO IN/OUT MIXING!');
    
    // CRITICAL: Track handle usage STRICTLY - separate IN and OUT
    const handleUsage = new Map<string, { 
      incoming: Set<string>,  // Handles used for INCOMING edges
      outgoing: Set<string>   // Handles used for OUTGOING edges
    }>();
    
    nodes.forEach(node => {
      handleUsage.set(node.id, {
        incoming: new Set(),
        outgoing: new Set()
      });
    });
    
    // Sort edges by importance (main flow first)
    const sortedEdges = this.sortEdgesByImportance(edges, nodes);
    
    // Optimize each edge with STRICT handle separation
    const optimizedEdges = sortedEdges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return edge;
      
      const sourceBounds = this.nodeBounds.get(edge.source)!;
      const targetBounds = this.nodeBounds.get(edge.target)!;
      
      // Get usage for both nodes
      const sourceUsage = handleUsage.get(edge.source)!;
      const targetUsage = handleUsage.get(edge.target)!;
      
      // CRITICAL: Find handles that are NOT used for opposite direction
      const availableSourceHandles = ['top', 'right', 'bottom', 'left'].filter(h => {
        // This handle must NOT be used for incoming edges
        return !sourceUsage.incoming.has(h);
      });
      
      const availableTargetHandles = ['top', 'right', 'bottom', 'left'].filter(h => {
        // This handle must NOT be used for outgoing edges
        return !targetUsage.outgoing.has(h);
      });
      
      // If no handles available, we have a problem - find least used
      if (availableSourceHandles.length === 0) {
        console.warn(`[Handle] Node ${edge.source} has all handles blocked for outgoing!`);
        availableSourceHandles.push(this.findLeastUsedHandle(sourceUsage.outgoing));
      }
      
      if (availableTargetHandles.length === 0) {
        console.warn(`[Handle] Node ${edge.target} has all handles blocked for incoming!`);
        availableTargetHandles.push(this.findLeastUsedHandle(targetUsage.incoming));
      }
      
      // Find optimal handles from available ones
      let bestConfig = {
        sourceHandle: availableSourceHandles[0],
        targetHandle: availableTargetHandles[0],
        score: Infinity
      };
      
      // Score all valid combinations
      availableSourceHandles.forEach(sourceHandle => {
        availableTargetHandles.forEach(targetHandle => {
          const score = this.scoreHandleConfigurationCompact(
            sourceNode, targetNode, sourceHandle, targetHandle,
            sourceBounds, targetBounds, nodes, edges
          );
          
          if (score < bestConfig.score) {
            bestConfig = { sourceHandle, targetHandle, score };
          }
        });
      });
      
      // CRITICAL: Mark handles as used IN CORRECT DIRECTION
      sourceUsage.outgoing.add(bestConfig.sourceHandle);
      targetUsage.incoming.add(bestConfig.targetHandle);
      
      return {
        ...edge,
        sourceHandle: bestConfig.sourceHandle,
        targetHandle: bestConfig.targetHandle,
        data: {
          ...edge.data,
          sourceHandle: bestConfig.sourceHandle,
          targetHandle: bestConfig.targetHandle
        }
      };
    });
    
    // Log usage statistics
    let mixedHandles = 0;
    handleUsage.forEach((usage, nodeId) => {
      usage.incoming.forEach(h => {
        if (usage.outgoing.has(h)) {
          console.error(`[CRITICAL] Node ${nodeId} has handle ${h} used for BOTH in and out!`);
          mixedHandles++;
        }
      });
    });
    
    if (mixedHandles === 0) {
      console.log('[Pass 2] SUCCESS: No mixed IN/OUT handles!');
    }
    
    return optimizedEdges;
  }
  
  private sortEdgesByImportance(edges: Edge[], nodes: Node[]): Edge[] {
    // Sort edges so main flow gets priority
    return [...edges].sort((a, b) => {
      // Start/End nodes get priority
      const aHasStart = nodes.find(n => n.id === a.source)?.type === 'start';
      const bHasStart = nodes.find(n => n.id === b.source)?.type === 'start';
      const aHasEnd = nodes.find(n => n.id === a.target)?.type === 'end';
      const bHasEnd = nodes.find(n => n.id === b.target)?.type === 'end';
      
      if (aHasStart && !bHasStart) return -1;
      if (bHasStart && !aHasStart) return 1;
      if (aHasEnd && !bHasEnd) return -1;
      if (bHasEnd && !aHasEnd) return 1;
      
      return 0;
    });
  }
  
  private findLeastUsedHandle(usedHandles: Set<string>): string {
    const handles = ['top', 'right', 'bottom', 'left'];
    const usage = new Map<string, number>();
    
    handles.forEach(h => {
      usage.set(h, 0);
    });
    
    // Count usage (this shouldn't happen if algorithm works correctly)
    usedHandles.forEach(h => {
      usage.set(h, (usage.get(h) || 0) + 1);
    });
    
    // Return least used
    let minUsage = Infinity;
    let bestHandle = 'right';
    
    usage.forEach((count, handle) => {
      if (count < minUsage) {
        minUsage = count;
        bestHandle = handle;
      }
    });
    
    return bestHandle;
  }
  
  private scoreHandleConfigurationCompact(
    sourceNode: Node, targetNode: Node,
    sourceHandle: string, targetHandle: string,
    sourceBounds: NodeBounds, targetBounds: NodeBounds,
    allNodes: Node[], allEdges: Edge[]
  ): number {
    // PRIORITIZE COMPACTNESS!
    
    const sourcePoint = this.getHandlePoint({
      ...sourceBounds,
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      centerX: sourceNode.position.x + sourceBounds.width / 2,
      centerY: sourceNode.position.y + sourceBounds.height / 2
    }, sourceHandle);
    
    const targetPoint = this.getHandlePoint({
      ...targetBounds,
      x: targetNode.position.x,
      y: targetNode.position.y,
      centerX: targetNode.position.x + targetBounds.width / 2,
      centerY: targetNode.position.y + targetBounds.height / 2
    }, targetHandle);
    
    // 1. SHORTEST PATH is most important
    const edgeLength = Math.sqrt(
      Math.pow(targetPoint.x - sourcePoint.x, 2) + 
      Math.pow(targetPoint.y - sourcePoint.y, 2)
    );
    
    let score = edgeLength; // Base score is length
    
    // 2. Natural flow direction bonus
    const dx = targetNode.position.x - sourceNode.position.x;
    const dy = targetNode.position.y - sourceNode.position.y;
    
    if (dx > 0 && sourceHandle === 'right' && targetHandle === 'left') {
      score -= 100; // Strong bonus for left-to-right flow
    } else if (dy > 0 && sourceHandle === 'bottom' && targetHandle === 'top') {
      score -= 80; // Bonus for top-to-bottom flow
    }
    
    // 3. Penalty for awkward connections
    if ((sourceHandle === 'left' && targetHandle === 'right' && dx > 0) ||
        (sourceHandle === 'right' && targetHandle === 'left' && dx < 0)) {
      score += 200; // Penalty for backwards flow
    }
    
    // 4. Check for obstacles
    const obstacles = this.countObstaclesBetween(sourcePoint, targetPoint, allNodes, [sourceNode.id, targetNode.id]);
    score += obstacles * 150; // Heavy penalty for each obstacle
    
    return score;
  }
  
  private countObstaclesBetween(
    start: { x: number, y: number },
    end: { x: number, y: number },
    nodes: Node[],
    excludeIds: string[]
  ): number {
    let obstacles = 0;
    
    nodes.forEach(node => {
      if (excludeIds.includes(node.id)) return;
      if (node.type === 'frame') return;
      
      const bounds = this.nodeBounds.get(node.id)!;
      const rect = {
        x: node.position.x,
        y: node.position.y,
        width: bounds.width,
        height: bounds.height
      };
      
      if (this.lineIntersectsRect(start, end, rect)) {
        obstacles++;
      }
    });
    
    return obstacles;
  }
  
  private scoreHandleConfiguration(
    sourceNode: Node, targetNode: Node,
    sourceHandle: string, targetHandle: string,
    sourceBounds: NodeBounds, targetBounds: NodeBounds,
    flowPaths: Map<string, { path: string[], score: number }>,
    allEdges: Edge[]
  ): number {
    // Calculate multiple scoring factors
    
    // 1. Edge length
    const sourcePoint = this.getHandlePoint({
      ...sourceBounds,
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      centerX: sourceNode.position.x + sourceBounds.width / 2,
      centerY: sourceNode.position.y + sourceBounds.height / 2
    }, sourceHandle);
    
    const targetPoint = this.getHandlePoint({
      ...targetBounds,
      x: targetNode.position.x,
      y: targetNode.position.y,
      centerX: targetNode.position.x + targetBounds.width / 2,
      centerY: targetNode.position.y + targetBounds.height / 2
    }, targetHandle);
    
    const edgeLength = Math.sqrt(
      Math.pow(targetPoint.x - sourcePoint.x, 2) + 
      Math.pow(targetPoint.y - sourcePoint.y, 2)
    );
    
    // 2. Flow continuity (intermediate nodes should have aligned handles)
    let flowScore = 0;
    const incomingEdges = allEdges.filter(e => e.target === sourceNode.id);
    const outgoingEdges = allEdges.filter(e => e.source === targetNode.id);
    
    if (incomingEdges.length === 1 && sourceHandle === this.getOppositeHandle(incomingEdges[0].targetHandle || 'left')) {
      flowScore -= 100; // Bonus for flow continuity
    }
    
    if (outgoingEdges.length === 1 && targetHandle === this.getOppositeHandle(outgoingEdges[0].sourceHandle || 'right')) {
      flowScore -= 100; // Bonus for flow continuity
    }
    
    // 3. Natural direction preference
    const dx = targetNode.position.x - sourceNode.position.x;
    const dy = targetNode.position.y - sourceNode.position.y;
    
    let directionScore = 0;
    if (dx > 0 && sourceHandle === 'right' && targetHandle === 'left') {
      directionScore -= 50; // Natural left-to-right flow
    } else if (dy > 0 && sourceHandle === 'bottom' && targetHandle === 'top') {
      directionScore -= 50; // Natural top-to-bottom flow
    }
    
    // 4. Avoid awkward angles
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const handleAngle = this.getHandleAngle(sourceHandle);
    const angleDiff = Math.abs(angle - handleAngle);
    const angleScore = angleDiff > 90 ? angleDiff : 0;
    
    return edgeLength + flowScore + directionScore + angleScore;
  }
  
  private getHandleAngle(handle: string): number {
    switch (handle) {
      case 'top': return -90;
      case 'right': return 0;
      case 'bottom': return 90;
      case 'left': return 180;
      default: return 0;
    }
  }
  
  private analyzeFlowPaths(nodes: Node[], edges: Edge[]): Map<string, { path: string[], score: number }> {
    const paths = new Map<string, { path: string[], score: number }>();
    
    // Find all paths from start nodes to end nodes
    const startNodes = nodes.filter(n => 
      n.type === 'start' || edges.filter(e => e.target === n.id).length === 0
    );
    
    startNodes.forEach(start => {
      const visited = new Set<string>();
      const path: string[] = [];
      
      const traverse = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        path.push(nodeId);
        
        const outgoing = edges.filter(e => e.source === nodeId);
        outgoing.forEach(edge => traverse(edge.target));
      };
      
      traverse(start.id);
      paths.set(start.id, { path, score: path.length });
    });
    
    return paths;
  }
  
  // ========================================================================
  // PASS 3: Smart Collision Resolution
  // ========================================================================
  private resolveAllCollisionsSmartly(
    nodes: Node[], 
    edges: Edge[]
  ): { nodes: Node[], edges: Edge[] } {
    console.log('[Pass 3] Starting smart collision resolution');
    
    let adjustedNodes = [...nodes];
    const maxIterations = 10;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Detect all collision types with priority
      const collisions = this.detectPrioritizedCollisions(adjustedNodes, edges);
      
      if (collisions.length === 0) {
        console.log(`[Pass 3] No collisions found after ${iter} iterations!`);
        break;
      }
      
      console.log(`[Pass 3] Iteration ${iter}: ${collisions.length} collisions`);
      console.log(`  - Edge-Node: ${collisions.filter(c => c.type === 'edge-node').length}`);
      console.log(`  - Label-Label: ${collisions.filter(c => c.type === 'label-label').length}`);
      console.log(`  - Edge-Edge: ${collisions.filter(c => c.type === 'edge-edge').length}`);
      
      // Group collisions by node and calculate smart movements
      const movements = this.calculateSmartMovements(collisions, adjustedNodes, edges);
      
      // Apply movements with constraints
      movements.forEach((movement, nodeId) => {
        const node = adjustedNodes.find(n => n.id === nodeId);
        if (!node || node.data?.isPinned) return;
        
        // Apply movement with frame constraints
        const constrained = this.constrainNodeMovement(
          node, movement.x, movement.y, adjustedNodes
        );
        
        node.position.x = constrained.x;
        node.position.y = constrained.y;
      });
      
      // Ensure minimum spacing after movements
      adjustedNodes = this.enforceMinimumSpacing(adjustedNodes);
      adjustedNodes = this.enforceFrameBoundaries(adjustedNodes);
    }
    
    console.log('[Pass 3] Collision resolution complete');
    return { nodes: adjustedNodes, edges };
  }
  
  private detectPrioritizedCollisions(
    nodes: Node[],
    edges: Edge[]
  ): Array<{
    type: 'edge-node' | 'label-label' | 'edge-edge',
    priority: number,
    nodeId?: string,
    edgeId?: string,
    adjustment: { x: number, y: number }
  }> {
    const collisions: Array<{
      type: 'edge-node' | 'label-label' | 'edge-edge',
      priority: number,
      nodeId?: string,
      edgeId?: string,
      adjustment: { x: number, y: number }
    }> = [];
    
    // 1. CRITICAL: Edge-Node collisions (Priority 1)
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      const edgePath = this.getEdgePath(sourceNode, targetNode, edge);
      
      nodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.type === 'frame') return;
        
        const nodeBounds = this.nodeBounds.get(node.id)!;
        const nodeRect = {
          x: node.position.x - 10, // Buffer
          y: node.position.y - 10,
          width: nodeBounds.width + 20,
          height: nodeBounds.height + 20
        };
        
        if (this.lineIntersectsRect(edgePath.start, edgePath.end, nodeRect)) {
          const adjustment = this.calculateSmartAdjustment(
            edgePath.start, edgePath.end, node, nodeBounds, nodes
          );
          
          collisions.push({
            type: 'edge-node',
            priority: 1,
            nodeId: node.id,
            edgeId: edge.id,
            adjustment
          });
        }
      });
    });
    
    // 2. CRITICAL: Label-Label overlaps (Priority 2)
    // This would check if edge labels overlap making them unreadable
    // For now simplified - would need label position calculation
    
    // 3. AVOIDABLE: Edge-Edge crossings (Priority 3)
    // These are less critical and sometimes unavoidable
    
    return collisions.sort((a, b) => a.priority - b.priority);
  }
  
  private getEdgePath(sourceNode: Node, targetNode: Node, edge: Edge): { start: { x: number, y: number }, end: { x: number, y: number } } {
    const sourceBounds = this.nodeBounds.get(sourceNode.id)!;
    const targetBounds = this.nodeBounds.get(targetNode.id)!;
    
    const start = this.getHandlePoint({
      ...sourceBounds,
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      centerX: sourceNode.position.x + sourceBounds.width / 2,
      centerY: sourceNode.position.y + sourceBounds.height / 2
    }, edge.sourceHandle || 'right');
    
    const end = this.getHandlePoint({
      ...targetBounds,
      x: targetNode.position.x,
      y: targetNode.position.y,
      centerX: targetNode.position.x + targetBounds.width / 2,
      centerY: targetNode.position.y + targetBounds.height / 2
    }, edge.targetHandle || 'left');
    
    return { start, end };
  }
  
  private calculateSmartMovements(
    collisions: Array<any>,
    nodes: Node[],
    edges: Edge[]
  ): Map<string, { x: number, y: number }> {
    const movements = new Map<string, { x: number, y: number, weight: number }>();
    
    // Aggregate movements per node with weighted average
    collisions.forEach(collision => {
      if (!collision.nodeId) return;
      
      const current = movements.get(collision.nodeId) || { x: 0, y: 0, weight: 0 };
      const weight = 1 / collision.priority; // Higher priority = more weight
      
      current.x = (current.x * current.weight + collision.adjustment.x * weight) / (current.weight + weight);
      current.y = (current.y * current.weight + collision.adjustment.y * weight) / (current.weight + weight);
      current.weight += weight;
      
      movements.set(collision.nodeId, current);
    });
    
    // Convert to final movements
    const finalMovements = new Map<string, { x: number, y: number }>();
    movements.forEach((movement, nodeId) => {
      // Scale movement to avoid over-correction
      finalMovements.set(nodeId, {
        x: movement.x * 0.7,
        y: movement.y * 0.7
      });
    });
    
    return finalMovements;
  }
  
  // ========================================================================
  // COMPACT HIERARCHICAL LAYOUT - Prioritize readability and density
  // ========================================================================
  private applyCompactHierarchicalLayout(mode: LayoutMode): Node[] {
    console.log('[CompactLayout] Creating dense, readable layout');
    
    // Use the existing hierarchical layout but with tighter spacing
    const originalSpacing = this.options.minNodeSpacing;
    const originalRankSpacing = this.options.rankSpacing;
    
    // Temporarily use tighter spacing for compactness
    this.options.minNodeSpacing = 60;  // Reduced from default
    this.options.rankSpacing = 100;    // Reduced from default
    
    // Apply hierarchical layout with frame-aware positioning
    let layoutedNodes = this.applyHierarchicalLayout(mode === 'smart' ? 'horizontal' : mode === 'vertical' ? 'TB' : 'LR');
    
    // Restore original spacing
    this.options.minNodeSpacing = originalSpacing;
    this.options.rankSpacing = originalRankSpacing;
    
    return layoutedNodes;
  }
  
  // Keep the intelligent layout for reference but not used
  private applyIntelligentLayout(mode: LayoutMode): Node[] {
    console.log('[IntelligentLayout] Starting context-aware positioning');
    
    // Step 1: Analyze the entire graph structure
    const graphAnalysis = this.analyzeGraphStructure();
    
    // Step 2: Identify thematic clusters and regions
    const clusters = this.identifyThematicClusters();
    
    // Step 3: Calculate optimal positions considering EVERYTHING
    let positionedNodes = this.calculateOptimalPositions(graphAnalysis, clusters);
    
    // Step 4: Fine-tune for frame interactions
    positionedNodes = this.optimizeFrameInteractions(positionedNodes);
    
    // Step 5: Predict edge paths and adjust
    positionedNodes = this.adjustForPredictedEdgePaths(positionedNodes);
    
    return positionedNodes;
  }
  
  private analyzeGraphStructure(): {
    mainFlow: string[],
    branches: Map<string, string[]>,
    isolatedNodes: string[],
    hubs: string[],
    criticalPaths: string[][]
  } {
    const analysis = {
      mainFlow: [] as string[],
      branches: new Map<string, string[]>(),
      isolatedNodes: [] as string[],
      hubs: [] as string[],
      criticalPaths: [] as string[][]
    };
    
    // Find main flow (longest path)
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || this.edges.filter(e => e.target === n.id).length === 0
    );
    
    startNodes.forEach(start => {
      const path = this.findLongestPath(start.id);
      if (path.length > analysis.mainFlow.length) {
        analysis.mainFlow = path;
      }
    });
    
    // Find hubs (nodes with many connections)
    this.nodes.forEach(node => {
      const inDegree = this.edges.filter(e => e.target === node.id).length;
      const outDegree = this.edges.filter(e => e.source === node.id).length;
      if (inDegree + outDegree >= 4) {
        analysis.hubs.push(node.id);
      }
    });
    
    // Find isolated nodes
    this.nodes.forEach(node => {
      const hasConnections = this.edges.some(e => 
        e.source === node.id || e.target === node.id
      );
      if (!hasConnections && node.type !== 'frame') {
        analysis.isolatedNodes.push(node.id);
      }
    });
    
    return analysis;
  }
  
  private identifyThematicClusters(): Map<string, Set<string>> {
    const clusters = new Map<string, Set<string>>();
    
    // Group nodes by connectivity strength
    const visited = new Set<string>();
    let clusterIndex = 0;
    
    this.nodes.forEach(node => {
      if (visited.has(node.id) || node.type === 'frame') return;
      
      const cluster = new Set<string>();
      const queue = [node.id];
      
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        cluster.add(current);
        
        // Add strongly connected neighbors
        const neighbors = this.getStronglyConnectedNeighbors(current);
        neighbors.forEach(n => {
          if (!visited.has(n)) queue.push(n);
        });
      }
      
      if (cluster.size > 0) {
        clusters.set(`cluster_${clusterIndex++}`, cluster);
      }
    });
    
    return clusters;
  }
  
  private getStronglyConnectedNeighbors(nodeId: string): string[] {
    const neighbors = new Set<string>();
    
    // Direct connections
    this.edges.forEach(edge => {
      if (edge.source === nodeId) neighbors.add(edge.target);
      if (edge.target === nodeId) neighbors.add(edge.source);
    });
    
    // Filter for strong connections (bidirectional or multiple edges)
    return Array.from(neighbors).filter(n => {
      const edgeCount = this.edges.filter(e => 
        (e.source === nodeId && e.target === n) || 
        (e.source === n && e.target === nodeId)
      ).length;
      return edgeCount >= 1; // Adjust threshold as needed
    });
  }
  
  private calculateOptimalPositions(
    analysis: any,
    clusters: Map<string, Set<string>>
  ): Node[] {
    const positions = new Map<string, { x: number, y: number }>();
    const spacing = this.options.optimalNodeSpacing;
    
    // Position main flow first
    let currentX = 0;
    let currentY = 0;
    
    analysis.mainFlow.forEach((nodeId, index) => {
      positions.set(nodeId, { x: currentX, y: currentY });
      
      // Smart spacing based on next node
      if (index < analysis.mainFlow.length - 1) {
        const nextId = analysis.mainFlow[index + 1];
        const hasIntermediateBranches = this.edges.some(e => 
          e.source === nodeId && e.target !== nextId
        );
        
        if (hasIntermediateBranches) {
          currentX += spacing * 1.5; // Extra space for branches
        } else {
          currentX += spacing;
        }
      }
    });
    
    // Position clusters around main flow
    clusters.forEach((clusterNodes, clusterId) => {
      if (Array.from(clusterNodes).every(n => analysis.mainFlow.includes(n))) {
        return; // Skip if all nodes are in main flow
      }
      
      // Find anchor point (connection to main flow)
      const anchor = this.findClusterAnchor(clusterNodes, analysis.mainFlow);
      if (anchor) {
        const anchorPos = positions.get(anchor)!;
        this.positionClusterAroundAnchor(clusterNodes, anchorPos, positions, anchor);
      } else {
        // Position isolated cluster
        this.positionIsolatedCluster(clusterNodes, positions, currentY);
        currentY += spacing * 2;
      }
    });
    
    // Position isolated nodes near thematically similar nodes
    analysis.isolatedNodes.forEach(nodeId => {
      const similarNode = this.findMostSimilarNode(nodeId, positions);
      if (similarNode) {
        const simPos = positions.get(similarNode)!;
        positions.set(nodeId, {
          x: simPos.x + spacing * 0.7,
          y: simPos.y + spacing * 0.7
        });
      }
    });
    
    // Apply positions to nodes
    return this.nodes.map(node => {
      const pos = positions.get(node.id);
      if (!pos) return node;
      
      return {
        ...node,
        position: { x: pos.x, y: pos.y }
      };
    });
  }
  
  private findLongestPath(startId: string): string[] {
    const visited = new Set<string>();
    let longestPath: string[] = [];
    
    const dfs = (nodeId: string, path: string[]) => {
      if (visited.has(nodeId)) return;
      
      visited.add(nodeId);
      path.push(nodeId);
      
      const outgoing = this.edges.filter(e => e.source === nodeId);
      if (outgoing.length === 0) {
        if (path.length > longestPath.length) {
          longestPath = [...path];
        }
      } else {
        outgoing.forEach(edge => {
          dfs(edge.target, [...path]);
        });
      }
      
      visited.delete(nodeId);
    };
    
    dfs(startId, []);
    return longestPath;
  }
  
  private findClusterAnchor(cluster: Set<string>, mainFlow: string[]): string | null {
    // Find node in cluster that connects to main flow
    for (const nodeId of cluster) {
      const connections = this.edges.filter(e => 
        (e.source === nodeId && mainFlow.includes(e.target)) ||
        (e.target === nodeId && mainFlow.includes(e.source))
      );
      if (connections.length > 0) {
        return mainFlow.find(n => 
          connections.some(e => e.source === n || e.target === n)
        ) || null;
      }
    }
    return null;
  }
  
  private positionClusterAroundAnchor(
    cluster: Set<string>,
    anchorPos: { x: number, y: number },
    positions: Map<string, { x: number, y: number }>,
    anchorId: string
  ): void {
    const spacing = this.options.minNodeSpacing;
    let offsetX = 0;
    let offsetY = spacing;
    
    cluster.forEach(nodeId => {
      if (positions.has(nodeId)) return; // Already positioned
      
      // Smart positioning based on connection type
      const isSource = this.edges.some(e => e.source === anchorId && e.target === nodeId);
      const isTarget = this.edges.some(e => e.target === anchorId && e.source === nodeId);
      
      if (isSource) {
        // Position to the right/below
        positions.set(nodeId, {
          x: anchorPos.x + spacing,
          y: anchorPos.y + offsetY
        });
      } else if (isTarget) {
        // Position to the left/above
        positions.set(nodeId, {
          x: anchorPos.x - spacing,
          y: anchorPos.y + offsetY
        });
      } else {
        // Position to the side
        positions.set(nodeId, {
          x: anchorPos.x + offsetX,
          y: anchorPos.y + offsetY
        });
      }
      
      offsetY += spacing * 0.8;
      offsetX = -offsetX + (offsetX >= 0 ? -spacing : spacing);
    });
  }
  
  private positionIsolatedCluster(
    cluster: Set<string>,
    positions: Map<string, { x: number, y: number }>,
    baseY: number
  ): void {
    const spacing = this.options.minNodeSpacing;
    let x = 0;
    let y = baseY;
    
    // Layout cluster in a compact grid
    const nodesArray = Array.from(cluster);
    const cols = Math.ceil(Math.sqrt(nodesArray.length));
    
    nodesArray.forEach((nodeId, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      positions.set(nodeId, {
        x: x + col * spacing,
        y: y + row * spacing
      });
    });
  }
  
  private findMostSimilarNode(nodeId: string, positions: Map<string, { x: number, y: number }>): string | null {
    // Find node with similar type or label
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    const similar = this.nodes.find(n => 
      n.id !== nodeId && 
      n.type === node.type && 
      positions.has(n.id)
    );
    
    return similar?.id || null;
  }
  
  private optimizeFrameInteractions(nodes: Node[]): Node[] {
    // Adjust frame contents to optimize external connections
    const frames = nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const frameContents = this.originalFrameContents.get(frame.id);
      if (!frameContents) return;
      
      // Find external connections
      const externalEdges = this.edges.filter(e => {
        const sourceInFrame = frameContents.has(e.source);
        const targetInFrame = frameContents.has(e.target);
        return sourceInFrame !== targetInFrame; // One in, one out
      });
      
      if (externalEdges.length === 0) return;
      
      // Position nodes near frame boundaries for external connections
      externalEdges.forEach(edge => {
        const internalNodeId = frameContents.has(edge.source) ? edge.source : edge.target;
        const externalNodeId = frameContents.has(edge.source) ? edge.target : edge.source;
        
        const internalNode = nodes.find(n => n.id === internalNodeId);
        const externalNode = nodes.find(n => n.id === externalNodeId);
        
        if (!internalNode || !externalNode) return;
        
        // Position internal node closer to frame edge nearest to external node
        const frameBounds = this.nodeBounds.get(frame.id)!;
        const dx = externalNode.position.x - frame.position.x;
        const dy = externalNode.position.y - frame.position.y;
        
        let targetX = internalNode.position.x;
        let targetY = internalNode.position.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal alignment more important
          if (dx > frameBounds.width / 2) {
            // External node is to the right
            targetX = frame.position.x + frameBounds.width - 100;
          } else {
            // External node is to the left
            targetX = frame.position.x + 100;
          }
        } else {
          // Vertical alignment more important
          if (dy > frameBounds.height / 2) {
            // External node is below
            targetY = frame.position.y + frameBounds.height - 100;
          } else {
            // External node is above
            targetY = frame.position.y + 100;
          }
        }
        
        // Smoothly move internal node toward target
        internalNode.position.x = internalNode.position.x * 0.3 + targetX * 0.7;
        internalNode.position.y = internalNode.position.y * 0.3 + targetY * 0.7;
      });
    });
    
    return nodes;
  }
  
  private adjustForPredictedEdgePaths(nodes: Node[]): Node[] {
    // Predict where edges will be drawn and adjust nodes to avoid collisions
    const adjustedNodes = [...nodes];
    
    // For each edge, predict its path
    this.edges.forEach(edge => {
      const sourceNode = adjustedNodes.find(n => n.id === edge.source);
      const targetNode = adjustedNodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      // Predict optimal handle selection
      const predictedHandles = this.predictOptimalHandles(sourceNode, targetNode, adjustedNodes);
      
      // Check if path would collide with other nodes
      const path = this.predictEdgePath(sourceNode, targetNode, predictedHandles);
      
      adjustedNodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.type === 'frame') return;
        
        const nodeBounds = this.nodeBounds.get(node.id)!;
        const nodeRect = {
          x: node.position.x,
          y: node.position.y,
          width: nodeBounds.width,
          height: nodeBounds.height
        };
        
        // If collision predicted, adjust node position
        if (this.wouldPathCollide(path, nodeRect)) {
          const adjustment = this.calculateCollisionAvoidance(path, nodeRect, node);
          node.position.x += adjustment.x * 0.5; // Gentle adjustment
          node.position.y += adjustment.y * 0.5;
        }
      });
    });
    
    return adjustedNodes;
  }
  
  private predictOptimalHandles(
    source: Node, 
    target: Node, 
    allNodes: Node[]
  ): { sourceHandle: string, targetHandle: string } {
    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    
    // Check for obstacles between nodes
    const obstacles = this.findObstaclesBetween(source, target, allNodes);
    
    let sourceHandle = 'right';
    let targetHandle = 'left';
    
    if (obstacles.length > 0) {
      // Smart handle selection to avoid obstacles
      const obstacleBelow = obstacles.some(o => o.position.y > source.position.y);
      const obstacleAbove = obstacles.some(o => o.position.y < source.position.y);
      const obstacleRight = obstacles.some(o => o.position.x > source.position.x);
      const obstacleLeft = obstacles.some(o => o.position.x < source.position.x);
      
      if (dx > 0 && !obstacleRight) {
        sourceHandle = 'right';
        targetHandle = 'left';
      } else if (dx < 0 && !obstacleLeft) {
        sourceHandle = 'left';
        targetHandle = 'right';
      } else if (dy > 0 && !obstacleBelow) {
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else if (dy < 0 && !obstacleAbove) {
        sourceHandle = 'top';
        targetHandle = 'bottom';
      }
    } else {
      // Direct path - use natural direction
      if (Math.abs(dx) > Math.abs(dy)) {
        sourceHandle = dx > 0 ? 'right' : 'left';
        targetHandle = dx > 0 ? 'left' : 'right';
      } else {
        sourceHandle = dy > 0 ? 'bottom' : 'top';
        targetHandle = dy > 0 ? 'top' : 'bottom';
      }
    }
    
    return { sourceHandle, targetHandle };
  }
  
  private findObstaclesBetween(source: Node, target: Node, allNodes: Node[]): Node[] {
    const obstacles: Node[] = [];
    
    const minX = Math.min(source.position.x, target.position.x);
    const maxX = Math.max(source.position.x, target.position.x);
    const minY = Math.min(source.position.y, target.position.y);
    const maxY = Math.max(source.position.y, target.position.y);
    
    allNodes.forEach(node => {
      if (node.id === source.id || node.id === target.id) return;
      if (node.type === 'frame') return;
      
      const bounds = this.nodeBounds.get(node.id)!;
      
      // Check if node is in the bounding box between source and target
      if (node.position.x >= minX - bounds.width &&
          node.position.x <= maxX + bounds.width &&
          node.position.y >= minY - bounds.height &&
          node.position.y <= maxY + bounds.height) {
        obstacles.push(node);
      }
    });
    
    return obstacles;
  }
  
  private predictEdgePath(
    source: Node, 
    target: Node, 
    handles: { sourceHandle: string, targetHandle: string }
  ): { start: { x: number, y: number }, end: { x: number, y: number } } {
    const sourceBounds = this.nodeBounds.get(source.id)!;
    const targetBounds = this.nodeBounds.get(target.id)!;
    
    const start = this.getHandlePoint({
      ...sourceBounds,
      x: source.position.x,
      y: source.position.y,
      centerX: source.position.x + sourceBounds.width / 2,
      centerY: source.position.y + sourceBounds.height / 2
    }, handles.sourceHandle);
    
    const end = this.getHandlePoint({
      ...targetBounds,
      x: target.position.x,
      y: target.position.y,
      centerX: target.position.x + targetBounds.width / 2,
      centerY: target.position.y + targetBounds.height / 2
    }, handles.targetHandle);
    
    return { start, end };
  }
  
  private wouldPathCollide(
    path: { start: { x: number, y: number }, end: { x: number, y: number } },
    rect: { x: number, y: number, width: number, height: number }
  ): boolean {
    // Add buffer for safety
    const bufferedRect = {
      x: rect.x - 20,
      y: rect.y - 20,
      width: rect.width + 40,
      height: rect.height + 40
    };
    
    return this.lineIntersectsRect(path.start, path.end, bufferedRect);
  }
  
  private calculateCollisionAvoidance(
    path: { start: { x: number, y: number }, end: { x: number, y: number } },
    rect: { x: number, y: number, width: number, height: number },
    node: Node
  ): { x: number, y: number } {
    // Calculate perpendicular push direction
    const dx = path.end.x - path.start.x;
    const dy = path.end.y - path.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length < 0.01) return { x: 0, y: 0 };
    
    // Perpendicular vector
    const perpX = -dy / length;
    const perpY = dx / length;
    
    // Determine which side to push to
    const nodeCenterX = rect.x + rect.width / 2;
    const nodeCenterY = rect.y + rect.height / 2;
    
    const pathCenterX = (path.start.x + path.end.x) / 2;
    const pathCenterY = (path.start.y + path.end.y) / 2;
    
    const toCenterX = nodeCenterX - pathCenterX;
    const toCenterY = nodeCenterY - pathCenterY;
    
    // Push in direction of node center from path
    const dot = toCenterX * perpX + toCenterY * perpY;
    const pushDirection = dot > 0 ? 1 : -1;
    
    return {
      x: perpX * pushDirection * 50,
      y: perpY * pushDirection * 50
    };
  }
  
  // ========================================================================
  // PHASE 1: Smart Initial Placement Implementation
  // ========================================================================
  
  private performGraphAnalysis(): {
    mainSpine: string[],
    branches: Map<string, string[]>,
    clusters: Map<string, Set<string>>,
    isolates: string[],
    criticalPaths: string[][],
    nodeDepths: Map<string, number>
  } {
    console.log('[Analysis] Performing comprehensive graph analysis');
    
    // Find main spine (longest path from start to end)
    const mainSpine = this.findMainSpine();
    
    // Find branches from main spine
    const branches = this.findBranches(mainSpine);
    
    // Find strongly connected clusters
    const clusters = this.findStrongClusters();
    
    // Find isolated nodes
    const isolates = this.nodes
      .filter(n => n.type !== 'frame' && 
        !this.edges.some(e => e.source === n.id || e.target === n.id))
      .map(n => n.id);
    
    // Find critical paths
    const criticalPaths = this.findCriticalPaths();
    
    // Calculate node depths
    const nodeDepths = this.calculateNodeDepths();
    
    return {
      mainSpine,
      branches,
      clusters,
      isolates,
      criticalPaths,
      nodeDepths
    };
  }
  
  private findMainSpine(): string[] {
    // Find the longest path from any start node to any end node
    let longestPath: string[] = [];
    
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || 
      (n.type !== 'frame' && this.edges.filter(e => e.target === n.id).length === 0)
    );
    
    const endNodes = this.nodes.filter(n => 
      n.type === 'end' || 
      (n.type !== 'frame' && this.edges.filter(e => e.source === n.id).length === 0)
    );
    
    startNodes.forEach(start => {
      endNodes.forEach(end => {
        const path = this.findPath(start.id, end.id);
        if (path.length > longestPath.length) {
          longestPath = path;
        }
      });
    });
    
    // If no path found, use DFS to find longest path
    if (longestPath.length === 0 && startNodes.length > 0) {
      longestPath = this.findLongestPathFrom(startNodes[0].id);
    }
    
    return longestPath;
  }
  
  private findPath(startId: string, endId: string): string[] {
    const visited = new Set<string>();
    const queue: { id: string, path: string[] }[] = [{ id: startId, path: [startId] }];
    
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      
      if (id === endId) {
        return path;
      }
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      const neighbors = this.edges
        .filter(e => e.source === id)
        .map(e => e.target);
      
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, path: [...path, neighbor] });
        }
      });
    }
    
    return [];
  }
  
  private findLongestPathFrom(startId: string): string[] {
    const visited = new Set<string>();
    let longestPath: string[] = [];
    
    const dfs = (nodeId: string, path: string[]) => {
      visited.add(nodeId);
      
      const neighbors = this.edges
        .filter(e => e.source === nodeId)
        .map(e => e.target);
      
      if (neighbors.length === 0) {
        if (path.length > longestPath.length) {
          longestPath = [...path];
        }
      } else {
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            dfs(neighbor, [...path, neighbor]);
          }
        });
      }
      
      visited.delete(nodeId);
    };
    
    dfs(startId, [startId]);
    return longestPath;
  }
  
  private findBranches(mainSpine: string[]): Map<string, string[]> {
    const branches = new Map<string, string[]>();
    
    mainSpine.forEach(nodeId => {
      const outgoing = this.edges
        .filter(e => e.source === nodeId && !mainSpine.includes(e.target))
        .map(e => e.target);
      
      if (outgoing.length > 0) {
        branches.set(nodeId, outgoing);
      }
    });
    
    return branches;
  }
  
  private findStrongClusters(): Map<string, Set<string>> {
    const clusters = new Map<string, Set<string>>();
    const visited = new Set<string>();
    let clusterId = 0;
    
    this.nodes.forEach(node => {
      if (visited.has(node.id) || node.type === 'frame') return;
      
      const cluster = new Set<string>();
      const stack = [node.id];
      
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        cluster.add(current);
        
        // Find strongly connected neighbors (bidirectional or multiple connections)
        const neighbors = this.edges
          .filter(e => e.source === current || e.target === current)
          .map(e => e.source === current ? e.target : e.source)
          .filter(n => !visited.has(n));
        
        // Only add if strongly connected
        neighbors.forEach(n => {
          const connectionStrength = this.edges.filter(e => 
            (e.source === current && e.target === n) ||
            (e.source === n && e.target === current)
          ).length;
          
          if (connectionStrength >= 1) {
            stack.push(n);
          }
        });
      }
      
      if (cluster.size > 1) {
        clusters.set(`cluster_${clusterId++}`, cluster);
      }
    });
    
    return clusters;
  }
  
  private findCriticalPaths(): string[][] {
    // Find all paths that are critical for the flow
    const paths: string[][] = [];
    
    // Add main spine as critical
    const mainSpine = this.findMainSpine();
    if (mainSpine.length > 0) {
      paths.push(mainSpine);
    }
    
    // Add paths from decision nodes
    const decisionNodes = this.nodes.filter(n => n.type === 'decision');
    decisionNodes.forEach(decision => {
      const outgoing = this.edges.filter(e => e.source === decision.id);
      outgoing.forEach(edge => {
        const path = this.findLongestPathFrom(edge.target);
        if (path.length > 2) {
          paths.push([decision.id, ...path]);
        }
      });
    });
    
    return paths;
  }

  private calculateNodeDepths(): Map<string, number> {
    const depths = new Map<string, number>();
    const visited = new Set<string>();
    
    // Find start nodes
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || 
      (n.type !== 'frame' && !this.edges.some(e => e.target === n.id))
    );
    
    // BFS to calculate depths
    const queue: { id: string, depth: number }[] = [];
    
    // Initialize start nodes with depth 0
    startNodes.forEach(node => {
      queue.push({ id: node.id, depth: 0 });
      depths.set(node.id, 0);
    });
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      // Find all outgoing edges
      const outgoing = this.edges.filter(e => e.source === id);
      
      outgoing.forEach(edge => {
        const currentDepth = depths.get(edge.target) || -1;
        const newDepth = depth + 1;
        
        // Update depth if this path gives a larger depth
        if (newDepth > currentDepth) {
          depths.set(edge.target, newDepth);
        }
        
        if (!visited.has(edge.target)) {
          queue.push({ id: edge.target, depth: newDepth });
        }
      });
    }
    
    // Set depth for unvisited nodes (isolated nodes)
    this.nodes.forEach(node => {
      if (!depths.has(node.id) && node.type !== 'frame') {
        depths.set(node.id, 0);
      }
    });
    
    return depths;
  }
  
  private buildNodeHierarchy(analysis: any): Map<number, string[]> {
    const hierarchy = new Map<number, string[]>();
    const depths = analysis.nodeDepths;
    
    // Group nodes by depth
    depths.forEach((depth, nodeId) => {
      if (!hierarchy.has(depth)) {
        hierarchy.set(depth, []);
      }
      hierarchy.get(depth)!.push(nodeId);
    });
    
    return hierarchy;
  }
  
  private calculateCompactPositions(
    hierarchy: Map<number, string[]>,
    analysis: any
  ): Node[] {
    console.log('[Positioning] Calculating compact positions');
    
    const positions = new Map<string, { x: number, y: number }>();
    const COMPACT_X = 120; // Tight horizontal spacing
    const COMPACT_Y = 100; // Tight vertical spacing
    
    // Position by hierarchy level
    hierarchy.forEach((nodesAtLevel, level) => {
      const y = level * COMPACT_Y;
      
      // Sort nodes at this level for better edge routing
      const sortedNodes = this.sortNodesAtLevel(nodesAtLevel, positions, analysis);
      
      // Calculate x positions with minimal spacing
      let currentX = -(sortedNodes.length - 1) * COMPACT_X / 2;
      
      sortedNodes.forEach(nodeId => {
        // Check if node has predetermined position (e.g., from parent)
        const suggestedX = this.getSuggestedXPosition(nodeId, positions, analysis);
        
        positions.set(nodeId, {
          x: suggestedX !== null ? suggestedX : currentX,
          y: y
        });
        
        currentX += COMPACT_X;
      });
    });
    
    // Apply positions to nodes
    return this.nodes.map(node => {
      const pos = positions.get(node.id);
      if (!pos) return node;
      
      return {
        ...node,
        position: { x: pos.x, y: pos.y }
      };
    });
  }
  
  private sortNodesAtLevel(
    nodes: string[],
    positions: Map<string, { x: number, y: number }>,
    analysis: any
  ): string[] {
    // Sort nodes to minimize edge crossings
    return nodes.sort((a, b) => {
      // Prioritize main spine nodes
      const aInSpine = analysis.mainSpine.includes(a);
      const bInSpine = analysis.mainSpine.includes(b);
      
      if (aInSpine && !bInSpine) return -1;
      if (bInSpine && !aInSpine) return 1;
      
      // Sort by incoming edge positions
      const aParents = this.edges.filter(e => e.target === a).map(e => e.source);
      const bParents = this.edges.filter(e => e.target === b).map(e => e.source);
      
      const aAvgX = this.getAverageParentX(aParents, positions);
      const bAvgX = this.getAverageParentX(bParents, positions);
      
      return aAvgX - bAvgX;
    });
  }
  
  private getAverageParentX(parents: string[], positions: Map<string, { x: number, y: number }>): number {
    if (parents.length === 0) return 0;
    
    const parentXs = parents
      .map(p => positions.get(p)?.x)
      .filter(x => x !== undefined) as number[];
    
    if (parentXs.length === 0) return 0;
    
    return parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length;
  }
  
  private getSuggestedXPosition(
    nodeId: string,
    positions: Map<string, { x: number, y: number }>,
    analysis: any
  ): number | null {
    // Get suggested position based on parents and children
    const parents = this.edges.filter(e => e.target === nodeId).map(e => e.source);
    const children = this.edges.filter(e => e.source === nodeId).map(e => e.target);
    
    const parentPositions = parents
      .map(p => positions.get(p))
      .filter(pos => pos !== undefined) as { x: number, y: number }[];
    
    if (parentPositions.length > 0) {
      // Position below parents
      const avgX = parentPositions.reduce((sum, pos) => sum + pos.x, 0) / parentPositions.length;
      return avgX;
    }
    
    return null;
  }
  
  private optimizeFrameInternalLayouts(nodes: Node[], analysis: any): Node[] {
    console.log('[Frames] Optimizing frame internal layouts');
    
    const frames = nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const frameContents = this.originalFrameContents.get(frame.id);
      if (!frameContents || frameContents.size === 0) return;
      
      // Find boundary nodes (with external connections)
      const boundaryNodes = new Set<string>();
      const internalNodes = new Set<string>();
      
      frameContents.forEach(nodeId => {
        const hasExternal = this.edges.some(e => {
          const otherNode = e.source === nodeId ? e.target : e.source;
          return !frameContents.has(otherNode);
        });
        
        if (hasExternal) {
          boundaryNodes.add(nodeId);
        } else {
          internalNodes.add(nodeId);
        }
      });
      
      // Position boundary nodes near frame edges
      this.positionBoundaryNodes(boundaryNodes, frame, nodes);
      
      // Position internal nodes compactly in center
      this.positionInternalNodes(internalNodes, frame, nodes, boundaryNodes);
    });
    
    return nodes;
  }
  
  private positionBoundaryNodes(
    boundaryNodes: Set<string>,
    frame: Node,
    nodes: Node[]
  ): void {
    const frameBounds = this.nodeBounds.get(frame.id)!;
    const padding = 40;
    
    boundaryNodes.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      
      // Find external connections to determine position
      const externalEdges = this.edges.filter(e => {
        if (e.source === nodeId) {
          return !this.originalFrameContents.get(frame.id)?.has(e.target);
        }
        if (e.target === nodeId) {
          return !this.originalFrameContents.get(frame.id)?.has(e.source);
        }
        return false;
      });
      
      if (externalEdges.length === 0) return;
      
      // Position near appropriate frame edge
      const externalNode = nodes.find(n => {
        const edge = externalEdges[0];
        return n.id === (edge.source === nodeId ? edge.target : edge.source);
      });
      
      if (!externalNode) return;
      
      // Determine which edge to place near
      const dx = externalNode.position.x - frame.position.x;
      const dy = externalNode.position.y - frame.position.y;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // Place on left or right edge
        if (dx > 0) {
          node.position.x = frame.position.x + frameBounds.width - padding - 50;
        } else {
          node.position.x = frame.position.x + padding;
        }
        node.position.y = frame.position.y + frameBounds.height / 2;
      } else {
        // Place on top or bottom edge
        if (dy > 0) {
          node.position.y = frame.position.y + frameBounds.height - padding - 30;
        } else {
          node.position.y = frame.position.y + padding;
        }
        node.position.x = frame.position.x + frameBounds.width / 2;
      }
    });
  }
  
  private positionInternalNodes(
    internalNodes: Set<string>,
    frame: Node,
    nodes: Node[],
    boundaryNodes: Set<string>
  ): void {
    if (internalNodes.size === 0) return;
    
    const frameBounds = this.nodeBounds.get(frame.id)!;
    const padding = 60;
    
    // Calculate available space
    const availableWidth = frameBounds.width - 2 * padding;
    const availableHeight = frameBounds.height - 2 * padding;
    
    // Layout internal nodes in a compact grid
    const cols = Math.ceil(Math.sqrt(internalNodes.size));
    const rows = Math.ceil(internalNodes.size / cols);
    
    const cellWidth = availableWidth / cols;
    const cellHeight = availableHeight / rows;
    
    let index = 0;
    internalNodes.forEach(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      node.position.x = frame.position.x + padding + col * cellWidth;
      node.position.y = frame.position.y + padding + row * cellHeight;
      
      index++;
    });
  }
  
  private applyNodeClustering(nodes: Node[]): Node[] {
    // Group related nodes closer together
    const clusters = this.detectNodeClusters();
    if (clusters.length <= 1) return nodes;
    
    const adjustedNodes = [...nodes];
    
    clusters.forEach((cluster, clusterIndex) => {
      // Calculate cluster center
      let centerX = 0, centerY = 0;
      cluster.forEach(nodeId => {
        const node = adjustedNodes.find(n => n.id === nodeId);
        if (node) {
          const bounds = this.nodeBounds.get(nodeId)!;
          centerX += node.position.x + bounds.width / 2;
          centerY += node.position.y + bounds.height / 2;
        }
      });
      centerX /= cluster.size;
      centerY /= cluster.size;
      
      // Pull cluster nodes slightly toward their center
      const pullFactor = 0.15;
      cluster.forEach(nodeId => {
        const node = adjustedNodes.find(n => n.id === nodeId);
        if (node && !node.data?.isPinned) {
          const bounds = this.nodeBounds.get(nodeId)!;
          const nodeCenterX = node.position.x + bounds.width / 2;
          const nodeCenterY = node.position.y + bounds.height / 2;
          
          node.position.x += (centerX - nodeCenterX) * pullFactor;
          node.position.y += (centerY - nodeCenterY) * pullFactor;
        }
      });
    });
    
    return adjustedNodes;
  }
  
  private detectNodeClusters(): Set<string>[] {
    // Detect clusters of highly connected nodes
    const visited = new Set<string>();
    const clusters: Set<string>[] = [];
    
    this.nodes.forEach(node => {
      if (visited.has(node.id) || node.type === 'frame') return;
      
      const cluster = new Set<string>();
      const queue = [node.id];
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        
        visited.add(currentId);
        cluster.add(currentId);
        
        // Find strongly connected neighbors
        const connections = this.edges.filter(e => 
          e.source === currentId || e.target === currentId
        );
        
        connections.forEach(edge => {
          const neighborId = edge.source === currentId ? edge.target : edge.source;
          if (!visited.has(neighborId)) {
            // Check connection strength
            const reverseConnection = this.edges.some(e => 
              (e.source === neighborId && e.target === currentId) ||
              (e.target === neighborId && e.source === currentId)
            );
            
            if (reverseConnection || connections.length > 2) {
              queue.push(neighborId);
            }
          }
        });
      }
      
      if (cluster.size > 1) {
        clusters.push(cluster);
      }
    });
    
    return clusters;
  }

  // ========================================================================
  // PHASE 2: Handle Assignment System (HAS) Implementation
  // ========================================================================

  private createHandleManager(nodes: Node[]): any {
    const nodeHandles = new Map();
    
    nodes.forEach(node => {
      if (node.type === 'frame') return;
      
      nodeHandles.set(node.id, {
        top: { incoming: new Set<string>(), outgoing: new Set<string>() },
        right: { incoming: new Set<string>(), outgoing: new Set<string>() },
        bottom: { incoming: new Set<string>(), outgoing: new Set<string>() },
        left: { incoming: new Set<string>(), outgoing: new Set<string>() }
      });
    });
    
    return { nodeHandles };
  }

  private prioritizeEdges(edges: Edge[], analysis: any): Edge[] {
    return [...edges].sort((a, b) => {
      // Priority 1: Edges on main spine
      const aInSpine = analysis.mainSpine.includes(a.source) && analysis.mainSpine.includes(a.target);
      const bInSpine = analysis.mainSpine.includes(b.source) && analysis.mainSpine.includes(b.target);
      
      if (aInSpine && !bInSpine) return -1;
      if (bInSpine && !aInSpine) return 1;
      
      // Priority 2: Start/End edges
      const aHasStart = this.nodes.find(n => n.id === a.source)?.type === 'start';
      const bHasStart = this.nodes.find(n => n.id === b.source)?.type === 'start';
      const aHasEnd = this.nodes.find(n => n.id === a.target)?.type === 'end';
      const bHasEnd = this.nodes.find(n => n.id === b.target)?.type === 'end';
      
      const aSpecial = aHasStart || aHasEnd;
      const bSpecial = bHasStart || bHasEnd;
      
      if (aSpecial && !bSpecial) return -1;
      if (bSpecial && !aSpecial) return 1;
      
      // Priority 3: Critical path edges
      const aInCritical = analysis.criticalPaths.some(path => {
        for (let i = 0; i < path.length - 1; i++) {
          if (path[i] === a.source && path[i + 1] === a.target) return true;
        }
        return false;
      });
      
      const bInCritical = analysis.criticalPaths.some(path => {
        for (let i = 0; i < path.length - 1; i++) {
          if (path[i] === b.source && path[i + 1] === b.target) return true;
        }
        return false;
      });
      
      if (aInCritical && !bInCritical) return -1;
      if (bInCritical && !aInCritical) return 1;
      
      return 0;
    });
  }

  private assignOptimalHandles(
    edges: Edge[],
    nodes: Node[],
    handleManager: any
  ): Edge[] {
    console.log('[Handles] Assigning optimal handles with STRICT in/out separation');
    
    return edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return edge;
      
      const sourceHandles = handleManager.nodeHandles.get(edge.source);
      const targetHandles = handleManager.nodeHandles.get(edge.target);
      
      if (!sourceHandles || !targetHandles) return edge;
      
      // Find best handle combination
      const bestHandles = this.findBestHandleCombination(
        sourceNode, targetNode, sourceHandles, targetHandles, nodes
      );
      
      // Mark handles as used
      sourceHandles[bestHandles.source].outgoing.add(edge.id);
      targetHandles[bestHandles.target].incoming.add(edge.id);
      
      // Check for violations
      if (sourceHandles[bestHandles.source].incoming.size > 0) {
        console.error(`[VIOLATION] Handle ${bestHandles.source} on ${edge.source} has both IN and OUT!`);
      }
      if (targetHandles[bestHandles.target].outgoing.size > 0) {
        console.error(`[VIOLATION] Handle ${bestHandles.target} on ${edge.target} has both IN and OUT!`);
      }
      
      return {
        ...edge,
        sourceHandle: bestHandles.source,
        targetHandle: bestHandles.target,
        data: {
          ...edge.data,
          sourceHandle: bestHandles.source,
          targetHandle: bestHandles.target
        }
      };
    });
  }

  private findBestHandleCombination(
    sourceNode: Node,
    targetNode: Node,
    sourceHandles: any,
    targetHandles: any,
    allNodes: Node[]
  ): { source: string, target: string } {
    const handles = ['top', 'right', 'bottom', 'left'];
    let bestCombination = { source: 'right', target: 'left', score: Infinity };
    
    const sourceBounds = this.nodeBounds.get(sourceNode.id)!;
    const targetBounds = this.nodeBounds.get(targetNode.id)!;
    
    handles.forEach(sourceHandle => {
      // Skip if handle already used for incoming (can't use for outgoing)
      if (sourceHandles[sourceHandle].incoming.size > 0) return;
      
      handles.forEach(targetHandle => {
        // Skip if handle already used for outgoing (can't use for incoming)
        if (targetHandles[targetHandle].outgoing.size > 0) return;
        
        const score = this.scoreHandleCombination(
          sourceNode, targetNode, sourceHandle, targetHandle,
          sourceBounds, targetBounds, allNodes
        );
        
        if (score < bestCombination.score) {
          bestCombination = { source: sourceHandle, target: targetHandle, score };
        }
      });
    });
    
    return { source: bestCombination.source, target: bestCombination.target };
  }

  private scoreHandleCombination(
    sourceNode: Node, targetNode: Node,
    sourceHandle: string, targetHandle: string,
    sourceBounds: NodeBounds, targetBounds: NodeBounds,
    allNodes: Node[]
  ): number {
    const sourcePoint = this.getHandlePoint({
      ...sourceBounds,
      x: sourceNode.position.x,
      y: sourceNode.position.y,
      centerX: sourceNode.position.x + sourceBounds.width / 2,
      centerY: sourceNode.position.y + sourceBounds.height / 2
    }, sourceHandle);
    
    const targetPoint = this.getHandlePoint({
      ...targetBounds,
      x: targetNode.position.x,
      y: targetNode.position.y,
      centerX: targetNode.position.x + targetBounds.width / 2,
      centerY: targetNode.position.y + targetBounds.height / 2
    }, targetHandle);
    
    // 1. Edge length (most important for compactness)
    const length = Math.sqrt(
      Math.pow(targetPoint.x - sourcePoint.x, 2) +
      Math.pow(targetPoint.y - sourcePoint.y, 2)
    );
    
    let score = length;
    
    // 2. Natural flow bonus
    const dx = targetNode.position.x - sourceNode.position.x;
    const dy = targetNode.position.y - sourceNode.position.y;
    
    if (dx > 0 && sourceHandle === 'right' && targetHandle === 'left') {
      score -= 200; // Strong bonus for natural left-to-right
    } else if (dy > 0 && sourceHandle === 'bottom' && targetHandle === 'top') {
      score -= 150; // Bonus for natural top-to-bottom
    }
    
    // 3. Penalty for backwards flow
    if ((sourceHandle === 'left' && dx > 0) || (targetHandle === 'right' && dx < 0)) {
      score += 300;
    }
    
    // 4. Obstacle penalty
    const obstacles = this.countObstaclesBetween(sourcePoint, targetPoint, allNodes, [sourceNode.id, targetNode.id]);
    score += obstacles * 500; // Heavy penalty for obstacles
    
    return score;
  }
  
  // ========================================================================
  // PHASE 3: Collision Detection & Resolution (CDR) Implementation
  // ========================================================================

  private detectAllCollisionTypes(nodes: Node[], edges: Edge[]): any[] {
    const collisions: any[] = [];
    
    // Type 1: Edge-Node collisions (CRITICAL)
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      const edgePath = this.getEdgePath(sourceNode, targetNode, edge);
      
      nodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.type === 'frame') return;
        
        const nodeBounds = this.nodeBounds.get(node.id)!;
        const nodeRect = {
          x: node.position.x - 5,
          y: node.position.y - 5,
          width: nodeBounds.width + 10,
          height: nodeBounds.height + 10
        };
        
        if (this.lineIntersectsRect(edgePath.start, edgePath.end, nodeRect)) {
          collisions.push({
            type: 'edge-node',
            priority: 1,
            edgeId: edge.id,
            nodeId: node.id,
            severity: 1.0
          });
        }
      });
    });
    
    // Type 2: Node-Node overlaps (ERROR)
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'frame') continue;
      
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].type === 'frame') continue;
        
        const bounds1 = this.nodeBounds.get(nodes[i].id)!;
        const bounds2 = this.nodeBounds.get(nodes[j].id)!;
        
        const rect1 = {
          x: nodes[i].position.x,
          y: nodes[i].position.y,
          width: bounds1.width,
          height: bounds1.height
        };
        
        const rect2 = {
          x: nodes[j].position.x,
          y: nodes[j].position.y,
          width: bounds2.width,
          height: bounds2.height
        };
        
        if (this.rectsOverlap(rect1, rect2)) {
          collisions.push({
            type: 'node-node',
            priority: 0,
            node1Id: nodes[i].id,
            node2Id: nodes[j].id,
            severity: 1.0
          });
        }
      }
    }
    
    return collisions.sort((a, b) => a.priority - b.priority);
  }

  private rectsOverlap(rect1: any, rect2: any): boolean {
    return !(rect1.x + rect1.width < rect2.x ||
             rect2.x + rect2.width < rect1.x ||
             rect1.y + rect1.height < rect2.y ||
             rect2.y + rect2.height < rect1.y);
  }

  private resolveCollisionsSmartly(
    collisions: any[],
    nodes: Node[],
    edges: Edge[],
    handleManager: any
  ): { nodes: Node[], edges: Edge[] } {
    let adjustedNodes = [...nodes];
    let adjustedEdges = [...edges];
    
    collisions.forEach(collision => {
      if (collision.type === 'edge-node') {
        // Try to move the node away from the edge
        const node = adjustedNodes.find(n => n.id === collision.nodeId);
        const edge = adjustedEdges.find(e => e.id === collision.edgeId);
        
        if (!node || !edge) return;
        
        const adjustment = this.calculateNodeAdjustment(node, edge, adjustedNodes);
        
        // Apply adjustment with constraints
        const constrained = this.constrainNodeMovement(node, adjustment.x, adjustment.y, adjustedNodes);
        node.position.x = constrained.x;
        node.position.y = constrained.y;
        
      } else if (collision.type === 'node-node') {
        // Separate overlapping nodes
        const node1 = adjustedNodes.find(n => n.id === collision.node1Id);
        const node2 = adjustedNodes.find(n => n.id === collision.node2Id);
        
        if (!node1 || !node2) return;
        
        const separation = this.calculateNodeSeparation(node1, node2);
        
        // Move both nodes apart
        node1.position.x -= separation.x / 2;
        node1.position.y -= separation.y / 2;
        node2.position.x += separation.x / 2;
        node2.position.y += separation.y / 2;
      }
    });
    
    return { nodes: adjustedNodes, edges: adjustedEdges };
  }

  private calculateNodeAdjustment(node: Node, edge: Edge, nodes: Node[]): { x: number, y: number } {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return { x: 0, y: 0 };
    
    const edgePath = this.getEdgePath(sourceNode, targetNode, edge);
    const nodeBounds = this.nodeBounds.get(node.id)!;
    
    // Calculate perpendicular push direction
    const dx = edgePath.end.x - edgePath.start.x;
    const dy = edgePath.end.y - edgePath.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length < 0.01) return { x: 30, y: 0 };
    
    // Perpendicular vector
    const perpX = -dy / length;
    const perpY = dx / length;
    
    // Determine push direction
    const nodeCenter = {
      x: node.position.x + nodeBounds.width / 2,
      y: node.position.y + nodeBounds.height / 2
    };
    
    const edgeCenter = {
      x: (edgePath.start.x + edgePath.end.x) / 2,
      y: (edgePath.start.y + edgePath.end.y) / 2
    };
    
    const toNode = {
      x: nodeCenter.x - edgeCenter.x,
      y: nodeCenter.y - edgeCenter.y
    };
    
    const dot = toNode.x * perpX + toNode.y * perpY;
    const direction = dot > 0 ? 1 : -1;
    
    return {
      x: perpX * direction * 40,
      y: perpY * direction * 40
    };
  }

  private calculateNodeSeparation(node1: Node, node2: Node): { x: number, y: number } {
    const bounds1 = this.nodeBounds.get(node1.id)!;
    const bounds2 = this.nodeBounds.get(node2.id)!;
    
    const center1 = {
      x: node1.position.x + bounds1.width / 2,
      y: node1.position.y + bounds1.height / 2
    };
    
    const center2 = {
      x: node2.position.x + bounds2.width / 2,
      y: node2.position.y + bounds2.height / 2
    };
    
    const dx = center2.x - center1.x;
    const dy = center2.y - center1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 0.01) {
      // Nodes are at same position, push horizontally
      return { x: 50, y: 0 };
    }
    
    // Calculate required separation
    const minDistance = (bounds1.width + bounds2.width) / 2 + 20;
    const pushDistance = minDistance - distance;
    
    return {
      x: (dx / distance) * pushDistance,
      y: (dy / distance) * pushDistance
    };
  }

  // ========================================================================
  // PHASE 4: Quality Metrics & Refinement (QMR) Implementation
  // ========================================================================

  private calculateLayoutQuality(nodes: Node[], edges: Edge[]): any {
    const metrics = {
      edgeLengthTotal: 0,
      edgeCrossings: 0,
      nodeOverlaps: 0,
      compactness: 0,
      readability: 0,
      totalScore: 0
    };
    
    // 1. Calculate total edge length
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        const length = Math.sqrt(
          Math.pow(target.position.x - source.position.x, 2) +
          Math.pow(target.position.y - source.position.y, 2)
        );
        metrics.edgeLengthTotal += length;
      }
    });
    
    // 2. Count edge crossings
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        if (this.edgesCross(edges[i], edges[j], nodes)) {
          metrics.edgeCrossings++;
        }
      }
    }
    
    // 3. Count node overlaps
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'frame') continue;
      
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].type === 'frame') continue;
        
        if (this.nodesOverlap(nodes[i], nodes[j])) {
          metrics.nodeOverlaps++;
        }
      }
    }
    
    // 4. Calculate compactness (bounding box area)
    const bounds = this.calculateBoundingBox(nodes);
    metrics.compactness = bounds.width * bounds.height;
    
    // 5. Calculate readability score
    metrics.readability = this.calculateReadability(nodes, edges);
    
    // Calculate total score (0-1, higher is better)
    const edgeScore = Math.max(0, 1 - metrics.edgeLengthTotal / 10000);
    const crossingScore = Math.max(0, 1 - metrics.edgeCrossings / 20);
    const overlapScore = metrics.nodeOverlaps === 0 ? 1 : 0;
    const compactnessScore = Math.max(0, 1 - metrics.compactness / 1000000);
    
    metrics.totalScore = (edgeScore + crossingScore + overlapScore + compactnessScore + metrics.readability) / 5;
    
    return metrics;
  }

  private edgesCross(edge1: Edge, edge2: Edge, nodes: Node[]): boolean {
    // Check if two edges cross
    const e1Source = nodes.find(n => n.id === edge1.source);
    const e1Target = nodes.find(n => n.id === edge1.target);
    const e2Source = nodes.find(n => n.id === edge2.source);
    const e2Target = nodes.find(n => n.id === edge2.target);
    
    if (!e1Source || !e1Target || !e2Source || !e2Target) return false;
    
    // Skip if edges share a node
    if (edge1.source === edge2.source || edge1.source === edge2.target ||
        edge1.target === edge2.source || edge1.target === edge2.target) {
      return false;
    }
    
    const p1 = this.getEdgePath(e1Source, e1Target, edge1);
    const p2 = this.getEdgePath(e2Source, e2Target, edge2);
    
    return this.linesIntersect(p1.start, p1.end, p2.start, p2.end);
  }

  private nodesOverlap(node1: Node, node2: Node): boolean {
    const bounds1 = this.nodeBounds.get(node1.id)!;
    const bounds2 = this.nodeBounds.get(node2.id)!;
    
    return this.rectsOverlap(
      { x: node1.position.x, y: node1.position.y, width: bounds1.width, height: bounds1.height },
      { x: node2.position.x, y: node2.position.y, width: bounds2.width, height: bounds2.height }
    );
  }

  private calculateBoundingBox(nodes: Node[]): { width: number, height: number } {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      if (node.type === 'frame') return;
      
      const bounds = this.nodeBounds.get(node.id)!;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + bounds.width);
      maxY = Math.max(maxY, node.position.y + bounds.height);
    });
    
    return {
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private calculateReadability(nodes: Node[], edges: Edge[]): number {
    // Score based on how easy the flow is to read
    let score = 1.0;
    
    // Penalize backwards edges
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        if (target.position.x < source.position.x) {
          score -= 0.05; // Backwards flow penalty
        }
      }
    });
    
    return Math.max(0, score);
  }

  private refineLayout(
    nodes: Node[],
    edges: Edge[],
    quality: any
  ): { nodes: Node[], edges: Edge[] } {
    console.log('[Refinement] Improving layout quality');
    
    let improvedNodes = [...nodes];
    
    // If too spread out, compress
    if (quality.compactness > 500000) {
      improvedNodes = this.compressLayout(improvedNodes);
    }
    
    // If too many crossings, try to untangle
    if (quality.edgeCrossings > 5) {
      improvedNodes = this.reduceCrossings(improvedNodes, edges);
    }
    
    return { nodes: improvedNodes, edges };
  }

  private compressLayout(nodes: Node[]): Node[] {
    // Reduce spacing between nodes
    const center = this.findLayoutCenter(nodes);
    
    return nodes.map(node => {
      if (node.type === 'frame' || node.data?.isPinned) return node;
      
      const dx = node.position.x - center.x;
      const dy = node.position.y - center.y;
      
      return {
        ...node,
        position: {
          x: center.x + dx * 0.8, // Compress by 20%
          y: center.y + dy * 0.8
        }
      };
    });
  }

  private findLayoutCenter(nodes: Node[]): { x: number, y: number } {
    let sumX = 0, sumY = 0;
    let count = 0;
    
    nodes.forEach(node => {
      if (node.type !== 'frame') {
        sumX += node.position.x;
        sumY += node.position.y;
        count++;
      }
    });
    
    return {
      x: count > 0 ? sumX / count : 0,
      y: count > 0 ? sumY / count : 0
    };
  }

  private reduceCrossings(nodes: Node[], edges: Edge[]): Node[] {
    // Try to reduce edge crossings by adjusting node positions
    const adjustedNodes = [...nodes];
    
    // Find crossing edges
    const crossings: { edge1: Edge, edge2: Edge }[] = [];
    
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        if (this.edgesCross(edges[i], edges[j], adjustedNodes)) {
          crossings.push({ edge1: edges[i], edge2: edges[j] });
        }
      }
    }
    
    // Try to resolve crossings
    crossings.forEach(({ edge1, edge2 }) => {
      // Find involved nodes
      const nodes1 = [
        adjustedNodes.find(n => n.id === edge1.source),
        adjustedNodes.find(n => n.id === edge1.target)
      ];
      const nodes2 = [
        adjustedNodes.find(n => n.id === edge2.source),
        adjustedNodes.find(n => n.id === edge2.target)
      ];
      
      // Try swapping nodes vertically to uncross
      if (nodes1[0] && nodes1[1] && nodes2[0] && nodes2[1]) {
        const avgY1 = (nodes1[0].position.y + nodes1[1].position.y) / 2;
        const avgY2 = (nodes2[0].position.y + nodes2[1].position.y) / 2;
        
        if (Math.abs(avgY1 - avgY2) < 50) {
          // Nodes are at similar Y level, try to separate them
          if (avgY1 < avgY2) {
            nodes1.forEach(n => { if (n && !n.data?.isPinned) n.position.y -= 30; });
            nodes2.forEach(n => { if (n && !n.data?.isPinned) n.position.y += 30; });
          } else {
            nodes1.forEach(n => { if (n && !n.data?.isPinned) n.position.y += 30; });
            nodes2.forEach(n => { if (n && !n.data?.isPinned) n.position.y -= 30; });
          }
        }
      }
    });
    
    return adjustedNodes;
  }

  private minimizeEdgeCrossings(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
    // Try to reduce edge crossings by slightly adjusting node positions
    const adjustedNodes = [...nodes];
    const maxIterations = 3;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      let totalCrossings = this.countTotalCrossings(edges);
      if (totalCrossings === 0) break;
      
      // Try to move nodes to reduce crossings
      adjustedNodes.forEach(node => {
        if (node.data?.isPinned || node.type === 'frame') return;
        
        const connectedEdges = edges.filter(e => 
          e.source === node.id || e.target === node.id
        );
        
        if (connectedEdges.length === 0) return;
        
        // Try small adjustments in different directions
        const testOffsets = [
          { x: 0, y: -20 }, { x: 0, y: 20 },
          { x: -20, y: 0 }, { x: 20, y: 0 }
        ];
        
        let bestOffset = { x: 0, y: 0 };
        let minCrossings = this.countEdgeCrossingsForNode(node.id, edges);
        
        testOffsets.forEach(offset => {
          // Temporarily move node
          node.position.x += offset.x;
          node.position.y += offset.y;
          
          const crossings = this.countEdgeCrossingsForNode(node.id, edges);
          
          if (crossings < minCrossings) {
            minCrossings = crossings;
            bestOffset = offset;
          }
          
          // Restore position
          node.position.x -= offset.x;
          node.position.y -= offset.y;
        });
        
        // Apply best offset
        node.position.x += bestOffset.x;
        node.position.y += bestOffset.y;
      });
    }
    
    return { nodes: adjustedNodes, edges };
  }
  
  private countTotalCrossings(edges: Edge[]): number {
    let total = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];
        
        // Skip if edges share a node
        if (e1.source === e2.source || e1.source === e2.target ||
            e1.target === e2.source || e1.target === e2.target) continue;
        
        const s1 = this.nodeBounds.get(e1.source);
        const t1 = this.nodeBounds.get(e1.target);
        const s2 = this.nodeBounds.get(e2.source);
        const t2 = this.nodeBounds.get(e2.target);
        
        if (!s1 || !t1 || !s2 || !t2) continue;
        
        if (this.linesIntersect(
          { x: s1.centerX, y: s1.centerY },
          { x: t1.centerX, y: t1.centerY },
          { x: s2.centerX, y: s2.centerY },
          { x: t2.centerX, y: t2.centerY }
        )) {
          total++;
        }
      }
    }
    return total;
  }
  
  private countEdgeCrossingsForNode(nodeId: string, edges: Edge[]): number {
    const nodeEdges = edges.filter(e => e.source === nodeId || e.target === nodeId);
    const otherEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    
    let crossings = 0;
    nodeEdges.forEach(e1 => {
      otherEdges.forEach(e2 => {
        const s1 = this.nodeBounds.get(e1.source);
        const t1 = this.nodeBounds.get(e1.target);
        const s2 = this.nodeBounds.get(e2.source);
        const t2 = this.nodeBounds.get(e2.target);
        
        if (!s1 || !t1 || !s2 || !t2) return;
        
        if (this.linesIntersect(
          { x: s1.centerX, y: s1.centerY },
          { x: t1.centerX, y: t1.centerY },
          { x: s2.centerX, y: s2.centerY },
          { x: t2.centerX, y: t2.centerY }
        )) {
          crossings++;
        }
      });
    });
    
    return crossings;
  }
  
  private polishEdgePaths(nodes: Node[], edges: Edge[]): Edge[] {
    // Final pass to clean up edge paths
    return edges.map(edge => {
      // Ensure edges have proper handle assignments
      if (!edge.sourceHandle || !edge.targetHandle) {
        const sourceBounds = this.nodeBounds.get(edge.source);
        const targetBounds = this.nodeBounds.get(edge.target);
        
        if (sourceBounds && targetBounds) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          
          if (sourceNode && targetNode) {
            const updatedSourceBounds = {
              ...sourceBounds,
              x: sourceNode.position.x,
              y: sourceNode.position.y,
              centerX: sourceNode.position.x + sourceBounds.width / 2,
              centerY: sourceNode.position.y + sourceBounds.height / 2,
            };
            
            const updatedTargetBounds = {
              ...targetBounds,
              x: targetNode.position.x,
              y: targetNode.position.y,
              centerX: targetNode.position.x + targetBounds.width / 2,
              centerY: targetNode.position.y + targetBounds.height / 2,
            };
            
            const bestPath = this.findOptimalHandlesByGeometry(updatedSourceBounds, updatedTargetBounds, edge);
            
            return {
              ...edge,
              sourceHandle: bestPath.sourceHandle,
              targetHandle: bestPath.targetHandle,
              data: {
                ...edge.data,
                sourceHandle: bestPath.sourceHandle,
                targetHandle: bestPath.targetHandle,
              },
            };
          }
        }
      }
      
      return edge;
    });
  }
  
  private optimizeAllEdgeHandles(nodes: Node[]): Edge[] {
    // PASS 2: With fixed node positions, find shortest paths
    const bounds = new Map<string, NodeBounds>();
    
    nodes.forEach(node => {
      const nodeBounds = this.nodeBounds.get(node.id)!;
      bounds.set(node.id, {
        ...nodeBounds,
        x: node.position.x,
        y: node.position.y,
        centerX: node.position.x + nodeBounds.width / 2,
        centerY: node.position.y + nodeBounds.height / 2,
      });
    });
    
    // First: Optimize each edge independently for shortest path
    let edges = this.edges.map(edge => {
      const sourceBounds = bounds.get(edge.source);
      const targetBounds = bounds.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return edge;
      
      let bestHandles = { source: 'right', target: 'left', length: Infinity };
      
      ['top', 'right', 'bottom', 'left'].forEach(sourceHandle => {
        ['top', 'right', 'bottom', 'left'].forEach(targetHandle => {
          const sp = this.getHandlePoint(sourceBounds, sourceHandle);
          const tp = this.getHandlePoint(targetBounds, targetHandle);
          const length = Math.sqrt(Math.pow(tp.x - sp.x, 2) + Math.pow(tp.y - sp.y, 2));
          
          if (length < bestHandles.length) {
            bestHandles = { source: sourceHandle, target: targetHandle, length };
          }
        });
      });
      
      return {
        ...edge,
        sourceHandle: bestHandles.source,
        targetHandle: bestHandles.target,
        data: { ...edge.data, sourceHandle: bestHandles.source, targetHandle: bestHandles.target }
      };
    });
    
    // Second: Optimize flow-through nodes (A→B→C pattern)
    const nodeFlows = new Map<string, { in: Edge[], out: Edge[] }>();
    nodes.forEach(node => {
      nodeFlows.set(node.id, {
        in: edges.filter(e => e.target === node.id),
        out: edges.filter(e => e.source === node.id)
      });
    });
    
    nodeFlows.forEach((flow, nodeId) => {
      if (flow.in.length === 1 && flow.out.length === 1) {
        const inEdge = flow.in[0];
        const outEdge = flow.out[0];
        const nodeBounds = bounds.get(nodeId)!;
        
        // Find best flow-through configuration
        let bestConfig = { inHandle: 'left', outHandle: 'right', totalLength: Infinity };
        
        ['top', 'right', 'bottom', 'left'].forEach(inHandle => {
          ['top', 'right', 'bottom', 'left'].forEach(outHandle => {
            if (inHandle === outHandle) return; // Skip U-turns
            
            const sourceBounds = bounds.get(inEdge.source)!;
            const targetBounds = bounds.get(outEdge.target)!;
            
            const sp = this.getHandlePoint(sourceBounds, this.getOppositeHandle(inHandle));
            const ip = this.getHandlePoint(nodeBounds, inHandle);
            const op = this.getHandlePoint(nodeBounds, outHandle);
            const tp = this.getHandlePoint(targetBounds, this.getOppositeHandle(outHandle));
            
            const inLength = Math.sqrt(Math.pow(ip.x - sp.x, 2) + Math.pow(ip.y - sp.y, 2));
            const outLength = Math.sqrt(Math.pow(tp.x - op.x, 2) + Math.pow(tp.y - op.y, 2));
            const totalLength = inLength + outLength;
            
            if (totalLength < bestConfig.totalLength) {
              bestConfig = { inHandle, outHandle, totalLength };
            }
          });
        });
        
        // Update edges
        const inIdx = edges.findIndex(e => e.id === inEdge.id);
        const outIdx = edges.findIndex(e => e.id === outEdge.id);
        
        if (inIdx >= 0) {
          edges[inIdx] = {
            ...edges[inIdx],
            targetHandle: bestConfig.inHandle,
            data: { ...edges[inIdx].data, targetHandle: bestConfig.inHandle }
          };
        }
        
        if (outIdx >= 0) {
          edges[outIdx] = {
            ...edges[outIdx],
            sourceHandle: bestConfig.outHandle,
            data: { ...edges[outIdx].data, sourceHandle: bestConfig.outHandle }
          };
        }
      }
    });
    
    return edges;
  }
  
  private fixAllCollisions(nodes: Node[], edges: Edge[]): { nodes: Node[], edges: Edge[] } {
    // PASS 3: Comprehensive collision resolution
    let adjustedNodes = [...nodes];
    const maxIterations = 10; // More iterations for thorough resolution
    
    console.log('[GeniusLayout] Starting collision detection...');
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const collisions = this.detectAllCollisions(adjustedNodes, edges);
      
      if (collisions.length === 0) {
        console.log(`[GeniusLayout] No collisions detected after ${iter} iterations`);
        break;
      }
      
      console.log(`[GeniusLayout] Iteration ${iter}: Found ${collisions.length} collisions`);
      
      // Group collisions by node to apply combined adjustments
      const nodeAdjustments = new Map<string, { x: number, y: number, count: number }>();
      
      collisions.forEach(collision => {
        const current = nodeAdjustments.get(collision.nodeId) || { x: 0, y: 0, count: 0 };
        current.x += collision.adjustment.x;
        current.y += collision.adjustment.y;
        current.count++;
        nodeAdjustments.set(collision.nodeId, current);
      });
      
      // Apply adjustments
      nodeAdjustments.forEach((adjustment, nodeId) => {
        const node = adjustedNodes.find(n => n.id === nodeId);
        if (!node || node.data?.isPinned || node.type === 'frame') return;
        
        // Average the adjustments if multiple collisions
        const moveX = adjustment.x / adjustment.count;
        const moveY = adjustment.y / adjustment.count;
        
        // Check frame constraints before moving
        const newPosition = this.constrainNodeMovement(node, moveX, moveY, adjustedNodes);
        node.position.x = newPosition.x;
        node.position.y = newPosition.y;
      });
      
      // Enforce minimum spacing and frame boundaries
      adjustedNodes = this.enforceMinimumSpacing(adjustedNodes);
      adjustedNodes = this.enforceFrameBoundaries(adjustedNodes);
    }
    
    // Final edge optimization
    const finalEdges = this.optimizeAllEdgeHandles(adjustedNodes);
    
    return { nodes: adjustedNodes, edges: finalEdges };
  }

  private fixEnhancedCollisions(nodes: Node[], edges: Edge[]): { nodes: Node[], edges: Edge[] } {
    // Enhanced collision resolution with strict accuracy
    let adjustedNodes = [...nodes];
    const maxIterations = 15; // More iterations for perfect resolution
    let previousCollisionCount = Infinity;
    
    console.log('[GeniusLayout] Starting enhanced collision detection...');
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const collisions = this.detectEnhancedCollisions(adjustedNodes, edges);
      
      if (collisions.length === 0) {
        console.log(`[GeniusLayout] Perfect! No collisions after ${iter} iterations`);
        break;
      }
      
      // Check if we're making progress
      if (collisions.length >= previousCollisionCount && iter > 5) {
        console.log(`[GeniusLayout] Collision count not decreasing, applying alternative resolution`);
        adjustedNodes = this.resolveStubornCollisions(adjustedNodes, edges, collisions);
        previousCollisionCount = collisions.length;
        continue;
      }
      
      previousCollisionCount = collisions.length;
      console.log(`[GeniusLayout] Iteration ${iter}: Found ${collisions.length} collisions (${collisions.filter(c => c.severity === 1).length} severe)`);
      
      // Calculate prioritized adjustments
      const nodeAdjustments = this.calculatePrioritizedAdjustments(collisions, adjustedNodes);
      
      // Apply adjustments with strict constraints
      adjustedNodes = adjustedNodes.map(node => {
        const adjustment = nodeAdjustments.get(node.id);
        if (!adjustment || node.data?.isPinned) return node;
        
        const constrained = this.constrainNodeMovementStrict(
          node,
          adjustment.x,
          adjustment.y,
          adjustedNodes
        );
        
        return {
          ...node,
          position: constrained
        };
      });
      
      // Enforce strict boundaries after each iteration
      adjustedNodes = this.enforceMinimumSpacing(adjustedNodes);
      adjustedNodes = this.enforceStrictFrameBoundaries(adjustedNodes);
    }
    
    // Final edge optimization with collision awareness
    const finalEdges = this.optimizeEdgesWithCollisionAvoidance(adjustedNodes, edges);
    
    return { nodes: adjustedNodes, edges: finalEdges };
  }

  private detectEnhancedCollisions(
    nodes: Node[],
    edges: Edge[]
  ): Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number }, severity: number }> {
    const collisions: Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number }, severity: number }> = [];
    const SAFETY_BUFFER = 60; // Even more generous buffer
    const PROXIMITY_THRESHOLD = 10; // Detect edges that are too close
    
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      const sourceBounds = this.nodeBounds.get(edge.source)!;
      const targetBounds = this.nodeBounds.get(edge.target)!;
      
      // Get edge endpoints
      const edgeStart = this.getHandlePoint({
        ...sourceBounds,
        x: sourceNode.position.x,
        y: sourceNode.position.y,
        centerX: sourceNode.position.x + sourceBounds.width / 2,
        centerY: sourceNode.position.y + sourceBounds.height / 2
      }, edge.sourceHandle || 'right');
      
      const edgeEnd = this.getHandlePoint({
        ...targetBounds,
        x: targetNode.position.x,
        y: targetNode.position.y,
        centerX: targetNode.position.x + targetBounds.width / 2,
        centerY: targetNode.position.y + targetBounds.height / 2
      }, edge.targetHandle || 'left');
      
      // Check collision with ALL nodes
      nodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.data?.isPinned) return;
        
        const bounds = this.nodeBounds.get(node.id)!;
        
        // Type-specific buffers for better detection
        let buffer = SAFETY_BUFFER;
        if (node.type === 'decision') buffer = SAFETY_BUFFER + 25;
        if (node.type === 'note') buffer = SAFETY_BUFFER - 10;
        if (node.type === 'frame') buffer = 35;
        
        const collisionRect = {
          x: node.position.x - buffer / 2,
          y: node.position.y - buffer / 2,
          width: bounds.width + buffer,
          height: bounds.height + buffer
        };
        
        // Enhanced collision detection
        const isIntersecting = this.lineIntersectsRect(edgeStart, edgeEnd, collisionRect);
        const distance = this.getLineToRectDistance(edgeStart, edgeEnd, collisionRect);
        const isAlongBoundary = this.checkEdgeAlongBoundary(edgeStart, edgeEnd, collisionRect);
        
        if (isIntersecting || isAlongBoundary || distance < PROXIMITY_THRESHOLD) {
          const adjustment = this.calculateSmartAdjustment(
            edgeStart,
            edgeEnd,
            node,
            bounds,
            nodes
          );
          
          // Determine severity
          const severity = isIntersecting || isAlongBoundary ? 1.0 : (1.0 - distance / PROXIMITY_THRESHOLD);
          
          collisions.push({
            nodeId: node.id,
            edgeId: edge.id,
            adjustment,
            severity
          });
        }
      });
    });
    
    return collisions;
  }
  
  private detectAllCollisions(
    nodes: Node[],
    edges: Edge[]
  ): Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number } }> {
    const collisions: Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number } }> = [];
    const SAFETY_BUFFER = 50; // Generous buffer to prevent edges touching nodes
    
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      const sourceBounds = this.nodeBounds.get(edge.source)!;
      const targetBounds = this.nodeBounds.get(edge.target)!;
      
      // Get edge endpoints
      const edgeStart = this.getHandlePoint({
        ...sourceBounds,
        x: sourceNode.position.x,
        y: sourceNode.position.y,
        centerX: sourceNode.position.x + sourceBounds.width / 2,
        centerY: sourceNode.position.y + sourceBounds.height / 2
      }, edge.sourceHandle || 'right');
      
      const edgeEnd = this.getHandlePoint({
        ...targetBounds,
        x: targetNode.position.x,
        y: targetNode.position.y,
        centerX: targetNode.position.x + targetBounds.width / 2,
        centerY: targetNode.position.y + targetBounds.height / 2
      }, edge.targetHandle || 'left');
      
      // Check collision with ALL nodes (including Notes)
      nodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.data?.isPinned) return;
        
        const bounds = this.nodeBounds.get(node.id)!;
        
        // Different buffers for different node types
        let buffer = SAFETY_BUFFER;
        if (node.type === 'decision') buffer = SAFETY_BUFFER + 20; // Diamond needs more
        if (node.type === 'note') buffer = SAFETY_BUFFER - 10; // Notes can be slightly closer
        if (node.type === 'frame') buffer = 30; // Frames need less buffer
        
        const collisionRect = {
          x: node.position.x - buffer / 2,
          y: node.position.y - buffer / 2,
          width: bounds.width + buffer,
          height: bounds.height + buffer
        };
        
        // Check both line intersection AND proximity
        if (this.checkEdgeNodeCollision(edgeStart, edgeEnd, collisionRect)) {
          const adjustment = this.calculateSmartAdjustment(
            edgeStart,
            edgeEnd,
            node,
            bounds,
            nodes
          );
          
          collisions.push({
            nodeId: node.id,
            edgeId: edge.id,
            adjustment
          });
        }
      });
    });
    
    return collisions;
  }
  
  private checkEdgeNodeCollision(
    edgeStart: { x: number, y: number },
    edgeEnd: { x: number, y: number },
    rect: { x: number, y: number, width: number, height: number }
  ): boolean {
    // Enhanced collision detection
    // 1. Check if edge intersects rectangle
    if (this.lineIntersectsRect(edgeStart, edgeEnd, rect)) {
      return true;
    }
    
    // 2. Check if edge is too close to rectangle (even if not intersecting)
    const minDistance = this.getLineToRectDistance(edgeStart, edgeEnd, rect);
    if (minDistance < 5) { // Edge is within 5 pixels of node
      return true;
    }
    
    return false;
  }
  
  private getLineToRectDistance(
    p1: { x: number, y: number },
    p2: { x: number, y: number },
    rect: { x: number, y: number, width: number, height: number }
  ): number {
    // Calculate minimum distance from line segment to rectangle
    const rectCenter = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    };
    
    // Find closest point on line to rect center
    const lineDx = p2.x - p1.x;
    const lineDy = p2.y - p1.y;
    const lineLength = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
    
    if (lineLength < 0.01) return Infinity;
    
    const t = Math.max(0, Math.min(1,
      ((rectCenter.x - p1.x) * lineDx + (rectCenter.y - p1.y) * lineDy) / (lineLength * lineLength)
    ));
    
    const closestPoint = {
      x: p1.x + t * lineDx,
      y: p1.y + t * lineDy
    };
    
    // Calculate distance from closest point to rectangle boundary
    const dx = Math.max(rect.x - closestPoint.x, 0, closestPoint.x - (rect.x + rect.width));
    const dy = Math.max(rect.y - closestPoint.y, 0, closestPoint.y - (rect.y + rect.height));
    
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  private calculateSmartAdjustment(
    edgeStart: { x: number, y: number },
    edgeEnd: { x: number, y: number },
    node: Node,
    bounds: NodeBounds,
    allNodes: Node[]
  ): { x: number, y: number } {
    const nodeCenter = {
      x: node.position.x + bounds.width / 2,
      y: node.position.y + bounds.height / 2
    };
    
    // Find closest point on edge to node center
    const edgeDx = edgeEnd.x - edgeStart.x;
    const edgeDy = edgeEnd.y - edgeStart.y;
    const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
    
    if (edgeLength < 0.01) return { x: 50, y: 0 };
    
    const t = Math.max(0, Math.min(1,
      ((nodeCenter.x - edgeStart.x) * edgeDx + (nodeCenter.y - edgeStart.y) * edgeDy) / (edgeLength * edgeLength)
    ));
    
    const closestPoint = {
      x: edgeStart.x + t * edgeDx,
      y: edgeStart.y + t * edgeDy
    };
    
    // Calculate push direction
    let pushX = nodeCenter.x - closestPoint.x;
    let pushY = nodeCenter.y - closestPoint.y;
    const pushDist = Math.sqrt(pushX * pushX + pushY * pushY);
    
    if (pushDist < 0.01) {
      // Node center is on the line, push perpendicular
      pushX = -edgeDy / edgeLength;
      pushY = edgeDx / edgeLength;
    } else {
      pushX /= pushDist;
      pushY /= pushDist;
    }
    
    // Calculate push magnitude based on overlap
    const overlap = 50 - pushDist;
    const pushMagnitude = Math.max(30, overlap + 20);
    
    return {
      x: pushX * pushMagnitude,
      y: pushY * pushMagnitude
    };
  }
  
  private constrainNodeMovement(
    node: Node,
    moveX: number,
    moveY: number,
    allNodes: Node[]
  ): { x: number, y: number } {
    const newX = node.position.x + moveX;
    const newY = node.position.y + moveY;
    const bounds = this.nodeBounds.get(node.id)!;
    
    // Check if node should stay within a frame
    let nodeFrameId: string | null = null;
    this.originalFrameContents.forEach((contents, frameId) => {
      if (contents.has(node.id)) {
        nodeFrameId = frameId;
      }
    });
    
    if (nodeFrameId) {
      // Node must stay within its frame
      const frame = allNodes.find(n => n.id === nodeFrameId && n.type === 'frame');
      if (frame) {
        const frameBounds = this.nodeBounds.get(nodeFrameId)!;
        const padding = 30;
        
        const constrainedX = Math.max(
          frame.position.x + padding,
          Math.min(newX, frame.position.x + frameBounds.width - bounds.width - padding)
        );
        
        const constrainedY = Math.max(
          frame.position.y + padding,
          Math.min(newY, frame.position.y + frameBounds.height - bounds.height - padding)
        );
        
        return { x: constrainedX, y: constrainedY };
      }
    } else {
      // Node must NOT overlap with any frame
      const frames = allNodes.filter(n => n.type === 'frame');
      let finalX = newX;
      let finalY = newY;
      
      frames.forEach(frame => {
        const frameBounds = this.nodeBounds.get(frame.id)!;
        const buffer = 20; // Keep nodes outside frames with buffer
        
        const frameRect = {
          x: frame.position.x - buffer,
          y: frame.position.y - buffer,
          width: frameBounds.width + buffer * 2,
          height: frameBounds.height + buffer * 2
        };
        
        const nodeRect = {
          x: finalX,
          y: finalY,
          width: bounds.width,
          height: bounds.height
        };
        
        const overlap = this.getOverlapRect(nodeRect, frameRect);
        
        if (overlap.x > 0 && overlap.y > 0) {
          // Push node outside frame
          if (overlap.x < overlap.y) {
            // Push horizontally
            if (finalX < frame.position.x + frameBounds.width / 2) {
              finalX = frame.position.x - bounds.width - buffer;
            } else {
              finalX = frame.position.x + frameBounds.width + buffer;
            }
          } else {
            // Push vertically
            if (finalY < frame.position.y + frameBounds.height / 2) {
              finalY = frame.position.y - bounds.height - buffer;
            } else {
              finalY = frame.position.y + frameBounds.height + buffer;
            }
          }
        }
      });
      
      return { x: finalX, y: finalY };
    }
    
    return { x: newX, y: newY };
  }
  
  private enforceFrameBoundaries(nodes: Node[]): Node[] {
    // Strictly ensure nodes respect frame boundaries
    const adjustedNodes = [...nodes];
    const frames = adjustedNodes.filter(n => n.type === 'frame');
    
    adjustedNodes.forEach(node => {
      if (node.type === 'frame' || node.data?.isPinned) return;
      
      const nodeBounds = this.nodeBounds.get(node.id)!;
      let shouldBeInFrame: string | null = null;
      
      // Check if node should be in a frame based on ORIGINAL contents
      this.originalFrameContents.forEach((contents, frameId) => {
        if (contents.has(node.id)) {
          shouldBeInFrame = frameId;
        }
      });
      
      if (shouldBeInFrame) {
        // Node MUST be inside its frame
        const frame = frames.find(f => f.id === shouldBeInFrame);
        if (frame) {
          const frameBounds = this.nodeBounds.get(frame.id)!;
          const padding = 30;
          
          // Force node to be fully inside frame
          node.position.x = Math.max(
            frame.position.x + padding,
            Math.min(node.position.x, frame.position.x + frameBounds.width - nodeBounds.width - padding)
          );
          node.position.y = Math.max(
            frame.position.y + padding,
            Math.min(node.position.y, frame.position.y + frameBounds.height - nodeBounds.height - padding)
          );
        }
      } else {
        // Node MUST NOT overlap with ANY frame
        frames.forEach(frame => {
          const frameBounds = this.nodeBounds.get(frame.id)!;
          const buffer = 20; // Minimum distance from frame
          
          const frameRect = {
            x: frame.position.x - buffer,
            y: frame.position.y - buffer,
            width: frameBounds.width + 2 * buffer,
            height: frameBounds.height + 2 * buffer
          };
          
          const nodeRect = {
            x: node.position.x,
            y: node.position.y,
            width: nodeBounds.width,
            height: nodeBounds.height
          };
          
          // Check for overlap
          const overlapX = Math.max(0, Math.min(nodeRect.x + nodeRect.width, frameRect.x + frameRect.width) - Math.max(nodeRect.x, frameRect.x));
          const overlapY = Math.max(0, Math.min(nodeRect.y + nodeRect.height, frameRect.y + frameRect.height) - Math.max(nodeRect.y, frameRect.y));
          
          if (overlapX > 0 && overlapY > 0) {
            // Push node outside frame
            if (overlapX < overlapY) {
              // Push horizontally
              if (node.position.x < frame.position.x + frameBounds.width / 2) {
                node.position.x = frameRect.x - nodeRect.width - 5;
              } else {
                node.position.x = frameRect.x + frameRect.width + 5;
              }
            } else {
              // Push vertically
              if (node.position.y < frame.position.y + frameBounds.height / 2) {
                node.position.y = frameRect.y - nodeRect.height - 5;
              } else {
                node.position.y = frameRect.y + frameRect.height + 5;
              }
            }
          }
        });
      }
    });
    
    return adjustedNodes;
  }
  
  private alignToGrid(nodes: Node[]): Node[] {
    // Align nodes to a grid for cleaner appearance
    const gridSize = 10;
    
    return nodes.map(node => {
      if (node.data?.isPinned) return node;
      
      return {
        ...node,
        position: {
          x: Math.round(node.position.x / gridSize) * gridSize,
          y: Math.round(node.position.y / gridSize) * gridSize,
        },
      };
    });
  }

  private selectOptimalMode(): LayoutMode {
    const analysis = this.layoutAnalysis!;
    
    // Enhanced decision logic with more sophisticated analysis
    
    // Pure tree structure - perfect for hierarchies
    if (!analysis.hasCycles && analysis.branchingFactor > 1.5 && analysis.depth > 2) {
      return 'tree';
    }
    
    // Linear flow with minimal branching - sequential processes
    if (analysis.branchingFactor < 1.2 && !analysis.hasBackEdges && analysis.depth > analysis.width) {
      return analysis.flowDirection === 'horizontal' ? 'horizontal' : 'vertical';
    }
    
    // Dense network - needs force-directed for organic layout
    if (analysis.density > 0.4 || (analysis.hasBackEdges && analysis.hasCycles)) {
      return 'mixed';
    }
    
    // Compact layout for small graphs
    if (this.nodes.length < 10 && analysis.density < 0.2) {
      return 'compact';
    }
    
    // Wide graphs work better horizontally
    if (analysis.width > analysis.depth * 1.5) {
      return 'horizontal';
    }
    
    // Tall graphs work better vertically
    if (analysis.depth > analysis.width * 1.5) {
      return 'vertical';
    }
    
    // Default: analyze edge directions
    const verticalScore = this.edges.filter(e => {
      const s = this.nodeBounds.get(e.source);
      const t = this.nodeBounds.get(e.target);
      if (!s || !t) return false;
      return Math.abs(t.centerY - s.centerY) > Math.abs(t.centerX - s.centerX);
    }).length;
    
    const horizontalScore = this.edges.length - verticalScore;
    
    return horizontalScore > verticalScore ? 'horizontal' : 'vertical';
  }

  private applyLayout(mode: LayoutMode): Node[] {
    // Store note positions relative to nearby nodes for region preservation
    const noteRegions = this.preserveNoteRegions();
    
    let layoutedNodes: Node[];
    switch (mode) {
      case 'vertical':
        layoutedNodes = this.applyHierarchicalLayout('TB');
        break;
      case 'horizontal':
        layoutedNodes = this.applyHierarchicalLayout('LR');
        break;
      case 'tree':
        layoutedNodes = this.applyTreeLayout();
        break;
      case 'compact':
        layoutedNodes = this.applyCompactLayout();
        break;
      case 'mixed':
        layoutedNodes = this.applyMixedLayout();
        break;
      default:
        layoutedNodes = this.applyHierarchicalLayout('TB');
    }
    
    // Restore notes to their thematic regions
    return this.restoreNoteRegions(layoutedNodes, noteRegions);
  }
  
  private preserveNoteRegions(): Map<string, { nearestNode: string; relativePosition: { x: number; y: number } }> {
    const noteRegions = new Map<string, { nearestNode: string; relativePosition: { x: number; y: number } }>();
    
    const notes = this.nodes.filter(n => n.type === 'note');
    const regularNodes = this.nodes.filter(n => n.type !== 'note' && n.type !== 'frame');
    
    notes.forEach(note => {
      const noteBounds = this.nodeBounds.get(note.id)!;
      let nearestNode: Node | null = null;
      let minDistance = Infinity;
      
      // Find nearest non-note node
      regularNodes.forEach(node => {
        const nodeBounds = this.nodeBounds.get(node.id)!;
        const dx = nodeBounds.centerX - noteBounds.centerX;
        const dy = nodeBounds.centerY - noteBounds.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestNode = node;
        }
      });
      
      if (nearestNode) {
        const nearestNodeBounds = this.nodeBounds.get(nearestNode.id)!;
        noteRegions.set(note.id, {
          nearestNode: nearestNode.id,
          relativePosition: {
            x: noteBounds.centerX - nearestNodeBounds.centerX,
            y: noteBounds.centerY - nearestNodeBounds.centerY,
          },
        });
      }
    });
    
    return noteRegions;
  }
  
  private restoreNoteRegions(nodes: Node[], noteRegions: Map<string, { nearestNode: string; relativePosition: { x: number; y: number } }>): Node[] {
    return nodes.map(node => {
      if (node.type !== 'note') return node;
      
      const region = noteRegions.get(node.id);
      if (!region) return node;
      
      const nearestNode = nodes.find(n => n.id === region.nearestNode);
      if (!nearestNode) return node;
      
      const nearestBounds = this.nodeBounds.get(nearestNode.id)!;
      const noteBounds = this.nodeBounds.get(node.id)!;
      
      // Restore relative position with some adjustment to avoid overlaps
      return {
        ...node,
        position: {
          x: nearestNode.position.x + nearestBounds.width / 2 + region.relativePosition.x - noteBounds.width / 2,
          y: nearestNode.position.y + nearestBounds.height / 2 + region.relativePosition.y - noteBounds.height / 2,
        },
      };
    });
  }

  private applyHierarchicalLayout(direction: 'TB' | 'LR'): Node[] {
    // First, layout nodes within each frame separately
    const frameLayouts = new Map<string, { nodes: Node[], bounds: { minX: number, minY: number, maxX: number, maxY: number } }>();
    const nonFrameNodes: Node[] = [];
    
    // Separate nodes by frame membership
    this.nodes.filter(n => n.type !== 'frame').forEach(node => {
      let belongsToFrame: string | null = null;
      
      this.originalFrameContents.forEach((contents, frameId) => {
        if (contents.has(node.id)) {
          belongsToFrame = frameId;
        }
      });
      
      if (belongsToFrame) {
        if (!frameLayouts.has(belongsToFrame)) {
          frameLayouts.set(belongsToFrame, { nodes: [], bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } });
        }
        frameLayouts.get(belongsToFrame)!.nodes.push(node);
      } else {
        nonFrameNodes.push(node);
      }
    });
    
    // Layout each frame's content separately
    const allLayoutedNodes: Node[] = [];
    
    frameLayouts.forEach((frameData, frameId) => {
      const frame = this.nodes.find(n => n.id === frameId && n.type === 'frame');
      if (!frame) return;
      
      // Create a sub-graph for this frame's nodes
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      
      const isHorizontal = direction === 'LR';
      g.setGraph({
        rankdir: direction,
        nodesep: this.options.minNodeSpacing * 0.8, // Tighter spacing within frames
        ranksep: this.options.rankSpacing * 0.8,
        edgesep: 30,
        marginx: 40,
        marginy: 40,
        align: isHorizontal ? 'DL' : 'UL',
        ranker: 'longest-path',
      });
      
      // Add frame's nodes
      frameData.nodes.forEach(node => {
        const bounds = this.nodeBounds.get(node.id)!;
        g.setNode(node.id, {
          width: bounds.width,
          height: bounds.height,
        });
      });
      
      // Add edges between frame's nodes
      this.edges.forEach(edge => {
        if (frameData.nodes.some(n => n.id === edge.source) && frameData.nodes.some(n => n.id === edge.target)) {
          g.setEdge(edge.source, edge.target);
        }
      });
      
      // Layout the sub-graph
      dagre.layout(g);
      
      // Position nodes within frame bounds
      const frameBounds = this.nodeBounds.get(frameId)!;
      const framePadding = 40;
      
      frameData.nodes.forEach(node => {
        const nodeData = g.node(node.id);
        if (!nodeData) return;
        
        const bounds = this.nodeBounds.get(node.id)!;
        
        // Position relative to frame
        const layoutedNode = {
          ...node,
          position: {
            x: frame.position.x + framePadding + nodeData.x - bounds.width / 2,
            y: frame.position.y + framePadding + nodeData.y - bounds.height / 2,
          },
        };
        
        allLayoutedNodes.push(layoutedNode);
      });
    });
    
    // Layout non-frame nodes
    if (nonFrameNodes.length > 0) {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      
      const isHorizontal = direction === 'LR';
      g.setGraph({
        rankdir: direction,
        nodesep: this.options.minNodeSpacing,
        ranksep: this.options.rankSpacing,
        edgesep: this.options.edgeBuffer,
        marginx: 60,
        marginy: 60,
        align: isHorizontal ? 'DL' : 'UL',
        ranker: 'longest-path',
      });
      
      // Add non-frame nodes
      nonFrameNodes.forEach(node => {
        const bounds = this.nodeBounds.get(node.id)!;
        g.setNode(node.id, {
          width: bounds.width,
          height: bounds.height,
        });
      });
      
      // Add edges between non-frame nodes
      this.edges.forEach(edge => {
        if (nonFrameNodes.some(n => n.id === edge.source) && nonFrameNodes.some(n => n.id === edge.target)) {
          g.setEdge(edge.source, edge.target);
        }
      });
      
      // Layout
      dagre.layout(g);
      
      // Apply positions
      nonFrameNodes.forEach(node => {
        const nodeData = g.node(node.id);
        if (!nodeData) return;
        
        const bounds = this.nodeBounds.get(node.id)!;
        
        allLayoutedNodes.push({
          ...node,
          position: {
            x: nodeData.x - bounds.width / 2,
            y: nodeData.y - bounds.height / 2,
          },
        });
      });
    }
    
    // Return all nodes including frames
    const frames = this.nodes.filter(n => n.type === 'frame');
    return [...allLayoutedNodes, ...frames];
  }

  private applyTreeLayout(): Node[] {
    const levels = this.nodeDepths;
    const levelNodes = new Map<number, Node[]>();
    
    // Group nodes by level
    this.nodes.forEach(node => {
      if (node.type === 'frame') return;
      const level = levels.get(node.id) || 0;
      if (!levelNodes.has(level)) {
        levelNodes.set(level, []);
      }
      levelNodes.get(level)!.push(node);
    });
    
    // Calculate positions
    const layoutedNodes: Node[] = [];
    const spacing = this.calculateOptimalSpacing();
    let currentY = 0;
    
    Array.from(levelNodes.keys()).sort().forEach(level => {
      const nodesAtLevel = levelNodes.get(level)!;
      const totalWidth = nodesAtLevel.reduce((sum, node) => {
        const bounds = this.nodeBounds.get(node.id)!;
        return sum + bounds.width + spacing;
      }, -spacing);
      
      let currentX = -totalWidth / 2;
      
      nodesAtLevel.forEach(node => {
        if (node.data?.isPinned) {
          layoutedNodes.push(node);
          return;
        }
        
        const bounds = this.nodeBounds.get(node.id)!;
        layoutedNodes.push({
          ...node,
          position: {
            x: currentX,
            y: currentY,
          },
        });
        currentX += bounds.width + spacing;
      });
      
      currentY += this.options.rankSpacing;
    });
    
    // Add frames
    this.nodes.filter(n => n.type === 'frame').forEach(frame => {
      layoutedNodes.push(frame);
    });
    
    return layoutedNodes;
  }

  private applyCompactLayout(): Node[] {
    // Use hierarchical with tighter spacing
    const originalSpacing = this.options.optimalNodeSpacing;
    this.options.optimalNodeSpacing = this.options.minNodeSpacing;
    
    const result = this.applyHierarchicalLayout('TB');
    
    this.options.optimalNodeSpacing = originalSpacing;
    return result;
  }

  private applyMixedLayout(): Node[] {
    // For complex graphs with mixed flow, use force-directed approach
    const positions = new Map<string, { x: number; y: number }>();
    const deterministicRandom = this.createDeterministicRandom();
    
    // Initialize with current positions
    this.nodes.forEach(node => {
      positions.set(node.id, { ...node.position });
    });
    
    // Run simplified force simulation with deterministic random
    const iterations = 50;
    const cooling = 0.95;
    let temperature = 100;
    
    for (let i = 0; i < iterations; i++) {
      // Calculate forces
      this.nodes.forEach(node1 => {
        if (node1.data?.isPinned || node1.type === 'frame') return;
        
        const pos1 = positions.get(node1.id)!;
        const force = { x: 0, y: 0 };
        const bounds1 = this.nodeBounds.get(node1.id)!;
        
        // Repulsive forces
        this.nodes.forEach(node2 => {
          if (node1.id === node2.id || node2.type === 'frame') return;
          
          const pos2 = positions.get(node2.id)!;
          const bounds2 = this.nodeBounds.get(node2.id)!;
          
          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Calculate minimum distance needed
          const minDist = (bounds1.width + bounds2.width) / 2 + this.options.minNodeSpacing;
          
          if (distance < minDist * 2) {
            const repulsion = (minDist * 2 - distance) * 10;
            force.x += (dx / distance) * repulsion;
            force.y += (dy / distance) * repulsion;
          }
        });
        
        // Attractive forces along edges
        this.edges.forEach(edge => {
          if (edge.source === node1.id || edge.target === node1.id) {
            const otherId = edge.source === node1.id ? edge.target : edge.source;
            const pos2 = positions.get(otherId)!;
            
            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Optimal distance based on direction
            const optimalDist = edge.source === node1.id 
              ? this.options.rankSpacing 
              : this.options.optimalNodeSpacing;
            
            const attraction = (distance - optimalDist) * 0.1;
            force.x += (dx / distance) * attraction;
            force.y += (dy / distance) * attraction;
          }
        });
        
        // Apply forces with temperature
        pos1.x += force.x * temperature * 0.01;
        pos1.y += force.y * temperature * 0.01;
      });
      
      temperature *= cooling;
    }
    
    // Apply final positions
    return this.nodes.map(node => ({
      ...node,
      position: positions.get(node.id)!,
    }));
  }

  private calculateOptimalSpacing(): number {
    const nodeCount = this.nodes.filter(n => n.type !== 'frame').length;
    const edgeCount = this.edges.length;
    const complexity = edgeCount / Math.max(1, nodeCount);
    
    // Analyze node type distribution for better spacing
    const nodeTypes = new Map<string, number>();
    this.nodes.forEach(n => {
      if (n.type !== 'frame') {
        nodeTypes.set(n.type || 'default', (nodeTypes.get(n.type || 'default') || 0) + 1);
      }
    });
    
    // Special handling for different node types
    const hasDecisionNodes = nodeTypes.has('decision');
    const hasScreenNodes = nodeTypes.has('screen') || nodeTypes.has('enhanced-screen');
    const hasNotes = nodeTypes.has('note');
    
    // Calculate type-based factor
    let typeFactor = 1.0;
    if (hasDecisionNodes) typeFactor *= 1.3; // Diamonds need more space
    if (hasScreenNodes && nodeTypes.get('screen')! > 3) typeFactor *= 1.1; // Multiple screens need clarity
    if (hasNotes) typeFactor *= 0.95; // Notes can be slightly closer
    
    // Analyze edge patterns
    const avgEdgesPerNode = edgeCount / Math.max(1, nodeCount);
    const isSparse = avgEdgesPerNode < 1.5;
    const isDense = avgEdgesPerNode > 3;
    
    // Base spacing calculation
    const baseSpacing = this.options.optimalNodeSpacing;
    const minSpacing = this.options.minNodeSpacing;
    
    // Dynamic complexity factor
    let complexityFactor = 1.0;
    if (isSparse) {
      complexityFactor = 0.9; // Sparse graphs can be tighter
    } else if (isDense) {
      complexityFactor = 1.4; // Dense graphs need breathing room
    } else {
      complexityFactor = 1.0 + (complexity * 0.1); // Gradual increase
    }
    
    // Smart compactness that considers graph size
    const sizeFactor = nodeCount > 20 ? 1.1 : (nodeCount < 8 ? 0.85 : 1.0);
    const compactnessFactor = 1.15 - (this.options.compactness * 0.35);
    
    // Calculate final spacing with all factors
    const spacing = baseSpacing * complexityFactor * compactnessFactor * typeFactor * sizeFactor;
    
    // Ensure reasonable bounds
    return Math.max(minSpacing, Math.min(spacing, baseSpacing * 2));
  }

  private calculateEdgeWeight(edge: Edge): number {
    // Higher weight for edges that should be prioritized
    const sourceLevel = this.nodeDepths.get(edge.source) || 0;
    const targetLevel = this.nodeDepths.get(edge.target) || 0;
    
    // Prefer forward edges
    if (targetLevel > sourceLevel) return 10;
    // Same level edges
    if (targetLevel === sourceLevel) return 5;
    // Back edges get lower priority
    return 1;
  }

  private calculateMinEdgeLength(edge: Edge): number {
    const sourceLevel = this.nodeDepths.get(edge.source) || 0;
    const targetLevel = this.nodeDepths.get(edge.target) || 0;
    
    // Ensure minimum separation between levels
    return Math.max(1, Math.abs(targetLevel - sourceLevel));
  }

  private enforceMinimumSpacing(nodes: Node[]): Node[] {
    const adjustedNodes = [...nodes];
    const iterations = 10; // More iterations for better results
    
    for (let iter = 0; iter < iterations; iter++) {
      let adjusted = false;
      
      for (let i = 0; i < adjustedNodes.length; i++) {
        const node1 = adjustedNodes[i];
        if (node1.type === 'frame' || node1.data?.isPinned) continue;
        
        const bounds1 = this.nodeBounds.get(node1.id)!;
        
        for (let j = i + 1; j < adjustedNodes.length; j++) {
          const node2 = adjustedNodes[j];
          if (node2.type === 'frame' || node2.data?.isPinned) continue;
          
          const bounds2 = this.nodeBounds.get(node2.id)!;
          
          // Calculate center-to-center distance
          const c1x = node1.position.x + bounds1.width / 2;
          const c1y = node1.position.y + bounds1.height / 2;
          const c2x = node2.position.x + bounds2.width / 2;
          const c2y = node2.position.y + bounds2.height / 2;
          
          const dx = c2x - c1x;
          const dy = c2y - c1y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Special handling for Decision nodes (diamond shape needs more space)
          const isDecision1 = node1.type === 'decision';
          const isDecision2 = node2.type === 'decision';
          const decisionMultiplier = (isDecision1 || isDecision2) ? 1.4 : 1.0;
          
          // Calculate minimum required distance with adaptive spacing
          const pairSpacing = this.calculateNodePairSpacing(node1, node2);
          const avgWidth = (bounds1.width + bounds2.width) / 2;
          const avgHeight = (bounds1.height + bounds2.height) / 2;
          const minDist = Math.max(avgWidth, avgHeight) * decisionMultiplier + Math.max(this.options.minNodeSpacing, pairSpacing * 0.7);
          
          if (distance < minDist && distance > 0.1) {
            adjusted = true;
            
            // Calculate push vector
            const pushDistance = (minDist - distance) * 0.6; // Smoother adjustment
            const pushX = (dx / distance) * pushDistance;
            const pushY = (dy / distance) * pushDistance;
            
            // Apply symmetric push
            node2.position.x += pushX * 0.5;
            node2.position.y += pushY * 0.5;
            node1.position.x -= pushX * 0.5;
            node1.position.y -= pushY * 0.5;
          }
        }
      }
      
      if (!adjusted) break; // Early exit if no adjustments needed
    }
    
    return adjustedNodes;
  }

  private preventNodeOverlaps(nodes: Node[]): Node[] {
    const iterations = 8; // More iterations for better overlap prevention
    let adjustedNodes = [...nodes];
    
    for (let iter = 0; iter < iterations; iter++) {
      let hasOverlap = false;
      
      for (let i = 0; i < adjustedNodes.length; i++) {
        const node1 = adjustedNodes[i];
        if (node1.type === 'frame' || node1.data?.isPinned) continue;
        
        const bounds1 = this.nodeBounds.get(node1.id)!;
        
        for (let j = i + 1; j < adjustedNodes.length; j++) {
          const node2 = adjustedNodes[j];
          if (node2.type === 'frame' || node2.data?.isPinned) continue;
          
          const bounds2 = this.nodeBounds.get(node2.id)!;
          
          // Special handling for Decision nodes
          const isDecision1 = node1.type === 'decision';
          const isDecision2 = node2.type === 'decision';
          const extraBuffer = (isDecision1 || isDecision2) ? 20 : 0;
          
          // Check for overlap with buffer
          const bufferedBounds1 = {
            ...bounds1,
            x: node1.position.x - extraBuffer/2,
            y: node1.position.y - extraBuffer/2,
            width: bounds1.width + extraBuffer,
            height: bounds1.height + extraBuffer
          };
          const bufferedBounds2 = {
            ...bounds2,
            x: node2.position.x - extraBuffer/2,
            y: node2.position.y - extraBuffer/2,
            width: bounds2.width + extraBuffer,
            height: bounds2.height + extraBuffer
          };
          
          const overlap = this.getOverlap(bufferedBounds1, bufferedBounds2);
          
          if (overlap.x > 0 && overlap.y > 0) {
            hasOverlap = true;
            
            // Calculate separation based on flow direction
            const flowDir = this.layoutAnalysis?.flowDirection || 'vertical';
            
            if (flowDir === 'vertical') {
              // Prefer vertical separation for vertical flows
              const push = (overlap.y + this.options.minNodeSpacing * 0.8) / 2;
              if (node1.position.y < node2.position.y) {
                node1.position.y -= push;
                node2.position.y += push;
              } else {
                node1.position.y += push;
                node2.position.y -= push;
              }
              
              // Minor horizontal adjustment if needed
              if (overlap.x > bounds1.width * 0.8) {
                const hPush = overlap.x * 0.3;
                if (node1.position.x < node2.position.x) {
                  node1.position.x -= hPush;
                  node2.position.x += hPush;
                } else {
                  node1.position.x += hPush;
                  node2.position.x -= hPush;
                }
              }
            } else {
              // Prefer horizontal separation for horizontal flows
              const push = (overlap.x + this.options.minNodeSpacing * 0.8) / 2;
              if (node1.position.x < node2.position.x) {
                node1.position.x -= push;
                node2.position.x += push;
              } else {
                node1.position.x += push;
                node2.position.x -= push;
              }
              
              // Minor vertical adjustment if needed
              if (overlap.y > bounds1.height * 0.8) {
                const vPush = overlap.y * 0.3;
                if (node1.position.y < node2.position.y) {
                  node1.position.y -= vPush;
                  node2.position.y += vPush;
                } else {
                  node1.position.y += vPush;
                  node2.position.y -= vPush;
                }
              }
            }
          }
        }
      }
      
      if (!hasOverlap) break;
    }
    
    return adjustedNodes;
  }

  private getOverlap(bounds1: NodeBounds, bounds2: NodeBounds): { x: number; y: number } {
    const x1 = bounds1.x;
    const y1 = bounds1.y;
    const x2 = x1 + bounds1.width;
    const y2 = y1 + bounds1.height;
    
    const x3 = bounds2.x;
    const y3 = bounds2.y;
    const x4 = x3 + bounds2.width;
    const y4 = y3 + bounds2.height;
    
    const overlapX = Math.max(0, Math.min(x2, x4) - Math.max(x1, x3));
    const overlapY = Math.max(0, Math.min(y2, y4) - Math.max(y1, y3));
    
    return { x: overlapX, y: overlapY };
  }
  
  private getOverlapRect(rect1: { x: number; y: number; width: number; height: number }, 
                         rect2: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    const x1 = rect1.x;
    const y1 = rect1.y;
    const x2 = x1 + rect1.width;
    const y2 = y1 + rect1.height;
    
    const x3 = rect2.x;
    const y3 = rect2.y;
    const x4 = x3 + rect2.width;
    const y4 = y3 + rect2.height;
    
    const overlapX = Math.max(0, Math.min(x2, x4) - Math.max(x1, x3));
    const overlapY = Math.max(0, Math.min(y2, y4) - Math.max(y1, y3));
    
    return { x: overlapX, y: overlapY };
  }

  private optimizeCompactness(nodes: Node[]): Node[] {
    if (this.options.compactness <= 0.5) return nodes;
    
    // Find bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      if (node.type === 'frame') return;
      const bounds = this.nodeBounds.get(node.id)!;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + bounds.width);
      maxY = Math.max(maxY, node.position.y + bounds.height);
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Pull nodes slightly toward center
    const pullFactor = this.options.compactness * 0.1;
    
    return nodes.map(node => {
      if (node.type === 'frame' || node.data?.isPinned) return node;
      
      return {
        ...node,
        position: {
          x: node.position.x + (centerX - node.position.x - this.nodeBounds.get(node.id)!.width / 2) * pullFactor,
          y: node.position.y + (centerY - node.position.y - this.nodeBounds.get(node.id)!.height / 2) * pullFactor,
        },
      };
    });
  }

  private optimizeEdgeRouting(nodes: Node[]): Edge[] {
    // Update node bounds with new positions
    const updatedBounds = new Map<string, NodeBounds>();
    nodes.forEach(node => {
      const bounds = this.nodeBounds.get(node.id)!;
      updatedBounds.set(node.id, {
        ...bounds,
        x: node.position.x,
        y: node.position.y,
        centerX: node.position.x + bounds.width / 2,
        centerY: node.position.y + bounds.height / 2,
      });
    });
    
    // First, assign handles intelligently to separate incoming/outgoing
    const handleAssignments = this.assignHandlesIntelligently(nodes, updatedBounds);
    
    // Group edges by source/target to detect overlaps
    const edgeGroups = new Map<string, Edge[]>();
    this.edges.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, []);
      }
      edgeGroups.get(key)!.push(edge);
    });
    
    return this.edges.map(edge => {
      const sourceBounds = updatedBounds.get(edge.source);
      const targetBounds = updatedBounds.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return edge;
      
      // Use pre-assigned handles from intelligent assignment
      const sourceAssignment = handleAssignments.get(edge.source);
      const targetAssignment = handleAssignments.get(edge.target);
      
      let sourceHandle = edge.sourceHandle;
      let targetHandle = edge.targetHandle;
      
      if (sourceAssignment && targetAssignment) {
        // Find which handles were assigned for this edge
        sourceAssignment.outgoing.forEach((edges, handle) => {
          if (edges.some(e => e.id === edge.id)) {
            sourceHandle = handle;
          }
        });
        
        targetAssignment.incoming.forEach((edges, handle) => {
          if (edges.some(e => e.id === edge.id)) {
            targetHandle = handle;
          }
        });
      }
      
      // If no assignment found, use smart geometric selection
      if (!sourceHandle || !targetHandle) {
        const bestPath = this.findOptimalHandlesByGeometry(sourceBounds, targetBounds, edge);
        sourceHandle = bestPath.sourceHandle;
        targetHandle = bestPath.targetHandle;
      }
      
      // Calculate optimal label position
      const path: EdgePath = {
        source: sourceBounds,
        target: targetBounds,
        sourceHandle: sourceHandle!,
        targetHandle: targetHandle!,
        points: [
          this.getHandlePoint(sourceBounds, sourceHandle!),
          this.getHandlePoint(targetBounds, targetHandle!)
        ],
        length: 0,
        crossings: 0,
        quality: 1
      };
      
      const labelPosition = this.calculateOptimalLabelPosition(path, edge);
      
      return {
        ...edge,
        sourceHandle,
        targetHandle,
        data: {
          ...edge.data,
          sourceHandle,
          targetHandle,
          labelPosition,
        },
      };
    });
  }
  
  private assignHandlesIntelligently(nodes: Node[], bounds: Map<string, NodeBounds>): Map<string, HandleAssignment> {
    const assignments = new Map<string, HandleAssignment>();
    
    // Initialize assignments for each node
    nodes.forEach(node => {
      if (node.type === 'frame') return;
      
      assignments.set(node.id, {
        nodeId: node.id,
        incoming: new Map(),
        outgoing: new Map(),
        availableHandles: ['top', 'right', 'bottom', 'left']
      });
    });
    
    // Build flow paths to understand the complete picture
    const flowPaths = this.buildFlowPaths();
    
    // Group edges by their connection patterns
    const nodeConnections = new Map<string, {
      incoming: Edge[],
      outgoing: Edge[]
    }>();
    
    this.nodes.forEach(node => {
      nodeConnections.set(node.id, {
        incoming: this.edges.filter(e => e.target === node.id),
        outgoing: this.edges.filter(e => e.source === node.id)
      });
    });
    
    // Process nodes in topological order for better flow continuity
    const sortedNodes = this.getTopologicallySortedNodes();
    
    sortedNodes.forEach(nodeId => {
      const connections = nodeConnections.get(nodeId);
      if (!connections) return;
      
      const assignment = assignments.get(nodeId);
      if (!assignment) return;
      
      const nodeBounds = bounds.get(nodeId);
      if (!nodeBounds) return;
      
      // Optimize handles considering the complete flow path
      const optimizedHandles = this.optimizeHandlesForFlowContinuity(
        nodeId,
        connections,
        nodeBounds,
        bounds,
        flowPaths,
        assignments
      );
      
      assignment.incoming = optimizedHandles.incoming;
      assignment.outgoing = optimizedHandles.outgoing;
    });
    
    // Global optimization pass to minimize total edge length
    this.performGlobalHandleOptimization(assignments, bounds);
    
    return assignments;
  }
  
  private buildFlowPaths(): Map<string, string[]> {
    // Build complete flow paths from start to end nodes
    const paths = new Map<string, string[]>();
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || !this.edges.some(e => e.target === n.id)
    );
    
    startNodes.forEach(start => {
      const visited = new Set<string>();
      const currentPath: string[] = [];
      
      const traverse = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        currentPath.push(nodeId);
        
        const outgoing = this.edges.filter(e => e.source === nodeId);
        outgoing.forEach(edge => {
          traverse(edge.target);
        });
        
        if (currentPath.length > 1) {
          paths.set(`${currentPath[0]}-${currentPath[currentPath.length - 1]}`, [...currentPath]);
        }
        
        currentPath.pop();
      };
      
      traverse(start.id);
    });
    
    return paths;
  }
  
  private getTopologicallySortedNodes(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const targets = this.adjacencyList.get(nodeId) || new Set();
      targets.forEach(targetId => visit(targetId));
      
      sorted.push(nodeId);
    };
    
    this.nodes.forEach(node => {
      if (node.type !== 'frame') {
        visit(node.id);
      }
    });
    
    return sorted.reverse();
  }
  
  private optimizeHandlesForFlowContinuity(
    nodeId: string,
    connections: { incoming: Edge[], outgoing: Edge[] },
    nodeBounds: NodeBounds,
    allBounds: Map<string, NodeBounds>,
    flowPaths: Map<string, string[]>,
    assignments: Map<string, HandleAssignment>
  ): { incoming: Map<string, Edge[]>, outgoing: Map<string, Edge[]> } {
    const incoming = new Map<string, Edge[]>();
    const outgoing = new Map<string, Edge[]>();
    
    // For intermediate nodes in a flow path, optimize for continuity
    const isIntermediateNode = connections.incoming.length > 0 && connections.outgoing.length > 0;
    
    if (isIntermediateNode) {
      // Find the main flow path through this node
      let mainIncoming: Edge | null = null;
      let mainOutgoing: Edge | null = null;
      
      // Find edges that are part of the same flow path
      flowPaths.forEach(path => {
        const nodeIndex = path.indexOf(nodeId);
        if (nodeIndex > 0 && nodeIndex < path.length - 1) {
          const prevNode = path[nodeIndex - 1];
          const nextNode = path[nodeIndex + 1];
          
          mainIncoming = connections.incoming.find(e => e.source === prevNode) || mainIncoming;
          mainOutgoing = connections.outgoing.find(e => e.target === nextNode) || mainOutgoing;
        }
      });
      
      if (mainIncoming && mainOutgoing) {
        // Optimize handles for flow continuity
        const incomingSource = allBounds.get(mainIncoming.source);
        const outgoingTarget = allBounds.get(mainOutgoing.target);
        
        if (incomingSource && outgoingTarget) {
          // Calculate optimal handles for minimal total path length
          const handles = this.calculateOptimalFlowHandles(
            incomingSource,
            nodeBounds,
            outgoingTarget
          );
          
          // Assign main flow edges
          incoming.set(handles.incomingHandle, [mainIncoming]);
          outgoing.set(handles.outgoingHandle, [mainOutgoing]);
          
          // Assign other edges to remaining handles
          connections.incoming.forEach(edge => {
            if (edge.id !== mainIncoming.id) {
              const handle = this.findBestAvailableHandle(
                edge,
                nodeId,
                nodeBounds,
                allBounds,
                'incoming',
                [handles.incomingHandle]
              );
              if (!incoming.has(handle)) incoming.set(handle, []);
              incoming.get(handle)!.push(edge);
            }
          });
          
          connections.outgoing.forEach(edge => {
            if (edge.id !== mainOutgoing.id) {
              const handle = this.findBestAvailableHandle(
                edge,
                nodeId,
                nodeBounds,
                allBounds,
                'outgoing',
                [handles.outgoingHandle]
              );
              if (!outgoing.has(handle)) outgoing.set(handle, []);
              outgoing.get(handle)!.push(edge);
            }
          });
          
          return { incoming, outgoing };
        }
      }
    }
    
    // Fallback to standard handle determination
    const incomingHandles = this.determineIncomingHandles(connections.incoming, nodeId, nodeBounds, allBounds);
    const outgoingHandles = this.determineOutgoingHandles(connections.outgoing, nodeId, nodeBounds, allBounds);
    
    // Ensure no overlap
    incomingHandles.forEach((edges, handle) => {
      incoming.set(handle, edges);
    });
    
    outgoingHandles.forEach((edges, handle) => {
      if (incoming.has(handle) && incoming.get(handle)!.length > 0) {
        const alternative = this.findAlternativeHandle(handle, nodeId, nodeBounds, edges[0], allBounds, Array.from(incoming.keys()));
        outgoing.set(alternative, edges);
      } else {
        outgoing.set(handle, edges);
      }
    });
    
    return { incoming, outgoing };
  }
  
  private calculateOptimalFlowHandles(
    source: NodeBounds,
    intermediate: NodeBounds,
    target: NodeBounds
  ): { incomingHandle: string, outgoingHandle: string } {
    // Calculate the optimal handles for minimal total path length
    // This considers the complete path: source -> intermediate -> target
    
    const handles = ['top', 'right', 'bottom', 'left'];
    let bestConfig = { incomingHandle: 'left', outgoingHandle: 'right', totalLength: Infinity };
    
    // Try different handle combinations
    handles.forEach(inHandle => {
      handles.forEach(outHandle => {
        // Skip same-side configurations for flow continuity
        if (inHandle === outHandle) return;
        
        // Calculate total path length
        const inPoint = this.getHandlePoint(intermediate, inHandle);
        const outPoint = this.getHandlePoint(intermediate, outHandle);
        
        const sourcePoint = this.getHandlePoint(source, this.getOppositeHandle(inHandle));
        const targetPoint = this.getHandlePoint(target, this.getOppositeHandle(outHandle));
        
        const inLength = Math.sqrt(
          Math.pow(inPoint.x - sourcePoint.x, 2) + 
          Math.pow(inPoint.y - sourcePoint.y, 2)
        );
        
        const outLength = Math.sqrt(
          Math.pow(targetPoint.x - outPoint.x, 2) + 
          Math.pow(targetPoint.y - outPoint.y, 2)
        );
        
        const totalLength = inLength + outLength;
        
        // Prefer configurations that maintain flow direction
        let bonus = 0;
        if ((inHandle === 'left' && outHandle === 'right') ||
            (inHandle === 'right' && outHandle === 'left') ||
            (inHandle === 'top' && outHandle === 'bottom') ||
            (inHandle === 'bottom' && outHandle === 'top')) {
          bonus = -50; // Prefer straight-through configurations
        }
        
        if (totalLength + bonus < bestConfig.totalLength) {
          bestConfig = {
            incomingHandle: inHandle,
            outgoingHandle: outHandle,
            totalLength: totalLength + bonus
          };
        }
      });
    });
    
    return {
      incomingHandle: bestConfig.incomingHandle,
      outgoingHandle: bestConfig.outgoingHandle
    };
  }
  
  private getOppositeHandle(handle: string): string {
    switch (handle) {
      case 'top': return 'bottom';
      case 'bottom': return 'top';
      case 'left': return 'right';
      case 'right': return 'left';
      default: return 'right';
    }
  }
  
  private findBestAvailableHandle(
    edge: Edge,
    nodeId: string,
    nodeBounds: NodeBounds,
    allBounds: Map<string, NodeBounds>,
    type: 'incoming' | 'outgoing',
    usedHandles: string[]
  ): string {
    const otherNodeId = type === 'incoming' ? edge.source : edge.target;
    const otherBounds = allBounds.get(otherNodeId);
    
    if (!otherBounds) return 'top';
    
    const dx = otherBounds.centerX - nodeBounds.centerX;
    const dy = otherBounds.centerY - nodeBounds.centerY;
    
    // Determine ideal handle based on direction
    let idealHandle: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (type === 'incoming') {
        idealHandle = dx > 0 ? 'right' : 'left';
      } else {
        idealHandle = dx > 0 ? 'right' : 'left';
      }
    } else {
      if (type === 'incoming') {
        idealHandle = dy > 0 ? 'bottom' : 'top';
      } else {
        idealHandle = dy > 0 ? 'bottom' : 'top';
      }
    }
    
    // If ideal handle is available, use it
    if (!usedHandles.includes(idealHandle)) {
      return idealHandle;
    }
    
    // Find next best available handle
    const handles = ['top', 'right', 'bottom', 'left'];
    const availableHandles = handles.filter(h => !usedHandles.includes(h));
    
    if (availableHandles.length > 0) {
      return availableHandles[0];
    }
    
    return idealHandle; // Fallback
  }
  
  private performGlobalHandleOptimization(
    assignments: Map<string, HandleAssignment>,
    bounds: Map<string, NodeBounds>
  ): void {
    // Global optimization pass to minimize total edge length
    let improved = true;
    let iterations = 0;
    const maxIterations = 3;
    
    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;
      
      // Try to optimize each node's handle assignments
      assignments.forEach((assignment, nodeId) => {
        const nodeBounds = bounds.get(nodeId);
        if (!nodeBounds) return;
        
        // Calculate current total edge length for this node
        const currentLength = this.calculateNodeEdgeLength(assignment, nodeId, nodeBounds, bounds);
        
        // Try swapping handles to see if we can improve
        const improved = this.tryImproveNodeHandles(assignment, nodeId, nodeBounds, bounds, currentLength);
        
        if (improved) {
          improved = true;
        }
      });
    }
  }
  
  private calculateNodeEdgeLength(
    assignment: HandleAssignment,
    nodeId: string,
    nodeBounds: NodeBounds,
    allBounds: Map<string, NodeBounds>
  ): number {
    let totalLength = 0;
    
    assignment.incoming.forEach((edges, handle) => {
      const handlePoint = this.getHandlePoint(nodeBounds, handle);
      edges.forEach(edge => {
        const sourceBounds = allBounds.get(edge.source);
        if (sourceBounds) {
          const sourcePoint = this.getHandlePoint(sourceBounds, edge.sourceHandle || 'right');
          totalLength += Math.sqrt(
            Math.pow(handlePoint.x - sourcePoint.x, 2) +
            Math.pow(handlePoint.y - sourcePoint.y, 2)
          );
        }
      });
    });
    
    assignment.outgoing.forEach((edges, handle) => {
      const handlePoint = this.getHandlePoint(nodeBounds, handle);
      edges.forEach(edge => {
        const targetBounds = allBounds.get(edge.target);
        if (targetBounds) {
          const targetPoint = this.getHandlePoint(targetBounds, edge.targetHandle || 'left');
          totalLength += Math.sqrt(
            Math.pow(targetPoint.x - handlePoint.x, 2) +
            Math.pow(targetPoint.y - handlePoint.y, 2)
          );
        }
      });
    });
    
    return totalLength;
  }
  
  private tryImproveNodeHandles(
    assignment: HandleAssignment,
    nodeId: string,
    nodeBounds: NodeBounds,
    allBounds: Map<string, NodeBounds>,
    currentLength: number
  ): boolean {
    // Try to find a better handle configuration
    // This is a simplified version - could be made more sophisticated
    return false; // For now, skip this optimization
  }
  
  private determineIncomingHandles(edges: Edge[], nodeId: string, nodeBounds: NodeBounds, allBounds: Map<string, NodeBounds>): Map<string, Edge[]> {
    const handleGroups = new Map<string, Edge[]>();
    
    edges.forEach(edge => {
      const sourceBounds = allBounds.get(edge.source);
      if (!sourceBounds) return;
      
      // FIXED: Calculate FROM source TO target (this node)
      // The handle should be where the edge ENTERS this node
      const dx = sourceBounds.centerX - nodeBounds.centerX;
      const dy = sourceBounds.centerY - nodeBounds.centerY;
      
      let bestHandle: string;
      const angle = Math.atan2(dy, dx);
      const angleDeg = (angle * 180) / Math.PI;
      
      // CORRECTED: The handle should face the source
      // If source is ABOVE (-90°), edge enters from TOP
      // If source is BELOW (90°), edge enters from BOTTOM
      // If source is LEFT (±180°), edge enters from LEFT
      // If source is RIGHT (0°), edge enters from RIGHT
      
      if (angleDeg >= -45 && angleDeg <= 45) {
        bestHandle = 'right'; // Source is to the right, edge comes FROM right
      } else if (angleDeg > 45 && angleDeg <= 135) {
        bestHandle = 'bottom'; // Source is below, edge comes FROM bottom
      } else if (angleDeg > 135 || angleDeg <= -135) {
        bestHandle = 'left'; // Source is to the left, edge comes FROM left
      } else {
        bestHandle = 'top'; // Source is above, edge comes FROM top
      }
      
      if (!handleGroups.has(bestHandle)) {
        handleGroups.set(bestHandle, []);
      }
      handleGroups.get(bestHandle)!.push(edge);
    });
    
    // Limit to max 3 edges per handle, redistribute if needed
    const redistributed = this.redistributeHandles(handleGroups, 3);
    
    return redistributed;
  }
  
  private determineOutgoingHandles(edges: Edge[], nodeId: string, nodeBounds: NodeBounds, allBounds: Map<string, NodeBounds>): Map<string, Edge[]> {
    const handleGroups = new Map<string, Edge[]>();
    
    edges.forEach(edge => {
      const targetBounds = allBounds.get(edge.target);
      if (!targetBounds) return;
      
      // Determine best handle based on target position
      const dx = targetBounds.centerX - nodeBounds.centerX;
      const dy = targetBounds.centerY - nodeBounds.centerY;
      
      let bestHandle: string;
      const angle = Math.atan2(dy, dx);
      const angleDeg = (angle * 180) / Math.PI;
      
      // Select handle based on angle - pointing toward target
      if (angleDeg >= -45 && angleDeg <= 45) {
        bestHandle = 'right'; // Target is to the right
      } else if (angleDeg > 45 && angleDeg <= 135) {
        bestHandle = 'bottom'; // Target is below
      } else if (angleDeg > 135 || angleDeg <= -135) {
        bestHandle = 'left'; // Target is to the left
      } else {
        bestHandle = 'top'; // Target is above
      }
      
      if (!handleGroups.has(bestHandle)) {
        handleGroups.set(bestHandle, []);
      }
      handleGroups.get(bestHandle)!.push(edge);
    });
    
    // Limit to max 3 edges per handle
    const redistributed = this.redistributeHandles(handleGroups, 3);
    
    return redistributed;
  }
  
  private redistributeHandles(handleGroups: Map<string, Edge[]>, maxPerHandle: number): Map<string, Edge[]> {
    const result = new Map<string, Edge[]>();
    const handles = ['top', 'right', 'bottom', 'left'];
    
    handleGroups.forEach((edges, handle) => {
      if (edges.length <= maxPerHandle) {
        result.set(handle, edges);
      } else {
        // Need to redistribute
        const mainEdges = edges.slice(0, maxPerHandle);
        const overflowEdges = edges.slice(maxPerHandle);
        
        result.set(handle, mainEdges);
        
        // Find adjacent handles for overflow
        const handleIndex = handles.indexOf(handle);
        const leftHandle = handles[(handleIndex + 3) % 4]; // -1 mod 4
        const rightHandle = handles[(handleIndex + 1) % 4];
        
        // Distribute overflow to adjacent handles
        overflowEdges.forEach((edge, i) => {
          const targetHandle = i % 2 === 0 ? leftHandle : rightHandle;
          if (!result.has(targetHandle)) {
            result.set(targetHandle, []);
          }
          const targetList = result.get(targetHandle)!;
          if (targetList.length < maxPerHandle) {
            targetList.push(edge);
          }
        });
      }
    });
    
    return result;
  }
  
  private findAlternativeHandle(preferredHandle: string, nodeId: string, nodeBounds: NodeBounds, edge: Edge, allBounds: Map<string, NodeBounds>, usedHandles: string[]): string {
    const handles = ['top', 'right', 'bottom', 'left'];
    const availableHandles = handles.filter(h => !usedHandles.includes(h));
    
    if (availableHandles.length === 0) {
      // All handles used, find least crowded
      return preferredHandle; // Fallback to preferred
    }
    
    // Find handle closest to preferred direction
    const handleIndex = handles.indexOf(preferredHandle);
    const adjacentHandles = [
      handles[(handleIndex + 1) % 4],
      handles[(handleIndex + 3) % 4], // -1 mod 4
      handles[(handleIndex + 2) % 4]
    ];
    
    for (const handle of adjacentHandles) {
      if (availableHandles.includes(handle)) {
        return handle;
      }
    }
    
    return availableHandles[0];
  }
  
  private findOptimalHandlesByGeometry(source: NodeBounds, target: NodeBounds, edge: Edge): EdgePath {
    // IMPROVED: More intelligent handle selection
    const dx = target.centerX - source.centerX;
    const dy = target.centerY - source.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Calculate angle from source to target
    const angle = Math.atan2(dy, dx);
    const angleDeg = (angle * 180) / Math.PI;
    
    let sourceHandle: string;
    let targetHandle: string;
    
    // Improved logic: Consider actual relative positions
    // The key insight: handles should minimize edge length and avoid going through nodes
    
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Strongly horizontal relationship
      if (dx > 0) {
        // Target is to the right
        sourceHandle = 'right';
        targetHandle = 'left';
      } else {
        // Target is to the left
        sourceHandle = 'left';
        targetHandle = 'right';
      }
    } else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      // Strongly vertical relationship
      if (dy > 0) {
        // Target is below
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else {
        // Target is above
        sourceHandle = 'top';
        targetHandle = 'bottom';
      }
    } else {
      // Diagonal relationship - choose based on exact angle
      // This prevents edges from going through nodes
      
      if (angleDeg >= -45 && angleDeg < 45) {
        // East (right)
        sourceHandle = 'right';
        targetHandle = 'left';
      } else if (angleDeg >= 45 && angleDeg < 135) {
        // South (down)
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else if (angleDeg >= 135 || angleDeg < -135) {
        // West (left)
        sourceHandle = 'left';
        targetHandle = 'right';
      } else {
        // North (up)
        sourceHandle = 'top';
        targetHandle = 'bottom';
      }
    }
    
    // Special case: Check if edge would go through source or target node
    // This happens when handles are on the wrong side
    const wouldGoThroughSource = 
      (sourceHandle === 'right' && dx < 0) ||
      (sourceHandle === 'left' && dx > 0) ||
      (sourceHandle === 'bottom' && dy < 0) ||
      (sourceHandle === 'top' && dy > 0);
    
    const wouldGoThroughTarget = 
      (targetHandle === 'right' && dx > 0) ||
      (targetHandle === 'left' && dx < 0) ||
      (targetHandle === 'bottom' && dy > 0) ||
      (targetHandle === 'top' && dy < 0);
    
    // Fix if edge would go through nodes
    if (wouldGoThroughSource) {
      // Flip source handle to opposite side
      sourceHandle = sourceHandle === 'right' ? 'left' : 
                     sourceHandle === 'left' ? 'right' :
                     sourceHandle === 'top' ? 'bottom' : 'top';
    }
    
    if (wouldGoThroughTarget) {
      // Flip target handle to opposite side
      targetHandle = targetHandle === 'right' ? 'left' : 
                     targetHandle === 'left' ? 'right' :
                     targetHandle === 'top' ? 'bottom' : 'top';
    }
    
    return {
      source,
      target,
      sourceHandle,
      targetHandle,
      points: [
        this.getHandlePoint(source, sourceHandle),
        this.getHandlePoint(target, targetHandle)
      ],
      length: distance,
      crossings: 0,
      quality: 1
    };
  }
  
  private calculateOptimalLabelPosition(path: EdgePath, edge: Edge): { x: number; y: number } | undefined {
    if (!edge.label) return undefined;
    
    // Find the longest segment of the edge that doesn't overlap with other edges
    const segments = this.getEdgeSegments(path);
    let longestSegment = { start: path.points[0], end: path.points[1], length: 0 };
    let maxClearLength = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const clearLength = this.getSegmentClearLength(segment, edge.id);
      
      if (clearLength > maxClearLength) {
        maxClearLength = clearLength;
        longestSegment = segment;
      }
    }
    
    // Position label at the middle of the longest clear segment
    return {
      x: (longestSegment.start.x + longestSegment.end.x) / 2,
      y: (longestSegment.start.y + longestSegment.end.y) / 2,
    };
  }
  
  private getEdgeSegments(path: EdgePath): Array<{ start: { x: number; y: number }, end: { x: number; y: number }, length: number }> {
    const segments = [];
    for (let i = 0; i < path.points.length - 1; i++) {
      const start = path.points[i];
      const end = path.points[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segments.push({ start, end, length });
    }
    return segments;
  }
  
  private getSegmentClearLength(segment: { start: { x: number; y: number }, end: { x: number; y: number }, length: number }, excludeEdgeId: string): number {
    // Check how much of this segment is clear of other edges
    let clearLength = segment.length;
    
    this.edges.forEach(edge => {
      if (edge.id === excludeEdgeId) return;
      
      // Simple check - if edges cross near this segment, reduce clear length
      const sourceBounds = this.nodeBounds.get(edge.source);
      const targetBounds = this.nodeBounds.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return;
      
      const edgeStart = this.getHandlePoint(sourceBounds, edge.sourceHandle || 'right');
      const edgeEnd = this.getHandlePoint(targetBounds, edge.targetHandle || 'left');
      
      if (this.linesIntersect(segment.start, segment.end, edgeStart, edgeEnd)) {
        clearLength *= 0.5; // Reduce clear length if there's an intersection
      }
    });
    
    return clearLength;
  }

  // Removed old findOptimalHandles - now using intelligent assignment and geometry-based selection

  private evaluatePath(
    source: NodeBounds,
    target: NodeBounds,
    sourceHandle: string,
    targetHandle: string,
    edge: Edge
  ): EdgePath {
    const sourcePoint = this.getHandlePoint(source, sourceHandle);
    const targetPoint = this.getHandlePoint(target, targetHandle);
    
    const dx = targetPoint.x - sourcePoint.x;
    const dy = targetPoint.y - sourcePoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Count crossings
    const crossings = this.countCrossings(sourcePoint, targetPoint, edge.id);
    
    // Calculate quality based on handle alignment
    const quality = this.calculatePathQuality(sourceHandle, targetHandle, dx, dy);
    
    return {
      source,
      target,
      sourceHandle,
      targetHandle,
      points: [sourcePoint, targetPoint],
      length,
      crossings,
      quality,
    };
  }

  private getHandlePoint(bounds: NodeBounds, handle: string): { x: number; y: number } {
    switch (handle) {
      case 'top':
        return { x: bounds.centerX, y: bounds.y };
      case 'right':
        return { x: bounds.x + bounds.width, y: bounds.centerY };
      case 'bottom':
        return { x: bounds.centerX, y: bounds.y + bounds.height };
      case 'left':
        return { x: bounds.x, y: bounds.centerY };
      default:
        return { x: bounds.centerX, y: bounds.centerY };
    }
  }

  private calculatePathQuality(sourceHandle: string, targetHandle: string, dx: number, dy: number): number {
    // Enhanced quality calculation for better edge routing
    let quality = 0.5;
    
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const angle = Math.atan2(dy, dx);
    const angleDeg = (angle * 180) / Math.PI;
    
    // Detect layout direction from analysis
    const layoutDirection = this.layoutAnalysis?.flowDirection || 'vertical';
    
    // Perfect alignments get highest quality
    if (layoutDirection === 'horizontal' || horizontal) {
      // For horizontal layouts, strongly prefer horizontal connections
      if (dx > 0 && sourceHandle === 'right' && targetHandle === 'left') {
        quality = 1.5; // Extra high quality for ideal horizontal flow
        // Bonus for perfect horizontal alignment
        if (Math.abs(dy) < 5) quality = 2.0;
      } else if (dx < 0 && sourceHandle === 'left' && targetHandle === 'right') {
        quality = 1.5;
        if (Math.abs(dy) < 5) quality = 2.0;
      } else if (Math.abs(dy) < Math.abs(dx) * 0.3) {
        // Mostly horizontal connections are good
        if ((dx > 0 && sourceHandle === 'right') || (dx < 0 && sourceHandle === 'left')) {
          quality = 1.0;
        }
      } else {
        // Penalize vertical connections in horizontal layout
        if (sourceHandle === 'top' || sourceHandle === 'bottom') {
          quality *= 0.4;
        }
      }
    } else {
      // For vertical layouts, prefer vertical connections
      if (dy > 0 && sourceHandle === 'bottom' && targetHandle === 'top') {
        quality = 1.5;
        // Bonus for perfect vertical alignment
        if (Math.abs(dx) < 5) quality = 2.0;
      } else if (dy < 0 && sourceHandle === 'top' && targetHandle === 'bottom') {
        quality = 1.5;
        if (Math.abs(dx) < 5) quality = 2.0;
      } else if (Math.abs(dx) < Math.abs(dy) * 0.3) {
        // Mostly vertical connections are good
        if ((dy > 0 && sourceHandle === 'bottom') || (dy < 0 && sourceHandle === 'top')) {
          quality = 1.0;
        }
      } else {
        // Penalize horizontal connections in vertical layout
        if (sourceHandle === 'left' || sourceHandle === 'right') {
          quality *= 0.4;
        }
      }
    }
    
    // Heavily penalize same-side connections
    if (sourceHandle === targetHandle) {
      quality *= 0.2;
      
      // Extra penalty for back-connections (edges going backwards)
      if ((sourceHandle === 'top' && dy > 0) || 
          (sourceHandle === 'bottom' && dy < 0) ||
          (sourceHandle === 'left' && dx > 0) ||
          (sourceHandle === 'right' && dx < 0)) {
        quality *= 0.3;
      }
    }
    
    // Penalize kinks (very acute angles that create unnecessary bends)
    if (Math.abs(angleDeg) > 160 || Math.abs(angleDeg) < 20) {
      if (sourceHandle !== 'right' && sourceHandle !== 'left') {
        quality *= 0.7;
      }
    }
    
    return quality;
  }

  private calculatePathScore(path: EdgePath): number {
    // Enhanced scoring with more nuanced weights
    // Lower score is better
    
    // Crossings are the worst - heavily penalized
    const crossingPenalty = path.crossings * 2000;
    
    // Length penalty, but not too harsh
    const lengthPenalty = path.length * 0.3;
    
    // Quality bonus (subtract because lower is better)
    const qualityBonus = path.quality * 200;
    
    // Extra penalty for very long paths
    const excessiveLengthPenalty = path.length > 500 ? (path.length - 500) * 2 : 0;
    
    return crossingPenalty + lengthPenalty + excessiveLengthPenalty - qualityBonus;
  }

  private countCrossings(start: { x: number; y: number }, end: { x: number; y: number }, excludeId: string): number {
    let crossings = 0;
    
    this.edges.forEach(edge => {
      if (edge.id === excludeId) return;
      
      const sourceBounds = this.nodeBounds.get(edge.source);
      const targetBounds = this.nodeBounds.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return;
      
      const edgeStart = this.getHandlePoint(sourceBounds, edge.sourceHandle || 'right');
      const edgeEnd = this.getHandlePoint(targetBounds, edge.targetHandle || 'left');
      
      if (this.linesIntersect(start, end, edgeStart, edgeEnd)) {
        crossings++;
      }
    });
    
    return crossings;
  }

  private linesIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
  ): boolean {
    const ccw = (A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }) => {
      return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    };
    
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  }

  private preventEdgeNodeCollisions(nodes: Node[], edges: Edge[]): Node[] {
    // Enhanced edge-node collision prevention with frame awareness
    const adjustedNodes = [...nodes];
    const iterations = 8; // More iterations for better resolution
    
    for (let iter = 0; iter < iterations; iter++) {
      let hasCollision = false;
      const moveAccumulator = new Map<string, { x: number; y: number }>();
      
      edges.forEach(edge => {
        const sourceNode = adjustedNodes.find(n => n.id === edge.source);
        const targetNode = adjustedNodes.find(n => n.id === edge.target);
        
        if (!sourceNode || !targetNode) return;
        
        const sourceBounds = this.nodeBounds.get(edge.source);
        const targetBounds = this.nodeBounds.get(edge.target);
        
        if (!sourceBounds || !targetBounds) return;
        
        // Calculate actual edge path
        const sourcePoint = this.getHandlePoint(
          {
            ...sourceBounds,
            x: sourceNode.position.x,
            y: sourceNode.position.y,
            centerX: sourceNode.position.x + sourceBounds.width / 2,
            centerY: sourceNode.position.y + sourceBounds.height / 2
          },
          edge.sourceHandle || this.getDefaultHandle(sourceNode, targetNode, 'source')
        );
        
        const targetPoint = this.getHandlePoint(
          {
            ...targetBounds,
            x: targetNode.position.x,
            y: targetNode.position.y,
            centerX: targetNode.position.x + targetBounds.width / 2,
            centerY: targetNode.position.y + targetBounds.height / 2
          },
          edge.targetHandle || this.getDefaultHandle(sourceNode, targetNode, 'target')
        );
        
        // Check collision with all other nodes
        adjustedNodes.forEach(node => {
          if (node.id === edge.source || node.id === edge.target) return;
          if (node.type === 'frame' || node.data?.isPinned) return;
          
          const bounds = this.nodeBounds.get(node.id)!;
          
          // Create proper collision box with generous buffer
          const buffer = Math.max(this.options.edgeBuffer, 40);
          const nodeRect = {
            x: node.position.x - buffer / 2,
            y: node.position.y - buffer / 2,
            width: bounds.width + buffer,
            height: bounds.height + buffer,
          };
          
          // Extra buffer for special node types
          if (node.type === 'decision') {
            nodeRect.x -= 15;
            nodeRect.y -= 15;
            nodeRect.width += 30;
            nodeRect.height += 30;
          } else if (node.type === 'start' || node.type === 'end') {
            // Circular nodes need radial buffer
            nodeRect.x -= 10;
            nodeRect.y -= 10;
            nodeRect.width += 20;
            nodeRect.height += 20;
          }
          
          if (this.lineIntersectsRect(sourcePoint, targetPoint, nodeRect)) {
            hasCollision = true;
            
            // Check if node is in a frame - if so, move carefully
            let nodeFrameId: string | null = null;
            this.originalFrameContents.forEach((contents, frameId) => {
              if (contents.has(node.id)) {
                nodeFrameId = frameId;
              }
            });
            
            // Calculate avoidance vector
            const moveVector = this.calculateSmartAvoidanceVector(
              sourcePoint,
              targetPoint,
              nodeRect,
              node,
              adjustedNodes
            );
            
            // Accumulate movements to apply them all at once
            const current = moveAccumulator.get(node.id) || { x: 0, y: 0 };
            current.x += moveVector.x * 0.5;
            current.y += moveVector.y * 0.5;
            moveAccumulator.set(node.id, current);
          }
        });
      });
      
      // Apply accumulated movements
      moveAccumulator.forEach((move, nodeId) => {
        const node = adjustedNodes.find(n => n.id === nodeId);
        if (node) {
          // Check frame boundaries before moving
          let canMoveX = true;
          let canMoveY = true;
          
          // If node is in a frame, check if movement keeps it inside
          this.originalFrameContents.forEach((contents, frameId) => {
            if (contents.has(nodeId)) {
              const frame = this.nodes.find(n => n.id === frameId && n.type === 'frame');
              if (frame) {
                const frameBounds = this.nodeBounds.get(nodeFrameId)!;
                const nodeBounds = this.nodeBounds.get(nodeId)!;
                
                // Check if movement would push node outside frame
                const newX = node.position.x + move.x;
                const newY = node.position.y + move.y;
                
                if (newX < frameBounds.x + 20 || 
                    newX + nodeBounds.width > frameBounds.x + frameBounds.width - 20) {
                  canMoveX = false;
                }
                if (newY < frameBounds.y + 20 || 
                    newY + nodeBounds.height > frameBounds.y + frameBounds.height - 20) {
                  canMoveY = false;
                }
              }
            }
          });
          
          // Apply movement with frame constraints
          if (canMoveX) node.position.x += move.x;
          if (canMoveY) node.position.y += move.y;
        }
      });
      
      if (!hasCollision) break; // Early exit if no collisions
    }
    
    return adjustedNodes;
  }
  
  private getDefaultHandle(sourceNode: Node, targetNode: Node, type: 'source' | 'target'): string {
    const sourceBounds = this.nodeBounds.get(sourceNode.id)!;
    const targetBounds = this.nodeBounds.get(targetNode.id)!;
    
    const sx = sourceNode.position.x + sourceBounds.width / 2;
    const sy = sourceNode.position.y + sourceBounds.height / 2;
    const tx = targetNode.position.x + targetBounds.width / 2;
    const ty = targetNode.position.y + targetBounds.height / 2;
    
    const dx = tx - sx;
    const dy = ty - sy;
    
    if (type === 'source') {
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'right' : 'left';
      } else {
        return dy > 0 ? 'bottom' : 'top';
      }
    } else {
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'left' : 'right';
      } else {
        return dy > 0 ? 'top' : 'bottom';
      }
    }
  }
  
  private calculateSmartAvoidanceVector(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number },
    node: Node,
    allNodes: Node[]
  ): { x: number; y: number } {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    
    // Find closest point on line to rectangle center
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    
    if (lineLength < 0.01) return { x: 0, y: 0 };
    
    const t = Math.max(0, Math.min(1, ((centerX - p1.x) * dx + (centerY - p1.y) * dy) / (dx * dx + dy * dy)));
    
    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;
    
    // Calculate base push vector
    let pushX = centerX - closestX;
    let pushY = centerY - closestY;
    const pushDist = Math.sqrt(pushX * pushX + pushY * pushY);
    
    if (pushDist < 0.01) {
      // If node center is on the line, push perpendicular to line
      pushX = -dy / lineLength;
      pushY = dx / lineLength;
    } else {
      pushX /= pushDist;
      pushY /= pushDist;
    }
    
    // Check if push direction would cause collision with other nodes
    const testX = node.position.x + pushX * this.options.edgeBuffer;
    const testY = node.position.y + pushY * this.options.edgeBuffer;
    
    let collision = false;
    const nodeBounds = this.nodeBounds.get(node.id)!;
    
    allNodes.forEach(other => {
      if (other.id === node.id || other.type === 'frame') return;
      
      const otherBounds = this.nodeBounds.get(other.id)!;
      const otherRect = {
        x: other.position.x,
        y: other.position.y,
        width: otherBounds.width,
        height: otherBounds.height
      };
      
      const testRect = {
        x: testX,
        y: testY,
        width: nodeBounds.width,
        height: nodeBounds.height
      };
      
      const overlap = this.getOverlapRect(testRect, otherRect);
      if (overlap.x > 0 && overlap.y > 0) {
        collision = true;
      }
    });
    
    // If collision would occur, try alternative direction
    if (collision) {
      // Try perpendicular direction
      const altX = -pushY;
      const altY = pushX;
      
      const altTestX = node.position.x + altX * this.options.edgeBuffer;
      const altTestY = node.position.y + altY * this.options.edgeBuffer;
      
      let altCollision = false;
      allNodes.forEach(other => {
        if (other.id === node.id || other.type === 'frame') return;
        
        const otherBounds = this.nodeBounds.get(other.id)!;
        const otherRect = {
          x: other.position.x,
          y: other.position.y,
          width: otherBounds.width,
          height: otherBounds.height
        };
        
        const testRect = {
          x: altTestX,
          y: altTestY,
          width: nodeBounds.width,
          height: nodeBounds.height
        };
        
        const overlap = this.getOverlapRect(testRect, otherRect);
        if (overlap.x > 0 && overlap.y > 0) {
          altCollision = true;
        }
      });
      
      if (!altCollision) {
        pushX = altX;
        pushY = altY;
      }
    }
    
    // Scale the push vector
    const scale = this.options.edgeBuffer * 1.5;
    
    return {
      x: pushX * scale,
      y: pushY * scale
    };
  }

  private lineIntersectsRect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
  ): boolean {
    // Check if line segment intersects rectangle
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    // Check if both points are on same side of rectangle
    if ((p1.x < left && p2.x < left) || (p1.x > right && p2.x > right)) return false;
    if ((p1.y < top && p2.y < top) || (p1.y > bottom && p2.y > bottom)) return false;
    
    // Check if either point is inside rectangle
    if (p1.x >= left && p1.x <= right && p1.y >= top && p1.y <= bottom) return true;
    if (p2.x >= left && p2.x <= right && p2.y >= top && p2.y <= bottom) return true;
    
    // Check line intersections with rectangle edges
    const corners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
    
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 4];
      if (this.linesIntersect(p1, p2, c1, c2)) return true;
    }
    
    return false;
  }

  // Removed in favor of calculateSmartAvoidanceVector

  private autoSizeFrames(nodes: Node[]): Node[] {
    const frames = nodes.filter(n => n.type === 'frame');
    const regularNodes = nodes.filter(n => n.type !== 'frame');
    
    const updatedFrames = frames.map(frame => {
      // ALWAYS use original contents, never change what's in/out
      const originalContainedIds = this.originalFrameContents.get(frame.id) || new Set();
      
      if (originalContainedIds.size === 0) return frame;
      
      // Calculate bounding box for 100% enclosure
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      let hasValidNodes = false;
      
      // Only include nodes that were ORIGINALLY in the frame
      originalContainedIds.forEach(nodeId => {
        const node = regularNodes.find(n => n.id === nodeId);
        if (!node) return;
        
        hasValidNodes = true;
        const bounds = this.nodeBounds.get(nodeId)!;
        
        // Ensure 100% enclosure with generous margins
        minX = Math.min(minX, node.position.x - 10);
        minY = Math.min(minY, node.position.y - 10);
        maxX = Math.max(maxX, node.position.x + bounds.width + 10);
        maxY = Math.max(maxY, node.position.y + bounds.height + 10);
      });
      
      if (!hasValidNodes) return frame;
      
      // Add proper padding for visual clarity
      const padding = 60; // Generous padding for 100% guarantee
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      
      return {
        ...frame,
        position: { x: minX, y: minY },
        width: maxX - minX,
        height: maxY - minY,
        style: {
          ...frame.style,
          width: maxX - minX,
          height: maxY - minY,
        },
        data: {
          ...frame.data,
          containedNodes: Array.from(originalContainedIds), // Store for next run
        },
      };
    });
    
    return [...regularNodes, ...updatedFrames];
  }
  
  private createDeterministicRandom(): () => number {
    // Simple deterministic random number generator for consistent results
    let seed = this.randomSeed;
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private centerLayout(nodes: Node[]): Node[] {
    // Calculate current bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      if (node.type === 'frame') return;
      const bounds = this.nodeBounds.get(node.id)!;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + bounds.width);
      maxY = Math.max(maxY, node.position.y + bounds.height);
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Center around origin
    return nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x - centerX,
        y: node.position.y - centerY,
      },
    }));
  }
  
  private getNodeDimensions(node: Node): { width: number; height: number } {
    // Type-specific dimensions for better spacing
    if (node.width && node.height) {
      return { width: node.width, height: node.height };
    }
    
    switch (node.type) {
      case 'frame':
        return { width: 400, height: 300 };
      case 'decision':
        // Decision nodes are diamond-shaped, need more space
        return { width: 120, height: 120 };
      case 'start':
      case 'end':
        // Circular nodes
        return { width: 60, height: 60 };
      case 'condition':
        return { width: 160, height: 80 };
      case 'action':
        return { width: 140, height: 70 };
      case 'note':
        return { width: 200, height: 100 };
      case 'subflow':
        return { width: 180, height: 90 };
      case 'screen':
      case 'enhanced-screen':
        return { width: 200, height: 120 };
      default:
        return { width: 180, height: 80 };
    }
  }
  
  private getNodeSpacingMultiplier(node: Node): number {
    // Different node types need different spacing
    switch (node.type) {
      case 'decision':
        return 1.4; // Diamond shape needs more space
      case 'frame':
        return 0.8; // Frames can be closer to other elements
      case 'start':
      case 'end':
        return 1.2; // Give terminal nodes some breathing room
      case 'note':
        return 0.9; // Notes can be slightly closer
      default:
        return 1.0;
    }
  }
  
  private calculateNodePairSpacing(node1: Node, node2: Node): number {
    // Calculate optimal spacing between two specific nodes
    const mult1 = this.getNodeSpacingMultiplier(node1);
    const mult2 = this.getNodeSpacingMultiplier(node2);
    const avgMultiplier = (mult1 + mult2) / 2;
    
    // Check if nodes are connected
    const areConnected = this.edges.some(edge => 
      (edge.source === node1.id && edge.target === node2.id) ||
      (edge.source === node2.id && edge.target === node1.id)
    );
    
    // Connected nodes can be slightly closer
    const connectionFactor = areConnected ? 0.9 : 1.0;
    
    return this.options.optimalNodeSpacing * avgMultiplier * connectionFactor;
  }

  // Enhanced collision detection methods for 100% accuracy
  private enforceStrictFrameBoundaries(nodes: Node[]): Node[] {
    const adjustedNodes = [...nodes];
    const frames = adjustedNodes.filter(n => n.type === 'frame');
    const nonFrameNodes = adjustedNodes.filter(n => n.type !== 'frame');
    
    nonFrameNodes.forEach(node => {
      if (node.data?.isPinned) return;
      
      const nodeBounds = this.nodeBounds.get(node.id)!;
      let shouldBeInFrame: string | null = null;
      
      // Check if node should be in a frame
      this.originalFrameContents.forEach((contents, frameId) => {
        if (contents.has(node.id)) {
          shouldBeInFrame = frameId;
        }
      });
      
      if (shouldBeInFrame) {
        // Ensure node is FULLY inside its frame
        const frame = frames.find(f => f.id === shouldBeInFrame);
        if (frame) {
          const frameBounds = this.nodeBounds.get(frame.id)!;
          const buffer = 30;
          
          // Strict containment
          node.position.x = Math.max(
            frame.position.x + buffer,
            Math.min(node.position.x, frame.position.x + frameBounds.width - nodeBounds.width - buffer)
          );
          node.position.y = Math.max(
            frame.position.y + buffer,
            Math.min(node.position.y, frame.position.y + frameBounds.height - nodeBounds.height - buffer)
          );
        }
      } else {
        // Ensure node has NO overlap with ANY frame
        frames.forEach(frame => {
          const frameBounds = this.nodeBounds.get(frame.id)!;
          const frameBuffer = 20; // Minimum distance from frame
          
          const frameRect = {
            x: frame.position.x - frameBuffer,
            y: frame.position.y - frameBuffer,
            width: frameBounds.width + 2 * frameBuffer,
            height: frameBounds.height + 2 * frameBuffer
          };
          
          const nodeRect = {
            x: node.position.x,
            y: node.position.y,
            width: nodeBounds.width,
            height: nodeBounds.height
          };
          
          // Check for ANY overlap
          const overlapX = Math.max(0, Math.min(nodeRect.x + nodeRect.width, frameRect.x + frameRect.width) - Math.max(nodeRect.x, frameRect.x));
          const overlapY = Math.max(0, Math.min(nodeRect.y + nodeRect.height, frameRect.y + frameRect.height) - Math.max(nodeRect.y, frameRect.y));
          
          if (overlapX > 0 && overlapY > 0) {
            // Push node completely outside frame
            const pushLeft = frameRect.x - nodeRect.width - 5;
            const pushRight = frameRect.x + frameRect.width + 5;
            const pushTop = frameRect.y - nodeRect.height - 5;
            const pushBottom = frameRect.y + frameRect.height + 5;
            
            // Choose closest edge to push to
            const distances = [
              { x: pushLeft, y: node.position.y, dist: Math.abs(node.position.x - pushLeft) },
              { x: pushRight, y: node.position.y, dist: Math.abs(node.position.x - pushRight) },
              { x: node.position.x, y: pushTop, dist: Math.abs(node.position.y - pushTop) },
              { x: node.position.x, y: pushBottom, dist: Math.abs(node.position.y - pushBottom) }
            ];
            
            const closest = distances.reduce((min, curr) => curr.dist < min.dist ? curr : min);
            node.position.x = closest.x;
            node.position.y = closest.y;
          }
        });
      }
    });
    
    return adjustedNodes;
  }

  private preventEdgeBoundaryTouch(nodes: Node[], edges: Edge[]): Node[] {
    // Ensure edges don't run along node boundaries
    const adjustedNodes = [...nodes];
    const edgeBuffer = 8; // Minimum distance from edge to node boundary
    
    edges.forEach(edge => {
      const sourceNode = adjustedNodes.find(n => n.id === edge.source);
      const targetNode = adjustedNodes.find(n => n.id === edge.target);
      
      if (!sourceNode || !targetNode) return;
      
      const sourceBounds = this.nodeBounds.get(edge.source)!;
      const targetBounds = this.nodeBounds.get(edge.target)!;
      
      // Get edge path points
      const sourcePoint = this.getHandlePoint({
        ...sourceBounds,
        x: sourceNode.position.x,
        y: sourceNode.position.y,
        centerX: sourceNode.position.x + sourceBounds.width / 2,
        centerY: sourceNode.position.y + sourceBounds.height / 2
      }, edge.sourceHandle || 'right');
      
      const targetPoint = this.getHandlePoint({
        ...targetBounds,
        x: targetNode.position.x,
        y: targetNode.position.y,
        centerX: targetNode.position.x + targetBounds.width / 2,
        centerY: targetNode.position.y + targetBounds.height / 2
      }, edge.targetHandle || 'left');
      
      // Check all other nodes for boundary proximity
      adjustedNodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;
        if (node.type === 'frame' || node.data?.isPinned) return;
        
        const nodeBounds = this.nodeBounds.get(node.id)!;
        const nodeRect = {
          x: node.position.x - edgeBuffer,
          y: node.position.y - edgeBuffer,
          width: nodeBounds.width + 2 * edgeBuffer,
          height: nodeBounds.height + 2 * edgeBuffer
        };
        
        // Check if edge is too close to node boundary
        const distance = this.getLineToRectDistance(sourcePoint, targetPoint, nodeRect);
        
        if (distance < edgeBuffer) {
          // Calculate push direction perpendicular to edge
          const edgeDx = targetPoint.x - sourcePoint.x;
          const edgeDy = targetPoint.y - sourcePoint.y;
          const edgeLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
          
          if (edgeLength > 0) {
            // Perpendicular vector
            const perpX = -edgeDy / edgeLength;
            const perpY = edgeDx / edgeLength;
            
            // Push node away from edge
            const pushDistance = edgeBuffer - distance + 5;
            node.position.x += perpX * pushDistance;
            node.position.y += perpY * pushDistance;
          }
        }
      });
    });
    
    return adjustedNodes;
  }

  private constrainNodeMovementStrict(
    node: Node,
    moveX: number,
    moveY: number,
    allNodes: Node[]
  ): { x: number, y: number } {
    const bounds = this.nodeBounds.get(node.id)!;
    let finalX = node.position.x + moveX;
    let finalY = node.position.y + moveY;
    
    // Check frame membership
    let nodeFrameId: string | null = null;
    this.originalFrameContents.forEach((contents, frameId) => {
      if (contents.has(node.id)) {
        nodeFrameId = frameId;
      }
    });
    
    if (nodeFrameId) {
      // Strict containment within frame
      const frame = allNodes.find(n => n.id === nodeFrameId && n.type === 'frame');
      if (frame) {
        const frameBounds = this.nodeBounds.get(nodeFrameId)!;
        const padding = 25;
        
        finalX = Math.max(
          frame.position.x + padding,
          Math.min(finalX, frame.position.x + frameBounds.width - bounds.width - padding)
        );
        finalY = Math.max(
          frame.position.y + padding,
          Math.min(finalY, frame.position.y + frameBounds.height - bounds.height - padding)
        );
      }
    } else {
      // Strict exclusion from all frames
      const frames = allNodes.filter(n => n.type === 'frame');
      
      frames.forEach(frame => {
        const frameBounds = this.nodeBounds.get(frame.id)!;
        const buffer = 15;
        
        const frameRect = {
          x: frame.position.x - buffer,
          y: frame.position.y - buffer,
          width: frameBounds.width + 2 * buffer,
          height: frameBounds.height + 2 * buffer
        };
        
        const nodeRect = {
          x: finalX,
          y: finalY,
          width: bounds.width,
          height: bounds.height
        };
        
        // Check overlap
        const overlapX = Math.max(0, Math.min(nodeRect.x + nodeRect.width, frameRect.x + frameRect.width) - Math.max(nodeRect.x, frameRect.x));
        const overlapY = Math.max(0, Math.min(nodeRect.y + nodeRect.height, frameRect.y + frameRect.height) - Math.max(nodeRect.y, frameRect.y));
        
        if (overlapX > 0 && overlapY > 0) {
          // Prevent movement that would cause overlap
          if (Math.abs(moveX) > Math.abs(moveY)) {
            // Horizontal movement blocked
            finalX = node.position.x;
          } else {
            // Vertical movement blocked
            finalY = node.position.y;
          }
        }
      });
    }
    
    return { x: finalX, y: finalY };
  }

  private calculatePrioritizedAdjustments(
    collisions: Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number }, severity: number }>,
    nodes: Node[]
  ): Map<string, { x: number, y: number }> {
    const adjustments = new Map<string, { x: number, y: number, weight: number }>();
    
    // Group by node and weight by severity
    collisions.forEach(collision => {
      const current = adjustments.get(collision.nodeId) || { x: 0, y: 0, weight: 0 };
      const weight = collision.severity;
      
      current.x = (current.x * current.weight + collision.adjustment.x * weight) / (current.weight + weight);
      current.y = (current.y * current.weight + collision.adjustment.y * weight) / (current.weight + weight);
      current.weight += weight;
      
      adjustments.set(collision.nodeId, current);
    });
    
    // Convert to final adjustments
    const finalAdjustments = new Map<string, { x: number, y: number }>();
    adjustments.forEach((adj, nodeId) => {
      // Scale adjustments based on node type
      const node = nodes.find(n => n.id === nodeId);
      let scale = 0.6; // Default conservative adjustment
      
      if (node) {
        if (node.type === 'note') scale = 0.8; // Notes can move more freely
        if (node.type === 'decision') scale = 0.5; // Decisions move less
        if (node.data?.isPinned) scale = 0; // Pinned nodes don't move
      }
      
      finalAdjustments.set(nodeId, {
        x: adj.x * scale,
        y: adj.y * scale
      });
    });
    
    return finalAdjustments;
  }

  private resolveStubornCollisions(
    nodes: Node[],
    edges: Edge[],
    collisions: Array<{ nodeId: string, edgeId: string, adjustment: { x: number, y: number }, severity: number }>
  ): Node[] {
    // Alternative resolution for persistent collisions
    const adjustedNodes = [...nodes];
    
    // Try rerouting edges instead of moving nodes
    collisions.forEach(collision => {
      const node = adjustedNodes.find(n => n.id === collision.nodeId);
      const edge = edges.find(e => e.id === collision.edgeId);
      
      if (!node || !edge || node.data?.isPinned) return;
      
      // Apply stronger adjustment in perpendicular direction
      const adjustment = {
        x: collision.adjustment.x * 1.5,
        y: collision.adjustment.y * 1.5
      };
      
      // Ensure movement respects constraints
      const constrained = this.constrainNodeMovementStrict(node, adjustment.x, adjustment.y, adjustedNodes);
      node.position.x = constrained.x;
      node.position.y = constrained.y;
    });
    
    return adjustedNodes;
  }

  private optimizeEdgesWithCollisionAvoidance(nodes: Node[], edges: Edge[]): Edge[] {
    // Final edge optimization considering collision avoidance
    // Simply use the existing optimizeAllEdgeHandles method which is already sophisticated
    return this.optimizeAllEdgeHandles(nodes);
  }

  private checkEdgeAlongBoundary(
    p1: { x: number, y: number },
    p2: { x: number, y: number },
    rect: { x: number, y: number, width: number, height: number }
  ): boolean {
    const threshold = 3; // Consider edge along boundary if within 3 pixels
    
    // Check if edge runs along any of the four boundaries
    const alongLeft = Math.abs(p1.x - rect.x) < threshold && Math.abs(p2.x - rect.x) < threshold &&
                      ((p1.y >= rect.y && p1.y <= rect.y + rect.height) || (p2.y >= rect.y && p2.y <= rect.y + rect.height));
    
    const alongRight = Math.abs(p1.x - (rect.x + rect.width)) < threshold && Math.abs(p2.x - (rect.x + rect.width)) < threshold &&
                       ((p1.y >= rect.y && p1.y <= rect.y + rect.height) || (p2.y >= rect.y && p2.y <= rect.y + rect.height));
    
    const alongTop = Math.abs(p1.y - rect.y) < threshold && Math.abs(p2.y - rect.y) < threshold &&
                     ((p1.x >= rect.x && p1.x <= rect.x + rect.width) || (p2.x >= rect.x && p2.x <= rect.x + rect.width));
    
    const alongBottom = Math.abs(p1.y - (rect.y + rect.height)) < threshold && Math.abs(p2.y - (rect.y + rect.height)) < threshold &&
                        ((p1.x >= rect.x && p1.x <= rect.x + rect.width) || (p2.x >= rect.x && p2.x <= rect.x + rect.width));
    
    return alongLeft || alongRight || alongTop || alongBottom;
  }
}

// Main export
export const applyGeniusLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } => {
  const layout = new GeniusAutoLayout(nodes, edges, options);
  return layout.execute();
};