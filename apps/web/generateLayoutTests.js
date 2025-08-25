/**
 * Script zum Generieren von Layout-Test HTML-Dateien
 * 
 * Verwendung: node generateLayoutTests.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test-Szenarien
const testScenarios = {
  simple: {
    name: 'Simple Linear Flow',
    nodes: [
      { id: 'A', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start A' }, width: 120, height: 60 },
      { id: 'B', type: 'screen', position: { x: 0, y: 100 }, data: { label: 'Screen B' }, width: 200, height: 100 },
      { id: 'C', type: 'decision', position: { x: 0, y: 200 }, data: { label: 'Decision C' }, width: 180, height: 80 },
      { id: 'D', type: 'end', position: { x: 0, y: 300 }, data: { label: 'End D' }, width: 120, height: 60 },
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B' },
      { id: 'B-C', source: 'B', target: 'C' },
      { id: 'C-D', source: 'C', target: 'D' },
    ]
  },
  
  handleConflict: {
    name: 'Handle Conflict Test',
    nodes: [
      { id: 'Hub', type: 'screen', position: { x: 200, y: 200 }, data: { label: 'Central Hub' }, width: 200, height: 100 },
      { id: 'A1', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Input A1' }, width: 160, height: 80 },
      { id: 'A2', type: 'screen', position: { x: 0, y: 100 }, data: { label: 'Input A2' }, width: 160, height: 80 },
      { id: 'A3', type: 'screen', position: { x: 0, y: 200 }, data: { label: 'Input A3' }, width: 160, height: 80 },
      { id: 'A4', type: 'screen', position: { x: 0, y: 300 }, data: { label: 'Input A4' }, width: 160, height: 80 },
      { id: 'A5', type: 'screen', position: { x: 0, y: 400 }, data: { label: 'Input A5' }, width: 160, height: 80 },
      { id: 'B1', type: 'screen', position: { x: 450, y: 0 }, data: { label: 'Output B1' }, width: 160, height: 80 },
      { id: 'B2', type: 'screen', position: { x: 450, y: 100 }, data: { label: 'Output B2' }, width: 160, height: 80 },
      { id: 'B3', type: 'screen', position: { x: 450, y: 200 }, data: { label: 'Output B3' }, width: 160, height: 80 },
      { id: 'B4', type: 'screen', position: { x: 450, y: 300 }, data: { label: 'Output B4' }, width: 160, height: 80 },
      { id: 'B5', type: 'screen', position: { x: 450, y: 400 }, data: { label: 'Output B5' }, width: 160, height: 80 },
    ],
    edges: [
      // 5 Inputs zum Hub
      { id: 'A1-Hub', source: 'A1', target: 'Hub' },
      { id: 'A2-Hub', source: 'A2', target: 'Hub' },
      { id: 'A3-Hub', source: 'A3', target: 'Hub' },
      { id: 'A4-Hub', source: 'A4', target: 'Hub' },
      { id: 'A5-Hub', source: 'A5', target: 'Hub' },
      // 5 Outputs vom Hub
      { id: 'Hub-B1', source: 'Hub', target: 'B1' },
      { id: 'Hub-B2', source: 'Hub', target: 'B2' },
      { id: 'Hub-B3', source: 'Hub', target: 'B3' },
      { id: 'Hub-B4', source: 'Hub', target: 'B4' },
      { id: 'Hub-B5', source: 'Hub', target: 'B5' },
    ]
  }
};

/**
 * Simuliert den Layout-Algorithmus (vereinfacht für Test)
 */
function applyLayout(nodes, edges, mode) {
  // Kopiere Nodes
  const layoutedNodes = nodes.map(node => ({ ...node }));
  
  // Berechne einfache Positionen basierend auf Mode
  if (mode === 'vertical') {
    let y = 50;
    layoutedNodes.forEach(node => {
      node.position = { x: 200, y };
      y += (node.height || 80) + 50;
    });
  } else if (mode === 'horizontal') {
    let x = 50;
    layoutedNodes.forEach(node => {
      node.position = { x, y: 200 };
      x += (node.width || 160) + 50;
    });
  } else if (mode === 'compact') {
    // Grid Layout
    const cols = Math.ceil(Math.sqrt(layoutedNodes.length));
    layoutedNodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      node.position = {
        x: 50 + col * 200,
        y: 50 + row * 150
      };
    });
  }
  
  // Simuliere Handle-Zuweisung
  const handleAssignments = new Map();
  layoutedNodes.forEach(node => {
    const incoming = edges.filter(e => e.target === node.id);
    const outgoing = edges.filter(e => e.source === node.id);
    
    handleAssignments.set(node.id, {
      incoming: incoming.map((e, i) => ({
        edge: e.id,
        handle: `top-${i}`,
        position: 'top',
        index: i
      })),
      outgoing: outgoing.map((e, i) => ({
        edge: e.id,
        handle: `bottom-${i}`,
        position: 'bottom',
        index: i
      }))
    });
  });
  
  // Füge Handle-Info zu Edges hinzu
  const layoutedEdges = edges.map(edge => {
    const sourceHandles = handleAssignments.get(edge.source);
    const targetHandles = handleAssignments.get(edge.target);
    
    const sourceHandle = sourceHandles?.outgoing.find(h => h.edge === edge.id)?.handle || 'bottom-0';
    const targetHandle = targetHandles?.incoming.find(h => h.edge === edge.id)?.handle || 'top-0';
    
    return {
      ...edge,
      sourceHandle,
      targetHandle
    };
  });
  
  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
    handles: handleAssignments
  };
}

/**
 * Generiert HTML für Visualisierung
 */
function generateHTML(scenario, mode) {
  const result = applyLayout(scenario.nodes, scenario.edges, mode);
  
  // Berechne SVG Dimensionen
  let maxX = 0, maxY = 0;
  result.nodes.forEach(node => {
    maxX = Math.max(maxX, node.position.x + (node.width || 160));
    maxY = Math.max(maxY, node.position.y + (node.height || 80));
  });
  
  const svgWidth = maxX + 100;
  const svgHeight = maxY + 100;
  
  // Generiere SVG
  let svg = `<svg width="${svgWidth}" height="${svgHeight}">`;
  
  // Zeichne Edges
  result.edges.forEach(edge => {
    const source = result.nodes.find(n => n.id === edge.source);
    const target = result.nodes.find(n => n.id === edge.target);
    
    const [sourcePos, sourceIdx] = edge.sourceHandle.split('-');
    const [targetPos, targetIdx] = edge.targetHandle.split('-');
    
    // Berechne Handle-Positionen
    const sourceX = source.position.x + (source.width || 160) / 2 + parseInt(sourceIdx) * 20;
    const sourceY = sourcePos === 'top' ? source.position.y : source.position.y + (source.height || 80);
    
    const targetX = target.position.x + (target.width || 160) / 2 + parseInt(targetIdx) * 20;
    const targetY = targetPos === 'top' ? target.position.y : target.position.y + (target.height || 80);
    
    // Zeichne Linie
    svg += `<line x1="${sourceX}" y1="${sourceY}" x2="${targetX}" y2="${targetY}" stroke="#666" stroke-width="2" />`;
    
    // Pfeilspitze
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
    const arrowX = targetX - 10 * Math.cos(angle);
    const arrowY = targetY - 10 * Math.sin(angle);
    
    svg += `<polygon points="${targetX},${targetY} ${arrowX - 5},${arrowY - 5} ${arrowX - 5},${arrowY + 5}" fill="#666" />`;
  });
  
  // Zeichne Nodes
  result.nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || 160;
    const height = node.height || 80;
    
    // Node-Farbe basierend auf Typ
    const colors = {
      start: '#4caf50',
      end: '#f44336',
      screen: '#2196f3',
      decision: '#ff9800',
      action: '#9c27b0'
    };
    const color = colors[node.type] || '#666';
    
    // Rechteck
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${color}" stroke-width="2" rx="4" />`;
    
    // Label
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-family="Arial" font-size="14">${node.data?.label || node.id}</text>`;
    
    // Zeichne Handles
    const handles = result.handles.get(node.id);
    if (handles) {
      // Incoming Handles (grün)
      handles.incoming.forEach((h, i) => {
        const hx = x + width/2 + i * 20;
        const hy = y;
        svg += `<circle cx="${hx}" cy="${hy}" r="4" fill="white" stroke="#4caf50" stroke-width="2" />`;
        svg += `<text x="${hx + 10}" y="${hy - 5}" font-size="10" fill="#4caf50">IN</text>`;
      });
      
      // Outgoing Handles (rot)
      handles.outgoing.forEach((h, i) => {
        const hx = x + width/2 + i * 20;
        const hy = y + height;
        svg += `<circle cx="${hx}" cy="${hy}" r="4" fill="white" stroke="#f44336" stroke-width="2" />`;
        svg += `<text x="${hx + 10}" y="${hy + 5}" font-size="10" fill="#f44336">OUT</text>`;
      });
    }
  });
  
  svg += '</svg>';
  
  // Analysiere Probleme
  const problems = analyzeProblems(result);
  
  // Generiere vollständiges HTML
  return `<!DOCTYPE html>
<html>
<head>
    <title>${scenario.name} - ${mode}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background: #f5f5f5; 
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .mode { 
            background: #e3f2fd; 
            padding: 5px 10px; 
            border-radius: 4px; 
            display: inline-block;
        }
        .svg-container {
            border: 2px solid #ddd;
            border-radius: 4px;
            padding: 20px;
            margin: 20px 0;
            background: white;
        }
        .analysis {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .problem {
            background: #ffebee;
            color: #c62828;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border-left: 4px solid #f44336;
        }
        .success {
            background: #e8f5e9;
            color: #2e7d32;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border-left: 4px solid #4caf50;
        }
        .handle-info {
            font-family: monospace;
            font-size: 12px;
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${scenario.name}</h1>
        <div class="mode">Layout Mode: ${mode}</div>
        
        <div class="svg-container">
            ${svg}
        </div>
        
        <h2>Analysis</h2>
        <div class="analysis">
            ${problems.length > 0 ? 
              problems.map(p => `<div class="problem">${p}</div>`).join('') :
              '<div class="success">✅ No problems detected</div>'
            }
        </div>
        
        <h2>Handle Assignment Details</h2>
        <div class="handle-info">
            ${Array.from(result.handles.entries()).map(([nodeId, handles]) => `
                <strong>${nodeId}:</strong><br>
                &nbsp;&nbsp;IN: ${handles.incoming.map(h => h.handle).join(', ') || 'none'}<br>
                &nbsp;&nbsp;OUT: ${handles.outgoing.map(h => h.handle).join(', ') || 'none'}<br>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Analysiert Probleme im Layout
 */
function analyzeProblems(result) {
  const problems = [];
  
  // Prüfe Handle-Konflikte
  result.handles.forEach((handles, nodeId) => {
    // Prüfe ob In/Out am gleichen Handle sind
    const usedHandles = new Map();
    
    handles.incoming.forEach(h => {
      const key = h.handle;
      if (!usedHandles.has(key)) usedHandles.set(key, { in: 0, out: 0 });
      usedHandles.get(key).in++;
    });
    
    handles.outgoing.forEach(h => {
      const key = h.handle;
      if (!usedHandles.has(key)) usedHandles.set(key, { in: 0, out: 0 });
      usedHandles.get(key).out++;
    });
    
    // Dieser Check ist hier nicht sinnvoll, da wir verschiedene Positionen nutzen
    // Aber wir prüfen ob zu viele Edges an einem Handle sind
    if (handles.incoming.length > 4) {
      problems.push(`⚠️ Node ${nodeId} has ${handles.incoming.length} incoming edges (max recommended: 4)`);
    }
    if (handles.outgoing.length > 4) {
      problems.push(`⚠️ Node ${nodeId} has ${handles.outgoing.length} outgoing edges (max recommended: 4)`);
    }
  });
  
  // Prüfe Edge-Kreuzungen (vereinfacht)
  for (let i = 0; i < result.edges.length; i++) {
    for (let j = i + 1; j < result.edges.length; j++) {
      const e1 = result.edges[i];
      const e2 = result.edges[j];
      
      // Skip wenn Edges verbunden sind
      if (e1.source === e2.source || e1.source === e2.target ||
          e1.target === e2.source || e1.target === e2.target) {
        continue;
      }
      
      // Hier könnte man echte Kreuzungserkennung implementieren
    }
  }
  
  return problems;
}

// Hauptfunktion
function main() {
  const outputDir = path.join(__dirname, 'layout-tests');
  
  // Erstelle Output-Verzeichnis
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log('🧪 Generating Layout Test HTMLs...\n');
  
  // Generiere für jedes Szenario und jeden Modus
  const modes = ['vertical', 'horizontal', 'compact'];
  
  Object.entries(testScenarios).forEach(([scenarioName, scenario]) => {
    modes.forEach(mode => {
      const html = generateHTML(scenario, mode);
      const filename = `${scenarioName}-${mode}.html`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, html);
      console.log(`✅ Generated: ${filename}`);
    });
  });
  
  console.log(`\n✨ All tests generated in: ${outputDir}`);
  console.log('📁 Open the HTML files in your browser to inspect the layouts');
}

// Ausführen
main();