import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { applyGeniusLayout } from './src/utils/geniusAutoLayout.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Realistic e-commerce flow
const createTestFlow = () => {
  const nodes = [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { title: 'Start' } },
    { id: 'home', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Home' } },
    { id: 'browse', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Browse Products' } },
    { id: 'product', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Product Details' } },
    { id: 'cart', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Shopping Cart' } },
    { id: 'checkout', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Checkout' } },
    { id: 'payment', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Payment' } },
    { id: 'waitlist', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'Join Waitlist' } },
    { id: 'decision', type: 'decision', position: { x: 0, y: 0 }, data: { title: 'Stock Check' } },
    { id: 'end-success', type: 'end', position: { x: 0, y: 0 }, data: { title: 'Order Complete' } },
    { id: 'end-abandoned', type: 'end', position: { x: 0, y: 0 }, data: { title: 'Abandoned' } },
    
    // Frame with children
    { id: 'frame-browse', type: 'frame', position: { x: 0, y: 0 }, data: { title: 'Browse Area' } },
    { id: 'search', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'frame-browse', data: { title: 'Search' } },
    { id: 'filter', type: 'screen', position: { x: 0, y: 0 }, parentNode: 'frame-browse', data: { title: 'Filter' } }
  ];

  const edges = [
    { id: 'e1', source: 'start', target: 'home' },
    { id: 'e2', source: 'home', target: 'browse' },
    { id: 'e3', source: 'browse', target: 'product' },
    { id: 'e4', source: 'product', target: 'cart' },
    { id: 'e5', source: 'cart', target: 'checkout' },
    { id: 'e6', source: 'checkout', target: 'decision' },
    { id: 'e7', source: 'decision', target: 'payment', label: 'In Stock' },
    { id: 'e8', source: 'decision', target: 'waitlist', label: 'Out of Stock' },
    { id: 'e9', source: 'payment', target: 'end-success' },
    { id: 'e10', source: 'waitlist', target: 'end-abandoned' },
    { id: 'e11', source: 'cart', target: 'end-abandoned', label: 'Abandon' },
    { id: 'e12', source: 'browse', target: 'frame-browse' },
    { id: 'e13', source: 'search', target: 'filter' },
    { id: 'e14', source: 'frame-browse', target: 'product' }
  ];

  return { nodes, edges };
};

function generateHTML(title, nodes, edges, mode) {
  const result = applyGeniusLayout(nodes, edges, {
    mode: mode,
    compactness: mode === 'compact' ? 0.8 : 0.5
  });
  
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

  // Draw edges FIRST
  result.edges.forEach(edge => {
    const sourceNode = result.nodes.find(n => n.id === edge.source);
    const targetNode = result.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;

    const sourceHandle = edge.sourceHandle || 'right';
    const targetHandle = edge.targetHandle || 'left';
    
    const sourcePos = getHandlePos(sourceNode, sourceHandle);
    const targetPos = getHandlePos(targetNode, targetHandle);
    
    // Draw path
    const midX = sourcePos.x + (targetPos.x - sourcePos.x) / 2;
    const midY = sourcePos.y + (targetPos.y - sourcePos.y) / 2;
    
    let path = `M ${sourcePos.x} ${sourcePos.y}`;
    if (sourceHandle === 'bottom' || sourceHandle === 'top') {
      path += ` L ${sourcePos.x} ${midY} L ${targetPos.x} ${midY}`;
    } else {
      path += ` L ${midX} ${sourcePos.y} L ${midX} ${targetPos.y}`;
    }
    path += ` L ${targetPos.x} ${targetPos.y}`;
    
    svg += `<path d="${path}" fill="none" stroke="#666" stroke-width="2" opacity="0.7" />`;
    
    // Arrow
    svg += `<polygon points="${targetPos.x},${targetPos.y} ${targetPos.x-8},${targetPos.y-4} ${targetPos.x-8},${targetPos.y+4}" fill="#666" />`;
    
    // Label
    if (edge.label) {
      svg += `<rect x="${midX - 40}" y="${midY - 10}" width="80" height="20" fill="white" stroke="#666" stroke-width="1" rx="3" />`;
      svg += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="11" fill="#666">${edge.label}</text>`;
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
    let textColor = '#333';
    
    switch (node.type) {
      case 'start':
        fillColor = '#4caf50';
        strokeColor = '#388e3c';
        strokeWidth = 3;
        textColor = 'white';
        break;
      case 'end':
        fillColor = '#f44336';
        strokeColor = '#d32f2f';
        strokeWidth = 3;
        textColor = 'white';
        break;
      case 'decision':
        fillColor = '#ff9800';
        strokeColor = '#f57c00';
        textColor = 'white';
        break;
      case 'frame':
        fillColor = '#f5f5f5';
        strokeColor = '#9e9e9e';
        strokeWidth = 2;
        break;
      case 'screen':
        fillColor = '#2196f3';
        strokeColor = '#1976d2';
        textColor = 'white';
        break;
    }

    // Draw node
    if (node.type === 'frame') {
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="5,5" rx="8" opacity="0.5" />`;
    } else {
      svg += `<rect x="${x+2}" y="${y+2}" width="${width}" height="${height}" fill="#00000020" rx="8" />`;
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="8" />`;
    }
    
    // Title
    const title = node.data?.title || node.id;
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="${textColor}">${title}</text>`;
  });

  svg += '</svg>';

  // Analyze layout quality
  const analysis = analyzeLayout(result);

  return `<!DOCTYPE html>
<html>
<head>
    <title>${title} - ${mode}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container { 
            max-width: 1600px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin: 0 0 20px 0; }
        .info { 
            background: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .success { 
            background: #e8f5e9;
            padding: 15px;
            border-radius: 4px;
            color: #2e7d32;
            margin: 20px 0;
        }
        .problems { 
            background: #ffebee;
            padding: 15px;
            border-radius: 4px;
            color: #c62828;
            margin: 20px 0;
        }
        .warning {
            background: #fff3e0;
            padding: 15px;
            border-radius: 4px;
            color: #f57c00;
            margin: 20px 0;
        }
        .svg-container { 
            overflow: auto;
            padding: 20px;
            background: #fafafa;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${title} - GeniusAutoLayout</h1>
        <div class="info">
            <strong>Layout Mode:</strong> ${mode} | 
            <strong>Nodes:</strong> ${result.nodes.length} | 
            <strong>Edges:</strong> ${result.edges.length} |
            <strong>Dimensions:</strong> ${Math.round(maxX)}x${Math.round(maxY)}px
        </div>
        
        <div class="svg-container">
            ${svg}
        </div>
        
        <div class="${analysis.quality > 70 ? 'success' : analysis.quality > 40 ? 'warning' : 'problems'}">
            <strong>📊 Layout Analysis:</strong>
            <ul>
                <li>Quality Score: ${analysis.quality}/100</li>
                <li>Collisions: ${analysis.collisions}</li>
                <li>Min Spacing: ${analysis.minSpacing}px</li>
                <li>Compactness: ${analysis.compactness}</li>
                <li>Frame Issues: ${analysis.frameIssues}</li>
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

function analyzeLayout(result) {
  let collisions = 0;
  let minSpacing = Infinity;
  let frameIssues = 0;
  
  // Check collisions
  result.nodes.forEach((a, i) => {
    result.nodes.slice(i + 1).forEach(b => {
      const dx = Math.abs(a.position.x - b.position.x);
      const dy = Math.abs(a.position.y - b.position.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minSpacing) minSpacing = Math.round(distance);
      
      // Check overlap
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
      }
    });
  });
  
  // Check frames
  result.nodes.forEach(node => {
    if (node.parentNode) {
      const parent = result.nodes.find(n => n.id === node.parentNode);
      if (parent) {
        const childInFrame = 
          node.position.x >= parent.position.x &&
          node.position.y >= parent.position.y &&
          node.position.x + (node.width || 180) <= parent.position.x + (parent.width || 400) &&
          node.position.y + (node.height || 80) <= parent.position.y + (parent.height || 300);
        
        if (!childInFrame) frameIssues++;
      }
    }
  });
  
  // Calculate dimensions
  const minX = Math.min(...result.nodes.map(n => n.position.x));
  const maxX = Math.max(...result.nodes.map(n => n.position.x + (n.width || 180)));
  const minY = Math.min(...result.nodes.map(n => n.position.y));
  const maxY = Math.max(...result.nodes.map(n => n.position.y + (n.height || 80)));
  
  const width = maxX - minX;
  const height = maxY - minY;
  const area = width * height;
  const nodeArea = result.nodes.length * 180 * 80;
  const compactness = Math.round((nodeArea / area) * 100);
  
  // Calculate quality score
  let quality = 100;
  quality -= collisions * 20;
  quality -= frameIssues * 15;
  if (minSpacing < 20) quality -= 20;
  if (compactness < 10) quality -= 10;
  quality = Math.max(0, quality);
  
  return {
    quality,
    collisions,
    minSpacing,
    compactness: `${compactness}%`,
    frameIssues
  };
}

// Generate tests
const outputDir = path.join(__dirname, 'genius-layout-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

console.log('🧠 Testing GeniusAutoLayout...\n');
console.log('Features:');
console.log('  • Uses dagre for proven graph layout');
console.log('  • Deterministic results');
console.log('  • Smart handle selection');
console.log('  • Frame support\n');

const flow = createTestFlow();

// Test different modes
['compact', 'vertical', 'horizontal'].forEach(mode => {
  const html = generateHTML('E-commerce Flow', flow.nodes, flow.edges, mode);
  const filename = `genius-${mode}.html`;
  fs.writeFileSync(path.join(outputDir, filename), html);
  console.log(`✅ Generated: ${filename}`);
});

console.log(`\n🎯 Open the HTML files in ${outputDir} to compare!`);