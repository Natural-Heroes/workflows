import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { LinearClient } from "@linear/sdk";
import type { AgentConfig, QueueConfig, RedisConfig, RepoMapping } from "../config/types.js";
import type { AgentContext, AgentResult, AgentStrategy } from "../agents/types.js";
import type { AgentRegistry } from "../agents/registry.js";
import type { SessionRegistry } from "../sessions/registry.js";
import type { WebhookJobData } from "./task-queue.js";

export interface LinearActivities {
  sendActivity(params: { sessionId: string; type: string; content: string }): Promise<void>;
}

export interface WorkerDependencies {
  redisConfig: RedisConfig;
  queueConfig: QueueConfig;
  agentRegistry: AgentRegistry;
  config: AgentConfig;
  linearActivities: LinearActivities;
  getLinearClient: () => Promise<LinearClient>;
  sessionRegistry: SessionRegistry;
}

/** Creates a BullMQ worker that processes webhook jobs. */
export function createWorker(deps: WorkerDependencies): Worker<WebhookJobData> {
  const { redisConfig, queueConfig, agentRegistry, config, linearActivities, getLinearClient, sessionRegistry } = deps;

  const connection = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<WebhookJobData>(
    "linear-agent",
    async (job: Job<WebhookJobData>) => {
      const { sessionId, issueId, webhookData } = job.data;
      console.log(`[worker] Processing job ${job.id} — session=${sessionId} issue=${issueId}`);

      // Register session for stop request handling
      const signal = sessionRegistry.register(sessionId, issueId);

      const timeoutMs = queueConfig.jobTimeout;
      const timeout = setTimeout(() => {
        console.log(`[worker] Job timed out after ${timeoutMs}ms — aborting session ${sessionId}`);
        sessionRegistry.abort(sessionId);
      }, timeoutMs);

      // Stop detection is handled via webhook (action=prompted) — no polling needed

      try {
        let issue = extractIssue(issueId, webhookData);

        // Webhook data often lacks labels — fetch from Linear API if missing
        if (issue.labels.length === 0) {
          console.log(`[worker] No labels in webhook data, fetching from Linear API...`);
          const client = await getLinearClient();
          const linearIssue = await client.issue(issueId);
          const linearLabels = await linearIssue.labels({ first: 50 });
          console.log(`[worker] Fetched ${linearLabels.nodes.length} labels from API`);
          issue = {
            ...issue,
            title: issue.title || linearIssue.title,
            description: issue.description || (linearIssue.description ?? ""),
            identifier: issue.identifier || linearIssue.identifier,
            labels: linearLabels.nodes.map((l) => l.name),
          };
        }

        console.log(`[worker] Issue: "${issue.title}" labels=[${issue.labels.join(", ")}]`);

        // Match repo: label — compare full label string (e.g. "repo:my-project")
        const repoLabel = issue.labels.find((l) => l.startsWith("repo:"));
        const repo = repoLabel
          ? config.repos.find((r) => r.label === repoLabel)
          : undefined;

        if (!repo) {
          const available = config.repos.map((r) => r.label).join(", ");
          console.log(`[worker] No repo found for label "${repoLabel ?? "(none)"}". Available: ${available}`);
          const msg = repoLabel
            ? `Unknown repo label \`${repoLabel}\`. Available: ${available}`
            : `Missing \`repo:\` label. Add one to the issue. Available: ${available}`;
          await linearActivities.sendActivity({ sessionId, type: "error", content: msg });
          await linearActivities.sendActivity({ sessionId, type: "response", content: msg });
          return;
        }

        console.log(`[worker] Repo: ${repo.label} → ${repo.path}`);

        // Parse agent: label to resolve agent type
        const agentLabel = issue.labels.find((l) => l.startsWith("agent:"));
        const agentType = agentLabel?.slice(6) ?? config.defaultAgentType;

        const strategy = agentRegistry.resolve(agentType);
        console.log(`[worker] Agent type: ${agentType} (${strategy.name})`);

        // Use Linear's promptContext if available, otherwise build from issue
        const linearPromptContext = webhookData.promptContext as string | undefined;
        console.log(`[worker] promptContext from Linear: ${linearPromptContext ? `${linearPromptContext.length} chars` : "none"}`);
        const promptContext = linearPromptContext || buildPromptContext(issue, repo);

        const context: AgentContext = {
          sessionId,
          issue,
          promptContext,
          repoPath: repo.path,
          signal,
        };

        if (signal.aborted) {
          throw new Error("Session was stopped before agent execution");
        }

        console.log(`[worker] Starting agent execution...`);
        const result = await strategy.execute(context);
        console.log(`[worker] Agent finished — hasChanges=${result.hasChanges} prUrl=${result.prUrl ?? "none"}`);

        const message = result.summary;

        await linearActivities.sendActivity({
          sessionId,
          type: "response",
          content: message,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const wasStopped = signal.aborted;

        if (wasStopped) {
          console.log(`[worker] Session ${sessionId} was stopped by user`);
          await linearActivities.sendActivity({
            sessionId,
            type: "response",
            content: "Session stopped by user request.",
          }).catch(() => {});
          // Don't rethrow — this is a clean stop, not a failure
          return;
        }

        console.error(`[worker] Job failed: ${errorMessage}`);

        // Send error activity for visibility, then response to properly end the session
        await linearActivities.sendActivity({
          sessionId,
          type: "error",
          content: `Agent failed: ${errorMessage}`,
        }).catch(() => {});

        await linearActivities.sendActivity({
          sessionId,
          type: "response",
          content: `Session ended due to error: ${errorMessage}`,
        }).catch(() => {});

        throw error;
      } finally {
        clearTimeout(timeout);
        sessionRegistry.unregister(sessionId);
      }
    },
    {
      connection,
      concurrency: queueConfig.concurrency,
    },
  );

  return worker;
}

function extractIssue(
  issueId: string,
  webhookData: Record<string, unknown>,
): AgentContext["issue"] {
  console.log(`[worker] webhookData keys: ${Object.keys(webhookData).join(", ")}`);

  // agentSession webhook nests issue data in `issue` field
  const issue = (webhookData.issue ?? webhookData) as Record<string, unknown>;
  const title = (issue.title as string) ?? "";
  const description = (issue.description as string) ?? "";
  const identifier = (issue.identifier as string) ?? issueId;

  // Labels from webhook: may be {nodes: [{name}]}, [{name}], or string[]
  let labels: string[] = [];
  const rawLabels = issue.labels as unknown;
  if (rawLabels && typeof rawLabels === "object") {
    // Linear often nests as {nodes: [{name: "..."}]}
    const nodes = (rawLabels as Record<string, unknown>).nodes as Array<{ name?: string }> | undefined;
    if (Array.isArray(nodes)) {
      labels = nodes.map((l) => l.name ?? "").filter(Boolean);
    } else if (Array.isArray(rawLabels)) {
      labels = (rawLabels as Array<string | { name?: string }>).map((l) =>
        typeof l === "string" ? l : (l.name ?? ""),
      ).filter(Boolean);
    }
  }

  console.log(`[worker] issue keys: ${Object.keys(issue).join(", ")}`);
  if (issue.labels) {
    console.log(`[worker] labels raw: ${JSON.stringify(issue.labels).slice(0, 200)}`);
  }

  return { id: issueId, identifier, title, description, labels };
}

function buildPromptContext(
  issue: AgentContext["issue"],
  repo: RepoMapping,
): string {
  return [
    `Issue: ${issue.title}`,
    `Description: ${issue.description}`,
    `Repository: ${repo.label} (${repo.path})`,
    `Default branch: ${repo.defaultBranch}`,
  ].join("\n");
}
