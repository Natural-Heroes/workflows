# Agent Strategies

Each agent type implements the `AgentStrategy` interface and is registered in the `AgentRegistry`.

## Adding a new agent type

1. Create a new directory under `src/agents/` (e.g. `src/agents/review/`)
2. Implement the `AgentStrategy` interface from `src/agents/types.ts`
3. Register the strategy in the `AgentRegistry` at startup
4. Add a corresponding Linear label `agent:<name>` so the webhook router can resolve it

## Example

```typescript
import type { AgentContext, AgentResult, AgentStrategy } from "../types.js";

export class ReviewAgent implements AgentStrategy {
  readonly name = "review";

  async execute(context: AgentContext): Promise<AgentResult> {
    // your logic here
    return { hasChanges: false, summary: "Review complete" };
  }
}
```

Then in your entry point:

```typescript
registry.register(new ReviewAgent());
```
