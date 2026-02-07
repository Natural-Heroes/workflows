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

/** Safely run a git command in the given repo. */
async function git(repoPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoPath });
  return stdout.trim();
}

/** Safely run an arbitrary command (e.g. gh). */
async function run(repoPath: string, cmd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { cwd: repoPath });
  return stdout.trim();
}

/** Set up a feature branch for the issue, based on origin/dev. */
export async function gitSetup(
  repoPath: string,
  issueId: string,
  issueTitle: string,
): Promise<{ branchName: string }> {
  const slug = slugify(issueTitle);
  const branchName = `feat/linear-${issueId}-${slug}`;

  await git(repoPath, "fetch", "origin");

  // Check if branch already exists (retry scenario)
  try {
    await git(repoPath, "rev-parse", "--verify", branchName);
    // Branch exists — switch to it and reset to origin/dev
    await git(repoPath, "checkout", branchName);
    await git(repoPath, "reset", "--hard", "origin/dev");
  } catch {
    // Branch doesn't exist — create it
    await git(repoPath, "checkout", "-b", branchName, "origin/dev");
  }

  return { branchName };
}

/** Stage, commit, push, and create a PR. Returns null if no changes. */
export async function gitFinalize(
  repoPath: string,
  branchName: string,
  issueId: string,
  issueTitle: string,
): Promise<{ prUrl: string } | null> {
  // Check for uncommitted changes first
  const diffStat = await git(repoPath, "diff", "--stat");
  const stagedStat = await git(repoPath, "diff", "--cached", "--stat");

  if (diffStat || stagedStat) {
    // Pi agent left uncommitted changes — commit them
    await git(repoPath, "add", "-A");
    await git(repoPath, "commit", "-m", `feat: ${issueTitle} [linear-${issueId}]`);
  }

  // Check if there are new commits compared to origin/dev (Pi agent may have committed already)
  const newCommits = await git(repoPath, "rev-list", "--count", "origin/dev..HEAD");
  if (newCommits === "0") return null;

  await git(repoPath, "push", "-u", "origin", branchName);

  // Check if a PR already exists for this branch
  try {
    const existingPr = await run(
      repoPath,
      "gh", "pr", "view", branchName, "--json", "url", "--jq", ".url",
    );
    if (existingPr) return { prUrl: existingPr };
  } catch {
    // No existing PR — create one
  }

  const prUrl = await run(
    repoPath,
    "gh", "pr", "create",
    "--draft",
    "--base", "dev",
    "--title", `feat: ${issueTitle}`,
    "--body", `Resolves ${issueId}\n\nAutomated PR by Hero`,
  );

  return { prUrl };
}

/** Clean up the feature branch: switch back to dev and delete. */
export async function gitCleanup(
  repoPath: string,
  branchName: string,
): Promise<void> {
  try {
    await git(repoPath, "checkout", "dev");
    await git(repoPath, "branch", "-D", branchName);
  } catch {
    // Best-effort cleanup
  }
}
