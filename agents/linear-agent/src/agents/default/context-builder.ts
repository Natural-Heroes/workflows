import type { LinearIssue } from "../types.js";

/** Rules that are ALWAYS appended to the prompt, regardless of source. */
export function getAgentRules(repoPath: string): string {
  return [
    "",
    "## CRITICAL Rules (violating these will break the system)",
    "",
    "### Git restrictions — DO NOT TOUCH GIT",
    "- **NEVER run git push, git checkout, git branch, git switch, or gh pr create**",
    "- **NEVER create branches, push commits, or create pull requests**",
    "- Stay on the current branch. The runner handles ALL git operations after you finish.",
    "- You may use `git diff` or `git status` to review your own changes — nothing else.",
    "",
    "### Process restrictions",
    "- Do NOT start long-running processes (npm run dev, npm start, watchers, servers, etc.) — they block the session permanently",
    "- Do NOT run interactive commands or commands that require user input",
    "",
    "### Work guidelines",
    `- Work in the repository at: ${repoPath}`,
    "- Make focused, minimal changes that address the issue",
    "- When done, provide a brief summary of what you changed and why",
  ].join("\n");
}

/** Path where the agent saves screenshots during visual verification. */
export function screenshotPath(sessionId: string): string {
  return `/tmp/hero-${sessionId}-preview.png`;
}

/** Prompt for visual verification phase — sent after PR + preview deploy. */
export function buildVisualVerifyPrompt(previewUrl: string, repoPath: string, sessionId: string): string {
  const screenshotDest = screenshotPath(sessionId);
  // Prefix all agent-browser commands with PATH to ensure node is findable
  const ab = "PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/agent-browser";
  return [
    "## Visual Verification — MANDATORY",
    "",
    `A preview deployment is live at: ${previewUrl}`,
    "",
    "You MUST take a screenshot using agent-browser. Follow these steps exactly:",
    `1. Run: \`${ab} open "${previewUrl}"\``,
    `2. Run: \`${ab} screenshot --full ${screenshotDest}\``,
    "3. Review the screenshot to check your changes rendered correctly",
    `4. If you need to inspect specific parts, run: \`${ab} snapshot\``,
    "5. If you spot visual issues, fix them in the code",
    "6. Confirm with a brief summary of what you verified",
    `7. Run: \`${ab} close\``,
    "",
    `IMPORTANT: The screenshot MUST be saved to exactly: ${screenshotDest}`,
    "Do NOT skip the screenshot step — it will be uploaded to the Linear issue.",
    "",
    "Focus only on the parts of the page affected by your changes.",
    getAgentRules(repoPath),
  ].join("\n");
}

/** Build a fallback prompt when Linear doesn't provide promptContext. */
export function buildAgentPrompt(issue: LinearIssue, repoPath: string): string {
  const lines = [
    `You are working on issue ${issue.identifier}: ${issue.title}`,
    "",
    "## Description",
    issue.description || "(no description provided)",
  ];

  return lines.join("\n") + getAgentRules(repoPath);
}
