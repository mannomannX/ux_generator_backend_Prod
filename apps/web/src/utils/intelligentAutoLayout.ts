import dagre from 'dagre';
import { Node, Edge } from 'reactflow';

// Layout Modes
export type LayoutMode = 'vertical' | 'horizontal' | 'compact' | 'tree' | 'smart';

// Layout Direction for dagre
export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

interface LayoutOptions {
  mode?: LayoutMode;
  padding?: number;
  animate?: boolean;
  respectPinned?: boolean;
  maxMovement?: number; // Maximum allowed movement per node
  selectedOnly?: boolean; // Only layout selected nodes
}

interface GraphAnalysis {
  isSequential: boolean;
  isTree: boolean;
  hasMultiplePaths: boolean;
  hasCycles: boolean;
  connectedComponents: Node[][];
  depth: number;
  breadth: number;
}

interface NodeMetrics {
  inDegree: number;
  outDegree: number;
  level: number;
  isPinned: boolean;
  isInFrame: boolean;
  frameId?: string;
}

const defaultOptions: Required<LayoutOptions> = {
  mode: 'smart',
  padding: 150,
  animate: true,
  respectPinned: true,
  maxMovement: 500,
  selectedOnly: false,
};

/**
 * Intelligent Auto-Layout Algorithm
 * Respects pinned nodes, minimizes changes, and provides multiple layout modes
 */
export class IntelligentAutoLayout {
  private nodes: Node[];
  private edges: Edge[];
  private options: Required<LayoutOptions>;
  private nodeMetrics: Map<string, NodeMetrics>;
  private graphAnalysis: GraphAnalysis | null = null;

  constructor(nodes: Node[], edges: Edge[], options: LayoutOptions = {}) {
    this.nodes = nodes;
    this.edges = edges;
    this.options = { ...defaultOptions, ...options };
    this.nodeMetrics = new Map();
    this.analyzeNodes();
  }

  /**
   * Main entry point for auto-layout
   */
  public execute(): Node[] {
    // Filter nodes based on selection if needed
    const nodesToLayout = this.options.selectedOnly 
      ? this.nodes.filter(n => n.selected)
      : this.nodes;

    if (nodesToLayout.length === 0) return this.nodes;

    // Phase 1: Graph Analysis & Grouping
    this.graphAnalysis = this.analyzeGraph(nodesToLayout);

    // Phase 2: Layout Calculation
    const layoutMode = this.options.mode === 'smart' 
      ? this.determineOptimalMode(this.graphAnalysis)
      : this.options.mode;

    const layoutedNodes = this.applyLayoutMode(nodesToLayout, layoutMode);

    // Phase 3: Position Application & Limiting
    return this.applyPositionsWithConstraints(layoutedNodes);
  }

  /**
   * Analyze individual nodes and build metrics
   */
  private analyzeNodes(): void {
    this.nodes.forEach(node => {
      const inDegree = this.edges.filter(e => e.target === node.id).length;
      const outDegree = this.edges.filter(e => e.source === node.id).length;
      
      this.nodeMetrics.set(node.id, {
        inDegree,
        outDegree,
        level: 0, // Will be calculated during graph analysis
        isPinned: node.data?.isPinned || false,
        isInFrame: node.parentNode !== undefined,
        frameId: node.parentNode,
      });
    });
  }

  /**
   * Comprehensive graph analysis
   */
  private analyzeGraph(nodes: Node[]): GraphAnalysis {
    const nodeIds = new Set(nodes.map(n => n.id));
    const relevantEdges = this.edges.filter(e => 
      nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    // Find connected components
    const connectedComponents = this.findConnectedComponents(nodes, relevantEdges);
    
    // Analyze structure
    const isSequential = this.checkIfSequential(nodes, relevantEdges);
    const isTree = this.checkIfTree(nodes, relevantEdges);
    const hasCycles = this.detectCycles(nodes, relevantEdges);
    const hasMultiplePaths = this.checkMultiplePaths(nodes, relevantEdges);
    
    // Calculate depth and breadth
    const { depth, breadth } = this.calculateGraphDimensions(nodes, relevantEdges);

    return {
      isSequential,
      isTree,
      hasMultiplePaths,
      hasCycles,
      connectedComponents,
      depth,
      breadth,
    };
  }

  /**
   * Find connected components in the graph
   */
  private findConnectedComponents(nodes: Node[], edges: Edge[]): Node[][] {
    const visited = new Set<string>();
    const components: Node[][] = [];
    
    const dfs = (nodeId: string, component: Node[]) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const node = nodes.find(n => n.id === nodeId);
      if (node) component.push(node);
      
      // Find neighbors
      edges.forEach(edge => {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          dfs(edge.target, component);
        }
        if (edge.target === nodeId && !visited.has(edge.source)) {
          dfs(edge.source, component);
        }
      });
    };
    
    nodes.forEach(node => {
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

  /**
   * Check if graph is sequential (linear flow)
   */
  private checkIfSequential(nodes: Node[], edges: Edge[]): boolean {
    if (nodes.length === 0) return false;
    
    // Sequential means most nodes have at most 1 in and 1 out edge
    let sequentialCount = 0;
    nodes.forEach(node => {
      const metrics = this.nodeMetrics.get(node.id);
      if (metrics && metrics.inDegree <= 1 && metrics.outDegree <= 1) {
        sequentialCount++;
      }
    });
    
    return sequentialCount >= nodes.length * 0.7; // 70% threshold
  }

  /**
   * Check if graph is a tree structure
   */
  private checkIfTree(nodes: Node[], edges: Edge[]): boolean {
    if (nodes.length === 0) return false;
    
    // Tree has n-1 edges for n nodes and no cycles
    const hasCycles = this.detectCycles(nodes, edges);
    const isConnected = this.findConnectedComponents(nodes, edges).length === 1;
    
    return !hasCycles && isConnected && edges.length === nodes.length - 1;
  }

  /**
   * Detect cycles in the graph
   */
  private detectCycles(nodes: Node[], edges: Edge[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const outgoingEdges = edges.filter(e => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          if (hasCycleDFS(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) return true;
      }
    }
    
    return false;
  }

  /**
   * Check if there are multiple paths between nodes
   */
  private checkMultiplePaths(nodes: Node[], edges: Edge[]): boolean {
    // Simple heuristic: if average degree > 2, likely multiple paths
    const avgDegree = nodes.reduce((sum, node) => {
      const metrics = this.nodeMetrics.get(node.id);
      return sum + (metrics ? metrics.inDegree + metrics.outDegree : 0);
    }, 0) / Math.max(nodes.length, 1);
    
    return avgDegree > 2;
  }

  /**
   * Calculate graph dimensions (depth and breadth)
   */
  private calculateGraphDimensions(nodes: Node[], edges: Edge[]): { depth: number; breadth: number } {
    if (nodes.length === 0) return { depth: 0, breadth: 0 };
    
    // Find root nodes (no incoming edges)
    const rootNodes = nodes.filter(n => {
      const metrics = this.nodeMetrics.get(n.id);
      return metrics && metrics.inDegree === 0;
    });
    
    if (rootNodes.length === 0) {
      // If no clear root, pick node with minimum in-degree
      const minInDegree = Math.min(...nodes.map(n => 
        this.nodeMetrics.get(n.id)?.inDegree || 0
      ));
      rootNodes.push(...nodes.filter(n => 
        this.nodeMetrics.get(n.id)?.inDegree === minInDegree
      ).slice(0, 1));
    }
    
    // BFS to calculate depth and breadth
    const visited = new Set<string>();
    const queue: { node: Node; level: number }[] = rootNodes.map(n => ({ node: n, level: 0 }));
    const levelCounts = new Map<number, number>();
    let maxDepth = 0;
    
    while (queue.length > 0) {
      const { node, level } = queue.shift()!;
      if (visited.has(node.id)) continue;
      
      visited.add(node.id);
      maxDepth = Math.max(maxDepth, level);
      levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
      
      const metrics = this.nodeMetrics.get(node.id);
      if (metrics) metrics.level = level;
      
      const outgoingEdges = edges.filter(e => e.source === node.id);
      outgoingEdges.forEach(edge => {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) {
          queue.push({ node: targetNode, level: level + 1 });
        }
      });
    }
    
    const maxBreadth = Math.max(...Array.from(levelCounts.values()));
    
    return { depth: maxDepth + 1, breadth: maxBreadth };
  }

  /**
   * Determine optimal layout mode based on graph analysis
   */
  private determineOptimalMode(analysis: GraphAnalysis): LayoutMode {
    // If graph is sequential, use vertical or horizontal based on aspect ratio
    if (analysis.isSequential) {
      return analysis.depth > analysis.breadth ? 'vertical' : 'horizontal';
    }
    
    // If graph is a tree, use tree layout
    if (analysis.isTree) {
      return 'tree';
    }
    
    // If graph has multiple disconnected components, use compact
    if (analysis.connectedComponents.length > 3) {
      return 'compact';
    }
    
    // If graph has cycles or multiple paths, use vertical for clarity
    if (analysis.hasCycles || analysis.hasMultiplePaths) {
      return 'vertical';
    }
    
    // Default to vertical
    return 'vertical';
  }

  /**
   * Apply the selected layout mode
   */
  private applyLayoutMode(nodes: Node[], mode: LayoutMode): Node[] {
    switch (mode) {
      case 'vertical':
        return this.applyDirectionalLayout(nodes, 'TB');
      case 'horizontal':
        return this.applyDirectionalLayout(nodes, 'LR');
      case 'compact':
        return this.applyCompactLayout(nodes);
      case 'tree':
        return this.applyTreeLayout(nodes);
      default:
        return this.applyDirectionalLayout(nodes, 'TB');
    }
  }

  /**
   * Apply directional layout (vertical or horizontal)
   */
  private applyDirectionalLayout(nodes: Node[], direction: LayoutDirection): Node[] {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    // Configure with appropriate spacing
    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: this.options.padding,
      ranksep: this.options.padding * 1.5,
      marginx: 50,
      marginy: 50,
    });
    
    // Separate pinned and unpinned nodes
    const pinnedNodes = nodes.filter(n => this.nodeMetrics.get(n.id)?.isPinned);
    const unpinnedNodes = nodes.filter(n => !this.nodeMetrics.get(n.id)?.isPinned);
    
    // Add all nodes to graph
    nodes.forEach(node => {
      const width = node.width || 180;
      const height = node.height || 80;
      dagreGraph.setNode(node.id, { 
        width, 
        height,
        x: this.nodeMetrics.get(node.id)?.isPinned ? node.position.x : undefined,
        y: this.nodeMetrics.get(node.id)?.isPinned ? node.position.y : undefined,
      });
    });
    
    // Add edges
    const nodeIds = new Set(nodes.map(n => n.id));
    this.edges.forEach(edge => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });
    
    // Run layout
    dagre.layout(dagreGraph);
    
    // Apply new positions
    return nodes.map(node => {
      const nodePos = dagreGraph.node(node.id);
      const width = node.width || 180;
      const height = node.height || 80;
      
      // If node is pinned, keep original position
      if (this.nodeMetrics.get(node.id)?.isPinned) {
        return node;
      }
      
      return {
        ...node,
        position: {
          x: nodePos.x - width / 2,
          y: nodePos.y - height / 2,
        },
      };
    });
  }

  /**
   * Apply compact layout
   */
  private applyCompactLayout(nodes: Node[]): Node[] {
    // Use directional layout with reduced spacing
    const originalPadding = this.options.padding;
    this.options.padding = originalPadding * 0.5;
    const result = this.applyDirectionalLayout(nodes, 'TB');
    this.options.padding = originalPadding;
    return result;
  }

  /**
   * Apply tree layout
   */
  private applyTreeLayout(nodes: Node[]): Node[] {
    // Find root nodes
    const rootNodes = nodes.filter(n => {
      const metrics = this.nodeMetrics.get(n.id);
      return metrics && metrics.inDegree === 0;
    });
    
    if (rootNodes.length === 0) {
      // Fallback to directional layout
      return this.applyDirectionalLayout(nodes, 'TB');
    }
    
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    // Configure for tree layout
    dagreGraph.setGraph({
      rankdir: 'TB',
      nodesep: this.options.padding * 0.8,
      ranksep: this.options.padding * 1.2,
      marginx: 50,
      marginy: 50,
    });
    
    // Add nodes with level-based positioning hints
    nodes.forEach(node => {
      const width = node.width || 180;
      const height = node.height || 80;
      const metrics = this.nodeMetrics.get(node.id);
      
      dagreGraph.setNode(node.id, { 
        width, 
        height,
        rank: metrics?.level,
      });
    });
    
    // Add edges
    const nodeIds = new Set(nodes.map(n => n.id));
    this.edges.forEach(edge => {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    });
    
    // Run layout
    dagre.layout(dagreGraph);
    
    // Apply new positions
    return nodes.map(node => {
      const nodePos = dagreGraph.node(node.id);
      const width = node.width || 180;
      const height = node.height || 80;
      
      // If node is pinned, keep original position
      if (this.nodeMetrics.get(node.id)?.isPinned) {
        return node;
      }
      
      return {
        ...node,
        position: {
          x: nodePos.x - width / 2,
          y: nodePos.y - height / 2,
        },
      };
    });
  }

  /**
   * Apply positions with movement constraints
   */
  private applyPositionsWithConstraints(layoutedNodes: Node[]): Node[] {
    const layoutedMap = new Map(layoutedNodes.map(n => [n.id, n]));
    
    return this.nodes.map(node => {
      const layoutedNode = layoutedMap.get(node.id);
      if (!layoutedNode) return node;
      
      // If node is pinned, don't move it
      if (this.nodeMetrics.get(node.id)?.isPinned) {
        return node;
      }
      
      // Calculate movement
      const dx = layoutedNode.position.x - node.position.x;
      const dy = layoutedNode.position.y - node.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If movement exceeds maximum, limit it
      if (distance > this.options.maxMovement) {
        const scale = this.options.maxMovement / distance;
        return {
          ...node,
          position: {
            x: node.position.x + dx * scale,
            y: node.position.y + dy * scale,
          },
        };
      }
      
      // Apply the new position
      return layoutedNode;
    });
  }
}

/**
 * Main export function for easy usage
 */
export const applyIntelligentLayout = (
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] => {
  const layout = new IntelligentAutoLayout(nodes, edges, options);
  return layout.execute();
};

/**
 * Helper function to detect which mode would be best
 */
export const suggestLayoutMode = (
  nodes: Node[],
  edges: Edge[]
): LayoutMode => {
  const layout = new IntelligentAutoLayout(nodes, edges, { mode: 'smart' });
  const analysis = layout['analyzeGraph'](nodes);
  return layout['determineOptimalMode'](analysis);
};