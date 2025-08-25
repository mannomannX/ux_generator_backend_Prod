/**
 * Layout Test Runner
 * 
 * Generiert HTML-Output für Layout-Algorithmen zur visuellen Inspektion
 */

import { Node, Edge } from 'reactflow';
import { applyPerfectLayout } from './perfectLayoutAlgorithm';

// Test-Szenarien
export const testScenarios = {
  simple: {
    name: 'Simple Linear Flow',
    nodes: [
      { id: 'A', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start A' } },
      { id: 'B', type: 'screen', position: { x: 0, y: 100 }, data: { label: 'Screen B' } },
      { id: 'C', type: 'decision', position: { x: 0, y: 200 }, data: { label: 'Decision C' } },
      { id: 'D', type: 'end', position: { x: 0, y: 300 }, data: { label: 'End D' } },
    ],
    edges: [
      { id: 'A-B', source: 'A', target: 'B' },
      { id: 'B-C', source: 'B', target: 'C' },
      { id: 'C-D', source: 'C', target: 'D' },
    ]
  },
  
  branching: {
    name: 'Branching with Merge',
    nodes: [
      { id: 'Start', type: 'start', position: { x: 200, y: 0 }, data: { label: 'Start' } },
      { id: 'Check', type: 'decision', position: { x: 200, y: 100 }, data: { label: 'Check Auth' } },
      { id: 'Login', type: 'screen', position: { x: 100, y: 200 }, data: { label: 'Login' } },
      { id: 'Dashboard', type: 'screen', position: { x: 300, y: 200 }, data: { label: 'Dashboard' } },
      { id: 'Profile', type: 'screen', position: { x: 200, y: 300 }, data: { label: 'Profile' } },
      { id: 'End', type: 'end', position: { x: 200, y: 400 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1', source: 'Start', target: 'Check' },
      { id: 'e2', source: 'Check', target: 'Login', label: 'Not Auth' },
      { id: 'e3', source: 'Check', target: 'Dashboard', label: 'Authenticated' },
      { id: 'e4', source: 'Login', target: 'Profile' },
      { id: 'e5', source: 'Dashboard', target: 'Profile' },
      { id: 'e6', source: 'Profile', target: 'End' },
    ]
  },

  multiInput: {
    name: 'Multiple Inputs/Outputs',
    nodes: [
      { id: 'A', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Node A' } },
      { id: 'B', type: 'start', position: { x: 0, y: 100 }, data: { label: 'Node B' } },
      { id: 'C', type: 'start', position: { x: 0, y: 200 }, data: { label: 'Node C' } },
      { id: 'Hub', type: 'screen', position: { x: 200, y: 100 }, data: { label: 'Central Hub' } },
      { id: 'X', type: 'end', position: { x: 400, y: 0 }, data: { label: 'Output X' } },
      { id: 'Y', type: 'end', position: { x: 400, y: 100 }, data: { label: 'Output Y' } },
      { id: 'Z', type: 'end', position: { x: 400, y: 200 }, data: { label: 'Output Z' } },
    ],
    edges: [
      { id: 'A-Hub', source: 'A', target: 'Hub' },
      { id: 'B-Hub', source: 'B', target: 'Hub' },
      { id: 'C-Hub', source: 'C', target: 'Hub' },
      { id: 'Hub-X', source: 'Hub', target: 'X' },
      { id: 'Hub-Y', source: 'Hub', target: 'Y' },
      { id: 'Hub-Z', source: 'Hub', target: 'Z' },
    ]
  },

  complex: {
    name: 'Complex Network',
    nodes: [
      { id: '1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: '2', type: 'screen', position: { x: 100, y: 50 }, data: { label: 'Screen 2' } },
      { id: '3', type: 'screen', position: { x: 100, y: 150 }, data: { label: 'Screen 3' } },
      { id: '4', type: 'decision', position: { x: 200, y: 100 }, data: { label: 'Decision 4' } },
      { id: '5', type: 'action', position: { x: 300, y: 0 }, data: { label: 'Action 5' } },
      { id: '6', type: 'action', position: { x: 300, y: 100 }, data: { label: 'Action 6' } },
      { id: '7', type: 'action', position: { x: 300, y: 200 }, data: { label: 'Action 7' } },
      { id: '8', type: 'screen', position: { x: 400, y: 100 }, data: { label: 'Screen 8' } },
      { id: '9', type: 'end', position: { x: 500, y: 100 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e1-3', source: '1', target: '3' },
      { id: 'e2-4', source: '2', target: '4' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5', label: 'Option 1' },
      { id: 'e4-6', source: '4', target: '6', label: 'Option 2' },
      { id: 'e4-7', source: '4', target: '7', label: 'Option 3' },
      { id: 'e5-8', source: '5', target: '8' },
      { id: 'e6-8', source: '6', target: '8' },
      { id: 'e7-8', source: '7', target: '8' },
      { id: 'e8-9', source: '8', target: '9' },
    ]
  }
};

/**
 * Generiert HTML für ein Layout-Ergebnis
 */
export function generateLayoutHTML(
  scenario: keyof typeof testScenarios,
  mode: 'compact' | 'vertical' | 'horizontal' = 'compact'
): string {
  const testCase = testScenarios[scenario];
  
  // Wende Layout an
  const result = applyPerfectLayout(testCase.nodes as Node[], testCase.edges as Edge[], mode, {
    debugMode: true,
    deterministic: true,
    avoidCollisions: true,
    optimizeEdgeRouting: true
  });

  // Generiere SVG
  const svg = generateSVG(result.nodes, result.edges, result.metadata);
  
  // Generiere HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Layout Test: ${testCase.name} (${mode})</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .info { 
            background: #e3f2fd; 
            padding: 15px; 
            border-radius: 4px;
            margin: 20px 0;
        }
        .svg-container {
            border: 2px solid #ddd;
            border-radius: 4px;
            overflow: auto;
            background: white;
            padding: 20px;
        }
        svg { display: block; }
        .node {
            fill: white;
            stroke-width: 2;
        }
        .node-start { stroke: #4caf50; }
        .node-end { stroke: #f44336; }
        .node-screen { stroke: #2196f3; }
        .node-decision { stroke: #ff9800; }
        .node-action { stroke: #9c27b0; }
        .edge {
            fill: none;
            stroke: #666;
            stroke-width: 2;
        }
        .edge-label {
            font-size: 12px;
            fill: #333;
        }
        .handle {
            fill: #fff;
            stroke: #666;
            stroke-width: 1;
        }
        .handle-in { stroke: #4caf50; }
        .handle-out { stroke: #f44336; }
        .debug-info {
            margin-top: 20px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
        }
        .problem {
            background: #ffebee;
            color: #c62828;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
        .success {
            background: #e8f5e9;
            color: #2e7d32;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Layout Test: ${testCase.name}</h1>
        <div class="info">
            <strong>Mode:</strong> ${mode}<br>
            <strong>Nodes:</strong> ${result.nodes.length}<br>
            <strong>Edges:</strong> ${result.edges.length}<br>
            <strong>Layout Score:</strong> ${result.metadata.layoutScore}/100
        </div>
        
        <h2>Visual Result</h2>
        <div class="svg-container">
            ${svg}
        </div>
        
        <h2>Analysis</h2>
        ${generateAnalysis(result)}
        
        <h2>Debug Information</h2>
        <div class="debug-info">
            ${generateDebugInfo(result)}
        </div>
    </div>
</body>
</html>`;
  
  return html;
}

/**
 * Generiert SVG für das Layout
 */
function generateSVG(nodes: Node[], edges: Edge[], metadata: any): string {
  // Finde Bounding Box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  nodes.forEach(node => {
    const width = node.width || 160;
    const height = node.height || 80;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  });
  
  const padding = 50;
  const svgWidth = maxX - minX + 2 * padding;
  const svgHeight = maxY - minY + 2 * padding;
  
  let svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="${minX - padding} ${minY - padding} ${svgWidth} ${svgHeight}">`;
  
  // Zeichne Edges
  edges.forEach(edge => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (!source || !target) return;
    
    const sourceHandle = edge.sourceHandle || 'bottom-0';
    const targetHandle = edge.targetHandle || 'top-0';
    
    const sourcePos = getHandlePosition(source, sourceHandle);
    const targetPos = getHandlePosition(target, targetHandle);
    
    // Zeichne Edge als Pfad
    svg += `<path d="M ${sourcePos.x} ${sourcePos.y} L ${targetPos.x} ${targetPos.y}" class="edge" />`;
    
    // Edge Label
    if (edge.label) {
      const midX = (sourcePos.x + targetPos.x) / 2;
      const midY = (sourcePos.y + targetPos.y) / 2;
      svg += `<text x="${midX}" y="${midY - 5}" class="edge-label" text-anchor="middle">${edge.label}</text>`;
    }
    
    // Pfeil am Ende
    svg += `<polygon points="${targetPos.x - 5},${targetPos.y - 10} ${targetPos.x + 5},${targetPos.y - 10} ${targetPos.x},${targetPos.y}" fill="#666" />`;
  });
  
  // Zeichne Nodes
  nodes.forEach(node => {
    const width = node.width || 160;
    const height = node.height || 80;
    const x = node.position.x;
    const y = node.position.y;
    
    // Node Rectangle
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" class="node node-${node.type}" rx="4" />`;
    
    // Node Label
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14">${node.data?.label || node.id}</text>`;
    
    // Zeichne Handles
    const handleAssignment = metadata.handles?.get(node.id);
    if (handleAssignment) {
      handleAssignment.slots.forEach(slot => {
        if (slot.occupied) {
          const pos = getHandlePosition(node, `${slot.position}-${slot.index}`);
          const handleClass = slot.direction === 'in' ? 'handle-in' : 'handle-out';
          svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4" class="handle ${handleClass}" />`;
          
          // Handle Label (klein)
          svg += `<text x="${pos.x + 8}" y="${pos.y + 3}" font-size="8" fill="#666">${slot.direction}</text>`;
        }
      });
    }
  });
  
  svg += '</svg>';
  return svg;
}

/**
 * Berechnet Handle-Position
 */
function getHandlePosition(node: Node, handle: string): { x: number; y: number } {
  const [position, indexStr] = handle.split('-');
  const index = parseInt(indexStr) || 0;
  const width = node.width || 160;
  const height = node.height || 80;
  const spacing = 30;
  const offset = spacing * (index + 1);
  
  switch (position) {
    case 'top':
      return { x: node.position.x + offset, y: node.position.y };
    case 'right':
      return { x: node.position.x + width, y: node.position.y + offset };
    case 'bottom':
      return { x: node.position.x + offset, y: node.position.y + height };
    case 'left':
      return { x: node.position.x, y: node.position.y + offset };
    default:
      return { x: node.position.x + width/2, y: node.position.y + height/2 };
  }
}

/**
 * Generiert Analyse des Layouts
 */
function generateAnalysis(result: any): string {
  let analysis = '<div class="analysis">';
  
  // Prüfe Handle-Konflikte
  const handleConflicts: string[] = [];
  result.metadata.handles.forEach((assignment: any, nodeId: string) => {
    const handleMap = new Map<string, { in: number, out: number }>();
    
    assignment.slots.forEach((slot: any) => {
      if (slot.occupied) {
        const key = `${slot.position}-${slot.index}`;
        if (!handleMap.has(key)) {
          handleMap.set(key, { in: 0, out: 0 });
        }
        const counts = handleMap.get(key)!;
        if (slot.direction === 'in') counts.in++;
        else counts.out++;
      }
    });
    
    handleMap.forEach((counts, handle) => {
      if (counts.in > 0 && counts.out > 0) {
        handleConflicts.push(`Node ${nodeId}: Handle ${handle} has both IN (${counts.in}) and OUT (${counts.out})`);
      }
    });
  });
  
  if (handleConflicts.length > 0) {
    analysis += '<div class="problem"><strong>⚠️ Handle Conflicts Detected:</strong><ul>';
    handleConflicts.forEach(conflict => {
      analysis += `<li>${conflict}</li>`;
    });
    analysis += '</ul></div>';
  } else {
    analysis += '<div class="success">✅ No handle conflicts detected</div>';
  }
  
  // Prüfe Edge-Node Überlappungen
  const overlaps = checkEdgeNodeOverlaps(result.nodes, result.edges);
  if (overlaps.length > 0) {
    analysis += '<div class="problem"><strong>⚠️ Edge-Node Overlaps:</strong><ul>';
    overlaps.forEach(overlap => {
      analysis += `<li>${overlap}</li>`;
    });
    analysis += '</ul></div>';
  } else {
    analysis += '<div class="success">✅ No edge-node overlaps detected</div>';
  }
  
  analysis += '</div>';
  return analysis;
}

/**
 * Prüft Edge-Node Überlappungen
 */
function checkEdgeNodeOverlaps(nodes: Node[], edges: Edge[]): string[] {
  const overlaps: string[] = [];
  
  edges.forEach(edge => {
    const source = nodes.find(n => n.id === edge.source);
    const target = nodes.find(n => n.id === edge.target);
    if (!source || !target) return;
    
    nodes.forEach(node => {
      if (node.id === edge.source || node.id === edge.target) return;
      
      // Vereinfachte Überlappungsprüfung
      const edgeCrossesNode = lineIntersectsRect(
        source.position.x + (source.width || 160) / 2,
        source.position.y + (source.height || 80) / 2,
        target.position.x + (target.width || 160) / 2,
        target.position.y + (target.height || 80) / 2,
        node.position.x,
        node.position.y,
        node.position.x + (node.width || 160),
        node.position.y + (node.height || 80)
      );
      
      if (edgeCrossesNode) {
        overlaps.push(`Edge ${edge.id} crosses Node ${node.id}`);
      }
    });
  });
  
  return overlaps;
}

/**
 * Prüft ob Linie Rechteck schneidet
 */
function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rectX1: number, rectY1: number, rectX2: number, rectY2: number
): boolean {
  // Prüfe ob einer der Endpunkte im Rechteck ist
  if ((x1 >= rectX1 && x1 <= rectX2 && y1 >= rectY1 && y1 <= rectY2) ||
      (x2 >= rectX1 && x2 <= rectX2 && y2 >= rectY1 && y2 <= rectY2)) {
    return true;
  }
  
  // Prüfe Schnittpunkte mit Rechteck-Kanten
  return lineIntersectsLine(x1, y1, x2, y2, rectX1, rectY1, rectX2, rectY1) || // Top
         lineIntersectsLine(x1, y1, x2, y2, rectX2, rectY1, rectX2, rectY2) || // Right
         lineIntersectsLine(x1, y1, x2, y2, rectX1, rectY2, rectX2, rectY2) || // Bottom
         lineIntersectsLine(x1, y1, x2, y2, rectX1, rectY1, rectX1, rectY2);   // Left
}

/**
 * Prüft ob zwei Linien sich schneiden
 */
function lineIntersectsLine(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 0.001) return false; // Parallel
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Generiert Debug-Informationen
 */
function generateDebugInfo(result: any): string {
  let debug = '<pre>';
  
  // Node Hierarchien
  debug += 'NODE HIERARCHIES:\n';
  result.metadata.hierarchies.forEach((hier: any, nodeId: string) => {
    debug += `  ${nodeId}: Level=${hier.level}, Rank=${hier.rank}, In=[${hier.incoming.join(',')}], Out=[${hier.outgoing.join(',')}]\n`;
  });
  
  // Handle Assignments
  debug += '\nHANDLE ASSIGNMENTS:\n';
  result.metadata.handles.forEach((assignment: any, nodeId: string) => {
    debug += `  ${nodeId}:\n`;
    assignment.slots.forEach((slot: any) => {
      if (slot.occupied) {
        debug += `    ${slot.position}-${slot.index}: ${slot.direction} (Edge: ${slot.edgeId})\n`;
      }
    });
  });
  
  // Frame Relations
  if (result.metadata.frameRelations.size > 0) {
    debug += '\nFRAME RELATIONS:\n';
    result.metadata.frameRelations.forEach((parent: string, child: string) => {
      debug += `  ${child} ∈ ${parent}\n`;
    });
  }
  
  debug += '</pre>';
  return debug;
}

/**
 * Führt Tests aus und speichert HTML-Dateien
 */
export async function runLayoutTests(): Promise<void> {
  const scenarios: Array<keyof typeof testScenarios> = ['simple', 'branching', 'multiInput', 'complex'];
  const modes: Array<'compact' | 'vertical' | 'horizontal'> = ['compact', 'vertical', 'horizontal'];
  
  console.log('🧪 Running Layout Tests...\n');
  
  for (const scenario of scenarios) {
    for (const mode of modes) {
      const html = generateLayoutHTML(scenario, mode);
      const filename = `layout-test-${scenario}-${mode}.html`;
      
      // In echte Anwendung würde hier die Datei gespeichert
      console.log(`✅ Generated: ${filename}`);
      
      // Analysiere Ergebnis
      const hasProblems = html.includes('class="problem"');
      if (hasProblems) {
        console.log(`  ⚠️ Problems detected in ${scenario} (${mode})`);
      }
    }
  }
  
  console.log('\n✨ All tests completed!');
}

// Export für Browser-Konsole
if (typeof window !== 'undefined') {
  (window as any).runLayoutTests = runLayoutTests;
  (window as any).generateLayoutHTML = generateLayoutHTML;
  console.log('💡 Test layouts with: runLayoutTests() or generateLayoutHTML(scenario, mode)');
}