export interface UXFlowPosition {
  x: number;
  y: number;
}

export interface UXFlowSize {
  width: number;
  height: number;
}

export interface UXFlowStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  fontSize?: string;
  fontColor?: string;
  fontWeight?: string;
  opacity?: number;
}

export interface UIMetadata {
  figmaLink?: string;
  screenshot?: string;
  annotations?: Array<{
    id: string;
    type: 'arrow' | 'highlight' | 'text';
    coordinates: { x: number; y: number };
    text?: string;
    color?: string;
  }>;
  variants?: Array<{
    id: string;
    name: string;
    type: 'loading' | 'error' | 'success' | 'empty' | 'custom';
    screenshot?: string;
  }>;
  responsiveVersion?: 'desktop' | 'mobile' | 'tablet';
  completionStatus?: 'todo' | 'in-progress' | 'done';
}

export type NodeType = 
  | 'start'
  | 'end'
  | 'screen'
  | 'decision'
  | 'condition'
  | 'action'
  | 'note'
  | 'subflow'
  | 'frame';

export interface UXFlowNode {
  id: string;
  type: NodeType;
  title: string;
  description?: string;
  position: UXFlowPosition;
  size?: UXFlowSize;
  style?: UXFlowStyle;
  personaIds?: string[];
  uiMetadata?: UIMetadata;
  parentFrameId?: string;
  isGhost?: boolean;
  data?: {
    conditions?: Array<{
      id: string;
      label: string;
      targetNodeId?: string;
    }>;
    subflowId?: string;
    frameTitle?: string;
    containedNodes?: string[];
  };
}

export interface UXFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'default' | 'straight' | 'step' | 'smoothstep';
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  };
  isGhost?: boolean;
  animated?: boolean;
}

export interface Frame {
  id: string;
  title: string;
  position: UXFlowPosition;
  size: UXFlowSize;
  style?: UXFlowStyle;
  containedNodes: string[];
  parentFrameId?: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  color: string;
}

export interface UXFlowMetadata {
  flowName: string;
  version: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  author?: string;
  tags?: string[];
  personas?: Persona[];
  globalSettings?: {
    gridSize?: number;
    snapToGrid?: boolean;
    theme?: 'light' | 'dark';
    showMinimap?: boolean;
    showControls?: boolean;
  };
}

export interface UXFlowDocument {
  metadata: UXFlowMetadata;
  nodes: UXFlowNode[];
  edges: UXFlowEdge[];
  frames?: Frame[];
}

export interface AIProposal {
  id: string;
  timestamp: string;
  action: 
    | 'ADD_NODE'
    | 'UPDATE_NODE'
    | 'DELETE_NODE'
    | 'ADD_EDGE'
    | 'UPDATE_EDGE'
    | 'DELETE_EDGE'
    | 'ADD_FRAME'
    | 'UPDATE_LAYOUT';
  payload: any;
  status: 'pending' | 'applied' | 'rejected' | 'modified';
  userFeedback?: string;
}

export interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  position: UXFlowPosition;
  timestamp: number;
}

export interface FlowState {
  document: UXFlowDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  ghostNodes: UXFlowNode[];
  ghostEdges: UXFlowEdge[];
  aiProposals: AIProposal[];
  collaborators: CollaboratorCursor[];
  zoom: number;
  viewport: { x: number; y: number; zoom: number };
  isGhostModeActive: boolean;
  isPresentMode: boolean;
  activePersonaFilter?: string;
  activeResponsiveFilter?: 'desktop' | 'mobile' | 'tablet';
}