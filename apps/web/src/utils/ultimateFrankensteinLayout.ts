/**
 * Ultimate Frankenstein Layout Algorithm
 * 
 * Kombiniert die besten Features aus allen 19 analysierten Algorithmen
 * mit Fokus auf Lesbarkeit, intelligente Label-Positionierung und
 * perfekte Frame-Handhabung.
 */

import { Node, Edge, MarkerType } from 'reactflow';

export type LayoutMode = 'compact' | 'horizontal' | 'vertical' | 'smart';

interface LayoutConfig {
  mode: LayoutMode;
  
  // Spacing (Lesbarkeit first!)
  minNodeSpacing: number;
  optimalNodeSpacing: number;
  rankSpacing: number;
  
  // Edge Routing
  routingMode: 'orthogonal' | 'curved' | 'smart';
  avoidanceBuffer: number;
  useLanes: boolean;
  laneSpacing: number;
  
  // Labels
  labelMode: 'fixed' | 'adaptive';
  labelPadding: number;
  
  // Frames
  frameMode: 'contain' | 'adapt';
  frameInnerPadding: number;
  frameAdaptive: boolean;
  
  // Performance
  maxIterations: number;
  qualityOverSpeed: boolean;
  
  // Visual
  laneColors: string[];
  enableCurvedFallback: boolean;
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
  incoming: Edge[];
  outgoing: Edge[];
  type?: string;
  
  // Neue Features
  flowWeight: number;  // Wichtigkeit im Flow
  isMainPath: boolean;  // Teil des Hauptpfads
  labelSpace: { top: number; right: number; bottom: number; left: number };  // Reservierter Platz für Labels
}

interface EdgeInfo {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  points?: { x: number; y: number }[];
  lane?: number;
  color?: string;
  labelPosition?: { x: number; y: number };
  labelDimensions?: { width: number; height: number };
  isCurved?: boolean;
  avoidancePoints?: { x: number; y: number }[];
}

interface FlowAnalysis {
  mainPath: string[];
  branchPoints: string[];
  mergePoints: string[];
  startNodes: string[];
  endNodes: string[];
  flowDirection: 'horizontal' | 'vertical' | 'mixed';
  density: number;
  complexity: number;
}

interface CollisionZone {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'node' | 'edge' | 'label';
  id: string;
}

export class UltimateFrankensteinLayout {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private config: LayoutConfig;
  private nodeInfoMap: Map<string, NodeInfo> = new Map();
  private edgeInfoMap: Map<string, EdgeInfo> = new Map();
  private frameRelations: Map<string, string> = new Map();
  private flowAnalysis: FlowAnalysis | null = null;
  private collisionZones: CollisionZone[] = [];
  private grid: Map<string, Set<string>> = new Map();  // Spatial index
  private labelPlacements: Map<string, { x: number; y: number }> = new Map();

  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    // Deterministische Sortierung (von layoutV3)
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
    
    this.config = {
      mode: 'smart',
      
      // Lesbarkeit first!
      minNodeSpacing: 60,
      optimalNodeSpacing: 100,
      rankSpacing: 150,
      
      // Smart routing
      routingMode: 'smart',
      avoidanceBuffer: 30,
      useLanes: true,
      laneSpacing: 20,
      
      // Adaptive labels
      labelMode: 'adaptive',
      labelPadding: 15,
      
      // Strict frames mit Anpassung
      frameMode: 'contain',
      frameInnerPadding: 40,
      frameAdaptive: true,
      
      // Qualität über Speed
      maxIterations: 100,
      qualityOverSpeed: true,
      
      // Visual
      laneColors: ['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'],
      enableCurvedFallback: true,
      
      ...config
    };
  }

  public apply(): { nodes: Node[]; edges: Edge[] } {
    console.log('[UltimateFrankenstein] Starting layout with', this.nodes.length, 'nodes and', this.edges.length, 'edges');
    
    // Phase 1: Analyse (von intelligentAutoLayout & geniusAutoLayout)
    this.analyzeStructure();
    this.analyzeFlow();
    
    // Phase 2: Level-Berechnung (von improvedLayout)
    this.calculateLevels();
    
    // Phase 3: Initiale Positionierung
    this.assignInitialPositions();
    
    // Phase 4: Frame-Handling (strict contain mit Anpassung)
    this.handleFramesStrict();
    
    // Phase 5: Node-Optimierung für Labels und Parallele Edges
    this.optimizeNodePositionsForEdges();
    
    // Phase 6: Kollisionsvermeidung (von layoutV2)
    this.avoidCollisions();
    
    // Phase 7: Edge-Routing (hybrid approach)
    this.routeEdges();
    
    // Phase 8: Label-Positionierung (adaptive)
    this.positionLabels();
    
    // Phase 9: Final Optimierung
    this.finalOptimization();
    
    // Phase 10: Zentrierung (von layoutV3 fix)
    this.centerLayout();
    
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
        type: node.type,
        flowWeight: 0,
        isMainPath: false,
        labelSpace: { top: 0, right: 0, bottom: 0, left: 0 }
      });

      if (node.parentNode) {
        this.frameRelations.set(node.id, node.parentNode);
      }
    });

    // Build adjacency
    this.edges.forEach(edge => {
      const sourceInfo = this.nodeInfoMap.get(edge.source);
      const targetInfo = this.nodeInfoMap.get(edge.target);
      
      if (sourceInfo && targetInfo) {
        sourceInfo.outgoing.push(edge);
        targetInfo.incoming.push(edge);
        
        // Initialize edge info
        this.edgeInfoMap.set(edge.id, {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          labelDimensions: edge.label ? this.estimateLabelSize(edge.label) : undefined
        });
      }
    });

    // Identify frame children
    this.nodeInfoMap.forEach(info => {
      if (info.parent) {
        const parentInfo = this.nodeInfoMap.get(info.parent);
        if (parentInfo) {
          parentInfo.children.push(info.id);
        }
      }
    });
  }

  private analyzeFlow(): void {
    // Find start and end nodes
    const startNodes = Array.from(this.nodeInfoMap.values()).filter(
      info => info.incoming.length === 0 || info.type === 'start'
    );
    
    const endNodes = Array.from(this.nodeInfoMap.values()).filter(
      info => info.outgoing.length === 0 || info.type === 'end'
    );

    // Find main path (longest path from start to end)
    const mainPath = this.findMainPath(startNodes, endNodes);
    
    // Mark main path nodes
    mainPath.forEach(nodeId => {
      const info = this.nodeInfoMap.get(nodeId);
      if (info) {
        info.isMainPath = true;
        info.flowWeight = 1.0;
      }
    });

    // Find branch and merge points
    const branchPoints: string[] = [];
    const mergePoints: string[] = [];
    
    this.nodeInfoMap.forEach(info => {
      if (info.outgoing.length > 1) branchPoints.push(info.id);
      if (info.incoming.length > 1) mergePoints.push(info.id);
    });

    // Detect flow direction
    let horizontalEdges = 0;
    let verticalEdges = 0;
    
    this.edges.forEach(edge => {
      const source = this.nodeInfoMap.get(edge.source);
      const target = this.nodeInfoMap.get(edge.target);
      if (source && target) {
        const dx = Math.abs(target.x - source.x);
        const dy = Math.abs(target.y - source.y);
        if (dx > dy) horizontalEdges++;
        else verticalEdges++;
      }
    });

    this.flowAnalysis = {
      mainPath,
      branchPoints,
      mergePoints,
      startNodes: startNodes.map(n => n.id),
      endNodes: endNodes.map(n => n.id),
      flowDirection: horizontalEdges > verticalEdges ? 'horizontal' : 'vertical',
      density: this.edges.length / this.nodes.length,
      complexity: branchPoints.length + mergePoints.length
    };
  }

  private findMainPath(startNodes: NodeInfo[], endNodes: NodeInfo[]): string[] {
    // Simple BFS to find longest path
    let longestPath: string[] = [];
    
    for (const start of startNodes) {
      const queue: { node: string; path: string[] }[] = [
        { node: start.id, path: [start.id] }
      ];
      const visited = new Set<string>();
      
      while (queue.length > 0) {
        const { node, path } = queue.shift()!;
        
        if (visited.has(node)) continue;
        visited.add(node);
        
        const info = this.nodeInfoMap.get(node)!;
        
        // Check if end node
        if (info.outgoing.length === 0 || info.type === 'end') {
          if (path.length > longestPath.length) {
            longestPath = path;
          }
        }
        
        // Add outgoing to queue
        info.outgoing.forEach(edge => {
          if (!visited.has(edge.target)) {
            queue.push({
              node: edge.target,
              path: [...path, edge.target]
            });
          }
        });
      }
    }
    
    return longestPath;
  }

  private calculateLevels(): void {
    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = [];
    
    // Start with nodes that have no incoming edges (or are start nodes)
    this.nodeInfoMap.forEach(info => {
      if (info.incoming.length === 0 || info.type === 'start') {
        queue.push({ id: info.id, level: 0 });
      }
    });

    // BFS for level assignment
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      const info = this.nodeInfoMap.get(id)!;
      info.level = level;
      
      // Process outgoing edges
      info.outgoing.forEach(edge => {
        if (!visited.has(edge.target)) {
          queue.push({ id: edge.target, level: level + 1 });
        }
      });
    }

    // Assign ranks within each level
    this.assignRanksIntelligently();
  }

  private assignRanksIntelligently(): void {
    const levelGroups = new Map<number, string[]>();
    
    this.nodeInfoMap.forEach(info => {
      if (!levelGroups.has(info.level)) {
        levelGroups.set(info.level, []);
      }
      levelGroups.get(info.level)!.push(info.id);
    });

    levelGroups.forEach((nodeIds, level) => {
      // Intelligent sorting
      nodeIds.sort((a, b) => {
        const aInfo = this.nodeInfoMap.get(a)!;
        const bInfo = this.nodeInfoMap.get(b)!;
        
        // 1. Main path nodes first
        if (aInfo.isMainPath !== bInfo.isMainPath) {
          return aInfo.isMainPath ? -1 : 1;
        }
        
        // 2. Group by parent frame
        const aParent = aInfo.parent || '';
        const bParent = bInfo.parent || '';
        if (aParent !== bParent) return aParent.localeCompare(bParent);
        
        // 3. By flow weight
        if (aInfo.flowWeight !== bInfo.flowWeight) {
          return bInfo.flowWeight - aInfo.flowWeight;
        }
        
        // 4. By connection count
        const aConn = aInfo.incoming.length + aInfo.outgoing.length;
        const bConn = bInfo.incoming.length + bInfo.outgoing.length;
        if (aConn !== bConn) return bConn - aConn;
        
        // 5. Alphabetically as fallback
        return a.localeCompare(b);
      });
      
      nodeIds.forEach((id, index) => {
        this.nodeInfoMap.get(id)!.rank = index;
      });
    });
  }

  private assignInitialPositions(): void {
    const mode = this.config.mode === 'smart' 
      ? (this.flowAnalysis?.flowDirection || 'horizontal')
      : this.config.mode;

    this.nodeInfoMap.forEach(info => {
      // Skip frame children for now
      if (info.parent && info.type !== 'frame') {
        return;
      }

      let x: number, y: number;

      if (mode === 'horizontal' || mode === 'compact') {
        x = info.level * this.config.rankSpacing;
        y = info.rank * this.config.optimalNodeSpacing;
        
        // Slight stagger for compact mode
        if (this.config.mode === 'compact' && info.level % 2 === 1) {
          y += this.config.optimalNodeSpacing * 0.2;
        }
      } else {
        x = info.rank * this.config.optimalNodeSpacing;
        y = info.level * this.config.rankSpacing;
      }

      info.x = x;
      info.y = y;
    });
  }

  private handleFramesStrict(): void {
    const frames = this.nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const frameInfo = this.nodeInfoMap.get(frame.id)!;
      
      if (frameInfo.children.length === 0) {
        // Empty frame - minimal size
        frameInfo.width = 300;
        frameInfo.height = 200;
        return;
      }

      const padding = this.config.frameInnerPadding;
      const children = frameInfo.children
        .map(id => this.nodeInfoMap.get(id)!)
        .filter(c => c !== undefined);

      if (this.config.frameAdaptive) {
        // Adaptive positioning - find best position for frame based on children connections
        const externalConnections = this.findExternalConnections(frameInfo, children);
        this.optimizeFramePosition(frameInfo, externalConnections);
      }

      // Calculate required frame size
      const childBounds = this.calculateChildrenBounds(children);
      frameInfo.width = childBounds.width + padding * 2;
      frameInfo.height = childBounds.height + padding * 2;

      // Position children within frame (hybrid approach)
      this.positionChildrenInFrame(frameInfo, children);
    });
  }

  private findExternalConnections(frame: NodeInfo, children: NodeInfo[]): Edge[] {
    const childIds = new Set(children.map(c => c.id));
    const external: Edge[] = [];
    
    children.forEach(child => {
      child.incoming.forEach(edge => {
        if (!childIds.has(edge.source) && edge.source !== frame.id) {
          external.push(edge);
        }
      });
      child.outgoing.forEach(edge => {
        if (!childIds.has(edge.target) && edge.target !== frame.id) {
          external.push(edge);
        }
      });
    });
    
    return external;
  }

  private optimizeFramePosition(frame: NodeInfo, externalConnections: Edge[]): void {
    if (externalConnections.length === 0) return;
    
    // Calculate optimal position based on external connections
    let sumX = 0, sumY = 0, count = 0;
    
    externalConnections.forEach(edge => {
      const externalNode = this.nodeInfoMap.get(
        edge.source === frame.id ? edge.target : edge.source
      );
      if (externalNode) {
        sumX += externalNode.x;
        sumY += externalNode.y;
        count++;
      }
    });
    
    if (count > 0) {
      // Position frame near center of external connections
      frame.x = sumX / count - frame.width / 2;
      frame.y = sumY / count - frame.height / 2;
    }
  }

  private calculateChildrenBounds(children: NodeInfo[]): { width: number; height: number } {
    if (children.length === 0) return { width: 0, height: 0 };
    
    const levelGroups = new Map<number, NodeInfo[]>();
    children.forEach(child => {
      const relLevel = child.level;
      if (!levelGroups.has(relLevel)) {
        levelGroups.set(relLevel, []);
      }
      levelGroups.get(relLevel)!.push(child);
    });
    
    let maxWidth = 0;
    let totalHeight = 0;
    
    levelGroups.forEach(levelChildren => {
      const levelWidth = levelChildren.reduce((sum, c) => sum + c.width, 0) + 
                        (levelChildren.length - 1) * this.config.minNodeSpacing;
      maxWidth = Math.max(maxWidth, levelWidth);
      
      const levelHeight = Math.max(...levelChildren.map(c => c.height));
      totalHeight += levelHeight + this.config.minNodeSpacing;
    });
    
    return { width: maxWidth, height: totalHeight };
  }

  private positionChildrenInFrame(frame: NodeInfo, children: NodeInfo[]): void {
    const padding = this.config.frameInnerPadding;
    
    // Group by level
    const levelGroups = new Map<number, NodeInfo[]>();
    children.forEach(child => {
      const relLevel = child.level;
      if (!levelGroups.has(relLevel)) {
        levelGroups.set(relLevel, []);
      }
      levelGroups.get(relLevel)!.push(child);
    });
    
    let currentY = frame.y + padding;
    
    levelGroups.forEach(levelChildren => {
      // Sort by rank within level
      levelChildren.sort((a, b) => a.rank - b.rank);
      
      // Calculate total width for this level
      const totalWidth = levelChildren.reduce((sum, c) => sum + c.width, 0) + 
                        (levelChildren.length - 1) * this.config.minNodeSpacing;
      
      // Center horizontally
      let currentX = frame.x + (frame.width - totalWidth) / 2;
      
      levelChildren.forEach(child => {
        child.x = currentX;
        child.y = currentY;
        currentX += child.width + this.config.minNodeSpacing;
      });
      
      const levelHeight = Math.max(...levelChildren.map(c => c.height));
      currentY += levelHeight + this.config.minNodeSpacing;
    });
  }

  private optimizeNodePositionsForEdges(): void {
    // Detect parallel edges
    const parallelEdges = this.detectParallelEdges();
    
    // Slightly shift nodes to avoid parallel edge overlap
    parallelEdges.forEach(edgeGroup => {
      if (edgeGroup.length > 1) {
        this.adjustNodesForParallelEdges(edgeGroup);
      }
    });
    
    // Reserve space for labels
    this.reserveLabelSpace();
  }

  private detectParallelEdges(): Edge[][] {
    const edgeGroups = new Map<string, Edge[]>();
    
    this.edges.forEach(edge => {
      const key = [edge.source, edge.target].sort().join('-');
      if (!edgeGroups.has(key)) {
        edgeGroups.set(key, []);
      }
      edgeGroups.get(key)!.push(edge);
    });
    
    return Array.from(edgeGroups.values()).filter(group => group.length > 1);
  }

  private adjustNodesForParallelEdges(edges: Edge[]): void {
    // Small adjustment to separate parallel edges
    const adjustment = 10;
    
    edges.forEach((edge, index) => {
      if (index > 0) {
        const targetInfo = this.nodeInfoMap.get(edge.target);
        if (targetInfo && !targetInfo.parent) {  // Don't move frame children
          // Slight vertical offset
          targetInfo.y += adjustment * index;
        }
      }
    });
  }

  private reserveLabelSpace(): void {
    this.edges.forEach(edge => {
      if (!edge.label) return;
      
      const edgeInfo = this.edgeInfoMap.get(edge.id)!;
      const labelSize = edgeInfo.labelDimensions!;
      
      // Reserve space around nodes for labels
      const sourceInfo = this.nodeInfoMap.get(edge.source)!;
      const targetInfo = this.nodeInfoMap.get(edge.target)!;
      
      // Simple reservation - can be improved
      sourceInfo.labelSpace.right = Math.max(sourceInfo.labelSpace.right, labelSize.width / 2);
      targetInfo.labelSpace.left = Math.max(targetInfo.labelSpace.left, labelSize.width / 2);
    });
  }

  private avoidCollisions(): void {
    // Build spatial index
    this.buildSpatialIndex();
    
    let iterations = 0;
    let hasCollisions = true;
    
    while (hasCollisions && iterations < this.config.maxIterations) {
      hasCollisions = false;
      
      // Check all node pairs
      const nodes = Array.from(this.nodeInfoMap.values());
      
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];
          
          // Skip if different levels (too far apart)
          if (Math.abs(nodeA.level - nodeB.level) > 1) continue;
          
          // Check collision
          if (this.nodesCollide(nodeA, nodeB)) {
            hasCollisions = true;
            this.resolveCollision(nodeA, nodeB);
          }
        }
      }
      
      iterations++;
    }
    
    if (iterations === this.config.maxIterations) {
      console.warn('[UltimateFrankenstein] Max iterations reached in collision avoidance');
    }
  }

  private buildSpatialIndex(): void {
    this.grid.clear();
    const cellSize = 100;
    
    this.nodeInfoMap.forEach(node => {
      const gridX = Math.floor(node.x / cellSize);
      const gridY = Math.floor(node.y / cellSize);
      const key = `${gridX},${gridY}`;
      
      if (!this.grid.has(key)) {
        this.grid.set(key, new Set());
      }
      this.grid.get(key)!.add(node.id);
    });
  }

  private nodesCollide(a: NodeInfo, b: NodeInfo): boolean {
    const margin = this.config.minNodeSpacing;
    
    return !(
      a.x + a.width + margin < b.x ||
      b.x + b.width + margin < a.x ||
      a.y + a.height + margin < b.y ||
      b.y + b.height + margin < a.y
    );
  }

  private resolveCollision(a: NodeInfo, b: NodeInfo): void {
    // Calculate overlap
    const overlapX = (a.x + a.width + this.config.minNodeSpacing) - b.x;
    const overlapY = (a.y + a.height + this.config.minNodeSpacing) - b.y;
    
    // Move the node with lower priority
    const moveNode = a.isMainPath && !b.isMainPath ? b : a;
    
    if (Math.abs(overlapX) < Math.abs(overlapY)) {
      moveNode.x += overlapX * 1.1;
    } else {
      moveNode.y += overlapY * 1.1;
    }
  }

  private routeEdges(): void {
    this.edges.forEach(edge => {
      const edgeInfo = this.edgeInfoMap.get(edge.id)!;
      const sourceInfo = this.nodeInfoMap.get(edge.source)!;
      const targetInfo = this.nodeInfoMap.get(edge.target)!;
      
      // Smart handle selection
      const handles = this.selectOptimalHandles(sourceInfo, targetInfo);
      edgeInfo.sourceHandle = handles.source;
      edgeInfo.targetHandle = handles.target;
      
      // Check if parallel edges exist
      const isParallel = this.hasParallelEdge(edge);
      
      if (isParallel && this.config.enableCurvedFallback) {
        // Use curved edges for parallel connections
        edgeInfo.isCurved = true;
        this.calculateCurvedPath(edgeInfo, sourceInfo, targetInfo);
      } else {
        // Smart routing with collision avoidance
        this.calculateSmartPath(edgeInfo, sourceInfo, targetInfo);
      }
      
      // Assign lane and color if using lanes
      if (this.config.useLanes) {
        this.assignLane(edgeInfo);
      }
    });
  }

  private selectOptimalHandles(source: NodeInfo, target: NodeInfo): { source: string; target: string } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    
    let sourceHandle: string, targetHandle: string;
    
    // Smart selection based on relative positions and flow
    if (source.level === target.level) {
      // Same level - prefer vertical connection
      if (dy > this.config.minNodeSpacing) {
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else if (dy < -this.config.minNodeSpacing) {
        sourceHandle = 'top';
        targetHandle = 'bottom';
      } else {
        // Horizontal for same level, same rank
        sourceHandle = dx > 0 ? 'right' : 'left';
        targetHandle = dx > 0 ? 'left' : 'right';
      }
    } else {
      // Different levels - prefer based on flow direction
      if (this.flowAnalysis?.flowDirection === 'horizontal') {
        sourceHandle = dx > 0 ? 'right' : 'left';
        targetHandle = dx > 0 ? 'left' : 'right';
      } else {
        sourceHandle = dy > 0 ? 'bottom' : 'top';
        targetHandle = dy > 0 ? 'top' : 'bottom';
      }
    }
    
    return { source: sourceHandle, target: targetHandle };
  }

  private hasParallelEdge(edge: Edge): boolean {
    return this.edges.some(e => 
      e.id !== edge.id && 
      ((e.source === edge.source && e.target === edge.target) ||
       (e.source === edge.target && e.target === edge.source))
    );
  }

  private calculateCurvedPath(edge: EdgeInfo, source: NodeInfo, target: NodeInfo): void {
    // Calculate control points for bezier curve
    const sourcePos = this.getHandlePosition(source, edge.sourceHandle!);
    const targetPos = this.getHandlePosition(target, edge.targetHandle!);
    
    const midX = (sourcePos.x + targetPos.x) / 2;
    const midY = (sourcePos.y + targetPos.y) / 2;
    
    // Curve amount based on distance
    const distance = Math.sqrt(Math.pow(targetPos.x - sourcePos.x, 2) + Math.pow(targetPos.y - sourcePos.y, 2));
    const curveOffset = Math.min(distance * 0.3, 100);
    
    // Direction of curve based on edge direction
    const isReverse = this.edges.some(e => 
      e.source === edge.target && e.target === edge.source
    );
    
    const controlPoint = {
      x: midX + (isReverse ? curveOffset : -curveOffset),
      y: midY
    };
    
    edge.points = [sourcePos, controlPoint, targetPos];
  }

  private calculateSmartPath(edge: EdgeInfo, source: NodeInfo, target: NodeInfo): void {
    const sourcePos = this.getHandlePosition(source, edge.sourceHandle!);
    const targetPos = this.getHandlePosition(target, edge.targetHandle!);
    
    // Check for obstacles
    const obstacles = this.detectObstacles(source, target, sourcePos, targetPos);
    
    if (obstacles.length > 0) {
      // Route around obstacles with clear separation
      edge.avoidancePoints = this.calculateAvoidancePath(sourcePos, targetPos, obstacles);
      edge.points = [sourcePos, ...edge.avoidancePoints, targetPos];
    } else {
      // Simple orthogonal routing
      const points = this.calculateOrthogonalPath(sourcePos, targetPos, edge.sourceHandle!, edge.targetHandle!);
      edge.points = points;
    }
  }

  private detectObstacles(source: NodeInfo, target: NodeInfo, sourcePos: any, targetPos: any): NodeInfo[] {
    const obstacles: NodeInfo[] = [];
    const buffer = this.config.avoidanceBuffer;
    
    // Define bounding box for edge path
    const minX = Math.min(sourcePos.x, targetPos.x) - buffer;
    const maxX = Math.max(sourcePos.x, targetPos.x) + buffer;
    const minY = Math.min(sourcePos.y, targetPos.y) - buffer;
    const maxY = Math.max(sourcePos.y, targetPos.y) + buffer;
    
    this.nodeInfoMap.forEach(node => {
      if (node.id === source.id || node.id === target.id) return;
      
      // Check if node is in path
      if (node.x < maxX && node.x + node.width > minX &&
          node.y < maxY && node.y + node.height > minY) {
        obstacles.push(node);
      }
    });
    
    return obstacles;
  }

  private calculateAvoidancePath(start: any, end: any, obstacles: NodeInfo[]): any[] {
    const points: any[] = [];
    
    if (obstacles.length === 0) return points;
    
    // Sort obstacles by distance from start
    obstacles.sort((a, b) => {
      const distA = Math.hypot(a.x - start.x, a.y - start.y);
      const distB = Math.hypot(b.x - start.x, b.y - start.y);
      return distA - distB;
    });
    
    // Route around first obstacle with clear separation
    const obstacle = obstacles[0];
    const buffer = this.config.avoidanceBuffer;
    
    // Determine best route (prefer going around the shorter side)
    const goLeft = start.x < obstacle.x + obstacle.width / 2;
    const goTop = start.y < obstacle.y + obstacle.height / 2;
    
    if (goLeft) {
      points.push({ 
        x: obstacle.x - buffer, 
        y: start.y 
      });
      points.push({ 
        x: obstacle.x - buffer, 
        y: end.y 
      });
    } else {
      points.push({ 
        x: obstacle.x + obstacle.width + buffer, 
        y: start.y 
      });
      points.push({ 
        x: obstacle.x + obstacle.width + buffer, 
        y: end.y 
      });
    }
    
    return points;
  }

  private calculateOrthogonalPath(sourcePos: any, targetPos: any, sourceHandle: string, targetHandle: string): any[] {
    const points = [sourcePos];
    
    if (sourceHandle === 'bottom' || sourceHandle === 'top') {
      const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
      points.push({ x: sourcePos.x, y: midY });
      points.push({ x: targetPos.x, y: midY });
    } else {
      const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
      points.push({ x: midX, y: sourcePos.y });
      points.push({ x: midX, y: targetPos.y });
    }
    
    points.push(targetPos);
    return points;
  }

  private assignLane(edge: EdgeInfo): void {
    // Group edges by source-target pair
    const key = [edge.source, edge.target].sort().join('-');
    const sameRouteEdges = Array.from(this.edgeInfoMap.values()).filter(e => {
      const eKey = [e.source, e.target].sort().join('-');
      return eKey === key;
    });
    
    // Assign lane index
    edge.lane = sameRouteEdges.indexOf(edge);
    edge.color = this.config.laneColors[edge.lane % this.config.laneColors.length];
  }

  private positionLabels(): void {
    this.edges.forEach(edge => {
      if (!edge.label) return;
      
      const edgeInfo = this.edgeInfoMap.get(edge.id)!;
      const points = edgeInfo.points || [];
      
      if (points.length < 2) return;
      
      // Find midpoint of edge
      const midIndex = Math.floor(points.length / 2);
      const midPoint = points[midIndex];
      
      // Check for label collisions
      const labelPos = this.findOptimalLabelPosition(midPoint, edgeInfo.labelDimensions!);
      
      edgeInfo.labelPosition = labelPos;
      this.labelPlacements.set(edge.id, labelPos);
    });
  }

  private findOptimalLabelPosition(basePos: any, labelSize: any): any {
    const positions = [
      { x: basePos.x, y: basePos.y },  // Center
      { x: basePos.x, y: basePos.y - labelSize.height - 10 },  // Above
      { x: basePos.x, y: basePos.y + labelSize.height + 10 },  // Below
      { x: basePos.x - labelSize.width - 10, y: basePos.y },  // Left
      { x: basePos.x + labelSize.width + 10, y: basePos.y },  // Right
    ];
    
    // Find position with least collisions
    let bestPos = positions[0];
    let minCollisions = Infinity;
    
    positions.forEach(pos => {
      const collisions = this.countLabelCollisions(pos, labelSize);
      if (collisions < minCollisions) {
        minCollisions = collisions;
        bestPos = pos;
      }
    });
    
    return bestPos;
  }

  private countLabelCollisions(pos: any, size: any): number {
    let collisions = 0;
    
    // Check against other labels
    this.labelPlacements.forEach(otherPos => {
      if (Math.abs(pos.x - otherPos.x) < size.width &&
          Math.abs(pos.y - otherPos.y) < size.height) {
        collisions++;
      }
    });
    
    // Check against nodes
    this.nodeInfoMap.forEach(node => {
      if (pos.x < node.x + node.width && pos.x + size.width > node.x &&
          pos.y < node.y + node.height && pos.y + size.height > node.y) {
        collisions += 2;  // Nodes are more important to avoid
      }
    });
    
    return collisions;
  }

  private finalOptimization(): void {
    // Final pass to ensure quality
    
    // 1. Ensure no negative coordinates
    let minX = Infinity, minY = Infinity;
    this.nodeInfoMap.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    });
    
    if (minX < 0 || minY < 0) {
      const offsetX = minX < 0 ? -minX + 50 : 0;
      const offsetY = minY < 0 ? -minY + 50 : 0;
      
      this.nodeInfoMap.forEach(node => {
        node.x += offsetX;
        node.y += offsetY;
      });
    }
    
    // 2. Ensure frame children are contained
    const frames = Array.from(this.nodeInfoMap.values()).filter(n => n.type === 'frame');
    frames.forEach(frame => {
      frame.children.forEach(childId => {
        const child = this.nodeInfoMap.get(childId)!;
        
        // Ensure child is within frame bounds
        const padding = this.config.frameInnerPadding;
        child.x = Math.max(frame.x + padding, Math.min(child.x, frame.x + frame.width - child.width - padding));
        child.y = Math.max(frame.y + padding, Math.min(child.y, frame.y + frame.height - child.height - padding));
      });
    });
  }

  private centerLayout(): void {
    // Center entire layout
    const allNodes = Array.from(this.nodeInfoMap.values());
    if (allNodes.length === 0) return;
    
    const bounds = {
      minX: Math.min(...allNodes.map(n => n.x)),
      minY: Math.min(...allNodes.map(n => n.y)),
      maxX: Math.max(...allNodes.map(n => n.x + n.width)),
      maxY: Math.max(...allNodes.map(n => n.y + n.height))
    };
    
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    
    // Center at reasonable viewport position
    const viewportCenterX = 800;
    const viewportCenterY = 450;
    
    const offsetX = viewportCenterX - width / 2 - bounds.minX;
    const offsetY = viewportCenterY - height / 2 - bounds.minY;
    
    // Apply offset to all nodes
    allNodes.forEach(node => {
      node.x += offsetX;
      node.y += offsetY;
    });
    
    // Update edge points as well
    this.edgeInfoMap.forEach(edge => {
      if (edge.points) {
        edge.points = edge.points.map(p => ({
          x: p.x + offsetX,
          y: p.y + offsetY
        }));
      }
      if (edge.labelPosition) {
        edge.labelPosition.x += offsetX;
        edge.labelPosition.y += offsetY;
      }
    });
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

  private estimateLabelSize(label: string): { width: number; height: number } {
    // Estimate based on character count
    const charWidth = 8;
    const charHeight = 20;
    return {
      width: label.length * charWidth + 20,
      height: charHeight + 10
    };
  }

  private formatForReactFlow(): { nodes: Node[]; edges: Edge[] } {
    // Update nodes
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
          rank: info.rank,
          isMainPath: info.isMainPath
        }
      };
    });
    
    // Update edges
    const updatedEdges = this.edges.map(edge => {
      const info = this.edgeInfoMap.get(edge.id)!;
      
      const edgeUpdate: any = {
        ...edge,
        sourceHandle: info.sourceHandle || 'right',
        targetHandle: info.targetHandle || 'left',
        type: info.isCurved ? 'bezier' : 'smoothstep',
        animated: info.isMainPath,
        style: {
          stroke: info.color || '#666',
          strokeWidth: info.isMainPath ? 3 : 2
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: info.color || '#666'
        }
      };
      
      // Add label position if available
      if (info.labelPosition) {
        edgeUpdate.labelStyle = {
          transform: `translate(${info.labelPosition.x}px, ${info.labelPosition.y}px)`
        };
      }
      
      return edgeUpdate;
    });
    
    return {
      nodes: updatedNodes,
      edges: updatedEdges
    };
  }
}

// Export function
export function applyUltimateFrankensteinLayout(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode = 'smart'
): { nodes: Node[]; edges: Edge[] } {
  const layout = new UltimateFrankensteinLayout(nodes, edges, { mode });
  return layout.apply();
}