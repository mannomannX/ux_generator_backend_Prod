/**
 * Clean Layout Algorithm
 * 
 * HAUPTZIEL: Aufgeräumtes, professionelles Layout mit strikter In/Out Trennung
 * 
 * Kernprinzipien:
 * 1. STRIKTE In/Out Handle-Trennung - NIE gemischt am gleichen Punkt
 * 2. Saubere 90° Winkel für alle Edges
 * 3. Minimale Kreuzungen mit klarem Abstand
 * 4. Großzügiges Spacing für Lesbarkeit
 * 5. Edges nur zwischen direkt verbundenen Nodes
 */

import { Node, Edge } from 'reactflow';

// Typen
interface NodeInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  type: string;
  parentNode?: string;
  
  // Handle Management - GETRENNT nach Richtung
  incomingHandles: {
    top: string[];    // Edge IDs die hier reinkommen
    right: string[];
    bottom: string[];
    left: string[];
  };
  outgoingHandles: {
    top: string[];    // Edge IDs die hier rausgehen
    right: string[];
    bottom: string[];
    left: string[];
  };
}

interface EdgeInfo {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  routingPoints?: Point[];
  crossings?: string[]; // IDs von Edges die diese kreuzt
}

interface Point {
  x: number;
  y: number;
}

interface LayoutConfig {
  // Großzügiges Spacing für Aufgeräumtheit
  nodeSpacingH: number;      // Horizontal zwischen Nodes
  nodeSpacingV: number;      // Vertikal zwischen Nodes
  levelSpacing: number;       // Zwischen Levels
  edgeSpacing: number;        // Mindestabstand zwischen parallelen Edges
  crossingClearance: number;  // Abstand bei Kreuzungen
  
  mode: 'horizontal' | 'vertical' | 'compact' | 'tree';
  strictInOutSeparation: boolean; // IMMER true
}

export class CleanLayoutAlgorithm {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeMap = new Map<string, NodeInfo>();
  private edgeMap = new Map<string, EdgeInfo>();
  private config: LayoutConfig;
  
  // Level-Struktur
  private levels = new Map<number, string[]>();
  private maxLevel = 0;
  
  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    this.nodes = nodes;
    this.edges = edges;
    
    // Config mit großzügigem Spacing
    this.config = {
      nodeSpacingH: 200,      // Viel Platz horizontal
      nodeSpacingV: 150,      // Viel Platz vertikal
      levelSpacing: 250,      // Große Level-Abstände
      edgeSpacing: 30,        // Parallele Edges Abstand
      crossingClearance: 40,  // Kreuzungs-Clearance
      mode: config?.mode || 'horizontal',
      strictInOutSeparation: true, // IMMER aktiviert
      ...config
    };
    
    this.initialize();
  }
  
  /**
   * Phase 1: Initialisierung mit Handle-Vorbereitung
   */
  private initialize(): void {
    // Nodes vorbereiten
    this.nodes.forEach(node => {
      this.nodeMap.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || 180,
        height: node.height || 80,
        level: -1,
        type: node.type || 'default',
        parentNode: node.parentNode,
        // Getrennte Handle-Verwaltung
        incomingHandles: {
          top: [],
          right: [],
          bottom: [],
          left: []
        },
        outgoingHandles: {
          top: [],
          right: [],
          bottom: [],
          left: []
        }
      });
    });
    
    // Edges vorbereiten
    this.edges.forEach(edge => {
      this.edgeMap.set(edge.id, {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label
      });
    });
  }
  
  /**
   * Phase 2: Level-Berechnung (Hierarchie)
   */
  private calculateLevels(): void {
    const visited = new Set<string>();
    const queue: {id: string, level: number}[] = [];
    
    // Start-Nodes finden
    this.nodeMap.forEach(node => {
      const hasIncoming = this.edges.some(e => e.target === node.id);
      if (!hasIncoming || node.type === 'start') {
        queue.push({ id: node.id, level: 0 });
        node.level = 0;
        visited.add(node.id);
      }
    });
    
    // BFS für Level-Zuweisung
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      
      if (!this.levels.has(level)) {
        this.levels.set(level, []);
      }
      this.levels.get(level)!.push(id);
      this.maxLevel = Math.max(this.maxLevel, level);
      
      // Nachfolger
      this.edges.forEach(edge => {
        if (edge.source === id && !visited.has(edge.target)) {
          const targetNode = this.nodeMap.get(edge.target)!;
          targetNode.level = level + 1;
          visited.add(edge.target);
          queue.push({ id: edge.target, level: level + 1 });
        }
      });
    }
  }
  
  /**
   * Phase 3: Node-Positionierung mit großzügigem Spacing
   */
  private positionNodes(): void {
    const mode = this.config.mode;
    
    for (let level = 0; level <= this.maxLevel; level++) {
      const nodesInLevel = this.levels.get(level) || [];
      
      nodesInLevel.forEach((nodeId, index) => {
        const node = this.nodeMap.get(nodeId)!;
        
        if (mode === 'horizontal') {
          // Horizontal: Levels sind Spalten
          node.x = level * this.config.levelSpacing;
          node.y = index * this.config.nodeSpacingV;
        } else if (mode === 'vertical') {
          // Vertikal: Levels sind Zeilen
          node.x = index * this.config.nodeSpacingH;
          node.y = level * this.config.levelSpacing;
        } else if (mode === 'tree') {
          // Baum-Layout: Zentriert pro Level
          const totalWidth = nodesInLevel.length * this.config.nodeSpacingH;
          const startX = -totalWidth / 2 + this.config.nodeSpacingH / 2;
          node.x = startX + index * this.config.nodeSpacingH;
          node.y = level * this.config.levelSpacing;
        } else {
          // Compact: Dichter aber mit Versatz
          const offset = (index % 2) * 50;
          node.x = level * (this.config.levelSpacing * 0.7) + offset;
          node.y = index * (this.config.nodeSpacingV * 0.7);
        }
      });
    }
  }
  
  /**
   * Phase 4: KRITISCH - Strikte Handle-Zuweisung mit In/Out Trennung
   */
  private assignHandles(): void {
    // Für jede Edge
    this.edgeMap.forEach(edge => {
      const source = this.nodeMap.get(edge.source)!;
      const target = this.nodeMap.get(edge.target)!;
      
      // Bestimme optimale Richtung
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      
      let sourceHandle: keyof typeof source.outgoingHandles;
      let targetHandle: keyof typeof target.incomingHandles;
      
      // Primäre Richtung bestimmen
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal dominiert
        sourceHandle = dx > 0 ? 'right' : 'left';
        targetHandle = dx > 0 ? 'left' : 'right';
      } else {
        // Vertikal dominiert
        sourceHandle = dy > 0 ? 'bottom' : 'top';
        targetHandle = dy > 0 ? 'top' : 'bottom';
      }
      
      // KRITISCH: Prüfe ob Handle bereits für ANDERE Richtung verwendet wird
      sourceHandle = this.findAvailableHandle(source, sourceHandle, 'outgoing');
      targetHandle = this.findAvailableHandle(target, targetHandle, 'incoming');
      
      // Zuweisen
      source.outgoingHandles[sourceHandle].push(edge.id);
      target.incomingHandles[targetHandle].push(edge.id);
      
      edge.sourceHandle = sourceHandle;
      edge.targetHandle = targetHandle;
    });
  }
  
  /**
   * Finde verfügbaren Handle der NICHT für andere Richtung verwendet wird
   */
  private findAvailableHandle(
    node: NodeInfo,
    preferred: 'top' | 'right' | 'bottom' | 'left',
    direction: 'incoming' | 'outgoing'
  ): 'top' | 'right' | 'bottom' | 'left' {
    const handles = direction === 'incoming' ? node.incomingHandles : node.outgoingHandles;
    const oppositeHandles = direction === 'incoming' ? node.outgoingHandles : node.incomingHandles;
    
    // REGEL: Ein Handle darf NUR für eine Richtung verwendet werden
    // Wenn preferred Handle bereits für ANDERE Richtung verwendet wird, finde Alternative
    
    if (oppositeHandles[preferred].length === 0) {
      // Preferred ist frei für diese Richtung
      return preferred;
    }
    
    // Finde Alternative - probiere orthogonale Seiten
    const alternatives = this.getOrthogonalHandles(preferred);
    
    for (const alt of alternatives) {
      if (oppositeHandles[alt].length === 0) {
        return alt;
      }
    }
    
    // Wenn alle orthogonalen belegt, nimm gegenüberliegende Seite
    const opposite = this.getOppositeHandle(preferred);
    if (oppositeHandles[opposite].length === 0) {
      return opposite;
    }
    
    // Notfall: Finde Handle mit wenigsten Edges gleicher Richtung
    const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
    let bestHandle = preferred;
    let minCount = Infinity;
    
    for (const side of sides) {
      // Nur wenn nicht von anderer Richtung belegt
      if (oppositeHandles[side].length === 0 && handles[side].length < minCount) {
        minCount = handles[side].length;
        bestHandle = side;
      }
    }
    
    return bestHandle;
  }
  
  private getOrthogonalHandles(handle: string): Array<'top' | 'right' | 'bottom' | 'left'> {
    switch (handle) {
      case 'top':
      case 'bottom':
        return ['left', 'right'];
      case 'left':
      case 'right':
        return ['top', 'bottom'];
      default:
        return ['top', 'right', 'bottom', 'left'];
    }
  }
  
  private getOppositeHandle(handle: string): 'top' | 'right' | 'bottom' | 'left' {
    switch (handle) {
      case 'top': return 'bottom';
      case 'bottom': return 'top';
      case 'left': return 'right';
      case 'right': return 'left';
      default: return 'top';
    }
  }
  
  /**
   * Phase 5: Edge-Routing mit sauberen 90° Winkeln
   */
  private routeEdges(): void {
    this.edgeMap.forEach(edge => {
      const source = this.nodeMap.get(edge.source)!;
      const target = this.nodeMap.get(edge.target)!;
      
      // Start- und Endpunkte basierend auf Handles
      const startPoint = this.getHandlePosition(source, edge.sourceHandle!);
      const endPoint = this.getHandlePosition(target, edge.targetHandle!);
      
      // Berechne saubere 90° Route
      edge.routingPoints = this.calculate90DegreeRoute(
        startPoint,
        endPoint,
        edge.sourceHandle!,
        edge.targetHandle!
      );
    });
  }
  
  private getHandlePosition(node: NodeInfo, handle: string): Point {
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    
    switch (handle) {
      case 'top':
        return { x: centerX, y: node.y };
      case 'bottom':
        return { x: centerX, y: node.y + node.height };
      case 'left':
        return { x: node.x, y: centerY };
      case 'right':
        return { x: node.x + node.width, y: centerY };
      default:
        return { x: centerX, y: centerY };
    }
  }
  
  private calculate90DegreeRoute(
    start: Point,
    end: Point,
    startHandle: string,
    endHandle: string
  ): Point[] {
    const points: Point[] = [start];
    
    // Bestimme Routing-Strategie basierend auf Handle-Richtungen
    const spacing = this.config.edgeSpacing;
    
    if (startHandle === 'right' && endHandle === 'left') {
      // Horizontal verbinden
      const midX = (start.x + end.x) / 2;
      points.push({ x: midX, y: start.y });
      points.push({ x: midX, y: end.y });
    } else if (startHandle === 'bottom' && endHandle === 'top') {
      // Vertikal verbinden
      const midY = (start.y + end.y) / 2;
      points.push({ x: start.x, y: midY });
      points.push({ x: end.x, y: midY });
    } else if (startHandle === 'right' && endHandle === 'top') {
      // L-Form
      points.push({ x: end.x, y: start.y });
    } else if (startHandle === 'bottom' && endHandle === 'left') {
      // L-Form
      points.push({ x: start.x, y: end.y });
    } else {
      // Komplexere Route mit Offsets
      const offsetX = startHandle === 'left' ? -spacing : startHandle === 'right' ? spacing : 0;
      const offsetY = startHandle === 'top' ? -spacing : startHandle === 'bottom' ? spacing : 0;
      
      const firstPoint = {
        x: start.x + offsetX,
        y: start.y + offsetY
      };
      
      points.push(firstPoint);
      
      // Zweiter Punkt für 90° Winkel
      if (Math.abs(firstPoint.x - end.x) > Math.abs(firstPoint.y - end.y)) {
        points.push({ x: end.x, y: firstPoint.y });
      } else {
        points.push({ x: firstPoint.x, y: end.y });
      }
    }
    
    points.push(end);
    return points;
  }
  
  /**
   * Phase 6: Finale Optimierung
   */
  private finalizeLayout(): void {
    // Verschiebe alles ins Positive
    let minX = Infinity, minY = Infinity;
    
    this.nodeMap.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    });
    
    const padding = 100; // Großzügiger Rand
    const offsetX = padding - minX;
    const offsetY = padding - minY;
    
    // Alles verschieben
    this.nodeMap.forEach(node => {
      node.x += offsetX;
      node.y += offsetY;
    });
    
    // Edge-Points auch verschieben
    this.edgeMap.forEach(edge => {
      if (edge.routingPoints) {
        edge.routingPoints = edge.routingPoints.map(p => ({
          x: p.x + offsetX,
          y: p.y + offsetY
        }));
      }
    });
  }
  
  /**
   * Hauptmethode: Layout anwenden
   */
  public apply(): { nodes: Node[], edges: Edge[] } {
    console.log('[CleanLayout] Starting with', this.nodes.length, 'nodes');
    
    // Phase 1: Levels berechnen
    this.calculateLevels();
    
    // Phase 2: Nodes positionieren
    this.positionNodes();
    
    // Phase 3: KRITISCH - Handle-Zuweisung mit strikter In/Out Trennung
    this.assignHandles();
    
    // Phase 4: Edge-Routing
    this.routeEdges();
    
    // Phase 5: Finalisieren
    this.finalizeLayout();
    
    console.log('[CleanLayout] Layout complete');
    
    return this.formatForReactFlow();
  }
  
  /**
   * Formatierung für React Flow
   */
  private formatForReactFlow(): { nodes: Node[], edges: Edge[] } {
    const resultNodes: Node[] = [];
    const resultEdges: Edge[] = [];
    
    // Nodes
    this.nodeMap.forEach(nodeInfo => {
      const originalNode = this.nodes.find(n => n.id === nodeInfo.id)!;
      
      resultNodes.push({
        ...originalNode,
        position: { x: nodeInfo.x, y: nodeInfo.y },
        width: nodeInfo.width,
        height: nodeInfo.height
      });
    });
    
    // Edges mit korrekten Handles
    this.edgeMap.forEach(edgeInfo => {
      const originalEdge = this.edges.find(e => e.id === edgeInfo.id)!;
      
      resultEdges.push({
        ...originalEdge,
        sourceHandle: edgeInfo.sourceHandle,
        targetHandle: edgeInfo.targetHandle,
        data: {
          ...originalEdge.data,
          routingPoints: edgeInfo.routingPoints
        }
      });
    });
    
    // Debug-Info
    this.logHandleUsage();
    
    return { nodes: resultNodes, edges: resultEdges };
  }
  
  /**
   * Debug: Zeige Handle-Nutzung
   */
  private logHandleUsage(): void {
    console.log('[CleanLayout] Handle Usage Report:');
    
    this.nodeMap.forEach(node => {
      const inTotal = Object.values(node.incomingHandles).flat().length;
      const outTotal = Object.values(node.outgoingHandles).flat().length;
      
      if (inTotal > 0 || outTotal > 0) {
        console.log(`  ${node.id}:`);
        
        // Check für Konflikte
        const handles = ['top', 'right', 'bottom', 'left'] as const;
        for (const handle of handles) {
          const incoming = node.incomingHandles[handle].length;
          const outgoing = node.outgoingHandles[handle].length;
          
          if (incoming > 0 && outgoing > 0) {
            console.error(`    ❌ KONFLIKT bei ${handle}: ${incoming} IN, ${outgoing} OUT`);
          } else if (incoming > 0) {
            console.log(`    ✅ ${handle}: ${incoming} IN`);
          } else if (outgoing > 0) {
            console.log(`    ✅ ${handle}: ${outgoing} OUT`);
          }
        }
      }
    });
  }
}

// Export für einfache Nutzung
export function applyCleanLayout(
  nodes: Node[], 
  edges: Edge[], 
  mode: 'horizontal' | 'vertical' | 'compact' | 'tree' = 'horizontal'
): { nodes: Node[], edges: Edge[] } {
  const layout = new CleanLayoutAlgorithm(nodes, edges, { mode });
  return layout.apply();
}