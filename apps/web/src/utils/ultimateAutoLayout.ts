import { Node, Edge, Position } from 'reactflow';
import dagre from 'dagre';

/**
 * Ultimate Auto-Layout Algorithm mit Visualisierungs-Feedback
 * 
 * Features:
 * - Deterministisches Verhalten (gleiche Eingabe = gleiche Ausgabe)
 * - Visualisierungs-Modus für Debug-Informationen
 * - Kollisionserkennung und -vermeidung
 * - Optimale Handle-Auswahl
 * - Konsistente Sortierung
 */

export type LayoutMode = 'vertical' | 'horizontal' | 'compact' | 'tree' | 'radial' | 'smart';

interface LayoutOptions {
  mode?: LayoutMode;
  nodeSpacing?: number;
  rankSpacing?: number;
  animate?: boolean;
  debugMode?: boolean;
  seed?: number; // Für deterministisches Verhalten
}

interface NodePosition {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

interface CollisionInfo {
  type: 'node-node' | 'edge-node' | 'edge-edge';
  item1: string;
  item2: string;
  overlapArea?: number;
  intersectionPoint?: { x: number; y: number };
}

interface LayoutVisualization {
  nodePositions: NodePosition[];
  collisions: CollisionInfo[];
  edgeRoutes: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
    path: { x: number; y: number }[];
  }>;
  layoutScore: number;
  debugInfo: string;
}

export class UltimateAutoLayout {
  private nodes: Node[];
  private edges: Edge[];
  private options: Required<LayoutOptions>;
  private nodePositions: Map<string, NodePosition>;
  private collisions: CollisionInfo[];
  private dagreGraph: dagre.graphlib.Graph;
  private frameChildren: Map<string, Set<string>>;
  private nodeParentFrame: Map<string, string>;

  constructor(nodes: Node[], edges: Edge[], options: LayoutOptions = {}) {
    // Sortiere Nodes und Edges für Determinismus
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => a.id.localeCompare(b.id));
    
    this.options = {
      mode: options.mode || 'smart',
      nodeSpacing: options.nodeSpacing || 80,
      rankSpacing: options.rankSpacing || 120,
      animate: options.animate ?? true,
      debugMode: options.debugMode ?? false,
      seed: options.seed || 42,
    };

    this.nodePositions = new Map();
    this.collisions = [];
    this.dagreGraph = new dagre.graphlib.Graph();
    this.frameChildren = new Map();
    this.nodeParentFrame = new Map();
    
    // Identifiziere Frame-Beziehungen basierend auf parentId oder initialer Position
    this.identifyFrameRelationships();
  }

  /**
   * Identifiziere Frame-Child Beziehungen
   */
  private identifyFrameRelationships(): void {
    // Finde alle Frame-Nodes
    const frameNodes = this.nodes.filter(n => n.type === 'frame');
    
    frameNodes.forEach(frame => {
      const children = new Set<string>();
      
      // Prüfe zuerst ob Nodes explizit einem Frame zugeordnet sind (parentId)
      this.nodes.forEach(node => {
        if (node.id === frame.id || node.type === 'frame') return;
        
        // Prüfe explizite Parent-Beziehung
        if (node.parentId === frame.id || node.parentNode === frame.id) {
          children.add(node.id);
          this.nodeParentFrame.set(node.id, frame.id);
          return;
        }
        
        // Wenn keine explizite Beziehung, prüfe ob Node innerhalb des Frames liegt
        const frameX = frame.position.x;
        const frameY = frame.position.y;
        const frameWidth = frame.width || 400;
        const frameHeight = frame.height || 300;
        
        const nodeX = node.position.x;
        const nodeY = node.position.y;
        const nodeWidth = node.width || this.getNodeDefaultWidth(node.type);
        const nodeHeight = node.height || this.getNodeDefaultHeight(node.type);
        
        // Prüfe ob Node vollständig im Frame liegt (mit kleiner Toleranz)
        const tolerance = 5;
        if (nodeX >= frameX - tolerance && 
            nodeY >= frameY - tolerance && 
            nodeX + nodeWidth <= frameX + frameWidth + tolerance &&
            nodeY + nodeHeight <= frameY + frameHeight + tolerance) {
          children.add(node.id);
          this.nodeParentFrame.set(node.id, frame.id);
        }
      });
      
      this.frameChildren.set(frame.id, children);
    });
  }

  /**
   * Hauptausführung des Layouts
   */
  public execute(): { nodes: Node[]; edges: Edge[]; visualization?: LayoutVisualization } {
    // Bestimme optimalen Modus
    const mode = this.options.mode === 'smart' 
      ? this.determineOptimalMode() 
      : this.options.mode;

    // Initialisiere Dagre Graph
    this.initializeDagreGraph(mode);

    // Füge Nodes und Edges hinzu
    this.addNodesToGraph();
    this.addEdgesToGraph();

    // Berechne Layout
    dagre.layout(this.dagreGraph);

    // Extrahiere Positionen
    let layoutedNodes = this.extractNodePositions();
    
    // Stelle sicher dass Frame-Children innerhalb bleiben
    layoutedNodes = this.maintainFrameRelationships(layoutedNodes);
    
    const layoutedEdges = this.optimizeEdgeRouting(layoutedNodes);

    // Kollisionserkennung
    this.detectCollisions(layoutedNodes, layoutedEdges);

    // Wenn Kollisionen gefunden, versuche zu korrigieren
    if (this.collisions.length > 0) {
      this.resolveCollisions(layoutedNodes);
    }

    // Generiere Visualisierung wenn Debug-Modus aktiv
    let visualization: LayoutVisualization | undefined;
    if (this.options.debugMode) {
      visualization = this.generateVisualization(layoutedNodes, layoutedEdges);
    }

    return {
      nodes: layoutedNodes,
      edges: layoutedEdges,
      visualization,
    };
  }

  /**
   * Bestimme optimalen Layout-Modus basierend auf Graph-Struktur
   */
  private determineOptimalMode(): LayoutMode {
    const nodeCount = this.nodes.length;
    const edgeCount = this.edges.length;
    
    // Analysiere Graph-Struktur
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || 
      !this.edges.some(e => e.target === n.id)
    );
    
    const endNodes = this.nodes.filter(n => 
      n.type === 'end' || 
      !this.edges.some(e => e.source === n.id)
    );

    // Prüfe auf lineare Struktur
    if (startNodes.length === 1 && endNodes.length === 1) {
      const pathLength = this.calculateLongestPath();
      if (pathLength === nodeCount) {
        return 'vertical'; // Linearer Flow
      }
    }

    // Prüfe auf Baum-Struktur
    if (this.isTreeStructure()) {
      return 'tree';
    }

    // Prüfe Dichte des Graphen
    const density = edgeCount / (nodeCount * (nodeCount - 1) / 2);
    if (density > 0.3) {
      return 'compact';
    }

    // Standard: Vertikal
    return 'vertical';
  }

  /**
   * Initialisiere Dagre Graph mit Optionen
   */
  private initializeDagreGraph(mode: LayoutMode): void {
    const isHorizontal = mode === 'horizontal';
    
    this.dagreGraph.setGraph({
      rankdir: isHorizontal ? 'LR' : 'TB',
      ranksep: this.options.rankSpacing,
      nodesep: this.options.nodeSpacing,
      edgesep: 20,
      ranker: 'network-simplex',
      align: 'UL',
      acyclicer: 'greedy',
    });

    this.dagreGraph.setDefaultEdgeLabel(() => ({}));
  }

  /**
   * Füge Nodes zum Graph hinzu
   */
  private addNodesToGraph(): void {
    // Zuerst normale Nodes, dann Frames
    const nonFrameNodes = this.nodes.filter(n => n.type !== 'frame');
    const frameNodes = this.nodes.filter(n => n.type === 'frame');
    
    // Füge zuerst alle Nicht-Frame-Nodes hinzu
    nonFrameNodes.forEach(node => {
      const width = node.width || this.getNodeDefaultWidth(node.type);
      const height = node.height || this.getNodeDefaultHeight(node.type);
      
      this.dagreGraph.setNode(node.id, {
        width,
        height,
        // Verwende Seed für deterministisches Verhalten
        x: this.deterministicRandom(node.id, 'x') * 100,
        y: this.deterministicRandom(node.id, 'y') * 100,
      });
    });
    
    // Füge Frame-Nodes als Cluster hinzu (wenn unterstützt)
    frameNodes.forEach(frame => {
      const width = frame.width || this.getNodeDefaultWidth(frame.type);
      const height = frame.height || this.getNodeDefaultHeight(frame.type);
      
      this.dagreGraph.setNode(frame.id, {
        width,
        height,
        x: this.deterministicRandom(frame.id, 'x') * 100,
        y: this.deterministicRandom(frame.id, 'y') * 100,
      });
    });
  }

  /**
   * Füge Edges zum Graph hinzu
   */
  private addEdgesToGraph(): void {
    this.edges.forEach(edge => {
      this.dagreGraph.setEdge(edge.source, edge.target, {
        weight: 1,
        minlen: 1,
      });
    });
  }

  /**
   * Extrahiere Node-Positionen aus Dagre
   */
  private extractNodePositions(): Node[] {
    return this.nodes.map(node => {
      const dagreNode = this.dagreGraph.node(node.id);
      if (!dagreNode) return node;

      const width = node.width || dagreNode.width;
      const height = node.height || dagreNode.height;
      const x = dagreNode.x - width / 2;
      const y = dagreNode.y - height / 2;

      // Speichere Position für Visualisierung
      this.nodePositions.set(node.id, {
        id: node.id,
        x1: x,
        y1: y,
        x2: x + width,
        y2: y + height,
        width,
        height,
      });

      return {
        ...node,
        position: { x, y },
        positionAbsolute: { x, y },
        width,
        height,
      };
    });
  }

  /**
   * Stelle sicher dass Frame-Children innerhalb ihrer Frames bleiben
   */
  private maintainFrameRelationships(nodes: Node[]): Node[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const updatedNodes = [...nodes];
    
    // Für jeden Frame, positioniere seine Children relativ
    this.frameChildren.forEach((children, frameId) => {
      const frame = nodeMap.get(frameId);
      if (!frame || children.size === 0) return;
      
      const frameX = frame.position.x;
      const frameY = frame.position.y;
      const frameWidth = frame.width || 400;
      const frameHeight = frame.height || 300;
      const padding = 20;
      
      // Sammle alle Children
      const childNodes: Node[] = [];
      children.forEach(childId => {
        const child = nodeMap.get(childId);
        if (child) childNodes.push(child);
      });
      
      if (childNodes.length === 0) return;
      
      // Berechne Bounding Box der Children nach Layout
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      childNodes.forEach(child => {
        const childWidth = child.width || this.getNodeDefaultWidth(child.type);
        const childHeight = child.height || this.getNodeDefaultHeight(child.type);
        minX = Math.min(minX, child.position.x);
        minY = Math.min(minY, child.position.y);
        maxX = Math.max(maxX, child.position.x + childWidth);
        maxY = Math.max(maxY, child.position.y + childHeight);
      });
      
      const childrenWidth = maxX - minX;
      const childrenHeight = maxY - minY;
      
      // Berechne Skalierung nur wenn nötig
      const availableWidth = frameWidth - 2 * padding;
      const availableHeight = frameHeight - 2 * padding;
      
      let scale = 1;
      let needsScaling = false;
      
      if (childrenWidth > availableWidth || childrenHeight > availableHeight) {
        const scaleX = availableWidth / childrenWidth;
        const scaleY = availableHeight / childrenHeight;
        scale = Math.min(scaleX, scaleY);
        needsScaling = true;
      }
      
      // Zentriere die Children im Frame
      const offsetX = frameX + padding + (availableWidth - childrenWidth * scale) / 2;
      const offsetY = frameY + padding + (availableHeight - childrenHeight * scale) / 2;
      
      // Verschiebe Children in den Frame
      childNodes.forEach(child => {
        const relX = (child.position.x - minX) * scale;
        const relY = (child.position.y - minY) * scale;
        
        // Finde den Node im updatedNodes Array und update seine Position
        const nodeIndex = updatedNodes.findIndex(n => n.id === child.id);
        if (nodeIndex !== -1) {
          updatedNodes[nodeIndex] = {
            ...updatedNodes[nodeIndex],
            position: {
              x: offsetX + relX,
              y: offsetY + relY,
            },
            // Markiere Node als Teil eines Frames
            parentId: frameId,
            parentNode: frameId,
          };
        }
        
        // Update Position Map
        const childWidth = child.width || this.getNodeDefaultWidth(child.type);
        const childHeight = child.height || this.getNodeDefaultHeight(child.type);
        this.nodePositions.set(child.id, {
          id: child.id,
          x1: offsetX + relX,
          y1: offsetY + relY,
          x2: offsetX + relX + childWidth,
          y2: offsetY + relY + childHeight,
          width: childWidth,
          height: childHeight,
        });
      });
      
      // Passe Frame-Größe an, wenn Children nicht passen (nur vergrößern, nie verkleinern)
      if (!needsScaling) {
        const requiredWidth = childrenWidth + 2 * padding;
        const requiredHeight = childrenHeight + 2 * padding;
        
        const frameIndex = updatedNodes.findIndex(n => n.id === frameId);
        if (frameIndex !== -1) {
          updatedNodes[frameIndex] = {
            ...updatedNodes[frameIndex],
            width: Math.max(frameWidth, requiredWidth),
            height: Math.max(frameHeight, requiredHeight),
          };
        }
      }
      
      // Update Frame Position Map
      const finalFrameWidth = updatedNodes.find(n => n.id === frameId)?.width || frameWidth;
      const finalFrameHeight = updatedNodes.find(n => n.id === frameId)?.height || frameHeight;
      
      this.nodePositions.set(frameId, {
        id: frameId,
        x1: frameX,
        y1: frameY,
        x2: frameX + finalFrameWidth,
        y2: frameY + finalFrameHeight,
        width: finalFrameWidth,
        height: finalFrameHeight,
      });
    });
    
    return updatedNodes;
  }

  /**
   * Optimiere Edge-Routing mit besten Handles
   */
  private optimizeEdgeRouting(nodes: Node[]): Edge[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    return this.edges.map(edge => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode || !targetNode) return edge;

      const { sourceHandle, targetHandle } = this.calculateOptimalHandles(
        sourceNode,
        targetNode
      );

      return {
        ...edge,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: '#94a3b8',
          strokeWidth: 2,
        },
      };
    });
  }

  /**
   * Berechne optimale Handles für kürzeste Verbindung
   */
  private calculateOptimalHandles(source: Node, target: Node): {
    sourceHandle: string;
    targetHandle: string;
  } {
    const sourcePos = this.nodePositions.get(source.id);
    const targetPos = this.nodePositions.get(target.id);

    if (!sourcePos || !targetPos) {
      return { sourceHandle: 'right', targetHandle: 'left' };
    }

    // Berechne relative Position
    const dx = targetPos.x1 - sourcePos.x1;
    const dy = targetPos.y1 - sourcePos.y1;

    let sourceHandle: string;
    let targetHandle: string;

    // Bestimme beste Handles basierend auf relativer Position
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominiert
      if (dx > 0) {
        sourceHandle = 'right';
        targetHandle = 'left';
      } else {
        sourceHandle = 'left';
        targetHandle = 'right';
      }
    } else {
      // Vertikal dominiert
      if (dy > 0) {
        sourceHandle = 'bottom';
        targetHandle = 'top';
      } else {
        sourceHandle = 'top';
        targetHandle = 'bottom';
      }
    }

    return { sourceHandle, targetHandle };
  }

  /**
   * Erkenne Kollisionen zwischen Nodes und Edges
   */
  private detectCollisions(nodes: Node[], edges: Edge[]): void {
    this.collisions = [];

    // Node-Node Kollisionen
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pos1 = this.nodePositions.get(nodes[i].id);
        const pos2 = this.nodePositions.get(nodes[j].id);

        if (pos1 && pos2 && this.checkNodeOverlap(pos1, pos2)) {
          this.collisions.push({
            type: 'node-node',
            item1: nodes[i].id,
            item2: nodes[j].id,
            overlapArea: this.calculateOverlapArea(pos1, pos2),
          });
        }
      }
    }

    // Edge-Node Kollisionen (vereinfacht)
    edges.forEach(edge => {
      const sourcePos = this.nodePositions.get(edge.source);
      const targetPos = this.nodePositions.get(edge.target);

      if (!sourcePos || !targetPos) return;

      nodes.forEach(node => {
        if (node.id === edge.source || node.id === edge.target) return;

        const nodePos = this.nodePositions.get(node.id);
        if (!nodePos) return;

        // Vereinfachte Prüfung: Linie durch Node
        if (this.checkEdgeNodeIntersection(sourcePos, targetPos, nodePos)) {
          this.collisions.push({
            type: 'edge-node',
            item1: edge.id,
            item2: node.id,
          });
        }
      });
    });
  }

  /**
   * Prüfe ob zwei Nodes überlappen
   */
  private checkNodeOverlap(pos1: NodePosition, pos2: NodePosition): boolean {
    return !(pos1.x2 < pos2.x1 || pos1.x1 > pos2.x2 || 
             pos1.y2 < pos2.y1 || pos1.y1 > pos2.y2);
  }

  /**
   * Berechne Überlappungsfläche
   */
  private calculateOverlapArea(pos1: NodePosition, pos2: NodePosition): number {
    const xOverlap = Math.max(0, Math.min(pos1.x2, pos2.x2) - Math.max(pos1.x1, pos2.x1));
    const yOverlap = Math.max(0, Math.min(pos1.y2, pos2.y2) - Math.max(pos1.y1, pos2.y1));
    return xOverlap * yOverlap;
  }

  /**
   * Prüfe ob Edge durch Node läuft (vereinfacht)
   */
  private checkEdgeNodeIntersection(
    source: NodePosition,
    target: NodePosition,
    node: NodePosition
  ): boolean {
    // Vereinfachte Prüfung: Linie von Source zu Target
    const lineX1 = source.x1 + source.width / 2;
    const lineY1 = source.y1 + source.height / 2;
    const lineX2 = target.x1 + target.width / 2;
    const lineY2 = target.y1 + target.height / 2;

    // Prüfe ob Linie durch Node-Rechteck geht
    return this.lineIntersectsRect(
      lineX1, lineY1, lineX2, lineY2,
      node.x1, node.y1, node.x2, node.y2
    );
  }

  /**
   * Prüfe ob Linie Rechteck schneidet
   */
  private lineIntersectsRect(
    x1: number, y1: number, x2: number, y2: number,
    rectX1: number, rectY1: number, rectX2: number, rectY2: number
  ): boolean {
    // Vereinfachte Prüfung
    const lineCrossesX = (x1 < rectX1 && x2 > rectX2) || (x1 > rectX2 && x2 < rectX1);
    const lineCrossesY = (y1 < rectY1 && y2 > rectY2) || (y1 > rectY2 && y2 < rectY1);
    
    const lineInRectX = (x1 >= rectX1 && x1 <= rectX2) || (x2 >= rectX1 && x2 <= rectX2);
    const lineInRectY = (y1 >= rectY1 && y1 <= rectY2) || (y2 >= rectY1 && y2 <= rectY2);

    return (lineCrossesX && lineInRectY) || (lineCrossesY && lineInRectX);
  }

  /**
   * Löse Kollisionen auf
   */
  private resolveCollisions(nodes: Node[]): void {
    // Verschiebe kollidierende Nodes leicht
    this.collisions.forEach(collision => {
      if (collision.type === 'node-node') {
        const node1 = nodes.find(n => n.id === collision.item1);
        const node2 = nodes.find(n => n.id === collision.item2);

        if (node1 && node2) {
          // Verschiebe Node2 nach rechts/unten
          node2.position.x += this.options.nodeSpacing / 2;
          node2.position.y += this.options.nodeSpacing / 2;

          // Update Position Map
          const pos2 = this.nodePositions.get(node2.id);
          if (pos2) {
            pos2.x1 += this.options.nodeSpacing / 2;
            pos2.x2 += this.options.nodeSpacing / 2;
            pos2.y1 += this.options.nodeSpacing / 2;
            pos2.y2 += this.options.nodeSpacing / 2;
          }
        }
      }
    });
  }

  /**
   * Generiere Visualisierungs-Informationen
   */
  private generateVisualization(nodes: Node[], edges: Edge[]): LayoutVisualization {
    const nodeInfo = Array.from(this.nodePositions.values());
    
    // Formatiere Debug-String
    let debugInfo = '=== LAYOUT VISUALIZATION ===\\n\\n';
    
    debugInfo += 'NODE POSITIONS:\\n';
    nodeInfo.forEach(pos => {
      const node = nodes.find(n => n.id === pos.id);
      debugInfo += `${pos.id} (${node?.type || 'unknown'}): `;
      debugInfo += `[${Math.round(pos.x1)},${Math.round(pos.y1)}] -> `;
      debugInfo += `[${Math.round(pos.x2)},${Math.round(pos.y2)}] `;
      debugInfo += `(${Math.round(pos.width)}x${Math.round(pos.height)})\\n`;
    });

    if (this.collisions.length > 0) {
      debugInfo += '\\nCOLLISIONS DETECTED:\\n';
      this.collisions.forEach(col => {
        debugInfo += `⚠️ ${col.type}: ${col.item1} <-> ${col.item2}`;
        if (col.overlapArea) {
          debugInfo += ` (overlap: ${Math.round(col.overlapArea)}px²)`;
        }
        debugInfo += '\\n';
      });
    } else {
      debugInfo += '\\n✅ No collisions detected!\\n';
    }

    // Berechne Layout-Score (0-100)
    const layoutScore = this.calculateLayoutScore(nodes, edges);
    debugInfo += `\\nLAYOUT SCORE: ${layoutScore}/100\\n`;

    // Edge-Routen
    const edgeRoutes = edges.map(edge => {
      const source = this.nodePositions.get(edge.source);
      const target = this.nodePositions.get(edge.target);
      
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || 'right',
        targetHandle: edge.targetHandle || 'left',
        path: source && target ? [
          { x: source.x1 + source.width / 2, y: source.y1 + source.height / 2 },
          { x: target.x1 + target.width / 2, y: target.y1 + target.height / 2 },
        ] : [],
      };
    });

    return {
      nodePositions: nodeInfo,
      collisions: this.collisions,
      edgeRoutes,
      layoutScore,
      debugInfo,
    };
  }

  /**
   * Berechne Layout-Qualitäts-Score
   */
  private calculateLayoutScore(nodes: Node[], edges: Edge[]): number {
    let score = 100;

    // Ziehe Punkte für Kollisionen ab
    score -= this.collisions.length * 10;

    // Ziehe Punkte für zu nahe Nodes ab
    const minDistance = this.calculateMinNodeDistance(nodes);
    if (minDistance < this.options.nodeSpacing / 2) {
      score -= 20;
    }

    // Bonus für gleichmäßige Verteilung
    const distribution = this.calculateDistributionScore(nodes);
    score += distribution * 10;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Berechne minimalen Abstand zwischen Nodes
   */
  private calculateMinNodeDistance(nodes: Node[]): number {
    let minDistance = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const pos1 = this.nodePositions.get(nodes[i].id);
        const pos2 = this.nodePositions.get(nodes[j].id);

        if (pos1 && pos2) {
          const dx = (pos1.x1 + pos1.width / 2) - (pos2.x1 + pos2.width / 2);
          const dy = (pos1.y1 + pos1.height / 2) - (pos2.y1 + pos2.height / 2);
          const distance = Math.sqrt(dx * dx + dy * dy);
          minDistance = Math.min(minDistance, distance);
        }
      }
    }

    return minDistance;
  }

  /**
   * Berechne Verteilungs-Score (0-1)
   */
  private calculateDistributionScore(nodes: Node[]): number {
    if (nodes.length < 3) return 1;

    const positions = nodes.map(n => this.nodePositions.get(n.id)).filter(p => p);
    if (positions.length === 0) return 0;

    // Berechne Standardabweichung der Abstände
    const distances: number[] = [];
    for (let i = 0; i < positions.length - 1; i++) {
      const dx = positions[i + 1]!.x1 - positions[i]!.x1;
      const dy = positions[i + 1]!.y1 - positions[i]!.y1;
      distances.push(Math.sqrt(dx * dx + dy * dy));
    }

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);

    // Normalisiere auf 0-1 (niedrige Standardabweichung = bessere Verteilung)
    return Math.max(0, 1 - (stdDev / avgDistance));
  }

  /**
   * Prüfe ob Graph eine Baum-Struktur ist
   */
  private isTreeStructure(): boolean {
    // Ein Baum hat n-1 Kanten für n Knoten
    if (this.edges.length !== this.nodes.length - 1) return false;

    // Prüfe auf Zyklen
    const visited = new Set<string>();
    const queue = [this.nodes[0]?.id];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;

      visited.add(current);

      const neighbors = this.edges
        .filter(e => e.source === current || e.target === current)
        .map(e => e.source === current ? e.target : e.source)
        .filter(n => !visited.has(n));

      queue.push(...neighbors);
    }

    return visited.size === this.nodes.length;
  }

  /**
   * Berechne längsten Pfad im Graph
   */
  private calculateLongestPath(): number {
    const distances = new Map<string, number>();
    const visited = new Set<string>();

    // Initialisiere mit Start-Nodes
    const startNodes = this.nodes.filter(n => 
      !this.edges.some(e => e.target === n.id)
    );

    startNodes.forEach(node => {
      distances.set(node.id, 0);
    });

    // Topologische Sortierung und Distanzberechnung
    let maxDistance = 0;
    const queue = [...startNodes.map(n => n.id)];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;

      visited.add(current);
      const currentDistance = distances.get(current) || 0;

      const neighbors = this.edges
        .filter(e => e.source === current)
        .map(e => e.target);

      neighbors.forEach(neighbor => {
        const newDistance = currentDistance + 1;
        const existingDistance = distances.get(neighbor) || 0;
        
        if (newDistance > existingDistance) {
          distances.set(neighbor, newDistance);
          maxDistance = Math.max(maxDistance, newDistance);
        }

        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    return maxDistance + 1;
  }

  /**
   * Deterministischer Pseudo-Zufallsgenerator
   */
  private deterministicRandom(id: string, type: string): number {
    // Einfacher Hash basierend auf ID und Type
    let hash = this.options.seed;
    const str = id + type;
    
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }

    return Math.abs(hash % 1000) / 1000;
  }

  /**
   * Standard-Breiten für Node-Typen
   */
  private getNodeDefaultWidth(type?: string): number {
    const widths: Record<string, number> = {
      start: 120,
      end: 120,
      screen: 200,
      decision: 180,
      action: 160,
      frame: 400,
      data: 140,
      process: 180,
      annotation: 200,
    };
    return widths[type || 'default'] || 160;
  }

  /**
   * Standard-Höhen für Node-Typen
   */
  private getNodeDefaultHeight(type?: string): number {
    const heights: Record<string, number> = {
      start: 60,
      end: 60,
      screen: 100,
      decision: 80,
      action: 70,
      frame: 300,
      data: 60,
      process: 80,
      annotation: 60,
    };
    return heights[type || 'default'] || 80;
  }
}

/**
 * Haupt-Export-Funktion für einfache Verwendung
 */
export function applyUltimateLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): { 
  nodes: Node[]; 
  edges: Edge[]; 
  visualization?: LayoutVisualization;
} {
  const layout = new UltimateAutoLayout(nodes, edges, options);
  return layout.execute();
}

/**
 * Debug-Funktion zum Anzeigen der Visualisierung in der Konsole
 */
export function logLayoutVisualization(visualization: LayoutVisualization): void {
  console.log(visualization.debugInfo);
  
  if (visualization.collisions.length > 0) {
    console.group('Collision Details:');
    visualization.collisions.forEach(col => {
      console.warn(`${col.type}: ${col.item1} <-> ${col.item2}`, col);
    });
    console.groupEnd();
  }

  console.log('Layout Score:', visualization.layoutScore);
}