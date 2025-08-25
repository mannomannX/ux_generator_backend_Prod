import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { LayoutV3Minimal } from './src/utils/layoutV3Minimal.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create realistic test data similar to the app
const createRealisticFlow = () => {
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
  const layout = new LayoutV3Minimal(nodes, edges, { mode });
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

  // Draw edges FIRST (so they're behind nodes)
  result.edges.forEach(edge => {
    const sourceNode = result.nodes.find(n => n.id === edge.source);
    const targetNode = result.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;

    const sourceHandle = edge.sourceHandle || 'right';
    const targetHandle = edge.targetHandle || 'left';
    
    const sourcePos = getHandlePos(sourceNode, sourceHandle);
    const targetPos = getHandlePos(targetNode, targetHandle);
    
    // Simple orthogonal path
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
    const angle = Math.atan2(targetPos.y - midY, targetPos.x - midX);
    const arrowLength = 10;
    const arrowAngle = Math.PI / 6;
    
    const x1 = targetPos.x - arrowLength * Math.cos(angle - arrowAngle);
    const y1 = targetPos.y - arrowLength * Math.sin(angle - arrowAngle);
    const x2 = targetPos.x - arrowLength * Math.cos(angle + arrowAngle);
    const y2 = targetPos.y - arrowLength * Math.sin(angle + arrowAngle);
    
    svg += `<polygon points="${targetPos.x},${targetPos.y} ${x1},${y1} ${x2},${y2}" fill="#666" />`;
    
    // Label if exists
    if (edge.label) {
      const labelX = (sourcePos.x + targetPos.x) / 2;
      const labelY = (sourcePos.y + targetPos.y) / 2;
      svg += `<rect x="${labelX - 40}" y="${labelY - 10}" width="80" height="20" fill="white" stroke="#666" stroke-width="1" rx="3" />`;
      svg += `<text x="${labelX}" y="${labelY + 4}" text-anchor="middle" font-size="11" fill="#666">${edge.label}</text>`;
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
      // Shadow
      svg += `<rect x="${x+2}" y="${y+2}" width="${width}" height="${height}" fill="#00000020" rx="8" />`;
      // Node
      svg += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" rx="8" />`;
    }
    
    // Title
    const title = node.data?.title || node.id;
    svg += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="${textColor}">${title}</text>`;
    
    // Level indicator
    if (node.data?.level !== undefined) {
      svg += `<rect x="${x}" y="${y - 20}" width="25" height="16" fill="${strokeColor}" rx="3" />`;
      svg += `<text x="${x + 12.5}" y="${y - 8}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">L${node.data.level}</text>`;
    }

    // Draw handles for debugging
    ['top', 'bottom', 'left', 'right'].forEach(handle => {
      const pos = getHandlePos(node, handle);
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3" fill="white" stroke="${strokeColor}" stroke-width="1" opacity="0.5" />`;
    });
  });

  // Add collision indicators
  let collisions = [];
  result.nodes.forEach((nodeA, i) => {
    result.nodes.slice(i + 1).forEach(nodeB => {
      if (nodesOverlap(nodeA, nodeB)) {
        collisions.push(`${nodeA.data?.title || nodeA.id} ↔ ${nodeB.data?.title || nodeB.id}`);
      }
    });
  });

  svg += '</svg>';

  const collisionClass = collisions.length > 0 ? 'problems' : 'success';
  const collisionText = collisions.length > 0 
    ? `<div class="${collisionClass}">
         <strong>⚠️ Collisions Detected:</strong>
         <ul>${collisions.map(c => `<li>${c}</li>`).join('')}</ul>
       </div>`
    : '<div class="success"><strong>✅ No collisions detected!</strong></div>';

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
        .svg-container { 
            overflow: auto;
            padding: 20px;
            background: #fafafa;
            border-radius: 4px;
            border: 1px solid #e0e0e0;
        }
        .analysis {
            background: #fff3e0;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
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
        
        <div class="svg-container">
            ${svg}
        </div>
        
        ${collisionText}
        
        <div class="analysis">
            <strong>🔍 Critical Analysis:</strong>
            <ul>
                <li><strong>Spacing:</strong> ${analyzeSpacing(result.nodes)}</li>
                <li><strong>Edge Crossings:</strong> ${analyzeEdgeCrossings(result)}</li>
                <li><strong>Frame Handling:</strong> ${analyzeFrames(result.nodes)}</li>
                <li><strong>Overall Quality:</strong> ${overallQuality(result, collisions)}</li>
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

function nodesOverlap(a, b) {
  const margin = 5;
  const ax1 = a.position.x - margin;
  const ax2 = a.position.x + (a.width || 180) + margin;
  const ay1 = a.position.y - margin;
  const ay2 = a.position.y + (a.height || 80) + margin;
  
  const bx1 = b.position.x - margin;
  const bx2 = b.position.x + (b.width || 180) + margin;
  const by1 = b.position.y - margin;
  const by2 = b.position.y + (b.height || 80) + margin;
  
  return !(ax2 < bx1 || bx2 < ax1 || ay2 < by1 || by2 < ay1);
}

function analyzeSpacing(nodes) {
  const distances = [];
  nodes.forEach((a, i) => {
    nodes.slice(i + 1).forEach(b => {
      const dx = Math.abs(a.position.x - b.position.x);
      const dy = Math.abs(a.position.y - b.position.y);
      distances.push(Math.sqrt(dx * dx + dy * dy));
    });
  });
  
  const minDist = Math.min(...distances);
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  
  if (minDist < 50) return `❌ Too tight (min: ${Math.round(minDist)}px)`;
  if (avgDist > 500) return `⚠️ Too spread out (avg: ${Math.round(avgDist)}px)`;
  return `✅ Good (min: ${Math.round(minDist)}px, avg: ${Math.round(avgDist)}px)`;
}

function analyzeEdgeCrossings(result) {
  // Simplified - just count potential crossings
  let crossings = 0;
  result.edges.forEach((e1, i) => {
    result.edges.slice(i + 1).forEach(e2 => {
      // Very basic check - if edges connect different node pairs
      if (e1.source !== e2.source && e1.target !== e2.target) {
        crossings++;
      }
    });
  });
  
  if (crossings === 0) return '✅ No crossings';
  if (crossings < 5) return `✅ Minimal (${crossings} potential)`;
  return `⚠️ Many crossings (${crossings} potential)`;
}

function analyzeFrames(nodes) {
  const frames = nodes.filter(n => n.type === 'frame');
  const children = nodes.filter(n => n.parentNode);
  
  if (frames.length === 0) return 'N/A (no frames)';
  
  let allContained = true;
  children.forEach(child => {
    const parent = frames.find(f => f.id === child.parentNode);
    if (parent) {
      const childInFrame = 
        child.position.x >= parent.position.x &&
        child.position.y >= parent.position.y &&
        child.position.x + (child.width || 180) <= parent.position.x + (parent.width || 400) &&
        child.position.y + (child.height || 80) <= parent.position.y + (parent.height || 300);
      
      if (!childInFrame) allContained = false;
    }
  });
  
  return allContained ? '✅ All children contained' : '❌ Children outside frames';
}

function overallQuality(result, collisions) {
  let score = 100;
  
  // Deduct for collisions
  score -= collisions.length * 10;
  
  // Check for edge-node overlaps (simplified)
  let edgeNodeOverlaps = 0;
  result.edges.forEach(edge => {
    result.nodes.forEach(node => {
      if (node.id !== edge.source && node.id !== edge.target) {
        // Very basic check - if edge might pass through node
        const sourceNode = result.nodes.find(n => n.id === edge.source);
        const targetNode = result.nodes.find(n => n.id === edge.target);
        if (sourceNode && targetNode) {
          // Check if node is between source and target
          const nodeX = node.position.x + (node.width || 180) / 2;
          const nodeY = node.position.y + (node.height || 80) / 2;
          const sourceX = sourceNode.position.x + (sourceNode.width || 180) / 2;
          const sourceY = sourceNode.position.y + (sourceNode.height || 80) / 2;
          const targetX = targetNode.position.x + (targetNode.width || 180) / 2;
          const targetY = targetNode.position.y + (targetNode.height || 80) / 2;
          
          const betweenX = (nodeX > Math.min(sourceX, targetX) - 50) && 
                          (nodeX < Math.max(sourceX, targetX) + 50);
          const betweenY = (nodeY > Math.min(sourceY, targetY) - 50) && 
                          (nodeY < Math.max(sourceY, targetY) + 50);
          
          if (betweenX && betweenY) {
            edgeNodeOverlaps++;
          }
        }
      }
    });
  });
  
  score -= edgeNodeOverlaps * 5;
  
  if (score >= 90) return `✅ Excellent (${score}/100)`;
  if (score >= 70) return `✅ Good (${score}/100)`;
  if (score >= 50) return `⚠️ Acceptable (${score}/100)`;
  return `❌ Poor (${score}/100)`;
}

// Generate tests
const outputDir = path.join(__dirname, 'layout-v3-minimal-tests');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

console.log('🧪 Testing Layout V3 Minimal...\n');
console.log('📋 Changes from V3:');
console.log('  • Increased spacing (300x200 from 250x150)');
console.log('  • Reduced stagger ratio (0.15 from 0.3)');
console.log('  • Simple collision adjustment');
console.log('  • No complex lane colors');
console.log('  • Cleaner handle selection logic\n');

// Test with realistic flow
const flow = createRealisticFlow();
const html = generateHTML('Realistic E-commerce Flow', flow.nodes, flow.edges, 'compact');
const filename = 'realistic-compact.html';
fs.writeFileSync(path.join(outputDir, filename), html);
console.log(`✅ Generated: ${filename}`);

console.log(`\n🎯 Open ${path.join(outputDir, filename)} to analyze the results!`);
console.log('📊 Check for:');
console.log('  - Edge-node collisions (especially near Join Waitlist/end-abandoned)');
console.log('  - Frame sizing and child containment');
console.log('  - Overall compactness and readability');