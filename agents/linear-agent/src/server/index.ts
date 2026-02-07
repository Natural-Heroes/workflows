import Fastify, { type FastifyInstance } from "fastify";
import type { AgentConfig } from "../config/types.js";
import type { TokenManager } from "../oauth/token-manager.js";
import type { AgentActivities } from "../linear/activities.js";
import type { TaskQueue } from "../queue/task-queue.js";
import type { SessionRegistry } from "../sessions/registry.js";
import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { verifyWebhookSignatureBuffer, verifyGitHubSignature } from "./signature-verify.js";

export interface ServerDependencies {
  config: AgentConfig;
  tokenManager: TokenManager;
  linearActivities: AgentActivities;
  taskQueue: TaskQueue;
  sessionRegistry: SessionRegistry;
}

/** Creates and configures the Fastify server with all routes. */
export function createServer(deps: ServerDependencies): FastifyInstance {
  const { config, linearActivities, taskQueue, sessionRegistry } = deps;

  // Dedup: track issueIds recently handled via AgentSessionEvent to avoid double sessions.
  // When Linear handles delegation natively, it sends both an AgentSessionEvent AND an Issue
  // webhook. We only want to create sessions from the Issue handler for RE-delegations where
  // Linear doesn't send an AgentSessionEvent.
  const recentAgentSessions = new Map<string, number>();
  const DEDUP_TTL_MS = 60_000;

  // Dedup: track sessionIds already queued to prevent duplicate jobs
  // when Linear sends both created + updated for the same session.
  const queuedSessions = new Set<string>();

  // Track issueIds that have had a job queued via AgentSessionEvent,
  // so the Issue fallback handler can detect native sessions were created.
  const issuesToSessions = new Set<string>();

  const app = Fastify({ logger: true });

  // Register raw body parser so we can verify HMAC signatures
  // Store the raw Buffer for byte-accurate HMAC, pass string to handler
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      (req as unknown as Record<string, unknown>).rawBodyBuffer = body;
      done(null, (body as Buffer).toString("utf-8"));
    },
  );

  // Health check
  app.get("/health", async () => ({ status: "ok", version: "1.1.0" }));

  // OAuth callback — placeholder (actual OAuth handled by setup script)
  app.get("/oauth/callback", async (_req, reply) => {
    reply.type("text/html");
    return "<html><body><h1>OAuth setup complete</h1><p>You can close this tab.</p></body></html>";
  });

  // Linear webhook handler
  app.post("/webhooks/linear", async (request, reply) => {
    const rawBody = request.body as string;
    const rawBuffer = (request as unknown as Record<string, unknown>).rawBodyBuffer as Buffer;

    const signature = request.headers["linear-signature"];

    if (typeof signature !== "string") {
      reply.code(401);
      return { error: "Missing signature header" };
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Timestamp is in the body, not a header
    const timestamp = String(payload.webhookTimestamp ?? "");

    if (!verifyWebhookSignatureBuffer(rawBuffer, signature, timestamp, config.linear.webhookSecret)) {
      reply.code(401);
      return { error: "Invalid signature" };
    }
    const type = payload.type as string | undefined;
    const action = payload.action as string | undefined;

    console.log(`[webhook] type=${type} action=${action}`);

    // Handle Issue webhooks — detect (re-)delegation to Hero
    if (type === "Issue" && (action === "update" || action === "updated")) {
      const data = payload.data as Record<string, unknown> | undefined;
      const issueId = data?.id as string | undefined;

      console.log(`[webhook] Issue data keys: ${data ? Object.keys(data).join(", ") : "none"}`);

      if (!issueId) {
        return { ok: true, skipped: true };
      }

      // Check if delegate changed to our app user
      const delegate = data?.delegate as Record<string, unknown> | undefined;
      const delegateId = delegate?.id ?? data?.delegateId;
      const updatedFrom = payload.updatedFrom as Record<string, unknown> | undefined;
      const previousDelegateId = updatedFrom?.delegateId;

      console.log(`[webhook] Issue updated: id=${issueId} delegate=${String(delegateId)} previousDelegate=${String(previousDelegateId)}`);

      // Only trigger if delegate was actually changed to Hero in this update.
      // updatedFrom must contain delegateId to confirm delegate was the field that changed
      // (otherwise we'd trigger on unrelated Issue updates like state changes).
      const delegateActuallyChanged = "delegateId" in (updatedFrom ?? {});

      // If delegate was removed from Hero, clear dedup entries so re-delegation works
      if (delegateActuallyChanged && String(delegateId) !== config.linear.appUserId) {
        recentAgentSessions.delete(issueId);
        issuesToSessions.delete(issueId);
      }

      if (String(delegateId) === config.linear.appUserId && delegateActuallyChanged) {
        // Claim this issueId immediately to prevent concurrent Issue webhooks
        // from both entering the wait and creating duplicate sessions.
        if (recentAgentSessions.has(issueId)) {
          console.log(`[webhook] Skipping — already handling issue ${issueId}`);
          return { ok: true };
        }
        recentAgentSessions.set(issueId, Date.now());

        console.log(`[webhook] Delegation to Hero detected for issue ${issueId} — waiting for native AgentSessionEvent...`);

        // Wait briefly to see if Linear also sends an AgentSessionEvent (first-time delegation).
        // If it does, the AgentSessionEvent handler will queue the job and we skip creation.
        await new Promise((r) => setTimeout(r, 5000));

        if (issuesToSessions.has(issueId)) {
          // An AgentSessionEvent queued a job for this issue during our wait
          console.log(`[webhook] Skipping — native AgentSessionEvent handled issue ${issueId}`);
        } else {
          console.log(`[webhook] No native session created — creating via Issue handler for ${issueId}`);
          const sessionId = await linearActivities.createSessionOnIssue(issueId);

          if (sessionId) {
            console.log(`[webhook] Created new session ${sessionId} — AgentSessionEvent webhook will handle processing`);
          } else {
            console.error(`[webhook] Failed to create session for issue ${issueId}`);
          }
        }
      }

      return { ok: true };
    }

    // Handle AgentSessionEvent webhooks
    if (type !== "AgentSessionEvent") {
      return { ok: true, skipped: true };
    }

    const agentSession = payload.agentSession as Record<string, unknown> | undefined;

    if (!agentSession) {
      reply.code(400);
      return { error: "Missing agentSession in payload" };
    }

    const sessionId = agentSession.id as string;
    const issueId = agentSession.issueId as string;

    if (!sessionId || !issueId) {
      reply.code(400);
      return { error: "Missing sessionId or issueId" };
    }

    // Log full session data for non-created/updated events to understand Linear's stop signals
    if (action !== "created" && action !== "updated") {
      console.log(`[webhook] AgentSessionEvent action=${action} session=${sessionId} payload: ${JSON.stringify({ agentSession: agentSession, promptContext: payload.promptContext, guidance: payload.guidance }).slice(0, 500)}`);
    }

    // Handle stop — Linear sends "prompted" for initial prompt, follow-ups, AND stop clicks.
    // We only treat it as a stop if the session has been active for >30s (initial prompted
    // arrives within milliseconds of "created").
    if (action === "prompted") {
      const MIN_AGE_FOR_STOP_MS = 30_000;
      const age = sessionRegistry.getAge(sessionId);

      if (age !== null && age > MIN_AGE_FOR_STOP_MS) {
        console.log(`[webhook] Stop/interaction on session ${sessionId} (age=${Math.round(age / 1000)}s) — aborting`);
        sessionRegistry.abort(sessionId);
        return { ok: true };
      }

      console.log(`[webhook] Ignoring early prompted for session ${sessionId} (age=${age !== null ? Math.round(age / 1000) + "s" : "not registered"})`);
      return { ok: true };
    }

    if (action === "stopped" || action === "canceled") {
      console.log(`[webhook] Stop request for session ${sessionId} (action=${action})`);
      sessionRegistry.abort(sessionId);
      return { ok: true };
    }

    // Only process created/updated events for new job processing
    if (action !== "created" && action !== "updated") {
      console.log(`[webhook] Ignoring AgentSessionEvent action=${action} for session ${sessionId}`);
      return { ok: true, skipped: true };
    }

    // Mark this issue as handled via AgentSessionEvent (for Issue webhook dedup)
    recentAgentSessions.set(issueId, Date.now());
    issuesToSessions.add(issueId);
    setTimeout(() => issuesToSessions.delete(issueId), DEDUP_TTL_MS);

    // Skip if we already queued a job for this sessionId (created + updated dedup)
    if (queuedSessions.has(sessionId)) {
      console.log(`[webhook] Skipping duplicate AgentSessionEvent for session ${sessionId} (already queued)`);
      return { ok: true };
    }
    queuedSessions.add(sessionId);
    setTimeout(() => queuedSessions.delete(sessionId), DEDUP_TTL_MS);

    // Acknowledge within 10s — send a thought activity immediately
    await linearActivities.sendActivity({
      sessionId,
      type: "thought",
      content: "Processing issue...",
    });

    // Queue the job for background processing — include Linear's context
    await taskQueue.add({
      sessionId,
      issueId,
      webhookData: {
        ...agentSession,
        promptContext: payload.promptContext,
        previousComments: payload.previousComments,
        guidance: payload.guidance,
      },
    });

    return { ok: true };
  });

  // GitHub webhook handler — auto-deploy on push to main
  app.post("/webhooks/github", async (request, reply) => {
    const githubConfig = config.github;
    if (!githubConfig) {
      reply.code(404);
      return { error: "GitHub webhooks not configured" };
    }

    const rawBuffer = (request as unknown as Record<string, unknown>).rawBodyBuffer as Buffer;
    const signature = request.headers["x-hub-signature-256"] as string | undefined;

    if (!signature || !verifyGitHubSignature(rawBuffer, signature, githubConfig.webhookSecret)) {
      reply.code(401);
      return { error: "Invalid signature" };
    }

    const event = request.headers["x-github-event"] as string;
    if (event !== "push") {
      return { ok: true, skipped: true, reason: `event=${event}` };
    }

    const rawBody = request.body as string;
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const ref = payload.ref as string;

    if (ref !== "refs/heads/main") {
      console.log(`[github] Ignoring push to ${ref}`);
      return { ok: true, skipped: true, reason: `ref=${ref}` };
    }

    // Check if any changed files are in agents/linear-agent/
    const commits = payload.commits as Array<Record<string, unknown>> | undefined;
    const changedFiles = (commits ?? []).flatMap((c) => [
      ...((c.added as string[]) ?? []),
      ...((c.modified as string[]) ?? []),
      ...((c.removed as string[]) ?? []),
    ]);
    const relevantChange = changedFiles.some((f) => f.startsWith("agents/linear-agent/"));

    if (!relevantChange) {
      console.log(`[github] Push to main but no changes in agents/linear-agent/ — skipping`);
      return { ok: true, skipped: true, reason: "no relevant changes" };
    }

    console.log(`[github] Push to main with changes in agents/linear-agent/ — deploying...`);

    // Run deploy in background: git pull, npm ci, npm run build, then exit to restart via LaunchAgent
    const projectDir = resolve(import.meta.dirname, "../..");
    const repoRoot = resolve(projectDir, "../..");

    const script = [
      `cd "${repoRoot}"`,
      "git pull origin main",
      `cd "${projectDir}"`,
      "npm ci --ignore-scripts",
      "npm run build",
    ].join(" && ");

    execFile("bash", ["-c", script], { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[github] Deploy failed: ${error.message}`);
        if (stderr) console.error(`[github] stderr: ${stderr}`);
        return;
      }
      console.log(`[github] Build complete — restarting via launchctl...`);
      if (stdout) console.log(`[github] ${stdout.slice(-500)}`);
      // Spawn detached launchctl restart — it kills this process group and starts fresh
      const restart = spawn("bash", ["-c", "sleep 1 && launchctl kickstart -k gui/$(id -u)/com.naturalhero.linear-agent"], {
        detached: true,
        stdio: "ignore",
      });
      restart.unref();
    });

    return { ok: true, deploying: true };
  });

  return app;
}
