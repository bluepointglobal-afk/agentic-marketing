import { Queue, Worker, type Job } from "bullmq";
import { BrandModel, RunModel } from "@pipeline/shared/models";
import { STAGE_IDS } from "@pipeline/shared";
import { getRunQueue, bullConnection } from "@pipeline/shared/queue";
import type { Cadence } from "@pipeline/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Cron scheduler: fires per-cadence ticks that enqueue a run for every brand on
 * that cadence. "manual" brands are never auto-run. Uses BullMQ job schedulers
 * (cron patterns) so schedules survive worker restarts and don't double-fire
 * across multiple worker instances.
 */

const SCHEDULE_QUEUE = `${config.queueName}-schedule`;

const DAILY_CRON = config.raw.SCHEDULE_DAILY_CRON ?? "0 9 * * *"; // 09:00 daily
const WEEKLY_CRON = config.raw.SCHEDULE_WEEKLY_CRON ?? "0 9 * * 1"; // Mon 09:00

const log = logger.child({ component: "scheduler" });

/** Create a run + enqueue its execute job. Mirrors POST /api/runs. */
export async function enqueueRun(brandId: string): Promise<string | null> {
  const brand = await BrandModel.findById(brandId).lean();
  if (!brand) {
    log.warn({ brandId }, "enqueueRun: brand not found");
    return null;
  }
  const run = await RunModel.create({
    brandId,
    status: "queued",
    stages: STAGE_IDS.map((id) => ({ id, status: "queued" })),
    draft: null,
    outcome: null,
    costUsd: null,
  });
  const runId = String(run._id);
  await getRunQueue().add("execute", { runId, brandId }, { jobId: runId });
  log.info({ brandId, runId }, "scheduler enqueued run");
  return runId;
}

async function onScheduleTick(job: Job): Promise<void> {
  const cadence: Cadence = job.name === "cadence:daily" ? "daily" : "weekly";
  const brands = await BrandModel.find({ cadence }).lean();
  log.info({ cadence, count: brands.length }, "schedule tick");
  for (const b of brands) {
    await enqueueRun(b._id as string);
  }
}

let scheduleQueue: Queue | null = null;
let scheduleWorker: Worker | null = null;

export async function startScheduler(): Promise<void> {
  scheduleQueue = new Queue(SCHEDULE_QUEUE, {
    connection: bullConnection(),
  });

  // Idempotent: upserting the same scheduler id just updates the pattern.
  await scheduleQueue.upsertJobScheduler(
    "daily",
    { pattern: DAILY_CRON },
    { name: "cadence:daily", data: {} },
  );
  await scheduleQueue.upsertJobScheduler(
    "weekly",
    { pattern: WEEKLY_CRON },
    { name: "cadence:weekly", data: {} },
  );

  scheduleWorker = new Worker(SCHEDULE_QUEUE, onScheduleTick, {
    connection: bullConnection(),
    concurrency: 1,
  });
  scheduleWorker.on("failed", (job, err) =>
    log.error({ jobId: job?.id, err }, "schedule tick failed"),
  );

  log.info({ daily: DAILY_CRON, weekly: WEEKLY_CRON }, "scheduler started");
}

export async function stopScheduler(): Promise<void> {
  await scheduleWorker?.close();
  await scheduleQueue?.close();
}
