import { Worker, type Job } from "bullmq";
import { connectMongo } from "@pipeline/shared/db";
import {
  createRedisConnection,
  bullConnection,
  type RunJobData,
} from "@pipeline/shared/queue";
import { STAGE_IDS } from "@pipeline/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { processRunJob } from "./pipeline/runner.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

/**
 * Worker entry point. Long-running process (NOT serverless) that:
 *  - consumes the run queue and executes the Agent SDK pipeline per job
 *  - runs the cron scheduler that enqueues per-cadence runs
 * Deploys to a persistent host (see README → Worker deployment).
 */
async function main(): Promise<void> {
  logger.info(
    {
      queue: config.queueName,
      driver: config.pipelineDriver,
      concurrency: config.concurrency,
      scheduler: config.schedulerEnabled,
      stages: STAGE_IDS,
    },
    "worker starting",
  );

  await connectMongo(config.mongoUri);
  logger.info("mongo connected");

  const connection = createRedisConnection();
  await connection.ping();
  logger.info("redis connected");

  const worker = new Worker<RunJobData>(
    config.queueName,
    async (job: Job<RunJobData>) => {
      await processRunJob(job);
    },
    {
      connection: bullConnection(),
      concurrency: config.concurrency,
      // Multi-agent stages (image/text generation) run for minutes. An explicit
      // long lock prevents BullMQ from considering the job stalled and handing
      // it to another worker mid-cascade. BullMQ auto-renews the lock every
      // lockDuration/2 while the job is alive.
      lockDuration: config.lockDurationMs,
      stalledInterval: config.lockDurationMs,
      maxStalledCount: 2,
    },
  );

  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, name: job.name }, "job completed"),
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, name: job?.name, err }, "job failed"),
  );
  worker.on("error", (err) => logger.error({ err }, "worker error"));

  if (config.schedulerEnabled) {
    await startScheduler();
  }

  logger.info("worker ready — consuming jobs");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    try {
      await worker.close();
      await stopScheduler();
      await connection.quit();
    } catch (err) {
      logger.error({ err }, "error during shutdown");
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
