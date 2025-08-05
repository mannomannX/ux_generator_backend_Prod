// ==========================================
// SERVICES/COGNITIVE-CORE/README.md
// ==========================================
# Cognitive Core Service

The AI brain of the UX-Flow-Engine. This service orchestrates multiple specialized AI agents to process user requests, create plans, and manage the intelligent conversation flow.

## 🧠 Architecture

### Multi-Agent System
- **Manager Agent**: Analyzes user requests and determines task complexity
- **Planner Agent**: Creates detailed execution plans for UX tasks
- **Architect Agent**: Converts plans into executable JSON transactions
- **Validator Agent**: Validates transactions for logical consistency
- **Classifier Agent**: Categorizes user messages by intent and sentiment
- **Synthesizer Agent**: Combines multiple agent outputs into coherent responses
- **UX Expert Agent**: Answers UX-related questions using knowledge base
- **Visual Interpreter Agent**: Analyzes uploaded sketches and wireframes
- **Analyst Agent**: Analyzes system logs for continuous improvement

### Event-Driven Communication
- Uses Redis pub/sub for inter-service communication
- Emits structured events for all agent actions
- Handles async processing with proper error recovery

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- MongoDB running
- Redis running
- Google Gemini API key

### Setup
\`\`\`bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start in development mode
npm run dev
\`\`\`

### Configuration
Set these environment variables in your `.env`:

\`\`\`
GOOGLE_API_KEY=your-gemini-api-key
MONGODB_URI=mongodb://localhost:27017/ux-flow-engine
REDIS_URL=redis://localhost:6379
COGNITIVE_CORE_PORT=3001
LOG_LEVEL=info
\`\`\`

## 📡 API Endpoints

### Health Check
\`\`\`
GET /health
\`\`\`
Returns service health and dependency status.

### Agent Information
\`\`\`
GET /agents
\`\`\`
Lists all available agents and their status.

### Manual Agent Invocation (Testing)
\`\`\`
POST /agents/:agentName/invoke
Content-Type: application/json

{
  "prompt": "Create a login screen",
  "context": {
    "qualityMode": "standard",
    "currentFlow": {...}
  }
}
\`\`\`

## 🔄 Event Flow

### User Message Processing
1. **Classification**: User message is analyzed for intent and sentiment
2. **Context Retrieval**: Conversation history and knowledge context loaded
3. **Agent Orchestration**: Appropriate agents invoked based on classification
4. **Response Synthesis**: Multiple agent outputs combined into coherent response
5. **State Management**: Conversation state updated and persisted

### Plan Execution Flow
1. **Plan Creation**: Planner agent creates detailed steps
2. **User Approval**: Plan sent to user for approval via WebSocket
3. **Transaction Generation**: Architect converts approved plan to transactions
4. **Validation**: Validator checks transactions for logical consistency
5. **Execution**: Valid transactions sent to Flow Service for execution

## 🧪 Testing

### Unit Tests
\`\`\`bash
npm test
\`\`\`

### Integration Tests
\`\`\`bash
npm run test:integration
\`\`\`

### Manual Testing
Use the API endpoints to test individual agents:

\`\`\`bash
# Test the classifier
curl -X POST http://localhost:3001/agents/classifier/invoke \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Create a login screen and explain UX best practices"}'

# Test the planner
curl -X POST http://localhost:3001/agents/planner/invoke \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Create a user registration flow", "context": {"currentFlow": {"nodes": [], "edges": []}}}'
\`\`\`

## 📊 Monitoring

### Structured Logging
All agent actions are logged with structured metadata:
- Agent name and task ID
- Input/output sizes
- Processing time
- Quality mode used
- Success/failure status

### Health Monitoring
The service monitors:
- Google Gemini API connectivity
- MongoDB connection status
- Redis connection status
- Agent response times

### Event Tracking
Key events emitted:
- \`AGENT_TASK_STARTED\`
- \`AGENT_TASK_COMPLETED\`
- \`AGENT_TASK_FAILED\`
- \`USER_MESSAGE_RECEIVED\`
- \`USER_RESPONSE_READY\`

## 🔧 Development

### Adding New Agents
1. Create agent class extending \`BaseAgent\`
2. Implement \`executeTask()\` method
3. Add agent to \`AgentOrchestrator\`
4. Create prompt file in \`src/prompts/\`
5. Add tests

### Agent Development Guidelines
- Always validate input and output formats
- Use structured logging for debugging
- Implement proper error handling
- Follow the event-driven pattern
- Use quality modes appropriately (standard vs pro)

### Prompt Engineering
- Keep prompts focused and specific
- Use JSON output format for structured responses
- Include examples in prompts
- Validate output schemas
- Test with different complexity levels

## 🐛 Troubleshooting

### Common Issues

**Agent not responding**
- Check Google API key validity
- Verify network connectivity
- Check rate limits

**Memory/Performance issues**
- Monitor event listener count
- Check for memory leaks in conversation state
- Verify Redis connection pooling

**Invalid JSON responses**
- Review prompt instructions
- Check model selection (standard vs pro)
- Validate response parsing logic

### Debug Mode
Set \`LOG_LEVEL=debug\` to see detailed agent interactions:

\`\`\`bash
LOG_LEVEL=debug npm run dev
\`\`\`

## 🚀 Production Deployment

### Environment Variables
\`\`\`bash
NODE_ENV=production
LOG_LEVEL=info
GOOGLE_API_KEY=prod-key
MONGODB_URI=mongodb+srv://prod-cluster
REDIS_URL=redis://prod-redis:6379
\`\`\`

### Performance Tuning
- Use connection pooling for databases
- Implement caching for frequent operations
- Monitor agent response times
- Set appropriate timeouts

### Security
- Secure API keys in environment variables
- Use TLS for all external connections
- Implement rate limiting
- Validate all inputs

---

For more information, see the main project documentation.