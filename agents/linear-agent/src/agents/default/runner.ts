import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  AuthStorage,
  ModelRegistry,
  codingTools,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

import type { AgentContext, AgentResult, AgentStrategy } from "../types.js";
import type { PiConfig } from "../../config/types.js";
import { buildAgentPrompt, getAgentRules } from "./context-builder.js";
import { createEventMapper, type ActivitySender } from "./event-mapper.js";
import { gitSetup, gitFinalize, gitCleanup } from "../../git/workflow.js";

export interface RunnerDependencies {
  activitySender: ActivitySender;
  piConfig?: PiConfig;
}

export class DefaultAgentRunner implements AgentStrategy {
  readonly name = "default";
  private readonly deps: RunnerDependencies;

  constructor(deps: RunnerDependencies) {
    this.deps = deps;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const { activitySender } = this.deps;
    const { issue, repoPath, sessionId, signal } = context;

    await activitySender.sendActivity({
      sessionId,
      type: "thought",
      content: `Starting work on ${issue.identifier}: ${issue.title}`,
    });

    // Set up feature branch
    const { branchName } = await gitSetup(
      repoPath,
      issue.identifier,
      issue.title,
    );

    let session: Awaited<
      ReturnType<typeof createAgentSession>
    >["session"] | null = null;

    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        throw new Error("Session was stopped before agent could start");
      }

      // Create Pi agent session
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

      // Listen for abort signal — dispose the Pi session to stop it
      const onAbort = () => {
        console.log(`[runner] Abort signal received for session ${sessionId}, disposing Pi session...`);
        session?.dispose();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      // Subscribe to events for Linear activity updates
      const handleEvent = createEventMapper(sessionId, activitySender);
      session.subscribe(handleEvent);

      // Build prompt — always append our rules regardless of prompt source
      const basePrompt =
        context.promptContext || buildAgentPrompt(issue, repoPath);
      const prompt = context.promptContext
        ? basePrompt + getAgentRules(repoPath)
        : basePrompt;
      await session.prompt(prompt);

      // Clean up abort listener
      signal?.removeEventListener("abort", onAbort);

      // If stopped during prompt, throw so the worker handles it as a stop
      if (signal?.aborted) {
        throw new Error("Session was stopped by user request");
      }

      // Finalize git (stage, commit, push, PR)
      const prResult = await gitFinalize(
        repoPath,
        branchName,
        issue.identifier,
        issue.title,
      );

      if (prResult) {
        return {
          hasChanges: true,
          prUrl: prResult.prUrl,
          summary: `Created PR for ${issue.identifier}: ${prResult.prUrl}`,
        };
      }

      return {
        hasChanges: false,
        summary: `No changes needed for ${issue.identifier}`,
      };
    } catch (error: unknown) {
      // Report error activity
      const message =
        error instanceof Error ? error.message : String(error);
      await activitySender
        .sendActivity({
          sessionId,
          type: "error",
          content: `Error processing ${issue.identifier}: ${message}`,
        })
        .catch((err: unknown) => {
          console.error("[runner] Failed to send error activity:", err);
        });

      // Clean up branch on failure
      await gitCleanup(repoPath, branchName);
      throw error;
    } finally {
      session?.dispose();
    }
  }
}
