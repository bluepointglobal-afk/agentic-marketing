import { RunModel } from "@pipeline/shared/models";
import type { RunStatus, StageId, StageStatus } from "@pipeline/shared";
import type { Logger } from "../logger.js";

/**
 * Small persistence helpers around the Run document. Every mutation logs a
 * structured line so a run is fully traceable from the worker logs.
 */

export async function setRunStatus(
  runId: string,
  status: RunStatus,
  log: Logger,
): Promise<void> {
  await RunModel.updateOne({ _id: runId }, { $set: { status } });
  log.info({ status }, "run status");
}

export async function setStageStatus(
  runId: string,
  stage: StageId,
  status: StageStatus,
  log: Logger,
): Promise<void> {
  await RunModel.updateOne(
    { _id: runId, "stages.id": stage },
    { $set: { "stages.$.status": status } },
  );
  log.info({ stage, status }, "stage status");
}

/** Persist a stage's output into run.context for idempotent resume. */
export async function saveStageContext(
  runId: string,
  stage: StageId,
  data: unknown,
): Promise<void> {
  await RunModel.updateOne(
    { _id: runId },
    { $set: { [`context.${stage}`]: data } },
  );
}

export async function addCost(runId: string, delta: number): Promise<void> {
  if (!delta) return;
  await RunModel.updateOne({ _id: runId }, { $inc: { costUsd: delta } });
}
