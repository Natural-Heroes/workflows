import type { AgentStrategy } from "./types.js";

export class AgentRegistry {
  private readonly strategies = new Map<string, AgentStrategy>();

  /** Register an agent strategy by its name. */
  register(agent: AgentStrategy): void {
    this.strategies.set(agent.name, agent);
  }

  /** Resolve a strategy by agent type name. Throws if not found. */
  resolve(agentType: string): AgentStrategy {
    const strategy = this.strategies.get(agentType);
    if (!strategy) {
      throw new Error(
        `Unknown agent type "${agentType}". Available: ${this.list().join(", ") || "(none)"}`,
      );
    }
    return strategy;
  }

  has(agentType: string): boolean {
    return this.strategies.has(agentType);
  }

  list(): string[] {
    return [...this.strategies.keys()];
  }
}
