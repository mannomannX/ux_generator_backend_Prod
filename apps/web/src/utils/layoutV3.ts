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

export class LayoutV3 {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private config: LayoutConfig;
  private nodeInfoMap: Map<string, NodeInfo> = new Map();
  private edgeInfoMap: Map<string, EdgeInfo> = new Map();
  private frameRelations: Map<string, string> = new Map();
  private lanes: Map<string, LaneAssignment> = new Map();
  private collisionGrid: Map<string, Set<string>> = new Map();

  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    // Sort for determinism
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
    
    this.config = {
      mode: 'compact',
      nodeSpacing: { x: 280, y: 180 },  // Slightly increased
      rankSpacing: { x: 350, y: 220 },  // Slightly increased
      frameInnerPadding: 40,  // More padding for frames
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
    
    // Phase 5: Calculate edge routing with lanes
    this.calculateEdgeRouting();
    
    // Phase 6: Apply to React Flow format
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
        // Compact: tighter spacing, gentler staggered layout
        x = info.level * (this.config.rankSpacing.x * 0.85);
        y = info.rank * (this.config.nodeSpacing.y * 0.8);
        
        // Gentler stagger for better edge visibility
        if (info.level % 2 === 1) {
          y += this.config.nodeSpacing.y * 0.15;  // Reduced from 0.3
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
    // Get ALL nodes to find bounds
    const allNodes = Array.from(this.nodeInfoMap.values());
    if (allNodes.length === 0) return;

    const minX = Math.min(...allNodes.map(n => n.x));
    const minY = Math.min(...allNodes.map(n => n.y));
    const maxX = Math.max(...allNodes.map(n => n.x + n.width));
    const maxY = Math.max(...allNodes.map(n => n.y + n.height));

    // Make sure we start at positive coordinates
    const offsetX = minX < 50 ? 50 - minX : 0;
    const offsetY = minY < 50 ? 50 - minY : 0;

    // Apply offset to ALL nodes (including frame children)
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
        // Empty frame - keep minimal size
        frameInfo.width = 250;
        frameInfo.height = 150;
        return;
      }

      const padding = this.config.frameInnerPadding;
      const children = frameInfo.children
        .map(id => this.nodeInfoMap.get(id)!)
        .filter(c => c !== undefined);

      // Calculate required frame size first
      const totalChildWidth = children.reduce((sum, c) => sum + c.width, 0) + 
                             (children.length - 1) * (this.config.nodeSpacing.x * 0.3);
      const maxChildHeight = Math.max(...children.map(c => c.height));
      
      // Set frame size
      frameInfo.width = Math.max(totalChildWidth + padding * 2, 300);
      frameInfo.height = Math.max(maxChildHeight + padding * 2, 200);

      // Now position children within the sized frame
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
        // Center children horizontally in frame
        const levelWidth = levelChildren.reduce((sum, c) => sum + c.width, 0) + 
                          (levelChildren.length - 1) * (this.config.nodeSpacing.x * 0.3);
        let currentX = frameInfo.x + (frameInfo.width - levelWidth) / 2;
        
        levelChildren.forEach(child => {
          child.x = currentX;
          child.y = currentY;
          currentX += child.width + this.config.nodeSpacing.x * 0.3;
        });
        
        currentY += Math.max(...levelChildren.map(c => c.height)) + this.config.nodeSpacing.y * 0.3;
      });
    });
  }

  private calculateEdgeRouting(): void {
    // Group parallel edges
    const edgeGroups = new Map<string, EdgeInfo[]>();
    
    this.edgeInfoMap.forEach(edge => {
      const key = [edge.source, edge.target].sort().join('-');
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, []);
      }
      edgeGroups.get(key)!.push(edge);
    });

    // Assign lanes to parallel edges
    const laneColors = ['#4a90e2', '#7cb342', '#fb8c00', '#e91e63', '#9c27b0'];
    
    edgeGroups.forEach(group => {
      group.forEach((edge, index) => {
        this.lanes.set(edge.id, {
          edgeId: edge.id,
          lane: index,
          color: laneColors[index % laneColors.length]
        });
      });
    });

    // Calculate routes for each edge
    this.edgeInfoMap.forEach(edge => {
      const sourceInfo = this.nodeInfoMap.get(edge.source)!;
      const targetInfo = this.nodeInfoMap.get(edge.target)!;
      
      // Determine best handle positions based on relative positions
      const dx = targetInfo.x - sourceInfo.x;
      const dy = targetInfo.y - sourceInfo.y;
      
      let sourceHandle: string, targetHandle: string;
      
      // Smart handle selection based on direction
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection
        if (dx > 0) {
          sourceHandle = 'right';
          targetHandle = 'left';
        } else {
          sourceHandle = 'left';
          targetHandle = 'right';
        }
      } else {
        // Vertical connection
        if (dy > 0) {
          sourceHandle = 'bottom';
          targetHandle = 'top';
        } else {
          sourceHandle = 'top';
          targetHandle = 'bottom';
        }
      }

      // Special case: if nodes are at same level, prefer horizontal
      if (sourceInfo.level === targetInfo.level) {
        if (sourceInfo.rank < targetInfo.rank) {
          sourceHandle = 'bottom';
          targetHandle = 'top';
        } else {
          sourceHandle = 'top';
          targetHandle = 'bottom';
        }
      }

      edge.sourceHandle = sourceHandle;
      edge.targetHandle = targetHandle;

      // Calculate orthogonal path with collision avoidance
      edge.points = this.calculateOrthogonalPath(sourceInfo, targetInfo, sourceHandle, targetHandle, edge.id);
    });
  }

  private calculateOrthogonalPath(
    source: NodeInfo,
    target: NodeInfo,
    sourceHandle: string,
    targetHandle: string,
    edgeId: string
  ): { x: number; y: number }[] {
    const lane = this.lanes.get(edgeId);
    const laneOffset = lane ? lane.lane * this.config.edgeSpacing : 0;
    
    // Get handle positions
    const sourcePos = this.getHandlePosition(source, sourceHandle);
    const targetPos = this.getHandlePosition(target, targetHandle);
    
    const points: { x: number; y: number }[] = [sourcePos];
    
    // Apply lane offset for parallel edges
    if (lane && lane.lane > 0) {
      if (sourceHandle === 'right' || sourceHandle === 'left') {
        sourcePos.y += laneOffset;
        targetPos.y += laneOffset;
      } else {
        sourcePos.x += laneOffset;
        targetPos.x += laneOffset;
      }
    }
    
    // Check for obstacles
    const obstacles = this.detectObstacles(source, target);
    
    if (obstacles.length > 0) {
      // Route around obstacles
      const detour = this.calculateDetour(sourcePos, targetPos, obstacles);
      points.push(...detour);
    } else {
      // Simple orthogonal routing
      const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
      const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
      
      if (sourceHandle === 'bottom' || sourceHandle === 'top') {
        points.push({ x: sourcePos.x, y: midY });
        points.push({ x: targetPos.x, y: midY });
      } else {
        points.push({ x: midX, y: sourcePos.y });
        points.push({ x: midX, y: targetPos.y });
      }
    }
    
    points.push(targetPos);
    return points;
  }

  private getHandlePosition(node: NodeInfo, handle: string): { x: number; y: number } {
    const center = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2
    };

    switch (handle) {
      case 'top':
        return { x: center.x, y: node.y };
      case 'bottom':
        return { x: center.x, y: node.y + node.height };
      case 'left':
        return { x: node.x, y: center.y };
      case 'right':
        return { x: node.x + node.width, y: center.y };
      default:
        return center;
    }
  }

  private detectObstacles(source: NodeInfo, target: NodeInfo): NodeInfo[] {
    const obstacles: NodeInfo[] = [];
    const minX = Math.min(source.x, target.x);
    const maxX = Math.max(source.x + source.width, target.x + target.width);
    const minY = Math.min(source.y, target.y);
    const maxY = Math.max(source.y + source.height, target.y + target.height);

    this.nodeInfoMap.forEach(node => {
      if (node.id === source.id || node.id === target.id) return;
      
      // Check if node is in the path area
      if (node.x < maxX && node.x + node.width > minX &&
          node.y < maxY && node.y + node.height > minY) {
        obstacles.push(node);
      }
    });

    return obstacles;
  }

  private calculateDetour(
    start: { x: number; y: number },
    end: { x: number; y: number },
    obstacles: NodeInfo[]
  ): { x: number; y: number }[] {
    // Simple detour: go around the first obstacle
    if (obstacles.length === 0) return [];
    
    const obstacle = obstacles[0];
    const detour: { x: number; y: number }[] = [];
    
    // Determine which side to go around
    const goLeft = start.x < obstacle.x;
    const goTop = start.y < obstacle.y;
    
    if (goLeft) {
      detour.push({ x: obstacle.x - 20, y: start.y });
      detour.push({ x: obstacle.x - 20, y: end.y });
    } else {
      detour.push({ x: obstacle.x + obstacle.width + 20, y: start.y });
      detour.push({ x: obstacle.x + obstacle.width + 20, y: end.y });
    }
    
    return detour;
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

    // Update edges with routing info
    const updatedEdges = this.edges.map(edge => {
      const info = this.edgeInfoMap.get(edge.id)!;
      const lane = this.lanes.get(edge.id);
      
      return {
        ...edge,
        sourceHandle: info.sourceHandle || 'right',
        targetHandle: info.targetHandle || 'left',
        type: 'smoothstep',
        animated: lane && lane.lane > 0,
        style: {
          stroke: lane?.color || '#666',
          strokeWidth: 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: lane?.color || '#666'
        },
        data: {
          ...edge.data,
          points: info.points,
          lane: lane?.lane
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
export function applyLayoutV3(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode = 'compact'
): { nodes: Node[]; edges: Edge[] } {
  const layout = new LayoutV3(nodes, edges, { mode });
  return layout.apply();
}