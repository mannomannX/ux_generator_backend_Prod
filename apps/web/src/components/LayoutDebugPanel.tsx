import React from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface NodePosition {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

interface CollisionInfo {
  type: 'node-node' | 'edge-node' | 'edge-edge';
  item1: string;
  item2: string;
  overlapArea?: number;
}

interface LayoutVisualization {
  nodePositions: NodePosition[];
  collisions: CollisionInfo[];
  edgeRoutes: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
    path: { x: number; y: number }[];
  }>;
  layoutScore: number;
  debugInfo: string;
}

interface LayoutDebugPanelProps {
  visualization: LayoutVisualization | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LayoutDebugPanel: React.FC<LayoutDebugPanelProps> = ({
  visualization,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !visualization) return null;

  const hasCollisions = visualization.collisions.length > 0;
  const scoreColor = visualization.layoutScore >= 80 ? 'text-green-600' : 
                     visualization.layoutScore >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="absolute top-20 right-4 w-96 max-h-[80vh] bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Layout Debug Info</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
        {/* Score Section */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Layout Score</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${scoreColor}`}>
                {visualization.layoutScore}
              </span>
              <span className="text-sm text-gray-500">/100</span>
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                visualization.layoutScore >= 80 ? 'bg-green-500' :
                visualization.layoutScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${visualization.layoutScore}%` }}
            />
          </div>
        </div>

        {/* Collisions Section */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            {hasCollisions ? (
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-600" />
            )}
            <span className="text-sm font-medium text-gray-700">
              Collisions ({visualization.collisions.length})
            </span>
          </div>
          {hasCollisions ? (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {visualization.collisions.map((collision, idx) => (
                <div
                  key={idx}
                  className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2"
                >
                  <div className="font-medium text-yellow-800">
                    {collision.type}
                  </div>
                  <div className="text-yellow-700">
                    {collision.item1} ↔ {collision.item2}
                    {collision.overlapArea && (
                      <span className="ml-2 text-yellow-600">
                        ({Math.round(collision.overlapArea)}px²)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-green-600">
              ✓ No collisions detected
            </div>
          )}
        </div>

        {/* Node Positions */}
        <div className="p-4 border-b border-gray-100">
          <div className="text-sm font-medium text-gray-700 mb-3">
            Node Positions ({visualization.nodePositions.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {visualization.nodePositions.map((pos) => (
              <div
                key={pos.id}
                className="text-xs font-mono bg-gray-50 rounded p-2 hover:bg-gray-100 transition-colors"
              >
                <div className="font-medium text-gray-800">{pos.id}</div>
                <div className="text-gray-600">
                  [{Math.round(pos.x1)}, {Math.round(pos.y1)}] → 
                  [{Math.round(pos.x2)}, {Math.round(pos.y2)}]
                </div>
                <div className="text-gray-500">
                  Size: {Math.round(pos.width)} × {Math.round(pos.height)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Routes */}
        <div className="p-4">
          <div className="text-sm font-medium text-gray-700 mb-3">
            Edge Routes ({visualization.edgeRoutes.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {visualization.edgeRoutes.map((route) => (
              <div
                key={route.id}
                className="text-xs bg-gray-50 rounded p-2"
              >
                <div className="font-medium text-gray-700">
                  {route.source} → {route.target}
                </div>
                <div className="text-gray-600">
                  Handles: {route.sourceHandle} → {route.targetHandle}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};