import { completeExampleFlow } from '@/mocks/completeFlowExample';
import { autoLayout, smartLayout, treeLayout, compactLayout } from './autoLayoutOptimized';
import { Node, Edge } from 'reactflow';

// Convert the flow data to nodes and edges
const convertFlowToNodesEdges = () => {
  const nodes: Node[] = completeExampleFlow.nodes.map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      ...node,
      title: node.title,
      description: node.description,
      size: node.size,
      style: node.style,
    }
  }));

  const edges: Edge[] = completeExampleFlow.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type || 'smoothstep',
    label: edge.label,
    style: edge.style,
    data: {}
  }));

  return { nodes, edges };
};

export const testAllLayouts = () => {
  const { nodes, edges } = convertFlowToNodesEdges();
  const results: Record<string, any> = {};

  console.log('Testing layouts with:', nodes.length, 'nodes and', edges.length, 'edges');
  console.log('Frame nodes:', nodes.filter(n => n.type === 'frame').length);
  console.log('Edges with cond- handles:', edges.filter(e => e.sourceHandle?.startsWith('cond-')).length);

  // Test Auto Layout (LR)
  try {
    const autoResult = autoLayout(nodes, edges, { direction: 'LR' });
    results.autoLayoutLR = {
      success: true,
      nodeCount: autoResult.nodes.length,
      edgeCount: autoResult.edges.length,
      framesFirst: autoResult.nodes[0]?.type === 'frame',
      condHandlesPreserved: autoResult.edges.filter(e => e.sourceHandle?.startsWith('cond-')).length
    };
    console.log('✓ Auto Layout LR:', results.autoLayoutLR);
  } catch (error) {
    results.autoLayoutLR = { success: false, error: error.message };
    console.error('✗ Auto Layout LR failed:', error);
  }

  // Test Auto Layout (TB)
  try {
    const autoResult = autoLayout(nodes, edges, { direction: 'TB' });
    results.autoLayoutTB = {
      success: true,
      nodeCount: autoResult.nodes.length,
      edgeCount: autoResult.edges.length,
      framesFirst: autoResult.nodes[0]?.type === 'frame',
      condHandlesPreserved: autoResult.edges.filter(e => e.sourceHandle?.startsWith('cond-')).length
    };
    console.log('✓ Auto Layout TB:', results.autoLayoutTB);
  } catch (error) {
    results.autoLayoutTB = { success: false, error: error.message };
    console.error('✗ Auto Layout TB failed:', error);
  }

  // Test Smart Layout
  try {
    const smartResult = smartLayout(nodes, edges);
    results.smartLayout = {
      success: true,
      nodeCount: smartResult.nodes.length,
      edgeCount: smartResult.edges.length,
      framesFirst: smartResult.nodes[0]?.type === 'frame',
      condHandlesPreserved: smartResult.edges.filter(e => e.sourceHandle?.startsWith('cond-')).length
    };
    console.log('✓ Smart Layout:', results.smartLayout);
  } catch (error) {
    results.smartLayout = { success: false, error: error.message };
    console.error('✗ Smart Layout failed:', error);
  }

  // Test Tree Layout
  try {
    const treeResult = treeLayout(nodes, edges, 'start-main');
    results.treeLayout = {
      success: true,
      nodeCount: treeResult.nodes.length,
      edgeCount: treeResult.edges.length,
      framesFirst: treeResult.nodes[0]?.type === 'frame',
      condHandlesPreserved: treeResult.edges.filter(e => e.sourceHandle?.startsWith('cond-')).length
    };
    console.log('✓ Tree Layout:', results.treeLayout);
  } catch (error) {
    results.treeLayout = { success: false, error: error.message };
    console.error('✗ Tree Layout failed:', error);
  }

  // Test Compact Layout
  try {
    const compactResult = compactLayout(nodes, edges);
    results.compactLayout = {
      success: true,
      nodeCount: compactResult.nodes.length,
      edgeCount: compactResult.edges.length,
      framesFirst: compactResult.nodes[0]?.type === 'frame',
      condHandlesPreserved: compactResult.edges.filter(e => e.sourceHandle?.startsWith('cond-')).length
    };
    console.log('✓ Compact Layout:', results.compactLayout);
  } catch (error) {
    results.compactLayout = { success: false, error: error.message };
    console.error('✗ Compact Layout failed:', error);
  }

  // Summary
  console.log('\n=== Layout Test Summary ===');
  console.log('Expected: 18 edges total, 3 with cond- handles');
  Object.entries(results).forEach(([layout, result]) => {
    if (result.success) {
      console.log(`${layout}: ✓ ${result.nodeCount} nodes, ${result.edgeCount} edges, frames first: ${result.framesFirst}, cond handles: ${result.condHandlesPreserved}`);
    } else {
      console.log(`${layout}: ✗ Failed - ${result.error}`);
    }
  });

  return results;
};

// Run test if this file is executed directly
if (import.meta.env.DEV) {
  (window as any).testLayouts = testAllLayouts;
  console.log('Test layouts available: Run testLayouts() in console');
}