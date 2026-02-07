export interface RepoMapping {
  label: string;
  path: string;
  defaultBranch: string;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface LinearConfig {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  redirectUri: string;
  /** Max requests per hour (Linear limit is 500, we use 450 as buffer) */
  rateLimit: number;
  /** The app user ID for the agent (used to detect delegation in Issue webhooks) */
  appUserId: string;
}

export interface QueueConfig {
  /** Max concurrent agent sessions */
  concurrency: number;
  /** Job timeout in milliseconds */
  jobTimeout: number;
  /** Max retry attempts */
  maxRetries: number;
}

export interface RedisConfig {
  host: string;
  port: number;
}

export interface PiConfig {
  /** Provider ID (e.g. "anthropic") */
  provider: string;
  /** Model ID (e.g. "claude-sonnet-4-5") */
  model: string;
  /** Thinking level: "none" | "low" | "medium" | "high" */
  thinkingLevel?: string;
}

export interface GitHubConfig {
  /** HMAC-SHA256 secret for verifying GitHub webhook signatures */
  webhookSecret: string;
}

export interface AgentConfig {
  server: ServerConfig;
  linear: LinearConfig;
  queue: QueueConfig;
  redis: RedisConfig;
  repos: RepoMapping[];
  /** Default agent type when no agent: label is present */
  defaultAgentType: string;
  /** Pi coding agent model/provider configuration */
  pi?: PiConfig;
  /** GitHub webhook config for auto-deploy */
  github?: GitHubConfig;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
