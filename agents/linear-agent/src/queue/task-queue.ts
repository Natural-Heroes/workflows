import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { RedisConfig } from "../config/types.js";

export interface WebhookJobData {
  sessionId: string;
  issueId: string;
  webhookData: Record<string, unknown>;
}

/** Manages the BullMQ queue for incoming webhook jobs. */
export class TaskQueue {
  private readonly queue: Queue<WebhookJobData>;
  private readonly connection: Redis;

  constructor(redisConfig: RedisConfig, queueName = "linear-agent") {
    this.connection = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<WebhookJobData>(queueName, {
      connection: this.connection,
    });
  }

  /** Adds a webhook job to the queue. */
  async add(jobData: WebhookJobData): Promise<void> {
    await this.queue.add("webhook", jobData, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
  }

  /** Gracefully closes the queue and Redis connection. */
  async close(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
