import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { LinearConfig, OAuthTokens } from "../config/types.js";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

/** Manages OAuth token persistence and auto-refresh with concurrency safety. */
export class TokenManager {
  private tokens: OAuthTokens | null = null;
  private refreshPromise: Promise<OAuthTokens> | null = null;
  private readonly tokenPath: string;
  private readonly config: LinearConfig;

  constructor(config: LinearConfig, tokenPath?: string) {
    this.config = config;
    this.tokenPath = tokenPath ?? resolve(import.meta.dirname, "../../config/tokens.json");
  }

  /** Returns a valid access token, refreshing if needed. */
  async getAccessToken(): Promise<string> {
    const tokens = await this.refreshIfNeeded();
    return tokens.accessToken;
  }

  /** Refreshes the token if it is expired or about to expire. */
  async refreshIfNeeded(): Promise<OAuthTokens> {
    if (!this.tokens) {
      this.tokens = await this.loadTokens();
    }

    if (Date.now() < this.tokens.expiresAt - REFRESH_BUFFER_MS) {
      return this.tokens;
    }

    // Mutex: reuse in-flight refresh to avoid race conditions
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      const refreshed = await this.refreshPromise;
      return refreshed;
    } finally {
      this.refreshPromise = null;
    }
  }

  /** Persists tokens to disk. */
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.tokens = tokens;
    await mkdir(dirname(this.tokenPath), { recursive: true });
    await writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), "utf-8");
  }

  /** Loads tokens from disk. */
  async loadTokens(): Promise<OAuthTokens> {
    const raw = await readFile(this.tokenPath, "utf-8");
    const parsed = JSON.parse(raw) as OAuthTokens;
    this.tokens = parsed;
    return parsed;
  }

  private async doRefresh(): Promise<OAuthTokens> {
    const current = this.tokens;
    if (!current) {
      throw new Error("No tokens available to refresh");
    }

    const res = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await this.saveTokens(tokens);
    return tokens;
  }
}
