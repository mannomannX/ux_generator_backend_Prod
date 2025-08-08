# 📋 NEW_BACKLOG.md - UX-Flow-Engine v4.0 Implementation Plan

## 🎯 Project Goals

Transform UX-Flow-Engine into a complete product ecosystem with:
1. **Visual Flow Editor**: Interactive canvas-based UI replacing Mermaid.js
2. **Figma Integration**: Bi-directional sync between designs and flows
3. **Real-time Collaboration**: Multi-user editing with presence awareness
4. **AI-Powered Assistance**: Smart flow generation with interactive preview
5. **Enterprise Deployment**: Scalable, secure, production-ready platform

## 🏗️ Confirmed Architecture

### Monorepo Structure (Turborepo) ✅
```
ux-flow-engine/
├── apps/
│   ├── web/                    # Main app (React SPA + Vite)
│   ├── landing/                # Marketing site (Next.js for SEO)
│   ├── figma-plugin/           # Figma plugin (React + Figma API)
│   └── admin/                  # Admin dashboard (Post-MVP)
├── packages/
│   ├── ui/                     # Shared UI components (Radix UI + Tailwind)
│   ├── canvas/                 # Flow canvas engine (React Flow)
│   ├── api-client/             # TypeScript API client
│   ├── types/                  # Shared TypeScript types
│   ├── config/                 # Shared configurations
│   ├── common/                 # Common utilities (migrated)
│   └── realtime/               # WebSocket client with debouncing
├── services/                   # Backend microservices
│   ├── api-gateway/
│   ├── cognitive-core/
│   ├── flow-service/
│   ├── knowledge-service/
│   ├── user-management/
│   ├── billing-service/        # NEW: Subscriptions, usage, payments
│   └── migrator-service/       # NEW: Mermaid to Canvas migration
├── infrastructure/
│   ├── docker/                 # Docker configurations
│   ├── vercel/                 # Vercel config
│   └── railway/                # Railway config
└── tools/                      # Development tools

### Deployment Strategy (Confirmed)

#### All Environments (Vercel + Railway)
- **Web App**: Vercel (React SPA - static deployment)
- **Landing Page**: Vercel (Next.js - SSR for SEO)
- **Backend**: Railway (microservices with Redis/MongoDB Atlas)
- **Storage**: S3/GCS with CDN for screenshots (1MB WebP limit)
- **Database**: MongoDB Atlas
- **Payments**: Stripe/Paddle integration
- **Benefits**: Zero-config, automatic SSL, preview environments

## 📦 Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] **TASK-001**: Setup Turborepo monorepo structure
- [ ] **TASK-002**: Migrate existing services to monorepo
- [ ] **TASK-003**: Create shared packages structure
- [ ] **TASK-004**: Setup CI/CD pipeline with GitHub Actions
- [ ] **TASK-005**: Configure development environment (Docker Compose)
- [ ] **TASK-006**: Create billing-service microservice
- [ ] **TASK-007**: Setup Stripe/Paddle integration

### Phase 2: Canvas Engine (Weeks 3-5)
- [ ] **TASK-006**: Implement custom canvas engine with React Flow
  - Replace Mermaid.js completely
  - Support for nodes: Screen, Decision, Action, Note, SubFlow, Start, End
  - Custom node rendering with rich content
  - Smooth pan/zoom with performance optimization
- [ ] **TASK-007**: Implement node types and styling system
- [ ] **TASK-008**: Create edge routing algorithm (smart paths)
- [ ] **TASK-009**: Add interaction handlers (drag, select, multi-select)
- [ ] **TASK-010**: Implement frame-based organization system

### Phase 3: Core Frontend (Weeks 6-8)
- [ ] **TASK-011**: Setup React SPA with Vite and React Router
- [ ] **TASK-012**: Implement authentication flow (JWT + OAuth)
- [ ] **TASK-013**: Create workspace/project management UI
- [ ] **TASK-014**: Build AI chat interface (sidebar)
- [ ] **TASK-015**: Implement Ghost Mode for AI proposals
- [ ] **TASK-016**: Setup debouncing/batching for real-time updates
  - Semi-transparent preview nodes
  - Interactive manipulation before applying
  - Confirmation modal with diff view

### Phase 4: Data Model v3.0 (Week 9)
- [ ] **TASK-016**: Update Flow Service for new schema
  ```typescript
  interface UXFlowV3 {
    version: "3.0.0";
    frames: Record<string, Frame>;
    nodes: NodeV3[];  // with frameId, isPinned, uiMetadata
    edges: Edge[];
    comments: Comment[];
    metadata: {
      personas: Persona[];
      userGoals: UserGoal[];
    };
  }
  ```
- [ ] **TASK-017**: Implement new atomic actions
  - ADD_FRAME, DELETE_FRAME
  - UPDATE_NODE_LAYOUT (respects isPinned)
  - LINK_FIGMA, ADD_ANNOTATION
  - ASSIGN_PERSONA, UPDATE_METADATA
- [ ] **TASK-018**: Create migration scripts for existing flows

### Phase 5: Real-time Collaboration (Weeks 10-11)
- [ ] **TASK-019**: Implement WebSocket presence system
- [ ] **TASK-020**: Create cursor tracking and display
- [ ] **TASK-021**: Build conflict-free replicated data types (CRDT) for collaboration
- [ ] **TASK-022**: Add user avatars and activity indicators
- [ ] **TASK-023**: Implement collaborative selection and editing

### Phase 6: Figma Plugin (Weeks 12-14)
- [ ] **TASK-024**: Setup Figma plugin development environment
- [ ] **TASK-025**: Create authentication flow with API keys
- [ ] **TASK-026**: Implement "Scaffold" feature
  - Generate Figma frames from flow nodes
  - Support responsive versions
- [ ] **TASK-027**: Build "Connect" workflow
  - Link Figma frames to flow nodes
  - Screenshot capture and sync
- [ ] **TASK-028**: Add checklist overlay system
- [ ] **TASK-029**: Implement UPDATE_SCREENSHOT functionality

### Phase 7: AI Enhancement (Weeks 15-16)
- [ ] **TASK-030**: Update Cognitive Core agents for new data model
- [ ] **TASK-031**: Implement Visual Interpreter Agent
  - Process Figma screenshots
  - Extract UI elements
  - Generate annotations
- [ ] **TASK-032**: Create flow validation system
- [ ] **TASK-033**: Build smart layout algorithm (respecting pinned nodes)

### Phase 8: Advanced Features (Weeks 17-19)
- [ ] **TASK-034**: Implement Present Mode
  - Clean presentation view
  - Live Figma screenshot previews
  - Full-screen node view with annotations
- [ ] **TASK-035**: Build comment system
  - Thread-based discussions
  - @mentions and notifications
  - Resolution tracking
- [ ] **TASK-036**: Create persona/goal filtering
  - Visual filtering by persona
  - Path highlighting by user goal
- [ ] **TASK-037**: Add version control UI
  - Visual diff between versions
  - Branching and merging

### Phase 9: Performance & Polish (Weeks 20-21)
- [ ] **TASK-038**: Optimize canvas rendering for 1000+ nodes
  - Virtual scrolling
  - Level-of-detail rendering
  - WebGL acceleration (if needed)
- [ ] **TASK-039**: Implement progressive data loading
- [ ] **TASK-040**: Add offline support with IndexedDB
- [ ] **TASK-041**: Create onboarding flow and tutorials
- [ ] **TASK-042**: Build keyboard shortcuts system

### Phase 10: Deployment & Launch (Weeks 22-24)
- [ ] **TASK-043**: Setup production infrastructure
- [ ] **TASK-044**: Configure monitoring and alerting
- [ ] **TASK-045**: Implement analytics and telemetry
- [ ] **TASK-046**: Create documentation site
- [ ] **TASK-047**: Setup customer support tools
- [ ] **TASK-048**: Launch beta program

## 🔧 Technical Decisions

### Frontend Stack (Confirmed - Updated)
```typescript
{
  framework: "React 18 + Vite",      // Better for canvas apps
  router: "React Router v6",         // Client-side routing
  ui: "Radix UI + Tailwind CSS",
  canvas: "React Flow",
  state: "Zustand",
  realtime: "Socket.io-client",
  debouncing: "Custom batching (100ms)", // Prevent excessive updates
  forms: "React Hook Form + Zod",
  testing: "Vitest + Playwright",
  analytics: "Internal + Sentry",
  monitoring: "DataDog"
}
```

### Real-time Update Strategy
```typescript
{
  mouseMove: "Throttle 50ms",        // Cursor position
  nodePosition: "Debounce 100ms",    // Node dragging
  textEditing: "Debounce 500ms",     // Text changes
  bulkOperations: "Immediate",       // Add/delete nodes
  autoSave: "Every 5 seconds",        // Background save
}
```

### Canvas Engine (Confirmed: React Flow)
- Rich built-in features (drag-drop, zoom, pan)
- Performance optimization via data diffs
- Virtualization for large flows
- Max 500 nodes per frame
- Migration to custom solution if performance limits reached

### Figma Plugin Stack (Confirmed)
```typescript
{
  framework: "React 18",
  bundler: "Webpack 5",
  api: "Figma Plugin API",
  ui: "Figma Plugin DS",
  auth: "API Key (workspace-bound)",
  storage: "S3/GCS with CDN",
  imageFormat: "WebP (1MB max)",
  sync: "One-way (Figma → Editor)"
}
```

## 📊 Success Metrics

### Performance Targets (Confirmed)
- Canvas FPS: 30fps minimum with 500 nodes per frame
- Initial load: < 3 seconds
- API response: < 200ms (p95)
- WebSocket latency: < 100ms
- First year: Support 50,000 active users
- Test coverage: 80% unit, 100% critical E2E

### User Experience Goals
- Time to first flow: < 5 minutes
- Figma sync time: < 2 seconds
- Collaboration lag: < 500ms

## 🚀 MVP Definition (8 weeks - Confirmed)

### Core Features for MVP
1. ✅ Canvas-based flow editor with React Flow
2. ✅ Auto-migration from Mermaid.js on first load
3. ✅ Node types: Screen, Decision, Action, Note, SubFlow, Start, End
4. ✅ AI chat with ghost mode (partial acceptance, 15min expiry)
5. ✅ Figma plugin with API key auth (connect workflow)
6. ✅ Real-time collaboration (cursors, simultaneous editing)
7. ✅ Workspace management with SSO for enterprise
8. ✅ Dark/Light mode support

### Post-MVP Priority Order
1. Present mode (easy, high value)
2. Comment system (critical for collaboration)
3. Version control UI
4. Advanced Figma features
5. Persona filtering

### Pricing Model (Confirmed)
- **Free**: 3 flows, 100 AI requests/month, 1 user
- **Pro**: Unlimited flows, 1000 AI requests/month, 5 users
- **Trial**: 14 days free, no credit card required

## 📈 Migration Strategy

### From Mermaid.js to Canvas
1. **Phase 1**: Dual rendering (keep Mermaid as fallback)
2. **Phase 2**: Canvas as primary, Mermaid for export only
3. **Phase 3**: Complete removal of Mermaid.js

### Data Migration
1. Convert existing flows to v3.0 format
2. Auto-generate frames from flat structure
3. Preserve all existing metadata

## 🔄 Development Workflow

### Branch Strategy
```
main
├── develop
│   ├── feature/monorepo-setup
│   ├── feature/canvas-engine
│   ├── feature/figma-plugin
│   ├── feature/realtime-collab
│   └── feature/migrator-service
└── release/v4.0
```

### Release Cycle
- **Sprint Duration**: 2 weeks
- **Release Frequency**: Continuous (with feature flags)
- **Preview Deployments**: Vercel (per PR)
- **Production Deployment**: Zero-downtime via Railway
- **Backwards Compatibility**: 6 months minimum

## 📝 Risk Mitigation

### Technical Risks
1. **Canvas Performance**: Mitigate with virtual scrolling and LOD
2. **Real-time Sync**: Use CRDT algorithms for conflict resolution
3. **Figma API Limits**: Implement rate limiting and caching

### Business Risks
1. **User Migration**: Provide migration tools and tutorials
2. **Feature Parity**: Ensure all Mermaid features work in canvas
3. **Learning Curve**: Create interactive onboarding

## 🎯 Definition of Done

### Feature Complete
- [ ] All user stories implemented
- [ ] Unit tests > 80% coverage
- [ ] E2E tests for critical paths
- [ ] Performance benchmarks met
- [ ] Accessibility WCAG 2.1 AA
- [ ] Documentation complete
- [ ] Security review passed

### Production Ready
- [ ] Load testing passed (1000 concurrent users)
- [ ] Security penetration testing complete
- [ ] Monitoring and alerting configured
- [ ] Backup and disaster recovery tested
- [ ] GDPR compliance verified

---

**Next Steps**: Review OPEN_QUESTIONS.md for clarifications needed before starting implementation.