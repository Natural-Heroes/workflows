import { loadConfig } from "./config/loader.js";
import { TokenManager } from "./oauth/token-manager.js";
import { createLinearClient } from "./linear/client.js";
import { AgentActivities } from "./linear/activities.js";
import { createServer } from "./server/index.js";
import { TaskQueue } from "./queue/task-queue.js";
import { createWorker } from "./queue/worker.js";
import { AgentRegistry } from "./agents/registry.js";
import { DefaultAgentRunner } from "./agents/default/runner.js";
import { SessionRegistry } from "./sessions/registry.js";

async function main(): Promise<void> {
  const config = await loadConfig();

  // OAuth token manager
  const tokenManager = new TokenManager(config.linear);

  // Verify tokens are available
  try {
    await tokenManager.getAccessToken();
  } catch {
    console.error("No OAuth tokens found. Run `npm run setup-oauth` first.");
    process.exit(1);
  }

  // Linear SDK client + rate limiter
  const { getClient, rateLimiter } = createLinearClient(tokenManager, config.linear);

  // Agent Activities (GraphQL)
  const activities = new AgentActivities(tokenManager, rateLimiter);

  // Agent registry
  const registry = new AgentRegistry();
  registry.register(new DefaultAgentRunner({ activitySender: activities, piConfig: config.pi }));

  // Session registry (shared between server and worker for stop request handling)
  const sessionRegistry = new SessionRegistry();

  // Task queue
  const taskQueue = new TaskQueue(config.redis);

  // Worker
  const worker = createWorker({
    redisConfig: config.redis,
    queueConfig: config.queue,
    agentRegistry: registry,
    config,
    linearActivities: activities,
    getLinearClient: getClient,
    sessionRegistry,
  });

  // Fastify server
  const server = createServer({
    config,
    tokenManager,
    linearActivities: activities,
    taskQueue,
    sessionRegistry,
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received, shutting down...`);
    console.log(`[shutdown] Aborting ${sessionRegistry.activeCount} active session(s)...`);
    sessionRegistry.abortAll();
    await server.close();
    await worker.close();
    await taskQueue.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Start
  await server.listen({ host: config.server.host, port: config.server.port });
  console.log(`Hero listening on ${config.server.host}:${config.server.port}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
