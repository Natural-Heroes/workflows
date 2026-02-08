export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  labels: string[];
}

export interface AgentContext {
  sessionId: string;
  issue: LinearIssue;
  promptContext: string;
  repoPath: string;
  defaultBranch: string;
  /** Abort signal — fires when a stop request is received from Linear. */
  signal?: AbortSignal;
}

export interface AgentResult {
  hasChanges: boolean;
  prUrl?: string;
  summary: string;
}

export interface AgentStrategy {
  name: string;
  execute(context: AgentContext): Promise<AgentResult>;
}
