import { STAGE_IDS } from "@pipeline/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createRedisConnection } from "./redis.js";

/**
 * Worker entry point.
 *
 * Step 1: boot, verify the Redis connection, and install graceful shutdown.
 * The BullMQ Worker that consumes the run queue and executes the Agent SDK
 * pipeline is wired in step 3+. Kept intentionally minimal but runnable.
 */
async function main(): Promise<void> {
  logger.info(
    { queue: config.queueName, stages: STAGE_IDS, concurrency: config.concurrency },
    "worker starting",
  );

  const connection = createRedisConnection();

  connection.on("error", (err) => logger.error({ err }, "redis connection error"));
  connection.on("ready", () => logger.info("redis connection ready"));

  // Fail fast if Redis is unreachable, so misconfiguration is obvious at boot.
  await connection.ping();
  logger.info("redis ping ok — worker idle, awaiting jobs (queue consumer wired in step 3)");

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    await connection.quit().catch((err) => logger.error({ err }, "redis quit failed"));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
