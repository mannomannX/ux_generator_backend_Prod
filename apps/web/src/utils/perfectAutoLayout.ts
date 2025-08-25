import dagre from 'dagre';
import { Node, Edge, Position } from 'reactflow';

/**
 * Perfect Auto-Layout Algorithm
 * 
 * Core Principles:
 * 1. Minimize edge crossings
 * 2. Optimize handle selection for shortest, clearest paths
 * 3. Respect frame boundaries and auto-size frames
 * 4. Create visually pleasing, predictable layouts
 * 5. Maintain semantic flow direction
 */

export type LayoutMode = 'vertical' | 'horizontal' | 'compact' | 'tree' | 'radial' | 'force' | 'smart';

interface LayoutOptions {
  mode?: LayoutMode;
  nodeSpacing?: number;
  rankSpacing?: number;
  edgeSpacing?: number;
  animate?: boolean;
  respectPinned?: boolean;
  preventOverlap?: boolean;
  centerLayout?: boolean;
  alignmentGridSize?: number;
}

interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EdgeRoute {
  sourceHandle: string;
  targetHandle: string;
  points?: { x: number; y: number }[];
  crossings: number;
  length: number;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

const defaultOptions: Required<LayoutOptions> = {
  mode: 'smart',
  nodeSpacing: 100,
  rankSpacing: 150,
  edgeSpacing: 20,
  animate: true,
  respectPinned: true,
  preventOverlap: true,
  centerLayout: true,
  alignmentGridSize: 10,
};

export class PerfectAutoLayout {
  private nodes: Node[];
  private edges: Edge[];
  private options: Required<LayoutOptions>;
  private nodeMap: Map<string, Node>;
  private edgeMap: Map<string, Edge>;
  private nodeBounds: Map<string, NodeBounds>;
  private frameHierarchy: Map<string, string[]>;

  constructor(nodes: Node[], edges: Edge[], options: LayoutOptions = {}) {
    this.nodes = nodes;
    this.edges = edges;
    this.options = { ...defaultOptions, ...options };
    this.nodeMap = new Map(nodes.map(n => [n.id, n]));
    this.edgeMap = new Map(edges.map(e => [e.id, e]));
    this.nodeBounds = new Map();
    this.frameHierarchy = new Map();
    this.initializeBounds();
    this.buildFrameHierarchy();
  }

  /**
   * Initialize node bounds
   */
  private initializeBounds(): void {
    this.nodes.forEach(node => {
      this.nodeBounds.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.width || (node.type === 'frame' ? 400 : 180),
        height: node.height || (node.type === 'frame' ? 300 : 80),
      });
    });
  }

  /**
   * Build frame hierarchy
   */
  private buildFrameHierarchy(): void {
    const frameNodes = this.nodes.filter(n => n.type === 'frame');
    
    frameNodes.forEach(frame => {
      const containedNodes: string[] = [];
      const frameBounds = this.nodeBounds.get(frame.id)!;
      
      this.nodes.forEach(node => {
        if (node.id === frame.id || node.type === 'frame') return;
        
        const nodeBounds = this.nodeBounds.get(node.id)!;
        if (this.isNodeInFrame(nodeBounds, frameBounds)) {
          containedNodes.push(node.id);
        }
      });
      
      this.frameHierarchy.set(frame.id, containedNodes);
    });
  }

  /**
   * Check if node is inside frame bounds
   */
  private isNodeInFrame(node: NodeBounds, frame: NodeBounds): boolean {
    return node.x >= frame.x &&
           node.y >= frame.y &&
           node.x + node.width <= frame.x + frame.width &&
           node.y + node.height <= frame.y + frame.height;
  }

  /**
   * Main layout execution
   */
  public execute(): LayoutResult {
    // Choose layout mode
    const mode = this.options.mode === 'smart' 
      ? this.determineOptimalMode() 
      : this.options.mode;

    // Apply base layout
    let layoutedNodes = this.applyLayoutMode(mode);

    // Optimize edge routing
    const optimizedEdges = this.optimizeEdgeRouting(layoutedNodes);

    // Minimize edge crossings
    layoutedNodes = this.minimizeEdgeCrossings(layoutedNodes, optimizedEdges);

    // Auto-size frames
    layoutedNodes = this.autoSizeFrames(layoutedNodes);

    // Apply grid alignment
    if (this.options.alignmentGridSize > 0) {
      layoutedNodes = this.alignToGrid(layoutedNodes);
    }

    // Center layout if requested
    if (this.options.centerLayout) {
      layoutedNodes = this.centerLayout(layoutedNodes);
    }

    // Calculate bounds
    const bounds = this.calculateBounds(layoutedNodes);

    return {
      nodes: layoutedNodes,
      edges: optimizedEdges,
      bounds,
    };
  }

  /**
   * Determine optimal layout mode based on graph structure
   */
  private determineOptimalMode(): LayoutMode {
    const nodeCount = this.nodes.length;
    const edgeCount = this.edges.length;
    const density = edgeCount / (nodeCount * (nodeCount - 1) / 2);
    
    // Check for tree structure
    if (this.isTreeStructure()) {
      return 'tree';
    }
    
    // Check for linear flow
    if (this.isLinearFlow()) {
      const aspectRatio = this.calculateAspectRatio();
      return aspectRatio > 1.5 ? 'horizontal' : 'vertical';
    }
    
    // Dense graphs benefit from force-directed
    if (density > 0.3) {
      return 'force';
    }
    
    // Sparse graphs with clusters benefit from radial
    if (this.hasClusters()) {
      return 'radial';
    }
    
    // Default to vertical for most workflows
    return 'vertical';
  }

  /**
   * Apply the selected layout mode
   */
  private applyLayoutMode(mode: LayoutMode): Node[] {
    switch (mode) {
      case 'vertical':
        return this.applyHierarchicalLayout('TB');
      case 'horizontal':
        return this.applyHierarchicalLayout('LR');
      case 'tree':
        return this.applyTreeLayout();
      case 'radial':
        return this.applyRadialLayout();
      case 'force':
        return this.applyForceDirectedLayout();
      case 'compact':
        return this.applyCompactLayout();
      default:
        return this.applyHierarchicalLayout('TB');
    }
  }

  /**
   * Apply hierarchical layout using Dagre
   */
  private applyHierarchicalLayout(direction: 'TB' | 'LR' | 'BT' | 'RL'): Node[] {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    
    // Configure dagre with better spacing
    g.setGraph({
      rankdir: direction,
      nodesep: this.options.nodeSpacing,
      ranksep: this.options.rankSpacing,
      edgesep: this.options.edgeSpacing,
      marginx: 50,
      marginy: 50,
      align: 'UL', // Align to upper-left for consistency
      ranker: 'tight-tree', // Better for workflows
    });
    
    // Add nodes (excluding frames initially)
    const layoutNodes = this.nodes.filter(n => n.type !== 'frame');
    layoutNodes.forEach(node => {
      const bounds = this.nodeBounds.get(node.id)!;
      g.setNode(node.id, {
        width: bounds.width,
        height: bounds.height,
        // Keep pinned nodes in place
        ...(node.data?.isPinned ? { x: bounds.x, y: bounds.y, fixed: true } : {}),
      });
    });
    
    // Add edges with weights for better layout
    this.edges.forEach(edge => {
      if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
        g.setEdge(edge.source, edge.target, {
          weight: this.calculateEdgeWeight(edge),
          minlen: this.calculateMinLength(edge),
        });
      }
    });
    
    // Run layout
    dagre.layout(g);
    
    // Apply positions
    return this.nodes.map(node => {
      if (node.type === 'frame') {
        return node; // Handle frames separately
      }
      
      if (node.data?.isPinned) {
        return node; // Keep pinned nodes
      }
      
      const nodeData = g.node(node.id);
      if (!nodeData) return node;
      
      const bounds = this.nodeBounds.get(node.id)!;
      return {
        ...node,
        position: {
          x: nodeData.x - bounds.width / 2,
          y: nodeData.y - bounds.height / 2,
        },
      };
    });
  }

  /**
   * Apply tree layout for hierarchical structures
   */
  private applyTreeLayout(): Node[] {
    // Find root nodes
    const roots = this.findRootNodes();
    if (roots.length === 0) {
      return this.applyHierarchicalLayout('TB');
    }
    
    const levels = this.calculateNodeLevels(roots);
    const layoutNodes: Node[] = [];
    
    // Layout each level
    const levelGroups = new Map<number, Node[]>();
    levels.forEach((level, nodeId) => {
      const node = this.nodeMap.get(nodeId)!;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level)!.push(node);
    });
    
    // Position nodes level by level
    let currentY = 0;
    Array.from(levelGroups.keys()).sort().forEach(level => {
      const nodesInLevel = levelGroups.get(level)!;
      const totalWidth = nodesInLevel.reduce((sum, node) => {
        const bounds = this.nodeBounds.get(node.id)!;
        return sum + bounds.width + this.options.nodeSpacing;
      }, 0);
      
      let currentX = -totalWidth / 2;
      nodesInLevel.forEach(node => {
        const bounds = this.nodeBounds.get(node.id)!;
        layoutNodes.push({
          ...node,
          position: {
            x: currentX,
            y: currentY,
          },
        });
        currentX += bounds.width + this.options.nodeSpacing;
      });
      
      currentY += this.options.rankSpacing;
    });
    
    return layoutNodes;
  }

  /**
   * Apply radial layout for network-like structures
   */
  private applyRadialLayout(): Node[] {
    const center = { x: 0, y: 0 };
    const levels = this.calculateRadialLevels();
    const layoutNodes: Node[] = [];
    
    levels.forEach((level, nodeId) => {
      const node = this.nodeMap.get(nodeId)!;
      const angle = this.calculateRadialAngle(nodeId, level);
      const radius = level * this.options.rankSpacing;
      
      layoutNodes.push({
        ...node,
        position: {
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius,
        },
      });
    });
    
    return layoutNodes;
  }

  /**
   * Apply force-directed layout for complex networks
   */
  private applyForceDirectedLayout(): Node[] {
    // Simple force simulation
    const iterations = 100;
    const positions = new Map<string, { x: number; y: number }>();
    
    // Initialize positions
    this.nodes.forEach(node => {
      positions.set(node.id, { ...node.position });
    });
    
    // Run simulation
    for (let i = 0; i < iterations; i++) {
      // Calculate repulsive forces between all nodes
      this.nodes.forEach(node1 => {
        if (node1.data?.isPinned) return;
        
        const pos1 = positions.get(node1.id)!;
        const force = { x: 0, y: 0 };
        
        this.nodes.forEach(node2 => {
          if (node1.id === node2.id) return;
          
          const pos2 = positions.get(node2.id)!;
          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Repulsive force
          const repulsion = 10000 / (distance * distance);
          force.x += (dx / distance) * repulsion;
          force.y += (dy / distance) * repulsion;
        });
        
        // Apply attractive forces along edges
        this.edges.forEach(edge => {
          if (edge.source === node1.id || edge.target === node1.id) {
            const otherId = edge.source === node1.id ? edge.target : edge.source;
            const pos2 = positions.get(otherId)!;
            const dx = pos2.x - pos1.x;
            const dy = pos2.y - pos1.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            
            // Attractive force
            const attraction = distance / 100;
            force.x += (dx / distance) * attraction;
            force.y += (dy / distance) * attraction;
          }
        });
        
        // Apply forces with damping
        const damping = 0.1;
        pos1.x += force.x * damping;
        pos1.y += force.y * damping;
      });
    }
    
    // Apply final positions
    return this.nodes.map(node => ({
      ...node,
      position: positions.get(node.id)!,
    }));
  }

  /**
   * Apply compact layout to minimize space
   */
  private applyCompactLayout(): Node[] {
    // Use hierarchical with tighter spacing
    const originalSpacing = this.options.nodeSpacing;
    const originalRankSpacing = this.options.rankSpacing;
    
    this.options.nodeSpacing = originalSpacing * 0.6;
    this.options.rankSpacing = originalRankSpacing * 0.6;
    
    const result = this.applyHierarchicalLayout('TB');
    
    this.options.nodeSpacing = originalSpacing;
    this.options.rankSpacing = originalRankSpacing;
    
    return result;
  }

  /**
   * Optimize edge routing to minimize crossings and use best handles
   */
  private optimizeEdgeRouting(nodes: Node[]): Edge[] {
    const nodePositions = new Map<string, NodeBounds>();
    nodes.forEach(node => {
      nodePositions.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: this.nodeBounds.get(node.id)?.width || 180,
        height: this.nodeBounds.get(node.id)?.height || 80,
      });
    });
    
    return this.edges.map(edge => {
      const sourceBounds = nodePositions.get(edge.source);
      const targetBounds = nodePositions.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return edge;
      
      // Find optimal handle combination
      const bestRoute = this.findBestHandleCombination(
        sourceBounds,
        targetBounds,
        edge
      );
      
      return {
        ...edge,
        sourceHandle: bestRoute.sourceHandle,
        targetHandle: bestRoute.targetHandle,
        data: {
          ...edge.data,
          sourceHandle: bestRoute.sourceHandle,
          targetHandle: bestRoute.targetHandle,
        },
      };
    });
  }

  /**
   * Find the best handle combination for an edge
   */
  private findBestHandleCombination(
    source: NodeBounds,
    target: NodeBounds,
    edge: Edge
  ): EdgeRoute {
    const handles = ['top', 'right', 'bottom', 'left'];
    let bestRoute: EdgeRoute = {
      sourceHandle: 'right',
      targetHandle: 'left',
      crossings: Infinity,
      length: Infinity,
    };
    
    // Try all combinations
    handles.forEach(sourceHandle => {
      handles.forEach(targetHandle => {
        const sourcePoint = this.getHandlePosition(source, sourceHandle);
        const targetPoint = this.getHandlePosition(target, targetHandle);
        
        // Calculate path length
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Count crossings with other edges
        const crossings = this.countEdgeCrossings(
          sourcePoint,
          targetPoint,
          edge.id
        );
        
        // Calculate score (lower is better)
        const score = crossings * 1000 + length;
        
        if (score < bestRoute.crossings * 1000 + bestRoute.length) {
          bestRoute = {
            sourceHandle,
            targetHandle,
            crossings,
            length,
          };
        }
      });
    });
    
    return bestRoute;
  }

  /**
   * Get handle position for a node
   */
  private getHandlePosition(bounds: NodeBounds, handle: string): { x: number; y: number } {
    switch (handle) {
      case 'top':
        return { x: bounds.x + bounds.width / 2, y: bounds.y };
      case 'right':
        return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
      case 'bottom':
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
      case 'left':
        return { x: bounds.x, y: bounds.y + bounds.height / 2 };
      default:
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    }
  }

  /**
   * Count edge crossings for a potential edge path
   */
  private countEdgeCrossings(
    start: { x: number; y: number },
    end: { x: number; y: number },
    excludeEdgeId: string
  ): number {
    let crossings = 0;
    
    this.edges.forEach(edge => {
      if (edge.id === excludeEdgeId) return;
      
      const sourceBounds = this.nodeBounds.get(edge.source);
      const targetBounds = this.nodeBounds.get(edge.target);
      
      if (!sourceBounds || !targetBounds) return;
      
      const edgeStart = this.getHandlePosition(sourceBounds, edge.sourceHandle || 'right');
      const edgeEnd = this.getHandlePosition(targetBounds, edge.targetHandle || 'left');
      
      if (this.doLinesIntersect(start, end, edgeStart, edgeEnd)) {
        crossings++;
      }
    });
    
    return crossings;
  }

  /**
   * Check if two line segments intersect
   */
  private doLinesIntersect(
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

  /**
   * Minimize edge crossings by adjusting node positions
   */
  private minimizeEdgeCrossings(nodes: Node[], edges: Edge[]): Node[] {
    // Use barycentric method to reduce crossings
    const iterations = 5;
    let currentNodes = [...nodes];
    
    for (let i = 0; i < iterations; i++) {
      currentNodes = currentNodes.map(node => {
        if (node.data?.isPinned || node.type === 'frame') return node;
        
        // Calculate barycenter position based on connected nodes
        const connectedNodes: Node[] = [];
        edges.forEach(edge => {
          if (edge.source === node.id) {
            const target = currentNodes.find(n => n.id === edge.target);
            if (target) connectedNodes.push(target);
          }
          if (edge.target === node.id) {
            const source = currentNodes.find(n => n.id === edge.source);
            if (source) connectedNodes.push(source);
          }
        });
        
        if (connectedNodes.length === 0) return node;
        
        // Calculate average position
        const avgX = connectedNodes.reduce((sum, n) => sum + n.position.x, 0) / connectedNodes.length;
        const avgY = connectedNodes.reduce((sum, n) => sum + n.position.y, 0) / connectedNodes.length;
        
        // Move slightly towards barycenter
        const factor = 0.3;
        return {
          ...node,
          position: {
            x: node.position.x + (avgX - node.position.x) * factor,
            y: node.position.y + (avgY - node.position.y) * factor,
          },
        };
      });
    }
    
    return currentNodes;
  }

  /**
   * Auto-size frames to contain their nodes
   */
  private autoSizeFrames(nodes: Node[]): Node[] {
    const frameNodes = nodes.filter(n => n.type === 'frame');
    const regularNodes = nodes.filter(n => n.type !== 'frame');
    
    const updatedFrames = frameNodes.map(frame => {
      const containedNodeIds = this.frameHierarchy.get(frame.id) || [];
      if (containedNodeIds.length === 0) return frame;
      
      // Calculate bounding box of contained nodes
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      containedNodeIds.forEach(nodeId => {
        const node = regularNodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const bounds = this.nodeBounds.get(nodeId)!;
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + bounds.width);
        maxY = Math.max(maxY, node.position.y + bounds.height);
      });
      
      // Add padding
      const padding = 30;
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
      };
    });
    
    return [...regularNodes, ...updatedFrames];
  }

  /**
   * Align nodes to grid
   */
  private alignToGrid(nodes: Node[]): Node[] {
    const gridSize = this.options.alignmentGridSize;
    
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

  /**
   * Center the layout
   */
  private centerLayout(nodes: Node[]): Node[] {
    const bounds = this.calculateBounds(nodes);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    
    return nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x - centerX,
        y: node.position.y - centerY,
      },
    }));
  }

  /**
   * Calculate layout bounds
   */
  private calculateBounds(nodes: Node[]): LayoutResult['bounds'] {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      const bounds = this.nodeBounds.get(node.id)!;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + bounds.width);
      maxY = Math.max(maxY, node.position.y + bounds.height);
    });
    
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // Helper methods for structure detection
  
  private isTreeStructure(): boolean {
    // Check if graph forms a tree (no cycles, n-1 edges for n nodes)
    const visited = new Set<string>();
    const hasCycle = (nodeId: string, parentId: string | null): boolean => {
      visited.add(nodeId);
      
      for (const edge of this.edges) {
        let nextId: string | null = null;
        if (edge.source === nodeId && edge.target !== parentId) {
          nextId = edge.target;
        } else if (edge.target === nodeId && edge.source !== parentId) {
          nextId = edge.source;
        }
        
        if (nextId) {
          if (visited.has(nextId)) return true;
          if (hasCycle(nextId, nodeId)) return true;
        }
      }
      
      return false;
    };
    
    if (this.nodes.length === 0) return false;
    const startNode = this.nodes[0].id;
    return !hasCycle(startNode, null) && visited.size === this.nodes.length;
  }

  private isLinearFlow(): boolean {
    // Check if most nodes have at most 1 in and 1 out edge
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    
    this.nodes.forEach(node => {
      inDegree.set(node.id, 0);
      outDegree.set(node.id, 0);
    });
    
    this.edges.forEach(edge => {
      outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });
    
    let linearCount = 0;
    this.nodes.forEach(node => {
      if ((inDegree.get(node.id) || 0) <= 1 && (outDegree.get(node.id) || 0) <= 1) {
        linearCount++;
      }
    });
    
    return linearCount >= this.nodes.length * 0.7;
  }

  private hasClusters(): boolean {
    // Simple clustering detection based on connectivity
    const components = this.findConnectedComponents();
    return components.length > 1 || this.hasHighlyConnectedSubgraphs();
  }

  private findConnectedComponents(): Node[][] {
    const visited = new Set<string>();
    const components: Node[][] = [];
    
    const dfs = (nodeId: string, component: Node[]) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = this.nodeMap.get(nodeId);
      if (node) component.push(node);
      
      this.edges.forEach(edge => {
        if (edge.source === nodeId) dfs(edge.target, component);
        if (edge.target === nodeId) dfs(edge.source, component);
      });
    };
    
    this.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const component: Node[] = [];
        dfs(node.id, component);
        if (component.length > 0) {
          components.push(component);
        }
      }
    });
    
    return components;
  }

  private hasHighlyConnectedSubgraphs(): boolean {
    // Check for subgraphs with high internal connectivity
    const threshold = 0.5;
    const components = this.findConnectedComponents();
    
    for (const component of components) {
      const nodeIds = new Set(component.map(n => n.id));
      const internalEdges = this.edges.filter(e => 
        nodeIds.has(e.source) && nodeIds.has(e.target)
      );
      
      const maxPossibleEdges = component.length * (component.length - 1) / 2;
      const density = internalEdges.length / maxPossibleEdges;
      
      if (density > threshold) return true;
    }
    
    return false;
  }

  private calculateAspectRatio(): number {
    const bounds = this.calculateBounds(this.nodes);
    return bounds.width / (bounds.height || 1);
  }

  private findRootNodes(): Node[] {
    const hasIncoming = new Set<string>();
    this.edges.forEach(edge => {
      hasIncoming.add(edge.target);
    });
    
    return this.nodes.filter(node => !hasIncoming.has(node.id));
  }

  private calculateNodeLevels(roots: Node[]): Map<string, number> {
    const levels = new Map<string, number>();
    const queue: { node: Node; level: number }[] = roots.map(r => ({ node: r, level: 0 }));
    
    while (queue.length > 0) {
      const { node, level } = queue.shift()!;
      
      if (levels.has(node.id)) continue;
      levels.set(node.id, level);
      
      this.edges.forEach(edge => {
        if (edge.source === node.id) {
          const target = this.nodeMap.get(edge.target);
          if (target && !levels.has(target.id)) {
            queue.push({ node: target, level: level + 1 });
          }
        }
      });
    }
    
    return levels;
  }

  private calculateRadialLevels(): Map<string, number> {
    // Find central node (highest degree)
    const degrees = new Map<string, number>();
    this.nodes.forEach(node => degrees.set(node.id, 0));
    
    this.edges.forEach(edge => {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    });
    
    const [centralNode] = Array.from(degrees.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    // BFS from central node
    const levels = new Map<string, number>();
    const queue = [{ id: centralNode, level: 0 }];
    
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (levels.has(id)) continue;
      levels.set(id, level);
      
      this.edges.forEach(edge => {
        const nextId = edge.source === id ? edge.target : 
                      edge.target === id ? edge.source : null;
        if (nextId && !levels.has(nextId)) {
          queue.push({ id: nextId, level: level + 1 });
        }
      });
    }
    
    return levels;
  }

  private calculateRadialAngle(nodeId: string, level: number): number {
    // Distribute nodes evenly around each level
    const nodesAtLevel = Array.from(this.calculateRadialLevels().entries())
      .filter(([_, l]) => l === level)
      .map(([id, _]) => id);
    
    const index = nodesAtLevel.indexOf(nodeId);
    return (index / nodesAtLevel.length) * Math.PI * 2;
  }

  private calculateEdgeWeight(edge: Edge): number {
    // Higher weight for edges that should be straighter/shorter
    // You can customize this based on edge types or other criteria
    return 1;
  }

  private calculateMinLength(edge: Edge): number {
    // Minimum edge length in ranks
    return 1;
  }
}

/**
 * Main export function
 */
export const applyPerfectLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): LayoutResult => {
  const layout = new PerfectAutoLayout(nodes, edges, options);
  return layout.execute();
};