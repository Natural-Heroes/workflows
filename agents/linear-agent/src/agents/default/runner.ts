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
import { buildAgentPrompt, getAgentRules, buildVisualVerifyPrompt, screenshotPath } from "./context-builder.js";
import type { AgentActivities } from "../../linear/activities.js";
import { createEventMapper, type ActivitySender } from "./event-mapper.js";
import { gitSetup, gitFinalize, gitCleanup, getChangedFiles, hasVisualChanges, waitForPreviewUrl } from "../../git/workflow.js";

export interface RunnerDependencies {
  activitySender: ActivitySender;
  linearActivities: AgentActivities;
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

    // Create isolated worktree for this session (push is blocked inside)
    const { branchName, worktreePath } = await gitSetup(
      repoPath,
      issue.identifier,
      issue.title,
      sessionId,
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

      // Agent works in the isolated worktree, not the main repo
      const result = await createAgentSession({
        cwd: worktreePath,
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
        context.promptContext || buildAgentPrompt(issue, worktreePath);
      const prompt = context.promptContext
        ? basePrompt + getAgentRules(worktreePath)
        : basePrompt;
      await session.prompt(prompt);

      // Clean up abort listener
      signal?.removeEventListener("abort", onAbort);

      // If stopped during prompt, throw so the worker handles it as a stop
      if (signal?.aborted) {
        throw new Error("Session was stopped by user request");
      }

      // Finalize git (stage, commit, push, PR) — runner unblocks push temporarily
      const prResult = await gitFinalize(
        repoPath,
        worktreePath,
        branchName,
        issue.identifier,
        issue.title,
      );

      if (prResult) {
        // Check if visual verification is needed
        const changedFiles = await getChangedFiles(worktreePath);
        const isVisual = hasVisualChanges(changedFiles);

        if (isVisual) {
          console.log(`[runner] Visual changes detected — waiting for preview deployment...`);
          await activitySender.sendActivity({
            sessionId,
            type: "thought",
            content: "Waiting for preview deployment to verify visual changes...",
          });

          const previewUrl = await waitForPreviewUrl(worktreePath, prResult.prUrl);

          if (previewUrl) {
            console.log(`[runner] Preview URL found: ${previewUrl} — starting visual verification`);
            await activitySender.sendActivity({
              sessionId,
              type: "action",
              content: `Browsing preview at ${previewUrl}`,
              action: "visual-verify",
            });

            // Re-prompt the agent to verify visually
            const verifyPrompt = buildVisualVerifyPrompt(previewUrl, worktreePath, sessionId);
            await session!.prompt(verifyPrompt);

            // Upload screenshot to Linear issue as a comment
            const screenshot = screenshotPath(sessionId);
            await this.deps.linearActivities.uploadScreenshotComment(
              issue.id,
              screenshot,
              `Visual verification screenshot for ${issue.identifier}\n\nPreview: ${previewUrl}`,
            );

            // If the agent made fixes, commit and push them
            const fixResult = await gitFinalize(
              repoPath,
              worktreePath,
              branchName,
              issue.identifier,
              issue.title,
            );

            if (fixResult) {
              console.log(`[runner] Visual fixes pushed to ${fixResult.prUrl}`);
            }
          } else {
            console.log(`[runner] No preview URL found — skipping visual verification`);
          }
        }

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

      // Clean up worktree and branch on failure
      await gitCleanup(repoPath, worktreePath, branchName);
      throw error;
    } finally {
      session?.dispose();
      // Clean up worktree after successful run too
      await gitCleanup(repoPath, worktreePath, branchName).catch(() => {});
    }
  }
}
