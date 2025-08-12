# 🤖 OFM Social OS - Agent Configuration

## Agent Architecture

### Core Agents
- **Creator Agent**: Autonomous content scheduling per creator
- **Publishing Agent**: Multi-platform publishing with API compliance  
- **Analytics Agent**: KPI monitoring and repurposing decisions
- **Budget Agent**: LLM cost tracking with hard stops

### Agent Technologies
- **LangGraph**: Multi-agent workflows
- **CrewAI**: Collaborative agent systems
- **AutoGen**: Conversational multi-agent framework
- **Temporal**: Durable agent execution

## Configuration

```typescript
interface AgentConfig {
  creator_id: string;
  platforms: Platform[];
  budget_limits: BudgetConfig;
  publishing_schedule: ScheduleConfig;
  llm_provider: 'openai' | 'anthropic' | 'custom';
}
```

## GitHub Integration

This repository is optimized for GitHub search and GPT agent discovery:
- Public repository with comprehensive documentation
- Agent-specific issue templates
- CI/CD workflows for agent deployment
- OpenTelemetry observability for agent performance