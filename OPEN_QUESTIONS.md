# 🤔 OPEN_QUESTIONS.md - Clarifications Needed for v4.0 Implementation

## 🎨 Canvas Engine & UI Questions

### 1. Canvas Technology Choice
**Question**: Should we use React Flow (feature-rich but heavier) or build a custom canvas solution?
- **React Flow Pros**: Faster development, built-in features, good documentation
- **Custom Canvas Pros**: Full control, optimized performance, smaller bundle
- **Recommendation**: Start with React Flow, migrate if performance issues arise

### 2. Mermaid.js Migration
**Question**: How should we handle existing flows created with Mermaid.js?
- **Option A**: Auto-convert all flows to new format on first load
- **Option B**: Keep dual rendering (Mermaid for old, Canvas for new)
- **Option C**: Provide manual migration tool
- **Current flows in production?**: Need to know volume and complexity

### 3. Node Visual Design
**Question**: What level of visual customization should nodes support?
- Icons/emojis in nodes?
- Custom colors per node type?
- Rich text formatting in node content?
- Image/screenshot previews in nodes?

## 🔌 Figma Plugin Questions

### 4. Figma Authentication
**Question**: How should users authenticate from Figma plugin?
- **Option A**: API key generated in web app (current plan)
- **Option B**: OAuth flow from plugin
- **Option C**: Personal access tokens
- **Security implications?**: Need to ensure workspace isolation

### 5. Screenshot Storage
**Question**: Where and how should Figma screenshots be stored?
- S3/Cloud Storage with CDN?
- Maximum file size limits?
- Compression requirements?
- Retention policy for old screenshots?

### 6. Figma Sync Direction
**Question**: Should sync be bi-directional or one-way?
- Can users update flow from Figma changes?
- How to handle conflicts?
- Version control for Figma designs?

## 🏗️ Architecture Questions

### 7. Monorepo Tool Choice
**Question**: Turborepo vs Nx vs Lerna vs Rush?
- **Turborepo**: Vercel's solution, great DX, fast
- **Nx**: More features, steeper learning curve
- **Current preference?**: Turborepo recommended in backlog

### 8. Frontend Framework
**Question**: Confirm Next.js 14 with App Router?
- Any preference for Remix, SvelteKit, or vanilla React?
- SSR requirements?
- SEO important for the application?

### 9. State Management
**Question**: Zustand vs Redux Toolkit vs Jotai?
- Complex state requirements?
- Need for time-travel debugging?
- DevTools importance?

## 👥 Collaboration Questions

### 10. Real-time Collaboration Scope
**Question**: What level of real-time collaboration is needed?
- Live cursors only?
- Simultaneous editing with conflict resolution?
- Voice/video integration?
- Commenting in real-time?

### 11. Conflict Resolution
**Question**: How should we handle editing conflicts?
- Last-write-wins?
- CRDT implementation (Yjs, Automerge)?
- Manual conflict resolution UI?

### 12. Presence Awareness
**Question**: What presence features are required?
- User avatars on canvas?
- "User is typing" indicators?
- User focus indicators?
- Activity timeline?

## 🤖 AI Integration Questions

### 13. Ghost Mode Interaction
**Question**: How should users interact with AI proposals?
- Can they partially accept proposals?
- Should proposals expire?
- Multiple proposals at once?
- Proposal history/undo?

### 14. AI Model Selection
**Question**: Should users choose AI models?
- Expose Gemini Flash vs Pro choice?
- Cost implications visible to users?
- Quality vs speed tradeoff UI?

### 15. Visual Interpreter Agent
**Question**: What should the Visual Interpreter analyze?
- UI element detection?
- Color palette extraction?
- Accessibility issues?
- Design pattern recognition?

## 💾 Data Model Questions

### 16. Frame Organization
**Question**: How should frames work exactly?
- Nested frames allowed?
- Frame templates/presets?
- Frame-level permissions?
- Maximum nodes per frame?

### 17. SubFlow Implementation
**Question**: How deep can subflows nest?
- Circular reference prevention?
- Subflow versioning?
- Shared subflows across projects?

### 18. Migration Strategy
**Question**: How to migrate existing v2.0 flows to v3.0?
- Automatic migration on load?
- Batch migration tool?
- Backwards compatibility period?

## 🚀 Deployment Questions

### 19. Environment Strategy
**Question**: How many environments needed?
- Development (local)
- Staging (Vercel preview?)
- Production (AWS/GCP)
- Customer-specific environments?

### 20. Database Strategy
**Question**: MongoDB Atlas vs self-hosted vs cloud-native?
- MongoDB Atlas (current)?
- Amazon DocumentDB?
- Self-hosted on K8s?
- Data residency requirements?

### 21. Multi-tenancy
**Question**: How should we handle enterprise customers?
- Shared infrastructure with isolation?
- Dedicated deployments?
- Custom domains?
- SSO requirements?

## 💰 Business Model Questions

### 22. Pricing Tiers
**Question**: What features are free vs paid?
- Node/flow limits for free tier?
- Collaboration user limits?
- AI usage quotas?
- Figma plugin free or paid?

### 23. Usage Metering
**Question**: What should we track for billing?
- AI API calls?
- Storage usage?
- Number of flows?
- Active users?

### 24. Trial Strategy
**Question**: How should trials work?
- Time-based (14/30 days)?
- Feature-based?
- Credit-based?

## 📊 Analytics Questions

### 25. User Analytics
**Question**: What analytics are needed?
- Usage patterns tracking?
- Feature adoption metrics?
- Performance monitoring?
- Error tracking (Sentry)?

### 26. Privacy Compliance
**Question**: GDPR/CCPA requirements?
- Data deletion workflows?
- Export capabilities?
- Consent management?
- Cookie policies?

## 🔐 Security Questions

### 27. Authentication Enhancement
**Question**: Should we add more auth methods?
- SSO (SAML, OIDC)?
- Passwordless (magic links)?
- Biometric on mobile?
- 2FA requirement?

### 28. Workspace Isolation
**Question**: Current isolation sufficient?
- Need for stronger boundaries?
- Cross-workspace sharing requirements?
- Guest access patterns?

## 📱 Platform Questions

### 29. Mobile Support
**Question**: Mobile app or responsive web?
- Native apps (React Native)?
- PWA approach?
- Mobile-specific features?
- Offline support requirements?

### 30. Desktop Application
**Question**: Need for desktop app?
- Electron app?
- Tauri (Rust-based)?
- OS-specific features?

## 🧪 Testing Strategy Questions

### 31. Test Coverage Requirements
**Question**: What's the target test coverage?
- Unit tests: 80%? 90%?
- E2E test scenarios?
- Visual regression testing?
- Performance benchmarks?

### 32. QA Process
**Question**: Manual QA needed?
- Dedicated QA team?
- User acceptance testing?
- Beta testing program?

## 📚 Documentation Questions

### 33. Documentation Scope
**Question**: What documentation is needed?
- User documentation?
- API documentation?
- Video tutorials?
- In-app onboarding?

### 34. Developer Experience
**Question**: Open source considerations?
- Plugin SDK?
- API rate limits?
- Webhook support?

## 🎯 MVP Scope Questions

### 35. MVP Feature Set
**Question**: Confirm MVP features (8 weeks)?
- Canvas editor ✅
- Basic AI chat ✅
- Simple Figma connect ✅
- Real-time cursors ✅
- What's the absolute minimum?

### 36. Launch Strategy
**Question**: How to launch?
- Closed beta?
- Public beta?
- ProductHunt launch?
- Existing user migration?

## 🔄 Integration Questions

### 37. Third-party Integrations
**Question**: Which integrations are priority?
- Slack notifications?
- Jira sync?
- GitHub integration?
- Design system imports?

### 38. Export Formats
**Question**: What export options needed?
- PDF generation?
- Image exports (PNG, SVG)?
- Code generation?
- Markdown documentation?

## 🎨 Design System Questions

### 39. Component Library
**Question**: Build vs buy for UI components?
- Radix UI (recommended)?
- Material UI?
- Ant Design?
- Custom design system?

### 40. Theming Support
**Question**: Customization level needed?
- Dark/light mode only?
- Custom brand colors?
- White-label options?
- Full theme customization?

## 🚦 Performance Questions

### 41. Performance Targets
**Question**: Specific performance requirements?
- Maximum flow size (nodes)?
- Concurrent user limit?
- API response time SLA?
- Canvas FPS minimum?

### 42. Scalability Planning
**Question**: Expected growth?
- Users in year 1?
- Data growth projections?
- Geographic distribution?

## 💡 Feature Priority Questions

### 43. Post-MVP Roadmap
**Question**: Priority order for post-MVP features?
1. Present mode?
2. Comments system?
3. Advanced Figma features?
4. Version control UI?
5. Persona filtering?

### 44. Feature Flags
**Question**: Need for feature flag system?
- Gradual rollouts?
- A/B testing?
- Premium feature gates?

## 🔧 Maintenance Questions

### 45. Update Strategy
**Question**: How to handle updates?
- Auto-updates?
- Scheduled maintenance windows?
- Zero-downtime deployments?
- Database migration strategy?

### 46. Backwards Compatibility
**Question**: How long to support old versions?
- API versioning strategy?
- Deprecation timeline?
- Migration tools?

## 📈 Success Metrics Questions

### 47. KPIs
**Question**: What are the key success metrics?
- User activation rate?
- Feature adoption?
- Retention metrics?
- Revenue targets?

### 48. Monitoring Requirements
**Question**: What needs monitoring?
- APM tool (DataDog, New Relic)?
- Log aggregation (ELK, Splunk)?
- Custom dashboards?
- Alerting thresholds?

---

## 🎯 Next Steps

Once these questions are answered:

1. **Update NEW_BACKLOG.md** with specific implementation details
2. **Create technical specification documents** for each epic
3. **Set up monorepo structure** with chosen tooling
4. **Begin Phase 1 implementation** (Foundation - Weeks 1-2)
5. **Establish CI/CD pipeline** for new structure

## Priority Questions (Need Immediate Answers)

**TOP 5 - Block Implementation:**
1. **Q1**: Canvas technology (React Flow vs Custom)
2. **Q7**: Monorepo tool (Turborepo vs alternatives)
3. **Q8**: Frontend framework confirmation (Next.js 14)
4. **Q19**: Deployment strategy (Vercel + Railway vs K8s)
5. **Q35**: MVP scope confirmation (8-week timeline realistic?)

**NEXT 5 - Affect Architecture:**
6. **Q2**: Mermaid.js migration approach
7. **Q11**: Real-time collaboration conflict resolution
8. **Q16**: Frame organization rules
9. **Q20**: Database strategy
10. **Q22**: Pricing model basics

---

*Please review and provide answers to enable implementation start.*
*Questions can be answered in phases - priority questions first.*