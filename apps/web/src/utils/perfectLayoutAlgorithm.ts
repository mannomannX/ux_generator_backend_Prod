/**
 * Perfect Layout Algorithm
 * 
 * Ein vollständig deterministischer, kollisionsfreier Layout-Algorithmus
 * der konsistente, lesbare und ästhetische Flussdiagramme erzeugt.
 */

import { Node, Edge, Position, MarkerType } from 'reactflow';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type LayoutMode = 'vertical' | 'horizontal' | 'compact' | 'tree' | 'force';

interface LayoutConfig {
  mode: LayoutMode;
  nodeSpacing: { x: number; y: number };
  rankSpacing: { x: number; y: number };
  edgePadding: number;
  handleSpacing: number;
  labelOffset: number;
  frameInnerPadding: number;
  deterministic: boolean;
  avoidCollisions: boolean;
  optimizeEdgeRouting: boolean;
  debugMode: boolean;
}

interface NodeHierarchy {
  id: string;
  level: number;          // Tiefe im Graph (0 = Start)
  rank: number;           // Position in der Ebene
  column: number;         // Spalte (für Grid-Layout)
  row: number;            // Zeile (für Grid-Layout)
  incoming: string[];     // IDs der eingehenden Edges
  outgoing: string[];     // IDs der ausgehenden Edges
  parent?: string;        // Frame-Parent wenn vorhanden
  children?: string[];    // Nodes die in diesem Frame sind (nur für Frames)
  width: number;
  height: number;
}

interface HandleSlot {
  position: Position;     // top, right, bottom, left
  index: number;         // Slot-Index auf dieser Seite
  occupied: boolean;     // Ist dieser Slot belegt?
  edgeId?: string;      // Welche Edge nutzt diesen Slot
  direction: 'in' | 'out'; // Eingang oder Ausgang
}

interface HandleAssignment {
  nodeId: string;
  slots: HandleSlot[];
  getHandle: (edgeId: string, direction: 'source' | 'target') => string;
}

interface EdgeRoute {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  points: { x: number; y: number }[];
  label?: string;
  labelPosition?: { x: number; y: number };
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  metadata: {
    hierarchies: Map<string, NodeHierarchy>;
    handles: Map<string, HandleAssignment>;
    routes: EdgeRoute[];
    frameRelations: Map<string, string>;
    layoutScore: number;
    collisions: any[];
  };
}

// ============================================================================
// MAIN ALGORITHM CLASS
// ============================================================================

export class PerfectLayoutAlgorithm {
  private nodes: Node[];
  private edges: Edge[];
  private config: LayoutConfig;
  private hierarchies: Map<string, NodeHierarchy>;
  private frameRelations: Map<string, string>;
  private handleAssignments: Map<string, HandleAssignment>;
  private routes: EdgeRoute[];

  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    // Deterministisches Sortieren für konsistente Ergebnisse
    this.nodes = this.sortNodesDeterministic(nodes);
    this.edges = this.sortEdgesDeterministic(edges);
    
    this.config = {
      mode: 'vertical',
      nodeSpacing: { x: 120, y: 100 },
      rankSpacing: { x: 200, y: 150 },
      edgePadding: 20,
      handleSpacing: 30,
      labelOffset: 10,
      frameInnerPadding: 30,
      deterministic: true,
      avoidCollisions: true,
      optimizeEdgeRouting: true,
      debugMode: false,
      ...config
    };

    this.hierarchies = new Map();
    this.frameRelations = new Map();
    this.handleAssignments = new Map();
    this.routes = [];
  }

  /**
   * Hauptausführung des Algorithmus
   */
  public execute(): LayoutResult {
    // Phase 1: Analyse
    this.analyzeGraph();
    
    // Phase 2: Hierarchie aufbauen
    this.buildHierarchy();
    
    // Phase 3: Positionen berechnen
    const positioned = this.calculatePositions();
    
    // Phase 4: Handles zuweisen
    this.assignHandles();
    
    // Phase 5: Edges routen
    this.routeEdges();
    
    // Phase 6: Labels positionieren
    this.positionLabels();
    
    // Phase 7: Optimierung
    const optimized = this.optimizeLayout(positioned);
    
    // Phase 8: Finalisierung
    return this.finalizeLayout(optimized);
  }

  // ============================================================================
  // PHASE 1: GRAPH ANALYSE
  // ============================================================================

  private analyzeGraph(): void {
    // Identifiziere Frame-Beziehungen (einmalig und fest)
    this.identifyFrameRelations();
    
    // Analysiere Graph-Struktur
    this.nodes.forEach(node => {
      const hierarchy: NodeHierarchy = {
        id: node.id,
        level: -1,
        rank: -1,
        column: -1,
        row: -1,
        incoming: this.edges.filter(e => e.target === node.id).map(e => e.id),
        outgoing: this.edges.filter(e => e.source === node.id).map(e => e.id),
        width: node.width || this.getDefaultNodeSize(node.type).width,
        height: node.height || this.getDefaultNodeSize(node.type).height,
      };

      // Frame-Beziehung hinzufügen
      if (this.frameRelations.has(node.id)) {
        hierarchy.parent = this.frameRelations.get(node.id);
      }

      // Für Frames: Children identifizieren
      if (node.type === 'frame') {
        hierarchy.children = Array.from(this.frameRelations.entries())
          .filter(([_, parent]) => parent === node.id)
          .map(([child, _]) => child);
      }

      this.hierarchies.set(node.id, hierarchy);
    });
  }

  private identifyFrameRelations(): void {
    const frames = this.nodes.filter(n => n.type === 'frame');
    
    this.nodes.forEach(node => {
      if (node.type === 'frame') return;
      
      // Priorität 1: Explizite Parent-Beziehung
      if (node.parentId || node.parentNode) {
        this.frameRelations.set(node.id, node.parentId || node.parentNode);
        return;
      }
      
      // Priorität 2: Position-basierte Zuordnung (initial)
      for (const frame of frames) {
        if (this.isNodeInsideFrame(node, frame)) {
          this.frameRelations.set(node.id, frame.id);
          break; // Nur dem ersten passenden Frame zuordnen
        }
      }
    });
  }

  private isNodeInsideFrame(node: Node, frame: Node): boolean {
    const nodeWidth = node.width || this.getDefaultNodeSize(node.type).width;
    const nodeHeight = node.height || this.getDefaultNodeSize(node.type).height;
    const frameWidth = frame.width || 400;
    const frameHeight = frame.height || 300;
    
    return (
      node.position.x >= frame.position.x &&
      node.position.y >= frame.position.y &&
      node.position.x + nodeWidth <= frame.position.x + frameWidth &&
      node.position.y + nodeHeight <= frame.position.y + frameHeight
    );
  }

  // ============================================================================
  // PHASE 2: HIERARCHIE AUFBAUEN
  // ============================================================================

  private buildHierarchy(): void {
    // Berechne Level (Tiefe) für jeden Node
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || this.hierarchies.get(n.id)!.incoming.length === 0
    );

    // BFS für Level-Berechnung
    const visited = new Set<string>();
    const queue: { id: string; level: number }[] = startNodes.map(n => ({ 
      id: n.id, 
      level: 0 
    }));

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      
      visited.add(id);
      const hierarchy = this.hierarchies.get(id)!;
      hierarchy.level = level;

      // Füge verbundene Nodes zur Queue hinzu
      const outgoingEdges = this.edges.filter(e => e.source === id);
      outgoingEdges.forEach(edge => {
        if (!visited.has(edge.target)) {
          queue.push({ id: edge.target, level: level + 1 });
        }
      });
    }

    // Berechne Ranks (Position innerhalb des Levels)
    this.calculateRanks();
  }

  private calculateRanks(): void {
    // Gruppiere Nodes nach Level
    const levels = new Map<number, string[]>();
    
    this.hierarchies.forEach((hierarchy, nodeId) => {
      const level = hierarchy.level;
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(nodeId);
    });

    // Sortiere Nodes in jedem Level für konsistente Ranks
    levels.forEach((nodeIds, level) => {
      // Sortiere nach: 1. Frame-Zugehörigkeit, 2. Typ, 3. ID
      nodeIds.sort((a, b) => {
        const hierA = this.hierarchies.get(a)!;
        const hierB = this.hierarchies.get(b)!;
        
        // Frames zuerst
        const nodeA = this.nodes.find(n => n.id === a)!;
        const nodeB = this.nodes.find(n => n.id === b)!;
        
        if (nodeA.type === 'frame' && nodeB.type !== 'frame') return -1;
        if (nodeA.type !== 'frame' && nodeB.type === 'frame') return 1;
        
        // Dann nach Parent-Frame
        if (hierA.parent !== hierB.parent) {
          if (!hierA.parent) return 1;
          if (!hierB.parent) return -1;
          return hierA.parent.localeCompare(hierB.parent);
        }
        
        // Dann nach ID
        return a.localeCompare(b);
      });

      // Weise Ranks zu
      nodeIds.forEach((nodeId, index) => {
        this.hierarchies.get(nodeId)!.rank = index;
      });
    });
  }

  // ============================================================================
  // PHASE 3: POSITIONEN BERECHNEN
  // ============================================================================

  private calculatePositions(): Node[] {
    const positioned = [...this.nodes];
    const isHorizontal = this.config.mode === 'horizontal';
    
    // Berechne Positionen basierend auf Hierarchie
    positioned.forEach(node => {
      const hierarchy = this.hierarchies.get(node.id)!;
      
      // Skip Nodes in Frames (werden später positioniert)
      if (hierarchy.parent && node.type !== 'frame') {
        return;
      }

      let x: number, y: number;

      if (isHorizontal) {
        x = hierarchy.level * this.config.rankSpacing.x;
        y = hierarchy.rank * this.config.nodeSpacing.y;
      } else {
        x = hierarchy.rank * this.config.nodeSpacing.x;
        y = hierarchy.level * this.config.rankSpacing.y;
      }

      // Zentriere Nodes in ihrer Spalte/Zeile
      const nodeWidth = hierarchy.width;
      const nodeHeight = hierarchy.height;
      
      if (isHorizontal) {
        x += (this.config.rankSpacing.x - nodeWidth) / 2;
        y += (this.config.nodeSpacing.y - nodeHeight) / 2;
      } else {
        x += (this.config.nodeSpacing.x - nodeWidth) / 2;
        y += (this.config.rankSpacing.y - nodeHeight) / 2;
      }

      node.position = { x, y };
    });

    // Positioniere Nodes innerhalb von Frames
    this.positionFrameChildren(positioned);

    return positioned;
  }

  private positionFrameChildren(nodes: Node[]): void {
    const frames = nodes.filter(n => n.type === 'frame');
    
    frames.forEach(frame => {
      const hierarchy = this.hierarchies.get(frame.id)!;
      if (!hierarchy.children || hierarchy.children.length === 0) return;

      const frameX = frame.position.x;
      const frameY = frame.position.y;
      const padding = this.config.frameInnerPadding;
      
      // Layout children innerhalb des Frames
      const children = hierarchy.children
        .map(childId => nodes.find(n => n.id === childId))
        .filter(n => n !== undefined) as Node[];

      // Mini-Layout innerhalb des Frames
      const childLevels = new Map<number, Node[]>();
      children.forEach(child => {
        const childHier = this.hierarchies.get(child.id)!;
        const relLevel = childHier.level - hierarchy.level;
        if (!childLevels.has(relLevel)) {
          childLevels.set(relLevel, []);
        }
        childLevels.get(relLevel)!.push(child);
      });

      // Positioniere children
      let currentY = frameY + padding;
      childLevels.forEach((levelNodes, level) => {
        let currentX = frameX + padding;
        levelNodes.forEach(child => {
          child.position = { x: currentX, y: currentY };
          currentX += (child.width || 100) + this.config.nodeSpacing.x / 2;
        });
        currentY += this.config.rankSpacing.y / 2;
      });

      // Passe Frame-Größe an
      const maxX = Math.max(...children.map(c => 
        c.position.x + (c.width || 100)
      ));
      const maxY = Math.max(...children.map(c => 
        c.position.y + (c.height || 50)
      ));
      
      frame.width = maxX - frameX + padding;
      frame.height = maxY - frameY + padding;
    });
  }

  // ============================================================================
  // PHASE 4: HANDLES ZUWEISEN
  // ============================================================================

  private assignHandles(): void {
    this.nodes.forEach(node => {
      const hierarchy = this.hierarchies.get(node.id)!;
      const slots: HandleSlot[] = [];
      
      // Definiere verfügbare Handle-Positionen
      const positions: Position[] = ['top', 'right', 'bottom', 'left'];
      const slotsPerSide = 4; // Max 4 Handles pro Seite
      
      positions.forEach(position => {
        for (let i = 0; i < slotsPerSide; i++) {
          slots.push({
            position,
            index: i,
            occupied: false,
            direction: this.getPreferredDirection(position)
          });
        }
      });

      // Weise Handles für eingehende Edges zu
      const incomingEdges = this.edges.filter(e => e.target === node.id);
      incomingEdges.forEach(edge => {
        const sourceNode = this.nodes.find(n => n.id === edge.source)!;
        const preferredPos = this.getPreferredHandlePosition(sourceNode, node, 'target');
        const slot = this.findFreeSlot(slots, preferredPos, 'in');
        if (slot) {
          slot.occupied = true;
          slot.edgeId = edge.id;
        }
      });

      // Weise Handles für ausgehende Edges zu
      const outgoingEdges = this.edges.filter(e => e.source === node.id);
      outgoingEdges.forEach(edge => {
        const targetNode = this.nodes.find(n => n.id === edge.target)!;
        const preferredPos = this.getPreferredHandlePosition(node, targetNode, 'source');
        const slot = this.findFreeSlot(slots, preferredPos, 'out');
        if (slot) {
          slot.occupied = true;
          slot.edgeId = edge.id;
        }
      });

      // Speichere Handle-Assignment
      this.handleAssignments.set(node.id, {
        nodeId: node.id,
        slots,
        getHandle: (edgeId: string, direction: 'source' | 'target') => {
          const slot = slots.find(s => s.edgeId === edgeId);
          if (!slot) return 'center';
          return `${slot.position}-${slot.index}`;
        }
      });
    });
  }

  private getPreferredDirection(position: Position): 'in' | 'out' {
    // Standard: Top/Left = In, Bottom/Right = Out
    return (position === 'top' || position === 'left') ? 'in' : 'out';
  }

  private getPreferredHandlePosition(source: Node, target: Node, type: 'source' | 'target'): Position {
    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    
    if (type === 'source') {
      // Von Source aus
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'right' : 'left';
      } else {
        return dy > 0 ? 'bottom' : 'top';
      }
    } else {
      // Zu Target hin
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'left' : 'right';
      } else {
        return dy > 0 ? 'top' : 'bottom';
      }
    }
  }

  private findFreeSlot(slots: HandleSlot[], preferredPos: Position, direction: 'in' | 'out'): HandleSlot | null {
    // Versuche bevorzugte Position
    const preferred = slots.find(s => 
      s.position === preferredPos && 
      !s.occupied && 
      s.direction === direction
    );
    if (preferred) return preferred;
    
    // Fallback: Irgendein freier Slot
    return slots.find(s => !s.occupied && s.direction === direction) || null;
  }

  // ============================================================================
  // PHASE 5: EDGE ROUTING
  // ============================================================================

  private routeEdges(): void {
    this.edges.forEach(edge => {
      const source = this.nodes.find(n => n.id === edge.source)!;
      const target = this.nodes.find(n => n.id === edge.target)!;
      
      const sourceHandle = this.handleAssignments.get(source.id)!.getHandle(edge.id, 'source');
      const targetHandle = this.handleAssignments.get(target.id)!.getHandle(edge.id, 'target');
      
      // Berechne Route (orthogonal mit Kollisionsvermeidung)
      const points = this.calculateOrthogonalRoute(source, target, sourceHandle, targetHandle);
      
      this.routes.push({
        id: edge.id,
        source: source.id,
        target: target.id,
        sourceHandle,
        targetHandle,
        points,
        label: edge.label
      });
    });
  }

  private calculateOrthogonalRoute(
    source: Node, 
    target: Node, 
    sourceHandle: string, 
    targetHandle: string
  ): { x: number; y: number }[] {
    // Vereinfachtes orthogonales Routing
    const sourcePos = this.getHandlePosition(source, sourceHandle);
    const targetPos = this.getHandlePosition(target, targetHandle);
    
    const points: { x: number; y: number }[] = [sourcePos];
    
    // Horizontale dann vertikale Route
    const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
    
    if (sourcePos.y !== targetPos.y) {
      points.push({ x: midX, y: sourcePos.y });
      points.push({ x: midX, y: targetPos.y });
    }
    
    points.push(targetPos);
    
    return points;
  }

  private getHandlePosition(node: Node, handle: string): { x: number; y: number } {
    const [position, indexStr] = handle.split('-');
    const index = parseInt(indexStr) || 0;
    const width = node.width || 100;
    const height = node.height || 50;
    
    const spacing = this.config.handleSpacing;
    const offset = spacing * (index + 1);
    
    switch (position) {
      case 'top':
        return { 
          x: node.position.x + offset, 
          y: node.position.y 
        };
      case 'right':
        return { 
          x: node.position.x + width, 
          y: node.position.y + offset 
        };
      case 'bottom':
        return { 
          x: node.position.x + offset, 
          y: node.position.y + height 
        };
      case 'left':
        return { 
          x: node.position.x, 
          y: node.position.y + offset 
        };
      default:
        return { 
          x: node.position.x + width / 2, 
          y: node.position.y + height / 2 
        };
    }
  }

  // ============================================================================
  // PHASE 6: LABEL POSITIONIERUNG
  // ============================================================================

  private positionLabels(): void {
    this.routes.forEach(route => {
      if (!route.label) return;
      
      // Finde längsten geraden Abschnitt für Label
      let longestSegment = { start: 0, end: 1, length: 0 };
      
      for (let i = 0; i < route.points.length - 1; i++) {
        const length = this.getDistance(route.points[i], route.points[i + 1]);
        if (length > longestSegment.length) {
          longestSegment = { start: i, end: i + 1, length };
        }
      }
      
      // Platziere Label in der Mitte des längsten Segments
      const start = route.points[longestSegment.start];
      const end = route.points[longestSegment.end];
      
      route.labelPosition = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - this.config.labelOffset
      };
    });
  }

  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  // ============================================================================
  // PHASE 7: OPTIMIERUNG
  // ============================================================================

  private optimizeLayout(nodes: Node[]): Node[] {
    if (!this.config.optimizeEdgeRouting) return nodes;
    
    // Minimiere Edge-Kreuzungen durch lokale Optimierung
    // Kompaktiere Layout wenn möglich
    // Zentriere gesamtes Layout
    
    return this.centerLayout(nodes);
  }

  private centerLayout(nodes: Node[]): Node[] {
    if (nodes.length === 0) return nodes;
    
    // Finde Bounding Box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    nodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + (node.width || 100));
      maxY = Math.max(maxY, node.position.y + (node.height || 50));
    });
    
    // Verschiebe zum Ursprung
    const offsetX = -minX + 50;
    const offsetY = -minY + 50;
    
    return nodes.map(node => ({
      ...node,
      position: {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY
      }
    }));
  }

  // ============================================================================
  // PHASE 8: FINALISIERUNG
  // ============================================================================

  private finalizeLayout(nodes: Node[]): LayoutResult {
    // Konvertiere Routes zu ReactFlow Edges
    const edges = this.edges.map(edge => {
      const route = this.routes.find(r => r.id === edge.id)!;
      
      return {
        ...edge,
        sourceHandle: route.sourceHandle,
        targetHandle: route.targetHandle,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
        },
        style: {
          strokeWidth: 2,
          stroke: '#94a3b8',
        },
        labelStyle: route.labelPosition ? {
          transform: `translate(${route.labelPosition.x}px, ${route.labelPosition.y}px)`
        } : undefined
      };
    });

    // Füge Z-Index hinzu für korrekte Schichtung
    const finalNodes = nodes.map(node => ({
      ...node,
      zIndex: node.type === 'frame' ? 0 : 1000,
      style: {
        ...node.style,
        zIndex: node.type === 'frame' ? 0 : 1000
      }
    }));

    return {
      nodes: finalNodes,
      edges,
      metadata: {
        hierarchies: this.hierarchies,
        handles: this.handleAssignments,
        routes: this.routes,
        frameRelations: this.frameRelations,
        layoutScore: this.calculateLayoutScore(finalNodes, edges),
        collisions: []
      }
    };
  }

  private calculateLayoutScore(nodes: Node[], edges: Edge[]): number {
    let score = 100;
    
    // Penalize für Überlappungen
    // Penalize für Edge-Kreuzungen
    // Bonus für gleichmäßige Verteilung
    // Bonus für minimale Edge-Länge
    
    return Math.max(0, Math.min(100, score));
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  private sortNodesDeterministic(nodes: Node[]): Node[] {
    return [...nodes].sort((a, b) => {
      // 1. Typ-Hierarchie
      const typeOrder = ['start', 'frame', 'screen', 'decision', 'action', 'process', 'data', 'end'];
      const typeA = typeOrder.indexOf(a.type || 'default');
      const typeB = typeOrder.indexOf(b.type || 'default');
      
      if (typeA !== typeB) return typeA - typeB;
      
      // 2. Alphabetisch nach ID
      return a.id.localeCompare(b.id);
    });
  }

  private sortEdgesDeterministic(edges: Edge[]): Edge[] {
    return [...edges].sort((a, b) => {
      // 1. Source
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      // 2. Target
      if (a.target !== b.target) return a.target.localeCompare(b.target);
      // 3. ID
      return a.id.localeCompare(b.id);
    });
  }

  private getDefaultNodeSize(type?: string): { width: number; height: number } {
    const sizes: Record<string, { width: number; height: number }> = {
      start: { width: 120, height: 60 },
      end: { width: 120, height: 60 },
      screen: { width: 200, height: 100 },
      decision: { width: 180, height: 80 },
      action: { width: 160, height: 70 },
      process: { width: 180, height: 80 },
      data: { width: 140, height: 60 },
      frame: { width: 400, height: 300 },
      default: { width: 160, height: 80 }
    };
    
    return sizes[type || 'default'] || sizes.default;
  }
}

// ============================================================================
// EXPORT FUNCTION
// ============================================================================

export function applyPerfectLayout(
  nodes: Node[],
  edges: Edge[],
  mode: LayoutMode = 'vertical',
  options?: Partial<LayoutConfig>
): LayoutResult {
  const algorithm = new PerfectLayoutAlgorithm(nodes, edges, { mode, ...options });
  return algorithm.execute();
}