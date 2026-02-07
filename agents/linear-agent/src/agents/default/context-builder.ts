import type { LinearIssue } from "../types.js";

/** Rules that are ALWAYS appended to the prompt, regardless of source. */
export function getAgentRules(repoPath: string): string {
  return [
    "",
    "## Rules (always follow these)",
    `- Work in the repository at: ${repoPath}`,
    "- Do NOT push commits or create pull requests — the runner handles git after you finish",
    "- Do NOT start long-running processes (npm run dev, npm start, watchers, servers, etc.) — they will block your session and you have no way to stop them",
    "- Do NOT run interactive commands or commands that require user input",
    "- Make focused, minimal changes that address the issue",
    "- When done, provide a brief summary of what you changed and why",
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
