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
import { readdir, stat } from "node:fs/promises";
import { buildAgentPrompt, getAgentRules, buildVisualVerifyPrompt, screenshotPath } from "./context-builder.js";
import type { AgentActivities } from "../../linear/activities.js";
import { createEventMapper, type ActivitySender } from "./event-mapper.js";
import { gitSetup, gitFinalize, gitCleanup, getChangedFiles, hasVisualChanges, waitForPreviewUrl, updatePrBody, getPrDiff, reviewWithCodex, postPrComment } from "../../git/workflow.js";

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
    const { issue, repoPath, defaultBranch, sessionId, signal } = context;

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
      defaultBranch,
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

      // Capture the agent's summary from the coding phase
      const codingSummary = session.getLastAssistantText() ?? "";

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
        codingSummary,
        defaultBranch,
      );

      if (prResult) {
        // Check if visual verification is needed
        const changedFiles = await getChangedFiles(worktreePath, defaultBranch);
        const isVisual = hasVisualChanges(changedFiles);

        if (!isVisual && codingSummary) {
          // For non-visual PRs, post a standalone "Changes Made" comment
          // (visual PRs get this as part of the combined verification comment)
          await this.deps.linearActivities.postComment(issue.id, `## Changes Made\n\n${codingSummary}`);
        }

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
            const verifyStartTime = Date.now();
            const verifyPrompt = buildVisualVerifyPrompt(previewUrl, worktreePath, sessionId);
            await session!.prompt(verifyPrompt);

            // Capture the agent's visual verification summary
            const verifySummary = session!.getLastAssistantText() ?? "";

            // Upload screenshots and build a combined comment
            const screenshots = await findSessionScreenshots(sessionId, verifyStartTime);
            const assetUrls: string[] = [];
            for (const screenshotFile of screenshots) {
              const url = await this.deps.linearActivities.uploadFile(screenshotFile);
              if (url) assetUrls.push(url);
            }

            // Post one combined comment with summaries + screenshots
            const commentBody = buildVerificationComment({
              issueIdentifier: issue.identifier,
              previewUrl,
              codingSummary,
              verifySummary,
              screenshotUrls: assetUrls,
            });
            await this.deps.linearActivities.postComment(issue.id, commentBody);

            // Update PR description with the same content
            const prBody = `Resolves ${issue.identifier}\n\n${commentBody}\n\n---\n*Automated PR by Hero*`;
            await updatePrBody(worktreePath, prResult.prUrl, prBody).catch((err: unknown) => {
              console.error("[runner] Failed to update PR body:", err);
            });

            // If the agent made fixes, commit and push them
            const fixResult = await gitFinalize(
              repoPath,
              worktreePath,
              branchName,
              issue.identifier,
              issue.title,
              undefined,
              defaultBranch,
            );

            if (fixResult) {
              console.log(`[runner] Visual fixes pushed to ${fixResult.prUrl}`);
            }
          } else {
            console.log(`[runner] No preview URL found — skipping visual verification`);
          }
        }

        // Bug review via GPT Codex — runs for all PRs (visual and non-visual)
        const diff = await getPrDiff(worktreePath, prResult.prUrl);
        if (diff) {
          console.log(`[runner] Running bug review via GPT Codex for ${issue.identifier}...`);
          await activitySender.sendActivity({
            sessionId,
            type: "thought",
            content: "Running independent bug review via GPT Codex...",
          });

          const review = await reviewWithCodex(diff, issue);
          if (review) {
            await this.deps.linearActivities.postComment(issue.id, review);
            await postPrComment(worktreePath, prResult.prUrl, review);
            console.log(`[runner] Bug review posted for ${issue.identifier}`);
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

/** Build a combined comment with coding summary, visual verification, and screenshots. */
function buildVerificationComment(params: {
  issueIdentifier: string;
  previewUrl: string;
  codingSummary: string;
  verifySummary: string;
  screenshotUrls: string[];
}): string {
  const { issueIdentifier, previewUrl, codingSummary, verifySummary, screenshotUrls } = params;
  const sections: string[] = [];

  if (codingSummary) {
    sections.push(`## Changes Made\n\n${codingSummary}`);
  }

  if (verifySummary) {
    sections.push(`## Visual Verification\n\n${verifySummary}`);
  }

  if (screenshotUrls.length > 0) {
    const images = screenshotUrls
      .map((url, i) => `![Screenshot${screenshotUrls.length > 1 ? ` ${i + 1}` : ""}](${url})`)
      .join("\n\n");
    sections.push(`## Preview\n\n${previewUrl}\n\n${images}`);
  }

  if (sections.length === 0) {
    return `Visual verification completed for ${issueIdentifier}\n\nPreview: ${previewUrl}`;
  }

  return sections.join("\n\n---\n\n");
}

/** Find screenshots created during the visual verification phase. */
async function findSessionScreenshots(sessionId: string, startTime: number): Promise<string[]> {
  const expected = screenshotPath(sessionId);
  const results: string[] = [];

  // Check the expected path first
  const expectedStat = await stat(expected).catch(() => null);
  if (expectedStat && expectedStat.mtimeMs >= startTime) {
    results.push(expected);
  }

  // Also scan /tmp/ for any PNGs created during the session
  try {
    const files = await readdir("/tmp");
    for (const file of files) {
      if (!file.endsWith(".png")) continue;
      if (file === expected.split("/").pop()) continue; // already added
      const filePath = `/tmp/${file}`;
      const fileStat = await stat(filePath).catch(() => null);
      if (fileStat && fileStat.mtimeMs >= startTime) {
        results.push(filePath);
      }
    }
  } catch {
    // /tmp scan failed — use whatever we found
  }

  console.log(`[runner] Found ${results.length} screenshot(s) for session ${sessionId}`);
  return results;
}
