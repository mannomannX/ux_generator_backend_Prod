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
  compactStaggerRatio: number;
  avoidanceZone: number; // Zone around nodes to avoid for edges
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
  type?: string;
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

export class LayoutV3Improved {
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
      nodeSpacing: { x: 280, y: 180 },
      rankSpacing: { x: 350, y: 250 },
      frameInnerPadding: 40,
      edgeSpacing: 25,
      preventOverlap: true,
      centerLayout: true,
      compactStaggerRatio: 0.2,
      avoidanceZone: 30,
      ...config
    };
  }

  public apply(): { nodes: Node[]; edges: Edge[] } {
    // Phase 1: Analyze structure
    this.analyzeStructure();
    
    // Phase 2: Auto-detect frame relationships if not explicitly set
    this.detectFrameRelationships();
    
    // Phase 3: Calculate levels (topological sort)
    this.calculateLevels();
    
    // Phase 4: Assign positions with improved compact mode
    this.assignPositions();
    
    // Phase 5: Handle frames with proper sizing
    this.positionAndSizeFrames();
    
    // Phase 6: Avoid collisions in compact mode
    this.avoidCollisionsCompact();
    
    // Phase 7: Calculate edge routing with collision avoidance
    this.calculateEdgeRouting();
    
    // Phase 8: Apply to React Flow format
    return this.formatForReactFlow();
  }

  private analyzeStructure(): void {
    // Initialize node info
    this.nodes.forEach(node => {
      this.nodeInfoMap.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || (node.type === 'frame' ? 500 : 180),
        height: node.height || (node.type === 'frame' ? 350 : 80),
        level: 0,
        rank: 0,
        parent: node.parentNode,
        children: [],
        incoming: [],
        outgoing: [],
        type: node.type
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

  private detectFrameRelationships(): void {
    // Auto-detect which nodes should be inside frames based on flow
    const frames = Array.from(this.nodeInfoMap.values()).filter(n => n.type === 'frame');
    
    frames.forEach(frameInfo => {
      // If frame has no explicit children, try to detect them
      if (frameInfo.children.length === 0) {
        // Find nodes that are logically grouped with the frame
        // Look for nodes between frame's incoming and outgoing connections
        const incomingSources = frameInfo.incoming.map(id => this.nodeInfoMap.get(id)!);
        const outgoingTargets = frameInfo.outgoing.map(id => this.nodeInfoMap.get(id)!);
        
        // Find nodes at the same level or one level different
        this.nodeInfoMap.forEach((nodeInfo, nodeId) => {
          if (nodeId === frameInfo.id || nodeInfo.type === 'frame') return;
          
          // Check if this node is connected in the flow between frame's connections
          const isInFlowPath = this.isNodeInFlowPath(nodeInfo, frameInfo);
          
          if (isInFlowPath && !nodeInfo.parent) {
            // This node should be inside the frame
            nodeInfo.parent = frameInfo.id;
            frameInfo.children.push(nodeId);
            this.frameRelations.set(nodeId, frameInfo.id);
          }
        });
      }
    });
  }

  private isNodeInFlowPath(node: NodeInfo, frame: NodeInfo): boolean {
    // Simple heuristic: nodes that are closely connected to frame's flow
    // and at similar levels should be grouped
    const levelDiff = Math.abs(node.level - frame.level);
    
    // Check if node is connected to frame or frame's immediate neighbors
    const isConnectedToFrame = 
      node.incoming.includes(frame.id) || 
      node.outgoing.includes(frame.id) ||
      frame.incoming.some(id => node.outgoing.includes(id)) ||
      frame.outgoing.some(id => node.incoming.includes(id));
    
    return levelDiff <= 1 && isConnectedToFrame;
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
          const targetInfo = this.nodeInfoMap.get(targetId)!;
          // Don't increase level for frame children
          const levelIncrement = targetInfo.parent === info.id ? 0 : 1;
          queue.push({ id: targetId, level: level + levelIncrement });
        }
      });
    }

    // Assign ranks within each level with better grouping
    this.assignRanksWithGrouping();
  }

  private assignRanksWithGrouping(): void {
    const levelGroups = new Map<number, string[]>();
    
    this.nodeInfoMap.forEach(info => {
      if (!levelGroups.has(info.level)) {
        levelGroups.set(info.level, []);
      }
      levelGroups.get(info.level)!.push(info.id);
    });

    levelGroups.forEach((nodeIds, level) => {
      // Sort nodes intelligently
      nodeIds.sort((a, b) => {
        const aInfo = this.nodeInfoMap.get(a)!;
        const bInfo = this.nodeInfoMap.get(b)!;
        
        // Group by parent frame first
        const aParent = aInfo.parent || '';
        const bParent = bInfo.parent || '';
        if (aParent !== bParent) return aParent.localeCompare(bParent);
        
        // Then by type (frames first)
        if (aInfo.type === 'frame' && bInfo.type !== 'frame') return -1;
        if (aInfo.type !== 'frame' && bInfo.type === 'frame') return 1;
        
        // Then by connectivity (nodes with more connections closer together)
        const aConnections = aInfo.incoming.length + aInfo.outgoing.length;
        const bConnections = bInfo.incoming.length + bInfo.outgoing.length;
        if (aConnections !== bConnections) return bConnections - aConnections;
        
        // Finally alphabetically
        return a.localeCompare(b);
      });
      
      nodeIds.forEach((id, index) => {
        this.nodeInfoMap.get(id)!.rank = index;
      });
    });
  }

  private assignPositions(): void {
    const isCompact = this.config.mode === 'compact';

    this.nodeInfoMap.forEach(info => {
      // Skip frame children (positioned separately)
      if (info.parent && info.type !== 'frame') {
        return;
      }

      let x: number, y: number;

      if (isCompact) {
        // Improved compact mode with better spacing
        const levelSpacing = this.config.rankSpacing.x * 0.75;
        const rankSpacing = this.config.nodeSpacing.y * 0.65;
        
        x = info.level * levelSpacing;
        y = info.rank * rankSpacing;
        
        // Improved staggering for better visibility
        if (info.level % 2 === 1) {
          // Stagger odd levels but less aggressively
          y += rankSpacing * this.config.compactStaggerRatio;
        }
        
        // Add small random offset to prevent exact overlaps
        const jitter = 5;
        x += (Math.random() - 0.5) * jitter;
        y += (Math.random() - 0.5) * jitter;
      } else {
        // Other modes remain the same
        x = info.level * this.config.rankSpacing.x;
        y = info.rank * this.config.nodeSpacing.y;
      }

      // Don't center in grid cell for compact mode (wastes space)
      if (!isCompact) {
        x += (this.config.nodeSpacing.x - info.width) / 2;
        y += (this.config.nodeSpacing.y - info.height) / 2;
      }

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

    // Center around (600, 400) as a reasonable viewport center
    const offsetX = 600 - layoutWidth / 2 - minX;
    const offsetY = 400 - layoutHeight / 2 - minY;

    allNodes.forEach(info => {
      info.x += offsetX;
      info.y += offsetY;
    });
  }

  private positionAndSizeFrames(): void {
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

      // Position children inside frame with better layout
      const childLevels = new Map<number, NodeInfo[]>();
      children.forEach(child => {
        const relLevel = child.level - frameInfo.level;
        if (!childLevels.has(relLevel)) {
          childLevels.set(relLevel, []);
        }
        childLevels.get(relLevel)!.push(child);
      });

      // Calculate required frame size first
      let requiredWidth = 0;
      let requiredHeight = padding * 2;
      
      childLevels.forEach(levelChildren => {
        const levelWidth = levelChildren.reduce((sum, c) => sum + c.width, 0) + 
                          (levelChildren.length - 1) * (this.config.nodeSpacing.x * 0.4);
        requiredWidth = Math.max(requiredWidth, levelWidth);
        const levelHeight = Math.max(...levelChildren.map(c => c.height));
        requiredHeight += levelHeight + this.config.nodeSpacing.y * 0.3;
      });
      
      requiredWidth += padding * 2;

      // Update frame size
      frameInfo.width = Math.max(requiredWidth, 300);
      frameInfo.height = Math.max(requiredHeight, 200);

      // Now position children within the sized frame
      let currentY = frameInfo.y + padding;
      
      childLevels.forEach(levelChildren => {
        // Center children horizontally within frame
        const totalWidth = levelChildren.reduce((sum, c) => sum + c.width, 0) + 
                          (levelChildren.length - 1) * (this.config.nodeSpacing.x * 0.4);
        let currentX = frameInfo.x + (frameInfo.width - totalWidth) / 2;
        
        levelChildren.forEach(child => {
          child.x = currentX;
          child.y = currentY;
          currentX += child.width + this.config.nodeSpacing.x * 0.4;
        });
        
        const levelHeight = Math.max(...levelChildren.map(c => c.height));
        currentY += levelHeight + this.config.nodeSpacing.y * 0.3;
      });
    });
  }

  private avoidCollisionsCompact(): void {
    if (this.config.mode !== 'compact') return;

    // Build spatial index
    const spatialIndex = new Map<string, NodeInfo[]>();
    
    this.nodeInfoMap.forEach(node => {
      const gridX = Math.floor(node.x / 100);
      const gridY = Math.floor(node.y / 100);
      const key = `${gridX},${gridY}`;
      
      if (!spatialIndex.has(key)) {
        spatialIndex.set(key, []);
      }
      spatialIndex.get(key)!.push(node);
    });

    // Check for overlaps and adjust
    spatialIndex.forEach(cellNodes => {
      if (cellNodes.length <= 1) return;
      
      // Sort by level and rank to maintain hierarchy
      cellNodes.sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.rank - b.rank;
      });

      // Check each pair for overlap
      for (let i = 0; i < cellNodes.length; i++) {
        for (let j = i + 1; j < cellNodes.length; j++) {
          const nodeA = cellNodes[i];
          const nodeB = cellNodes[j];
          
          if (this.nodesOverlap(nodeA, nodeB)) {
            // Move nodeB to avoid collision
            const overlapX = (nodeA.x + nodeA.width) - nodeB.x + 20;
            const overlapY = (nodeA.y + nodeA.height) - nodeB.y + 20;
            
            if (Math.abs(overlapX) < Math.abs(overlapY)) {
              nodeB.x += overlapX;
            } else {
              nodeB.y += overlapY;
            }
          }
        }
      }
    });
  }

  private nodesOverlap(a: NodeInfo, b: NodeInfo): boolean {
    const margin = 10;
    return !(
      a.x + a.width + margin < b.x ||
      b.x + b.width + margin < a.x ||
      a.y + a.height + margin < b.y ||
      b.y + b.height + margin < a.y
    );
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

    // Calculate routes for each edge with better collision avoidance
    this.edgeInfoMap.forEach(edge => {
      const sourceInfo = this.nodeInfoMap.get(edge.source)!;
      const targetInfo = this.nodeInfoMap.get(edge.target)!;
      
      // Smart handle selection
      const { sourceHandle, targetHandle } = this.selectOptimalHandles(sourceInfo, targetInfo);
      
      edge.sourceHandle = sourceHandle;
      edge.targetHandle = targetHandle;

      // Calculate path with improved collision avoidance
      edge.points = this.calculateSmartPath(sourceInfo, targetInfo, sourceHandle, targetHandle, edge.id);
    });
  }

  private selectOptimalHandles(source: NodeInfo, target: NodeInfo): { sourceHandle: string; targetHandle: string } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    
    let sourceHandle: string, targetHandle: string;
    
    // For compact mode, prefer clean horizontal/vertical connections
    if (this.config.mode === 'compact') {
      // Prefer horizontal connections for same level
      if (source.level === target.level) {
        if (dx > 0) {
          sourceHandle = 'right';
          targetHandle = 'left';
        } else {
          sourceHandle = 'left';
          targetHandle = 'right';
        }
      } else {
        // Vertical for different levels
        if (dy > 0) {
          sourceHandle = 'bottom';
          targetHandle = 'top';
        } else {
          sourceHandle = 'top';
          targetHandle = 'bottom';
        }
      }
    } else {
      // Standard handle selection for other modes
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        sourceHandle = dx > 0 ? 'right' : 'left';
        targetHandle = dx > 0 ? 'left' : 'right';
      } else {
        sourceHandle = dy > 0 ? 'bottom' : 'top';
        targetHandle = dy > 0 ? 'top' : 'bottom';
      }
    }

    return { sourceHandle, targetHandle };
  }

  private calculateSmartPath(
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
    
    // Apply lane offset
    if (lane && lane.lane > 0) {
      if (sourceHandle === 'right' || sourceHandle === 'left') {
        sourcePos.y += laneOffset - this.config.edgeSpacing;
        targetPos.y += laneOffset - this.config.edgeSpacing;
      } else {
        sourcePos.x += laneOffset - this.config.edgeSpacing;
        targetPos.x += laneOffset - this.config.edgeSpacing;
      }
    }
    
    const points: { x: number; y: number }[] = [sourcePos];
    
    // Detect obstacles between source and target
    const obstacles = this.detectObstaclesInPath(source, target, sourcePos, targetPos);
    
    if (obstacles.length > 0 && this.config.mode === 'compact') {
      // Smart routing around obstacles
      const avoidancePoints = this.calculateAvoidancePath(sourcePos, targetPos, obstacles, sourceHandle, targetHandle);
      points.push(...avoidancePoints);
    } else {
      // Standard orthogonal routing
      const midPoints = this.calculateOrthogonalMidPoints(sourcePos, targetPos, sourceHandle, targetHandle);
      points.push(...midPoints);
    }
    
    points.push(targetPos);
    return points;
  }

  private calculateOrthogonalMidPoints(
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number },
    sourceHandle: string,
    targetHandle: string
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    if (sourceHandle === 'bottom' || sourceHandle === 'top') {
      const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
      points.push({ x: sourcePos.x, y: midY });
      points.push({ x: targetPos.x, y: midY });
    } else {
      const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
      points.push({ x: midX, y: sourcePos.y });
      points.push({ x: midX, y: targetPos.y });
    }
    
    return points;
  }

  private detectObstaclesInPath(
    source: NodeInfo,
    target: NodeInfo,
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number }
  ): NodeInfo[] {
    const obstacles: NodeInfo[] = [];
    
    // Define bounding box for the path
    const minX = Math.min(sourcePos.x, targetPos.x) - this.config.avoidanceZone;
    const maxX = Math.max(sourcePos.x, targetPos.x) + this.config.avoidanceZone;
    const minY = Math.min(sourcePos.y, targetPos.y) - this.config.avoidanceZone;
    const maxY = Math.max(sourcePos.y, targetPos.y) + this.config.avoidanceZone;

    this.nodeInfoMap.forEach(node => {
      if (node.id === source.id || node.id === target.id) return;
      
      // Check if node intersects with path bounding box
      const nodeMinX = node.x - this.config.avoidanceZone;
      const nodeMaxX = node.x + node.width + this.config.avoidanceZone;
      const nodeMinY = node.y - this.config.avoidanceZone;
      const nodeMaxY = node.y + node.height + this.config.avoidanceZone;
      
      if (nodeMaxX > minX && nodeMinX < maxX && nodeMaxY > minY && nodeMinY < maxY) {
        obstacles.push(node);
      }
    });

    return obstacles;
  }

  private calculateAvoidancePath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    obstacles: NodeInfo[],
    sourceHandle: string,
    targetHandle: string
  ): { x: number; y: number }[] {
    if (obstacles.length === 0) return [];
    
    const points: { x: number; y: number }[] = [];
    
    // Sort obstacles by distance from start
    obstacles.sort((a, b) => {
      const distA = Math.abs(a.x - start.x) + Math.abs(a.y - start.y);
      const distB = Math.abs(b.x - start.x) + Math.abs(b.y - start.y);
      return distA - distB;
    });
    
    // Route around the first obstacle
    const obstacle = obstacles[0];
    const buffer = this.config.avoidanceZone;
    
    // Determine best route around obstacle
    if (sourceHandle === 'right' || sourceHandle === 'left') {
      // Horizontal start - go around vertically
      if (start.y < obstacle.y) {
        // Go above
        points.push({ x: obstacle.x - buffer, y: start.y });
        points.push({ x: obstacle.x - buffer, y: obstacle.y - buffer });
        points.push({ x: end.x, y: obstacle.y - buffer });
      } else {
        // Go below
        points.push({ x: obstacle.x - buffer, y: start.y });
        points.push({ x: obstacle.x - buffer, y: obstacle.y + obstacle.height + buffer });
        points.push({ x: end.x, y: obstacle.y + obstacle.height + buffer });
      }
    } else {
      // Vertical start - go around horizontally
      if (start.x < obstacle.x) {
        // Go left
        points.push({ x: start.x, y: obstacle.y - buffer });
        points.push({ x: obstacle.x - buffer, y: obstacle.y - buffer });
        points.push({ x: obstacle.x - buffer, y: end.y });
      } else {
        // Go right
        points.push({ x: start.x, y: obstacle.y - buffer });
        points.push({ x: obstacle.x + obstacle.width + buffer, y: obstacle.y - buffer });
        points.push({ x: obstacle.x + obstacle.width + buffer, y: end.y });
      }
    }
    
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
export function applyLayoutV3Improved(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode = 'compact'
): { nodes: Node[]; edges: Edge[] } {
  const layout = new LayoutV3Improved(nodes, edges, { mode });
  return layout.apply();
}