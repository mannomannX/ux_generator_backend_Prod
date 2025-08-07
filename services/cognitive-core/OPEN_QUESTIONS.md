# Cognitive Core Service - Open Questions

## Learning System
1. **Learning Episode Storage**:
   - Should learning episodes be stored permanently?
   - What's the retention policy for learning data?
   - Should learning be per-user or global?

2. **Learning Implementation**:
   - Use transfer learning with existing models?
   - Fine-tune on specific UX flow patterns?
   - Implement reinforcement learning from feedback?

3. **Privacy Concerns**:
   - Can we store user corrections for learning?
   - GDPR compliance for learning data?
   - Option to opt-out of learning contributions?

## AI Provider Integration
1. **Provider Selection**:
   - Primary AI provider preference?
   - Fallback provider order?
   - Budget allocation per provider?

2. **Cost Management**:
   - Daily/monthly budget limits?
   - Per-user cost tracking?
   - Premium tier cost allowances?

3. **Model Selection**:
   - Use Gemini Flash vs Pro based on what criteria?
   - When to use GPT-4 vs Claude?
   - Local model integration (Llama)?

## Performance Optimization
1. **Caching Strategy**:
   - Cache semantic embeddings how long?
   - Response caching for similar queries?
   - Redis vs in-memory caching?

2. **Queue Management**:
   - Priority queue rules?
   - Rate limiting per user/workspace?
   - Batch processing for efficiency?

3. **Scaling Strategy**:
   - Auto-scaling triggers?
   - Load balancing between instances?
   - Regional deployment strategy?

## Agent Behavior
1. **Agent Prompts**:
   - Prompt templates need approval?
   - Multi-language support priority?
   - Custom prompts per workspace?

2. **Quality Modes**:
   - What defines "high quality" mode?
   - Cost multiplier for quality modes?
   - User control over quality settings?

3. **Agent Coordination**:
   - Max agents per request?
   - Timeout for agent responses?
   - Consensus mechanism for multi-agent?

## Monitoring & Analytics
1. **Metrics Collection**:
   - Which metrics are business-critical?
   - Real-time dashboard requirements?
   - Alert thresholds for each metric?

2. **Performance Tracking**:
   - SLA requirements?
   - Latency targets per operation?
   - Uptime requirements?

3. **Cost Tracking**:
   - Cost attribution to users/workspaces?
   - Billing integration for AI costs?
   - Cost optimization reports frequency?

## Security
1. **Prompt Injection**:
   - Blocking vs logging suspicious prompts?
   - User notification on blocked prompts?
   - False positive handling?

2. **Data Privacy**:
   - Conversation retention period?
   - PII detection and handling?
   - Audit log requirements?

3. **API Security**:
   - API key rotation frequency?
   - Rate limiting per API key?
   - IP allowlisting for production?

## Integration
1. **Knowledge Service**:
   - RAG integration depth?
   - Context window management?
   - Relevance scoring threshold?

2. **Flow Service**:
   - Direct flow manipulation by agents?
   - Validation before flow updates?
   - Rollback mechanism for bad updates?

3. **User Management**:
   - User preference storage?
   - Per-user agent customization?
   - Team collaboration features?

## Production Readiness
1. **Deployment**:
   - Container orchestration (K8s)?
   - Health check requirements?
   - Graceful shutdown handling?

2. **Disaster Recovery**:
   - Backup strategy for conversations?
   - Failover mechanism?
   - Data recovery RTO/RPO?

3. **Compliance**:
   - SOC2 requirements?
   - HIPAA compliance needed?
   - Industry-specific regulations?

---

*These questions need answers from product/business team before finalizing implementation.*