import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentConfig } from "./types.js";

const CONFIG_PATH = resolve(import.meta.dirname, "../../config/agent.config.json");

const DEFAULTS: Partial<AgentConfig> = {
  server: { host: "127.0.0.1", port: 3000 },
  queue: { concurrency: 5, jobTimeout: 60 * 60 * 1000, maxRetries: 3 },
  redis: { host: "127.0.0.1", port: 6379 },
  defaultAgentType: "default",
};

export async function loadConfig(path = CONFIG_PATH): Promise<AgentConfig> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const config: AgentConfig = {
    server: { ...DEFAULTS.server!, ...(parsed.server as Partial<AgentConfig["server"]>) },
    linear: validateLinear(parsed.linear as Partial<AgentConfig["linear"]> | undefined),
    queue: { ...DEFAULTS.queue!, ...(parsed.queue as Partial<AgentConfig["queue"]>) },
    redis: { ...DEFAULTS.redis!, ...(parsed.redis as Partial<AgentConfig["redis"]>) },
    repos: validateRepos(parsed.repos as Array<Record<string, unknown>> | undefined),
    defaultAgentType: (parsed.defaultAgentType as string) ?? DEFAULTS.defaultAgentType!,
    pi: parsed.pi as AgentConfig["pi"],
    github: parsed.github as AgentConfig["github"],
  };

  return config;
}

function validateLinear(linear: Partial<AgentConfig["linear"]> | undefined): AgentConfig["linear"] {
  if (!linear) throw new Error("config: 'linear' section is required");
  if (!linear.clientId) throw new Error("config: 'linear.clientId' is required");
  if (!linear.clientSecret) throw new Error("config: 'linear.clientSecret' is required");
  if (!linear.webhookSecret) throw new Error("config: 'linear.webhookSecret' is required");
  if (!linear.redirectUri) throw new Error("config: 'linear.redirectUri' is required");
  if (!linear.appUserId) throw new Error("config: 'linear.appUserId' is required");
  return {
    clientId: linear.clientId,
    clientSecret: linear.clientSecret,
    webhookSecret: linear.webhookSecret,
    redirectUri: linear.redirectUri,
    rateLimit: linear.rateLimit ?? 450,
    appUserId: linear.appUserId,
  };
}

function validateRepos(repos: Array<Record<string, unknown>> | undefined): AgentConfig["repos"] {
  if (!repos || repos.length === 0) throw new Error("config: at least one repo mapping is required");
  return repos.map((repo) => {
    if (typeof repo.label !== "string" || !repo.label) throw new Error("config: each repo must have a 'label'");
    if (typeof repo.path !== "string" || !repo.path) throw new Error("config: each repo must have a 'path'");
    return {
      label: repo.label,
      path: repo.path,
      defaultBranch: typeof repo.defaultBranch === "string" ? repo.defaultBranch : "dev",
    };
  });
}
