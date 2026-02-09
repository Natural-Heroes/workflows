import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  codingTools,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentContext, AgentResult, AgentStrategy } from "../types.js";
import type { RunnerDependencies } from "../default/runner.js";
import { createEventMapper } from "../default/event-mapper.js";
import { buildPlanPrompt, getPlanRules } from "./context-builder.js";

const execFileAsync = promisify(execFile);

export class PlanRunner implements AgentStrategy {
  readonly name = "plan";
  private readonly deps: RunnerDependencies;

  constructor(deps: RunnerDependencies) {
    this.deps = deps;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { activitySender, linearActivities } = this.deps;
    const { issue, repoPath, sessionId, signal } = context;

    await activitySender.sendActivity({
      sessionId,
      type: "thought",
      content: `Starting plan analysis for ${issue.identifier}: ${issue.title}`,
    });

    let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | null = null;

    try {
      if (signal?.aborted) {
        throw new Error("Session was stopped before agent could start");
      }

      // Pull latest changes so plan analyzes up-to-date code
      try {
        await execFileAsync("git", ["pull", "--ff-only"], { cwd: repoPath });
        console.log(`[plan-runner] git pull completed for ${repoPath}`);
      } catch (err: unknown) {
        console.warn(`[plan-runner] git pull failed (continuing with current state): ${err}`);
      }

      // Create Pi agent session — no git worktree, uses repo path directly (read-only)
      const authStorage = new AuthStorage();
      const modelRegistry = new ModelRegistry(authStorage);

      const piConfig = this.deps.piConfig;
      const model = piConfig
        ? getModel(piConfig.provider as "anthropic", piConfig.model as "claude-sonnet-4-5")
        : undefined;

      if (!model) {
        throw new Error(
          `Could not resolve model: ${piConfig?.provider}/${piConfig?.model}. Check pi config.`,
        );
      }

      const thinkingLevel = (piConfig?.thinkingLevel ?? "medium") as "minimal" | "low" | "medium" | "high" | "xhigh";

      const settingsManager = SettingsManager.inMemory({
        defaultProvider: piConfig?.provider,
        defaultModel: piConfig?.model,
      });

      const result = await createAgentSession({
        cwd: repoPath,
        model,
        thinkingLevel,
        sessionManager: SessionManager.inMemory(),
        settingsManager,
        authStorage,
        modelRegistry,
        tools: codingTools,
      });
      session = result.session;

      // Listen for abort signal — abort the Pi session to stop in-flight operations
      const onAbort = () => {
        console.log(`[plan-runner] Abort signal received for session ${sessionId}, aborting Pi session...`);
        session?.abort().catch((err: unknown) => {
          console.error(`[plan-runner] Error aborting Pi session: ${err}`);
        });
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // Subscribe to events for Linear activity updates
      const handleEvent = createEventMapper(sessionId, activitySender);
      session.subscribe(handleEvent);

      // Build prompt — always append plan rules regardless of prompt source
      const basePrompt = context.promptContext || buildPlanPrompt(issue, repoPath);
      const prompt = context.promptContext
        ? basePrompt + getPlanRules(repoPath)
        : basePrompt;

      console.log(`[plan-runner] Starting plan session for ${issue.identifier}...`);
      await session.prompt(prompt);

      // Clean up abort listener
      signal?.removeEventListener("abort", onAbort);

      if (signal?.aborted) {
        throw new Error("Session was stopped by user request");
      }

      // Capture plan output
      const planText = session.getLastAssistantText();

      if (!planText) {
        console.log(`[plan-runner] No plan output for ${issue.identifier}`);
        return {
          hasChanges: false,
          summary: `Plan analysis completed for ${issue.identifier} but produced no output`,
        };
      }

      console.log(`[plan-runner] Plan output: ${planText.length} chars, posting to Linear...`);

      // Post plan as Linear comment(s)
      await this.postPlanComments(issue.id, planText);

      return {
        hasChanges: false,
        summary: `Plan analysis posted as comment on ${issue.identifier}`,
      };
    } catch (error: unknown) {
      if (!signal?.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        await activitySender
          .sendActivity({
            sessionId,
            type: "error",
            content: `Error analyzing ${issue.identifier}: ${message}`,
          })
          .catch((err: unknown) => {
            console.error("[plan-runner] Failed to send error activity:", err);
          });
      }

      throw error;
    } finally {
      session?.dispose();
    }
  }

  /** Post plan text as a single Linear comment. */
  private async postPlanComments(issueId: string, text: string): Promise<void> {
    await this.deps.linearActivities.postComment(issueId, text);
  }
}
