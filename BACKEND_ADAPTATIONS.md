# Backend Adaptations for New Frontend Structure

## Overview
This document outlines the necessary backend changes to support the new UX Flow Engine frontend with its enhanced canvas capabilities.

## 1. Data Model Updates

### Flow Document Structure (.uxflow format)
The flow-service needs to support the new UXFlowDocument structure:

```javascript
{
  metadata: {
    flowName: string,
    version: string,
    description?: string,
    createdAt: string,
    updatedAt: string,
    author?: string,
    tags?: string[],
    personas?: Array<{
      id: string,
      name: string,
      description: string,
      color: string
    }>,
    globalSettings?: {
      gridSize?: number,
      snapToGrid?: boolean,
      theme?: 'light' | 'dark',
      showMinimap?: boolean,
      showControls?: boolean
    }
  },
  nodes: Array<{
    id: string,
    type: 'start' | 'end' | 'screen' | 'decision' | 'condition' | 'action' | 'note' | 'subflow' | 'frame',
    title: string,
    description?: string,
    position: { x: number, y: number },
    size?: { width: number, height: number },
    style?: object,
    personaIds?: string[],
    uiMetadata?: {
      figmaLink?: string,
      screenshot?: string,
      annotations?: array,
      variants?: array,
      responsiveVersion?: string,
      completionStatus?: string
    },
    parentFrameId?: string,
    data?: object
  }>,
  edges: Array<{
    id: string,
    source: string,
    target: string,
    sourceHandle?: string,
    targetHandle?: string,
    label?: string,
    type?: string,
    style?: object,
    animated?: boolean
  }>,
  frames?: Array<{
    id: string,
    title: string,
    position: object,
    size: object,
    style?: object,
    containedNodes: string[],
    parentFrameId?: string
  }>
}
```

## 2. New AI Agent Commands

### Architect Agent Updates
The Architect Agent needs new atomic commands:

```javascript
// New commands for cognitive-core/src/agents/architect.js
const ARCHITECT_COMMANDS = {
  // Node operations
  ADD_NODE: {
    params: { type, title, position, parentFrameId?, personaIds? }
  },
  UPDATE_NODE: {
    params: { nodeId, updates }
  },
  DELETE_NODE: {
    params: { nodeId }
  },
  
  // Edge operations
  ADD_EDGE: {
    params: { source, target, label?, type?, sourceHandle?, targetHandle? }
  },
  UPDATE_EDGE: {
    params: { edgeId, updates }
  },
  DELETE_EDGE: {
    params: { edgeId }
  },
  
  // Frame operations
  ADD_FRAME: {
    params: { title, position, size, containedNodes }
  },
  UPDATE_FRAME: {
    params: { frameId, updates }
  },
  GROUP_NODES: {
    params: { nodeIds, frameTitle }
  },
  
  // Figma integration
  LINK_FIGMA: {
    params: { nodeId, figmaLink, screenshot? }
  },
  UPDATE_VARIANT: {
    params: { nodeId, variantId, screenshot }
  },
  
  // Persona management
  ASSIGN_PERSONA: {
    params: { nodeId, personaId }
  },
  CREATE_PERSONA: {
    params: { name, description, color }
  },
  
  // Layout operations
  UPDATE_LAYOUT: {
    params: { algorithm: 'hierarchical' | 'force' | 'circular' }
  },
  ALIGN_NODES: {
    params: { nodeIds, alignment: 'horizontal' | 'vertical' | 'grid' }
  }
};
```

## 3. New API Endpoints

### Flow Service Extensions

```javascript
// flow-service/src/routes/flows.js

// Get flow in new format
GET /api/flows/:flowId/uxflow

// Update flow metadata
PATCH /api/flows/:flowId/metadata
Body: { metadata updates }

// Manage frames
POST /api/flows/:flowId/frames
Body: { frame data }

PATCH /api/flows/:flowId/frames/:frameId
Body: { frame updates }

DELETE /api/flows/:flowId/frames/:frameId

// Manage personas
POST /api/flows/:flowId/personas
Body: { persona data }

DELETE /api/flows/:flowId/personas/:personaId

// Export flow
GET /api/flows/:flowId/export?format=json|pdf|figma

// Import flow
POST /api/flows/import
Body: { flow document }
```

### Figma Integration Service

```javascript
// New service: services/figma-service

// Generate Figma structure
POST /api/figma/generate
Body: { flowId, nodes }
Response: { figmaProjectUrl, frameMapping }

// Link Figma design
POST /api/figma/link
Body: { nodeId, figmaLink, screenshot }

// Get design status
GET /api/figma/status/:flowId
Response: { nodes with completion status }

// Sync screenshots
POST /api/figma/sync/:flowId
Body: { screenshots array }
```

## 4. WebSocket Events Updates

### New Event Types

```javascript
// packages/common/src/events/event-types.js

export const EventTypes = {
  // Existing events...
  
  // Frame events
  FRAME_CREATED: 'frame:created',
  FRAME_UPDATED: 'frame:updated',
  FRAME_DELETED: 'frame:deleted',
  
  // Ghost mode events
  GHOST_PROPOSAL_CREATED: 'ghost:proposal:created',
  GHOST_PROPOSAL_APPLIED: 'ghost:proposal:applied',
  GHOST_PROPOSAL_REJECTED: 'ghost:proposal:rejected',
  GHOST_PROPOSAL_MODIFIED: 'ghost:proposal:modified',
  
  // Figma events
  FIGMA_DESIGN_LINKED: 'figma:design:linked',
  FIGMA_SCREENSHOT_UPDATED: 'figma:screenshot:updated',
  
  // Persona events
  PERSONA_FILTER_CHANGED: 'persona:filter:changed',
  
  // Collaboration events
  NODE_LOCKED: 'collab:node:locked',
  NODE_UNLOCKED: 'collab:node:unlocked',
  COMMENT_ADDED: 'collab:comment:added'
};
```

## 5. AI Agent Enhancements

### Manager Agent Updates
```javascript
// cognitive-core/src/agents/manager.js

// New delegation logic for frame-aware operations
delegateToArchitect(task) {
  // Consider frame context when delegating
  // Handle group operations
  // Manage layout suggestions
}
```

### New Visual Interpreter Capabilities
```javascript
// cognitive-core/src/agents/visual-interpreter.js

// Analyze Figma screenshots
analyzeScreenshot(screenshot) {
  // Extract UI elements
  // Identify patterns
  // Suggest improvements
}

// Generate screen variants
suggestVariants(screenNode) {
  // Return loading, error, success, empty states
}
```

## 6. Database Schema Updates

### MongoDB Collections

```javascript
// flows collection - extended schema
{
  _id: ObjectId,
  projectId: string,
  userId: string,
  workspaceId: string,
  document: {
    // Full UXFlowDocument structure
  },
  collaborators: [{
    userId: string,
    role: 'owner' | 'editor' | 'viewer',
    lastActive: Date
  }],
  figmaIntegration: {
    projectId: string,
    lastSync: Date,
    screenshots: Map
  },
  version: string,
  history: [{
    version: string,
    timestamp: Date,
    changes: object,
    userId: string
  }],
  createdAt: Date,
  updatedAt: Date
}

// New: flow-templates collection
{
  _id: ObjectId,
  name: string,
  category: string,
  description: string,
  thumbnail: string,
  document: object,
  tags: [string],
  usageCount: number,
  rating: number,
  createdBy: string,
  isPublic: boolean
}
```

## 7. Security & Validation

### Input Validation Updates
```javascript
// flow-service/src/middleware/validation.js

const nodeValidationSchema = Joi.object({
  type: Joi.string().valid(
    'start', 'end', 'screen', 'decision', 
    'condition', 'action', 'note', 'subflow', 'frame'
  ).required(),
  title: Joi.string().max(100).required(),
  position: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required()
  }).required(),
  size: Joi.object({
    width: Joi.number().min(50).max(500),
    height: Joi.number().min(30).max(300)
  }).optional(),
  // ... additional validation
});
```

## 8. Performance Optimizations

### Caching Strategy
```javascript
// Redis caching for flow documents
CACHE_KEY_PATTERNS = {
  FLOW_DOCUMENT: 'flow:doc:{flowId}',
  FLOW_FRAMES: 'flow:frames:{flowId}',
  FLOW_PERSONAS: 'flow:personas:{flowId}',
  FIGMA_SCREENSHOTS: 'figma:screenshots:{flowId}'
};

// Implement partial updates
// Only send changed nodes/edges via WebSocket
// Use diff algorithms for version history
```

## 9. Migration Strategy

### Phase 1: Backend Preparation
1. Update data models to support new format
2. Create migration scripts for existing flows
3. Implement new API endpoints
4. Update WebSocket handlers

### Phase 2: AI Integration
1. Update Architect Agent with new commands
2. Enhance Visual Interpreter for screenshots
3. Implement ghost mode proposal system
4. Add layout optimization algorithms

### Phase 3: Figma Integration
1. Create Figma service
2. Implement screenshot storage (S3/CloudFlare R2)
3. Build sync mechanisms
4. Add completion tracking

### Phase 4: Optimization
1. Implement caching layers
2. Optimize WebSocket message batching
3. Add database indexes for new fields
4. Performance testing with large flows (1000+ nodes)

## 10. Testing Requirements

### New Test Cases
- Frame operations (create, update, group)
- Condition nodes with multiple outputs
- Persona filtering
- Ghost mode proposals
- Figma integration flow
- Large flow performance (> 500 nodes)
- Concurrent editing scenarios

## Implementation Priority

1. **High Priority** (Week 1)
   - Update flow document structure
   - Add new node types (condition, frame)
   - Implement frame operations
   - Update validation schemas

2. **Medium Priority** (Week 2)
   - AI agent command updates
   - Ghost mode backend support
   - Persona management
   - WebSocket event updates

3. **Low Priority** (Week 3+)
   - Figma integration service
   - Template system
   - Advanced layout algorithms
   - Performance optimizations