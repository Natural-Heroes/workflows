import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/** Safely run a git command in the given directory. */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Safely run an arbitrary command (e.g. gh). */
async function run(cwd: string, cmd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { cwd });
  return stdout.trim();
}

export interface GitSetupResult {
  branchName: string;
  /** Isolated worktree path where the agent works. */
  worktreePath: string;
}

/**
 * Create an isolated git worktree for the agent session.
 * The agent works in the worktree; the main repo stays untouched on dev.
 * Push is blocked in the worktree via per-worktree pushurl config.
 */
export async function gitSetup(
  repoPath: string,
  issueId: string,
  issueTitle: string,
  sessionId: string,
): Promise<GitSetupResult> {
  const slug = slugify(issueTitle);
  const branchName = `feat/linear-${issueId}-${slug}`;
  const worktreePath = `/tmp/hero-${sessionId}`;

  await git(repoPath, "fetch", "origin");

  // Clean up stale worktree at this path (from a previous failed run)
  try {
    await git(repoPath, "worktree", "remove", "--force", worktreePath);
  } catch {
    // Worktree doesn't exist — fine
  }

  // Clean up stale branch if it exists locally
  try {
    await git(repoPath, "branch", "-D", branchName);
  } catch {
    // Branch doesn't exist — fine
  }

  // Create worktree with a new branch based on origin/dev
  await git(repoPath, "worktree", "add", "-b", branchName, worktreePath, "origin/dev");

  // Enable per-worktree config so we can block push in this worktree only
  await git(repoPath, "config", "extensions.worktreeConfig", "true");

  // Block git push — agent cannot push from the worktree
  await git(worktreePath, "config", "--worktree", "remote.origin.pushurl", "blocked://push-not-allowed-in-agent-session");

  console.log(`[git] Created worktree at ${worktreePath} on branch ${branchName}`);
  return { branchName, worktreePath };
}

/** Stage, commit, push, and create a PR. Returns null if no changes. */
export async function gitFinalize(
  repoPath: string,
  worktreePath: string,
  branchName: string,
  issueId: string,
  issueTitle: string,
  summary?: string,
): Promise<{ prUrl: string } | null> {
  // Check for uncommitted changes
  const diffStat = await git(worktreePath, "diff", "--stat");
  const stagedStat = await git(worktreePath, "diff", "--cached", "--stat");

  if (diffStat || stagedStat) {
    await git(worktreePath, "add", "-A");
    await git(worktreePath, "commit", "-m", `feat: ${issueTitle} [linear-${issueId}]`);
  }

  // Check if there are new commits compared to origin/dev
  const newCommits = await git(worktreePath, "rev-list", "--count", "origin/dev..HEAD");
  if (newCommits === "0") return null;

  // Temporarily unblock push for the runner
  try {
    await git(worktreePath, "config", "--worktree", "--unset", "remote.origin.pushurl");
  } catch {
    // Config key might not exist
  }

  try {
    await git(worktreePath, "push", "-u", "origin", branchName);
  } finally {
    // Re-block push after runner is done
    await git(worktreePath, "config", "--worktree", "remote.origin.pushurl", "blocked://push-not-allowed-in-agent-session");
  }

  // Check if a PR already exists for this branch
  try {
    const existingPr = await run(
      worktreePath,
      "gh", "pr", "view", branchName, "--json", "url", "--jq", ".url",
    );
    if (existingPr) return { prUrl: existingPr };
  } catch {
    // No existing PR — create one
  }

  const prBody = summary
    ? `Resolves ${issueId}\n\n${summary}\n\n---\n*Automated PR by Hero*`
    : `Resolves ${issueId}\n\nAutomated PR by Hero`;

  const prUrl = await run(
    worktreePath,
    "gh", "pr", "create",
    "--draft",
    "--base", "dev",
    "--title", `feat: ${issueTitle}`,
    "--body", prBody,
  );

  return { prUrl };
}

/** Update the PR description body. */
export async function updatePrBody(
  worktreePath: string,
  prUrl: string,
  body: string,
): Promise<void> {
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) return;
  await run(worktreePath, "gh", "pr", "edit", prNumber, "--body", body);
}

// File extensions that indicate visual/UI changes
const VISUAL_EXTENSIONS = new Set([
  ".tsx", ".jsx", ".vue", ".svelte",
  ".css", ".scss", ".sass", ".less",
  ".html", ".htm",
  ".svg",
]);

/** Get the list of files changed compared to origin/dev. */
export async function getChangedFiles(worktreePath: string): Promise<string[]> {
  const output = await git(worktreePath, "diff", "--name-only", "origin/dev...HEAD");
  return output ? output.split("\n").filter(Boolean) : [];
}

/** Check if any changed files are visual (UI components, styles, etc.). */
export function hasVisualChanges(files: string[]): boolean {
  return files.some((f) => {
    const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
    return VISUAL_EXTENSIONS.has(ext);
  });
}

/** Poll PR comments for a preview deployment URL. Returns the URL or null. */
export async function waitForPreviewUrl(
  worktreePath: string,
  prUrl: string,
  timeoutMs = 300_000,
  intervalMs = 15_000,
): Promise<string | null> {
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) return null;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const comments = await run(
        worktreePath,
        "gh", "pr", "view", prNumber, "--json", "comments", "--jq",
        ".comments[].body",
      );

      // Match common preview deployment URL patterns
      const urlMatch = comments.match(
        /https?:\/\/[^\s)>\]]+(?:\.vercel\.app|\.traefik\.me|\.dokploy\.[^\s)>\]]+|preview[^\s)>\]]*)/i,
      );
      if (urlMatch) {
        console.log(`[git] Found preview URL: ${urlMatch[0]}`);
        return urlMatch[0];
      }
    } catch {
      // gh command failed — keep polling
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  console.log(`[git] No preview URL found within ${timeoutMs / 1000}s`);
  return null;
}

/** Get the full diff for a PR via gh. */
export async function getPrDiff(worktreePath: string, prUrl: string): Promise<string | null> {
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) return null;

  try {
    const diff = await run(worktreePath, "gh", "pr", "diff", prNumber);
    return diff || null;
  } catch (err) {
    console.error("[git] Failed to get PR diff:", err);
    return null;
  }
}

/** Send a diff to GPT Codex for bug review. Returns review markdown or null. */
export async function reviewWithCodex(
  diff: string,
  issue: { identifier: string; title: string; description: string },
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[git] OPENAI_API_KEY not set — skipping bug review");
    return null;
  }

  const systemPrompt = `You are a senior code reviewer focused exclusively on finding bugs.

Review the provided pull request diff and report any issues you find.

Focus on:
- Logic errors and off-by-one mistakes
- Security vulnerabilities (injection, XSS, auth bypass, etc.)
- Edge cases and error handling gaps
- Race conditions and concurrency issues
- Regressions — does the change break existing behavior?

Skip:
- Style preferences, naming opinions, formatting nits
- Minor suggestions that don't affect correctness

Format:
- Use concise markdown
- Group findings by severity: 🔴 Critical, 🟡 Warning, 🟢 Note
- Include file paths and line references from the diff
- If no bugs found, say "No bugs found — looks good."`;

  const userMessage = `## Issue: ${issue.identifier} — ${issue.title}

${issue.description ? `### Description\n${issue.description}\n\n` : ""}### Diff

\`\`\`diff
${diff}
\`\`\``;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2-codex",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[git] Codex review request failed (${res.status}): ${body}`);
      return null;
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const review = json.choices?.[0]?.message?.content?.trim();
    if (!review) {
      console.error("[git] Codex returned no content");
      return null;
    }

    return `## Bug Review (GPT Codex)\n\n${review}`;
  } catch (err) {
    console.error("[git] Codex review failed:", err);
    return null;
  }
}

/** Post a comment on a GitHub PR via gh. */
export async function postPrComment(
  worktreePath: string,
  prUrl: string,
  body: string,
): Promise<void> {
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!prNumber) return;

  try {
    await run(worktreePath, "gh", "pr", "comment", prNumber, "--body", body);
    console.log(`[git] Comment posted on PR #${prNumber}`);
  } catch (err) {
    console.error("[git] Failed to post PR comment:", err);
  }
}

/** Remove the worktree and delete the local branch. */
export async function gitCleanup(
  repoPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  try {
    await git(repoPath, "worktree", "remove", "--force", worktreePath);
  } catch {
    // Best-effort cleanup
  }
  try {
    await git(repoPath, "branch", "-D", branchName);
  } catch {
    // Best-effort cleanup
  }
}
