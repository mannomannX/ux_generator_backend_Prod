import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { LayoutV3 } from './src/utils/layoutV3.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data: Complex flow with frames
const createTestFlow = () => {
  const nodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
    { id: 'login', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Login Screen' } },
    { id: 'auth', type: 'decision', position: { x: 0, y: 0 }, data: { label: 'Authenticate' } },
    
    // Frame with children
    { id: 'frame1', type: 'frame', position: { x: 0, y: 0 }, data: { label: 'Dashboard Frame' } },
    { id: 'dashboard', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'frame1', data: { label: 'Dashboard' } },
    { id: 'profile', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'frame1', data: { label: 'Profile' } },
    
    { id: 'settings', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Settings' } },
    { id: 'logout', type: 'action', position: { x: 0, y: 0 }, data: { label: 'Logout' } },
    { id: 'end', type: 'end', position: { x: 0, y: 0 }, data: { label: 'End' } }
  ];

  const edges = [
    { id: 'e1', source: 'start', target: 'login' },
    { id: 'e2', source: 'login', target: 'auth' },
    { id: 'e3', source: 'auth', target: 'frame1', label: 'Success' },
    { id: 'e4', source: 'auth', target: 'end', label: 'Failed' },
    { id: 'e5', source: 'dashboard', target: 'profile' },
    { id: 'e6', source: 'profile', target: 'settings' },
    { id: 'e7', source: 'settings', target: 'logout' },
    { id: 'e8', source: 'logout', target: 'end' },
    { id: 'e9', source: 'frame1', target: 'settings' }
  ];

  return { nodes, edges };
};

// Test parallel edges
const createParallelEdgesTest = () => {
  const nodes = [
    { id: 'A', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Node A' } },
    { id: 'B', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Node B' } },
    { id: 'C', type: 'screen', position: { x: 0, y: 0 }, data: { label: 'Node C' } }
  ];

  const edges = [
    { id: 'e1', source: 'A', target: 'B', label: 'Connection 1' },
    { id: 'e2', source: 'A', target: 'B', label: 'Connection 2' },
    { id: 'e3', source: 'A', target: 'B', label: 'Connection 3' },
    { id: 'e4', source: 'B', target: 'C' },
    { id: 'e5', source: 'A', target: 'C', label: 'Direct' }
  ];

  return { nodes, edges };
};

function generateHTML(title, nodes, edges, mode) {
  const layout = new LayoutV3(nodes, edges, { mode });
  const result = layout.apply();
  
  // Calculate SVG dimensions
  const maxX = Math.max(...result.nodes.map(n => n.position.x + (n.width || 180))) + 100;
  const maxY = Math.max(...result.nodes.map(n => n.position.y + (n.height || 80))) + 100;

  let svg = `<svg width="${maxX}" height="${maxY}" style="border: 1px solid #ddd; background: white;">`;
  
  // Add grid
  for (let x = 0; x < maxX; x += 50) {
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${maxY}" stroke="#f5f5f5" />`;
  }
  for (let y = 0; y < maxY; y += 50) {
    svg += `<line x1="0" y1="${y}" x2="${maxX}" y2="${y}" stroke="#f5f5f5" />`;
  }

  // Draw edges
  result.edges.forEach(edge => {
    const sourceNode = result.nodes.find(n => n.id === edge.source);
    const targetNode = result.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;

    // Get handle positions
    const sourceHandle = edge.sourceHandle || 'right';
    const targetHandle = edge.targetHandle || 'left';
    
    const sourcePos = getHandlePos(sourceNode, sourceHandle);
    const targetPos = getHandlePos(targetNode, targetHandle);
    
    // Draw edge path
    const color = edge.style?.stroke || '#666';
    const strokeWidth = edge.style?.strokeWidth || 2;
    
    if (edge.data?.points && edge.data.points.length > 2) {
      // Complex path with waypoints
      let path = `M ${sourcePos.x} ${sourcePos.y}`;
      edge.data.points.slice(1, -1).forEach(p => {
        path += ` L ${p.x} ${p.y}`;
      });
      path += ` L ${targetPos.x} ${targetPos.y}`;
      svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="0.8" />`;
    } else {
      // Simple path
      const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
      const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
      
      let path = `M ${sourcePos.x} ${sourcePos.y}`;
      if (sourceHandle === 'bottom' || sourceHandle === 'top') {
        path += ` L ${sourcePos.x} ${midY} L ${targetPos.x} ${midY}`;
      } else {
        path += ` L ${midX} ${sourcePos.y} L ${midX} ${targetPos.y}`;
      }
      path += ` L ${targetPos.x} ${targetPos.y}`;
      
      svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" opacity="0.8" />`;
    }
    
    // Add arrow
    svg += `<polygon points="${targetPos.x},${targetPos.y} ${targetPos.x-8},${targetPos.y-4} ${targetPos.x-8},${targetPos.y+4}" fill="${color}" />`;
    
    // Add label if exists
    if (edge.label) {
      const labelX = (sourcePos.x + targetPos.x) / 2;
      const labelY = (sourcePos.y + targetPos.y) / 2;
      svg += `<rect x="${labelX - 30}" y="${labelY - 10}" width="60" height="20" fill="white" stroke="${color}" rx="3" />`;
      svg += `<text x="${labelX}" y="${labelY + 4}" text-anchor="middle" font-size="11" fill="${color}">${edge.label}</text>`;
    }
  });

  // Draw nodes
  result.nodes.forEach(node => {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width || 180;
    const height = node.height || 80;
    
    // Node style based on type
    let fillColor = 'white';
    let strokeColor = '#666';
    let strokeWidth = 2;
    
    switch (node.type) {
      case 'start':
        fillColor = '#4caf50';
        strokeColor = '#388e3c';
        strokeWidth = 3;
        break;
      case 'end':
        fillColor = '#f44336';
        strokeColor = '#d32f2f';
        strokeWidth = 3;
        break;
      case 'decision':
        fillColor = '#ff9800';
        strokeColor = '#f57c00';
        break;
      case 'frame':
        fillColor = '#f0f0f0';
        strokeColor = '#9e9e9e';
        strokeWidth = 2;
        break;
      case 'screen':
        fillColor = '#2196f3';
        strokeColor = '#1976d2';
        break;
    }

    // Draw node
    if (node.type === 'frame') {
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="5,5" rx="8" opacity="0.3" />`;
    } else {
      // Shadow
      svg += `<rect x="${x+2}" y="${y+2}" width="${width}" height="${height}" fill="#00000020" rx="8" />`;
      // Node
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="8" />`;
    }
    
    // Label
    const label = node.data?.label || node.id;
    const textColor = node.type === 'start' || node.type === 'end' || node.type === 'screen' ? 'white' : '#333';
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="${textColor}">${label}</text>`;
    
    // Level indicator
    if (node.data?.level !== undefined) {
      svg += `<rect x="${x}" y="${y - 20}" width="30" height="18" fill="${strokeColor}" rx="4" />`;
      svg += `<text x="${x + 15}" y="${y - 6}" text-anchor="middle" fill="white" font-size="11" font-weight="bold">L${node.data.level}</text>`;
    }

    // Draw handles
    const handles = ['top', 'bottom', 'left', 'right'];
    handles.forEach(handle => {
      const pos = getHandlePos(node, handle);
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4" fill="white" stroke="${strokeColor}" stroke-width="2" />`;
    });
  });

  svg += '</svg>';

  return `<!DOCTYPE html>
<html>
<head>
    <title>${title} - ${mode}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
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
        h1 { color: #333; margin: 0 0 10px 0; }
        .info { 
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .stats { display: flex; gap: 20px; margin: 20px 0; }
        .stat { 
            flex: 1;
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
        }
        .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
        .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
        .success { background: #e8f5e9; padding: 15px; border-radius: 8px; color: #2e7d32; }
        .svg-container { overflow: auto; padding: 20px; background: #fafafa; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title}</h1>
        <div class="info">
            <strong>Layout Mode:</strong> ${mode} | 
            <strong>Nodes:</strong> ${result.nodes.length} | 
            <strong>Edges:</strong> ${result.edges.length}
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${result.nodes.length}</div>
                <div class="stat-label">Nodes</div>
            </div>
            <div class="stat">
                <div class="stat-value">${result.edges.length}</div>
                <div class="stat-label">Edges</div>
            </div>
            <div class="stat">
                <div class="stat-value">${result.nodes.filter(n => n.type === 'frame').length}</div>
                <div class="stat-label">Frames</div>
            </div>
            <div class="stat">
                <div class="stat-value">${Math.max(...result.nodes.map(n => n.data?.level || 0)) + 1}</div>
                <div class="stat-label">Levels</div>
            </div>
        </div>
        
        <div class="svg-container">
            ${svg}
        </div>
        
        <div class="success">
            <strong>✅ Layout V3 Features:</strong>
            <ul style="margin: 10px 0 0 20px;">
                <li>React Flow compatible handle IDs (top, bottom, left, right)</li>
                <li>Deterministic layout (same input = same output)</li>
                <li>Smart handle selection based on node positions</li>
                <li>Lane system for parallel edges</li>
                <li>Frame support with child positioning</li>
                <li>Collision detection and avoidance</li>
                <li>Level-based hierarchical arrangement</li>
            </ul>
        </div>
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

// Generate tests
const outputDir = path.join(__dirname, 'layout-v3-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

console.log('🚀 Testing Layout V3...\n');
console.log('✨ Key Features:');
console.log('  • React Flow compatible handles');
console.log('  • Deterministic results');
console.log('  • Frame support');
console.log('  • Lane system for parallel edges');
console.log('  • Collision avoidance\n');

// Test 1: Complex flow with frames
const complexFlow = createTestFlow();
['compact', 'horizontal', 'vertical'].forEach(mode => {
  const html = generateHTML('Complex Flow with Frames', complexFlow.nodes, complexFlow.edges, mode);
  const filename = `complex-${mode}.html`;
  fs.writeFileSync(path.join(outputDir, filename), html);
  console.log(`✅ Generated: ${filename}`);
});

// Test 2: Parallel edges
const parallelTest = createParallelEdgesTest();
const parallelHtml = generateHTML('Parallel Edges Test', parallelTest.nodes, parallelTest.edges, 'compact');
fs.writeFileSync(path.join(outputDir, 'parallel-edges.html'), parallelHtml);
console.log('✅ Generated: parallel-edges.html');

console.log(`\n✨ Tests saved to: ${outputDir}`);
console.log('🎯 Open the HTML files to verify the layout!');