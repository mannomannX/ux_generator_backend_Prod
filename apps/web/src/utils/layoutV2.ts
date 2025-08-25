/**
 * Layout Algorithm V2 - Mit verbessertem Edge-Routing
 * 
 * Iteration 2: Lane-System, A* Pathfinding, Kollisionsvermeidung
 */

import { Node, Edge } from 'reactflow';

// ============================================================================
// TYPES
// ============================================================================

interface Point {
  x: number;
  y: number;
}

interface GridCell {
  x: number;
  y: number;
  occupied: boolean;
  nodeId?: string;
  cost: number;
}

interface NodeInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  gridBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

interface HandleSlot {
  nodeId: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  position: number; // 0-1 (prozentuale Position auf der Seite)
  point: Point;
  edgeId: string;
  direction: 'in' | 'out';
}

interface EdgeRoute {
  id: string;
  source: string;
  target: string;
  sourceHandle: HandleSlot;
  targetHandle: HandleSlot;
  path: Point[];
  lane: number;
  color?: string;
}

interface LayoutResultV2 {
  nodes: Node[];
  edges: Edge[];
  routes: EdgeRoute[];
  grid: GridCell[][];
  problems: string[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    gridSize: { width: number; height: number };
    collisionsAvoided: number;
    routingTime: number;
  };
}

// ============================================================================
// MAIN ALGORITHM V2
// ============================================================================

export class LayoutAlgorithmV2 {
  private nodes: Node[];
  private edges: Edge[];
  private nodeInfos: Map<string, NodeInfo>;
  private grid: GridCell[][];
  private routes: EdgeRoute[];
  private handleSlots: Map<string, HandleSlot[]>;
  private problems: string[];
  private stats: any;
  
  // Konfiguration
  private readonly GRID_CELL_SIZE = 10; // Pixel pro Grid-Zelle
  private readonly NODE_PADDING = 40;   // Padding um Nodes
  private readonly LANE_WIDTH = 20;     // Abstand zwischen parallelen Edges
  private readonly MAX_HANDLES_PER_SIDE = 5;
  
  constructor(nodes: Node[], edges: Edge[]) {
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => 
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );
    
    this.nodeInfos = new Map();
    this.grid = [];
    this.routes = [];
    this.handleSlots = new Map();
    this.problems = [];
    this.stats = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      gridSize: { width: 0, height: 0 },
      collisionsAvoided: 0,
      routingTime: 0
    };
  }
  
  /**
   * Hauptausführung
   */
  public execute(): LayoutResultV2 {
    const startTime = Date.now();
    
    // Phase 1: Graph-Analyse und Level-Berechnung
    this.analyzeGraph();
    
    // Phase 2: Positionierung mit Compact-Layout
    this.positionNodes();
    
    // Phase 3: Grid erstellen für Pathfinding
    this.createGrid();
    
    // Phase 4: Dynamische Handle-Zuweisung
    this.assignDynamicHandles();
    
    // Phase 5: Edge-Routing mit A* und Lanes
    this.routeEdgesWithPathfinding();
    
    // Phase 6: Kollisionsprüfung und -behebung
    this.resolveCollisions();
    
    this.stats.routingTime = Date.now() - startTime;
    
    return this.buildResult();
  }
  
  // ============================================================================
  // PHASE 1: Graph-Analyse
  // ============================================================================
  
  private analyzeGraph(): void {
    // Initialisiere NodeInfos
    this.nodes.forEach(node => {
      this.nodeInfos.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || 180,
        height: node.height || 80,
        level: -1,
        gridBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
      });
    });
    
    // Level-Berechnung mit BFS
    const visited = new Set<string>();
    const queue: Array<{id: string, level: number}> = [];
    
    // Finde Start-Nodes
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || !this.edges.some(e => e.target === n.id)
    );
    
    startNodes.forEach(n => queue.push({ id: n.id, level: 0 }));
    
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      
      visited.add(id);
      this.nodeInfos.get(id)!.level = level;
      
      // Füge verbundene Nodes hinzu
      this.edges
        .filter(e => e.source === id)
        .forEach(e => {
          if (!visited.has(e.target)) {
            queue.push({ id: e.target, level: level + 1 });
          }
        });
    }
    
    // Isolierte Nodes
    let maxLevel = 0;
    this.nodeInfos.forEach(info => {
      maxLevel = Math.max(maxLevel, info.level);
    });
    
    this.nodeInfos.forEach(info => {
      if (info.level === -1) {
        info.level = maxLevel + 1;
      }
    });
  }
  
  // ============================================================================
  // PHASE 2: Node-Positionierung
  // ============================================================================
  
  private positionNodes(): void {
    // Gruppiere nach Level
    const levels = new Map<number, string[]>();
    
    this.nodeInfos.forEach((info, id) => {
      if (!levels.has(info.level)) {
        levels.set(info.level, []);
      }
      levels.get(info.level)!.push(id);
    });
    
    // Positioniere Level für Level
    let currentY = 100;
    const SPACING_X = 250;
    const SPACING_Y = 180;
    
    Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
      const nodesInLevel = levels.get(level)!;
      
      // Sortiere für Determinismus
      nodesInLevel.sort();
      
      // Berechne X-Positionen (zentriert)
      const totalWidth = nodesInLevel.length * SPACING_X;
      let currentX = Math.max(100, (1200 - totalWidth) / 2);
      
      nodesInLevel.forEach(nodeId => {
        const info = this.nodeInfos.get(nodeId)!;
        info.x = currentX;
        info.y = currentY;
        currentX += SPACING_X;
      });
      
      currentY += SPACING_Y;
    });
  }
  
  // ============================================================================
  // PHASE 3: Grid für Pathfinding
  // ============================================================================
  
  private createGrid(): void {
    // Finde Grid-Dimensionen
    let maxX = 0, maxY = 0;
    
    this.nodeInfos.forEach(info => {
      maxX = Math.max(maxX, info.x + info.width + this.NODE_PADDING * 2);
      maxY = Math.max(maxY, info.y + info.height + this.NODE_PADDING * 2);
    });
    
    // Erstelle Grid
    const gridWidth = Math.ceil(maxX / this.GRID_CELL_SIZE) + 10;
    const gridHeight = Math.ceil(maxY / this.GRID_CELL_SIZE) + 10;
    
    this.stats.gridSize = { width: gridWidth, height: gridHeight };
    
    this.grid = [];
    for (let y = 0; y < gridHeight; y++) {
      this.grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        this.grid[y][x] = {
          x,
          y,
          occupied: false,
          cost: 1
        };
      }
    }
    
    // Markiere Nodes als belegt (mit Padding)
    this.nodeInfos.forEach((info, nodeId) => {
      const minX = Math.floor((info.x - this.NODE_PADDING) / this.GRID_CELL_SIZE);
      const maxX = Math.ceil((info.x + info.width + this.NODE_PADDING) / this.GRID_CELL_SIZE);
      const minY = Math.floor((info.y - this.NODE_PADDING) / this.GRID_CELL_SIZE);
      const maxY = Math.ceil((info.y + info.height + this.NODE_PADDING) / this.GRID_CELL_SIZE);
      
      info.gridBounds = { minX, maxX, minY, maxY };
      
      for (let y = minY; y <= maxY && y < gridHeight; y++) {
        for (let x = minX; x <= maxX && x < gridWidth; x++) {
          if (y >= 0 && x >= 0) {
            this.grid[y][x].occupied = true;
            this.grid[y][x].nodeId = nodeId;
            
            // Erhöhe Kosten in der Nähe von Nodes
            const distance = Math.min(
              Math.abs(x - minX),
              Math.abs(x - maxX),
              Math.abs(y - minY),
              Math.abs(y - maxY)
            );
            this.grid[y][x].cost = 1 + Math.max(0, 5 - distance);
          }
        }
      }
    });
  }
  
  // ============================================================================
  // PHASE 4: Dynamische Handle-Zuweisung
  // ============================================================================
  
  private assignDynamicHandles(): void {
    this.nodes.forEach(node => {
      const info = this.nodeInfos.get(node.id)!;
      const slots: HandleSlot[] = [];
      
      // Sammle Edges
      const incoming = this.edges.filter(e => e.target === node.id);
      const outgoing = this.edges.filter(e => e.source === node.id);
      
      // Analysiere Richtungen für optimale Handle-Platzierung
      const incomingDirections = this.analyzeEdgeDirections(node.id, incoming, 'incoming');
      const outgoingDirections = this.analyzeEdgeDirections(node.id, outgoing, 'outgoing');
      
      // Weise Handles zu mit dynamischer Anzahl
      this.assignHandlesToSides(info, incoming, incomingDirections, 'in', slots);
      this.assignHandlesToSides(info, outgoing, outgoingDirections, 'out', slots);
      
      this.handleSlots.set(node.id, slots);
    });
  }
  
  private analyzeEdgeDirections(
    nodeId: string,
    edges: Edge[],
    type: 'incoming' | 'outgoing'
  ): Map<string, string> {
    const directions = new Map<string, string>();
    const nodeInfo = this.nodeInfos.get(nodeId)!;
    
    edges.forEach(edge => {
      const otherId = type === 'incoming' ? edge.source : edge.target;
      const otherInfo = this.nodeInfos.get(otherId);
      
      if (!otherInfo) {
        directions.set(edge.id, 'bottom');
        return;
      }
      
      // Berechne optimale Seite basierend auf Position
      const dx = otherInfo.x - nodeInfo.x;
      const dy = otherInfo.y - nodeInfo.y;
      
      let side: string;
      if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        // Horizontal dominant
        side = dx > 0 ? 'right' : 'left';
      } else {
        // Vertikal dominant
        side = dy > 0 ? 'bottom' : 'top';
      }
      
      // Für incoming: invertiere Seite
      if (type === 'incoming') {
        const inverseSides: Record<string, string> = {
          'top': 'bottom',
          'bottom': 'top',
          'left': 'right',
          'right': 'left'
        };
        side = inverseSides[side];
      }
      
      directions.set(edge.id, side);
    });
    
    return directions;
  }
  
  private assignHandlesToSides(
    nodeInfo: NodeInfo,
    edges: Edge[],
    directions: Map<string, string>,
    direction: 'in' | 'out',
    slots: HandleSlot[]
  ): void {
    // Gruppiere Edges nach Seite
    const bySide = new Map<string, Edge[]>();
    
    edges.forEach(edge => {
      const side = directions.get(edge.id) || 'bottom';
      if (!bySide.has(side)) {
        bySide.set(side, []);
      }
      bySide.get(side)!.push(edge);
    });
    
    // Weise Handles für jede Seite zu
    bySide.forEach((edgesOnSide, side) => {
      const count = Math.min(edgesOnSide.length, this.MAX_HANDLES_PER_SIDE);
      
      edgesOnSide.forEach((edge, index) => {
        // Verteile gleichmäßig über die Seite
        const position = (index + 1) / (count + 1);
        const point = this.calculateHandlePoint(nodeInfo, side as any, position);
        
        slots.push({
          nodeId: nodeInfo.id,
          side: side as any,
          position,
          point,
          edgeId: edge.id,
          direction
        });
      });
    });
  }
  
  private calculateHandlePoint(
    node: NodeInfo,
    side: 'top' | 'right' | 'bottom' | 'left',
    position: number
  ): Point {
    switch(side) {
      case 'top':
        return { x: node.x + node.width * position, y: node.y };
      case 'bottom':
        return { x: node.x + node.width * position, y: node.y + node.height };
      case 'left':
        return { x: node.x, y: node.y + node.height * position };
      case 'right':
        return { x: node.x + node.width, y: node.y + node.height * position };
    }
  }
  
  // ============================================================================
  // PHASE 5: A* Pathfinding für Edge-Routing
  // ============================================================================
  
  private routeEdgesWithPathfinding(): void {
    // Gruppiere parallele Edges für Lane-Zuweisung
    const edgeGroups = this.groupParallelEdges();
    
    edgeGroups.forEach(group => {
      group.forEach((edge, laneIndex) => {
        const sourceSlots = this.handleSlots.get(edge.source) || [];
        const targetSlots = this.handleSlots.get(edge.target) || [];
        
        const sourceSlot = sourceSlots.find(s => s.edgeId === edge.id);
        const targetSlot = targetSlots.find(s => s.edgeId === edge.id);
        
        if (!sourceSlot || !targetSlot) {
          this.problems.push(`Keine Handles für Edge ${edge.id}`);
          return;
        }
        
        // A* Pathfinding mit Lane-Offset
        const path = this.findPath(sourceSlot, targetSlot, laneIndex);
        
        this.routes.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: sourceSlot,
          targetHandle: targetSlot,
          path,
          lane: laneIndex,
          color: this.getEdgeColor(laneIndex)
        });
      });
    });
  }
  
  private groupParallelEdges(): Edge[][] {
    const groups: Edge[][] = [];
    const processed = new Set<string>();
    
    this.edges.forEach(edge => {
      if (processed.has(edge.id)) return;
      
      // Finde alle Edges mit gleicher Source und Target (oder umgekehrt)
      const parallel = this.edges.filter(e => 
        (e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source)
      );
      
      parallel.forEach(e => processed.add(e.id));
      groups.push(parallel);
    });
    
    return groups;
  }
  
  private findPath(start: HandleSlot, end: HandleSlot, lane: number): Point[] {
    // Vereinfachtes A* Pathfinding
    const startGrid = this.pointToGrid(start.point);
    const endGrid = this.pointToGrid(end.point);
    
    // Für den Moment: Intelligentes Manhattan-Routing
    const path: Point[] = [start.point];
    
    // Gehe vom Start-Handle weg
    const startOffset = this.getOffsetPoint(start.point, start.side, 30 + lane * this.LANE_WIDTH);
    path.push(startOffset);
    
    // Gehe zum End-Handle
    const endOffset = this.getOffsetPoint(end.point, end.side, 30 + lane * this.LANE_WIDTH);
    
    // Verbinde mit intelligentem Routing
    if (start.side === 'bottom' && end.side === 'top') {
      // Direkter vertikaler Pfad
      const midY = (startOffset.y + endOffset.y) / 2;
      path.push({ x: startOffset.x, y: midY });
      path.push({ x: endOffset.x, y: midY });
    } else if (start.side === 'right' && end.side === 'left') {
      // Direkter horizontaler Pfad
      const midX = (startOffset.x + endOffset.x) / 2;
      path.push({ x: midX, y: startOffset.y });
      path.push({ x: midX, y: endOffset.y });
    } else {
      // Komplexeres Routing
      const needsDetour = this.checkIfPathBlocked(startOffset, endOffset);
      
      if (needsDetour) {
        // Umweg um Hindernisse
        const detour = this.calculateDetour(startOffset, endOffset, start.side, end.side);
        path.push(...detour);
        this.stats.collisionsAvoided++;
      } else {
        // Standard Manhattan
        if (startOffset.x !== endOffset.x && startOffset.y !== endOffset.y) {
          path.push({ x: endOffset.x, y: startOffset.y });
        }
      }
    }
    
    path.push(endOffset);
    path.push(end.point);
    
    return path;
  }
  
  private checkIfPathBlocked(start: Point, end: Point): boolean {
    // Prüfe ob direkter Pfad durch Node geht
    const startGrid = this.pointToGrid(start);
    const endGrid = this.pointToGrid(end);
    
    // Prüfe horizontale und vertikale Linien
    const minX = Math.min(startGrid.x, endGrid.x);
    const maxX = Math.max(startGrid.x, endGrid.x);
    const minY = Math.min(startGrid.y, endGrid.y);
    const maxY = Math.max(startGrid.y, endGrid.y);
    
    for (let x = minX; x <= maxX; x++) {
      if (this.grid[startGrid.y] && this.grid[startGrid.y][x]?.occupied) {
        return true;
      }
    }
    
    for (let y = minY; y <= maxY; y++) {
      if (this.grid[y] && this.grid[y][endGrid.x]?.occupied) {
        return true;
      }
    }
    
    return false;
  }
  
  private calculateDetour(
    start: Point,
    end: Point,
    startSide: string,
    endSide: string
  ): Point[] {
    const detour: Point[] = [];
    
    // Intelligenter Umweg basierend auf Hindernissen
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    // Finde freien Bereich für Umweg
    const freeY = this.findFreeHorizontalLane(start.y, end.y);
    const freeX = this.findFreeVerticalLane(start.x, end.x);
    
    if (startSide === 'bottom' || startSide === 'top') {
      detour.push({ x: start.x, y: freeY });
      detour.push({ x: end.x, y: freeY });
    } else {
      detour.push({ x: freeX, y: start.y });
      detour.push({ x: freeX, y: end.y });
    }
    
    return detour;
  }
  
  private findFreeHorizontalLane(y1: number, y2: number): number {
    // Finde freie horizontale "Fahrspur"
    const minY = Math.min(y1, y2) - 100;
    const maxY = Math.max(y1, y2) + 100;
    
    for (let y = minY; y <= maxY; y += 20) {
      const gridY = Math.floor(y / this.GRID_CELL_SIZE);
      if (this.isHorizontalLaneFree(gridY)) {
        return y;
      }
    }
    
    return (y1 + y2) / 2;
  }
  
  private findFreeVerticalLane(x1: number, x2: number): number {
    // Finde freie vertikale "Fahrspur"
    const minX = Math.min(x1, x2) - 100;
    const maxX = Math.max(x1, x2) + 100;
    
    for (let x = minX; x <= maxX; x += 20) {
      const gridX = Math.floor(x / this.GRID_CELL_SIZE);
      if (this.isVerticalLaneFree(gridX)) {
        return x;
      }
    }
    
    return (x1 + x2) / 2;
  }
  
  private isHorizontalLaneFree(gridY: number): boolean {
    if (!this.grid[gridY]) return true;
    
    let freeCount = 0;
    for (let x = 0; x < this.grid[gridY].length; x++) {
      if (!this.grid[gridY][x].occupied) freeCount++;
    }
    
    return freeCount > this.grid[gridY].length * 0.7;
  }
  
  private isVerticalLaneFree(gridX: number): boolean {
    let freeCount = 0;
    let totalCount = 0;
    
    for (let y = 0; y < this.grid.length; y++) {
      if (this.grid[y] && this.grid[y][gridX]) {
        totalCount++;
        if (!this.grid[y][gridX].occupied) freeCount++;
      }
    }
    
    return freeCount > totalCount * 0.7;
  }
  
  // ============================================================================
  // PHASE 6: Kollisionsauflösung
  // ============================================================================
  
  private resolveCollisions(): void {
    // Prüfe Edge-Edge Kollisionen
    for (let i = 0; i < this.routes.length; i++) {
      for (let j = i + 1; j < this.routes.length; j++) {
        if (this.routesOverlap(this.routes[i], this.routes[j])) {
          // Verschiebe eine Route
          this.routes[j].lane++;
          this.routes[j].path = this.adjustPathForLane(this.routes[j].path, this.routes[j].lane);
        }
      }
    }
  }
  
  private routesOverlap(r1: EdgeRoute, r2: EdgeRoute): boolean {
    // Vereinfachte Überlappungsprüfung
    for (let i = 0; i < r1.path.length - 1; i++) {
      for (let j = 0; j < r2.path.length - 1; j++) {
        if (this.segmentsOverlap(
          r1.path[i], r1.path[i + 1],
          r2.path[j], r2.path[j + 1]
        )) {
          return true;
        }
      }
    }
    return false;
  }
  
  private segmentsOverlap(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    // Prüfe ob zwei Liniensegmente sich überlappen
    const tolerance = 5;
    
    // Horizontale Überlappung
    if (Math.abs(p1.y - p2.y) < tolerance && Math.abs(p3.y - p4.y) < tolerance) {
      if (Math.abs(p1.y - p3.y) < tolerance) {
        const x1Min = Math.min(p1.x, p2.x);
        const x1Max = Math.max(p1.x, p2.x);
        const x2Min = Math.min(p3.x, p4.x);
        const x2Max = Math.max(p3.x, p4.x);
        
        return x1Min <= x2Max && x2Min <= x1Max;
      }
    }
    
    // Vertikale Überlappung
    if (Math.abs(p1.x - p2.x) < tolerance && Math.abs(p3.x - p4.x) < tolerance) {
      if (Math.abs(p1.x - p3.x) < tolerance) {
        const y1Min = Math.min(p1.y, p2.y);
        const y1Max = Math.max(p1.y, p2.y);
        const y2Min = Math.min(p3.y, p4.y);
        const y2Max = Math.max(p3.y, p4.y);
        
        return y1Min <= y2Max && y2Min <= y1Max;
      }
    }
    
    return false;
  }
  
  private adjustPathForLane(path: Point[], lane: number): Point[] {
    // Verschiebe Pfad basierend auf Lane
    const offset = lane * this.LANE_WIDTH;
    
    return path.map((point, index) => {
      if (index === 0 || index === path.length - 1) {
        // Start und Ende nicht verschieben
        return point;
      }
      
      // Verschiebe Zwischenpunkte
      return {
        x: point.x + offset,
        y: point.y
      };
    });
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  private pointToGrid(point: Point): { x: number; y: number } {
    return {
      x: Math.floor(point.x / this.GRID_CELL_SIZE),
      y: Math.floor(point.y / this.GRID_CELL_SIZE)
    };
  }
  
  private getOffsetPoint(point: Point, side: string, distance: number): Point {
    switch(side) {
      case 'top': return { x: point.x, y: point.y - distance };
      case 'bottom': return { x: point.x, y: point.y + distance };
      case 'left': return { x: point.x - distance, y: point.y };
      case 'right': return { x: point.x + distance, y: point.y };
      default: return point;
    }
  }
  
  private getEdgeColor(lane: number): string {
    const colors = ['#666', '#888', '#aaa', '#ccc'];
    return colors[lane % colors.length];
  }
  
  // ============================================================================
  // RESULT BUILDING
  // ============================================================================
  
  private buildResult(): LayoutResultV2 {
    const layoutedNodes = this.nodes.map(node => {
      const info = this.nodeInfos.get(node.id)!;
      return {
        ...node,
        position: { x: info.x, y: info.y },
        width: info.width,
        height: info.height
      };
    });
    
    const layoutedEdges = this.edges.map(edge => {
      const route = this.routes.find(r => r.id === edge.id);
      if (!route) return edge;
      
      return {
        ...edge,
        sourceHandle: `${route.sourceHandle.side}-${Math.round(route.sourceHandle.position * 10)}`,
        targetHandle: `${route.targetHandle.side}-${Math.round(route.targetHandle.position * 10)}`,
        type: 'smoothstep',
        style: {
          stroke: route.color || '#666',
          strokeWidth: 2
        }
      };
    });
    
    return {
      nodes: layoutedNodes,
      edges: layoutedEdges,
      routes: this.routes,
      grid: this.grid,
      problems: this.problems,
      stats: this.stats
    };
  }
}

/**
 * Export-Funktion
 */
export function applyLayoutV2(nodes: Node[], edges: Edge[]): LayoutResultV2 {
  const algorithm = new LayoutAlgorithmV2(nodes, edges);
  return algorithm.execute();
}