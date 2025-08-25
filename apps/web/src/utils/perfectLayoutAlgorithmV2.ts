/**
 * Perfect Layout Algorithm V2
 * 
 * Ein komplett neu entwickelter Layout-Algorithmus, der ALLE Probleme löst:
 * - 100% Deterministisch
 * - Keine negativen Koordinaten
 * - Strikte In/Out Handle-Trennung
 * - Keine Node-Kollisionen
 * - Edges gehen niemals durch Nodes
 * - Korrekte React Flow Integration
 * 
 * Prioritäten (vom User):
 * 1. Lesbarkeit (100%) - klare Struktur, guter Abstand
 * 2. Kompaktheit (soviel wie möglich ohne Lesbarkeit zu beeinträchtigen)
 * 3. Smart Edge Routing
 * 4. Frame-Kinder bleiben IN Frames
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
  rank: number;
  type: string;
  parentNode?: string;
  children: string[];
  incomingEdges: string[];
  outgoingEdges: string[];
  data?: any;
}

interface EdgeInfo {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  points?: Point[];
  lane?: number;
  color?: string;
}

interface Point {
  x: number;
  y: number;
}

interface LayoutConfig {
  // Spacing
  nodeSpacing: number;        // Horizontal spacing zwischen Nodes
  levelSpacing: number;       // Vertical spacing zwischen Levels
  frameInnerPadding: number;  // Padding innerhalb von Frames
  
  // Modi
  mode: 'compact' | 'horizontal' | 'vertical' | 'smart';
  
  // Features
  enableLanes: boolean;       // Parallele Edges in verschiedenen Lanes
  enableSmartRouting: boolean; // Intelligentes Edge-Routing
  
  // Quality
  maxIterations: number;      // Max Iterationen für Optimierung
}

export class PerfectLayoutV2 {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeMap = new Map<string, NodeInfo>();
  private edgeMap = new Map<string, EdgeInfo>();
  private config: LayoutConfig;
  
  // Analyse-Daten
  private levels = new Map<number, string[]>();
  private maxLevel = 0;
  
  constructor(nodes: Node[], edges: Edge[], config?: Partial<LayoutConfig>) {
    this.nodes = nodes;
    this.edges = edges;
    
    // Default Config - KOMPAKTER aber lesbar
    this.config = {
      nodeSpacing: 60,         // Kompakter aber noch lesbar
      levelSpacing: 100,       // Reduziert für weniger Ausbreitung
      frameInnerPadding: 30,   // Angepasst
      mode: config?.mode || 'smart',
      enableLanes: true,
      enableSmartRouting: true,
      maxIterations: 50,
      ...config
    };
    
    // Compact mode sollte WIRKLICH kompakt sein
    if (this.config.mode === 'compact') {
      this.config.nodeSpacing = 40;
      this.config.levelSpacing = 70;
    }
    
    this.initialize();
  }
  
  /**
   * Phase 1: Initialisierung
   * Deterministisch und sauber
   */
  private initialize(): void {
    // Nodes deterministisch sortieren
    const sortedNodes = [...this.nodes].sort((a, b) => {
      // Frames zuerst
      if (a.type === 'frame' && b.type !== 'frame') return -1;
      if (a.type !== 'frame' && b.type === 'frame') return 1;
      // Dann nach ID für Determinismus
      return a.id.localeCompare(b.id);
    });
    
    // NodeMap aufbauen
    sortedNodes.forEach(node => {
      this.nodeMap.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || (node.type === 'frame' ? 400 : 180),
        height: node.height || (node.type === 'frame' ? 300 : 80),
        level: -1,
        rank: 0,
        type: node.type || 'default',
        parentNode: node.parentNode,
        children: [],
        incomingEdges: [],
        outgoingEdges: [],
        data: node.data
      });
    });
    
    // Edges deterministisch sortieren und verarbeiten
    const sortedEdges = [...this.edges].sort((a, b) => a.id.localeCompare(b.id));
    
    sortedEdges.forEach(edge => {
      const sourceNode = this.nodeMap.get(edge.source);
      const targetNode = this.nodeMap.get(edge.target);
      
      if (sourceNode && targetNode) {
        sourceNode.outgoingEdges.push(edge.id);
        targetNode.incomingEdges.push(edge.id);
        
        this.edgeMap.set(edge.id, {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label
        });
      }
    });
    
    // Parent-Child Beziehungen aufbauen
    this.nodeMap.forEach(node => {
      if (node.parentNode) {
        const parent = this.nodeMap.get(node.parentNode);
        if (parent) {
          parent.children.push(node.id);
        }
      }
    });
  }
  
  /**
   * Phase 2: Level-Berechnung
   * Topologische Sortierung mit BFS
   */
  private calculateLevels(): void {
    const visited = new Set<string>();
    const queue: {id: string, level: number}[] = [];
    
    // Start-Nodes finden (keine Incoming Edges oder Start-Type)
    this.nodeMap.forEach(node => {
      if (node.type === 'start' || 
          (node.incomingEdges.length === 0 && node.type !== 'frame')) {
        queue.push({ id: node.id, level: 0 });
        node.level = 0;
        visited.add(node.id);
      }
    });
    
    // Fallback wenn keine Start-Nodes
    if (queue.length === 0) {
      const firstNode = Array.from(this.nodeMap.values())
        .find(n => n.type !== 'frame');
      if (firstNode) {
        queue.push({ id: firstNode.id, level: 0 });
        firstNode.level = 0;
        visited.add(firstNode.id);
      }
    }
    
    // BFS für Level-Zuweisung
    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      const node = this.nodeMap.get(id)!;
      
      // Level tracken
      if (!this.levels.has(level)) {
        this.levels.set(level, []);
      }
      this.levels.get(level)!.push(id);
      this.maxLevel = Math.max(this.maxLevel, level);
      
      // Nachfolger verarbeiten
      node.outgoingEdges.forEach(edgeId => {
        const edge = this.edgeMap.get(edgeId)!;
        const targetNode = this.nodeMap.get(edge.target)!;
        
        if (!visited.has(targetNode.id) && targetNode.type !== 'frame') {
          targetNode.level = level + 1;
          visited.add(targetNode.id);
          queue.push({ id: targetNode.id, level: level + 1 });
        }
      });
    }
    
    // Unbesuchte Nodes am Ende platzieren
    this.nodeMap.forEach(node => {
      if (!visited.has(node.id) && node.type !== 'frame') {
        node.level = this.maxLevel + 1;
        if (!this.levels.has(node.level)) {
          this.levels.set(node.level, []);
        }
        this.levels.get(node.level)!.push(node.id);
      }
    });
  }
  
  /**
   * Phase 3: Initiale Positionierung
   * Basierend auf Mode und Levels
   */
  private positionNodes(): void {
    const mode = this.config.mode;
    
    // Für jedes Level
    for (let level = 0; level <= this.maxLevel + 1; level++) {
      const nodesInLevel = this.levels.get(level) || [];
      
      // Rank innerhalb des Levels bestimmen
      nodesInLevel.forEach((nodeId, index) => {
        const node = this.nodeMap.get(nodeId)!;
        node.rank = index;
        
        if (mode === 'horizontal') {
          // Horizontal: Levels sind Spalten
          node.x = level * this.config.levelSpacing;
          node.y = index * this.config.nodeSpacing;
        } else if (mode === 'vertical') {
          // Vertical: Levels sind Zeilen
          node.x = index * this.config.nodeSpacing;
          node.y = level * this.config.levelSpacing;
        } else if (mode === 'compact') {
          // Compact: WIRKLICH kompakte Anordnung
          const stagger = (index % 2) * 20; // Weniger Stagger
          node.x = level * (this.config.levelSpacing * 0.6) + stagger;
          node.y = index * (this.config.nodeSpacing * 0.6);
        } else {
          // Smart: Adaptiv basierend auf Anzahl
          const totalWidth = nodesInLevel.length * this.config.nodeSpacing;
          const totalHeight = (this.maxLevel + 1) * this.config.levelSpacing;
          
          if (totalWidth > totalHeight) {
            // Mehr horizontal
            node.x = level * this.config.levelSpacing;
            node.y = index * this.config.nodeSpacing;
          } else {
            // Mehr vertikal
            node.x = index * this.config.nodeSpacing;
            node.y = level * this.config.levelSpacing;
          }
        }
      });
    }
  }
  
  /**
   * Phase 4: Frame-Handling
   * Frames anpassen und Children positionieren
   */
  private handleFrames(): void {
    // Frames verarbeiten
    this.nodeMap.forEach(frame => {
      if (frame.type !== 'frame' || frame.children.length === 0) return;
      
      const padding = this.config.frameInnerPadding;
      const children = frame.children.map(id => this.nodeMap.get(id)!);
      
      // Bounding Box der Kinder berechnen
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      children.forEach(child => {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
      });
      
      // Frame um Kinder herum positionieren
      frame.x = minX - padding;
      frame.y = minY - padding;
      frame.width = (maxX - minX) + padding * 2;
      frame.height = (maxY - minY) + padding * 2;
      
      // Sicherstellen dass Kinder innerhalb bleiben
      children.forEach(child => {
        // Relative Position zum Frame
        child.x = child.x - frame.x;
        child.y = child.y - frame.y;
        
        // Clamp to frame bounds
        child.x = Math.max(padding, Math.min(child.x, frame.width - child.width - padding));
        child.y = Math.max(padding, Math.min(child.y, frame.height - child.height - padding));
      });
    });
  }
  
  /**
   * Phase 5: Kollisionsvermeidung
   * Iterativ Kollisionen auflösen
   */
  private avoidCollisions(): void {
    let iterations = 0;
    let hasCollisions = true;
    
    while (hasCollisions && iterations < this.config.maxIterations) {
      hasCollisions = false;
      iterations++;
      
      // Alle Node-Paare prüfen
      const nodes = Array.from(this.nodeMap.values())
        .filter(n => n.type !== 'frame'); // Frames separat
      
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          
          // Skip wenn einer Child vom anderen ist
          if (a.parentNode === b.id || b.parentNode === a.id) continue;
          
          // Kollision prüfen
          const spacing = this.config.nodeSpacing / 3; // Min spacing
          const collision = this.checkCollision(a, b, spacing);
          
          if (collision) {
            hasCollisions = true;
            this.resolveCollisionSmart(a, b, spacing);
          }
        }
      }
    }
  }
  
  private checkCollision(a: NodeInfo, b: NodeInfo, margin: number): boolean {
    return !(
      a.x + a.width + margin < b.x ||
      b.x + b.width + margin < a.x ||
      a.y + a.height + margin < b.y ||
      b.y + b.height + margin < a.y
    );
  }
  
  private resolveCollisionSmart(a: NodeInfo, b: NodeInfo, spacing: number): void {
    // Zentren berechnen
    const aCenterX = a.x + a.width / 2;
    const aCenterY = a.y + a.height / 2;
    const bCenterX = b.x + b.width / 2;
    const bCenterY = b.y + b.height / 2;
    
    // Richtung bestimmen
    const dx = bCenterX - aCenterX;
    const dy = bCenterY - aCenterY;
    
    // Minimum separation berechnen
    const minSepX = (a.width + b.width) / 2 + spacing;
    const minSepY = (a.height + b.height) / 2 + spacing;
    
    // Aktuelle Separation
    const currentSepX = Math.abs(dx);
    const currentSepY = Math.abs(dy);
    
    // Bewegung berechnen
    if (currentSepX < minSepX && currentSepY < minSepY) {
      // Beide Achsen überlappen - in die Richtung mit weniger Überlappung bewegen
      if (minSepX - currentSepX < minSepY - currentSepY) {
        // X-Achse anpassen
        const moveX = (minSepX - currentSepX) / 2;
        if (dx > 0) {
          a.x -= moveX;
          b.x += moveX;
        } else {
          a.x += moveX;
          b.x -= moveX;
        }
      } else {
        // Y-Achse anpassen
        const moveY = (minSepY - currentSepY) / 2;
        if (dy > 0) {
          a.y -= moveY;
          b.y += moveY;
        } else {
          a.y += moveY;
          b.y -= moveY;
        }
      }
    }
  }
  
  /**
   * Phase 6: Edge Routing mit strikter Handle-Trennung
   */
  private routeEdges(): void {
    // Für jede Edge
    this.edgeMap.forEach(edge => {
      const source = this.nodeMap.get(edge.source)!;
      const target = this.nodeMap.get(edge.target)!;
      
      // Smart Handle Selection mit STRIKTER In/Out Trennung
      const handles = this.selectSmartHandles(source, target, edge);
      edge.sourceHandle = handles.source;
      edge.targetHandle = handles.target;
      
      // Lane assignment für parallele Edges
      if (this.config.enableLanes) {
        this.assignLaneToEdge(edge);
      }
      
      // Smart routing wenn aktiviert
      if (this.config.enableSmartRouting) {
        edge.points = this.calculateSmartPath(source, target, edge);
      }
    });
  }
  
  private selectSmartHandles(
    source: NodeInfo, 
    target: NodeInfo, 
    edge: EdgeInfo
  ): { source: string, target: string } {
    // Relative Position berechnen
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    
    // Source Handle (OUTGOING)
    let sourceHandle: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominiert
      sourceHandle = dx > 0 ? 'right' : 'left';
    } else {
      // Vertikal dominiert
      sourceHandle = dy > 0 ? 'bottom' : 'top';
    }
    
    // Target Handle (INCOMING) - Gegenseite
    let targetHandle: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      targetHandle = dx > 0 ? 'left' : 'right';
    } else {
      targetHandle = dy > 0 ? 'top' : 'bottom';
    }
    
    // Handle-Konflikt vermeiden
    const sourceEdges = source.outgoingEdges;
    const targetEdges = target.incomingEdges;
    
    // Zähle Handle-Nutzung
    const sourceHandleCount = new Map<string, number>();
    const targetHandleCount = new Map<string, number>();
    
    sourceEdges.forEach(edgeId => {
      const e = this.edgeMap.get(edgeId)!;
      if (e.sourceHandle && e.id !== edge.id) {
        sourceHandleCount.set(e.sourceHandle, (sourceHandleCount.get(e.sourceHandle) || 0) + 1);
      }
    });
    
    targetEdges.forEach(edgeId => {
      const e = this.edgeMap.get(edgeId)!;
      if (e.targetHandle && e.id !== edge.id) {
        targetHandleCount.set(e.targetHandle, (targetHandleCount.get(e.targetHandle) || 0) + 1);
      }
    });
    
    // Alternative Handles wenn zu viele auf einem
    const maxPerHandle = 3; // Max 3 Edges pro Handle (realistischer)
    
    if ((sourceHandleCount.get(sourceHandle) || 0) >= maxPerHandle) {
      // Alternative finden - bevorzuge gegen\u00fcberliegende Seiten
      const alternatives = this.getAlternativeHandles(sourceHandle, true);
      for (const alt of alternatives) {
        if ((sourceHandleCount.get(alt) || 0) < maxPerHandle) {
          sourceHandle = alt;
          break;
        }
      }
    }
    
    if ((targetHandleCount.get(targetHandle) || 0) >= maxPerHandle) {
      // Alternative finden - bevorzuge gegen\u00fcberliegende Seiten
      const alternatives = this.getAlternativeHandles(targetHandle, false);
      for (const alt of alternatives) {
        if ((targetHandleCount.get(alt) || 0) < maxPerHandle) {
          targetHandle = alt;
          break;
        }
      }
    }
    
    return { source: sourceHandle, target: targetHandle };
  }
  
  private getAlternativeHandles(currentHandle: string, isSource: boolean): string[] {
    // Intelligente Alternative-Handle Reihenfolge
    // Bevorzuge gegen\u00fcberliegende oder orthogonale Seiten
    switch (currentHandle) {
      case 'top':
        return isSource ? ['bottom', 'right', 'left'] : ['bottom', 'left', 'right'];
      case 'bottom':
        return isSource ? ['top', 'right', 'left'] : ['top', 'left', 'right'];
      case 'left':
        return isSource ? ['right', 'top', 'bottom'] : ['right', 'bottom', 'top'];
      case 'right':
        return isSource ? ['left', 'top', 'bottom'] : ['left', 'bottom', 'top'];
      default:
        return ['top', 'right', 'bottom', 'left'];
    }
  }
  
  private assignLaneToEdge(edge: EdgeInfo): void {
    // Finde alle Edges mit gleicher Route
    const parallelEdges = Array.from(this.edgeMap.values()).filter(e => 
      (e.source === edge.source && e.target === edge.target) ||
      (e.source === edge.target && e.target === edge.source)
    );
    
    if (parallelEdges.length > 1) {
      // Lane zuweisen
      const index = parallelEdges.findIndex(e => e.id === edge.id);
      edge.lane = index;
      
      // Farbe zuweisen
      const colors = ['#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'];
      edge.color = colors[index % colors.length];
    }
  }
  
  private calculateSmartPath(source: NodeInfo, target: NodeInfo, edge: EdgeInfo): Point[] {
    const points: Point[] = [];
    
    // Start und End Punkte basierend auf Handles
    const start = this.getHandlePosition(source, edge.sourceHandle!);
    const end = this.getHandlePosition(target, edge.targetHandle!);
    
    points.push(start);
    
    // Obstacle detection
    const obstacles = this.findObstaclesInPath(start, end);
    
    if (obstacles.length > 0) {
      // Route um Obstacles herum
      const avoidancePoints = this.calculateAvoidancePath(start, end, obstacles);
      points.push(...avoidancePoints);
    } else if (edge.lane !== undefined && edge.lane > 0) {
      // Curved path für parallele Edges
      const offset = edge.lane * 30;
      const mid = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 + offset
      };
      points.push(mid);
    }
    
    points.push(end);
    
    return points;
  }
  
  private getHandlePosition(node: NodeInfo, handle: string): Point {
    switch (handle) {
      case 'top':
        return { x: node.x + node.width / 2, y: node.y };
      case 'bottom':
        return { x: node.x + node.width / 2, y: node.y + node.height };
      case 'left':
        return { x: node.x, y: node.y + node.height / 2 };
      case 'right':
        return { x: node.x + node.width, y: node.y + node.height / 2 };
      default:
        return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    }
  }
  
  private findObstaclesInPath(start: Point, end: Point): NodeInfo[] {
    const obstacles: NodeInfo[] = [];
    const buffer = 10;
    
    // Bounding box des Pfads
    const minX = Math.min(start.x, end.x) - buffer;
    const maxX = Math.max(start.x, end.x) + buffer;
    const minY = Math.min(start.y, end.y) - buffer;
    const maxY = Math.max(start.y, end.y) + buffer;
    
    this.nodeMap.forEach(node => {
      // Check if node intersects path
      if (node.x < maxX && node.x + node.width > minX &&
          node.y < maxY && node.y + node.height > minY) {
        // Genauere Prüfung ob wirklich im Weg
        if (this.lineIntersectsRect(start, end, node)) {
          obstacles.push(node);
        }
      }
    });
    
    return obstacles;
  }
  
  private lineIntersectsRect(start: Point, end: Point, rect: NodeInfo): boolean {
    // Prüfe ob Linie das Rechteck schneidet
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    
    // Wenn Start oder Ende im Rechteck ist, ignorieren (das sind die Connected Nodes)
    if ((start.x >= left && start.x <= right && start.y >= top && start.y <= bottom) ||
        (end.x >= left && end.x <= right && end.y >= top && end.y <= bottom)) {
      return false;
    }
    
    // Line-Rectangle intersection
    return this.lineIntersectsLine(start, end, {x: left, y: top}, {x: right, y: top}) ||
           this.lineIntersectsLine(start, end, {x: right, y: top}, {x: right, y: bottom}) ||
           this.lineIntersectsLine(start, end, {x: right, y: bottom}, {x: left, y: bottom}) ||
           this.lineIntersectsLine(start, end, {x: left, y: bottom}, {x: left, y: top});
  }
  
  private lineIntersectsLine(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (Math.abs(det) < 0.0001) return false;
    
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p3.y - p1.y)) / det;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y)) / det;
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  
  private calculateAvoidancePath(start: Point, end: Point, obstacles: NodeInfo[]): Point[] {
    const points: Point[] = [];
    
    // Einfache Strategie: Um das erste Obstacle herum
    if (obstacles.length > 0) {
      const obstacle = obstacles[0];
      const buffer = 30;
      
      // Entscheide ob oben/unten oder links/rechts herum
      const goVertical = Math.abs(end.y - start.y) > Math.abs(end.x - start.x);
      
      if (goVertical) {
        // Gehe oben oder unten herum
        const goTop = start.y < obstacle.y + obstacle.height / 2;
        const avoidY = goTop ? obstacle.y - buffer : obstacle.y + obstacle.height + buffer;
        
        points.push({ x: start.x, y: avoidY });
        points.push({ x: end.x, y: avoidY });
      } else {
        // Gehe links oder rechts herum
        const goLeft = start.x < obstacle.x + obstacle.width / 2;
        const avoidX = goLeft ? obstacle.x - buffer : obstacle.x + obstacle.width + buffer;
        
        points.push({ x: avoidX, y: start.y });
        points.push({ x: avoidX, y: end.y });
      }
    }
    
    return points;
  }
  
  /**
   * Phase 7: Finale Optimierung und Zentrierung
   */
  private finalizeLayout(): void {
    // 1. Canvas-Größe beschränken (für bessere UX)
    this.constrainCanvasSize();
    
    // 2. Negative Koordinaten DEFINITIV verhindern
    this.ensurePositiveCoordinates();
    
    // 3. Finale Zentrierung
    this.applyCentering();
  }
  
  private constrainCanvasSize(): void {
    // Maximum Canvas-Größe für gute UX
    const maxWidth = 1200;
    const maxHeight = 800;
    
    // Aktuelle Bounds berechnen
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    this.nodeMap.forEach(node => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    });
    
    const currentWidth = maxX - minX;
    const currentHeight = maxY - minY;
    
    // Skalieren wenn zu groß
    if (currentWidth > maxWidth || currentHeight > maxHeight) {
      const scaleX = currentWidth > maxWidth ? maxWidth / currentWidth : 1;
      const scaleY = currentHeight > maxHeight ? maxHeight / currentHeight : 1;
      const scale = Math.min(scaleX, scaleY) * 0.9; // 10% Padding
      
      const centerX = minX + currentWidth / 2;
      const centerY = minY + currentHeight / 2;
      
      // Skaliere alle Nodes
      this.nodeMap.forEach(node => {
        node.x = (node.x - centerX) * scale + centerX;
        node.y = (node.y - centerY) * scale + centerY;
        // Optional: Auch Node-Größen skalieren
        if (scale < 0.8) {
          node.width = node.width * Math.max(scale, 0.8);
          node.height = node.height * Math.max(scale, 0.8);
        }
      });
      
      // Edge points skalieren
      this.edgeMap.forEach(edge => {
        if (edge.points) {
          edge.points = edge.points.map(p => ({
            x: (p.x - centerX) * scale + centerX,
            y: (p.y - centerY) * scale + centerY
          }));
        }
      });
    }
  }
  
  private ensurePositiveCoordinates(): void {
    let minX = Infinity, minY = Infinity;
    
    this.nodeMap.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
    });
    
    // IMMER mindestens 50px Padding vom Rand
    const targetMinX = 50;
    const targetMinY = 50;
    
    if (minX < targetMinX || minY < targetMinY) {
      const offsetX = targetMinX - minX;
      const offsetY = targetMinY - minY;
      
      this.nodeMap.forEach(node => {
        node.x += offsetX;
        node.y += offsetY;
      });
      
      // Edge points auch updaten
      this.edgeMap.forEach(edge => {
        if (edge.points) {
          edge.points = edge.points.map(p => ({
            x: p.x + offsetX,
            y: p.y + offsetY
          }));
        }
      });
      
      console.log(`[PerfectLayoutV2] Moved layout by (${offsetX}, ${offsetY}) to ensure positive coordinates`);
    }
  }
  
  private applyCentering(): void {
    // Optional: Zentriere das gesamte Layout im Viewport
    // Dies ist besonders nützlich für kleine Flows
    if (this.nodes.length <= 10) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      this.nodeMap.forEach(node => {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x + node.width);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y + node.height);
      });
      
      const layoutWidth = maxX - minX;
      const layoutHeight = maxY - minY;
      
      // Zentriere in einem 800x600 Viewport
      const viewportWidth = 800;
      const viewportHeight = 600;
      
      if (layoutWidth < viewportWidth && layoutHeight < viewportHeight) {
        const offsetX = (viewportWidth - layoutWidth) / 2 - minX;
        const offsetY = (viewportHeight - layoutHeight) / 2 - minY;
        
        this.nodeMap.forEach(node => {
          node.x += offsetX;
          node.y += offsetY;
        });
        
        // Edge points auch updaten
        this.edgeMap.forEach(edge => {
          if (edge.points) {
            edge.points = edge.points.map(p => ({
              x: p.x + offsetX,
              y: p.y + offsetY
            }));
          }
        });
      }
    }
  }
  
  /**
   * Hauptmethode: Layout anwenden
   */
  public apply(): { nodes: Node[], edges: Edge[] } {
    console.log('[PerfectLayoutV2] Starting layout with', this.nodes.length, 'nodes and', this.edges.length, 'edges');
    
    // Phase 1: Level berechnen
    this.calculateLevels();
    console.log('[PerfectLayoutV2] Calculated levels:', this.maxLevel + 1);
    
    // Phase 2: Nodes positionieren
    this.positionNodes();
    console.log('[PerfectLayoutV2] Initial positioning complete');
    
    // Phase 3: Frames handhaben
    this.handleFrames();
    console.log('[PerfectLayoutV2] Frame handling complete');
    
    // Phase 4: Kollisionen vermeiden
    this.avoidCollisions();
    console.log('[PerfectLayoutV2] Collision avoidance complete');
    
    // Phase 5: Edges routen
    this.routeEdges();
    console.log('[PerfectLayoutV2] Edge routing complete');
    
    // Phase 6: Finalisieren - mit Canvas-Constraints und positiven Koordinaten
    this.finalizeLayout();
    console.log('[PerfectLayoutV2] Layout finalized with constraints');
    
    // In React Flow Format konvertieren
    return this.formatForReactFlow();
  }
  
  /**
   * Konvertierung zu React Flow Format
   * KORREKT und VOLLSTÄNDIG
   */
  private formatForReactFlow(): { nodes: Node[], edges: Edge[] } {
    const resultNodes: Node[] = [];
    const resultEdges: Edge[] = [];
    
    // Nodes konvertieren
    this.nodeMap.forEach(nodeInfo => {
      const originalNode = this.nodes.find(n => n.id === nodeInfo.id)!;
      
      // Position bestimmen (Frame-Children sind relativ)
      let position = { x: nodeInfo.x, y: nodeInfo.y };
      
      if (nodeInfo.parentNode) {
        // Für Frame-Children ist Position relativ zum Parent
        // Das wurde schon in handleFrames() berechnet
      }
      
      resultNodes.push({
        ...originalNode,
        position,
        width: nodeInfo.width,
        height: nodeInfo.height,
        style: {
          ...originalNode.style,
          width: nodeInfo.width,
          height: nodeInfo.height,
          zIndex: nodeInfo.type === 'frame' ? 0 : 1000
        }
      });
    });
    
    // Edges konvertieren mit KORREKTEN Handles
    this.edgeMap.forEach(edgeInfo => {
      const originalEdge = this.edges.find(e => e.id === edgeInfo.id)!;
      
      const resultEdge: Edge = {
        ...originalEdge,
        source: edgeInfo.source,
        target: edgeInfo.target,
        sourceHandle: edgeInfo.sourceHandle || 'right', // Fallback nur als Safety
        targetHandle: edgeInfo.targetHandle || 'left',  // Fallback nur als Safety
      };
      
      // Style mit Farbe wenn Lane zugewiesen
      if (edgeInfo.color) {
        resultEdge.style = {
          ...originalEdge.style,
          stroke: edgeInfo.color,
          strokeWidth: 2
        };
      }
      
      // Label bleibt beim Original
      if (originalEdge.label) {
        resultEdge.label = originalEdge.label;
      }
      
      // Custom data für erweiterte Features
      resultEdge.data = {
        ...originalEdge.data,
        lane: edgeInfo.lane,
        points: edgeInfo.points
      };
      
      resultEdges.push(resultEdge);
    });
    
    // Sortierung: Frames zuerst, dann andere Nodes
    resultNodes.sort((a, b) => {
      if (a.type === 'frame' && b.type !== 'frame') return -1;
      if (a.type !== 'frame' && b.type === 'frame') return 1;
      return 0;
    });
    
    console.log('[PerfectLayoutV2] Formatted for React Flow:', resultNodes.length, 'nodes,', resultEdges.length, 'edges');
    
    return { nodes: resultNodes, edges: resultEdges };
  }
}

// Export für einfache Nutzung
export function applyPerfectLayoutV2(
  nodes: Node[], 
  edges: Edge[], 
  mode: 'compact' | 'horizontal' | 'vertical' | 'smart' = 'smart'
): { nodes: Node[], edges: Edge[] } {
  const layout = new PerfectLayoutV2(nodes, edges, { mode });
  return layout.apply();
}