import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  applyUltimateLayout, 
  logLayoutVisualization,
  type LayoutMode 
} from '../utils/ultimateAutoLayout';
import { LayoutDebugPanel } from '../components/LayoutDebugPanel';
import { 
  Play, 
  RefreshCw, 
  Bug, 
  Shuffle,
  Grid,
  GitBranch,
  Maximize,
  Layers,
  Circle
} from 'lucide-react';

// Test-Szenarien
const testScenarios = {
  linear: {
    name: 'Linear Flow',
    nodes: [
      { id: '1', type: 'start', position: { x: 100, y: 100 }, data: { label: 'Start' } },
      { id: '2', type: 'screen', position: { x: 100, y: 200 }, data: { label: 'Login' } },
      { id: '3', type: 'screen', position: { x: 100, y: 300 }, data: { label: 'Dashboard' } },
      { id: '4', type: 'screen', position: { x: 100, y: 400 }, data: { label: 'Profile' } },
      { id: '5', type: 'end', position: { x: 100, y: 500 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4' },
      { id: 'e4-5', source: '4', target: '5' },
    ],
  },
  branching: {
    name: 'Branching Flow',
    nodes: [
      { id: '1', type: 'start', position: { x: 250, y: 0 }, data: { label: 'Start' } },
      { id: '2', type: 'decision', position: { x: 250, y: 100 }, data: { label: 'Auth Check' } },
      { id: '3', type: 'screen', position: { x: 100, y: 200 }, data: { label: 'Login' } },
      { id: '4', type: 'screen', position: { x: 400, y: 200 }, data: { label: 'Dashboard' } },
      { id: '5', type: 'screen', position: { x: 250, y: 300 }, data: { label: 'Home' } },
      { id: '6', type: 'end', position: { x: 250, y: 400 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3', label: 'Not Authenticated' },
      { id: 'e2-4', source: '2', target: '4', label: 'Authenticated' },
      { id: 'e3-5', source: '3', target: '5' },
      { id: 'e4-5', source: '4', target: '5' },
      { id: 'e5-6', source: '5', target: '6' },
    ],
  },
  complex: {
    name: 'Complex Network',
    nodes: [
      { id: '1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: '2', type: 'screen', position: { x: 150, y: 0 }, data: { label: 'Welcome' } },
      { id: '3', type: 'decision', position: { x: 300, y: 0 }, data: { label: 'User Type' } },
      { id: '4', type: 'screen', position: { x: 150, y: 150 }, data: { label: 'Admin Panel' } },
      { id: '5', type: 'screen', position: { x: 450, y: 150 }, data: { label: 'User Dashboard' } },
      { id: '6', type: 'action', position: { x: 0, y: 300 }, data: { label: 'Settings' } },
      { id: '7', type: 'action', position: { x: 150, y: 300 }, data: { label: 'Reports' } },
      { id: '8', type: 'action', position: { x: 300, y: 300 }, data: { label: 'Analytics' } },
      { id: '9', type: 'screen', position: { x: 450, y: 300 }, data: { label: 'Profile' } },
      { id: '10', type: 'end', position: { x: 300, y: 450 }, data: { label: 'Logout' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e2-3', source: '2', target: '3' },
      { id: 'e3-4', source: '3', target: '4', label: 'Admin' },
      { id: 'e3-5', source: '3', target: '5', label: 'User' },
      { id: 'e4-6', source: '4', target: '6' },
      { id: 'e4-7', source: '4', target: '7' },
      { id: 'e4-8', source: '4', target: '8' },
      { id: 'e5-9', source: '5', target: '9' },
      { id: 'e6-10', source: '6', target: '10' },
      { id: 'e7-10', source: '7', target: '10' },
      { id: 'e8-10', source: '8', target: '10' },
      { id: 'e9-10', source: '9', target: '10' },
    ],
  },
  tree: {
    name: 'Tree Structure',
    nodes: [
      { id: 'root', type: 'start', position: { x: 300, y: 0 }, data: { label: 'Root' } },
      { id: 'a1', type: 'screen', position: { x: 150, y: 100 }, data: { label: 'Branch A' } },
      { id: 'b1', type: 'screen', position: { x: 450, y: 100 }, data: { label: 'Branch B' } },
      { id: 'a2', type: 'action', position: { x: 50, y: 200 }, data: { label: 'Leaf A1' } },
      { id: 'a3', type: 'action', position: { x: 150, y: 200 }, data: { label: 'Leaf A2' } },
      { id: 'a4', type: 'action', position: { x: 250, y: 200 }, data: { label: 'Leaf A3' } },
      { id: 'b2', type: 'action', position: { x: 350, y: 200 }, data: { label: 'Leaf B1' } },
      { id: 'b3', type: 'action', position: { x: 450, y: 200 }, data: { label: 'Leaf B2' } },
      { id: 'b4', type: 'action', position: { x: 550, y: 200 }, data: { label: 'Leaf B3' } },
    ],
    edges: [
      { id: 'e-root-a1', source: 'root', target: 'a1' },
      { id: 'e-root-b1', source: 'root', target: 'b1' },
      { id: 'e-a1-a2', source: 'a1', target: 'a2' },
      { id: 'e-a1-a3', source: 'a1', target: 'a3' },
      { id: 'e-a1-a4', source: 'a1', target: 'a4' },
      { id: 'e-b1-b2', source: 'b1', target: 'b2' },
      { id: 'e-b1-b3', source: 'b1', target: 'b3' },
      { id: 'e-b1-b4', source: 'b1', target: 'b4' },
    ],
  },
  messy: {
    name: 'Messy Layout (Needs Fix)',
    nodes: [
      { id: '1', type: 'start', position: { x: 423, y: 178 }, data: { label: 'Start' } },
      { id: '2', type: 'screen', position: { x: 127, y: 298 }, data: { label: 'Screen 1' } },
      { id: '3', type: 'screen', position: { x: 512, y: 89 }, data: { label: 'Screen 2' } },
      { id: '4', type: 'decision', position: { x: 234, y: 412 }, data: { label: 'Decision' } },
      { id: '5', type: 'action', position: { x: 678, y: 234 }, data: { label: 'Action 1' } },
      { id: '6', type: 'action', position: { x: 89, y: 567 }, data: { label: 'Action 2' } },
      { id: '7', type: 'screen', position: { x: 345, y: 123 }, data: { label: 'Screen 3' } },
      { id: '8', type: 'end', position: { x: 456, y: 489 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e1-3', source: '1', target: '3' },
      { id: 'e2-4', source: '2', target: '4' },
      { id: 'e3-5', source: '3', target: '5' },
      { id: 'e4-6', source: '4', target: '6' },
      { id: 'e4-7', source: '4', target: '7' },
      { id: 'e5-8', source: '5', target: '8' },
      { id: 'e6-8', source: '6', target: '8' },
      { id: 'e7-8', source: '7', target: '8' },
    ],
  },
  withFrames: {
    name: 'Layout with Frames',
    nodes: [
      { id: 'start', type: 'start', position: { x: 50, y: 50 }, data: { label: 'Start' } },
      { id: 'frame1', type: 'frame', position: { x: 200, y: 100 }, width: 400, height: 300, data: { label: 'User Flow' }, style: { backgroundColor: 'rgba(200, 200, 255, 0.1)' } },
      { id: 'login', type: 'screen', position: { x: 220, y: 150 }, data: { label: 'Login' } },
      { id: 'auth', type: 'decision', position: { x: 220, y: 250 }, data: { label: 'Authenticate' } },
      { id: 'dashboard', type: 'screen', position: { x: 400, y: 150 }, data: { label: 'Dashboard' } },
      { id: 'profile', type: 'screen', position: { x: 400, y: 250 }, data: { label: 'Profile' } },
      { id: 'frame2', type: 'frame', position: { x: 200, y: 450 }, width: 400, height: 200, data: { label: 'Admin Area' }, style: { backgroundColor: 'rgba(255, 200, 200, 0.1)' } },
      { id: 'admin', type: 'screen', position: { x: 250, y: 500 }, data: { label: 'Admin Panel' } },
      { id: 'settings', type: 'action', position: { x: 450, y: 500 }, data: { label: 'Settings' } },
      { id: 'end', type: 'end', position: { x: 700, y: 350 }, data: { label: 'End' } },
    ],
    edges: [
      { id: 'e-start-login', source: 'start', target: 'login' },
      { id: 'e-login-auth', source: 'login', target: 'auth' },
      { id: 'e-auth-dashboard', source: 'auth', target: 'dashboard' },
      { id: 'e-auth-profile', source: 'auth', target: 'profile' },
      { id: 'e-dashboard-admin', source: 'dashboard', target: 'admin' },
      { id: 'e-admin-settings', source: 'admin', target: 'settings' },
      { id: 'e-dashboard-end', source: 'dashboard', target: 'end' },
      { id: 'e-profile-end', source: 'profile', target: 'end' },
      { id: 'e-settings-end', source: 'settings', target: 'end' },
    ],
  },
};

const layoutModes: { value: LayoutMode; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'smart', label: 'Smart', icon: Shuffle },
  { value: 'vertical', label: 'Vertical', icon: Layers },
  { value: 'horizontal', label: 'Horizontal', icon: Maximize },
  { value: 'compact', label: 'Compact', icon: Grid },
  { value: 'tree', label: 'Tree', icon: GitBranch },
  { value: 'radial', label: 'Radial', icon: Circle },
];

export default function LayoutTestPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(testScenarios.linear.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(testScenarios.linear.edges);
  const [selectedScenario, setSelectedScenario] = useState('linear');
  const [selectedMode, setSelectedMode] = useState<LayoutMode>('smart');
  const [debugMode, setDebugMode] = useState(true);
  const [visualization, setVisualization] = useState<any>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Lade Szenario
  const loadScenario = useCallback((scenarioKey: string) => {
    const scenario = testScenarios[scenarioKey as keyof typeof testScenarios];
    if (scenario) {
      setNodes(scenario.nodes);
      setEdges(scenario.edges);
      setSelectedScenario(scenarioKey);
      setVisualization(null);
    }
  }, [setNodes, setEdges]);

  // Wende Layout an
  const applyLayout = useCallback(() => {
    const result = applyUltimateLayout(nodes, edges, {
      mode: selectedMode,
      debugMode,
      nodeSpacing: 100,
      rankSpacing: 150,
    });

    setNodes(result.nodes);
    setEdges(result.edges);

    if (result.visualization) {
      setVisualization(result.visualization);
      if (debugMode) {
        logLayoutVisualization(result.visualization);
        setShowDebugPanel(true);
      }
    }
  }, [nodes, edges, selectedMode, debugMode, setNodes, setEdges]);

  // Randomisiere Positionen
  const randomizePositions = useCallback(() => {
    const randomizedNodes = nodes.map(node => ({
      ...node,
      position: {
        x: Math.random() * 600,
        y: Math.random() * 400,
      },
    }));
    setNodes(randomizedNodes);
    setVisualization(null);
  }, [nodes, setNodes]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">Layout Algorithm Test</h1>
            
            {/* Scenario Selector */}
            <select
              value={selectedScenario}
              onChange={(e) => loadScenario(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(testScenarios).map(([key, scenario]) => (
                <option key={key} value={key}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Debug Mode Toggle */}
            <button
              onClick={() => setDebugMode(!debugMode)}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                debugMode 
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Bug className="w-4 h-4" />
              Debug {debugMode ? 'ON' : 'OFF'}
            </button>

            {/* Show Debug Panel */}
            {visualization && (
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {showDebugPanel ? 'Hide' : 'Show'} Debug Panel
              </button>
            )}
          </div>
        </div>

        {/* Layout Controls */}
        <div className="mt-4 flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {layoutModes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setSelectedMode(value)}
                className={`px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                  selectedMode === value
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title={label}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 ml-4">
            <button
              onClick={applyLayout}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Apply Layout
            </button>

            <button
              onClick={randomizePositions}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Randomize
            </button>
          </div>

          {/* Score Display */}
          {visualization && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-gray-600">Layout Score:</span>
              <span className={`text-xl font-bold ${
                visualization.layoutScore >= 80 ? 'text-green-600' :
                visualization.layoutScore >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {visualization.layoutScore}/100
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap />
        </ReactFlow>

        {/* Debug Panel */}
        <LayoutDebugPanel
          visualization={visualization}
          isOpen={showDebugPanel}
          onClose={() => setShowDebugPanel(false)}
        />
      </div>
    </div>
  );
}