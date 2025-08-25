import { Node, Edge, MarkerType } from 'reactflow';

export type LayoutMode = 'compact' | 'horizontal' | 'vertical' | 'radial' | 'smart';

interface LayoutConfig {
  mode: LayoutMode;
  nodeSpacing: { x: number; y: number };
  rankSpacing: { x: number; y: number };
  frameInnerPadding: number;
  edgeSpacing: number;
  preventOverlap: boolean;
  centerLayout: boolean;
}

interface NodeInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  rank: number;
  parent?: string;
  children: string[];
  incoming: string[];
  outgoing: string[];
}

interface EdgeInfo {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  points?: { x: number; y: number }[];
  lane?: number;
}

interface LaneAssignment {
  edgeId: string;
  lane: number;
  color: string;
}

export class LayoutV3Minimal {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private config: LayoutConfig;
  private nodeInfoMap: Map<string, NodeInfo> = new Map();
  private edgeInfoMap: Map<string, EdgeInfo> = new Map();
  private frameRelations: Map<string, string> = new Map();
  private lanes: Map<string, LaneAssignment> = new Map();

  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    // Sort for determinism
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
    
    this.config = {
      mode: 'compact',
      nodeSpacing: { x: 300, y: 200 }, // Increased from 250x150
      rankSpacing: { x: 400, y: 250 }, // Increased from 300x200
      frameInnerPadding: 30,
      edgeSpacing: 20,
      preventOverlap: true,
      centerLayout: true,
      ...config
    };
  }

  public apply(): { nodes: Node[]; edges: Edge[] } {
    // Phase 1: Analyze structure
    this.analyzeStructure();
    
    // Phase 2: Calculate levels (topological sort)
    this.calculateLevels();
    
    // Phase 3: Assign positions
    this.assignPositions();
    
    // Phase 4: Handle frames
    this.positionFrameChildren();
    
    // Phase 5: Simple collision adjustment for compact mode
    if (this.config.mode === 'compact') {
      this.adjustForCollisions();
    }
    
    // Phase 6: Calculate edge routing
    this.calculateEdgeRouting();
    
    // Phase 7: Apply to React Flow format
    return this.formatForReactFlow();
  }

  private analyzeStructure(): void {
    // Initialize node info
    this.nodes.forEach(node => {
      this.nodeInfoMap.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || (node.type === 'frame' ? 400 : 180),
        height: node.height || (node.type === 'frame' ? 300 : 80),
        level: 0,
        rank: 0,
        parent: node.parentNode,
        children: [],
        incoming: [],
        outgoing: []
      });

      if (node.parentNode) {
        this.frameRelations.set(node.id, node.parentNode);
      }
    });

    // Build adjacency lists
    this.edges.forEach(edge => {
      const sourceInfo = this.nodeInfoMap.get(edge.source);
      const targetInfo = this.nodeInfoMap.get(edge.target);
      
      if (sourceInfo && targetInfo) {
        sourceInfo.outgoing.push(edge.target);
        targetInfo.incoming.push(edge.source);
        
        this.edgeInfoMap.set(edge.id, {
          id: edge.id,
          source: edge.source,
          target: edge.target
        });
      }
    });

    // Identify frame children
    this.nodeInfoMap.forEach((info, nodeId) => {
      if (info.parent) {
        const parentInfo = this.nodeInfoMap.get(info.parent);
        if (parentInfo) {
          parentInfo.children.push(nodeId);
        }
      }
    });
  }

  private calculateLevels(): void {
    const visited = new Set<string>();
    const levels = new Map<string, number>();
    
    // Find start nodes (no incoming edges or only from parent frame)
    const startNodes = Array.from(this.nodeInfoMap.values()).filter(info => {
      const realIncoming = info.incoming.filter(sourceId => {
        const sourceInfo = this.nodeInfoMap.get(sourceId);
        return !sourceInfo?.parent || sourceInfo.parent !== info.parent;
      });
      return realIncoming.length === 0;
    });

    // BFS to assign levels
    const queue = startNodes.map(n => ({ id: n.id, level: 0 }));
    
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      const info = this.nodeInfoMap.get(id)!;
      info.level = level;
      levels.set(id, level);
      
      // Process outgoing edges
      info.outgoing.forEach(targetId => {
        if (!visited.has(targetId)) {
          queue.push({ id: targetId, level: level + 1 });
        }
      });
    }

    // Assign ranks within each level
    const levelGroups = new Map<number, string[]>();
    this.nodeInfoMap.forEach(info => {
      if (!levelGroups.has(info.level)) {
        levelGroups.set(info.level, []);
      }
      levelGroups.get(info.level)!.push(info.id);
    });

    levelGroups.forEach(nodeIds => {
      nodeIds.sort((a, b) => {
        // Group by parent frame first
        const aParent = this.nodeInfoMap.get(a)!.parent || '';
        const bParent = this.nodeInfoMap.get(b)!.parent || '';
        if (aParent !== bParent) return aParent.localeCompare(bParent);
        
        // Then by connection count (more connected nodes together)
        const aConn = this.nodeInfoMap.get(a)!.incoming.length + this.nodeInfoMap.get(a)!.outgoing.length;
        const bConn = this.nodeInfoMap.get(b)!.incoming.length + this.nodeInfoMap.get(b)!.outgoing.length;
        if (aConn !== bConn) return bConn - aConn;
        
        return a.localeCompare(b);
      });
      
      nodeIds.forEach((id, index) => {
        this.nodeInfoMap.get(id)!.rank = index;
      });
    });
  }

  private assignPositions(): void {
    const isHorizontal = this.config.mode === 'horizontal';
    const isVertical = this.config.mode === 'vertical';
    const isCompact = this.config.mode === 'compact';

    this.nodeInfoMap.forEach(info => {
      // Skip frame children (positioned separately)
      if (info.parent && this.nodes.find(n => n.id === info.id)?.type !== 'frame') {
        return;
      }

      let x: number, y: number;

      if (isHorizontal) {
        x = info.level * this.config.rankSpacing.x;
        y = info.rank * this.config.nodeSpacing.y;
      } else if (isVertical) {
        x = info.rank * this.config.nodeSpacing.x;
        y = info.level * this.config.rankSpacing.y;
      } else if (isCompact) {
        // Compact: tighter spacing, LESS aggressive staggering
        x = info.level * (this.config.rankSpacing.x * 0.85);
        y = info.rank * (this.config.nodeSpacing.y * 0.8);
        
        // Gentler stagger for odd levels
        if (info.level % 2 === 1) {
          y += this.config.nodeSpacing.y * 0.15; // Reduced from 0.3
        }
      } else {
        // Default/Smart mode
        x = info.level * this.config.rankSpacing.x;
        y = info.rank * this.config.nodeSpacing.y;
      }

      // Center nodes in their grid cell
      x += (this.config.nodeSpacing.x - info.width) / 2;
      y += (this.config.nodeSpacing.y - info.height) / 2;

      info.x = x;
      info.y = y;
    });

    // Center the entire layout if requested
    if (this.config.centerLayout) {
      this.centerLayout();
    }
  }

  private centerLayout(): void {
    const allNodes = Array.from(this.nodeInfoMap.values()).filter(n => !n.parent);
    if (allNodes.length === 0) return;

    const minX = Math.min(...allNodes.map(n => n.x));
    const minY = Math.min(...allNodes.map(n => n.y));
    const maxX = Math.max(...allNodes.map(n => n.x + n.width));
    const maxY = Math.max(...allNodes.map(n => n.y + n.height));

    const layoutWidth = maxX - minX;
    const layoutHeight = maxY - minY;

    // Center around (500, 300) as a reasonable viewport center
    const offsetX = 500 - layoutWidth / 2 - minX;
    const offsetY = 300 - layoutHeight / 2 - minY;

    allNodes.forEach(info => {
      info.x += offsetX;
      info.y += offsetY;
    });
  }

  private positionFrameChildren(): void {
    const frames = this.nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const frameInfo = this.nodeInfoMap.get(frame.id)!;
      if (frameInfo.children.length === 0) {
        // Empty frame - minimal size
        frameInfo.width = 200;
        frameInfo.height = 120;
        return;
      }

      const padding = this.config.frameInnerPadding;
      const children = frameInfo.children
        .map(id => this.nodeInfoMap.get(id)!)
        .filter(c => c !== undefined);

      // Position children inside frame
      const childLevels = new Map<number, NodeInfo[]>();
      children.forEach(child => {
        const relLevel = child.level - frameInfo.level;
        if (!childLevels.has(relLevel)) {
          childLevels.set(relLevel, []);
        }
        childLevels.get(relLevel)!.push(child);
      });

      let currentY = frameInfo.y + padding;
      
      childLevels.forEach(levelChildren => {
        let currentX = frameInfo.x + padding;
        
        levelChildren.forEach(child => {
          child.x = currentX;
          child.y = currentY;
          currentX += child.width + this.config.nodeSpacing.x / 2;
        });
        
        currentY += Math.max(...levelChildren.map(c => c.height)) + this.config.nodeSpacing.y / 2;
      });

      // Adjust frame size to contain children
      const maxChildX = Math.max(...children.map(c => c.x + c.width));
      const maxChildY = Math.max(...children.map(c => c.y + c.height));
      
      frameInfo.width = maxChildX - frameInfo.x + padding;
      frameInfo.height = maxChildY - frameInfo.y + padding;
    });
  }

  private adjustForCollisions(): void {
    // Simple collision adjustment - only for nodes that are too close
    const nodes = Array.from(this.nodeInfoMap.values());
    const margin = 20;
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        
        // Skip if different levels
        if (Math.abs(nodeA.level - nodeB.level) > 1) continue;
        
        // Check overlap
        const overlapX = (nodeA.x + nodeA.width + margin) - nodeB.x;
        const overlapY = (nodeA.y + nodeA.height + margin) - nodeB.y;
        
        if (overlapX > 0 && overlapY > 0) {
          // Move nodeB slightly
          if (overlapX < overlapY) {
            nodeB.x += overlapX;
          } else {
            nodeB.y += overlapY;
          }
        }
      }
    }
  }

  private calculateEdgeRouting(): void {
    // Simple edge routing without complex lane management
    this.edgeInfoMap.forEach(edge => {
      const sourceInfo = this.nodeInfoMap.get(edge.source)!;
      const targetInfo = this.nodeInfoMap.get(edge.target)!;
      
      // Determine best handle positions based on relative positions
      const dx = targetInfo.x - sourceInfo.x;
      const dy = targetInfo.y - sourceInfo.y;
      
      let sourceHandle: string, targetHandle: string;
      
      // Prefer clean connections
      if (sourceInfo.level === targetInfo.level) {
        // Same level - horizontal connection
        if (dy > 20) {
          sourceHandle = 'bottom';
          targetHandle = 'top';
        } else if (dy < -20) {
          sourceHandle = 'top';
          targetHandle = 'bottom';
        } else {
          sourceHandle = dx > 0 ? 'right' : 'left';
          targetHandle = dx > 0 ? 'left' : 'right';
        }
      } else {
        // Different levels - prefer vertical
        if (Math.abs(dx) > Math.abs(dy) * 2) {
          // Very horizontal - use sides
          sourceHandle = dx > 0 ? 'right' : 'left';
          targetHandle = dx > 0 ? 'left' : 'right';
        } else {
          // More vertical - use top/bottom
          sourceHandle = dy > 0 ? 'bottom' : 'top';
          targetHandle = dy > 0 ? 'top' : 'bottom';
        }
      }

      edge.sourceHandle = sourceHandle;
      edge.targetHandle = targetHandle;
    });
  }

  private formatForReactFlow(): { nodes: Node[]; edges: Edge[] } {
    // Update nodes with calculated positions
    const updatedNodes = this.nodes.map(node => {
      const info = this.nodeInfoMap.get(node.id)!;
      return {
        ...node,
        position: { x: info.x, y: info.y },
        width: info.width,
        height: info.height,
        data: {
          ...node.data,
          level: info.level,
          rank: info.rank
        }
      };
    });

    // Update edges with routing info - NO COLORS, keep it simple
    const updatedEdges = this.edges.map(edge => {
      const info = this.edgeInfoMap.get(edge.id)!;
      
      return {
        ...edge,
        sourceHandle: info.sourceHandle || 'right',
        targetHandle: info.targetHandle || 'left',
        type: 'smoothstep',
        style: {
          strokeWidth: 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20
        }
      };
    });

    return {
      nodes: updatedNodes,
      edges: updatedEdges
    };
  }
}

// Export helper function for easy use
export function applyLayoutV3Minimal(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode = 'compact'
): { nodes: Node[]; edges: Edge[] } {
  const layout = new LayoutV3Minimal(nodes, edges, { mode });
  return layout.apply();
}