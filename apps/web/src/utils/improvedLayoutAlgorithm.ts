/**
 * Improved Layout Algorithm - Version 2
 * 
 * Iterative Verbesserung basierend auf HTML-Analyse
 * Fokus: Compact Mode mit intelligenter Handle-Verteilung
 */

import { Node, Edge, Position } from 'reactflow';

// ============================================================================
// TYPES
// ============================================================================

export type LayoutMode = 'compact' | 'vertical' | 'horizontal' | 'tree';

interface Point {
  x: number;
  y: number;
}

interface NodeInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  column: number;
  row: number;
  type?: string;
}

interface HandleInfo {
  nodeId: string;
  edgeId: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  index: number;
  direction: 'in' | 'out';
  position: Point;
}

interface EdgeRoute {
  id: string;
  source: string;
  target: string;
  sourceHandle: HandleInfo;
  targetHandle: HandleInfo;
  points: Point[];
  hasCollision: boolean;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  nodeInfos: Map<string, NodeInfo>;
  handleInfos: Map<string, HandleInfo[]>;
  edgeRoutes: EdgeRoute[];
  problems: string[];
}

// ============================================================================
// MAIN ALGORITHM
// ============================================================================

export class ImprovedLayoutAlgorithm {
  private nodes: Node[];
  private edges: Edge[];
  private mode: LayoutMode;
  private nodeInfos: Map<string, NodeInfo>;
  private handleInfos: Map<string, HandleInfo[]>;
  private edgeRoutes: EdgeRoute[];
  private problems: string[];
  
  // Layout-Parameter
  private readonly GRID_SIZE = 20; // Für Snap-to-Grid
  private readonly NODE_SPACING_X = 250;
  private readonly NODE_SPACING_Y = 150;
  private readonly HANDLE_SPACING = 40; // Mehr Platz zwischen Handles!
  private readonly EDGE_PADDING = 30; // Abstand von Edges zu Nodes
  
  constructor(nodes: Node[], edges: Edge[], mode: LayoutMode = 'compact') {
    // Deterministisches Sortieren
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => 
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );
    this.mode = mode;
    this.nodeInfos = new Map();
    this.handleInfos = new Map();
    this.edgeRoutes = [];
    this.problems = [];
  }
  
  /**
   * Hauptausführung
   */
  public execute(): LayoutResult {
    // Phase 1: Graph-Analyse und Level-Berechnung
    this.analyzeGraph();
    
    // Phase 2: Node-Positionierung basierend auf Levels
    this.positionNodes();
    
    // Phase 3: Intelligente Handle-Verteilung
    this.assignHandles();
    
    // Phase 4: Manhattan-Routing für Edges
    this.routeEdges();
    
    // Phase 5: Kollisionserkennung
    this.detectCollisions();
    
    // Phase 6: Ergebnis zusammenstellen
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
        width: node.width || this.getDefaultWidth(node.type),
        height: node.height || this.getDefaultHeight(node.type),
        level: -1,
        column: -1,
        row: -1,
        type: node.type
      });
    });
    
    // Berechne Levels (Topologische Sortierung)
    this.calculateLevels();
  }
  
  private calculateLevels(): void {
    const visited = new Set<string>();
    const levels = new Map<string, number>();
    
    // Finde Start-Nodes (keine eingehenden Edges oder type='start')
    const startNodes = this.nodes.filter(node => 
      node.type === 'start' || 
      !this.edges.some(e => e.target === node.id)
    );
    
    // BFS für Level-Berechnung
    const queue: Array<{id: string, level: number}> = 
      startNodes.map(n => ({id: n.id, level: 0}));
    
    while (queue.length > 0) {
      const {id, level} = queue.shift()!;
      
      if (visited.has(id)) continue;
      visited.add(id);
      
      const info = this.nodeInfos.get(id)!;
      info.level = level;
      
      // Finde alle ausgehenden Edges
      const outgoing = this.edges.filter(e => e.source === id);
      outgoing.forEach(edge => {
        if (!visited.has(edge.target)) {
          queue.push({id: edge.target, level: level + 1});
        }
      });
    }
    
    // Nodes ohne Level bekommen Level basierend auf Position
    let maxLevel = 0;
    this.nodeInfos.forEach(info => {
      maxLevel = Math.max(maxLevel, info.level);
    });
    
    this.nodeInfos.forEach(info => {
      if (info.level === -1) {
        info.level = maxLevel + 1;
        this.problems.push(`Node ${info.id} ist nicht verbunden (isoliert)`);
      }
    });
  }
  
  // ============================================================================
  // PHASE 2: Node-Positionierung
  // ============================================================================
  
  private positionNodes(): void {
    if (this.mode === 'compact') {
      this.positionCompact();
    } else if (this.mode === 'vertical') {
      this.positionVertical();
    } else if (this.mode === 'horizontal') {
      this.positionHorizontal();
    }
    
    // Snap to Grid für saubere Ausrichtung
    this.nodeInfos.forEach(info => {
      info.x = Math.round(info.x / this.GRID_SIZE) * this.GRID_SIZE;
      info.y = Math.round(info.y / this.GRID_SIZE) * this.GRID_SIZE;
    });
  }
  
  private positionCompact(): void {
    // Gruppiere Nodes nach Level
    const levels = new Map<number, string[]>();
    
    this.nodeInfos.forEach((info, nodeId) => {
      if (!levels.has(info.level)) {
        levels.set(info.level, []);
      }
      levels.get(info.level)!.push(nodeId);
    });
    
    // Positioniere jedes Level
    let currentY = 50;
    
    Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
      const nodesInLevel = levels.get(level)!;
      
      // Sortiere Nodes in Level für konsistente Reihenfolge
      nodesInLevel.sort((a, b) => {
        // Priorisiere nach Typ, dann alphabetisch
        const typeOrder = ['start', 'decision', 'screen', 'action', 'end'];
        const typeA = this.nodeInfos.get(a)!.type || 'default';
        const typeB = this.nodeInfos.get(b)!.type || 'default';
        const orderA = typeOrder.indexOf(typeA);
        const orderB = typeOrder.indexOf(typeB);
        
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
      
      // Berechne X-Positionen (zentriert)
      const totalWidth = nodesInLevel.length * this.NODE_SPACING_X;
      let currentX = (1000 - totalWidth) / 2; // Zentriere auf 1000px Breite
      
      nodesInLevel.forEach((nodeId, index) => {
        const info = this.nodeInfos.get(nodeId)!;
        info.x = currentX;
        info.y = currentY;
        info.row = level;
        info.column = index;
        
        currentX += this.NODE_SPACING_X;
      });
      
      currentY += this.NODE_SPACING_Y;
    });
  }
  
  private positionVertical(): void {
    // Einfache vertikale Anordnung nach Level
    const levels = new Map<number, string[]>();
    
    this.nodeInfos.forEach((info, nodeId) => {
      if (!levels.has(info.level)) {
        levels.set(info.level, []);
      }
      levels.get(info.level)!.push(nodeId);
    });
    
    let currentY = 50;
    
    Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
      const nodesInLevel = levels.get(level)!;
      const centerX = 400; // Zentriere bei 400px
      
      nodesInLevel.forEach(nodeId => {
        const info = this.nodeInfos.get(nodeId)!;
        info.x = centerX - info.width / 2;
        info.y = currentY;
      });
      
      currentY += this.NODE_SPACING_Y;
    });
  }
  
  private positionHorizontal(): void {
    // Horizontale Anordnung
    const levels = new Map<number, string[]>();
    
    this.nodeInfos.forEach((info, nodeId) => {
      if (!levels.has(info.level)) {
        levels.set(info.level, []);
      }
      levels.get(info.level)!.push(nodeId);
    });
    
    let currentX = 50;
    
    Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
      const nodesInLevel = levels.get(level)!;
      const centerY = 300;
      
      nodesInLevel.forEach(nodeId => {
        const info = this.nodeInfos.get(nodeId)!;
        info.x = currentX;
        info.y = centerY - info.height / 2;
      });
      
      currentX += this.NODE_SPACING_X;
    });
  }
  
  // ============================================================================
  // PHASE 3: Handle-Verteilung (VERBESSERT!)
  // ============================================================================
  
  private assignHandles(): void {
    this.nodes.forEach(node => {
      const handles: HandleInfo[] = [];
      const nodeInfo = this.nodeInfos.get(node.id)!;
      
      // Sammle ein- und ausgehende Edges
      const incoming = this.edges.filter(e => e.target === node.id);
      const outgoing = this.edges.filter(e => e.source === node.id);
      
      // NEUE STRATEGIE: Verteile intelligent auf alle 4 Seiten
      
      // Für eingehende Edges
      incoming.forEach((edge, index) => {
        const sourceInfo = this.nodeInfos.get(edge.source)!;
        const side = this.getBestSideForIncoming(nodeInfo, sourceInfo);
        
        handles.push({
          nodeId: node.id,
          edgeId: edge.id,
          side,
          index: this.getNextFreeIndex(handles, side, 'in'),
          direction: 'in',
          position: this.calculateHandlePosition(nodeInfo, side, index)
        });
      });
      
      // Für ausgehende Edges  
      outgoing.forEach((edge, index) => {
        const targetInfo = this.nodeInfos.get(edge.target)!;
        const side = this.getBestSideForOutgoing(nodeInfo, targetInfo);
        
        handles.push({
          nodeId: node.id,
          edgeId: edge.id,
          side,
          index: this.getNextFreeIndex(handles, side, 'out'),
          direction: 'out',
          position: this.calculateHandlePosition(nodeInfo, side, index)
        });
      });
      
      this.handleInfos.set(node.id, handles);
    });
  }
  
  private getBestSideForIncoming(target: NodeInfo, source: NodeInfo): 'top' | 'right' | 'bottom' | 'left' {
    const dx = source.x - target.x;
    const dy = source.y - target.y;
    
    // Bevorzuge Seite basierend auf relativer Position
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx < 0 ? 'left' : 'right';
    } else {
      return dy < 0 ? 'top' : 'bottom';
    }
  }
  
  private getBestSideForOutgoing(source: NodeInfo, target: NodeInfo): 'top' | 'right' | 'bottom' | 'left' {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    
    // Bevorzuge Seite basierend auf relativer Position
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'bottom' : 'top';
    }
  }
  
  private getNextFreeIndex(handles: HandleInfo[], side: string, direction: 'in' | 'out'): number {
    const sameSideHandles = handles.filter(h => 
      h.side === side && h.direction === direction
    );
    return sameSideHandles.length;
  }
  
  private calculateHandlePosition(node: NodeInfo, side: string, index: number): Point {
    const offset = this.HANDLE_SPACING * (index + 1);
    
    switch(side) {
      case 'top':
        return { 
          x: node.x + node.width / 2, 
          y: node.y 
        };
      case 'bottom':
        return { 
          x: node.x + node.width / 2, 
          y: node.y + node.height 
        };
      case 'left':
        return { 
          x: node.x, 
          y: node.y + node.height / 2 
        };
      case 'right':
        return { 
          x: node.x + node.width, 
          y: node.y + node.height / 2 
        };
      default:
        return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    }
  }
  
  // ============================================================================
  // PHASE 4: Manhattan-Routing (90° Winkel!)
  // ============================================================================
  
  private routeEdges(): void {
    this.edges.forEach(edge => {
      const sourceHandles = this.handleInfos.get(edge.source) || [];
      const targetHandles = this.handleInfos.get(edge.target) || [];
      
      const sourceHandle = sourceHandles.find(h => h.edgeId === edge.id);
      const targetHandle = targetHandles.find(h => h.edgeId === edge.id);
      
      if (!sourceHandle || !targetHandle) {
        this.problems.push(`Keine Handles für Edge ${edge.id}`);
        return;
      }
      
      // Berechne Manhattan-Route
      const points = this.calculateManhattanRoute(sourceHandle, targetHandle);
      
      this.edgeRoutes.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle,
        targetHandle,
        points,
        hasCollision: false
      });
    });
  }
  
  private calculateManhattanRoute(source: HandleInfo, target: HandleInfo): Point[] {
    const points: Point[] = [];
    const start = source.position;
    const end = target.position;
    
    points.push(start);
    
    // Bestimme Routing-Strategie basierend auf Handle-Seiten
    if (source.side === 'bottom' && target.side === 'top') {
      // Einfacher Fall: Direkt nach unten dann zum Ziel
      const midY = start.y + (end.y - start.y) / 2;
      points.push({ x: start.x, y: midY });
      points.push({ x: end.x, y: midY });
    } else if (source.side === 'right' && target.side === 'left') {
      // Horizontal
      const midX = start.x + (end.x - start.x) / 2;
      points.push({ x: midX, y: start.y });
      points.push({ x: midX, y: end.y });
    } else {
      // Komplexerer Fall: Nutze Zwischenpunkte
      const padding = this.EDGE_PADDING;
      
      // Gehe erst vom Source weg
      const p1 = this.getPointAwayFromNode(start, source.side, padding);
      points.push(p1);
      
      // Dann zum Target
      const p2 = this.getPointAwayFromNode(end, target.side, padding);
      
      // Verbinde mit Manhattan-Routing
      if (p1.x !== p2.x && p1.y !== p2.y) {
        // Brauche Zwischenpunkt
        points.push({ x: p2.x, y: p1.y });
      }
      
      points.push(p2);
    }
    
    points.push(end);
    
    return points;
  }
  
  private getPointAwayFromNode(point: Point, side: string, distance: number): Point {
    switch(side) {
      case 'top':
        return { x: point.x, y: point.y - distance };
      case 'bottom':
        return { x: point.x, y: point.y + distance };
      case 'left':
        return { x: point.x - distance, y: point.y };
      case 'right':
        return { x: point.x + distance, y: point.y };
      default:
        return point;
    }
  }
  
  // ============================================================================
  // PHASE 5: Kollisionserkennung
  // ============================================================================
  
  private detectCollisions(): void {
    // Prüfe Edge-Node Kollisionen
    this.edgeRoutes.forEach(route => {
      this.nodeInfos.forEach((nodeInfo, nodeId) => {
        if (nodeId === route.source || nodeId === route.target) return;
        
        // Prüfe ob Route durch Node geht
        for (let i = 0; i < route.points.length - 1; i++) {
          const p1 = route.points[i];
          const p2 = route.points[i + 1];
          
          if (this.lineIntersectsRect(p1, p2, nodeInfo)) {
            route.hasCollision = true;
            this.problems.push(`Edge ${route.id} kollidiert mit Node ${nodeId}`);
          }
        }
      });
    });
    
    // Prüfe Handle-Konflikte
    this.handleInfos.forEach((handles, nodeId) => {
      const handleMap = new Map<string, number>();
      
      handles.forEach(handle => {
        const key = `${handle.side}-${handle.index}`;
        handleMap.set(key, (handleMap.get(key) || 0) + 1);
      });
      
      handleMap.forEach((count, key) => {
        if (count > 1) {
          this.problems.push(`Node ${nodeId}: Handle ${key} wird ${count}x verwendet`);
        }
      });
    });
  }
  
  private lineIntersectsRect(p1: Point, p2: Point, rect: NodeInfo): boolean {
    // Vereinfachte Kollisionsprüfung
    const lineIsHorizontal = p1.y === p2.y;
    const lineIsVertical = p1.x === p2.x;
    
    if (lineIsHorizontal) {
      const y = p1.y;
      const xMin = Math.min(p1.x, p2.x);
      const xMax = Math.max(p1.x, p2.x);
      
      return y >= rect.y && y <= rect.y + rect.height &&
             xMax >= rect.x && xMin <= rect.x + rect.width;
    }
    
    if (lineIsVertical) {
      const x = p1.x;
      const yMin = Math.min(p1.y, p2.y);
      const yMax = Math.max(p1.y, p2.y);
      
      return x >= rect.x && x <= rect.x + rect.width &&
             yMax >= rect.y && yMin <= rect.y + rect.height;
    }
    
    return false;
  }
  
  // ============================================================================
  // PHASE 6: Ergebnis
  // ============================================================================
  
  private buildResult(): LayoutResult {
    // Konvertiere NodeInfos zurück zu Nodes
    const layoutedNodes = this.nodes.map(node => {
      const info = this.nodeInfos.get(node.id)!;
      return {
        ...node,
        position: { x: info.x, y: info.y },
        width: info.width,
        height: info.height
      };
    });
    
    // Konvertiere EdgeRoutes zu Edges
    const layoutedEdges = this.edges.map(edge => {
      const route = this.edgeRoutes.find(r => r.id === edge.id);
      
      if (!route) return edge;
      
      return {
        ...edge,
        sourceHandle: `${route.sourceHandle.side}-${route.sourceHandle.index}`,
        targetHandle: `${route.targetHandle.side}-${route.targetHandle.index}`,
        type: 'smoothstep',
        style: {
          stroke: route.hasCollision ? '#f44336' : '#666',
          strokeWidth: 2
        }
      };
    });
    
    return {
      nodes: layoutedNodes,
      edges: layoutedEdges,
      nodeInfos: this.nodeInfos,
      handleInfos: this.handleInfos,
      edgeRoutes: this.edgeRoutes,
      problems: this.problems
    };
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  private getDefaultWidth(type?: string): number {
    const widths: Record<string, number> = {
      start: 120,
      end: 120,
      screen: 200,
      decision: 180,
      action: 160,
      default: 160
    };
    return widths[type || 'default'];
  }
  
  private getDefaultHeight(type?: string): number {
    const heights: Record<string, number> = {
      start: 60,
      end: 60,
      screen: 100,
      decision: 80,
      action: 70,
      default: 80
    };
    return heights[type || 'default'];
  }
}

/**
 * Export-Funktion
 */
export function applyImprovedLayout(
  nodes: Node[], 
  edges: Edge[], 
  mode: LayoutMode = 'compact'
): LayoutResult {
  const algorithm = new ImprovedLayoutAlgorithm(nodes, edges, mode);
  return algorithm.execute();
}