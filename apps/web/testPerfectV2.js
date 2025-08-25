import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PerfectLayoutV2 } from './src/utils/perfectLayoutAlgorithmV2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test Flows
const createSimpleFlow = () => {
  const nodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { title: 'Start' } },
    { id: 'screen1', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Screen 1' } },
    { id: 'decision', type: 'decision', position: { x: 0, y: 0 }, data: { title: 'Decision' } },
    { id: 'screen2', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Option A' } },
    { id: 'screen3', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Option B' } },
    { id: 'merge', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Merge' } },
    { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { title: 'End' } }
  ];

  const edges = [
    { id: 'e1', source: 'start', target: 'screen1' },
    { id: 'e2', source: 'screen1', target: 'decision' },
    { id: 'e3', source: 'decision', target: 'screen2', label: 'Yes' },
    { id: 'e4', source: 'decision', target: 'screen3', label: 'No' },
    { id: 'e5', source: 'screen2', target: 'merge' },
    { id: 'e6', source: 'screen3', target: 'merge' },
    { id: 'e7', source: 'merge', target: 'end' }
  ];

  return { nodes, edges };
};

const createParallelEdgesFlow = () => {
  const nodes = [
    { id: 'A', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Node A' } },
    { id: 'B', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Node B' } },
    { id: 'C', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Node C' } },
    { id: 'D', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Node D' } }
  ];

  const edges = [
    { id: 'e1', source: 'A', target: 'B', label: 'Connection 1' },
    { id: 'e2', source: 'A', target: 'B', label: 'Connection 2' },
    { id: 'e3', source: 'A', target: 'B', label: 'Connection 3' },
    { id: 'e4', source: 'B', target: 'C' },
    { id: 'e5', source: 'C', target: 'D' },
    { id: 'e6', source: 'D', target: 'A', label: 'Feedback' },
    { id: 'e7', source: 'B', target: 'D', label: 'Shortcut' },
    { id: 'e8', source: 'A', target: 'C', label: 'Direct' }
  ];

  return { nodes, edges };
};

const createFrameFlow = () => {
  const nodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { title: 'Start' } },
    
    // Frame mit Children
    { id: 'auth-frame', type: 'frame', position: { x: 0, y: 0 }, data: { title: 'Authentication' } },
    { id: 'login', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'auth-frame', data: { title: 'Login' } },
    { id: 'register', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'auth-frame', data: { title: 'Register' } },
    { id: 'reset', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'auth-frame', data: { title: 'Reset Password' } },
    
    { id: 'dashboard', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Dashboard' } },
    { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { title: 'Logout' } }
  ];

  const edges = [
    { id: 'e1', source: 'start', target: 'auth-frame' },
    { id: 'e2', source: 'login', target: 'register', label: 'New User' },
    { id: 'e3', source: 'login', target: 'reset', label: 'Forgot' },
    { id: 'e4', source: 'register', target: 'login', label: 'Back' },
    { id: 'e5', source: 'reset', target: 'login', label: 'Back' },
    { id: 'e6', source: 'auth-frame', target: 'dashboard', label: 'Success' },
    { id: 'e7', source: 'dashboard', target: 'end' }
  ];

  return { nodes, edges };
};

function generateHTML(title, nodes, edges, config = {}) {
  const layout = new PerfectLayoutV2(nodes, edges, config);
  const result = layout.apply();
  
  // SVG Dimensionen
  const padding = 100;
  const maxX = Math.max(...result.nodes.map(n => n.position.x + (n.width || 180))) + padding;
  const maxY = Math.max(...result.nodes.map(n => n.position.y + (n.height || 80))) + padding;
  const minX = Math.min(...result.nodes.map(n => n.position.x));
  const minY = Math.min(...result.nodes.map(n => n.position.y));

  let svg = `<svg width="${maxX}" height="${maxY}" style="border: 2px solid #333; background: white;">`;
  
  // Grid
  for (let x = 0; x < maxX; x += 50) {
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${maxY}" stroke="#f0f0f0" stroke-width="1" />`;
  }
  for (let y = 0; y < maxY; y += 50) {
    svg += `<line x1="0" y1="${y}" x2="${maxX}" y2="${y}" stroke="#f0f0f0" stroke-width="1" />`;
  }

  // Draw Edges FIRST (unter den Nodes)
  result.edges.forEach(edge => {
    const sourceNode = result.nodes.find(n => n.id === edge.source);
    const targetNode = result.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;

    // Handle Positionen
    const sourceHandle = edge.sourceHandle || 'right';
    const targetHandle = edge.targetHandle || 'left';
    
    const sourcePos = getHandlePos(sourceNode, sourceHandle);
    const targetPos = getHandlePos(targetNode, targetHandle);
    
    // Edge Farbe und Stil
    const edgeColor = edge.style?.stroke || '#666';
    const strokeWidth = edge.style?.strokeWidth || 2;
    
    // Edge Path
    if (edge.data?.points && edge.data.points.length > 2) {
      // Custom path mit Waypoints
      let pathD = `M ${sourcePos.x} ${sourcePos.y}`;
      edge.data.points.slice(1, -1).forEach(p => {
        pathD += ` L ${p.x} ${p.y}`;
      });
      pathD += ` L ${targetPos.x} ${targetPos.y}`;
      svg += `<path d="${pathD}" fill="none" stroke="${edgeColor}" stroke-width="${strokeWidth}" />`;
    } else {
      // Orthogonales Routing
      const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
      const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
      
      let path = `M ${sourcePos.x} ${sourcePos.y}`;
      
      // Kurve für parallele Edges
      if (edge.data?.lane > 0) {
        const offset = edge.data.lane * 20;
        const cp1 = { 
          x: sourcePos.x + (targetPos.x - sourcePos.x) * 0.3,
          y: sourcePos.y + (targetPos.y - sourcePos.y) * 0.3 + offset
        };
        const cp2 = {
          x: sourcePos.x + (targetPos.x - sourcePos.x) * 0.7,
          y: sourcePos.y + (targetPos.y - sourcePos.y) * 0.7 + offset
        };
        path = `M ${sourcePos.x} ${sourcePos.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${targetPos.x} ${targetPos.y}`;
      } else {
        // Standard orthogonal
        if (sourceHandle === 'bottom' || sourceHandle === 'top') {
          path += ` L ${sourcePos.x} ${midY} L ${targetPos.x} ${midY}`;
        } else {
          path += ` L ${midX} ${sourcePos.y} L ${midX} ${targetPos.y}`;
        }
        path += ` L ${targetPos.x} ${targetPos.y}`;
      }
      
      svg += `<path d="${path}" fill="none" stroke="${edgeColor}" stroke-width="${strokeWidth}" />`;
    }
    
    // Pfeilspitze
    const angle = Math.atan2(targetPos.y - sourcePos.y, targetPos.x - sourcePos.x);
    const arrowSize = 8;
    const arrowX1 = targetPos.x - arrowSize * Math.cos(angle - Math.PI / 6);
    const arrowY1 = targetPos.y - arrowSize * Math.sin(angle - Math.PI / 6);
    const arrowX2 = targetPos.x - arrowSize * Math.cos(angle + Math.PI / 6);
    const arrowY2 = targetPos.y - arrowSize * Math.sin(angle + Math.PI / 6);
    
    svg += `<polygon points="${targetPos.x},${targetPos.y} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}" fill="${edgeColor}" />`;
    
    // Label
    if (edge.label) {
      const labelX = (sourcePos.x + targetPos.x) / 2;
      const labelY = (sourcePos.y + targetPos.y) / 2;
      
      svg += `<rect x="${labelX - 40}" y="${labelY - 10}" width="80" height="20" fill="white" stroke="${edgeColor}" stroke-width="1" rx="3" />`;
      svg += `<text x="${labelX}" y="${labelY + 4}" text-anchor="middle" font-size="12" fill="#333">${edge.label}</text>`;
    }
    
    // Debug: Handle Indicators
    if (config.showHandles) {
      svg += `<circle cx="${sourcePos.x}" cy="${sourcePos.y}" r="3" fill="green" />`;
      svg += `<text x="${sourcePos.x + 5}" y="${sourcePos.y - 5}" font-size="10" fill="green">${sourceHandle}</text>`;
      svg += `<circle cx="${targetPos.x}" cy="${targetPos.y}" r="3" fill="red" />`;
      svg += `<text x="${targetPos.x + 5}" y="${targetPos.y - 5}" font-size="10" fill="red">${targetHandle}</text>`;
    }
  });

  // Draw Nodes
  result.nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || 180;
    const height = node.height || 80;
    
    // Node Styling basierend auf Typ
    let fillColor = '#ffffff';
    let strokeColor = '#333333';
    let strokeWidth = 2;
    let textColor = '#333333';
    
    switch (node.type) {
      case 'start':
        fillColor = '#d4edda';
        strokeColor = '#28a745';
        strokeWidth = 3;
        break;
      case 'end':
        fillColor = '#f8d7da';
        strokeColor = '#dc3545';
        strokeWidth = 3;
        break;
      case 'decision':
        fillColor = '#fff3cd';
        strokeColor = '#ffc107';
        break;
      case 'frame':
        fillColor = '#f8f9fa';
        strokeColor = '#6c757d';
        strokeWidth = 2;
        break;
      case 'screen':
        fillColor = '#d1ecf1';
        strokeColor = '#17a2b8';
        break;
    }

    // Shadow
    if (node.type !== 'frame') {
      svg += `<rect x="${x+2}" y="${y+2}" width="${width}" height="${height}" fill="#00000020" rx="8" />`;
    }
    
    // Node Rectangle
    const dashArray = node.type === 'frame' ? 'stroke-dasharray="5,5"' : '';
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" 
            fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" 
            ${dashArray} rx="8" />`;
    
    // Title
    const title = node.data?.title || node.id;
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" 
            font-size="14" font-weight="bold" fill="${textColor}">${title}</text>`;
    
    // Node ID (klein)
    svg += `<text x="${x + 5}" y="${y + 15}" font-size="10" fill="#999">${node.id}</text>`;
  });

  svg += '</svg>';

  // Analyse
  const analysis = analyzeLayout(result, config);

  return `<!DOCTYPE html>
<html>
<head>
    <title>${title} - Perfect Layout V2</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 1800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { 
            margin: 0 0 20px 0;
            color: #333;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .stat {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border-left: 4px solid #667eea;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .stat.success {
            border-left-color: #28a745;
            background: #d4edda;
        }
        .stat.warning {
            border-left-color: #ffc107;
            background: #fff3cd;
        }
        .stat.error {
            border-left-color: #dc3545;
            background: #f8d7da;
        }
        .svg-container {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            overflow: auto;
            margin: 20px 0;
        }
        .config {
            background: #e9ecef;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .config h3 {
            margin: 0 0 10px 0;
            color: #495057;
        }
        .issues {
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .issues h3 {
            color: #856404;
            margin: 0 0 10px 0;
        }
        .issues ul {
            margin: 0;
            padding-left: 20px;
        }
        .success-message {
            background: #d4edda;
            border: 1px solid #28a745;
            color: #155724;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: bold;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 ${title} - Perfect Layout V2</h1>
        
        <div class="config">
            <h3>Configuration</h3>
            <code>${JSON.stringify(config, null, 2)}</code>
        </div>
        
        <div class="stats">
            <div class="stat ${analysis.hasNegativeCoords ? 'error' : 'success'}">
                <div class="stat-value">${minX}, ${minY}</div>
                <div class="stat-label">Min Coordinates</div>
            </div>
            <div class="stat ${analysis.collisions > 0 ? 'error' : 'success'}">
                <div class="stat-value">${analysis.collisions}</div>
                <div class="stat-label">Collisions</div>
            </div>
            <div class="stat ${analysis.handleConflicts > 0 ? 'warning' : 'success'}">
                <div class="stat-value">${analysis.handleConflicts}</div>
                <div class="stat-label">Handle Conflicts</div>
            </div>
            <div class="stat ${analysis.frameIssues > 0 ? 'error' : 'success'}">
                <div class="stat-value">${analysis.frameIssues}</div>
                <div class="stat-label">Frame Issues</div>
            </div>
            <div class="stat success">
                <div class="stat-value">${analysis.edgeLabels}</div>
                <div class="stat-label">Edge Labels</div>
            </div>
            <div class="stat ${analysis.quality >= 80 ? 'success' : analysis.quality >= 50 ? 'warning' : 'error'}">
                <div class="stat-value">${analysis.quality}%</div>
                <div class="stat-label">Quality Score</div>
            </div>
        </div>
        
        ${analysis.quality === 100 ? 
          '<div class="success-message">✨ PERFECT LAYOUT! All requirements met!</div>' : 
          ''}
        
        <div class="svg-container">
            ${svg}
        </div>
        
        ${analysis.issues.length > 0 ? `
        <div class="issues">
            <h3>⚠️ Issues Found</h3>
            <ul>
                ${analysis.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
    </div>
</body>
</html>`;
}

function getHandlePos(node, handle) {
  const x = node.position.x;
  const y = node.position.y;
  const width = node.width || 180;
  const height = node.height || 80;
  
  switch (handle) {
    case 'top':
      return { x: x + width / 2, y: y };
    case 'bottom':
      return { x: x + width / 2, y: y + height };
    case 'left':
      return { x: x, y: y + height / 2 };
    case 'right':
      return { x: x + width, y: y + height / 2 };
    default:
      return { x: x + width / 2, y: y + height / 2 };
  }
}

function analyzeLayout(result, config) {
  const issues = [];
  let quality = 100;
  
  // Check negative coordinates
  const minX = Math.min(...result.nodes.map(n => n.position.x));
  const minY = Math.min(...result.nodes.map(n => n.position.y));
  const hasNegativeCoords = minX < 0 || minY < 0;
  
  if (hasNegativeCoords) {
    issues.push(`Negative coordinates detected: (${minX}, ${minY})`);
    quality -= 25;
  }
  
  // Check collisions
  let collisions = 0;
  const nodes = result.nodes.filter(n => n.type !== 'frame');
  
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      
      if (a.parentNode === b.id || b.parentNode === a.id) continue;
      
      const ax1 = a.position.x;
      const ax2 = a.position.x + (a.width || 180);
      const ay1 = a.position.y;
      const ay2 = a.position.y + (a.height || 80);
      
      const bx1 = b.position.x;
      const bx2 = b.position.x + (b.width || 180);
      const by1 = b.position.y;
      const by2 = b.position.y + (b.height || 80);
      
      if (!(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1)) {
        collisions++;
        issues.push(`Collision: ${a.id} overlaps with ${b.id}`);
      }
    }
  }
  
  if (collisions > 0) {
    quality -= collisions * 10;
  }
  
  // Check handle conflicts
  let handleConflicts = 0;
  const handleUsage = new Map();
  
  result.edges.forEach(edge => {
    const sourceKey = `${edge.source}-${edge.sourceHandle}-out`;
    const targetKey = `${edge.target}-${edge.targetHandle}-in`;
    
    handleUsage.set(sourceKey, (handleUsage.get(sourceKey) || 0) + 1);
    handleUsage.set(targetKey, (handleUsage.get(targetKey) || 0) + 1);
  });
  
  handleUsage.forEach((count, key) => {
    if (count > 2) {
      handleConflicts++;
      const [nodeId, handle, dir] = key.split('-');
      issues.push(`Handle overload: ${nodeId} ${handle} handle has ${count} ${dir}going edges`);
    }
  });
  
  if (handleConflicts > 0) {
    quality -= handleConflicts * 5;
  }
  
  // Check frame issues
  let frameIssues = 0;
  result.nodes.forEach(node => {
    if (node.parentNode) {
      const parent = result.nodes.find(n => n.id === node.parentNode);
      if (parent) {
        // Frame children sollten relative Positionen haben
        // Hier prüfen wir ob sie innerhalb des Parents sind
        const childAbsX = parent.position.x + node.position.x;
        const childAbsY = parent.position.y + node.position.y;
        
        if (node.position.x < 0 || node.position.y < 0 ||
            node.position.x + (node.width || 180) > (parent.width || 400) ||
            node.position.y + (node.height || 80) > (parent.height || 300)) {
          frameIssues++;
          issues.push(`Frame issue: ${node.id} outside parent ${parent.id}`);
        }
      }
    }
  });
  
  if (frameIssues > 0) {
    quality -= frameIssues * 10;
  }
  
  // Count edge labels
  const edgeLabels = result.edges.filter(e => e.label).length;
  
  quality = Math.max(0, quality);
  
  return {
    hasNegativeCoords,
    collisions,
    handleConflicts,
    frameIssues,
    edgeLabels,
    quality,
    issues
  };
}

// Generate tests
const outputDir = path.join(__dirname, 'perfect-v2-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

console.log('🚀 Testing Perfect Layout V2...\n');
console.log('Key Features:');
console.log('  ✓ 100% Deterministic');
console.log('  ✓ No negative coordinates');
console.log('  ✓ Strict In/Out handle separation');
console.log('  ✓ Smart collision avoidance');
console.log('  ✓ Intelligent edge routing');
console.log('  ✓ Proper frame handling\n');

// Test configurations
const configs = [
  { 
    name: 'compact-lanes',
    config: { 
      mode: 'compact',
      enableLanes: true,
      enableSmartRouting: true,
      showHandles: true
    }
  },
  {
    name: 'horizontal-simple',
    config: {
      mode: 'horizontal',
      enableLanes: false,
      enableSmartRouting: false
    }
  },
  {
    name: 'vertical-smart',
    config: {
      mode: 'vertical',
      enableLanes: true,
      enableSmartRouting: true
    }
  },
  {
    name: 'smart-full',
    config: {
      mode: 'smart',
      enableLanes: true,
      enableSmartRouting: true,
      nodeSpacing: 120,
      levelSpacing: 180,
      showHandles: true
    }
  }
];

// Test flows
const flows = [
  { name: 'Simple Flow', ...createSimpleFlow() },
  { name: 'Parallel Edges', ...createParallelEdgesFlow() },
  { name: 'Frame Layout', ...createFrameFlow() }
];

// Generate all test combinations
let perfectCount = 0;
flows.forEach(flow => {
  configs.forEach(({ name: configName, config }) => {
    const filename = `perfect-v2-${flow.name.toLowerCase().replace(/\s+/g, '-')}-${configName}.html`;
    const html = generateHTML(flow.name, flow.nodes, flow.edges, config);
    fs.writeFileSync(path.join(outputDir, filename), html);
    
    // Check if perfect
    const testLayout = new PerfectLayoutV2(flow.nodes, flow.edges, config);
    const testResult = testLayout.apply();
    const testAnalysis = analyzeLayout(testResult, config);
    
    if (testAnalysis.quality === 100) {
      console.log(`✅ PERFECT: ${filename}`);
      perfectCount++;
    } else {
      console.log(`📊 Generated: ${filename} (Quality: ${testAnalysis.quality}%)`);
    }
  });
});

console.log(`\n🎯 Tests complete! ${perfectCount} perfect layouts generated.`);
console.log(`📁 Open the HTML files in ${outputDir} to verify results.`);