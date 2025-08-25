/**
 * Test für den verbesserten Layout-Algorithmus
 * Generiert HTML zur visuellen Inspektion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simuliere den verbesserten Algorithmus
class ImprovedLayoutSimulator {
  constructor(nodes, edges, mode = 'compact') {
    this.nodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    this.edges = [...edges].sort((a, b) => 
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );
    this.mode = mode;
    this.nodeInfos = new Map();
    this.handleInfos = new Map();
    this.problems = [];
  }
  
  execute() {
    // Phase 1: Level-Berechnung
    this.calculateLevels();
    
    // Phase 2: Positionierung
    this.positionNodes();
    
    // Phase 3: Handle-Zuweisung
    this.assignHandles();
    
    return {
      nodes: this.nodes.map(n => {
        const info = this.nodeInfos.get(n.id);
        return { ...n, position: { x: info.x, y: info.y } };
      }),
      handles: this.handleInfos,
      problems: this.problems
    };
  }
  
  calculateLevels() {
    // Initialisiere
    this.nodes.forEach(node => {
      this.nodeInfos.set(node.id, {
        id: node.id,
        x: 0,
        y: 0,
        width: node.width || 160,
        height: node.height || 80,
        level: -1,
        type: node.type
      });
    });
    
    // Finde Start-Nodes
    const startNodes = this.nodes.filter(n => 
      n.type === 'start' || !this.edges.some(e => e.target === n.id)
    );
    
    // BFS für Levels
    const visited = new Set();
    const queue = startNodes.map(n => ({ id: n.id, level: 0 }));
    
    while (queue.length > 0) {
      const { id, level } = queue.shift();
      if (visited.has(id)) continue;
      
      visited.add(id);
      this.nodeInfos.get(id).level = level;
      
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
        this.problems.push(`Node ${info.id} ist isoliert`);
      }
    });
  }
  
  positionNodes() {
    if (this.mode === 'compact') {
      // Gruppiere nach Level
      const levels = new Map();
      
      this.nodeInfos.forEach((info, id) => {
        if (!levels.has(info.level)) {
          levels.set(info.level, []);
        }
        levels.get(info.level).push(id);
      });
      
      // Positioniere
      let y = 50;
      const NODE_SPACING_X = 250;
      const NODE_SPACING_Y = 150;
      
      Array.from(levels.keys()).sort((a, b) => a - b).forEach(level => {
        const nodes = levels.get(level);
        const totalWidth = nodes.length * NODE_SPACING_X;
        let x = (1000 - totalWidth) / 2 + 100; // Zentriert
        
        nodes.forEach(nodeId => {
          const info = this.nodeInfos.get(nodeId);
          info.x = x;
          info.y = y;
          x += NODE_SPACING_X;
        });
        
        y += NODE_SPACING_Y;
      });
    }
  }
  
  assignHandles() {
    this.nodes.forEach(node => {
      const handles = [];
      const info = this.nodeInfos.get(node.id);
      
      // Eingehende Edges
      const incoming = this.edges.filter(e => e.target === node.id);
      const outgoing = this.edges.filter(e => e.source === node.id);
      
      // VERBESSERT: Verteile auf verschiedene Seiten!
      incoming.forEach((edge, i) => {
        const sourceInfo = this.nodeInfos.get(edge.source);
        
        // Bestimme beste Seite basierend auf relativer Position
        let side = 'top';
        if (sourceInfo) {
          const dx = sourceInfo.x - info.x;
          const dy = sourceInfo.y - info.y;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            side = dx < 0 ? 'left' : 'right';
          } else {
            side = dy < 0 ? 'top' : 'bottom';
          }
        }
        
        handles.push({
          edge: edge.id,
          side,
          index: handles.filter(h => h.side === side && h.direction === 'in').length,
          direction: 'in'
        });
      });
      
      // Ausgehende Edges
      outgoing.forEach((edge, i) => {
        const targetInfo = this.nodeInfos.get(edge.target);
        
        // Bestimme beste Seite
        let side = 'bottom';
        if (targetInfo) {
          const dx = targetInfo.x - info.x;
          const dy = targetInfo.y - info.y;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            side = dx > 0 ? 'right' : 'left';
          } else {
            side = dy > 0 ? 'bottom' : 'top';
          }
        }
        
        handles.push({
          edge: edge.id,
          side,
          index: handles.filter(h => h.side === side && h.direction === 'out').length,
          direction: 'out'
        });
      });
      
      this.handleInfos.set(node.id, handles);
    });
  }
}

// Test-Szenarien
const scenarios = {
  simple: {
    name: 'Simple Flow (Improved)',
    nodes: [
      { id: 'A', type: 'start', width: 120, height: 60, data: { label: 'Start' } },
      { id: 'B', type: 'screen', width: 200, height: 100, data: { label: 'Screen B' } },
      { id: 'C', type: 'decision', width: 180, height: 80, data: { label: 'Decision' } },
      { id: 'D', type: 'screen', width: 200, height: 100, data: { label: 'Screen D' } },
      { id: 'E', type: 'screen', width: 200, height: 100, data: { label: 'Screen E' } },
      { id: 'F', type: 'end', width: 120, height: 60, data: { label: 'End' } }
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B' },
      { id: 'B-C', source: 'B', target: 'C' },
      { id: 'C-D', source: 'C', target: 'D', label: 'Yes' },
      { id: 'C-E', source: 'C', target: 'E', label: 'No' },
      { id: 'D-F', source: 'D', target: 'F' },
      { id: 'E-F', source: 'E', target: 'F' }
    ]
  },
  
  complex: {
    name: 'Complex Hub (Improved)',
    nodes: [
      { id: 'Hub', type: 'screen', width: 200, height: 100, data: { label: 'Central Hub' } },
      { id: 'In1', type: 'screen', width: 160, height: 80, data: { label: 'Input 1' } },
      { id: 'In2', type: 'screen', width: 160, height: 80, data: { label: 'Input 2' } },
      { id: 'In3', type: 'screen', width: 160, height: 80, data: { label: 'Input 3' } },
      { id: 'Out1', type: 'screen', width: 160, height: 80, data: { label: 'Output 1' } },
      { id: 'Out2', type: 'screen', width: 160, height: 80, data: { label: 'Output 2' } },
      { id: 'Out3', type: 'screen', width: 160, height: 80, data: { label: 'Output 3' } }
    ],
    edges: [
      { id: 'In1-Hub', source: 'In1', target: 'Hub' },
      { id: 'In2-Hub', source: 'In2', target: 'Hub' },
      { id: 'In3-Hub', source: 'In3', target: 'Hub' },
      { id: 'Hub-Out1', source: 'Hub', target: 'Out1' },
      { id: 'Hub-Out2', source: 'Hub', target: 'Out2' },
      { id: 'Hub-Out3', source: 'Hub', target: 'Out3' }
    ]
  }
};

function generateHTML(scenario, mode) {
  const simulator = new ImprovedLayoutSimulator(scenario.nodes, scenario.edges, mode);
  const result = simulator.execute();
  
  // SVG generieren
  let maxX = 0, maxY = 0;
  result.nodes.forEach(n => {
    maxX = Math.max(maxX, n.position.x + (n.width || 160));
    maxY = Math.max(maxY, n.position.y + (n.height || 80));
  });
  
  const svgWidth = maxX + 100;
  const svgHeight = maxY + 100;
  
  let svg = `<svg width="${svgWidth}" height="${svgHeight}" style="border: 1px solid #ddd;">`;
  
  // Grid-Linien für bessere Visualisierung
  for (let x = 0; x < svgWidth; x += 50) {
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${svgHeight}" stroke="#f0f0f0" />`;
  }
  for (let y = 0; y < svgHeight; y += 50) {
    svg += `<line x1="0" y1="${y}" x2="${svgWidth}" y2="${y}" stroke="#f0f0f0" />`;
  }
  
  // Zeichne Edges mit Manhattan-Routing
  scenario.edges.forEach(edge => {
    const source = result.nodes.find(n => n.id === edge.source);
    const target = result.nodes.find(n => n.id === edge.target);
    const sourceHandles = result.handles.get(edge.source) || [];
    const targetHandles = result.handles.get(edge.target) || [];
    
    const sourceHandle = sourceHandles.find(h => h.edge === edge.id);
    const targetHandle = targetHandles.find(h => h.edge === edge.id);
    
    if (source && target && sourceHandle && targetHandle) {
      // Berechne Handle-Positionen
      const sourcePos = getHandlePos(source, sourceHandle);
      const targetPos = getHandlePos(target, targetHandle);
      
      // Manhattan-Routing (90° Winkel)
      const path = getManhattanPath(sourcePos, targetPos, sourceHandle.side, targetHandle.side);
      
      // Zeichne Pfad
      let pathStr = `M ${path[0].x} ${path[0].y}`;
      for (let i = 1; i < path.length; i++) {
        pathStr += ` L ${path[i].x} ${path[i].y}`;
      }
      
      svg += `<path d="${pathStr}" fill="none" stroke="#666" stroke-width="2" />`;
      
      // Pfeilspitze
      const last = path[path.length - 1];
      const prev = path[path.length - 2];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      
      svg += `<polygon points="${last.x},${last.y} ${last.x - 8*Math.cos(angle - 0.5)},${last.y - 8*Math.sin(angle - 0.5)} ${last.x - 8*Math.cos(angle + 0.5)},${last.y - 8*Math.sin(angle + 0.5)}" fill="#666" />`;
      
      // Label
      if (edge.label) {
        const mid = path[Math.floor(path.length / 2)];
        svg += `<text x="${mid.x}" y="${mid.y - 5}" font-size="12" fill="#333">${edge.label}</text>`;
      }
    }
  });
  
  // Zeichne Nodes
  result.nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || 160;
    const height = node.height || 80;
    
    // Node-Farbe
    const colors = {
      start: '#4caf50',
      end: '#f44336',
      screen: '#2196f3',
      decision: '#ff9800',
      action: '#9c27b0'
    };
    const color = colors[node.type] || '#666';
    
    // Node
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${color}" stroke-width="2" rx="4" />`;
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14">${node.data?.label || node.id}</text>`;
    
    // Level-Info
    const info = simulator.nodeInfos.get(node.id);
    svg += `<text x="${x + 5}" y="${y - 5}" font-size="10" fill="#999">L${info.level}</text>`;
    
    // Zeichne Handles
    const handles = result.handles.get(node.id) || [];
    handles.forEach(handle => {
      const pos = getHandlePos(node, handle);
      const color = handle.direction === 'in' ? '#4caf50' : '#f44336';
      
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4" fill="white" stroke="${color}" stroke-width="2" />`;
      
      // Handle-Info
      const offset = 15;
      const textX = handle.side === 'left' ? pos.x - offset : 
                    handle.side === 'right' ? pos.x + offset : pos.x;
      const textY = handle.side === 'top' ? pos.y - offset :
                    handle.side === 'bottom' ? pos.y + offset : pos.y;
      
      svg += `<text x="${textX}" y="${textY + 3}" font-size="8" fill="${color}" text-anchor="middle">${handle.side[0].toUpperCase()}${handle.index}</text>`;
    });
  });
  
  svg += '</svg>';
  
  // HTML generieren
  return `<!DOCTYPE html>
<html>
<head>
    <title>${scenario.name} - ${mode}</title>
    <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        h1 { color: #333; }
        .info { background: #e3f2fd; padding: 10px; border-radius: 4px; margin: 20px 0; }
        .problems { background: #ffebee; padding: 10px; border-radius: 4px; margin: 20px 0; }
        .success { background: #e8f5e9; padding: 10px; border-radius: 4px; margin: 20px 0; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${scenario.name}</h1>
        <div class="info">
            <strong>Mode:</strong> ${mode} | 
            <strong>Nodes:</strong> ${result.nodes.length} | 
            <strong>Edges:</strong> ${scenario.edges.length}
        </div>
        
        ${svg}
        
        <h2>Analyse</h2>
        ${result.problems.length > 0 ?
          `<div class="problems"><strong>Probleme:</strong><ul>${result.problems.map(p => `<li>${p}</li>`).join('')}</ul></div>` :
          '<div class="success">✅ Keine Probleme erkannt!</div>'
        }
        
        <h2>Handle-Verteilung</h2>
        <pre>${JSON.stringify(Object.fromEntries(result.handles), null, 2)}</pre>
    </div>
</body>
</html>`;
}

function getHandlePos(node, handle) {
  const x = node.position.x;
  const y = node.position.y;
  const width = node.width || 160;
  const height = node.height || 80;
  const spacing = 40;
  const offset = spacing * handle.index + spacing;
  
  switch(handle.side) {
    case 'top': return { x: x + width/2, y };
    case 'bottom': return { x: x + width/2, y: y + height };
    case 'left': return { x, y: y + height/2 };
    case 'right': return { x: x + width, y: y + height/2 };
    default: return { x: x + width/2, y: y + height/2 };
  }
}

function getManhattanPath(start, end, startSide, endSide) {
  const path = [start];
  const padding = 30;
  
  // Gehe erst vom Start-Node weg
  let p1;
  switch(startSide) {
    case 'top': p1 = { x: start.x, y: start.y - padding }; break;
    case 'bottom': p1 = { x: start.x, y: start.y + padding }; break;
    case 'left': p1 = { x: start.x - padding, y: start.y }; break;
    case 'right': p1 = { x: start.x + padding, y: start.y }; break;
    default: p1 = start;
  }
  path.push(p1);
  
  // Gehe zum End-Node
  let p2;
  switch(endSide) {
    case 'top': p2 = { x: end.x, y: end.y - padding }; break;
    case 'bottom': p2 = { x: end.x, y: end.y + padding }; break;
    case 'left': p2 = { x: end.x - padding, y: end.y }; break;
    case 'right': p2 = { x: end.x + padding, y: end.y }; break;
    default: p2 = end;
  }
  
  // Verbinde mit 90° Winkeln
  if (p1.x !== p2.x && p1.y !== p2.y) {
    // Brauche Zwischenpunkt
    const midX = (p1.x + p2.x) / 2;
    path.push({ x: midX, y: p1.y });
    path.push({ x: midX, y: p2.y });
  }
  
  path.push(p2);
  path.push(end);
  
  return path;
}

// Main
const outputDir = path.join(__dirname, 'improved-layout-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Testing Improved Layout Algorithm...\n');

Object.entries(scenarios).forEach(([name, scenario]) => {
  ['compact', 'vertical', 'horizontal'].forEach(mode => {
    const html = generateHTML(scenario, mode);
    const filename = `${name}-${mode}.html`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, html);
    console.log(`✅ Generated: ${filename}`);
  });
});

console.log(`\n✨ Tests saved to: ${outputDir}`);
console.log('📊 Improvements:');
console.log('  - Handles distributed on all 4 sides');
console.log('  - Manhattan routing (90° angles)');
console.log('  - Level-based positioning');
console.log('  - Collision detection');