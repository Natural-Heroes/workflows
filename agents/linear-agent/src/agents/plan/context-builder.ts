import type { LinearIssue } from "../types.js";

/** Rules for the plan agent — read-only, no git, output as text. */
export function getPlanRules(repoPath: string): string {
  return [
    "",
    "## Rules (always follow these)",
    `- Work in the repository at: ${repoPath}`,
    "- DO NOT create, edit, or write any files",
    "- DO NOT run git commands",
    "- DO NOT start long-running processes (npm run dev, npm start, watchers, servers, etc.)",
    "- DO NOT run interactive commands or commands that require user input",
    "- You MAY read files, search code, and run read-only commands to inform your analysis",
    "- Output your full analysis as text — it will be posted as a comment on the issue",
    "- Structure your output with markdown headers, tables, and code examples where appropriate",
    "- Be thorough but concise",
  ].join("\n");
}

/** Build the prompt for a plan agent session. */
export function buildPlanPrompt(issue: LinearIssue, repoPath: string): string {
  const lines = [
    `You are a senior software architect analyzing issue ${issue.identifier}: ${issue.title}`,
    "",
    "## Description",
    issue.description || "(no description provided)",
    "",
    "Analyze the issue thoroughly. Research the codebase, explore relevant files, and produce a detailed plan.",
    "Your output will be posted as a comment on this issue.",
  ];

  return lines.join("\n") + getPlanRules(repoPath);
}
