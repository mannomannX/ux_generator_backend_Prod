/**
 * Verifizierungs-Script für Layout-Konsistenz
 * 
 * Dieses Script überprüft, ob Frame-Children über alle Modi hinweg konsistent bleiben.
 */

import { Node, Edge } from 'reactflow';
import { applyUltimateLayout } from './ultimateAutoLayout';

// Test-Daten mit Frames
const testNodes: Node[] = [
  { id: 'start', type: 'start', position: { x: 50, y: 50 }, data: { label: 'Start' } },
  
  // Frame 1 mit Children
  { 
    id: 'frame1', 
    type: 'frame', 
    position: { x: 200, y: 100 }, 
    width: 400, 
    height: 300, 
    data: { label: 'User Flow' }
  },
  { 
    id: 'login', 
    type: 'screen', 
    position: { x: 220, y: 150 }, 
    data: { label: 'Login' },
    parentId: 'frame1'  // Explizite Zuordnung
  },
  { 
    id: 'auth', 
    type: 'decision', 
    position: { x: 220, y: 250 }, 
    data: { label: 'Authenticate' },
    parentId: 'frame1'  // Explizite Zuordnung
  },
  { 
    id: 'dashboard', 
    type: 'screen', 
    position: { x: 400, y: 150 }, 
    data: { label: 'Dashboard' },
    parentId: 'frame1'  // Explizite Zuordnung
  },
  
  // Frame 2 mit Children
  { 
    id: 'frame2', 
    type: 'frame', 
    position: { x: 200, y: 450 }, 
    width: 400, 
    height: 200, 
    data: { label: 'Admin Area' }
  },
  { 
    id: 'admin', 
    type: 'screen', 
    position: { x: 250, y: 500 }, 
    data: { label: 'Admin Panel' },
    parentId: 'frame2'  // Explizite Zuordnung
  },
  { 
    id: 'settings', 
    type: 'action', 
    position: { x: 450, y: 500 }, 
    data: { label: 'Settings' },
    parentId: 'frame2'  // Explizite Zuordnung
  },
  
  { id: 'end', type: 'end', position: { x: 700, y: 350 }, data: { label: 'End' } },
];

const testEdges: Edge[] = [
  { id: 'e1', source: 'start', target: 'login' },
  { id: 'e2', source: 'login', target: 'auth' },
  { id: 'e3', source: 'auth', target: 'dashboard' },
  { id: 'e4', source: 'dashboard', target: 'admin' },
  { id: 'e5', source: 'admin', target: 'settings' },
  { id: 'e6', source: 'dashboard', target: 'end' },
  { id: 'e7', source: 'settings', target: 'end' },
];

/**
 * Überprüfe ob Node innerhalb eines Frames liegt
 */
function isNodeInFrame(node: Node, frame: Node): boolean {
  if (!frame.width || !frame.height) return false;
  
  const nodeWidth = node.width || 180;
  const nodeHeight = node.height || 80;
  
  const nodeRight = node.position.x + nodeWidth;
  const nodeBottom = node.position.y + nodeHeight;
  const frameRight = frame.position.x + frame.width;
  const frameBottom = frame.position.y + frame.height;
  
  return (
    node.position.x >= frame.position.x &&
    node.position.y >= frame.position.y &&
    nodeRight <= frameRight &&
    nodeBottom <= frameBottom
  );
}

/**
 * Verifiziere Layout-Konsistenz
 */
export function verifyLayoutConsistency() {
  console.log('\\n' + '='.repeat(60));
  console.log('LAYOUT CONSISTENCY VERIFICATION');
  console.log('='.repeat(60));
  
  const modes: Array<'smart' | 'vertical' | 'horizontal' | 'tree' | 'compact'> = [
    'smart', 'vertical', 'horizontal', 'tree', 'compact'
  ];
  
  const results: Record<string, { frame1Children: string[], frame2Children: string[] }> = {};
  
  // Teste jeden Modus
  modes.forEach(mode => {
    console.log(`\\nTesting mode: ${mode}`);
    
    const result = applyUltimateLayout(testNodes, testEdges, {
      mode,
      debugMode: false,
    });
    
    // Finde Frame-Nodes
    const frame1 = result.nodes.find(n => n.id === 'frame1');
    const frame2 = result.nodes.find(n => n.id === 'frame2');
    
    if (!frame1 || !frame2) {
      console.error('  ❌ Frames not found!');
      return;
    }
    
    // Prüfe welche Nodes in welchem Frame sind
    const frame1Children: string[] = [];
    const frame2Children: string[] = [];
    
    result.nodes.forEach(node => {
      if (node.type === 'frame' || node.id === 'start' || node.id === 'end') return;
      
      if (node.parentId === 'frame1' || isNodeInFrame(node, frame1)) {
        frame1Children.push(node.id);
      } else if (node.parentId === 'frame2' || isNodeInFrame(node, frame2)) {
        frame2Children.push(node.id);
      }
    });
    
    results[mode] = { frame1Children, frame2Children };
    
    console.log(`  Frame1 children: [${frame1Children.join(', ')}]`);
    console.log(`  Frame2 children: [${frame2Children.join(', ')}]`);
  });
  
  // Vergleiche Konsistenz
  console.log('\\n' + '-'.repeat(60));
  console.log('CONSISTENCY CHECK:');
  console.log('-'.repeat(60));
  
  const expectedFrame1 = ['login', 'auth', 'dashboard'];
  const expectedFrame2 = ['admin', 'settings'];
  
  let allConsistent = true;
  
  Object.entries(results).forEach(([mode, { frame1Children, frame2Children }]) => {
    const frame1Match = 
      frame1Children.length === expectedFrame1.length &&
      expectedFrame1.every(id => frame1Children.includes(id));
    
    const frame2Match = 
      frame2Children.length === expectedFrame2.length &&
      expectedFrame2.every(id => frame2Children.includes(id));
    
    const consistent = frame1Match && frame2Match;
    allConsistent = allConsistent && consistent;
    
    console.log(`${mode}: ${consistent ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!consistent) {
      if (!frame1Match) {
        console.log(`  Frame1: Expected [${expectedFrame1.join(', ')}], got [${frame1Children.join(', ')}]`);
      }
      if (!frame2Match) {
        console.log(`  Frame2: Expected [${expectedFrame2.join(', ')}], got [${frame2Children.join(', ')}]`);
      }
    }
  });
  
  console.log('\\n' + '='.repeat(60));
  console.log(`OVERALL RESULT: ${allConsistent ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('='.repeat(60));
  
  return allConsistent;
}

// Export für Browser-Konsole
if (typeof window !== 'undefined') {
  (window as any).verifyLayout = verifyLayoutConsistency;
  console.log('💡 Verify layout consistency with: verifyLayout()');
}