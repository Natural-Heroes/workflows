import { exec } from "node:child_process";
import Fastify from "fastify";
import type { LinearConfig, OAuthTokens } from "../config/types.js";

/** Runs the full OAuth authorization code flow and returns tokens. */
export async function startOAuthFlow(config: LinearConfig): Promise<OAuthTokens> {
  const redirectUrl = new URL(config.redirectUri);
  const port = Number(redirectUrl.port) || 3000;

  const server = Fastify();

  const tokenPromise = new Promise<OAuthTokens>((resolve, reject) => {
    server.get("/oauth/callback", async (request, reply) => {
      const { code } = request.query as { code?: string };
      if (!code) {
        await reply.status(400).send("Missing authorization code");
        reject(new Error("Missing authorization code in callback"));
        return;
      }

      try {
        const tokens = await exchangeCode(code, config);
        await reply.send("Authorization successful! You can close this tab.");
        resolve(tokens);
      } catch (err) {
        await reply.status(500).send("Token exchange failed");
        reject(err);
      }
    });
  });

  await server.listen({ host: "127.0.0.1", port });

  const authUrl = buildAuthUrl(config);
  console.log(`\nOpening browser for authorization...\n${authUrl}\n`);
  exec(`open "${authUrl}"`);

  try {
    const tokens = await tokenPromise;
    return tokens;
  } finally {
    await server.close();
  }
}

function buildAuthUrl(config: LinearConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "read,write,app:assignable,app:mentionable",
    actor: "app",
  });
  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code: string, config: LinearConfig): Promise<OAuthTokens> {
  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Token exchange error (${res.status}):`, body);
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}
