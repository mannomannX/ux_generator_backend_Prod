/**
 * Test-Script für den Ultimate Auto-Layout Algorithmus
 * 
 * Dieses Script testet verschiedene Szenarien und gibt detaillierte
 * Informationen über die Layout-Ergebnisse aus.
 */

import { Node, Edge } from 'reactflow';
import { applyUltimateLayout, logLayoutVisualization } from './ultimateAutoLayout';

// Test-Szenario: Einfacher linearer Flow
const linearFlow = {
  nodes: [
    { id: '1', type: 'start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
    { id: '2', type: 'screen', position: { x: 100, y: 200 }, data: { label: 'Screen 1' } },
    { id: '3', type: 'screen', position: { x: 100, y: 300 }, data: { label: 'Screen 2' } },
    { id: '4', type: 'end', position: { x: 100, y: 400 }, data: { label: 'End' } },
  ] as Node[],
  edges: [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e2-3', source: '2', target: '3' },
    { id: 'e3-4', source: '3', target: '4' },
  ] as Edge[],
};

// Test-Szenario: Verzweigter Flow
const branchingFlow = {
  nodes: [
    { id: '1', type: 'start', position: { x: 250, y: 0 }, data: { label: 'Start' } },
    { id: '2', type: 'decision', position: { x: 250, y: 100 }, data: { label: 'Decision' } },
    { id: '3', type: 'screen', position: { x: 100, y: 200 }, data: { label: 'Option A' } },
    { id: '4', type: 'screen', position: { x: 400, y: 200 }, data: { label: 'Option B' } },
    { id: '5', type: 'end', position: { x: 250, y: 300 }, data: { label: 'End' } },
  ] as Node[],
  edges: [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e2-3', source: '2', target: '3' },
    { id: 'e2-4', source: '2', target: '4' },
    { id: 'e3-5', source: '3', target: '5' },
    { id: 'e4-5', source: '4', target: '5' },
  ] as Edge[],
};

// Test-Szenario: Chaotisches Layout (muss korrigiert werden)
const messyLayout = {
  nodes: [
    { id: '1', type: 'start', position: { x: 423, y: 178 }, data: { label: 'Start' } },
    { id: '2', type: 'screen', position: { x: 127, y: 298 }, data: { label: 'Login' } },
    { id: '3', type: 'screen', position: { x: 512, y: 89 }, data: { label: 'Dashboard' } },
    { id: '4', type: 'decision', position: { x: 234, y: 412 }, data: { label: 'Auth Check' } },
    { id: '5', type: 'action', position: { x: 678, y: 234 }, data: { label: 'Logout' } },
    { id: '6', type: 'end', position: { x: 456, y: 489 }, data: { label: 'End' } },
  ] as Node[],
  edges: [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e2-4', source: '2', target: '4' },
    { id: 'e4-3', source: '4', target: '3' },
    { id: 'e3-5', source: '3', target: '5' },
    { id: 'e5-6', source: '5', target: '6' },
    { id: 'e4-6', source: '4', target: '6' },
  ] as Edge[],
};

// Funktion zum Testen eines Szenarios
function testScenario(name: string, nodes: Node[], edges: Edge[], mode: 'smart' | 'vertical' | 'horizontal' | 'tree' = 'smart') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TESTING: ${name} (Mode: ${mode})`);
  console.log('='.repeat(60));

  console.log('\n📊 Original Layout:');
  nodes.forEach(node => {
    console.log(`  ${node.id}: [${Math.round(node.position.x)}, ${Math.round(node.position.y)}]`);
  });

  // Wende Layout an
  const result = applyUltimateLayout(nodes, edges, {
    mode,
    debugMode: true,
    nodeSpacing: 80,
    rankSpacing: 120,
  });

  console.log('\n✨ Optimized Layout:');
  result.nodes.forEach(node => {
    console.log(`  ${node.id}: [${Math.round(node.position.x)}, ${Math.round(node.position.y)}]`);
  });

  // Zeige Visualisierung
  if (result.visualization) {
    console.log('\n📋 Visualization Report:');
    logLayoutVisualization(result.visualization);
  }

  // Berechne Verbesserung
  const originalSpread = calculateSpread(nodes);
  const optimizedSpread = calculateSpread(result.nodes);
  const improvement = ((originalSpread - optimizedSpread) / originalSpread * 100).toFixed(1);
  
  console.log(`\n📈 Layout Improvement: ${improvement}% reduction in spread`);
  
  return result;
}

// Hilfsfunktion zur Berechnung der Ausbreitung
function calculateSpread(nodes: Node[]): number {
  if (nodes.length === 0) return 0;
  
  const xs = nodes.map(n => n.position.x);
  const ys = nodes.map(n => n.position.y);
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return (maxX - minX) * (maxY - minY);
}

// Führe alle Tests aus
export function runAllLayoutTests() {
  console.log('\n' + '🧪'.repeat(30));
  console.log('ULTIMATE AUTO-LAYOUT TEST SUITE');
  console.log('🧪'.repeat(30));

  // Test 1: Linearer Flow
  const linearResult = testScenario('Linear Flow', linearFlow.nodes, linearFlow.edges, 'vertical');
  
  // Test 2: Verzweigter Flow
  const branchingResult = testScenario('Branching Flow', branchingFlow.nodes, branchingFlow.edges, 'smart');
  
  // Test 3: Chaotisches Layout
  const messyResult = testScenario('Messy Layout Cleanup', messyLayout.nodes, messyLayout.edges, 'smart');

  // Test 4: Deterministisches Verhalten
  console.log(`\n${'='.repeat(60)}`);
  console.log('TESTING: Deterministic Behavior');
  console.log('='.repeat(60));
  
  const result1 = applyUltimateLayout(linearFlow.nodes, linearFlow.edges, { mode: 'vertical', seed: 42 });
  const result2 = applyUltimateLayout(linearFlow.nodes, linearFlow.edges, { mode: 'vertical', seed: 42 });
  
  const isDeterministic = JSON.stringify(result1.nodes) === JSON.stringify(result2.nodes);
  console.log(`\n✅ Deterministic: ${isDeterministic ? 'PASS' : 'FAIL'}`);
  
  if (!isDeterministic) {
    console.log('⚠️ Layout is not deterministic! Results differ between runs.');
  }

  // Zusammenfassung
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  const scores = [
    linearResult.visualization?.layoutScore || 0,
    branchingResult.visualization?.layoutScore || 0,
    messyResult.visualization?.layoutScore || 0,
  ];
  
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  console.log(`\n📊 Average Layout Score: ${avgScore.toFixed(1)}/100`);
  console.log(`✅ Deterministic Behavior: ${isDeterministic ? 'PASS' : 'FAIL'}`);
  console.log(`📈 Best Score: ${Math.max(...scores)}/100`);
  console.log(`📉 Worst Score: ${Math.min(...scores)}/100`);
  
  console.log('\n' + '✨'.repeat(30));
  console.log('All tests completed!');
  console.log('✨'.repeat(30));
}

// Exportiere für Browser-Konsole
if (typeof window !== 'undefined') {
  (window as any).runLayoutTests = runAllLayoutTests;
  console.log('💡 Run tests with: runLayoutTests()');
}