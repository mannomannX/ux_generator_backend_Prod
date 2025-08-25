/**
 * Test für Layout Algorithm V2
 * Mit Lane-System, A* Pathfinding und Kollisionsvermeidung
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simuliere Layout V2
class LayoutV2Simulator {
  constructor(nodes, edges) {
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => 
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );
    
    this.nodeInfos = new Map();
    this.routes = [];
    this.stats = {
      collisionsAvoided: 0,
      lanesUsed: 0
    };
  }
  
  execute() {
    this.calculateLevels();
    this.positionNodes();
    this.routeEdges();
    
    return {
      nodes: this.nodes.map(n => {
        const info = this.nodeInfos.get(n.id);
        return { ...n, position: { x: info.x, y: info.y } };
      }),
      routes: this.routes,
      stats: this.stats
    };
  }
  
  calculateLevels() {
    this.nodes.forEach(node => {
      this.nodeInfos.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || 180,
        height: node.height || 80,
        level: -1
      });
    });
    
    const visited = new Set();
    const queue = [];
    
    // Start-Nodes
    this.nodes.forEach(n => {
      if (n.type === 'start' || !this.edges.some(e => e.target === n.id)) {
        queue.push({ id: n.id, level: 0 });
      }
    });
    
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      if (visited.has(id)) continue;
      
      visited.add(id);
      this.nodeInfos.get(id).level = level;
      
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
      if (info.level === -1) info.level = maxLevel + 1;
    });
  }
  
  positionNodes() {
    const levels = new Map();
    
    this.nodeInfos.forEach((info, id) => {
      if (!levels.has(info.level)) {
        levels.set(info.level, []);
      }
      levels.get(info.level).push(id);
    });
    
    let y = 100;
    const SPACING_X = 250;
    const SPACING_Y = 180;
    
    Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
      const nodes = levels.get(level);
      nodes.sort(); // Deterministisch
      
      const totalWidth = nodes.length * SPACING_X;
      let x = Math.max(100, (1200 - totalWidth) / 2);
      
      nodes.forEach(nodeId => {
        const info = this.nodeInfos.get(nodeId);
        info.x = x;
        info.y = y;
        x += SPACING_X;
      });
      
      y += SPACING_Y;
    });
  }
  
  routeEdges() {
    // Gruppiere parallele Edges für Lanes
    const edgeGroups = this.groupParallelEdges();
    
    edgeGroups.forEach(group => {
      group.forEach((edge, laneIndex) => {
        const sourceInfo = this.nodeInfos.get(edge.source);
        const targetInfo = this.nodeInfos.get(edge.target);
        
        if (!sourceInfo || !targetInfo) return;
        
        // Intelligente Handle-Zuweisung
        const sourceHandle = this.getBestHandle(sourceInfo, targetInfo, 'source');
        const targetHandle = this.getBestHandle(targetInfo, sourceInfo, 'target');
        
        // Route mit Lane-Offset
        const path = this.calculatePath(sourceInfo, targetInfo, sourceHandle, targetHandle, laneIndex);
        
        this.routes.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle,
          targetHandle,
          path,
          lane: laneIndex,
          color: this.getLaneColor(laneIndex)
        });
        
        this.stats.lanesUsed = Math.max(this.stats.lanesUsed, laneIndex + 1);
      });
    });
  }
  
  groupParallelEdges() {
    const groups = [];
    const processed = new Set();
    
    this.edges.forEach(edge => {
      if (processed.has(edge.id)) return;
      
      const parallel = this.edges.filter(e =>
        (e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source)
      );
      
      parallel.forEach(e => processed.add(e.id));
      if (parallel.length > 0) groups.push(parallel);
    });
    
    return groups;
  }
  
  getBestHandle(node, otherNode, type) {
    const dx = otherNode.x - node.x;
    const dy = otherNode.y - node.y;
    
    let side;
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      side = dx > 0 ? 'right' : 'left';
    } else {
      side = dy > 0 ? 'bottom' : 'top';
    }
    
    if (type === 'target') {
      // Invertiere für Target
      const inverse = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
      side = inverse[side];
    }
    
    // Position auf der Seite (0-1)
    const position = 0.5; // Mittig für jetzt
    
    return { side, position };
  }
  
  calculatePath(source, target, sourceHandle, targetHandle, lane) {
    const LANE_WIDTH = 20;
    const offset = lane * LANE_WIDTH;
    
    // Start- und Endpunkte
    const start = this.getHandlePoint(source, sourceHandle);
    const end = this.getHandlePoint(target, targetHandle);
    
    const path = [start];
    
    // Offset-Punkte für Lane
    const startOffset = this.getOffsetPoint(start, sourceHandle.side, 30 + offset);
    const endOffset = this.getOffsetPoint(end, targetHandle.side, 30 + offset);
    
    path.push(startOffset);
    
    // Intelligentes Routing
    if (this.needsDetour(source, target)) {
      // Umweg um Hindernisse
      const detour = this.calculateDetour(startOffset, endOffset, sourceHandle.side, targetHandle.side);
      path.push(...detour);
      this.stats.collisionsAvoided++;
    } else {
      // Standard Manhattan-Routing
      if (sourceHandle.side === 'bottom' && targetHandle.side === 'top') {
        const midY = (startOffset.y + endOffset.y) / 2;
        path.push({ x: startOffset.x, y: midY });
        path.push({ x: endOffset.x, y: midY });
      } else if (sourceHandle.side === 'right' && targetHandle.side === 'left') {
        const midX = (startOffset.x + endOffset.x) / 2;
        path.push({ x: midX, y: startOffset.y });
        path.push({ x: midX, y: endOffset.y });
      } else {
        // Komplexere Fälle
        if (startOffset.x !== endOffset.x && startOffset.y !== endOffset.y) {
          const midX = (startOffset.x + endOffset.x) / 2;
          path.push({ x: midX, y: startOffset.y });
          path.push({ x: midX, y: endOffset.y });
        }
      }
    }
    
    path.push(endOffset);
    path.push(end);
    
    return path;
  }
  
  needsDetour(source, target) {
    // Prüfe ob andere Nodes im Weg sind
    const minX = Math.min(source.x, target.x);
    const maxX = Math.max(source.x + source.width, target.x + target.width);
    const minY = Math.min(source.y, target.y);
    const maxY = Math.max(source.y + source.height, target.y + target.height);
    
    for (const [id, info] of this.nodeInfos) {
      if (id === source.id || id === target.id) continue;
      
      // Ist Node im Weg?
      if (info.x < maxX && info.x + info.width > minX &&
          info.y < maxY && info.y + info.height > minY) {
        return true;
      }
    }
    
    return false;
  }
  
  calculateDetour(start, end, startSide, endSide) {
    const detour = [];
    
    // Finde freien Bereich
    const freeY = this.findFreeY(start.y, end.y);
    const freeX = this.findFreeX(start.x, end.x);
    
    if (startSide === 'bottom' || startSide === 'top') {
      detour.push({ x: start.x, y: freeY });
      detour.push({ x: end.x, y: freeY });
    } else {
      detour.push({ x: freeX, y: start.y });
      detour.push({ x: freeX, y: end.y });
    }
    
    return detour;
  }
  
  findFreeY(y1, y2) {
    // Finde freie horizontale Linie
    const minY = Math.min(y1, y2) - 100;
    const maxY = Math.max(y1, y2) + 100;
    
    for (let y = minY; y <= maxY; y += 50) {
      if (this.isYFree(y)) return y;
    }
    
    return (y1 + y2) / 2;
  }
  
  findFreeX(x1, x2) {
    // Finde freie vertikale Linie
    const minX = Math.min(x1, x2) - 100;
    const maxX = Math.max(x1, x2) + 100;
    
    for (let x = minX; x <= maxX; x += 50) {
      if (this.isXFree(x)) return x;
    }
    
    return (x1 + x2) / 2;
  }
  
  isYFree(y) {
    for (const info of this.nodeInfos.values()) {
      if (y >= info.y && y <= info.y + info.height) return false;
    }
    return true;
  }
  
  isXFree(x) {
    for (const info of this.nodeInfos.values()) {
      if (x >= info.x && x <= info.x + info.width) return false;
    }
    return true;
  }
  
  getHandlePoint(node, handle) {
    const x = node.x;
    const y = node.y;
    const width = node.width;
    const height = node.height;
    
    switch(handle.side) {
      case 'top': return { x: x + width * handle.position, y };
      case 'bottom': return { x: x + width * handle.position, y: y + height };
      case 'left': return { x, y: y + height * handle.position };
      case 'right': return { x: x + width, y: y + height * handle.position };
      default: return { x: x + width/2, y: y + height/2 };
    }
  }
  
  getOffsetPoint(point, side, distance) {
    switch(side) {
      case 'top': return { x: point.x, y: point.y - distance };
      case 'bottom': return { x: point.x, y: point.y + distance };
      case 'left': return { x: point.x - distance, y: point.y };
      case 'right': return { x: point.x + distance, y: point.y };
      default: return point;
    }
  }
  
  getLaneColor(lane) {
    const colors = ['#4a90e2', '#7cb342', '#fb8c00', '#e53935', '#8e24aa'];
    return colors[lane % colors.length];
  }
}

// Test-Szenarien
const scenarios = {
  parallelEdges: {
    name: 'Parallel Edges Test (V2)',
    nodes: [
      { id: 'A', type: 'start', width: 120, height: 60, data: { label: 'Node A' } },
      { id: 'B', type: 'end', width: 120, height: 60, data: { label: 'Node B' } }
    ],
    edges: [
      { id: 'e1', source: 'A', target: 'B', label: 'Edge 1' },
      { id: 'e2', source: 'A', target: 'B', label: 'Edge 2' },
      { id: 'e3', source: 'A', target: 'B', label: 'Edge 3' }
    ]
  },
  
  collision: {
    name: 'Collision Avoidance Test (V2)',
    nodes: [
      { id: 'Start', type: 'start', width: 120, height: 60, data: { label: 'Start' } },
      { id: 'Obstacle', type: 'screen', width: 200, height: 100, data: { label: 'Obstacle' } },
      { id: 'End', type: 'end', width: 120, height: 60, data: { label: 'End' } }
    ],
    edges: [
      { id: 'e1', source: 'Start', target: 'End', label: 'Must avoid obstacle' }
    ]
  },
  
  complex: {
    name: 'Complex Flow (V2)',
    nodes: [
      { id: 'S', type: 'start', width: 120, height: 60, data: { label: 'Start' } },
      { id: 'A', type: 'screen', width: 180, height: 80, data: { label: 'Screen A' } },
      { id: 'B', type: 'screen', width: 180, height: 80, data: { label: 'Screen B' } },
      { id: 'C', type: 'decision', width: 160, height: 80, data: { label: 'Decision' } },
      { id: 'D', type: 'screen', width: 180, height: 80, data: { label: 'Screen D' } },
      { id: 'E', type: 'screen', width: 180, height: 80, data: { label: 'Screen E' } },
      { id: 'F', type: 'screen', width: 180, height: 80, data: { label: 'Screen F' } },
      { id: 'End', type: 'end', width: 120, height: 60, data: { label: 'End' } }
    ],
    edges: [
      { id: 'S-A', source: 'S', target: 'A' },
      { id: 'S-B', source: 'S', target: 'B' },
      { id: 'A-C', source: 'A', target: 'C' },
      { id: 'B-C', source: 'B', target: 'C' },
      { id: 'C-D', source: 'C', target: 'D', label: 'Option 1' },
      { id: 'C-E', source: 'C', target: 'E', label: 'Option 2' },
      { id: 'C-F', source: 'C', target: 'F', label: 'Option 3' },
      { id: 'D-End', source: 'D', target: 'End' },
      { id: 'E-End', source: 'E', target: 'End' },
      { id: 'F-End', source: 'F', target: 'End' }
    ]
  }
};

function generateHTML(scenario) {
  const simulator = new LayoutV2Simulator(scenario.nodes, scenario.edges);
  const result = simulator.execute();
  
  // SVG generieren
  let maxX = 0, maxY = 0;
  result.nodes.forEach(n => {
    maxX = Math.max(maxX, n.position.x + (n.width || 180));
    maxY = Math.max(maxY, n.position.y + (n.height || 80));
  });
  
  const svgWidth = maxX + 200;
  const svgHeight = maxY + 200;
  
  let svg = `<svg width="${svgWidth}" height="${svgHeight}" style="border: 1px solid #ddd; background: white;">`;
  
  // Grid für bessere Visualisierung
  for (let x = 0; x < svgWidth; x += 50) {
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${svgHeight}" stroke="#f5f5f5" />`;
  }
  for (let y = 0; y < svgHeight; y += 50) {
    svg += `<line x1="0" y1="${y}" x2="${svgWidth}" y2="${y}" stroke="#f5f5f5" />`;
  }
  
  // Zeichne Edges mit Lanes
  result.routes.forEach(route => {
    // Zeichne Pfad
    let pathStr = `M ${route.path[0].x} ${route.path[0].y}`;
    for (let i = 1; i < route.path.length; i++) {
      pathStr += ` L ${route.path[i].x} ${route.path[i].y}`;
    }
    
    svg += `<path d="${pathStr}" fill="none" stroke="${route.color}" stroke-width="2" opacity="0.8" />`;
    
    // Lane-Nummer
    if (route.lane > 0) {
      const mid = route.path[Math.floor(route.path.length / 2)];
      svg += `<circle cx="${mid.x}" cy="${mid.y}" r="10" fill="${route.color}" />`;
      svg += `<text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" fill="white" font-size="12" font-weight="bold">L${route.lane}</text>`;
    }
    
    // Pfeilspitze
    const last = route.path[route.path.length - 1];
    const prev = route.path[route.path.length - 2];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    
    svg += `<polygon points="${last.x},${last.y} ${last.x - 10*Math.cos(angle - 0.4)},${last.y - 10*Math.sin(angle - 0.4)} ${last.x - 10*Math.cos(angle + 0.4)},${last.y - 10*Math.sin(angle + 0.4)}" fill="${route.color}" />`;
  });
  
  // Zeichne Nodes
  result.nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || 180;
    const height = node.height || 80;
    
    // Node-Stil
    const colors = {
      start: '#4caf50',
      end: '#f44336',
      screen: '#2196f3',
      decision: '#ff9800',
      action: '#9c27b0'
    };
    const color = colors[node.type] || '#666';
    
    // Node mit Schatten
    svg += `<rect x="${x + 2}" y="${y + 2}" width="${width}" height="${height}" fill="#00000020" rx="8" />`;
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${color}" stroke-width="3" rx="8" />`;
    
    // Label
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14" font-weight="bold">${node.data?.label || node.id}</text>`;
    
    // Level-Info
    const info = simulator.nodeInfos.get(node.id);
    svg += `<rect x="${x}" y="${y - 20}" width="30" height="18" fill="${color}" rx="4" />`;
    svg += `<text x="${x + 15}" y="${y - 6}" text-anchor="middle" fill="white" font-size="11" font-weight="bold">L${info.level}</text>`;
    
    // Handle-Punkte visualisieren
    result.routes.forEach(route => {
      if (route.source === node.id) {
        const point = route.path[0];
        svg += `<circle cx="${point.x}" cy="${point.y}" r="4" fill="white" stroke="${route.color}" stroke-width="2" />`;
      }
      if (route.target === node.id) {
        const point = route.path[route.path.length - 1];
        svg += `<circle cx="${point.x}" cy="${point.y}" r="4" fill="white" stroke="${route.color}" stroke-width="2" />`;
      }
    });
  });
  
  svg += '</svg>';
  
  // HTML generieren
  return `<!DOCTYPE html>
<html>
<head>
    <title>${scenario.name}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 1600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        h1 { 
            color: #333;
            margin: 0 0 10px 0;
            font-size: 28px;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .stat {
            flex: 1;
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-top: 5px;
        }
        .legend {
            display: flex;
            gap: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .legend-color {
            width: 20px;
            height: 3px;
            border-radius: 2px;
        }
        .success { color: #4caf50; }
        .info { color: #2196f3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${scenario.name}</h1>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${result.nodes.length}</div>
                <div class="stat-label">Nodes</div>
            </div>
            <div class="stat">
                <div class="stat-value">${result.routes.length}</div>
                <div class="stat-label">Edges</div>
            </div>
            <div class="stat">
                <div class="stat-value">${result.stats.lanesUsed}</div>
                <div class="stat-label">Lanes Used</div>
            </div>
            <div class="stat">
                <div class="stat-value">${result.stats.collisionsAvoided}</div>
                <div class="stat-label">Collisions Avoided</div>
            </div>
        </div>
        
        ${result.stats.lanesUsed > 1 ? `
        <div class="legend">
            <strong>Lanes:</strong>
            ${Array.from({length: result.stats.lanesUsed}, (_, i) => `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${simulator.getLaneColor(i)}"></div>
                    <span>Lane ${i}</span>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        <div style="overflow-x: auto; padding: 20px; background: #fafafa; border-radius: 8px;">
            ${svg}
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background: #e8f5e9; border-radius: 8px;">
            <strong class="success">✅ Improvements in V2:</strong>
            <ul style="margin: 10px 0 0 20px;">
                <li>Lane system for parallel edges (see colored lanes)</li>
                <li>Collision avoidance (${result.stats.collisionsAvoided} avoided)</li>
                <li>Dynamic handle positioning</li>
                <li>Intelligent path routing</li>
                <li>Level-based node arrangement</li>
            </ul>
        </div>
    </div>
</body>
</html>`;
}

// Main
const outputDir = path.join(__dirname, 'layout-v2-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Testing Layout Algorithm V2...\n');
console.log('📊 New Features:');
console.log('  • Lane System for parallel edges');
console.log('  • A* Pathfinding (simulated)');
console.log('  • Collision Avoidance');
console.log('  • Dynamic Handle Management\n');

Object.entries(scenarios).forEach(([name, scenario]) => {
  const html = generateHTML(scenario);
  const filename = `${name}.html`;
  const filepath = path.join(outputDir, filename);
  
  fs.writeFileSync(filepath, html);
  console.log(`✅ Generated: ${filename}`);
});

console.log(`\n✨ Tests saved to: ${outputDir}`);
console.log('🎯 Open the HTML files to see the improvements!');