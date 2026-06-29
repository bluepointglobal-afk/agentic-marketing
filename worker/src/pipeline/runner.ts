import type { Job } from "bullmq";
import {
  BrandModel,
  RunModel,
  toBrand,
  appendRunSummary,
} from "@pipeline/shared/models";
import type { Brand, Draft } from "@pipeline/shared";
import type { RunJobData as JobData } from "@pipeline/shared/queue";
import { logger, type Logger } from "../logger.js";
import {
  setRunStatus,
  setStageStatus,
  saveStageContext,
  addCost,
} from "./runState.js";
import {
  runMeasure,
  runSeo,
  runBrief,
  runCreate,
  runGate,
  type PipelineContext,
} from "./stages.js";

/**
 * Top-level BullMQ job processor for a run.
 *
 * Idempotent + resumable: stage outputs are persisted to run.context, so a
 * retry skips completed stages. The gate pauses the job (awaiting_approval);
 * the publish stage runs in a separate "resume" job triggered by approval.
 */
export async function processRunJob(job: Job<JobData>): Promise<void> {
  const { runId, brandId, resumeFrom } = job.data;
  const log = logger.child({ runId, brandId, attempt: job.attemptsMade + 1 });

  const brandDoc = await BrandModel.findById(brandId).lean();
  if (!brandDoc) {
    log.error("brand not found; dropping job");
    return;
  }
  const brand = toBrand(brandDoc as never);

  const runDoc = await RunModel.findById(runId).lean();
  if (!runDoc) {
    log.error("run not found; dropping job");
    return;
  }

  try {
    if (resumeFrom === "publish") {
      await runPublishStage(runId, brand, runDoc as RunDocLike, log);
    } else {
      await runMainPipeline(runId, brand, runDoc as RunDocLike, log);
    }
  } catch (err) {
    log.error({ err }, "pipeline stage failed");
    await markErrored(runId, String(err), log);
    throw err; // surface to BullMQ for its retry/backoff policy
  }
}

interface RunDocLike {
  context?: PipelineContext;
  stages?: Array<{ id: string; status: string }>;
  draft?: (Omit<Draft, never> & { imageUrl?: string | null }) | null;
}

/* ───────────────────── main pipeline (measure → gate) ───────────────────── */

async function runMainPipeline(
  runId: string,
  brand: Brand,
  runDoc: RunDocLike,
  log: Logger,
): Promise<void> {
  await setRunStatus(runId, "running", log);
  // costUsd starts null; make it numeric so $inc works.
  await RunModel.updateOne({ _id: runId, costUsd: null }, { $set: { costUsd: 0 } });

  const ctx: PipelineContext = { ...(runDoc.context ?? {}) };

  // measure
  if (!ctx.measure) {
    await setStageStatus(runId, "measure", "running", log);
    const out = await runMeasure(brand, log);
    ctx.measure = out.data;
    await saveStageContext(runId, "measure", out.data);
    await addCost(runId, out.costUsd);
    await setStageStatus(runId, "measure", "done", log);
  }

  // seo
  if (!ctx.seo) {
    await setStageStatus(runId, "seo", "running", log);
    const out = await runSeo(brand, ctx, log);
    ctx.seo = out.data;
    await saveStageContext(runId, "seo", out.data);
    await addCost(runId, out.costUsd);
    await setStageStatus(runId, "seo", "done", log);
  }

  // brief
  if (!ctx.brief) {
    await setStageStatus(runId, "brief", "running", log);
    const out = await runBrief(brand, ctx, log);
    ctx.brief = out.data;
    await saveStageContext(runId, "brief", out.data);
    await addCost(runId, out.costUsd);
    await setStageStatus(runId, "brief", "done", log);
  }

  // create
  if (!ctx.create) {
    await setStageStatus(runId, "create", "running", log);
    const out = await runCreate(brand, ctx, log);
    ctx.create = out.data;
    await saveStageContext(runId, "create", out.data);
    await addCost(runId, out.costUsd);
    // Persist the draft (score filled at the gate) so it's inspectable.
    await RunModel.updateOne(
      { _id: runId },
      {
        $set: {
          draft: { ...out.data.draft, score: 0, imageUrl: out.data.imageUrl },
        },
      },
    );
    await setStageStatus(runId, "create", "done", log);
  }

  // gate — score the draft and decide
  await setStageStatus(runId, "gate", "running", log);
  const created = ctx.create;
  if (!created) throw new Error("create stage produced no draft");
  const gate = await runGate(brand, created.draft, log);
  await addCost(runId, gate.costUsd);

  const draft: Draft = { ...created.draft, score: gate.data.score };
  await RunModel.updateOne(
    { _id: runId },
    { $set: { draft: { ...draft, imageUrl: created.imageUrl } } },
  );

  if (gate.data.score < brand.gateThreshold) {
    await setStageStatus(runId, "gate", "rejected", log);
    await setRunStatus(runId, "rejected", log);
    await RunModel.updateOne({ _id: runId }, { $set: { outcome: "rejected" } });
    await appendRunSummary(brand.id, {
      id: runId,
      at: Date.now(),
      outcome: "rejected",
      title: draft.title,
    });
    log.info(
      { score: gate.data.score, threshold: brand.gateThreshold },
      "below gate threshold — rejected, not published",
    );
    return;
  }

  // Passed the gate → produce the draft for review and STOP for human approval.
  await setStageStatus(runId, "gate", "review", log);
  await setRunStatus(runId, "awaiting_approval", log);
  log.info({ score: gate.data.score }, "passed gate — awaiting approval");
}

/* ───────────────────── resume: publish stage ───────────────────── */

async function runPublishStage(
  runId: string,
  brand: Brand,
  runDoc: RunDocLike,
  log: Logger,
): Promise<void> {
  const draftDoc = runDoc.draft;
  if (!draftDoc) throw new Error("approve called but run has no draft");

  const draft: Draft = {
    title: draftDoc.title,
    meta: draftDoc.meta,
    body: draftDoc.body,
    keywords: draftDoc.keywords,
    score: draftDoc.score,
  };
  const imageUrl = draftDoc.imageUrl ?? null;

  // Lazy import keeps the publish providers out of the hot path until needed.
  const { publishContent } = await import("./publish.js");

  await setStageStatus(runId, "gate", "done", log);
  await setStageStatus(runId, "publish", "running", log);

  const result = await publishContent(brand, draft, imageUrl, log);

  await setStageStatus(runId, "publish", "done", log);
  await setRunStatus(runId, "published", log);
  await RunModel.updateOne(
    { _id: runId },
    { $set: { outcome: "published", publishedTo: result.target } },
  );
  await appendRunSummary(brand.id, {
    id: runId,
    at: Date.now(),
    outcome: "published",
    title: draft.title,
  });
  log.info({ target: result.target }, "published");

  // Funnel: generate landing page + email sequence and push via the connector.
  // Failure here never un-publishes the post.
  if (brand.funnel?.enabled) {
    try {
      const { runFunnel } = await import("./funnel.js");
      const { output, costUsd } = await runFunnel(brand, draft, log);
      await addCost(runId, costUsd);
      await RunModel.updateOne({ _id: runId }, { $set: { funnel: output } });
      log.info({ pushedTo: output.pushedTo, emails: output.emails.length }, "funnel generated");
    } catch (err) {
      log.error({ err }, "funnel step failed; post still published");
    }
  }
}

/* ───────────────────── failure handling ───────────────────── */

async function markErrored(
  runId: string,
  message: string,
  log: Logger,
): Promise<void> {
  // Flip any in-flight stage to rejected so the cockpit rail shows the failure.
  await RunModel.updateOne(
    { _id: runId, "stages.status": "running" },
    { $set: { "stages.$.status": "rejected" } },
  );
  await RunModel.updateOne(
    { _id: runId },
    { $set: { status: "errored", error: message.slice(0, 1000) } },
  );
  log.error("run marked errored");
}
