import { Queue, type ConnectionOptions } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";

/**
 * Shared queue definitions. The Next.js app is the producer (enqueues runs);
 * the worker process is the consumer (see worker/src). Both agree on the
 * queue name and job-data shape here so they can't drift.
 */

export const RUN_QUEUE_NAME = process.env.RUN_QUEUE_NAME ?? "brand-runs";

/** Job kinds the worker handles. */
export type RunJobName = "execute" | "resume";

/** Payload for a pipeline run job. Keep it minimal + idempotent: just ids. */
export interface RunJobData {
  runId: string;
  brandId: string;
  /** "approve" path resumes a paused run from the gate into publish. */
  resumeFrom?: "publish";
}

/** BullMQ requires maxRetriesPerRequest: null on its connection. */
export function createRedisConnection(extra?: RedisOptions): IORedis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new IORedis(url, { maxRetriesPerRequest: null, ...extra });
}

/**
 * BullMQ ships its own bundled ioredis, so an instance from the top-level
 * ioredis is nominally incompatible with BullMQ's `ConnectionOptions` type
 * even though it's the same library at runtime. Cast once, here.
 */
export function bullConnection(): ConnectionOptions {
  return createRedisConnection() as unknown as ConnectionOptions;
}

let queueSingleton: Queue<RunJobData, unknown, RunJobName> | null = null;

/**
 * Producer-side queue handle (used by the API routes to enqueue).
 * Cached so the app doesn't open a connection per request.
 */
export function getRunQueue(): Queue<RunJobData, unknown, RunJobName> {
  if (!queueSingleton) {
    queueSingleton = new Queue<RunJobData, unknown, RunJobName>(RUN_QUEUE_NAME, {
      connection: bullConnection(),
      defaultJobOptions: {
        // Idempotent + resumable: retry transient failures with backoff.
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 604_800 },
      },
    });
  }
  return queueSingleton as Queue<RunJobData, unknown, RunJobName>;
}
